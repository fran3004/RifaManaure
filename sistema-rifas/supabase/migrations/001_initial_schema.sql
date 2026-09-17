-- ============================================================================
-- MIGRACIÓN 001: ESQUEMA INICIAL Y PROCEDIMIENTOS TRANSACCIONALES PARA RIFAS
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabla de Rifas / Sorteos
CREATE TABLE IF NOT EXISTS public.raffles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    ticket_price NUMERIC(12, 2) NOT NULL CHECK (ticket_price > 0),
    total_tickets INTEGER NOT NULL CHECK (total_tickets > 0),
    max_tickets_per_buyer INTEGER DEFAULT 50 CHECK (max_tickets_per_buyer > 0),
    draw_date TIMESTAMPTZ NOT NULL,
    lottery_reference VARCHAR(150) NOT NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'closed', 'finished')),
    hero_image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de Compradores (Habeas Data & Facturación)
CREATE TABLE IF NOT EXISTS public.buyers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(200) NOT NULL,
    document_id VARCHAR(30) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(150) NOT NULL,
    city VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_buyer_doc UNIQUE (document_id)
);

-- 4. Tabla de Órdenes de Compra
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id UUID NOT NULL REFERENCES public.raffles(id) ON DELETE RESTRICT,
    buyer_id UUID NOT NULL REFERENCES public.buyers(id) ON DELETE RESTRICT,
    reference VARCHAR(50) UNIQUE NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    ticket_count INTEGER NOT NULL CHECK (ticket_count > 0),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected', 'expired', 'refunded')),
    payment_method VARCHAR(30) DEFAULT 'transfer_manual' CHECK (payment_method IN ('wompi', 'bold', 'mercadopago', 'transfer_manual', 'cash')),
    payment_gateway_id VARCHAR(100),
    payment_gateway_data JSONB,
    receipt_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabla de Boletos / Números
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id UUID NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
    number VARCHAR(10) NOT NULL,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold', 'blocked')),
    reserved_at TIMESTAMPTZ,
    reservation_expires_at TIMESTAMPTZ,
    buyer_id UUID REFERENCES public.buyers(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_ticket_per_raffle UNIQUE (raffle_id, number)
);

-- 6. Tabla de Aliados / Convenios
CREATE TABLE IF NOT EXISTS public.partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    website_url TEXT,
    instagram_url TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ÍNDICES PARA ALTO RENDIMIENTO
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tickets_raffle_status ON public.tickets(raffle_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_number ON public.tickets(number);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON public.tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_reference ON public.orders(reference);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_buyers_phone ON public.buyers(phone);
CREATE INDEX IF NOT EXISTS idx_buyers_doc ON public.buyers(document_id);

-- ============================================================================
-- FUNCIONES TRANSACCIONALES (PREVENCIÓN DE CONDICIÓN DE CARRERA)
-- ============================================================================

-- Función para reservar números de forma atómica con bloqueo a nivel de fila (FOR UPDATE)
CREATE OR REPLACE FUNCTION public.reserve_tickets(
    p_raffle_id UUID,
    p_ticket_numbers TEXT[],
    p_buyer_id UUID,
    p_duration_minutes INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_expires_at TIMESTAMPTZ := NOW() + (p_duration_minutes || ' minutes')::INTERVAL;
    v_available_count INTEGER;
    v_requested_count INTEGER := array_length(p_ticket_numbers, 1);
    v_failed_numbers TEXT[];
BEGIN
    -- 1. Liberar cualquier reserva expirada de la rifa antes de verificar
    PERFORM public.release_expired_reservations();

    -- 2. Bloquear y verificar disponibilidad de los boletos solicitados
    WITH locked_available AS (
        SELECT id, number
        FROM public.tickets
        WHERE raffle_id = p_raffle_id
          AND number = ANY(p_ticket_numbers)
          AND status = 'available'
        FOR UPDATE
    )
    SELECT count(*), array_agg(number)
    INTO v_available_count, v_failed_numbers
    FROM locked_available;

    -- Si no todos los números solicitados están disponibles, calcular fallidos
    IF v_available_count < v_requested_count THEN
        SELECT array_agg(num)
        INTO v_failed_numbers
        FROM unnest(p_ticket_numbers) AS num
        WHERE num NOT IN (
            SELECT number FROM public.tickets
            WHERE raffle_id = p_raffle_id
              AND number = ANY(p_ticket_numbers)
              AND status = 'available'
        );

        RETURN jsonb_build_object(
            'success', false,
            'reserved_count', 0,
            'failed_numbers', COALESCE(v_failed_numbers, ARRAY[]::TEXT[]),
            'reservation_expires_at', NULL
        );
    END IF;

    -- 3. Aplicar la reserva atómica
    UPDATE public.tickets
    SET status = 'reserved',
        reserved_at = v_now,
        reservation_expires_at = v_expires_at,
        buyer_id = p_buyer_id,
        updated_at = v_now
    WHERE raffle_id = p_raffle_id
      AND number = ANY(p_ticket_numbers)
      AND status = 'available';

    RETURN jsonb_build_object(
        'success', true,
        'reserved_count', v_requested_count,
        'failed_numbers', ARRAY[]::TEXT[],
        'reservation_expires_at', v_expires_at
    );
END;
$$;

-- Función para liberar boletos reservados cuyo tiempo límite expiró
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_released_count INTEGER;
BEGIN
    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE status = 'reserved'
      AND reservation_expires_at < NOW();

    GET DIAGNOSTICS v_released_count = ROW_COUNT;
    RETURN v_released_count;
END;
$$;

-- Función para confirmar venta tras pago exitoso
CREATE OR REPLACE FUNCTION public.confirm_order_payment(
    p_order_id UUID,
    p_gateway_id TEXT DEFAULT NULL,
    p_gateway_data JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id AND status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- 1. Marcar orden como completada
    UPDATE public.orders
    SET status = 'completed',
        payment_gateway_id = COALESCE(p_gateway_id, payment_gateway_id),
        payment_gateway_data = COALESCE(p_gateway_data, payment_gateway_data),
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 2. Marcar todos los boletos asociados como 'sold' de forma permanente
    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    RETURN true;
END;
$$;

-- ============================================================================
-- POLÍTICAS DE SEGURIDAD ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- 1. Rifas: Lectura pública de rifas activas
CREATE POLICY "Lectura pública de rifas" ON public.raffles
    FOR SELECT USING (status IN ('active', 'paused', 'closed', 'finished'));

-- 2. Boletos: Lectura pública para visualización en el frontend
CREATE POLICY "Lectura pública de boletos" ON public.tickets
    FOR SELECT USING (true);

-- 3. Aliados: Lectura pública de aliados activos
CREATE POLICY "Lectura pública de aliados" ON public.partners
    FOR SELECT USING (is_active = true);

-- 4. Compradores: Inserción pública (checkout)
CREATE POLICY "Creación pública de compradores" ON public.buyers
    FOR INSERT WITH CHECK (true);

-- 5. Órdenes: Inserción pública y consulta por referencia propia
CREATE POLICY "Creación pública de órdenes" ON public.orders
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Consulta de orden por referencia" ON public.orders
    FOR SELECT USING (true);

-- ============================================================================
-- DATOS INICIALES (SEED DATA)
-- ============================================================================

-- Insertar los 10 Aliados de Manaure Vive
INSERT INTO public.partners (slug, name, category, display_order)
VALUES
    ('cuatri-tours-manaure', 'Cuatri Tours Manaure', 'Aventura en cuatrimotos y rutas', 1),
    ('manaure-aventura', 'Manaure Aventura', 'Deportes extremos y parapente', 2),
    ('mashiramo-glamping', 'Mashiramo Glamping', 'Glamping y descanso en la naturaleza', 3),
    ('villa-adelaida', 'Villa Adelaida', 'Hospedaje campestre y ecoturismo', 4),
    ('los-pinos-manaure', 'Los Pinos Manaure', 'Mirador, naturaleza y paisajes', 5),
    ('absolom-casita-de-la-mora', 'Absolom - La Casita de la Mora', 'Sabores y dulces tradicionales', 6),
    ('la-casa-de-las-arepas', 'La Casa de las Arepas', 'Gastronomía típica local', 7),
    ('metallura', 'Metallura Nature Tourism', 'Avistamiento de aves', 8),
    ('photours', 'PHOTours', 'Fotografía y contenido audiovisual', 9),
    ('coruscans', 'Coruscans', 'Productos y artesanías locales', 10)
ON CONFLICT (slug) DO NOTHING;

-- Insertar Rifa Principal de Lanzamiento (1.000 boletos del 000 al 999)
INSERT INTO public.raffles (id, title, slug, description, ticket_price, total_tickets, draw_date, lottery_reference, status)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Gran Rifa Ecoturística Manaure Vive',
    'gran-rifa-manaure-vive',
    'Gana una experiencia ecoturística todo incluido para 2 personas en Manaure (Balcón del Cesar): Hospedaje en Glamping de lujo, Tour en Cuatrimoto por la Serranía del Perijá, Vuelo en Parapente, Cena Gourmet y Fotografía Profesional.',
    25000.00,
    1000,
    NOW() + INTERVAL '30 days',
    'Lotería de Santander (Premio Mayor de 3 cifras)',
    'active'
)
ON CONFLICT (slug) DO NOTHING;

-- Generar los 1.000 boletos iniciales (000 a 999)
DO $$
DECLARE
    v_raffle_id UUID := 'a0000000-0000-0000-0000-000000000001';
    i INTEGER;
BEGIN
    FOR i IN 0..999 LOOP
        INSERT INTO public.tickets (raffle_id, number, status)
        VALUES (v_raffle_id, LPAD(i::TEXT, 3, '0'), 'available')
        ON CONFLICT (raffle_id, number) DO NOTHING;
    END LOOP;
END;
$$;

