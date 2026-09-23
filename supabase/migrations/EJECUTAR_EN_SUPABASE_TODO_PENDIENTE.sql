-- ============================================================================
-- SCRIPT DEPRECADO / HISTÓRICO PARCIAL - NO EJECUTAR EN PRODUCCIÓN NI BASES LIMPIAS
-- ============================================================================
-- ADVERTENCIA DE AUDITORÍA Y TRAZABILIDAD (AUDITORÍA 00 - FEEDBACK 03):
-- Este archivo consolidado (EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql) es un artefacto
-- histórico manual incompleto y NO REPRESENTA la fuente de verdad del esquema actual.
--
-- ESTADO DE COMPLETITUD Y LIMITACIONES TÉCNICAS:
-- 1. Incluye parcialmente migraciones desde la 001 hasta la 027 y salta desordenadamente
--    a las migraciones 033, 032, 034, 035 y 036.
-- 2. OMITE COMPLETAMENTE las siguientes migraciones críticas:
--    - 028_fix_public_payment_accounts_and_is_admin_grant.sql (RLS payment_accounts y REPLICA IDENTITY)
--    - 028_flexible_raffle_emission.sql (admin_create_raffle dinámico)
--    - 029_harden_is_admin_security_definer.sql (endurecimiento anti-enumeración de auth.uid())
--    - 030_remove_resend_email_id.sql (limpieza estructural de orders)
--    - 031_prize_management.sql (creación fundamental de tablas prize_settings y prize_experiences)
-- 3. ALERTA DE ERROR FATAL EN INSTALACIÓN LIMPIA:
--    Dado que omite la migración 031, cualquier intento de ejecutar este archivo sobre
--    una base de datos limpia fallará fatalmente en la línea 7568 al intentar ejecutar
--    ALTER TABLE public.prize_settings antes de que dicha tabla haya sido creada.
-- 4. DESORDEN CRONOLÓGICO:
--    La migración 033 aparece antes de la migración 032.
--
-- FUENTE DE VERDAD CANÓNICA:
-- Para inicializar o actualizar cualquier entorno (local, staging o producción), se debe
-- ejecutar la secuencia canónica de migraciones individuales en orden numérico:
-- `supabase/migrations/001_...sql` hasta `supabase/migrations/036_...sql`.
-- ============================================================================

-- ==========================================
-- FILE: 001_initial_schema.sql
-- ==========================================
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



-- ==========================================
-- FILE: 002_admin_auth.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 002: TABLA DE ADMINISTRADORES Y POLÍTICAS DE AUTORIZACIÓN (SUPABASE AUTH)
-- ============================================================================

-- 1. Tabla de Administradores Autorizados
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(200),
    role VARCHAR(50) DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin', 'auditor')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 3. Función auxiliar para verificar si el usuario autenticado actual es un administrador activo
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = p_user_id OR email = (SELECT email FROM auth.users WHERE id = p_user_id))
      AND is_active = true
  );
$$;

-- 4. Función trigger para auto-vincular user_id cuando un admin se registra o hace login
CREATE OR REPLACE FUNCTION public.sync_admin_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.admin_users
  SET user_id = NEW.id,
      updated_at = NOW()
  WHERE LOWER(email) = LOWER(NEW.email)
    AND (user_id IS NULL OR user_id = NEW.id);
  RETURN NEW;
END;
$$;

-- Trigger sobre auth.users para sincronizar automáticamente el user_id del admin por correo
DROP TRIGGER IF EXISTS on_auth_user_created_sync_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_sync_admin
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_admin_user_id();

-- 5. Políticas RLS (Sin recursión infinita)
-- Permitir que un usuario autenticado lea su propio registro de admin
DROP POLICY IF EXISTS "Admins pueden consultar su propio perfil" ON public.admin_users;
CREATE POLICY "Admins pueden consultar su propio perfil" ON public.admin_users
    FOR SELECT TO authenticated
    USING (
      user_id = auth.uid()
      OR LOWER(email) = LOWER(COALESCE(auth.jwt()->>'email', ''))
      OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
    );

-- Permitir que solo administradores activos modifiquen la tabla admin_users
DROP POLICY IF EXISTS "Superadmins pueden gestionar administradores" ON public.admin_users;
CREATE POLICY "Superadmins pueden gestionar administradores" ON public.admin_users
    FOR ALL TO authenticated
    USING (
      public.is_admin(auth.uid())
    )
    WITH CHECK (
      public.is_admin(auth.uid())
    );




-- ==========================================
-- FILE: 003_manual_payment_flow.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 003: FLUJO DEFINITIVO DE PAGO MANUAL POR TRANSFERENCIA BANCARIA
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Tabla de Cuentas de Pago Oficiales para Transferencias Manuales
CREATE TABLE IF NOT EXISTS public.payment_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name VARCHAR(100) NOT NULL, -- 'Nequi', 'Bancolombia', 'Daviplata', etc.
    account_type VARCHAR(50) DEFAULT 'savings', -- 'savings', 'current', 'digital_wallet'
    account_number VARCHAR(100) NOT NULL,
    account_holder VARCHAR(200) NOT NULL,
    holder_document_id VARCHAR(50),
    qr_code_url TEXT,
    instructions TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en payment_accounts
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para payment_accounts
DROP POLICY IF EXISTS "Lectura pública de cuentas de pago activas" ON public.payment_accounts;
CREATE POLICY "Lectura pública de cuentas de pago activas" ON public.payment_accounts
    FOR SELECT USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Administradores pueden gestionar cuentas de pago" ON public.payment_accounts;
CREATE POLICY "Administradores pueden gestionar cuentas de pago" ON public.payment_accounts
    FOR ALL TO authenticated
    USING (public.is_admin());

-- 2. Actualizar Tabla de Órdenes (Columna y Estados de Pago Manual)
-- Agregar columnas adicionales si no existen
ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID;

-- Actualizar restricción de estados para admitir pending_verification y paid
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
    CHECK (status IN ('pending', 'pending_verification', 'paid', 'completed', 'rejected', 'expired', 'cancelled', 'refunded'));

-- Permitir actualización pública de receipt_url y status al subir comprobante
DROP POLICY IF EXISTS "Compradores pueden adjuntar comprobante a su orden" ON public.orders;
CREATE POLICY "Compradores pueden adjuntar comprobante a su orden" ON public.orders
    FOR UPDATE USING (status IN ('pending', 'pending_verification'));

-- 3. Tabla de Auditoría de Acciones Administrativas
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL, -- 'ORDER_APPROVED', 'ORDER_REJECTED', 'TICKET_RELEASE', etc.
    entity_type VARCHAR(50) NOT NULL, -- 'order', 'ticket', 'raffle', 'payment_account'
    entity_id VARCHAR(100) NOT NULL,
    performed_by UUID, -- ID del admin o NULL si es automático del sistema
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo administradores pueden consultar bitácora de auditoría" ON public.audit_logs;
CREATE POLICY "Solo administradores pueden consultar bitácora de auditoría" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- ============================================================================
-- FUNCIONES TRANSACCIONALES BACKEND (SEGURIDAD Y CONCURRENCIA)
-- ============================================================================

-- A. Función para que el comprador envíe su comprobante de pago
CREATE OR REPLACE FUNCTION public.submit_order_receipt(
    p_order_id UUID,
    p_receipt_url TEXT,
    p_payment_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- Bloquear la orden para actualización concurrente
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra especificada no existe.'
        );
    END IF;

    IF v_order.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden ya se encuentra en estado ' || v_order.status || ' y no puede recibir comprobantes.'
        );
    END IF;

    -- Actualizar orden al estado pendiente de verificación
    UPDATE public.orders
    SET receipt_url = p_receipt_url,
        payment_gateway_id = COALESCE(p_payment_reference, payment_gateway_id),
        status = 'pending_verification',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Asegurar que los tickets sigan asociados a la orden
    UPDATE public.tickets
    SET order_id = p_order_id,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'pending_verification',
        'message', 'Comprobante recibido con éxito. En espera de verificación administrativa.'
    );
END;
$$;

-- B. Función Transaccional Backend: APROBAR PAGO
CREATE OR REPLACE FUNCTION public.approve_order_payment(
    p_order_id UUID,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_ticket_count INTEGER;
    v_tickets_updated INTEGER;
BEGIN
    -- 1. Bloquear orden a nivel de fila (FOR UPDATE)
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden no existe.'
        );
    END IF;

    IF v_order.status = 'paid' OR v_order.status = 'completed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Esta orden ya fue aprobada previamente.'
        );
    END IF;

    -- 2. Marcar orden como 'paid'
    UPDATE public.orders
    SET status = 'paid',
        verified_at = NOW(),
        verified_by = p_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 3. Marcar todos los tickets asociados a la orden como 'sold' de forma permanente
    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        buyer_id = v_order.buyer_id,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_tickets_updated = ROW_COUNT;

    -- 4. Registrar en la bitácora de auditoría
    INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
    VALUES (
        'ORDER_APPROVED',
        'order',
        p_order_id::TEXT,
        p_admin_id,
        jsonb_build_object(
            'order_reference', v_order.reference,
            'total_amount', v_order.total_amount,
            'tickets_count', v_tickets_updated,
            'buyer_id', v_order.buyer_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'tickets_sold', v_tickets_updated,
        'message', 'Pago aprobado exitosamente. Boletos marcados como vendidos.'
    );
END;
$$;

-- C. Función Transaccional Backend: RECHAZAR PAGO
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Comprobante no coincide con la transferencia bancaria',
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_tickets_released INTEGER;
BEGIN
    -- 1. Bloquear orden a nivel de fila (FOR UPDATE)
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden no existe.'
        );
    END IF;

    IF v_order.status = 'paid' OR v_order.status = 'completed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No se puede rechazar una orden que ya está marcada como pagada/vendida.'
        );
    END IF;

    -- 2. Marcar orden como 'rejected'
    UPDATE public.orders
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_at = NOW(),
        verified_by = p_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 3. Liberar inmediatamente todos los tickets asociados para que queden 'available'
    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_tickets_released = ROW_COUNT;

    -- 4. Registrar en la bitácora de auditoría
    INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
    VALUES (
        'ORDER_REJECTED',
        'order',
        p_order_id::TEXT,
        p_admin_id,
        jsonb_build_object(
            'order_reference', v_order.reference,
            'rejection_reason', p_reason,
            'tickets_released', v_tickets_released,
            'buyer_id', v_order.buyer_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected',
        'tickets_released', v_tickets_released,
        'message', 'Orden rechazada correctamente. Los boletos han sido liberados y están disponibles nuevamente.'
    );
END;
$$;

-- D. Actualización de release_expired_reservations() para PROTEGER órdenes en pending_verification
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_released_count INTEGER;
BEGIN
    -- Liberar ÚNICAMENTE boletos cuya reserva expiró Y cuya orden NO está en pending_verification ni pagada
    UPDATE public.tickets t
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE t.status = 'reserved'
      AND t.reservation_expires_at < NOW()
      AND (
          t.order_id IS NULL 
          OR EXISTS (
              SELECT 1 FROM public.orders o
              WHERE o.id = t.order_id
                AND o.status = 'pending'
          )
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = t.order_id
            AND o.status IN ('pending_verification', 'paid', 'completed')
      );

    -- Marcar como expiradas las órdenes que quedaron en pending cuyo tiempo límite expiró
    UPDATE public.orders o
    SET status = 'expired',
        updated_at = NOW()
    WHERE o.status = 'pending'
      AND NOT EXISTS (
          SELECT 1 FROM public.tickets t
          WHERE t.order_id = o.id AND t.status = 'reserved'
      );

    GET DIAGNOSTICS v_released_count = ROW_COUNT;
    RETURN v_released_count;
END;
$$;

-- ============================================================================
-- SEED DATA DE CUENTAS DE PAGO OFICIALES (MANAURE VIVE)
-- ============================================================================
INSERT INTO public.payment_accounts (bank_name, account_type, account_number, account_holder, holder_document_id, instructions, display_order)
VALUES
    ('Nequi', 'digital_wallet', '314 832 9494', 'Manaure Vive Ecoturismo', '901.845.123-1', 'Transferir exactamente el valor total de la orden. Enviar captura legible del comprobante.', 1),
    ('Daviplata', 'digital_wallet', '314 832 9494', 'Manaure Vive Ecoturismo', '901.845.123-1', 'Transferencia directa desde Daviplata o cualquier banco vía PSE/Transfiya.', 2),
    ('Bancolombia', 'savings', '123-456789-00', 'Manaure Vive Ecoturismo SAS', '901.845.123-1', 'Cuenta de Ahorros Bancolombia. Transferencia gratuita desde App Bancolombia.', 3)
ON CONFLICT DO NOTHING;



-- ==========================================
-- FILE: 004_normalize_order_ticket_state_machine.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 004: NORMALIZACIÓN Y REGLAS DE INTEGRIDAD DEL FLUJO DE ESTADOS
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Asegurar Tabla de Auditoría
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    performed_by UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo administradores pueden consultar bitácora de auditoría" ON public.audit_logs;
CREATE POLICY "Solo administradores pueden consultar bitácora de auditoría" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- 2. Normalización de Restricciones en public.orders
ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
    CHECK (status IN (
        'pending',              -- 1. Reserva temporal creada (10 min)
        'pending_verification', -- 2. Usuario subió comprobante (protegido)
        'paid',                 -- 3. Aprobado por administrador (tickets sold)
        'completed',            -- Compatibilidad histórica (equivalente a paid)
        'rejected',             -- 4. Rechazado por administrador (tickets available)
        'expired',              -- 5. Tiempo de reserva expiró sin comprobante
        'cancelled',            -- 6. Cancelada por usuario o administración
        'refunded'              -- 7. Reembolso excepcional
    ));

-- 3. Normalización de Restricciones en public.tickets
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check 
    CHECK (status IN ('available', 'reserved', 'sold', 'blocked'));

-- ============================================================================
-- TRIGGERS DE INTEGRIDAD Y TRANSICIÓN DE ESTADOS (ANTI-BYPASS FRONTEND)
-- ============================================================================

-- A. Función Trigger: Validación de Transiciones de Órdenes y Registro en Auditoría
CREATE OR REPLACE FUNCTION public.fn_validate_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Si el estado no cambió, continuar
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- REGLA 1: No permitir transición directa de 'pending' a 'paid'/'completed' sin comprobante
    IF OLD.status = 'pending' AND NEW.status IN ('paid', 'completed') THEN
        IF NEW.receipt_url IS NULL AND NEW.payment_gateway_id IS NULL THEN
            RAISE EXCEPTION 'Transición inválida: No se puede aprobar una orden pendiente sin comprobante o referencia de pago.';
        END IF;
    END IF;

    -- REGLA 2: No permitir revertir una orden 'paid' o 'completed' a 'pending' o 'pending_verification'
    IF OLD.status IN ('paid', 'completed') AND NEW.status IN ('pending', 'pending_verification', 'expired', 'rejected') THEN
        RAISE EXCEPTION 'Integridad violada: Una orden pagada y confirmada (%) no puede retroceder al estado %.', OLD.reference, NEW.status;
    END IF;

    -- REGLA 3: No permitir que órdenes 'expired', 'rejected' o 'cancelled' pasen a 'paid' directamente
    IF OLD.status IN ('expired', 'rejected', 'cancelled') AND NEW.status IN ('paid', 'completed') THEN
        RAISE EXCEPTION 'Integridad violada: Una orden % (%) no puede reactivarse directamente como pagada.', OLD.status, OLD.reference;
    END IF;

    -- REGISTRO AUTOMÁTICO EN AUDIT_LOGS
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'ORDER_STATUS_' || UPPER(NEW.status),
        'order',
        NEW.id::TEXT,
        NEW.verified_by,
        jsonb_build_object(
            'reference', NEW.reference,
            'previous_status', OLD.status,
            'new_status', NEW.status,
            'total_amount', NEW.total_amount,
            'ticket_count', NEW.ticket_count,
            'rejection_reason', NEW.rejection_reason,
            'receipt_url', NEW.receipt_url
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_status ON public.orders;
CREATE TRIGGER trg_validate_order_status
    BEFORE UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_order_status_transition();

-- B. Función Trigger: Validación de Transiciones de Boletos (No permitir pending -> sold directo)
CREATE OR REPLACE FUNCTION public.fn_validate_ticket_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_status VARCHAR(50);
BEGIN
    -- Si el estado no cambió, continuar
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- REGLA DE ORO DE SEGURIDAD:
    -- Ningún boleto puede marcarse como 'sold' si no está vinculado a una orden en estado 'paid' o 'completed'
    IF NEW.status = 'sold' THEN
        IF NEW.order_id IS NULL THEN
            RAISE EXCEPTION 'Violación de Integridad: No se puede marcar el boleto % como "sold" sin asociarlo a una orden.', NEW.number;
        END IF;

        SELECT status INTO v_order_status
        FROM public.orders
        WHERE id = NEW.order_id;

        IF v_order_status IS NULL OR v_order_status NOT IN ('paid', 'completed') THEN
            RAISE EXCEPTION 'Violación de Seguridad: El boleto % no puede pasar a "sold" porque la orden asociada (%) se encuentra en estado "%". Solo se admite orden en estado "paid".', 
                NEW.number, NEW.order_id, COALESCE(v_order_status, 'inexistente');
        END IF;
    END IF;

    -- Si el boleto pasa a 'available', garantizar que se limpien reservas y referencias
    IF NEW.status = 'available' THEN
        NEW.reserved_at := NULL;
        NEW.reservation_expires_at := NULL;
        NEW.buyer_id := NULL;
        NEW.order_id := NULL;
    END IF;

    -- Registro en auditoría para ventas o liberaciones de boletos
    IF NEW.status = 'sold' OR (OLD.status = 'reserved' AND NEW.status = 'available' AND OLD.order_id IS NOT NULL) THEN
        INSERT INTO public.audit_logs (
            action,
            entity_type,
            entity_id,
            performed_by,
            details
        ) VALUES (
            'TICKET_' || UPPER(NEW.status),
            'ticket',
            NEW.id::TEXT,
            NULL,
            jsonb_build_object(
                'ticket_number', NEW.number,
                'previous_status', OLD.status,
                'new_status', NEW.status,
                'order_id', COALESCE(NEW.order_id, OLD.order_id)
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_ticket_status ON public.tickets;
CREATE TRIGGER trg_validate_ticket_status
    BEFORE UPDATE OF status ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_ticket_status_transition();

-- ============================================================================
-- PROCEDIMIENTOS TRANSACCIONALES BACKEND DEFINITIVOS
-- ============================================================================

-- 1. USUARIO SUBE COMPROBANTE -> pending_verification
CREATE OR REPLACE FUNCTION public.submit_order_receipt(
    p_order_id UUID,
    p_receipt_url TEXT,
    p_payment_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- Bloqueo FOR UPDATE
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra no existe.'
        );
    END IF;

    IF v_order.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden ya se encuentra en estado ' || v_order.status || ' y no acepta comprobantes.'
        );
    END IF;

    -- Actualizar orden a pending_verification
    UPDATE public.orders
    SET receipt_url = p_receipt_url,
        payment_gateway_id = COALESCE(p_payment_reference, payment_gateway_id),
        status = 'pending_verification',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Asegurar que los tickets sigan asociados
    UPDATE public.tickets
    SET order_id = p_order_id,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'pending_verification',
        'message', 'Comprobante recibido exitosamente. La orden queda en verificación y los tickets protegidos.'
    );
END;
$$;

-- 2. ADMIN APRUEBA PAGO -> order: paid, tickets: sold
CREATE OR REPLACE FUNCTION public.approve_order_payment(
    p_order_id UUID,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_tickets_sold INTEGER;
BEGIN
    -- Bloqueo FOR UPDATE
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Esta orden ya fue aprobada y pagada previamente.'
        );
    END IF;

    -- 1. Primero marcar la orden como 'paid' (para cumplir con el trigger de tickets)
    UPDATE public.orders
    SET status = 'paid',
        verified_at = NOW(),
        verified_by = p_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 2. Luego actualizar tickets a 'sold'
    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        buyer_id = v_order.buyer_id,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_tickets_sold = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'tickets_sold', v_tickets_sold,
        'message', 'Pago aprobado con éxito. Boletos marcados como vendidos.'
    );
END;
$$;

-- 3. ADMIN RECHAZA PAGO -> order: rejected, tickets: available
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Comprobante no coincide con la transferencia bancaria',
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_tickets_released INTEGER;
BEGIN
    -- Bloqueo FOR UPDATE
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No se puede rechazar una orden que ya fue pagada y confirmada.'
        );
    END IF;

    -- 1. Marcar orden como 'rejected'
    UPDATE public.orders
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_at = NOW(),
        verified_by = p_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 2. Liberar boletos asociados de vuelta a 'available'
    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_tickets_released = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected',
        'tickets_released', v_tickets_released,
        'message', 'Orden rechazada y boletos liberados exitosamente.'
    );
END;
$$;

-- 4. CANCELACIÓN DE ORDEN (Usuario o Timeout) -> order: cancelled, tickets: available
CREATE OR REPLACE FUNCTION public.cancel_order(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Cancelación por el usuario'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_tickets_released INTEGER;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Orden no encontrada.');
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se puede cancelar una orden ya pagada.');
    END IF;

    UPDATE public.orders
    SET status = 'cancelled',
        rejection_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_order_id;

    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_tickets_released = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'cancelled',
        'tickets_released', v_tickets_released
    );
END;
$$;

-- 5. LIBERACIÓN AUTOMÁTICA DE RESERVAS EXPIRADAS (Protege pending_verification)
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_released_count INTEGER;
BEGIN
    -- Liberar solo boletos expirados cuya orden NO esté en pending_verification, paid ni completed
    UPDATE public.tickets t
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE t.status = 'reserved'
      AND t.reservation_expires_at < NOW()
      AND (
          t.order_id IS NULL 
          OR EXISTS (
              SELECT 1 FROM public.orders o
              WHERE o.id = t.order_id
                AND o.status = 'pending'
          )
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = t.order_id
            AND o.status IN ('pending_verification', 'paid', 'completed')
      );

    -- Marcar como 'expired' las órdenes en 'pending' cuyos tickets hayan sido liberados
    UPDATE public.orders o
    SET status = 'expired',
        updated_at = NOW()
    WHERE o.status = 'pending'
      AND NOT EXISTS (
          SELECT 1 FROM public.tickets t
          WHERE t.order_id = o.id AND t.status = 'reserved'
      );

    GET DIAGNOSTICS v_released_count = ROW_COUNT;
    RETURN v_released_count;
END;
$$;



-- ==========================================
-- FILE: 005_payment_accounts_management.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 005: GESTIÓN INTEGRAL DE CUENTAS DE PAGO MANUAL
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Asegurar Estructura de la Tabla public.payment_accounts
CREATE TABLE IF NOT EXISTS public.payment_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name VARCHAR(100) NOT NULL,
    account_type VARCHAR(50) DEFAULT 'savings',
    account_number VARCHAR(100) NOT NULL,
    account_holder VARCHAR(200) NOT NULL,
    holder_document_id VARCHAR(50),
    qr_code_url TEXT,
    instructions TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en payment_accounts
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

-- 2. Políticas de Seguridad RLS
-- Lectura pública: Únicamente cuentas activas (o administradores para previsualización)
DROP POLICY IF EXISTS "Lectura pública de cuentas de pago activas" ON public.payment_accounts;
CREATE POLICY "Lectura pública de cuentas de pago activas" ON public.payment_accounts
    FOR SELECT USING (is_active = true OR public.is_admin());

-- Gestión administrativa total: SELECT, INSERT, UPDATE, DELETE para administradores autenticados
DROP POLICY IF EXISTS "Administradores pueden gestionar cuentas de pago" ON public.payment_accounts;
CREATE POLICY "Administradores pueden gestionar cuentas de pago" ON public.payment_accounts
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 3. Trigger para updated_at automático
CREATE OR REPLACE FUNCTION public.fn_payment_accounts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_accounts_updated_at ON public.payment_accounts;
CREATE TRIGGER trg_payment_accounts_updated_at
    BEFORE UPDATE ON public.payment_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_payment_accounts_updated_at();

-- 4. Trigger para Auditoría Automática de Cambios en Cuentas de Pago
CREATE OR REPLACE FUNCTION public.fn_audit_payment_accounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_action VARCHAR(100);
    v_details JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'PAYMENT_ACCOUNT_CREATED';
        v_details := jsonb_build_object(
            'bank_name', NEW.bank_name,
            'account_type', NEW.account_type,
            'account_number', NEW.account_number,
            'account_holder', NEW.account_holder,
            'is_active', NEW.is_active,
            'display_order', NEW.display_order
        );
        INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
        VALUES (v_action, 'payment_account', NEW.id::TEXT, auth.uid(), v_details);
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
            v_action := CASE WHEN NEW.is_active THEN 'PAYMENT_ACCOUNT_ACTIVATED' ELSE 'PAYMENT_ACCOUNT_DEACTIVATED' END;
        ELSE
            v_action := 'PAYMENT_ACCOUNT_UPDATED';
        END IF;

        v_details := jsonb_build_object(
            'bank_name', NEW.bank_name,
            'account_type', NEW.account_type,
            'account_number', NEW.account_number,
            'account_holder', NEW.account_holder,
            'is_active_old', OLD.is_active,
            'is_active_new', NEW.is_active,
            'display_order', NEW.display_order
        );
        INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
        VALUES (v_action, 'payment_account', NEW.id::TEXT, auth.uid(), v_details);
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'PAYMENT_ACCOUNT_DELETED';
        v_details := jsonb_build_object(
            'bank_name', OLD.bank_name,
            'account_number', OLD.account_number,
            'account_holder', OLD.account_holder
        );
        INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
        VALUES (v_action, 'payment_account', OLD.id::TEXT, auth.uid(), v_details);
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_payment_accounts ON public.payment_accounts;
CREATE TRIGGER trg_audit_payment_accounts
    AFTER INSERT OR UPDATE OR DELETE ON public.payment_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_audit_payment_accounts();

-- NOTA CRÍTICA:
-- NO se insertan datos bancarios ficticios ni números de prueba.
-- Los datos bancarios reales serán ingresados posteriormente por el administrador desde el panel.



-- ==========================================
-- FILE: 006_payment_proofs_storage_flow.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 006: FLUJO INTEGRAL DE COMPROBANTES DE PAGO (BUCKET PRIVADO)
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Crear Bucket Privado 'payment-proofs' en Supabase Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-proofs',
    'payment-proofs',
    false, -- BUCKET PRIVADO (Nunca público)
    5242880, -- 5 MB máximo en bytes
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- 2. Políticas RLS en storage.objects para 'payment-proofs'
-- Subida de comprobantes: Compradores pueden subir archivos a 'payment-proofs'
DROP POLICY IF EXISTS "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects;
CREATE POLICY "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'payment-proofs'
    );

-- Lectura segura: ÚNICAMENTE administradores autorizados pueden consultar/descargar comprobantes
-- (Los usuarios normales no tienen acceso directo; se generan URLs firmadas para el admin)
DROP POLICY IF EXISTS "Solo administradores pueden leer comprobantes de payment-proofs" ON storage.objects;
CREATE POLICY "Solo administradores pueden leer comprobantes de payment-proofs" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'payment-proofs' AND public.is_admin()
    );

-- 3. Tabla de Comprobantes de Pago Asociada a Rifa, Orden, Comprador y Boletos
CREATE TABLE IF NOT EXISTS public.payment_proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id UUID NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL, -- Ruta interna en el bucket privado 'payment-proofs'
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    payment_reference TEXT,
    rejection_reason TEXT,
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_payment_proofs_order ON public.payment_proofs(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_raffle ON public.payment_proofs(raffle_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_buyer ON public.payment_proofs(buyer_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_status ON public.payment_proofs(status);

-- Habilitar RLS en payment_proofs
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS en payment_proofs
-- A. Administradores: Acceso total para consultar, validar, aprobar o rechazar
DROP POLICY IF EXISTS "Administradores tienen acceso total a payment_proofs" ON public.payment_proofs;
CREATE POLICY "Administradores tienen acceso total a payment_proofs" ON public.payment_proofs
    FOR ALL TO authenticated
    USING (public.is_admin());

-- B. Compradores: Pueden insertar un comprobante para su orden
DROP POLICY IF EXISTS "Compradores pueden registrar comprobante para su orden" ON public.payment_proofs;
CREATE POLICY "Compradores pueden registrar comprobante para su orden" ON public.payment_proofs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE id = order_id AND status IN ('pending', 'pending_verification')
        )
    );

-- 4. Trigger de updated_at para payment_proofs
CREATE OR REPLACE FUNCTION public.fn_payment_proofs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_proofs_updated_at ON public.payment_proofs;
CREATE TRIGGER trg_payment_proofs_updated_at
    BEFORE UPDATE ON public.payment_proofs
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_payment_proofs_updated_at();

-- 5. Función Backend Transaccional: Registrar y Validar Comprobante de Pago
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
    p_order_id UUID,
    p_file_path TEXT,
    p_file_name TEXT,
    p_file_size INTEGER,
    p_mime_type VARCHAR(100),
    p_payment_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_proof_id UUID;
BEGIN
    -- 1. Validar existencia y bloquear orden concurrentemente
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra especificada no existe en el sistema.'
        );
    END IF;

    -- 2. Validar estado correcto de la orden
    IF v_order.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden se encuentra en estado "' || v_order.status || '" y no admite nuevos comprobantes.'
        );
    END IF;

    -- 3. Validar tipo de archivo y tamaño
    IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Formato de archivo no permitido. Solo se admiten JPG, PNG, WEBP o PDF.'
        );
    END IF;

    IF p_file_size > 5242880 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El archivo excede el tamaño máximo permitido de 5 MB.'
        );
    END IF;

    -- 4. Insertar registro en public.payment_proofs
    INSERT INTO public.payment_proofs (
        raffle_id,
        order_id,
        buyer_id,
        file_path,
        file_name,
        file_size,
        mime_type,
        status,
        payment_reference
    ) VALUES (
        v_order.raffle_id,
        p_order_id,
        v_order.buyer_id,
        p_file_path,
        p_file_name,
        p_file_size,
        p_mime_type,
        'pending',
        p_payment_reference
    )
    RETURNING id INTO v_proof_id;

    -- 5. Actualizar orden al estado 'pending_verification' y asociar el comprobante
    UPDATE public.orders
    SET receipt_url = p_file_path,
        payment_gateway_id = COALESCE(p_payment_reference, payment_gateway_id),
        status = 'pending_verification',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 6. Proteger los boletos vinculados a esta orden
    UPDATE public.tickets
    SET order_id = p_order_id,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    -- 7. Registrar evento en auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        'PAYMENT_PROOF_SUBMITTED',
        'order',
        p_order_id::TEXT,
        jsonb_build_object(
            'proof_id', v_proof_id,
            'reference', v_order.reference,
            'file_name', p_file_name,
            'file_size', p_file_size,
            'mime_type', p_mime_type,
            'payment_reference', p_payment_reference
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'proof_id', v_proof_id,
        'order_id', p_order_id,
        'status', 'pending_verification',
        'message', 'Comprobante enviado correctamente. Tu pago está pendiente de verificación.'
    );
END;
$$;

-- 6. Actualizar RPCs de Aprobación y Rechazo para sincronizar payment_proofs
CREATE OR REPLACE FUNCTION public.approve_order_payment(
    p_order_id UUID,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_updated_tickets_count INTEGER;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden ya se encuentra aprobada y pagada anteriormente.'
        );
    END IF;

    -- Actualizar orden
    UPDATE public.orders
    SET status = 'paid',
        verified_at = NOW(),
        verified_by = COALESCE(p_admin_id, auth.uid()),
        rejection_reason = NULL,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Actualizar comprobante(s) asociado(s) a 'approved'
    UPDATE public.payment_proofs
    SET status = 'approved',
        verified_by = COALESCE(p_admin_id, auth.uid()),
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- Marcar boletos como vendidos definitivamente
    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    GET DIAGNOSTICS v_updated_tickets_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'tickets_sold_count', v_updated_tickets_count,
        'message', 'Pago aprobado con éxito. Boletos marcados como vendidos definitivamente.'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Comprobante no válido o transferencia no confirmada',
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_released_tickets_count INTEGER;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Una orden que ya fue pagada no puede ser rechazada arbitrariamente.'
        );
    END IF;

    -- Actualizar orden
    UPDATE public.orders
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_at = NOW(),
        verified_by = COALESCE(p_admin_id, auth.uid()),
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Actualizar comprobante(s) a 'rejected' con el motivo
    UPDATE public.payment_proofs
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_by = COALESCE(p_admin_id, auth.uid()),
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- Liberar boletos de vuelta a 'available'
    UPDATE public.tickets
    SET status = 'available',
        buyer_id = NULL,
        order_id = NULL,
        reserved_at = NULL,
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    GET DIAGNOSTICS v_released_tickets_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected',
        'released_tickets_count', v_released_tickets_count,
        'message', 'Pago rechazado. Boletos liberados y disponibles para la venta.'
    );
END;
$$;



-- ==========================================
-- FILE: 007_transactional_notification_logs.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 007: REGISTRO DE NOTIFICACIONES TRANSACCIONALES (RESEND EMAIL)
-- ============================================================================

-- 1. Tabla de Logs de Notificaciones
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('PAYMENT_RECEIVED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED')),
    channel VARCHAR(20) DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp', 'sms')),
    recipient VARCHAR(255) NOT NULL,
    resend_email_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    attempts INTEGER DEFAULT 1,
    error_message TEXT,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índices de Rendimiento e Idempotencia
CREATE INDEX IF NOT EXISTS idx_notification_logs_order_id ON public.notification_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_idempotency_key ON public.notification_logs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_notification_logs_resend_email_id ON public.notification_logs(resend_email_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON public.notification_logs(status);

-- 3. Habilitar RLS
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Seguridad (RLS)
-- Los administradores autorizados pueden ver todos los registros de notificaciones
CREATE POLICY "Admins pueden ver todos los logs de notificaciones" ON public.notification_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- Permitir a usuarios autenticados consultar logs de sus propias órdenes
CREATE POLICY "Compradores pueden ver logs de sus órdenes" ON public.notification_logs
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.orders o
        JOIN public.buyers b ON b.id = o.buyer_id
        WHERE o.id = notification_logs.order_id
          AND LOWER(b.email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
      )
    );

-- El servicio backend / Edge Functions gestiona los registros con Service Role
-- (El Service Role omite RLS automáticamente en Supabase).



-- ==========================================
-- FILE: 008_order_contact_preference.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 008: PREFERENCIA DE CONTACTO Y CANAL DE NOTIFICACIÓN EN ÓRDENES
-- ============================================================================

-- 1. Agregar columna contact_preference a la tabla orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS contact_preference VARCHAR(20) DEFAULT 'both' 
CHECK (contact_preference IN ('whatsapp', 'email', 'both'));

-- 2. Índice para consultas por preferencia de notificación
CREATE INDEX IF NOT EXISTS idx_orders_contact_preference ON public.orders(contact_preference);

-- 3. Comentario explicativo
COMMENT ON COLUMN public.orders.contact_preference IS 'Canal de comunicación preferido por el comprador para recibir confirmaciones: whatsapp, email, o both.';



-- ==========================================
-- FILE: 009_notification_traceability.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 009: TRAZABILIDAD INTEGRAL DE NOTIFICACIONES (WHATSAPP Y EMAIL)
-- ============================================================================

-- 1. Asegurar que la tabla notification_logs existe con todas las columnas requeridas
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    resend_email_id VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 1,
    error_message TEXT,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Normalizar restricciones de CHECK para admitir formato estricto (minúsculas y mayúsculas)
ALTER TABLE public.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_channel_check;
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_channel_check 
    CHECK (channel IN ('whatsapp', 'email', 'sms'));

ALTER TABLE public.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_event_type_check;
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_event_type_check 
    CHECK (event_type IN ('payment_received', 'payment_approved', 'payment_rejected', 'PAYMENT_RECEIVED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED'));

ALTER TABLE public.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_status_check;
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_status_check 
    CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'bounced'));

-- 3. Índices de trazabilidad para búsquedas rápidas en panel de control
CREATE INDEX IF NOT EXISTS idx_notification_logs_order_id ON public.notification_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_channel ON public.notification_logs(channel);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON public.notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON public.notification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_idempotency ON public.notification_logs(idempotency_key);

-- 4. Habilitar RLS y políticas de seguridad
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  -- Política para admins autorizados (SELECT, INSERT, UPDATE)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notification_logs' AND policyname = 'Admins pueden gestionar todos los logs de notificaciones'
  ) THEN
    CREATE POLICY "Admins pueden gestionar todos los logs de notificaciones" ON public.notification_logs
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  -- Política para compradores (SELECT solo de sus propias órdenes)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notification_logs' AND policyname = 'Compradores pueden ver logs de sus órdenes'
  ) THEN
    CREATE POLICY "Compradores pueden ver logs de sus órdenes" ON public.notification_logs
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.orders o
          JOIN public.buyers b ON b.id = o.buyer_id
          WHERE o.id = notification_logs.order_id
            AND LOWER(b.email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.notification_logs IS 'Registro histórico de trazabilidad de notificaciones enviadas por WhatsApp y Email.';



-- ==========================================
-- FILE: 010_admin_ticket_management.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 010: GESTIÓN ADMINISTRATIVA SEGURA DE TICKETS Y AUDITORÍA
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Procedimiento transaccional para bloquear un ticket
CREATE OR REPLACE FUNCTION public.admin_block_ticket(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT 'Bloqueado preventivamente por administración'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ticket RECORD;
    v_order RECORD;
    v_admin_uid UUID := auth.uid();
BEGIN
    -- Validar permisos de administrador
    IF NOT public.is_admin(v_admin_uid) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: Se requieren privilegios de administrador.'
        );
    END IF;

    -- Validar motivo
    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Debe especificar un motivo claro para bloquear el boleto.'
        );
    END IF;

    -- Consultar y bloquear fila del boleto
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto especificado no existe.'
        );
    END IF;

    -- REGLA DE ORO DE SEGURIDAD:
    -- NO permitir bloquear tickets vendidos asociados a órdenes pagadas
    IF v_ticket.status = 'sold' THEN
        IF v_ticket.order_id IS NOT NULL THEN
            SELECT * INTO v_order
            FROM public.orders
            WHERE id = v_ticket.order_id;

            IF v_order.status IN ('paid', 'completed') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Acción bloqueada: No se puede modificar o bloquear un boleto ya vendido con orden pagada (' || v_order.reference || ').'
                );
            END IF;
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Acción bloqueada: No se puede bloquear un boleto marcado como vendido.'
            );
        END IF;
    END IF;

    IF v_ticket.status = 'blocked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto número ' || v_ticket.number || ' ya se encuentra bloqueado.'
        );
    END IF;

    -- Actualizar estado del boleto a 'blocked' y liberar posibles reservas temporales
    UPDATE public.tickets
    SET
        status = 'blocked',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Registrar auditoría inmutable
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'TICKET_BLOCKED_BY_ADMIN',
        'ticket',
        p_ticket_id::TEXT,
        v_admin_uid,
        jsonb_build_object(
            'ticket_number', v_ticket.number,
            'previous_status', v_ticket.status,
            'new_status', 'blocked',
            'reason', trim(p_reason),
            'previous_order_id', v_ticket.order_id,
            'previous_buyer_id', v_ticket.buyer_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Boleto ' || v_ticket.number || ' bloqueado exitosamente.',
        'ticket_number', v_ticket.number
    );
END;
$$;

-- 2. Procedimiento transaccional para desbloquear un ticket
CREATE OR REPLACE FUNCTION public.admin_unblock_ticket(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT 'Desbloqueado por administración para habilitar venta'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ticket RECORD;
    v_admin_uid UUID := auth.uid();
BEGIN
    -- Validar permisos de administrador
    IF NOT public.is_admin(v_admin_uid) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: Se requieren privilegios de administrador.'
        );
    END IF;

    -- Consultar y bloquear fila del boleto
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto especificado no existe.'
        );
    END IF;

    IF v_ticket.status != 'blocked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto número ' || v_ticket.number || ' no está bloqueado (estado actual: ' || v_ticket.status || ').'
        );
    END IF;

    -- Actualizar estado a 'available'
    UPDATE public.tickets
    SET
        status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Registrar auditoría inmutable
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'TICKET_UNBLOCKED_BY_ADMIN',
        'ticket',
        p_ticket_id::TEXT,
        v_admin_uid,
        jsonb_build_object(
            'ticket_number', v_ticket.number,
            'previous_status', 'blocked',
            'new_status', 'available',
            'reason', trim(p_reason)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Boleto ' || v_ticket.number || ' desbloqueado y disponible para la venta.',
        'ticket_number', v_ticket.number
    );
END;
$$;



-- ==========================================
-- FILE: 011_cron_release_expired_reservations.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 011: EXPIRACIÓN AUTOMÁTICA DE RESERVAS TEMPORALES PERIÓDICA (PG_CRON)
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Habilitar extensión pg_cron en Supabase
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- 2. Procedimiento robusto de liberación de reservas expiradas
--    DIFERENCIA ESTRICTAMENTE:
--    A. Reserva temporal abandonada (status = 'reserved' con reservation_expires_at < NOW() y orden 'pending' sin comprobante o sin orden) -> SE LIBERA.
--    B. Orden pendiente de verificación (status = 'pending_verification') -> NUNCA SE LIBERA (ESTRICTAMENTE PROTEGIDO).
--    C. Orden pagada/confirmada (status IN ('paid', 'completed')) -> NUNCA SE LIBERA (ESTRICTAMENTE PROTEGIDO).
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_released_count INTEGER := 0;
    v_expired_orders_count INTEGER := 0;
    v_expired_order_ids UUID[];
BEGIN
    -- PASO 1: Identificar órdenes en estado 'pending' que ya expiraron
    -- (aquellas con tickets cuya fecha de expiración ya pasó y NO tienen comprobante)
    SELECT ARRAY_AGG(DISTINCT o.id) INTO v_expired_order_ids
    FROM public.orders o
    JOIN public.tickets t ON t.order_id = o.id
    WHERE o.status = 'pending'
      AND t.status = 'reserved'
      AND t.reservation_expires_at < NOW()
      AND o.receipt_url IS NULL;

    -- PASO 2: Liberar los tickets reservados que han expirado
    -- REGLA ESTRICTA DE INTEGRIDAD:
    -- Solo se liberan tickets:
    -- 1. En estado 'reserved'
    -- 2. Con reservation_expires_at menor a la hora actual (NOW())
    -- 3. Que NO pertenezcan a órdenes en 'pending_verification', 'paid' o 'completed'
    UPDATE public.tickets t
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE t.status = 'reserved'
      AND t.reservation_expires_at < NOW()
      AND (
          -- Caso A: Tickets apartados en carrito sin orden formal
          t.order_id IS NULL
          OR
          -- Caso B: Tickets con orden pendiente no pagada ni en verificación
          EXISTS (
              SELECT 1 FROM public.orders o
              WHERE o.id = t.order_id
                AND o.status = 'pending'
                AND o.receipt_url IS NULL
          )
      )
      -- Doble candado de seguridad: NUNCA tocar comprobantes en verificación ni órdenes pagadas
      AND NOT EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = t.order_id
            AND o.status IN ('pending_verification', 'paid', 'completed')
      );

    GET DIAGNOSTICS v_released_count = ROW_COUNT;

    -- PASO 3: Marcar como 'expired' las órdenes 'pending' cuyos tickets fueron liberados
    IF v_expired_order_ids IS NOT NULL AND array_length(v_expired_order_ids, 1) > 0 THEN
        UPDATE public.orders
        SET status = 'expired',
            rejection_reason = 'Tiempo de reserva de 10 minutos agotado sin comprobante de pago.',
            updated_at = NOW()
        WHERE id = ANY(v_expired_order_ids)
          AND status = 'pending';

        GET DIAGNOSTICS v_expired_orders_count = ROW_COUNT;

        -- Registrar en bitácora de auditoría si hubo liberaciones
        IF v_released_count > 0 THEN
            INSERT INTO public.audit_logs (
                action,
                entity_type,
                entity_id,
                performed_by,
                details
            ) VALUES (
                'AUTO_EXPIRE_RESERVATIONS_CRON',
                'system_job',
                gen_random_uuid()::TEXT,
                NULL,
                jsonb_build_object(
                    'tickets_released', v_released_count,
                    'orders_expired', v_expired_orders_count,
                    'expired_order_ids', v_expired_order_ids,
                    'execution_timestamp', NOW()
                )
            );
        END IF;
    ELSIF v_released_count > 0 THEN
        -- Si se liberaron tickets huérfanos sin orden
        INSERT INTO public.audit_logs (
            action,
            entity_type,
            entity_id,
            performed_by,
            details
        ) VALUES (
            'AUTO_EXPIRE_ORPHAN_RESERVATIONS_CRON',
            'system_job',
            gen_random_uuid()::TEXT,
            NULL,
            jsonb_build_object(
                'tickets_released', v_released_count,
                'execution_timestamp', NOW()
            )
        );
    END IF;

    RETURN v_released_count;
END;
$$;

-- 3. Programación del Cron Job en pg_cron (Cada 5 minutos)
DO $$
BEGIN
    -- Desprogramar si ya existía para evitar duplicación
    PERFORM cron.unschedule('release-expired-reservations-job')
    WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'release-expired-reservations-job'
    );

    -- Programar ejecución periódica cada 5 minutos: '*/5 * * * *'
    PERFORM cron.schedule(
        'release-expired-reservations-job',
        '*/5 * * * *',
        'SELECT public.release_expired_reservations();'
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Aviso al registrar cron en pg_cron (puede requerir habilitación en Supabase Dashboard): %', SQLERRM;
END $$;



-- ==========================================
-- FILE: 012_create_order_secure.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 012: CREACIÓN SEGURA DE ÓRDENES Y CÁLCULO DE TOTAL EN SERVIDOR
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================
-- Esta migración implementa la función RPC create_order_secure que:
-- 1. Recalcula total_amount directamente desde raffles.ticket_price en PostgreSQL.
-- 2. Bloquea atómicamente los boletos con FOR UPDATE (anti condiciones de carrera).
-- 3. Registra/actualiza el comprador, crea la orden y asigna los boletos en 1 sola transacción.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_order_secure(
    p_raffle_id UUID,
    p_ticket_numbers TEXT[],
    p_buyer_data JSONB,
    p_payment_method VARCHAR DEFAULT 'transfer_manual',
    p_contact_preference VARCHAR DEFAULT 'both'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_raffle RECORD;
    v_buyer_id UUID;
    v_order_id UUID;
    v_reference VARCHAR(50);
    v_total_amount NUMERIC(12, 2);
    v_ticket_count INTEGER;
    v_available_count INTEGER;
    v_failed_numbers TEXT[];
    v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '10 minutes';
    v_doc_id TEXT;
    v_full_name TEXT;
    v_phone TEXT;
    v_email TEXT;
    v_city TEXT;
BEGIN
    -- 1. Validaciones básicas de parámetros
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El identificador de la rifa es requerido.');
    END IF;

    v_ticket_count := COALESCE(array_length(p_ticket_numbers, 1), 0);
    IF v_ticket_count <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Debe seleccionar al menos un número de boleto.');
    END IF;

    -- 2. Consultar la rifa oficial y obtener ticket_price directamente de la base de datos
    SELECT id, title, ticket_price, max_tickets_per_buyer, status
    INTO v_raffle
    FROM public.raffles
    WHERE id = p_raffle_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe.');
    END IF;

    IF v_raffle.status NOT IN ('active') THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa no se encuentra activa para la venta.');
    END IF;

    IF v_ticket_count > v_raffle.max_tickets_per_buyer THEN
        RETURN jsonb_build_object('success', false, 'error', 'Excede el límite máximo de ' || v_raffle.max_tickets_per_buyer || ' boletos por compra.');
    END IF;

    -- 3. Calcular total_amount exclusivamente en PostgreSQL (NUNCA desde el cliente)
    v_total_amount := v_raffle.ticket_price * v_ticket_count;

    -- 4. Extraer y validar datos del comprador
    v_doc_id := trim(COALESCE(p_buyer_data->>'documentId', p_buyer_data->>'document_id', ''));
    v_full_name := trim(COALESCE(p_buyer_data->>'fullName', p_buyer_data->>'full_name', ''));
    v_phone := trim(COALESCE(p_buyer_data->>'phone', ''));
    v_email := lower(trim(COALESCE(p_buyer_data->>'email', '')));
    v_city := trim(COALESCE(p_buyer_data->>'city', 'Manaure'));

    IF v_doc_id = '' OR v_full_name = '' OR v_phone = '' OR v_email = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Todos los datos del comprador son obligatorios (nombre, cédula, celular y correo).');
    END IF;

    -- Inserción segura con preservación de datos existentes (DO NOTHING en conflicto)
    INSERT INTO public.buyers (full_name, document_id, phone, email, city, updated_at)
    VALUES (v_full_name, v_doc_id, v_phone, v_email, v_city, NOW())
    ON CONFLICT (document_id) DO NOTHING
    RETURNING id INTO v_buyer_id;

    -- Si ya existía el comprador, recuperar su id sin modificar sus datos originales
    IF v_buyer_id IS NULL THEN
        SELECT id INTO v_buyer_id
        FROM public.buyers
        WHERE document_id = v_doc_id;
    END IF;

    -- 5. Liberar reservas expiradas antes de verificar
    PERFORM public.release_expired_reservations();

    -- 6. Bloqueo atómico FOR UPDATE de boletos disponibles
    WITH locked_tickets AS (
        SELECT id, number
        FROM public.tickets
        WHERE raffle_id = p_raffle_id
          AND number = ANY(p_ticket_numbers)
          AND (status = 'available' OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW()))
        FOR UPDATE
    )
    SELECT count(*), array_agg(number)
    INTO v_available_count, v_failed_numbers
    FROM locked_tickets;

    IF v_available_count < v_ticket_count THEN
        SELECT array_agg(num)
        INTO v_failed_numbers
        FROM unnest(p_ticket_numbers) AS num
        WHERE num NOT IN (
            SELECT number FROM public.tickets
            WHERE raffle_id = p_raffle_id
              AND number = ANY(p_ticket_numbers)
              AND (status = 'available' OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW()))
        );

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Uno o más números ya no se encuentran disponibles.',
            'failed_numbers', COALESCE(v_failed_numbers, ARRAY[]::TEXT[])
        );
    END IF;

    -- 7. Generar referencia única de orden
    v_reference := 'MV-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));

    -- 8. Insertar orden con total calculado en backend
    INSERT INTO public.orders (
        raffle_id,
        buyer_id,
        reference,
        total_amount,
        ticket_count,
        status,
        payment_method,
        contact_preference
    ) VALUES (
        p_raffle_id,
        v_buyer_id,
        v_reference,
        v_total_amount,
        v_ticket_count,
        'pending',
        COALESCE(p_payment_method, 'transfer_manual'),
        COALESCE(p_contact_preference, 'both')
    )
    RETURNING id INTO v_order_id;

    -- 9. Asignar boletos a la orden y establecer expiración de 10 min
    UPDATE public.tickets
    SET status = 'reserved',
        reserved_at = NOW(),
        reservation_expires_at = v_expires_at,
        buyer_id = v_buyer_id,
        order_id = v_order_id,
        updated_at = NOW()
    WHERE raffle_id = p_raffle_id
      AND number = ANY(p_ticket_numbers);

    -- 10. Registrar auditoría inmutable
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        'ORDER_CREATED_SECURE',
        'order',
        v_order_id::TEXT,
        jsonb_build_object(
            'reference', v_reference,
            'raffle_id', p_raffle_id,
            'buyer_id', v_buyer_id,
            'ticket_count', v_ticket_count,
            'ticket_price', v_raffle.ticket_price,
            'total_amount', v_total_amount,
            'contact_preference', p_contact_preference,
            'ticket_numbers', p_ticket_numbers
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'reference', v_reference,
        'buyer_id', v_buyer_id,
        'total_amount', v_total_amount,
        'ticket_count', v_ticket_count,
        'reservation_expires_at', v_expires_at
    );
END;
$$;

-- Permisos de ejecución para clientes y backend
GRANT EXECUTE ON FUNCTION public.create_order_secure(UUID, TEXT[], JSONB, VARCHAR, VARCHAR) TO anon, authenticated, service_role;



-- ==========================================
-- FILE: 013_restrict_orders_select_and_public_verification_rpc.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 013: AISLAMIENTO DE ORDERS Y PROCEDIMIENTO RPC DE CONSULTA PÚBLICA
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================
-- Esta migración:
-- 1. Restringe la política SELECT directa sobre public.orders únicamente a administradores.
-- 2. Implementa verify_public_order_or_tickets(p_search_term) con SECURITY DEFINER.
-- 3. Enmascara nombre y documento directamente en SQL (Carlos M. / 1065***40).
-- 4. Excluye estrictamente comprobantes, datos bancarios y metadatos administrativos.
-- ============================================================================

-- 1. Función RPC de Consulta Pública Sanitizada
CREATE OR REPLACE FUNCTION public.verify_public_order_or_tickets(p_search_term TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_term TEXT;
    v_is_reference BOOLEAN;
    v_is_numeric BOOLEAN;
    v_results JSONB := '[]'::jsonb;
BEGIN
    v_clean_term := trim(p_search_term);
    
    IF v_clean_term IS NULL OR v_clean_term = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El término de búsqueda no puede estar vacío.', 'orders', '[]'::jsonb);
    END IF;

    -- Detectar si es búsqueda por referencia (MV-...) o alfanumérica vs cédula numérica
    v_is_reference := (upper(v_clean_term) LIKE 'MV-%' OR v_clean_term ~* '[A-Z]');
    v_is_numeric := (v_clean_term ~ '^[0-9]+$');

    IF v_is_reference THEN
        -- Búsqueda por referencia exacta o parcial
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', o.id,
                    'reference', o.reference,
                    'status', o.status,
                    'createdAt', o.created_at,
                    'totalAmount', o.total_amount,
                    'ticketCount', o.ticket_count,
                    'rejectionReason', CASE WHEN o.status = 'rejected' THEN o.rejection_reason ELSE NULL END,
                    'maskedBuyerName', CASE 
                        WHEN b.full_name IS NULL OR b.full_name = '' THEN 'Comprador'
                        WHEN position(' ' in trim(b.full_name)) > 0 THEN 
                            split_part(trim(b.full_name), ' ', 1) || ' ' || substring(split_part(trim(b.full_name), ' ', 2) from 1 for 1) || '.'
                        ELSE 
                            trim(b.full_name)
                    END,
                    'maskedDocumentId', CASE
                        WHEN b.document_id IS NULL OR length(trim(b.document_id)) <= 4 THEN '***'
                        WHEN length(trim(b.document_id)) <= 6 THEN 
                            substring(trim(b.document_id) from 1 for 2) || '***' || substring(trim(b.document_id) from length(trim(b.document_id)) for 1)
                        ELSE
                            substring(trim(b.document_id) from 1 for 4) || '***' || substring(trim(b.document_id) from length(trim(b.document_id)) - 1 for 2)
                    END,
                    'raffle', jsonb_build_object(
                        'title', r.title,
                        'drawDate', r.draw_date,
                        'lotteryReference', r.lottery_reference
                    ),
                    'tickets', (
                        SELECT COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'number', t.number,
                                    'status', t.status
                                ) ORDER BY t.number ASC
                            ),
                            '[]'::jsonb
                        )
                        FROM public.tickets t
                        WHERE t.order_id = o.id
                    )
                ) ORDER BY o.created_at DESC
            ),
            '[]'::jsonb
        ) INTO v_results
        FROM public.orders o
        LEFT JOIN public.buyers b ON b.id = o.buyer_id
        LEFT JOIN public.raffles r ON r.id = o.raffle_id
        WHERE o.reference ILIKE '%' || v_clean_term || '%'
        LIMIT 5;

    ELSIF v_is_numeric THEN
        -- Búsqueda por documento de identidad
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', o.id,
                    'reference', o.reference,
                    'status', o.status,
                    'createdAt', o.created_at,
                    'totalAmount', o.total_amount,
                    'ticketCount', o.ticket_count,
                    'rejectionReason', CASE WHEN o.status = 'rejected' THEN o.rejection_reason ELSE NULL END,
                    'maskedBuyerName', CASE 
                        WHEN b.full_name IS NULL OR b.full_name = '' THEN 'Comprador'
                        WHEN position(' ' in trim(b.full_name)) > 0 THEN 
                            split_part(trim(b.full_name), ' ', 1) || ' ' || substring(split_part(trim(b.full_name), ' ', 2) from 1 for 1) || '.'
                        ELSE 
                            trim(b.full_name)
                    END,
                    'maskedDocumentId', CASE
                        WHEN b.document_id IS NULL OR length(trim(b.document_id)) <= 4 THEN '***'
                        WHEN length(trim(b.document_id)) <= 6 THEN 
                            substring(trim(b.document_id) from 1 for 2) || '***' || substring(trim(b.document_id) from length(trim(b.document_id)) for 1)
                        ELSE
                            substring(trim(b.document_id) from 1 for 4) || '***' || substring(trim(b.document_id) from length(trim(b.document_id)) - 1 for 2)
                    END,
                    'raffle', jsonb_build_object(
                        'title', r.title,
                        'drawDate', r.draw_date,
                        'lotteryReference', r.lottery_reference
                    ),
                    'tickets', (
                        SELECT COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'number', t.number,
                                    'status', t.status
                                ) ORDER BY t.number ASC
                            ),
                            '[]'::jsonb
                        )
                        FROM public.tickets t
                        WHERE t.order_id = o.id
                    )
                ) ORDER BY o.created_at DESC
            ),
            '[]'::jsonb
        ) INTO v_results
        FROM public.orders o
        JOIN public.buyers b ON b.id = o.buyer_id
        LEFT JOIN public.raffles r ON r.id = o.raffle_id
        WHERE b.document_id = v_clean_term
        LIMIT 10;
    ELSE
        -- Fallback por referencia o término general
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', o.id,
                    'reference', o.reference,
                    'status', o.status,
                    'createdAt', o.created_at,
                    'totalAmount', o.total_amount,
                    'ticketCount', o.ticket_count,
                    'rejectionReason', CASE WHEN o.status = 'rejected' THEN o.rejection_reason ELSE NULL END,
                    'maskedBuyerName', CASE 
                        WHEN b.full_name IS NULL OR b.full_name = '' THEN 'Comprador'
                        WHEN position(' ' in trim(b.full_name)) > 0 THEN 
                            split_part(trim(b.full_name), ' ', 1) || ' ' || substring(split_part(trim(b.full_name), ' ', 2) from 1 for 1) || '.'
                        ELSE 
                            trim(b.full_name)
                    END,
                    'maskedDocumentId', CASE
                        WHEN b.document_id IS NULL OR length(trim(b.document_id)) <= 4 THEN '***'
                        WHEN length(trim(b.document_id)) <= 6 THEN 
                            substring(trim(b.document_id) from 1 for 2) || '***' || substring(trim(b.document_id) from length(trim(b.document_id)) for 1)
                        ELSE
                            substring(trim(b.document_id) from 1 for 4) || '***' || substring(trim(b.document_id) from length(trim(b.document_id)) - 1 for 2)
                    END,
                    'raffle', jsonb_build_object(
                        'title', r.title,
                        'drawDate', r.draw_date,
                        'lotteryReference', r.lottery_reference
                    ),
                    'tickets', (
                        SELECT COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'number', t.number,
                                    'status', t.status
                                ) ORDER BY t.number ASC
                            ),
                            '[]'::jsonb
                        )
                        FROM public.tickets t
                        WHERE t.order_id = o.id
                    )
                ) ORDER BY o.created_at DESC
            ),
            '[]'::jsonb
        ) INTO v_results
        FROM public.orders o
        LEFT JOIN public.buyers b ON b.id = o.buyer_id
        LEFT JOIN public.raffles r ON r.id = o.raffle_id
        WHERE o.reference ILIKE '%' || v_clean_term || '%'
        LIMIT 5;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'searchTerm', v_clean_term,
        'searchedBy', CASE WHEN v_is_reference THEN 'reference' ELSE 'document' END,
        'orders', v_results
    );
END;
$$;

-- Permisos de ejecución pública
GRANT EXECUTE ON FUNCTION public.verify_public_order_or_tickets(TEXT) TO anon, authenticated, service_role;

-- 2. Restringir la política SELECT sobre public.orders (Exclusivo para administradores)
DROP POLICY IF EXISTS "Consulta de orden por referencia" ON public.orders;
DROP POLICY IF EXISTS "Lectura pública de órdenes" ON public.orders;
DROP POLICY IF EXISTS "Solo administradores pueden consultar órdenes directamente" ON public.orders;

CREATE POLICY "Solo administradores pueden consultar órdenes directamente" ON public.orders
    FOR SELECT TO authenticated
    USING (public.is_admin());



-- ==========================================
-- FILE: 014_harden_admin_payment_rpcs.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 014: ENDURECIMIENTO DE SEGURIDAD EN RPCS ADMINISTRATIVAS DE PAGO
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================
-- 1. Agrega validación estricta is_admin(auth.uid()) al inicio de approve_order_payment
--    y reject_order_payment.
-- 2. Elimina el parámetro p_admin_id recibido desde el cliente y usa auth.uid()
--    directamente en el servidor como identidad del administrador.
-- 3. Mantiene intacta la lógica transaccional (FOR UPDATE, transiciones y boletos).
-- 4. Revoca permisos de ejecución a anon / PUBLIC y confirma GRANT a authenticated y service_role.
-- ============================================================================

-- 1. Eliminar firmas anteriores con sobrecarga de parámetros (p_admin_id)
DROP FUNCTION IF EXISTS public.approve_order_payment(UUID, UUID);
DROP FUNCTION IF EXISTS public.approve_order_payment(UUID);
DROP FUNCTION IF EXISTS public.reject_order_payment(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.reject_order_payment(UUID, TEXT);
DROP FUNCTION IF EXISTS public.reject_order_payment(UUID);

-- 2. Procedimiento Seguro: Aprobar Pago de Orden (Solo Administrador)
CREATE OR REPLACE FUNCTION public.approve_order_payment(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_updated_tickets_count INTEGER;
    v_admin_id UUID;
BEGIN
    -- 1. Validación estricta de autorización de administrador
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador';
    END IF;

    v_admin_id := auth.uid();

    -- 2. Bloqueo pesimista de la orden para evitar condiciones de carrera
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden ya se encuentra aprobada y pagada anteriormente.'
        );
    END IF;

    -- 3. Actualizar orden a 'paid'
    UPDATE public.orders
    SET status = 'paid',
        verified_at = NOW(),
        verified_by = v_admin_id,
        rejection_reason = NULL,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 4. Actualizar comprobante(s) asociado(s) a 'approved'
    UPDATE public.payment_proofs
    SET status = 'approved',
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- 5. Marcar boletos como vendidos definitivamente
    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    GET DIAGNOSTICS v_updated_tickets_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'tickets_sold_count', v_updated_tickets_count,
        'message', 'Pago aprobado con éxito. Boletos marcados como vendidos definitivamente.'
    );
END;
$$;

-- 3. Procedimiento Seguro: Rechazar Pago de Orden y Liberar Boletos (Solo Administrador)
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Comprobante no válido o transferencia no confirmada'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_released_tickets_count INTEGER;
    v_admin_id UUID;
BEGIN
    -- 1. Validación estricta de autorización de administrador
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador';
    END IF;

    v_admin_id := auth.uid();

    -- 2. Bloqueo pesimista de la orden
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Una orden que ya fue pagada no puede ser rechazada arbitrariamente.'
        );
    END IF;

    -- 3. Actualizar orden a 'rejected'
    UPDATE public.orders
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_at = NOW(),
        verified_by = v_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 4. Actualizar comprobante(s) a 'rejected' con el motivo
    UPDATE public.payment_proofs
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- 5. Liberar boletos de vuelta a 'available'
    UPDATE public.tickets
    SET status = 'available',
        buyer_id = NULL,
        order_id = NULL,
        reserved_at = NULL,
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    GET DIAGNOSTICS v_released_tickets_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected',
        'released_tickets_count', v_released_tickets_count,
        'message', 'Pago rechazado. Boletos liberados y disponibles para la venta.'
    );
END;
$$;

-- 4. Control de Privilegios: Revocar de anon/PUBLIC y Conceder exclusivamente a authenticated y service_role
REVOKE ALL ON FUNCTION public.approve_order_payment(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_order_payment(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.approve_order_payment(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(UUID, TEXT) TO authenticated, service_role;



-- ==========================================
-- FILE: 015_harden_payment_proofs_storage.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 015: ENDURECIMIENTO DE STORAGE Y RUTA DE COMPROBANTES DE PAGO
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================
-- 1. Restringe la política de INSERT en storage.objects para el bucket 'payment-proofs'
--    validando que la ruta contenga un order_id válido en estado 'pending' o 'pending_verification'.
-- 2. Actualiza submit_payment_proof para validar que la ruta del comprobante
--    corresponda estrictamente a la orden que se intenta actualizar.
-- 3. Mantiene los límites de 5 MB y tipos MIME permitidos.
-- ============================================================================

-- 1. Asegurar configuración de límites y tipos MIME del bucket privado 'payment-proofs'
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-proofs',
    'payment-proofs',
    false, -- Privado
    5242880, -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- 2. Reemplazar Política de INSERT en storage.objects con Validación de Ruta y Estado de Orden
DROP POLICY IF EXISTS "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects;

CREATE POLICY "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'payment-proofs'
        AND (
            -- Ruta estándar: proofs/{order_id}/{filename}
            EXISTS (
                SELECT 1 FROM public.orders o
                WHERE o.id::text = split_part(name, '/', 2)
                AND o.status IN ('pending', 'pending_verification')
            )
            OR
            -- Ruta con prefijo de rifa: proofs/{raffle_id}/{order_id}/{filename}
            EXISTS (
                SELECT 1 FROM public.orders o
                WHERE o.id::text = split_part(name, '/', 3)
                AND o.status IN ('pending', 'pending_verification')
            )
        )
    );

-- 3. Actualizar función RPC submit_payment_proof con validación de ruta vs order_id
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
    p_order_id UUID,
    p_file_path TEXT,
    p_file_name TEXT,
    p_file_size INTEGER,
    p_mime_type VARCHAR(100),
    p_payment_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_proof_id UUID;
BEGIN
    -- 1. Validar existencia y bloquear orden concurrentemente
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra especificada no existe en el sistema.'
        );
    END IF;

    -- 2. Validar estado correcto de la orden
    IF v_order.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden se encuentra en estado "' || v_order.status || '" y no admite nuevos comprobantes.'
        );
    END IF;

    -- 3. Validar correspondencia estricta de la ruta del archivo con la orden objetivo
    IF NOT (
        p_file_path LIKE 'proofs/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE 'proofs/%/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE '%/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE 'data:image/%'
        OR p_file_path LIKE 'data:application/pdf%'
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La ruta del comprobante no corresponde al identificador de la orden que se intenta procesar.'
        );
    END IF;

    -- 4. Validar tipo de archivo y tamaño (5 MB máximo)
    IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Formato de archivo no permitido. Solo se admiten JPG, PNG, WEBP o PDF.'
        );
    END IF;

    IF p_file_size > 5242880 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El archivo excede el tamaño máximo permitido de 5 MB.'
        );
    END IF;

    -- 5. Insertar registro en public.payment_proofs
    INSERT INTO public.payment_proofs (
        raffle_id,
        order_id,
        buyer_id,
        file_path,
        file_name,
        file_size,
        mime_type,
        status,
        payment_reference
    ) VALUES (
        v_order.raffle_id,
        p_order_id,
        v_order.buyer_id,
        p_file_path,
        p_file_name,
        p_file_size,
        p_mime_type,
        'pending',
        p_payment_reference
    )
    RETURNING id INTO v_proof_id;

    -- 6. Actualizar orden al estado 'pending_verification' y asociar el comprobante
    UPDATE public.orders
    SET receipt_url = p_file_path,
        payment_gateway_id = COALESCE(p_payment_reference, payment_gateway_id),
        status = 'pending_verification',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 7. Proteger los boletos vinculados a esta orden
    UPDATE public.tickets
    SET order_id = p_order_id,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    -- 8. Registrar evento en auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        'PAYMENT_PROOF_SUBMITTED',
        'order',
        p_order_id::TEXT,
        jsonb_build_object(
            'proof_id', v_proof_id,
            'reference', v_order.reference,
            'file_name', p_file_name,
            'file_size', p_file_size,
            'mime_type', p_mime_type,
            'payment_reference', p_payment_reference
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'proof_id', v_proof_id,
        'order_id', p_order_id,
        'status', 'pending_verification',
        'message', 'Comprobante enviado correctamente. Tu pago está pendiente de verificación.'
    );
END;
$$;

-- 4. Conceder permisos de ejecución para compradores (anon y authenticated) y service_role
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(UUID, TEXT, TEXT, INTEGER, VARCHAR, TEXT) TO anon, authenticated, service_role;



-- ==========================================
-- FILE: 016_preserve_buyer_data_on_order_creation.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 016: PRESERVACIÓN DE DATOS DE COMPRADOR EXISTENTE EN CREACIÓN DE ÓRDENES
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================
-- Esta migración actualiza create_order_secure para:
-- 1. NO sobreescribir datos de contacto existentes (nombre, teléfono, email, ciudad)
--    cuando un comprador recurrente realiza una nueva compra con el mismo document_id.
-- 2. Reutilizar de forma atómica el buyer_id existente para vincularlo a la nueva orden.
-- 3. Crear el registro en public.buyers únicamente si el document_id no existe previamente.
-- 4. Mantener intactas las validaciones transaccionales, cálculo de precio y bloqueo FOR UPDATE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_order_secure(
    p_raffle_id UUID,
    p_ticket_numbers TEXT[],
    p_buyer_data JSONB,
    p_payment_method VARCHAR DEFAULT 'transfer_manual',
    p_contact_preference VARCHAR DEFAULT 'both'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_raffle RECORD;
    v_buyer_id UUID;
    v_order_id UUID;
    v_reference VARCHAR(50);
    v_total_amount NUMERIC(12, 2);
    v_ticket_count INTEGER;
    v_available_count INTEGER;
    v_failed_numbers TEXT[];
    v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '10 minutes';
    v_doc_id TEXT;
    v_full_name TEXT;
    v_phone TEXT;
    v_email TEXT;
    v_city TEXT;
BEGIN
    -- 1. Validaciones básicas de parámetros
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El identificador de la rifa es requerido.');
    END IF;

    v_ticket_count := COALESCE(array_length(p_ticket_numbers, 1), 0);
    IF v_ticket_count <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Debe seleccionar al menos un número de boleto.');
    END IF;

    -- 2. Consultar la rifa oficial y obtener ticket_price directamente de la base de datos
    SELECT id, title, ticket_price, max_tickets_per_buyer, status
    INTO v_raffle
    FROM public.raffles
    WHERE id = p_raffle_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe.');
    END IF;

    IF v_raffle.status NOT IN ('active') THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa no se encuentra activa para la venta.');
    END IF;

    IF v_ticket_count > v_raffle.max_tickets_per_buyer THEN
        RETURN jsonb_build_object('success', false, 'error', 'Excede el límite máximo de ' || v_raffle.max_tickets_per_buyer || ' boletos por compra.');
    END IF;

    -- 3. Calcular total_amount exclusivamente en PostgreSQL (NUNCA desde el cliente)
    v_total_amount := v_raffle.ticket_price * v_ticket_count;

    -- 4. Extraer y validar datos del comprador
    v_doc_id := trim(COALESCE(p_buyer_data->>'documentId', p_buyer_data->>'document_id', ''));
    v_full_name := trim(COALESCE(p_buyer_data->>'fullName', p_buyer_data->>'full_name', ''));
    v_phone := trim(COALESCE(p_buyer_data->>'phone', ''));
    v_email := lower(trim(COALESCE(p_buyer_data->>'email', '')));
    v_city := trim(COALESCE(p_buyer_data->>'city', 'Manaure'));

    IF v_doc_id = '' OR v_full_name = '' OR v_phone = '' OR v_email = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Todos los datos del comprador son obligatorios (nombre, cédula, celular y correo).');
    END IF;

    -- Inserción segura con preservación de datos existentes (DO NOTHING en conflicto)
    INSERT INTO public.buyers (full_name, document_id, phone, email, city, updated_at)
    VALUES (v_full_name, v_doc_id, v_phone, v_email, v_city, NOW())
    ON CONFLICT (document_id) DO NOTHING
    RETURNING id INTO v_buyer_id;

    -- Si ya existía el comprador, recuperar su id sin modificar sus datos originales
    IF v_buyer_id IS NULL THEN
        SELECT id INTO v_buyer_id
        FROM public.buyers
        WHERE document_id = v_doc_id;
    END IF;

    -- 5. Liberar reservas expiradas antes de verificar
    PERFORM public.release_expired_reservations();

    -- 6. Bloqueo atómico FOR UPDATE de boletos disponibles
    WITH locked_tickets AS (
        SELECT id, number
        FROM public.tickets
        WHERE raffle_id = p_raffle_id
          AND number = ANY(p_ticket_numbers)
          AND (status = 'available' OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW()))
        FOR UPDATE
    )
    SELECT count(*), array_agg(number)
    INTO v_available_count, v_failed_numbers
    FROM locked_tickets;

    IF v_available_count < v_ticket_count THEN
        SELECT array_agg(num)
        INTO v_failed_numbers
        FROM unnest(p_ticket_numbers) AS num
        WHERE num NOT IN (
            SELECT number FROM public.tickets
            WHERE raffle_id = p_raffle_id
              AND number = ANY(p_ticket_numbers)
              AND (status = 'available' OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW()))
        );

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Uno o más números ya no se encuentran disponibles.',
            'failed_numbers', COALESCE(v_failed_numbers, ARRAY[]::TEXT[])
        );
    END IF;

    -- 7. Generar referencia única de orden
    v_reference := 'MV-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));

    -- 8. Insertar orden con total calculado en backend
    INSERT INTO public.orders (
        raffle_id,
        buyer_id,
        reference,
        total_amount,
        ticket_count,
        status,
        payment_method,
        contact_preference
    ) VALUES (
        p_raffle_id,
        v_buyer_id,
        v_reference,
        v_total_amount,
        v_ticket_count,
        'pending',
        COALESCE(p_payment_method, 'transfer_manual'),
        COALESCE(p_contact_preference, 'both')
    )
    RETURNING id INTO v_order_id;

    -- 9. Asignar boletos a la orden y establecer expiración de 10 min
    UPDATE public.tickets
    SET status = 'reserved',
        reserved_at = NOW(),
        reservation_expires_at = v_expires_at,
        buyer_id = v_buyer_id,
        order_id = v_order_id,
        updated_at = NOW()
    WHERE raffle_id = p_raffle_id
      AND number = ANY(p_ticket_numbers);

    -- 10. Registrar auditoría inmutable
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        'ORDER_CREATED_SECURE',
        'order',
        v_order_id::TEXT,
        jsonb_build_object(
            'reference', v_reference,
            'raffle_id', p_raffle_id,
            'buyer_id', v_buyer_id,
            'ticket_count', v_ticket_count,
            'ticket_price', v_raffle.ticket_price,
            'total_amount', v_total_amount,
            'contact_preference', p_contact_preference,
            'ticket_numbers', p_ticket_numbers
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'reference', v_reference,
        'buyer_id', v_buyer_id,
        'total_amount', v_total_amount,
        'ticket_count', v_ticket_count,
        'reservation_expires_at', v_expires_at
    );
END;
$$;

-- Permisos de ejecución para clientes y backend
GRANT EXECUTE ON FUNCTION public.create_order_secure(UUID, TEXT[], JSONB, VARCHAR, VARCHAR) TO anon, authenticated, service_role;



-- ==========================================
-- FILE: 017_fix_admin_users_rls_recursion.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 017: CORRECCIÓN DE RECURSIÓN INFINITA EN POLÍTICAS RLS DE ADMIN_USERS
-- ============================================================================

-- 1. Redefinir is_admin como SECURITY DEFINER con search_path explícito
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = p_user_id OR email = (SELECT email FROM auth.users WHERE id = p_user_id))
      AND is_active = true
  );
END;
$$;

-- 2. Función auxiliar is_superadmin SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.is_superadmin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = p_user_id OR email = (SELECT email FROM auth.users WHERE id = p_user_id))
      AND role = 'superadmin'
      AND is_active = true
  );
END;
$$;

-- 3. Eliminar políticas con recursión infinita en admin_users
DROP POLICY IF EXISTS "Admins pueden consultar su propio perfil" ON public.admin_users;
DROP POLICY IF EXISTS "Superadmins pueden gestionar administradores" ON public.admin_users;
DROP POLICY IF EXISTS "Permitir lectura de perfil de admin" ON public.admin_users;

-- 4. Crear política SELECT directa (sin auto-invocar consultas a admin_users)
CREATE POLICY "Admins pueden consultar su propio perfil" ON public.admin_users
    FOR SELECT TO authenticated
    USING (
      user_id = auth.uid()
      OR LOWER(email) = LOWER(COALESCE(auth.jwt()->>'email', ''))
      OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
    );

-- 5. Crear política ALL para superadministradores (usando la función SECURITY DEFINER)
CREATE POLICY "Superadmins pueden gestionar administradores" ON public.admin_users
    FOR ALL TO authenticated
    USING (
      public.is_superadmin(auth.uid())
    )
    WITH CHECK (
      public.is_superadmin(auth.uid())
    );

-- 6. Otorgar permisos
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin(UUID) TO authenticated, service_role;



-- ==========================================
-- FILE: 018_enable_supabase_realtime.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 018: CONFIGURAR RÉPLICA COMPLETA PARA REALTIME (TICKETS Y ORDERS)
-- ============================================================================
-- NOTA DE PERMISOS EN SUPABASE:
-- En Supabase, la publicación 'supabase_realtime' es propiedad del rol del sistema
-- 'supabase_admin'. Ejecutar 'ALTER PUBLICATION supabase_realtime ADD TABLE ...'
-- desde el SQL Editor genera el error 42501 (must be owner of publication).
--
-- PASO MANUAL EN EL DASHBOARD DE SUPABASE (Toma 15 segundos):
-- 1. En el menú lateral izquierdo, ve a Database -> Publications.
-- 2. Haz clic en 'supabase_realtime'.
-- 3. Activa los interruptores (toggles) para 'tickets' y 'orders'.
--    (También se puede en Table Editor -> editar tabla -> activar 'Enable Realtime').
--
-- SQL REQUERIDO (REPLICA IDENTITY):
-- Este comando sí pertenece al dueño de las tablas ('postgres') y es indispensable
-- para que Realtime envíe la fila completa en cada UPDATE / DELETE:
-- ============================================================================

ALTER TABLE public.tickets REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- Consulta de sólo lectura para verificar que ambas tablas están en Realtime:
-- SELECT tablename 
-- FROM pg_publication_tables 
-- WHERE pubname = 'supabase_realtime' 
--   AND schemaname = 'public' 
--   AND tablename IN ('tickets', 'orders');


-- ==========================================
-- FILE: 019_admin_buyer_management.sql
-- ==========================================
-- ============================================================================
-- MIGRACIÓN 019: GESTIÓN ADMINISTRATIVA DE COMPRADORES
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Política RLS de SELECT para administradores en public.buyers
DROP POLICY IF EXISTS "Lectura de compradores para administradores" ON public.buyers;
CREATE POLICY "Lectura de compradores para administradores" ON public.buyers
    FOR SELECT
    TO authenticated
    USING (public.is_admin(auth.uid()));

-- 2. Función RPC administrativa para actualizar datos de contacto de un comprador
-- con SECURITY DEFINER y validación estricta de rol de administrador.
CREATE OR REPLACE FUNCTION public.admin_update_buyer(
    p_buyer_id UUID,
    p_full_name TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_city TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_buyer RECORD;
    v_clean_name TEXT;
    v_clean_phone TEXT;
    v_clean_email TEXT;
    v_clean_city TEXT;
BEGIN
    -- 1. Validación de autorización administrativa
    IF NOT public.is_admin(auth.uid()) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: se requieren privilegios de administrador.'
        );
    END IF;

    -- 2. Sanitización y validación de campos obligatorios
    v_clean_name  := TRIM(COALESCE(p_full_name, ''));
    v_clean_phone := TRIM(COALESCE(p_phone, ''));
    v_clean_email := LOWER(TRIM(COALESCE(p_email, '')));
    v_clean_city  := TRIM(COALESCE(p_city, ''));

    IF v_clean_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El nombre completo es obligatorio.');
    END IF;

    IF v_clean_phone = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El número de teléfono es obligatorio.');
    END IF;

    IF v_clean_email = '' OR v_clean_email NOT LIKE '%_@_%._%' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El correo electrónico suministrado no tiene un formato válido.');
    END IF;

    IF v_clean_city = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El municipio o ciudad es obligatorio.');
    END IF;

    -- 3. Bloqueo pesimista del registro del comprador
    SELECT * INTO v_buyer
    FROM public.buyers
    WHERE id = p_buyer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El comprador especificado no existe en la base de datos.'
        );
    END IF;

    -- 4. Actualización del comprador
    UPDATE public.buyers
    SET full_name = v_clean_name,
        phone = v_clean_phone,
        email = v_clean_email,
        city = v_clean_city,
        updated_at = NOW()
    WHERE id = p_buyer_id;

    -- 5. Registrar evento en la bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'BUYER_UPDATED',
        'buyers',
        p_buyer_id::TEXT,
        auth.uid(),
        jsonb_build_object(
            'document_id', v_buyer.document_id,
            'old_full_name', v_buyer.full_name,
            'new_full_name', v_clean_name,
            'old_phone', v_buyer.phone,
            'new_phone', v_clean_phone,
            'old_email', v_buyer.email,
            'new_email', v_clean_email,
            'old_city', v_buyer.city,
            'new_city', v_clean_city
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'buyer_id', p_buyer_id,
        'full_name', v_clean_name,
        'document_id', v_buyer.document_id,
        'phone', v_clean_phone,
        'email', v_clean_email,
        'city', v_clean_city
    );
END;
$$;

-- 3. Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.admin_update_buyer(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;



-- ==========================================
-- FILE: 020_admin_raffle_management.sql
-- ==========================================
-- ==============================================================================
-- Migración 020: Gestión Administrativa de Rifas y Sorteos (RPCs + Auditoría)
-- ==============================================================================

-- 1. Asegurar políticas RLS para la tabla raffles
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'raffles' 
        AND policyname = 'Lectura pública de rifas'
    ) THEN
        CREATE POLICY "Lectura pública de rifas" 
        ON public.raffles FOR SELECT 
        TO public 
        USING (true);
    END IF;
END;
$$;

-- 2. Eliminar sobrecargas previas para evitar conflictos de firmas duplicadas (error 42725)
DROP FUNCTION IF EXISTS public.admin_update_raffle(UUID, VARCHAR, TEXT, NUMERIC, TIMESTAMPTZ, VARCHAR, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS public.admin_update_raffle(UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.admin_create_raffle(VARCHAR, VARCHAR, TEXT, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.admin_create_raffle(TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT);

-- 3. Función RPC Única para Actualizar Parámetros de una Rifa (admin_update_raffle)
CREATE OR REPLACE FUNCTION public.admin_update_raffle(
    p_raffle_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_ticket_price NUMERIC,
    p_draw_date TIMESTAMPTZ,
    p_lottery_reference TEXT,
    p_status TEXT,
    p_max_tickets_per_buyer INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_old_raffle public.raffles%ROWTYPE;
    v_new_raffle public.raffles%ROWTYPE;
    v_title_clean VARCHAR(255);
    v_desc_clean TEXT;
    v_lottery_clean VARCHAR(150);
BEGIN
    -- Validar privilegios administrativos
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden modificar rifas.'
        );
    END IF;

    -- Validar ID
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El ID de la rifa es obligatorio.');
    END IF;

    -- Sanitizar y validar campos de texto
    v_title_clean := NULLIF(TRIM(p_title), '');
    v_desc_clean := NULLIF(TRIM(p_description), '');
    v_lottery_clean := NULLIF(TRIM(p_lottery_reference), '');

    IF v_title_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El título de la rifa no puede estar vacío.');
    END IF;

    IF v_desc_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La descripción del premio no puede estar vacía.');
    END IF;

    IF v_lottery_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La lotería de referencia es obligatoria.');
    END IF;

    -- Validar precio y boletos máximos
    IF p_ticket_price IS NULL OR p_ticket_price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El precio del boleto debe ser mayor a 0 COP.');
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El límite máximo de boletos por comprador debe ser mayor a 0.');
    END IF;

    -- Validar fecha de sorteo
    IF p_draw_date IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La fecha del sorteo es obligatoria.');
    END IF;

    -- Validar estado
    IF p_status NOT IN ('draft', 'active', 'paused', 'closed', 'finished') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado de rifa inválido. Permitidos: draft, active, paused, closed, finished.');
    END IF;

    -- Obtener rifa actual con bloqueo pesimista
    SELECT * INTO v_old_raffle
    FROM public.raffles
    WHERE id = p_raffle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe en el sistema.');
    END IF;

    -- Si se activa esta rifa, asegurar que no existan otras activas al mismo tiempo
    IF p_status = 'active' AND v_old_raffle.status <> 'active' THEN
        UPDATE public.raffles
        SET status = 'paused',
            updated_at = NOW()
        WHERE id <> p_raffle_id AND status = 'active';
    END IF;

    -- Actualizar los parámetros de la rifa
    UPDATE public.raffles
    SET title = v_title_clean,
        description = v_desc_clean,
        ticket_price = p_ticket_price,
        draw_date = p_draw_date,
        lottery_reference = v_lottery_clean,
        status = p_status,
        max_tickets_per_buyer = p_max_tickets_per_buyer,
        updated_at = NOW()
    WHERE id = p_raffle_id
    RETURNING * INTO v_new_raffle;

    -- Registrar evento en la bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'RAFFLE_UPDATED',
        'raffles',
        p_raffle_id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'previous_values', jsonb_build_object(
                'title', v_old_raffle.title,
                'ticket_price', v_old_raffle.ticket_price,
                'draw_date', v_old_raffle.draw_date,
                'lottery_reference', v_old_raffle.lottery_reference,
                'status', v_old_raffle.status,
                'max_tickets_per_buyer', v_old_raffle.max_tickets_per_buyer
            ),
            'new_values', jsonb_build_object(
                'title', v_new_raffle.title,
                'ticket_price', v_new_raffle.ticket_price,
                'draw_date', v_new_raffle.draw_date,
                'lottery_reference', v_new_raffle.lottery_reference,
                'status', v_new_raffle.status,
                'max_tickets_per_buyer', v_new_raffle.max_tickets_per_buyer
            ),
            'updated_by_admin', v_admin_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'raffle', jsonb_build_object(
            'id', v_new_raffle.id,
            'title', v_new_raffle.title,
            'slug', v_new_raffle.slug,
            'description', v_new_raffle.description,
            'ticket_price', v_new_raffle.ticket_price,
            'total_tickets', v_new_raffle.total_tickets,
            'max_tickets_per_buyer', v_new_raffle.max_tickets_per_buyer,
            'draw_date', v_new_raffle.draw_date,
            'lottery_reference', v_new_raffle.lottery_reference,
            'status', v_new_raffle.status,
            'updated_at', v_new_raffle.updated_at
        )
    );
END;
$$;

-- 4. Función RPC para Crear una Nueva Rifa con Generación Automática de Boletos (admin_create_raffle)
CREATE OR REPLACE FUNCTION public.admin_create_raffle(
    p_title TEXT,
    p_slug TEXT,
    p_description TEXT,
    p_ticket_price NUMERIC,
    p_total_tickets INTEGER,
    p_max_tickets_per_buyer INTEGER,
    p_draw_date TIMESTAMPTZ,
    p_lottery_reference TEXT,
    p_status TEXT DEFAULT 'draft'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_new_raffle public.raffles%ROWTYPE;
    v_title_clean VARCHAR(255);
    v_slug_clean VARCHAR(100);
    v_desc_clean TEXT;
    v_lottery_clean VARCHAR(150);
    v_pad_length INTEGER := 3;
BEGIN
    -- Validar privilegios administrativos
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden crear rifas.'
        );
    END IF;

    -- Sanitizar y validar
    v_title_clean := NULLIF(TRIM(p_title), '');
    v_slug_clean := LOWER(TRIM(COALESCE(p_slug, '')));
    v_desc_clean := NULLIF(TRIM(p_description), '');
    v_lottery_clean := NULLIF(TRIM(p_lottery_reference), '');

    IF v_title_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El título de la rifa es obligatorio.');
    END IF;

    IF v_slug_clean = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El identificador slug es obligatorio.');
    END IF;

    IF v_desc_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La descripción del premio es obligatoria.');
    END IF;

    IF v_lottery_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La lotería de referencia es obligatoria.');
    END IF;

    IF p_ticket_price IS NULL OR p_ticket_price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El precio del boleto debe ser mayor a 0 COP.');
    END IF;

    IF p_total_tickets IS NULL OR p_total_tickets < 10 OR p_total_tickets > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'La emisión total de boletos debe estar entre 10 y 10.000 boletos.');
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El límite de boletos por comprador debe ser mayor a 0.');
    END IF;

    IF p_draw_date IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La fecha del sorteo es obligatoria.');
    END IF;

    IF p_status NOT IN ('draft', 'active', 'paused', 'closed', 'finished') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado de rifa inválido.');
    END IF;

    -- Verificar que el slug no exista
    IF EXISTS (SELECT 1 FROM public.raffles WHERE slug = v_slug_clean) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ya existe una rifa con el slug especificado: ' || v_slug_clean);
    END IF;

    -- Si la nueva rifa entra como activa, pausar las anteriores
    IF p_status = 'active' THEN
        UPDATE public.raffles
        SET status = 'paused',
            updated_at = NOW()
        WHERE status = 'active';
    END IF;

    -- Insertar la nueva rifa
    INSERT INTO public.raffles (
        title,
        slug,
        description,
        ticket_price,
        total_tickets,
        max_tickets_per_buyer,
        draw_date,
        lottery_reference,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_title_clean,
        v_slug_clean,
        v_desc_clean,
        p_ticket_price,
        p_total_tickets,
        p_max_tickets_per_buyer,
        p_draw_date,
        v_lottery_clean,
        p_status,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_raffle;

    -- Calcular el relleno de dígitos (3 dígitos para 1.000, 4 para 10.000, etc.)
    IF p_total_tickets > 1000 THEN
        v_pad_length := 4;
    ELSE
        v_pad_length := 3;
    END IF;

    -- Generar atómicamente todos los boletos para la nueva rifa (ej. 000 a 999)
    INSERT INTO public.tickets (raffle_id, number, status)
    SELECT
        v_new_raffle.id,
        LPAD(s::TEXT, v_pad_length, '0'),
        'available'
    FROM generate_series(0, p_total_tickets - 1) AS s
    ON CONFLICT (raffle_id, number) DO NOTHING;

    -- Registrar evento en la bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'RAFFLE_CREATED',
        'raffles',
        v_new_raffle.id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'title', v_new_raffle.title,
            'slug', v_new_raffle.slug,
            'ticket_price', v_new_raffle.ticket_price,
            'total_tickets', v_new_raffle.total_tickets,
            'draw_date', v_new_raffle.draw_date,
            'lottery_reference', v_new_raffle.lottery_reference,
            'status', v_new_raffle.status,
            'created_by_admin', v_admin_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'raffle', jsonb_build_object(
            'id', v_new_raffle.id,
            'title', v_new_raffle.title,
            'slug', v_new_raffle.slug,
            'description', v_new_raffle.description,
            'ticket_price', v_new_raffle.ticket_price,
            'total_tickets', v_new_raffle.total_tickets,
            'max_tickets_per_buyer', v_new_raffle.max_tickets_per_buyer,
            'draw_date', v_new_raffle.draw_date,
            'lottery_reference', v_new_raffle.lottery_reference,
            'status', v_new_raffle.status,
            'created_at', v_new_raffle.created_at
        )
    );
END;
$$;

-- 5. Permisos de ejecución para usuarios autenticados y service_role
GRANT EXECUTE ON FUNCTION public.admin_update_raffle(UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_raffle(TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT) TO authenticated, service_role;


-- ==========================================
-- FILE: 021_winners_management.sql
-- ==========================================
-- ==============================================================================
-- Migración 021: Gestión Oficial de Ganadores del Sorteo (Tabla, RPC y Storage)
-- ==============================================================================

-- 1. Crear tabla public.winners
CREATE TABLE IF NOT EXISTS public.winners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id UUID NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    ticket_number VARCHAR(10) NOT NULL,
    lottery_draw_number VARCHAR(20) NOT NULL,
    draw_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    official_act_url TEXT,
    delivery_photos TEXT[] DEFAULT '{}',
    notes TEXT,
    registered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_winners_raffle_id ON public.winners(raffle_id);
CREATE INDEX IF NOT EXISTS idx_winners_order_id ON public.winners(order_id);
CREATE INDEX IF NOT EXISTS idx_winners_buyer_id ON public.winners(buyer_id);
CREATE INDEX IF NOT EXISTS idx_winners_ticket_number ON public.winners(ticket_number);

-- 2. Habilitar RLS en public.winners
ALTER TABLE public.winners ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública (para mostrar ganadores en la web y panel)
DROP POLICY IF EXISTS "Lectura pública de ganadores" ON public.winners;
CREATE POLICY "Lectura pública de ganadores" 
ON public.winners FOR SELECT 
TO public 
USING (true);

-- Política de gestión total para administradores
DROP POLICY IF EXISTS "Administradores pueden gestionar ganadores" ON public.winners;
CREATE POLICY "Administradores pueden gestionar ganadores" 
ON public.winners FOR ALL 
TO authenticated 
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 3. Configurar Bucket de Storage 'winner-documents' para Actas y Fotos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'winner-documents',
    'winner-documents',
    true, -- Acceso de lectura pública para exhibir actas y fotos oficiales
    10485760, -- 10 MB máximo por archivo
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

-- Políticas de Storage para 'winner-documents'
DROP POLICY IF EXISTS "Lectura pública de documentos de ganadores" ON storage.objects;
CREATE POLICY "Lectura pública de documentos de ganadores" ON storage.objects
    FOR SELECT USING (bucket_id = 'winner-documents');

DROP POLICY IF EXISTS "Solo administradores pueden subir documentos de ganadores" ON storage.objects;
CREATE POLICY "Solo administradores pueden subir documentos de ganadores" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'winner-documents' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores pueden actualizar documentos de ganadores" ON storage.objects;
CREATE POLICY "Solo administradores pueden actualizar documentos de ganadores" ON storage.objects
    FOR UPDATE USING (bucket_id = 'winner-documents' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores pueden eliminar documentos de ganadores" ON storage.objects;
CREATE POLICY "Solo administradores pueden eliminar documentos de ganadores" ON storage.objects
    FOR DELETE USING (bucket_id = 'winner-documents' AND public.is_admin(auth.uid()));

-- 4. RPC para Registrar Ganador (register_winner) con SECURITY DEFINER
DROP FUNCTION IF EXISTS public.register_winner(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT[], TEXT);

CREATE OR REPLACE FUNCTION public.register_winner(
    p_raffle_id UUID,
    p_ticket_number TEXT,
    p_lottery_draw_number TEXT,
    p_draw_date TIMESTAMPTZ DEFAULT NOW(),
    p_official_act_url TEXT DEFAULT NULL,
    p_delivery_photos TEXT[] DEFAULT '{}',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_ticket RECORD;
    v_buyer_id UUID;
    v_order_id UUID;
    v_winner public.winners%ROWTYPE;
    v_raffle_title TEXT;
    v_clean_ticket_number TEXT;
    v_clean_lottery_number TEXT;
BEGIN
    -- 1. Validar autorización administrativa
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden registrar ganadores.'
        );
    END IF;

    -- 2. Validar parámetros requeridos
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El ID de la rifa es obligatorio.');
    END IF;

    v_clean_ticket_number := TRIM(COALESCE(p_ticket_number, ''));
    IF v_clean_ticket_number = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El número del boleto ganador es obligatorio.');
    END IF;

    v_clean_lottery_number := TRIM(COALESCE(p_lottery_draw_number, ''));
    IF v_clean_lottery_number = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El número de sorteo de la lotería oficial es obligatorio.');
    END IF;

    -- 3. Obtener título de la rifa
    SELECT title INTO v_raffle_title
    FROM public.raffles
    WHERE id = p_raffle_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe.');
    END IF;

    -- 4. Buscar el boleto con su orden y comprador asociado (Bloqueo pesimista)
    SELECT 
        t.id AS ticket_id,
        t.number AS ticket_number,
        t.status AS ticket_status,
        t.order_id AS ticket_order_id,
        t.buyer_id AS ticket_buyer_id,
        o.id AS order_id,
        o.buyer_id AS order_buyer_id,
        o.reference AS order_reference,
        o.status AS order_status,
        b.id AS buyer_id,
        b.full_name AS buyer_name,
        b.document_id AS buyer_document,
        b.phone AS buyer_phone,
        b.email AS buyer_email,
        b.city AS buyer_city
    INTO v_ticket
    FROM public.tickets t
    LEFT JOIN public.orders o ON o.id = t.order_id
    LEFT JOIN public.buyers b ON b.id = COALESCE(t.buyer_id, o.buyer_id)
    WHERE t.raffle_id = p_raffle_id 
      AND (t.number = v_clean_ticket_number OR t.number = LPAD(v_clean_ticket_number, 3, '0'))
    FOR UPDATE OF t;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El número de boleto "' || v_clean_ticket_number || '" no existe en la emisión de esta rifa.'
        );
    END IF;

    -- 5. Validar que el boleto esté efectivamente VENDIDO
    IF v_ticket.ticket_status <> 'sold' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto "' || v_ticket.ticket_number || '" no puede registrarse como ganador porque no está vendido (Estado actual: ' || v_ticket.ticket_status || '). Solo boletos con pago confirmado pueden ser ganadores.'
        );
    END IF;

    v_order_id := COALESCE(v_ticket.ticket_order_id, v_ticket.order_id);
    v_buyer_id := COALESCE(v_ticket.ticket_buyer_id, v_ticket.order_buyer_id, v_ticket.buyer_id);

    IF v_order_id IS NULL OR v_buyer_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No se encontró la orden de compra o los datos del comprador vinculados a este boleto.'
        );
    END IF;

    -- 6. Insertar el registro en public.winners
    INSERT INTO public.winners (
        raffle_id,
        order_id,
        buyer_id,
        ticket_id,
        ticket_number,
        lottery_draw_number,
        draw_date,
        official_act_url,
        delivery_photos,
        notes,
        registered_by,
        created_at,
        updated_at
    ) VALUES (
        p_raffle_id,
        v_order_id,
        v_buyer_id,
        v_ticket.ticket_id,
        v_ticket.ticket_number,
        v_clean_lottery_number,
        COALESCE(p_draw_date, NOW()),
        NULLIF(TRIM(p_official_act_url), ''),
        COALESCE(p_delivery_photos, '{}'),
        NULLIF(TRIM(p_notes), ''),
        v_admin_id,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_winner;

    -- 7. Actualizar el estado de la rifa a 'finished'
    UPDATE public.raffles
    SET status = 'finished',
        updated_at = NOW()
    WHERE id = p_raffle_id;

    -- 8. Registrar en la bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'WINNER_REGISTERED',
        'winners',
        v_winner.id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'raffle_id', p_raffle_id,
            'raffle_title', v_raffle_title,
            'ticket_number', v_ticket.ticket_number,
            'lottery_draw_number', v_clean_lottery_number,
            'buyer_id', v_buyer_id,
            'buyer_name', v_ticket.buyer_name,
            'buyer_document', v_ticket.buyer_document,
            'order_id', v_order_id,
            'order_reference', v_ticket.order_reference,
            'draw_date', v_winner.draw_date,
            'official_act_url', v_winner.official_act_url,
            'registered_by_admin', v_admin_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'winner_id', v_winner.id,
        'ticket_number', v_winner.ticket_number,
        'lottery_draw_number', v_winner.lottery_draw_number,
        'draw_date', v_winner.draw_date,
        'buyer_name', v_ticket.buyer_name,
        'buyer_document', v_ticket.buyer_document,
        'order_reference', v_ticket.order_reference,
        'message', '¡Ganador registrado exitosamente con toda su evidencia!'
    );
END;
$$;

-- 5. Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.register_winner(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT[], TEXT) TO authenticated, service_role;



-- ==========================================
-- FILE: 022_system_settings_management.sql
-- ==========================================
-- ==============================================================================
-- Migración 022: Gestión Dinámica de Parámetros Operativos del Sistema
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- 1. Crea la tabla public.system_settings (fila canónica id = 1)
-- 2. Habilita RLS con lectura pública y actualización restringida a administradores
-- 3. Crea la RPC admin_update_system_settings con SECURITY DEFINER y auditoría
-- 4. Actualiza reserve_tickets para leer la duración de reserva desde system_settings
-- 5. Actualiza create_order_secure para usar la duración y tope de boletos de system_settings
-- ==============================================================================

-- 1. Crear tabla de configuraciones del sistema (fila única garantizada)
CREATE TABLE IF NOT EXISTS public.system_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    reservation_duration_minutes INTEGER NOT NULL DEFAULT 10 CHECK (reservation_duration_minutes BETWEEN 1 AND 120),
    max_tickets_per_buyer INTEGER NOT NULL DEFAULT 20 CHECK (max_tickets_per_buyer BETWEEN 1 AND 1000),
    support_whatsapp_number VARCHAR(30) DEFAULT '573001234567',
    support_email VARCHAR(150) DEFAULT 'soporte@manaurevive.com',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Inserción inicial de valores por defecto si no existen
INSERT INTO public.system_settings (
    id,
    reservation_duration_minutes,
    max_tickets_per_buyer,
    support_whatsapp_number,
    support_email,
    updated_at
) VALUES (
    1,
    10,
    20,
    '573001234567',
    'soporte@manaurevive.com',
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 2. Habilitar RLS en public.system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de configuraciones operativas" ON public.system_settings;
CREATE POLICY "Lectura pública de configuraciones operativas"
ON public.system_settings FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "Administradores pueden gestionar configuraciones operativas" ON public.system_settings;
CREATE POLICY "Administradores pueden gestionar configuraciones operativas"
ON public.system_settings FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 3. RPC para Actualizar Configuraciones del Sistema (admin_update_system_settings)
DROP FUNCTION IF EXISTS public.admin_update_system_settings(INTEGER, INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_update_system_settings;

CREATE OR REPLACE FUNCTION public.admin_update_system_settings(
    p_reservation_duration_minutes INTEGER,
    p_max_tickets_per_buyer INTEGER,
    p_support_whatsapp_number TEXT,
    p_support_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_old_settings public.system_settings%ROWTYPE;
    v_new_settings public.system_settings%ROWTYPE;
    v_whatsapp_clean VARCHAR(30);
    v_email_clean VARCHAR(150);
BEGIN
    -- Validar privilegios administrativos
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden modificar los parámetros del sistema.'
        );
    END IF;

    -- Validaciones de rango
    IF p_reservation_duration_minutes IS NULL OR p_reservation_duration_minutes < 1 OR p_reservation_duration_minutes > 120 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El tiempo de reserva debe estar comprendido entre 1 y 120 minutos.'
        );
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer < 1 OR p_max_tickets_per_buyer > 1000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El límite de boletos por comprador debe estar comprendido entre 1 y 1.000 boletos.'
        );
    END IF;

    v_whatsapp_clean := NULLIF(TRIM(p_support_whatsapp_number), '');
    v_email_clean := NULLIF(LOWER(TRIM(p_support_email)), '');

    -- Bloquear y obtener estado anterior para la bitácora
    SELECT * INTO v_old_settings
    FROM public.system_settings
    WHERE id = 1
    FOR UPDATE;

    -- Upsert canónico en id = 1
    INSERT INTO public.system_settings (
        id,
        reservation_duration_minutes,
        max_tickets_per_buyer,
        support_whatsapp_number,
        support_email,
        updated_at,
        updated_by
    ) VALUES (
        1,
        p_reservation_duration_minutes,
        p_max_tickets_per_buyer,
        v_whatsapp_clean,
        v_email_clean,
        NOW(),
        v_admin_id
    )
    ON CONFLICT (id) DO UPDATE SET
        reservation_duration_minutes = EXCLUDED.reservation_duration_minutes,
        max_tickets_per_buyer = EXCLUDED.max_tickets_per_buyer,
        support_whatsapp_number = EXCLUDED.support_whatsapp_number,
        support_email = EXCLUDED.support_email,
        updated_at = NOW(),
        updated_by = v_admin_id
    RETURNING * INTO v_new_settings;

    -- Registrar evento en la bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'SYSTEM_SETTINGS_UPDATED',
        'system_settings',
        '1',
        v_admin_id,
        jsonb_build_object(
            'previous_values', jsonb_build_object(
                'reservation_duration_minutes', v_old_settings.reservation_duration_minutes,
                'max_tickets_per_buyer', v_old_settings.max_tickets_per_buyer,
                'support_whatsapp_number', v_old_settings.support_whatsapp_number,
                'support_email', v_old_settings.support_email
            ),
            'new_values', jsonb_build_object(
                'reservation_duration_minutes', v_new_settings.reservation_duration_minutes,
                'max_tickets_per_buyer', v_new_settings.max_tickets_per_buyer,
                'support_whatsapp_number', v_new_settings.support_whatsapp_number,
                'support_email', v_new_settings.support_email
            )
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'settings', jsonb_build_object(
            'id', v_new_settings.id,
            'reservation_duration_minutes', v_new_settings.reservation_duration_minutes,
            'max_tickets_per_buyer', v_new_settings.max_tickets_per_buyer,
            'support_whatsapp_number', v_new_settings.support_whatsapp_number,
            'support_email', v_new_settings.support_email,
            'updated_at', v_new_settings.updated_at,
            'updated_by', v_new_settings.updated_by
        ),
        'message', 'Parámetros del sistema actualizados exitosamente.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_system_settings(INTEGER, INTEGER, TEXT, TEXT) TO authenticated, service_role;

-- 4. Actualizar función RPC reserve_tickets para leer dinámicamente desde system_settings
CREATE OR REPLACE FUNCTION public.reserve_tickets(
    p_raffle_id UUID,
    p_ticket_numbers TEXT[],
    p_buyer_id UUID,
    p_duration_minutes INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_sys_duration INTEGER;
    v_effective_duration INTEGER;
    v_expires_at TIMESTAMPTZ;
    v_available_count INTEGER;
    v_requested_count INTEGER := array_length(p_ticket_numbers, 1);
    v_failed_numbers TEXT[];
BEGIN
    -- Obtener la duración configurada en system_settings (por defecto 10 minutos si no existe fila)
    SELECT reservation_duration_minutes INTO v_sys_duration
    FROM public.system_settings
    WHERE id = 1;

    v_effective_duration := COALESCE(p_duration_minutes, v_sys_duration, 10);
    v_expires_at := v_now + (v_effective_duration || ' minutes')::INTERVAL;

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

    -- 3. Aplicar la reserva atómica con la expiración calculada
    -- IMPORTANTE: Solo afecta a esta nueva reserva, no altera reservas ya en curso
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

GRANT EXECUTE ON FUNCTION public.reserve_tickets(UUID, TEXT[], UUID, INTEGER) TO anon, authenticated, service_role;

-- 5. Actualizar función RPC create_order_secure para usar system_settings
CREATE OR REPLACE FUNCTION public.create_order_secure(
    p_raffle_id UUID,
    p_ticket_numbers TEXT[],
    p_buyer_data JSONB,
    p_payment_method VARCHAR(30) DEFAULT 'transfer_manual',
    p_contact_preference VARCHAR(20) DEFAULT 'both'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_raffle RECORD;
    v_sys_duration INTEGER;
    v_sys_max_tickets INTEGER;
    v_allowed_max_tickets INTEGER;
    v_buyer_id UUID;
    v_order_id UUID;
    v_reference VARCHAR(50);
    v_total_amount NUMERIC(12, 2);
    v_ticket_count INTEGER;
    v_available_count INTEGER;
    v_failed_numbers TEXT[];
    v_expires_at TIMESTAMPTZ;
    v_doc_id TEXT;
    v_full_name TEXT;
    v_phone TEXT;
    v_email TEXT;
    v_city TEXT;
BEGIN
    -- 1. Validaciones básicas de parámetros
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El identificador de la rifa es requerido.');
    END IF;

    v_ticket_count := COALESCE(array_length(p_ticket_numbers, 1), 0);
    IF v_ticket_count <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Debe seleccionar al menos un número de boleto.');
    END IF;

    -- 2. Consultar parámetros globales de system_settings
    SELECT reservation_duration_minutes, max_tickets_per_buyer
    INTO v_sys_duration, v_sys_max_tickets
    FROM public.system_settings
    WHERE id = 1;

    v_sys_duration := COALESCE(v_sys_duration, 10);
    v_sys_max_tickets := COALESCE(v_sys_max_tickets, 20);
    v_expires_at := NOW() + (v_sys_duration || ' minutes')::INTERVAL;

    -- 3. Consultar la rifa oficial y obtener ticket_price directamente de la base de datos
    SELECT id, title, ticket_price, max_tickets_per_buyer, status
    INTO v_raffle
    FROM public.raffles
    WHERE id = p_raffle_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe.');
    END IF;

    IF v_raffle.status NOT IN ('active') THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa no se encuentra activa para la venta.');
    END IF;

    -- Validar tope de boletos (prioriza el de la rifa si está seteado, o el del sistema)
    v_allowed_max_tickets := COALESCE(v_raffle.max_tickets_per_buyer, v_sys_max_tickets, 20);
    IF v_ticket_count > v_allowed_max_tickets THEN
        RETURN jsonb_build_object('success', false, 'error', 'Excede el límite máximo de ' || v_allowed_max_tickets || ' boletos por compra.');
    END IF;

    -- 4. Calcular total_amount exclusivamente en PostgreSQL (NUNCA desde el cliente)
    v_total_amount := v_raffle.ticket_price * v_ticket_count;

    -- 5. Extraer y validar datos del comprador
    v_doc_id := trim(COALESCE(p_buyer_data->>'documentId', p_buyer_data->>'document_id', ''));
    v_full_name := trim(COALESCE(p_buyer_data->>'fullName', p_buyer_data->>'full_name', ''));
    v_phone := trim(COALESCE(p_buyer_data->>'phone', ''));
    v_email := lower(trim(COALESCE(p_buyer_data->>'email', '')));
    v_city := trim(COALESCE(p_buyer_data->>'city', 'Manaure'));

    IF v_doc_id = '' OR v_full_name = '' OR v_phone = '' OR v_email = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Todos los datos del comprador son obligatorios (nombre, cédula, celular y correo).');
    END IF;

    -- Inserción segura con preservación de datos existentes
    INSERT INTO public.buyers (full_name, document_id, phone, email, city, updated_at)
    VALUES (v_full_name, v_doc_id, v_phone, v_email, v_city, NOW())
    ON CONFLICT (document_id) DO NOTHING
    RETURNING id INTO v_buyer_id;

    IF v_buyer_id IS NULL THEN
        SELECT id INTO v_buyer_id
        FROM public.buyers
        WHERE document_id = v_doc_id;
    END IF;

    -- 6. Liberar reservas expiradas antes de verificar
    PERFORM public.release_expired_reservations();

    -- 7. Bloqueo atómico FOR UPDATE de boletos disponibles
    WITH locked_tickets AS (
        SELECT id, number
        FROM public.tickets
        WHERE raffle_id = p_raffle_id
          AND number = ANY(p_ticket_numbers)
          AND (status = 'available' OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW()))
        FOR UPDATE
    )
    SELECT count(*), array_agg(number)
    INTO v_available_count, v_failed_numbers
    FROM locked_tickets;

    IF v_available_count < v_ticket_count THEN
        SELECT array_agg(num)
        INTO v_failed_numbers
        FROM unnest(p_ticket_numbers) AS num
        WHERE num NOT IN (
            SELECT number FROM public.tickets
            WHERE raffle_id = p_raffle_id
              AND number = ANY(p_ticket_numbers)
              AND (status = 'available' OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW()))
        );

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Uno o más números ya no se encuentran disponibles.',
            'failed_numbers', COALESCE(v_failed_numbers, ARRAY[]::TEXT[])
        );
    END IF;

    -- 8. Generar referencia única de orden
    v_reference := 'MV-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));

    -- 9. Insertar orden con total calculado en backend
    INSERT INTO public.orders (
        raffle_id,
        buyer_id,
        reference,
        total_amount,
        ticket_count,
        status,
        payment_method,
        contact_preference
    ) VALUES (
        p_raffle_id,
        v_buyer_id,
        v_reference,
        v_total_amount,
        v_ticket_count,
        'pending',
        COALESCE(p_payment_method, 'transfer_manual'),
        COALESCE(p_contact_preference, 'both')
    )
    RETURNING id INTO v_order_id;

    -- 10. Asignar boletos a la orden con la expiración dinámica de system_settings
    -- IMPORTANTE: No toca reservas existentes de otras órdenes, solo esta nueva
    UPDATE public.tickets
    SET status = 'reserved',
        reserved_at = NOW(),
        reservation_expires_at = v_expires_at,
        buyer_id = v_buyer_id,
        order_id = v_order_id,
        updated_at = NOW()
    WHERE raffle_id = p_raffle_id
      AND number = ANY(p_ticket_numbers);

    -- 11. Registrar auditoría inmutable
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        'ORDER_CREATED_SECURE',
        'orders',
        v_order_id::TEXT,
        jsonb_build_object(
            'reference', v_reference,
            'buyer_id', v_buyer_id,
            'ticket_count', v_ticket_count,
            'total_amount', v_total_amount,
            'reservation_expires_at', v_expires_at,
            'reservation_duration_minutes', v_sys_duration
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'reference', v_reference,
        'buyer_id', v_buyer_id,
        'total_amount', v_total_amount,
        'ticket_count', v_ticket_count,
        'reservation_expires_at', v_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_secure(UUID, TEXT[], JSONB, VARCHAR, VARCHAR) TO anon, authenticated, service_role;



-- ==========================================
-- FILE: 023_security_hardening_linter_fixes.sql
-- ==========================================
-- ==============================================================================
-- Migración 023: Endurecimiento Integral de Seguridad y Corrección de Linter
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- Esta migración resuelve exhaustivamente las advertencias del Supabase Database Linter:
-- 1. function_search_path_mutable: Fija `SET search_path = public, pg_temp` en
--    todas las funciones, triggers y RPCs del sistema.
-- 2. rls_policy_always_true: Elimina las políticas INSERT públicas permisivas (WITH CHECK true)
--    en public.buyers y public.orders, restringiendo la inserción directa a administradores
--    y canalizando las compras de usuarios exclusivamente a través de create_order_secure.
-- 3. public_bucket_allows_listing: Restringe el SELECT en storage.objects para
--    los buckets 'receipts' y 'winner-documents' exclusivamente a administradores,
--    evitando el listado no autorizado del contenido del bucket mientras se
--    mantiene la descarga directa de archivos vía URLs públicas.
-- 4. anon_security_definer_function_executable & authenticated_security_definer_function_executable:
--    Revoca permisos de ejecución a PUBLIC y anon en todas las RPCs administrativas
--    y funciones trigger internas, concediendo acceso únicamente a roles autorizados.
-- ==============================================================================

-- ==============================================================================
-- SECCIÓN 1: CORRECCIÓN DE POLÍTICAS RLS EN TABLAS (rls_policy_always_true)
-- ==============================================================================

-- 1.1 Restringir inserción directa en public.buyers (solo administradores o RPCs con SECURITY DEFINER)
DROP POLICY IF EXISTS "Creación pública de compradores" ON public.buyers;
DROP POLICY IF EXISTS "Compradores pueden registrarse al crear orden" ON public.buyers;
DROP POLICY IF EXISTS "Solo administradores pueden insertar compradores directamente" ON public.buyers;

CREATE POLICY "Solo administradores pueden insertar compradores directamente"
ON public.buyers
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- 1.2 Restringir inserción directa en public.orders (solo administradores o RPCs con SECURITY DEFINER)
DROP POLICY IF EXISTS "Creación pública de órdenes" ON public.orders;
DROP POLICY IF EXISTS "Usuarios pueden crear orden" ON public.orders;
DROP POLICY IF EXISTS "Solo administradores pueden insertar órdenes directamente" ON public.orders;

CREATE POLICY "Solo administradores pueden insertar órdenes directamente"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));


-- ==============================================================================
-- SECCIÓN 2: CORRECCIÓN DE POLÍTICAS DE STORAGE (public_bucket_allows_listing)
-- ==============================================================================

-- 2.1 Bucket 'receipts': Eliminar SELECT público amplio y restringir a administradores
DROP POLICY IF EXISTS "Lectura pública de comprobantes" ON storage.objects;
DROP POLICY IF EXISTS "Administradores pueden listar y leer comprobantes" ON storage.objects;

CREATE POLICY "Administradores pueden listar y leer comprobantes"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'receipts' AND public.is_admin(auth.uid())
);

-- 2.2 Bucket 'winner-documents': Eliminar SELECT público amplio y restringir a administradores
DROP POLICY IF EXISTS "Lectura pública de documentos de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Administradores pueden listar y leer documentos de ganadores" ON storage.objects;

CREATE POLICY "Administradores pueden listar y leer documentos de ganadores"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'winner-documents' AND public.is_admin(auth.uid())
);


-- ==============================================================================
-- SECCIÓN 3: FUNCIONES TRIGGER INTERNAS CON search_path SEGURO Y PERMISOS ESTRICTOS
-- ==============================================================================

-- 3.1 Trigger fn_payment_proofs_updated_at
CREATE OR REPLACE FUNCTION public.fn_payment_proofs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_payment_proofs_updated_at() FROM PUBLIC, anon, authenticated;

-- 3.2 Trigger fn_payment_accounts_updated_at
CREATE OR REPLACE FUNCTION public.fn_payment_accounts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_payment_accounts_updated_at() FROM PUBLIC, anon, authenticated;

-- 3.3 Trigger fn_audit_payment_accounts
CREATE OR REPLACE FUNCTION public.fn_audit_payment_accounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_action VARCHAR(100);
    v_details JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'PAYMENT_ACCOUNT_CREATED';
        v_details := jsonb_build_object(
            'bank_name', NEW.bank_name,
            'account_type', NEW.account_type,
            'account_number', NEW.account_number,
            'account_holder', NEW.account_holder,
            'is_active', NEW.is_active,
            'display_order', NEW.display_order
        );
        INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
        VALUES (v_action, 'payment_account', NEW.id::TEXT, auth.uid(), v_details);
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
            v_action := CASE WHEN NEW.is_active THEN 'PAYMENT_ACCOUNT_ACTIVATED' ELSE 'PAYMENT_ACCOUNT_DEACTIVATED' END;
        ELSE
            v_action := 'PAYMENT_ACCOUNT_UPDATED';
        END IF;

        v_details := jsonb_build_object(
            'bank_name', NEW.bank_name,
            'account_type', NEW.account_type,
            'account_number', NEW.account_number,
            'account_holder', NEW.account_holder,
            'is_active_old', OLD.is_active,
            'is_active_new', NEW.is_active,
            'display_order', NEW.display_order
        );
        INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
        VALUES (v_action, 'payment_account', NEW.id::TEXT, auth.uid(), v_details);
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'PAYMENT_ACCOUNT_DELETED';
        v_details := jsonb_build_object(
            'bank_name', OLD.bank_name,
            'account_number', OLD.account_number,
            'account_holder', OLD.account_holder
        );
        INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
        VALUES (v_action, 'payment_account', OLD.id::TEXT, auth.uid(), v_details);
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_audit_payment_accounts() FROM PUBLIC, anon, authenticated;

-- 3.4 Trigger fn_validate_order_status_transition
CREATE OR REPLACE FUNCTION public.fn_validate_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- REGLA 1: No permitir transición directa de 'pending' a 'paid'/'completed' sin comprobante o referencia
    IF OLD.status = 'pending' AND NEW.status IN ('paid', 'completed') THEN
        IF NEW.receipt_url IS NULL AND NEW.payment_gateway_id IS NULL THEN
            RAISE EXCEPTION 'Transición inválida: No se puede aprobar una orden pendiente sin comprobante o referencia de pago.';
        END IF;
    END IF;

    -- REGLA 2: No permitir revertir una orden 'paid' o 'completed'
    IF OLD.status IN ('paid', 'completed') AND NEW.status IN ('pending', 'pending_verification', 'expired', 'rejected') THEN
        RAISE EXCEPTION 'Integridad violada: Una orden pagada y confirmada (%) no puede retroceder al estado %.', OLD.reference, NEW.status;
    END IF;

    -- REGLA 3: No permitir que órdenes 'expired', 'rejected' o 'cancelled' pasen a 'paid' directamente
    IF OLD.status IN ('expired', 'rejected', 'cancelled') AND NEW.status IN ('paid', 'completed') THEN
        RAISE EXCEPTION 'Integridad violada: Una orden % (%) no puede reactivarse directamente como pagada.', OLD.status, OLD.reference;
    END IF;

    -- Registro en auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'ORDER_STATUS_' || UPPER(NEW.status),
        'order',
        NEW.id::TEXT,
        NEW.verified_by,
        jsonb_build_object(
            'reference', NEW.reference,
            'previous_status', OLD.status,
            'new_status', NEW.status,
            'total_amount', NEW.total_amount,
            'ticket_count', NEW.ticket_count,
            'rejection_reason', NEW.rejection_reason,
            'receipt_url', NEW.receipt_url
        )
    );

    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_validate_order_status_transition() FROM PUBLIC, anon, authenticated;

-- 3.5 Trigger fn_validate_ticket_status_transition
CREATE OR REPLACE FUNCTION public.fn_validate_ticket_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_status VARCHAR(50);
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Ningún boleto puede marcarse como 'sold' si la orden no está en 'paid' o 'completed'
    IF NEW.status = 'sold' THEN
        IF NEW.order_id IS NULL THEN
            RAISE EXCEPTION 'Violación de Integridad: No se puede marcar el boleto % como "sold" sin asociarlo a una orden.', NEW.number;
        END IF;

        SELECT status INTO v_order_status
        FROM public.orders
        WHERE id = NEW.order_id;

        IF v_order_status IS NULL OR v_order_status NOT IN ('paid', 'completed') THEN
            RAISE EXCEPTION 'Violación de Seguridad: El boleto % no puede pasar a "sold" porque la orden asociada (%) se encuentra en estado "%". Solo se admite orden en estado "paid".', 
                NEW.number, NEW.order_id, COALESCE(v_order_status, 'inexistente');
        END IF;
    END IF;

    -- Limpiar reservas al volver a 'available'
    IF NEW.status = 'available' THEN
        NEW.reserved_at := NULL;
        NEW.reservation_expires_at := NULL;
        NEW.buyer_id := NULL;
        NEW.order_id := NULL;
    END IF;

    -- Registro en auditoría
    IF NEW.status = 'sold' OR (OLD.status = 'reserved' AND NEW.status = 'available' AND OLD.order_id IS NOT NULL) THEN
        INSERT INTO public.audit_logs (
            action,
            entity_type,
            entity_id,
            performed_by,
            details
        ) VALUES (
            'TICKET_' || UPPER(NEW.status),
            'ticket',
            NEW.id::TEXT,
            NULL,
            jsonb_build_object(
                'ticket_number', NEW.number,
                'previous_status', OLD.status,
                'new_status', NEW.status,
                'order_id', COALESCE(NEW.order_id, OLD.order_id)
            )
        );
    END IF;

    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_validate_ticket_status_transition() FROM PUBLIC, anon, authenticated;

-- 3.6 Trigger sync_admin_user_id
CREATE OR REPLACE FUNCTION public.sync_admin_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  UPDATE public.admin_users
  SET user_id = NEW.id,
      updated_at = NOW()
  WHERE LOWER(email) = LOWER(NEW.email)
    AND (user_id IS NULL OR user_id = NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_admin_user_id() FROM PUBLIC, anon, authenticated;


-- ==============================================================================
-- SECCIÓN 4: FUNCIONES DE VERIFICACIÓN DE ROL (is_admin, is_superadmin)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = p_user_id OR LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = p_user_id))
      AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = p_user_id OR LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = p_user_id))
      AND role = 'superadmin'
      AND is_active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_superadmin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin(UUID) TO authenticated, service_role;

-- ==============================================================================
-- LIMPIEZA DE FUNCIONES OBSOLETAS O REDUNDANTES
-- ==============================================================================
DROP FUNCTION IF EXISTS public.confirm_order_payment(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.confirm_order_payment(UUID);
DROP FUNCTION IF EXISTS public.confirm_order_payment;
DROP FUNCTION IF EXISTS public.submit_order_receipt(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.submit_order_receipt(UUID, TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.submit_order_receipt(UUID, TEXT);
DROP FUNCTION IF EXISTS public.rls_auto_enable() CASCADE;


-- ==============================================================================
-- SECCIÓN 5: RPCS ADMINISTRATIVAS (HARDENING search_path + REVOKE/GRANT)
-- ==============================================================================

-- 5.1 admin_block_ticket
CREATE OR REPLACE FUNCTION public.admin_block_ticket(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT 'Bloqueado preventivamente por administración'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ticket RECORD;
    v_order RECORD;
    v_admin_uid UUID := auth.uid();
BEGIN
    IF NOT public.is_admin(v_admin_uid) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: Se requieren privilegios de administrador.'
        );
    END IF;

    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Debe especificar un motivo claro para bloquear el boleto.'
        );
    END IF;

    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto especificado no existe.'
        );
    END IF;

    IF v_ticket.status = 'sold' THEN
        IF v_ticket.order_id IS NOT NULL THEN
            SELECT * INTO v_order
            FROM public.orders
            WHERE id = v_ticket.order_id;

            IF v_order.status IN ('paid', 'completed') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Acción bloqueada: No se puede modificar o bloquear un boleto ya vendido con orden pagada (' || v_order.reference || ').'
                );
            END IF;
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Acción bloqueada: No se puede bloquear un boleto marcado como vendido.'
            );
        END IF;
    END IF;

    IF v_ticket.status = 'blocked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto número ' || v_ticket.number || ' ya se encuentra bloqueado.'
        );
    END IF;

    UPDATE public.tickets
    SET
        status = 'blocked',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'TICKET_BLOCKED_BY_ADMIN',
        'ticket',
        p_ticket_id::TEXT,
        v_admin_uid,
        jsonb_build_object(
            'ticket_number', v_ticket.number,
            'previous_status', v_ticket.status,
            'new_status', 'blocked',
            'reason', TRIM(p_reason),
            'previous_order_id', v_ticket.order_id,
            'previous_buyer_id', v_ticket.buyer_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Boleto ' || v_ticket.number || ' bloqueado exitosamente.',
        'ticket_number', v_ticket.number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_block_ticket(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_block_ticket(UUID, TEXT) TO authenticated, service_role;

-- 5.2 admin_unblock_ticket
CREATE OR REPLACE FUNCTION public.admin_unblock_ticket(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT 'Desbloqueado por administración para habilitar venta'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ticket RECORD;
    v_admin_uid UUID := auth.uid();
BEGIN
    IF NOT public.is_admin(v_admin_uid) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: Se requieren privilegios de administrador.'
        );
    END IF;

    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto especificado no existe.'
        );
    END IF;

    IF v_ticket.status != 'blocked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto número ' || v_ticket.number || ' no está bloqueado (estado actual: ' || v_ticket.status || ').'
        );
    END IF;

    UPDATE public.tickets
    SET
        status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'TICKET_UNBLOCKED_BY_ADMIN',
        'ticket',
        p_ticket_id::TEXT,
        v_admin_uid,
        jsonb_build_object(
            'ticket_number', v_ticket.number,
            'previous_status', 'blocked',
            'new_status', 'available',
            'reason', TRIM(p_reason)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Boleto ' || v_ticket.number || ' desbloqueado y disponible para la venta.',
        'ticket_number', v_ticket.number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unblock_ticket(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unblock_ticket(UUID, TEXT) TO authenticated, service_role;

-- 5.3 admin_create_raffle
CREATE OR REPLACE FUNCTION public.admin_create_raffle(
    p_title TEXT,
    p_slug TEXT,
    p_description TEXT,
    p_ticket_price NUMERIC,
    p_total_tickets INTEGER,
    p_max_tickets_per_buyer INTEGER,
    p_draw_date TIMESTAMPTZ,
    p_lottery_reference TEXT,
    p_status TEXT DEFAULT 'draft'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_new_raffle public.raffles%ROWTYPE;
    v_title_clean VARCHAR(255);
    v_slug_clean VARCHAR(100);
    v_desc_clean TEXT;
    v_lottery_clean VARCHAR(150);
    v_pad_length INTEGER := 3;
BEGIN
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden crear rifas.'
        );
    END IF;

    v_title_clean := NULLIF(TRIM(p_title), '');
    v_slug_clean := LOWER(TRIM(COALESCE(p_slug, '')));
    v_desc_clean := NULLIF(TRIM(p_description), '');
    v_lottery_clean := NULLIF(TRIM(p_lottery_reference), '');

    IF v_title_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El título de la rifa es obligatorio.');
    END IF;

    IF v_slug_clean = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El identificador slug es obligatorio.');
    END IF;

    IF v_desc_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La descripción del premio es obligatoria.');
    END IF;

    IF v_lottery_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La lotería de referencia es obligatoria.');
    END IF;

    IF p_ticket_price IS NULL OR p_ticket_price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El precio del boleto debe ser mayor a 0 COP.');
    END IF;

    IF p_total_tickets IS NULL OR p_total_tickets <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'La emisión total de boletos debe ser mayor a 0.');
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El límite de boletos por comprador debe ser mayor a 0.');
    END IF;

    IF p_draw_date IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La fecha del sorteo es obligatoria.');
    END IF;

    IF p_status NOT IN ('draft', 'active', 'paused', 'closed', 'finished') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado de rifa inválido.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.raffles WHERE slug = v_slug_clean) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ya existe una rifa con el slug especificado: ' || v_slug_clean);
    END IF;

    IF p_status = 'active' THEN
        UPDATE public.raffles
        SET status = 'paused',
            updated_at = NOW()
        WHERE status = 'active';
    END IF;

    INSERT INTO public.raffles (
        title,
        slug,
        description,
        ticket_price,
        total_tickets,
        max_tickets_per_buyer,
        draw_date,
        lottery_reference,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_title_clean,
        v_slug_clean,
        v_desc_clean,
        p_ticket_price,
        p_total_tickets,
        p_max_tickets_per_buyer,
        p_draw_date,
        v_lottery_clean,
        p_status,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_raffle;

    -- Cálculo dinámico de dígitos de relleno (mínimo 3 dígitos ej. 000..999, o 4 dígitos para >= 1000)
    v_pad_length := GREATEST(LENGTH((p_total_tickets - 1)::TEXT), 3);

    INSERT INTO public.tickets (raffle_id, number, status)
    SELECT
        v_new_raffle.id,
        LPAD(s::TEXT, v_pad_length, '0'),
        'available'
    FROM generate_series(0, p_total_tickets - 1) AS s
    ON CONFLICT (raffle_id, number) DO NOTHING;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'RAFFLE_CREATED',
        'raffles',
        v_new_raffle.id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'title', v_new_raffle.title,
            'slug', v_new_raffle.slug,
            'ticket_price', v_new_raffle.ticket_price,
            'total_tickets', v_new_raffle.total_tickets,
            'draw_date', v_new_raffle.draw_date,
            'lottery_reference', v_new_raffle.lottery_reference,
            'status', v_new_raffle.status,
            'created_by_admin', v_admin_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'raffle', jsonb_build_object(
            'id', v_new_raffle.id,
            'title', v_new_raffle.title,
            'slug', v_new_raffle.slug,
            'description', v_new_raffle.description,
            'ticket_price', v_new_raffle.ticket_price,
            'total_tickets', v_new_raffle.total_tickets,
            'max_tickets_per_buyer', v_new_raffle.max_tickets_per_buyer,
            'draw_date', v_new_raffle.draw_date,
            'lottery_reference', v_new_raffle.lottery_reference,
            'status', v_new_raffle.status,
            'created_at', v_new_raffle.created_at
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_raffle(TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_raffle(TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT) TO authenticated, service_role;

-- 5.4 admin_update_raffle
CREATE OR REPLACE FUNCTION public.admin_update_raffle(
    p_raffle_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_ticket_price NUMERIC,
    p_draw_date TIMESTAMPTZ,
    p_lottery_reference TEXT,
    p_status TEXT,
    p_max_tickets_per_buyer INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_old_raffle public.raffles%ROWTYPE;
    v_new_raffle public.raffles%ROWTYPE;
    v_title_clean VARCHAR(255);
    v_desc_clean TEXT;
    v_lottery_clean VARCHAR(150);
BEGIN
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden modificar rifas.'
        );
    END IF;

    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El ID de la rifa es obligatorio.');
    END IF;

    v_title_clean := NULLIF(TRIM(p_title), '');
    v_desc_clean := NULLIF(TRIM(p_description), '');
    v_lottery_clean := NULLIF(TRIM(p_lottery_reference), '');

    IF v_title_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El título de la rifa no puede estar vacío.');
    END IF;

    IF v_desc_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La descripción del premio no puede estar vacía.');
    END IF;

    IF v_lottery_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La lotería de referencia es obligatoria.');
    END IF;

    IF p_ticket_price IS NULL OR p_ticket_price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El precio del boleto debe ser mayor a 0 COP.');
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El límite máximo de boletos por comprador debe ser mayor a 0.');
    END IF;

    IF p_draw_date IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La fecha del sorteo es obligatoria.');
    END IF;

    IF p_status NOT IN ('draft', 'active', 'paused', 'closed', 'finished') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado de rifa inválido. Permitidos: draft, active, paused, closed, finished.');
    END IF;

    SELECT * INTO v_old_raffle
    FROM public.raffles
    WHERE id = p_raffle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe en el sistema.');
    END IF;

    IF p_status = 'active' AND v_old_raffle.status <> 'active' THEN
        UPDATE public.raffles
        SET status = 'paused',
            updated_at = NOW()
        WHERE id <> p_raffle_id AND status = 'active';
    END IF;

    UPDATE public.raffles
    SET title = v_title_clean,
        description = v_desc_clean,
        ticket_price = p_ticket_price,
        draw_date = p_draw_date,
        lottery_reference = v_lottery_clean,
        status = p_status,
        max_tickets_per_buyer = p_max_tickets_per_buyer,
        updated_at = NOW()
    WHERE id = p_raffle_id
    RETURNING * INTO v_new_raffle;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'RAFFLE_UPDATED',
        'raffles',
        p_raffle_id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'previous_values', jsonb_build_object(
                'title', v_old_raffle.title,
                'ticket_price', v_old_raffle.ticket_price,
                'draw_date', v_old_raffle.draw_date,
                'lottery_reference', v_old_raffle.lottery_reference,
                'status', v_old_raffle.status,
                'max_tickets_per_buyer', v_old_raffle.max_tickets_per_buyer
            ),
            'new_values', jsonb_build_object(
                'title', v_new_raffle.title,
                'ticket_price', v_new_raffle.ticket_price,
                'draw_date', v_new_raffle.draw_date,
                'lottery_reference', v_new_raffle.lottery_reference,
                'status', v_new_raffle.status,
                'max_tickets_per_buyer', v_new_raffle.max_tickets_per_buyer
            ),
            'updated_by_admin', v_admin_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'raffle', jsonb_build_object(
            'id', v_new_raffle.id,
            'title', v_new_raffle.title,
            'slug', v_new_raffle.slug,
            'description', v_new_raffle.description,
            'ticket_price', v_new_raffle.ticket_price,
            'total_tickets', v_new_raffle.total_tickets,
            'max_tickets_per_buyer', v_new_raffle.max_tickets_per_buyer,
            'draw_date', v_new_raffle.draw_date,
            'lottery_reference', v_new_raffle.lottery_reference,
            'status', v_new_raffle.status,
            'updated_at', v_new_raffle.updated_at
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_raffle(UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_raffle(UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, INTEGER) TO authenticated, service_role;

-- 5.5 admin_update_buyer
CREATE OR REPLACE FUNCTION public.admin_update_buyer(
    p_buyer_id UUID,
    p_full_name TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_city TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_buyer RECORD;
    v_clean_name TEXT;
    v_clean_phone TEXT;
    v_clean_email TEXT;
    v_clean_city TEXT;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: se requieren privilegios de administrador.'
        );
    END IF;

    v_clean_name  := TRIM(COALESCE(p_full_name, ''));
    v_clean_phone := TRIM(COALESCE(p_phone, ''));
    v_clean_email := LOWER(TRIM(COALESCE(p_email, '')));
    v_clean_city  := TRIM(COALESCE(p_city, ''));

    IF v_clean_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El nombre completo es obligatorio.');
    END IF;

    IF v_clean_phone = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El número de teléfono es obligatorio.');
    END IF;

    IF v_clean_email = '' OR v_clean_email NOT LIKE '%_@_%._%' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El correo electrónico suministrado no tiene un formato válido.');
    END IF;

    IF v_clean_city = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El municipio o ciudad es obligatorio.');
    END IF;

    SELECT * INTO v_buyer
    FROM public.buyers
    WHERE id = p_buyer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El comprador especificado no existe en la base de datos.'
        );
    END IF;

    UPDATE public.buyers
    SET full_name = v_clean_name,
        phone = v_clean_phone,
        email = v_clean_email,
        city = v_clean_city,
        updated_at = NOW()
    WHERE id = p_buyer_id;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'BUYER_UPDATED',
        'buyers',
        p_buyer_id::TEXT,
        auth.uid(),
        jsonb_build_object(
            'document_id', v_buyer.document_id,
            'old_full_name', v_buyer.full_name,
            'new_full_name', v_clean_name,
            'old_phone', v_buyer.phone,
            'new_phone', v_clean_phone,
            'old_email', v_buyer.email,
            'new_email', v_clean_email,
            'old_city', v_buyer.city,
            'new_city', v_clean_city
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'buyer_id', p_buyer_id,
        'full_name', v_clean_name,
        'document_id', v_buyer.document_id,
        'phone', v_clean_phone,
        'email', v_clean_email,
        'city', v_clean_city
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_buyer(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_buyer(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 5.6 admin_update_system_settings
CREATE OR REPLACE FUNCTION public.admin_update_system_settings(
    p_reservation_duration_minutes INTEGER,
    p_max_tickets_per_buyer INTEGER,
    p_support_whatsapp_number TEXT,
    p_support_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_old_settings public.system_settings%ROWTYPE;
    v_new_settings public.system_settings%ROWTYPE;
    v_whatsapp_clean VARCHAR(30);
    v_email_clean VARCHAR(150);
BEGIN
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden modificar los parámetros del sistema.'
        );
    END IF;

    IF p_reservation_duration_minutes IS NULL OR p_reservation_duration_minutes < 1 OR p_reservation_duration_minutes > 120 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El tiempo de reserva debe estar comprendido entre 1 y 120 minutos.'
        );
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer < 1 OR p_max_tickets_per_buyer > 1000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El límite de boletos por comprador debe estar comprendido entre 1 y 1.000 boletos.'
        );
    END IF;

    v_whatsapp_clean := NULLIF(TRIM(p_support_whatsapp_number), '');
    v_email_clean := NULLIF(LOWER(TRIM(p_support_email)), '');

    SELECT * INTO v_old_settings
    FROM public.system_settings
    WHERE id = 1
    FOR UPDATE;

    INSERT INTO public.system_settings (
        id,
        reservation_duration_minutes,
        max_tickets_per_buyer,
        support_whatsapp_number,
        support_email,
        updated_at,
        updated_by
    ) VALUES (
        1,
        p_reservation_duration_minutes,
        p_max_tickets_per_buyer,
        v_whatsapp_clean,
        v_email_clean,
        NOW(),
        v_admin_id
    )
    ON CONFLICT (id) DO UPDATE SET
        reservation_duration_minutes = EXCLUDED.reservation_duration_minutes,
        max_tickets_per_buyer = EXCLUDED.max_tickets_per_buyer,
        support_whatsapp_number = EXCLUDED.support_whatsapp_number,
        support_email = EXCLUDED.support_email,
        updated_at = NOW(),
        updated_by = v_admin_id
    RETURNING * INTO v_new_settings;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'SYSTEM_SETTINGS_UPDATED',
        'system_settings',
        '1',
        v_admin_id,
        jsonb_build_object(
            'previous_values', jsonb_build_object(
                'reservation_duration_minutes', v_old_settings.reservation_duration_minutes,
                'max_tickets_per_buyer', v_old_settings.max_tickets_per_buyer,
                'support_whatsapp_number', v_old_settings.support_whatsapp_number,
                'support_email', v_old_settings.support_email
            ),
            'new_values', jsonb_build_object(
                'reservation_duration_minutes', v_new_settings.reservation_duration_minutes,
                'max_tickets_per_buyer', v_new_settings.max_tickets_per_buyer,
                'support_whatsapp_number', v_new_settings.support_whatsapp_number,
                'support_email', v_new_settings.support_email
            )
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'settings', jsonb_build_object(
            'id', v_new_settings.id,
            'reservation_duration_minutes', v_new_settings.reservation_duration_minutes,
            'max_tickets_per_buyer', v_new_settings.max_tickets_per_buyer,
            'support_whatsapp_number', v_new_settings.support_whatsapp_number,
            'support_email', v_new_settings.support_email,
            'updated_at', v_new_settings.updated_at,
            'updated_by', v_new_settings.updated_by
        ),
        'message', 'Parámetros del sistema actualizados exitosamente.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_system_settings(INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_system_settings(INTEGER, INTEGER, TEXT, TEXT) TO authenticated, service_role;

-- 5.7 approve_order_payment
CREATE OR REPLACE FUNCTION public.approve_order_payment(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_updated_tickets_count INTEGER;
    v_admin_id UUID;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador';
    END IF;

    v_admin_id := auth.uid();

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden ya se encuentra aprobada y pagada anteriormente.'
        );
    END IF;

    UPDATE public.orders
    SET status = 'paid',
        verified_at = NOW(),
        verified_by = v_admin_id,
        rejection_reason = NULL,
        updated_at = NOW()
    WHERE id = p_order_id;

    UPDATE public.payment_proofs
    SET status = 'approved',
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    GET DIAGNOSTICS v_updated_tickets_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'tickets_sold_count', v_updated_tickets_count,
        'message', 'Pago aprobado con éxito. Boletos marcados como vendidos definitivamente.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_order_payment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_order_payment(UUID) TO authenticated, service_role;

-- 5.8 reject_order_payment
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Comprobante no válido o transferencia no confirmada'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_released_tickets_count INTEGER;
    v_admin_id UUID;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador';
    END IF;

    v_admin_id := auth.uid();

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Una orden que ya fue pagada no puede ser rechazada arbitrariamente.'
        );
    END IF;

    UPDATE public.orders
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_at = NOW(),
        verified_by = v_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    UPDATE public.payment_proofs
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    UPDATE public.tickets
    SET status = 'available',
        buyer_id = NULL,
        order_id = NULL,
        reserved_at = NULL,
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    GET DIAGNOSTICS v_released_tickets_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected',
        'released_tickets_count', v_released_tickets_count,
        'message', 'Pago rechazado. Boletos liberados y disponibles para la venta.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_order_payment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(UUID, TEXT) TO authenticated, service_role;

-- 5.9 register_winner
CREATE OR REPLACE FUNCTION public.register_winner(
    p_raffle_id UUID,
    p_ticket_number TEXT,
    p_lottery_draw_number TEXT,
    p_draw_date TIMESTAMPTZ DEFAULT NOW(),
    p_official_act_url TEXT DEFAULT NULL,
    p_delivery_photos TEXT[] DEFAULT '{}',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_ticket RECORD;
    v_buyer_id UUID;
    v_order_id UUID;
    v_winner public.winners%ROWTYPE;
    v_raffle_title TEXT;
    v_clean_ticket_number TEXT;
    v_clean_lottery_number TEXT;
BEGIN
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden registrar ganadores.'
        );
    END IF;

    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El ID de la rifa es obligatorio.');
    END IF;

    v_clean_ticket_number := TRIM(COALESCE(p_ticket_number, ''));
    IF v_clean_ticket_number = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El número del boleto ganador es obligatorio.');
    END IF;

    v_clean_lottery_number := TRIM(COALESCE(p_lottery_draw_number, ''));
    IF v_clean_lottery_number = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El número de sorteo de la lotería oficial es obligatorio.');
    END IF;

    SELECT title INTO v_raffle_title
    FROM public.raffles
    WHERE id = p_raffle_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe.');
    END IF;

    SELECT 
        t.id AS ticket_id,
        t.number AS ticket_number,
        t.status AS ticket_status,
        t.order_id AS ticket_order_id,
        t.buyer_id AS ticket_buyer_id,
        o.id AS order_id,
        o.buyer_id AS order_buyer_id,
        o.reference AS order_reference,
        o.status AS order_status,
        b.id AS buyer_id,
        b.full_name AS buyer_name,
        b.document_id AS buyer_document,
        b.phone AS buyer_phone,
        b.email AS buyer_email,
        b.city AS buyer_city
    INTO v_ticket
    FROM public.tickets t
    LEFT JOIN public.orders o ON o.id = t.order_id
    LEFT JOIN public.buyers b ON b.id = COALESCE(t.buyer_id, o.buyer_id)
    WHERE t.raffle_id = p_raffle_id 
      AND (t.number = v_clean_ticket_number OR t.number = LPAD(v_clean_ticket_number, 3, '0'))
    FOR UPDATE OF t;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El número de boleto "' || v_clean_ticket_number || '" no existe en la emisión de esta rifa.'
        );
    END IF;

    IF v_ticket.ticket_status <> 'sold' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto "' || v_ticket.ticket_number || '" no puede registrarse como ganador porque no está vendido (Estado actual: ' || v_ticket.ticket_status || '). Solo boletos con pago confirmado pueden ser ganadores.'
        );
    END IF;

    v_order_id := COALESCE(v_ticket.ticket_order_id, v_ticket.order_id);
    v_buyer_id := COALESCE(v_ticket.ticket_buyer_id, v_ticket.order_buyer_id, v_ticket.buyer_id);

    IF v_order_id IS NULL OR v_buyer_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No se encontró la orden de compra o los datos del comprador vinculados a este boleto.'
        );
    END IF;

    INSERT INTO public.winners (
        raffle_id,
        order_id,
        buyer_id,
        ticket_id,
        ticket_number,
        lottery_draw_number,
        draw_date,
        official_act_url,
        delivery_photos,
        notes,
        registered_by,
        created_at,
        updated_at
    ) VALUES (
        p_raffle_id,
        v_order_id,
        v_buyer_id,
        v_ticket.ticket_id,
        v_ticket.ticket_number,
        v_clean_lottery_number,
        COALESCE(p_draw_date, NOW()),
        NULLIF(TRIM(p_official_act_url), ''),
        COALESCE(p_delivery_photos, '{}'),
        NULLIF(TRIM(p_notes), ''),
        v_admin_id,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_winner;

    UPDATE public.raffles
    SET status = 'finished',
        updated_at = NOW()
    WHERE id = p_raffle_id;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'WINNER_REGISTERED',
        'winners',
        v_winner.id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'raffle_id', p_raffle_id,
            'raffle_title', v_raffle_title,
            'ticket_number', v_ticket.ticket_number,
            'lottery_draw_number', v_clean_lottery_number,
            'buyer_id', v_buyer_id,
            'buyer_name', v_ticket.buyer_name,
            'buyer_document', v_ticket.buyer_document,
            'order_id', v_order_id,
            'order_reference', v_ticket.order_reference,
            'draw_date', v_winner.draw_date,
            'official_act_url', v_winner.official_act_url,
            'registered_by_admin', v_admin_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'winner_id', v_winner.id,
        'ticket_number', v_winner.ticket_number,
        'lottery_draw_number', v_winner.lottery_draw_number,
        'draw_date', v_winner.draw_date,
        'buyer_name', v_ticket.buyer_name,
        'buyer_document', v_ticket.buyer_document,
        'order_reference', v_ticket.order_reference,
        'message', '¡Ganador registrado exitosamente con toda su evidencia!'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.register_winner(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_winner(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT[], TEXT) TO authenticated, service_role;


-- ==============================================================================
-- SECCIÓN 6: RPCS PÚBLICAS CLIENTE (search_path SEGURO + PERMISOS PÚBLICOS)
-- ==============================================================================

-- 6.1 verify_public_order_or_tickets
CREATE OR REPLACE FUNCTION public.verify_public_order_or_tickets(p_search_term TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_term TEXT;
    v_is_reference BOOLEAN;
    v_is_numeric BOOLEAN;
    v_results JSONB := '[]'::jsonb;
BEGIN
    v_clean_term := TRIM(p_search_term);
    
    IF v_clean_term IS NULL OR v_clean_term = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El término de búsqueda no puede estar vacío.', 'orders', '[]'::jsonb);
    END IF;

    v_is_reference := (UPPER(v_clean_term) LIKE 'MV-%' OR v_clean_term ~* '[A-Z]');
    v_is_numeric := (v_clean_term ~ '^[0-9]+$');

    IF v_is_reference THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', o.id,
                    'reference', o.reference,
                    'status', o.status,
                    'createdAt', o.created_at,
                    'totalAmount', o.total_amount,
                    'ticketCount', o.ticket_count,
                    'rejectionReason', CASE WHEN o.status = 'rejected' THEN o.rejection_reason ELSE NULL END,
                    'maskedBuyerName', CASE 
                        WHEN b.full_name IS NULL OR b.full_name = '' THEN 'Comprador'
                        WHEN position(' ' in TRIM(b.full_name)) > 0 THEN 
                            split_part(TRIM(b.full_name), ' ', 1) || ' ' || substring(split_part(TRIM(b.full_name), ' ', 2) from 1 for 1) || '.'
                        ELSE 
                            TRIM(b.full_name)
                    END,
                    'maskedDocumentId', CASE
                        WHEN b.document_id IS NULL OR length(TRIM(b.document_id)) <= 4 THEN '***'
                        WHEN length(TRIM(b.document_id)) <= 6 THEN 
                            substring(TRIM(b.document_id) from 1 for 2) || '***' || substring(TRIM(b.document_id) from length(TRIM(b.document_id)) for 1)
                        ELSE
                            substring(TRIM(b.document_id) from 1 for 4) || '***' || substring(TRIM(b.document_id) from length(TRIM(b.document_id)) - 1 for 2)
                    END,
                    'raffle', jsonb_build_object(
                        'title', r.title,
                        'drawDate', r.draw_date,
                        'lotteryReference', r.lottery_reference
                    ),
                    'tickets', (
                        SELECT COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'number', t.number,
                                    'status', t.status
                                ) ORDER BY t.number ASC
                            ),
                            '[]'::jsonb
                        )
                        FROM public.tickets t
                        WHERE t.order_id = o.id
                    )
                ) ORDER BY o.created_at DESC
            ),
            '[]'::jsonb
        ) INTO v_results
        FROM public.orders o
        LEFT JOIN public.buyers b ON b.id = o.buyer_id
        LEFT JOIN public.raffles r ON r.id = o.raffle_id
        WHERE o.reference ILIKE '%' || v_clean_term || '%'
        LIMIT 5;

    ELSIF v_is_numeric THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', o.id,
                    'reference', o.reference,
                    'status', o.status,
                    'createdAt', o.created_at,
                    'totalAmount', o.total_amount,
                    'ticketCount', o.ticket_count,
                    'rejectionReason', CASE WHEN o.status = 'rejected' THEN o.rejection_reason ELSE NULL END,
                    'maskedBuyerName', CASE 
                        WHEN b.full_name IS NULL OR b.full_name = '' THEN 'Comprador'
                        WHEN position(' ' in TRIM(b.full_name)) > 0 THEN 
                            split_part(TRIM(b.full_name), ' ', 1) || ' ' || substring(split_part(TRIM(b.full_name), ' ', 2) from 1 for 1) || '.'
                        ELSE 
                            TRIM(b.full_name)
                    END,
                    'maskedDocumentId', CASE
                        WHEN b.document_id IS NULL OR length(TRIM(b.document_id)) <= 4 THEN '***'
                        WHEN length(TRIM(b.document_id)) <= 6 THEN 
                            substring(TRIM(b.document_id) from 1 for 2) || '***' || substring(TRIM(b.document_id) from length(TRIM(b.document_id)) for 1)
                        ELSE
                            substring(TRIM(b.document_id) from 1 for 4) || '***' || substring(TRIM(b.document_id) from length(TRIM(b.document_id)) - 1 for 2)
                    END,
                    'raffle', jsonb_build_object(
                        'title', r.title,
                        'drawDate', r.draw_date,
                        'lotteryReference', r.lottery_reference
                    ),
                    'tickets', (
                        SELECT COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'number', t.number,
                                    'status', t.status
                                ) ORDER BY t.number ASC
                            ),
                            '[]'::jsonb
                        )
                        FROM public.tickets t
                        WHERE t.order_id = o.id
                    )
                ) ORDER BY o.created_at DESC
            ),
            '[]'::jsonb
        ) INTO v_results
        FROM public.orders o
        JOIN public.buyers b ON b.id = o.buyer_id
        LEFT JOIN public.raffles r ON r.id = o.raffle_id
        WHERE b.document_id = v_clean_term
        LIMIT 10;
    ELSE
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', o.id,
                    'reference', o.reference,
                    'status', o.status,
                    'createdAt', o.created_at,
                    'totalAmount', o.total_amount,
                    'ticketCount', o.ticket_count,
                    'rejectionReason', CASE WHEN o.status = 'rejected' THEN o.rejection_reason ELSE NULL END,
                    'maskedBuyerName', CASE 
                        WHEN b.full_name IS NULL OR b.full_name = '' THEN 'Comprador'
                        WHEN position(' ' in TRIM(b.full_name)) > 0 THEN 
                            split_part(TRIM(b.full_name), ' ', 1) || ' ' || substring(split_part(TRIM(b.full_name), ' ', 2) from 1 for 1) || '.'
                        ELSE 
                            TRIM(b.full_name)
                    END,
                    'maskedDocumentId', CASE
                        WHEN b.document_id IS NULL OR length(TRIM(b.document_id)) <= 4 THEN '***'
                        WHEN length(TRIM(b.document_id)) <= 6 THEN 
                            substring(TRIM(b.document_id) from 1 for 2) || '***' || substring(TRIM(b.document_id) from length(TRIM(b.document_id)) for 1)
                        ELSE
                            substring(TRIM(b.document_id) from 1 for 4) || '***' || substring(TRIM(b.document_id) from length(TRIM(b.document_id)) - 1 for 2)
                    END,
                    'raffle', jsonb_build_object(
                        'title', r.title,
                        'drawDate', r.draw_date,
                        'lotteryReference', r.lottery_reference
                    ),
                    'tickets', (
                        SELECT COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'number', t.number,
                                    'status', t.status
                                ) ORDER BY t.number ASC
                            ),
                            '[]'::jsonb
                        )
                        FROM public.tickets t
                        WHERE t.order_id = o.id
                    )
                ) ORDER BY o.created_at DESC
            ),
            '[]'::jsonb
        ) INTO v_results
        FROM public.orders o
        LEFT JOIN public.buyers b ON b.id = o.buyer_id
        LEFT JOIN public.raffles r ON r.id = o.raffle_id
        WHERE o.reference ILIKE '%' || v_clean_term || '%'
        LIMIT 5;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'searchTerm', v_clean_term,
        'searchedBy', CASE WHEN v_is_reference THEN 'reference' ELSE 'document' END,
        'orders', v_results
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_public_order_or_tickets(TEXT) TO anon, authenticated, service_role;

-- 6.2 submit_payment_proof
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
    p_order_id UUID,
    p_file_path TEXT,
    p_file_name TEXT,
    p_file_size INTEGER,
    p_mime_type VARCHAR(100),
    p_payment_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_proof_id UUID;
BEGIN
    -- 1. Validar existencia y bloquear orden concurrentemente
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra especificada no existe en el sistema.'
        );
    END IF;

    -- 2. Validar estado correcto de la orden
    IF v_order.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden se encuentra en estado "' || v_order.status || '" y no admite nuevos comprobantes.'
        );
    END IF;

    -- 3. Validar correspondencia de la ruta del archivo con la orden objetivo
    IF NOT (
        p_file_path LIKE 'proofs/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE 'proofs/%/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE '%/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE 'data:image/%'
        OR p_file_path LIKE 'data:application/pdf%'
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La ruta del comprobante no corresponde al identificador de la orden que se intenta procesar.'
        );
    END IF;

    -- 4. Validar formato de archivo y tamaño (5 MB máximo)
    IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Formato de archivo no permitido. Solo se admiten JPG, PNG, WEBP o PDF.'
        );
    END IF;

    IF p_file_size > 5242880 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El archivo excede el tamaño máximo permitido de 5 MB.'
        );
    END IF;

    -- 5. Insertar registro en public.payment_proofs
    INSERT INTO public.payment_proofs (
        raffle_id,
        order_id,
        buyer_id,
        file_path,
        file_name,
        file_size,
        mime_type,
        status,
        payment_reference
    ) VALUES (
        v_order.raffle_id,
        p_order_id,
        v_order.buyer_id,
        p_file_path,
        p_file_name,
        p_file_size,
        p_mime_type,
        'pending',
        p_payment_reference
    )
    RETURNING id INTO v_proof_id;

    -- 6. Actualizar orden al estado 'pending_verification' y asociar el comprobante
    UPDATE public.orders
    SET receipt_url = p_file_path,
        payment_gateway_id = COALESCE(p_payment_reference, payment_gateway_id),
        status = 'pending_verification',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 7. Proteger los boletos vinculados a esta orden
    UPDATE public.tickets
    SET order_id = p_order_id,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    -- 8. Registrar evento en auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        'PAYMENT_PROOF_SUBMITTED',
        'order',
        p_order_id::TEXT,
        jsonb_build_object(
            'proof_id', v_proof_id,
            'reference', v_order.reference,
            'file_name', p_file_name,
            'file_size', p_file_size,
            'mime_type', p_mime_type,
            'payment_reference', p_payment_reference
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'proof_id', v_proof_id,
        'order_id', p_order_id,
        'status', 'pending_verification',
        'message', 'Comprobante enviado correctamente. Tu pago está pendiente de verificación.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_payment_proof(UUID, TEXT, TEXT, INTEGER, VARCHAR, TEXT) TO anon, authenticated, service_role;

-- 6.3 cancel_order
CREATE OR REPLACE FUNCTION public.cancel_order(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Cancelación por el usuario'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_tickets_released INTEGER;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Orden no encontrada.');
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se puede cancelar una orden ya pagada.');
    END IF;

    UPDATE public.orders
    SET status = 'cancelled',
        rejection_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_order_id;

    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_tickets_released = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'cancelled',
        'tickets_released', v_tickets_released
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID, TEXT) TO authenticated, service_role;

-- 6.4 release_expired_reservations
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_released_count INTEGER;
BEGIN
    UPDATE public.tickets t
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE t.status = 'reserved'
      AND t.reservation_expires_at < NOW()
      AND (
          t.order_id IS NULL 
          OR EXISTS (
              SELECT 1 FROM public.orders o
              WHERE o.id = t.order_id
                AND o.status = 'pending'
          )
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = t.order_id
            AND o.status IN ('pending_verification', 'paid', 'completed')
      );

    UPDATE public.orders o
    SET status = 'expired',
        updated_at = NOW()
    WHERE o.status = 'pending'
      AND NOT EXISTS (
          SELECT 1 FROM public.tickets t
          WHERE t.order_id = o.id AND t.status = 'reserved'
      );

    GET DIAGNOSTICS v_released_count = ROW_COUNT;
    RETURN v_released_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_reservations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO authenticated, service_role;

-- 6.6 reserve_tickets
CREATE OR REPLACE FUNCTION public.reserve_tickets(
    p_raffle_id UUID,
    p_ticket_numbers TEXT[],
    p_buyer_id UUID,
    p_duration_minutes INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_sys_duration INTEGER;
    v_effective_duration INTEGER;
    v_expires_at TIMESTAMPTZ;
    v_available_count INTEGER;
    v_requested_count INTEGER := array_length(p_ticket_numbers, 1);
    v_failed_numbers TEXT[];
BEGIN
    SELECT reservation_duration_minutes INTO v_sys_duration
    FROM public.system_settings
    WHERE id = 1;

    v_effective_duration := COALESCE(p_duration_minutes, v_sys_duration, 10);
    v_expires_at := v_now + (v_effective_duration || ' minutes')::INTERVAL;

    PERFORM public.release_expired_reservations();

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

GRANT EXECUTE ON FUNCTION public.reserve_tickets(UUID, TEXT[], UUID, INTEGER) TO anon, authenticated, service_role;

-- 6.7 create_order_secure
CREATE OR REPLACE FUNCTION public.create_order_secure(
    p_raffle_id UUID,
    p_ticket_numbers TEXT[],
    p_buyer_data JSONB,
    p_payment_method VARCHAR(30) DEFAULT 'transfer_manual',
    p_contact_preference VARCHAR(20) DEFAULT 'both'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_raffle RECORD;
    v_sys_duration INTEGER;
    v_sys_max_tickets INTEGER;
    v_allowed_max_tickets INTEGER;
    v_buyer_id UUID;
    v_order_id UUID;
    v_reference VARCHAR(50);
    v_total_amount NUMERIC(12, 2);
    v_ticket_count INTEGER;
    v_available_count INTEGER;
    v_failed_numbers TEXT[];
    v_expires_at TIMESTAMPTZ;
    v_doc_id TEXT;
    v_full_name TEXT;
    v_phone TEXT;
    v_email TEXT;
    v_city TEXT;
BEGIN
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El identificador de la rifa es requerido.');
    END IF;

    v_ticket_count := COALESCE(array_length(p_ticket_numbers, 1), 0);
    IF v_ticket_count <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Debe seleccionar al menos un número de boleto.');
    END IF;

    SELECT reservation_duration_minutes, max_tickets_per_buyer
    INTO v_sys_duration, v_sys_max_tickets
    FROM public.system_settings
    WHERE id = 1;

    v_sys_duration := COALESCE(v_sys_duration, 10);
    v_sys_max_tickets := COALESCE(v_sys_max_tickets, 20);
    v_expires_at := NOW() + (v_sys_duration || ' minutes')::INTERVAL;

    SELECT id, title, ticket_price, max_tickets_per_buyer, status
    INTO v_raffle
    FROM public.raffles
    WHERE id = p_raffle_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe.');
    END IF;

    IF v_raffle.status NOT IN ('active') THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa no se encuentra activa para la venta.');
    END IF;

    v_allowed_max_tickets := COALESCE(v_raffle.max_tickets_per_buyer, v_sys_max_tickets, 20);
    IF v_ticket_count > v_allowed_max_tickets THEN
        RETURN jsonb_build_object('success', false, 'error', 'Excede el límite máximo de ' || v_allowed_max_tickets || ' boletos por compra.');
    END IF;

    v_total_amount := v_raffle.ticket_price * v_ticket_count;

    v_doc_id := TRIM(COALESCE(p_buyer_data->>'documentId', p_buyer_data->>'document_id', ''));
    v_full_name := TRIM(COALESCE(p_buyer_data->>'fullName', p_buyer_data->>'full_name', ''));
    v_phone := TRIM(COALESCE(p_buyer_data->>'phone', ''));
    v_email := LOWER(TRIM(COALESCE(p_buyer_data->>'email', '')));
    v_city := TRIM(COALESCE(p_buyer_data->>'city', 'Manaure'));

    IF v_doc_id = '' OR v_full_name = '' OR v_phone = '' OR v_email = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Todos los datos del comprador son obligatorios (nombre, cédula, celular y correo).');
    END IF;

    INSERT INTO public.buyers (full_name, document_id, phone, email, city, updated_at)
    VALUES (v_full_name, v_doc_id, v_phone, v_email, v_city, NOW())
    ON CONFLICT (document_id) DO NOTHING
    RETURNING id INTO v_buyer_id;

    IF v_buyer_id IS NULL THEN
        SELECT id INTO v_buyer_id
        FROM public.buyers
        WHERE document_id = v_doc_id;
    END IF;

    PERFORM public.release_expired_reservations();

    WITH locked_tickets AS (
        SELECT id, number
        FROM public.tickets
        WHERE raffle_id = p_raffle_id
          AND number = ANY(p_ticket_numbers)
          AND (status = 'available' OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW()))
        FOR UPDATE
    )
    SELECT count(*), array_agg(number)
    INTO v_available_count, v_failed_numbers
    FROM locked_tickets;

    IF v_available_count < v_ticket_count THEN
        SELECT array_agg(num)
        INTO v_failed_numbers
        FROM unnest(p_ticket_numbers) AS num
        WHERE num NOT IN (
            SELECT number FROM public.tickets
            WHERE raffle_id = p_raffle_id
              AND number = ANY(p_ticket_numbers)
              AND (status = 'available' OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW()))
        );

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Uno o más números ya no se encuentran disponibles.',
            'failed_numbers', COALESCE(v_failed_numbers, ARRAY[]::TEXT[])
        );
    END IF;

    v_reference := 'MV-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));

    INSERT INTO public.orders (
        raffle_id,
        buyer_id,
        reference,
        total_amount,
        ticket_count,
        status,
        payment_method,
        contact_preference
    ) VALUES (
        p_raffle_id,
        v_buyer_id,
        v_reference,
        v_total_amount,
        v_ticket_count,
        'pending',
        COALESCE(p_payment_method, 'transfer_manual'),
        COALESCE(p_contact_preference, 'both')
    )
    RETURNING id INTO v_order_id;

    UPDATE public.tickets
    SET status = 'reserved',
        reserved_at = NOW(),
        reservation_expires_at = v_expires_at,
        buyer_id = v_buyer_id,
        order_id = v_order_id,
        updated_at = NOW()
    WHERE raffle_id = p_raffle_id
      AND number = ANY(p_ticket_numbers);

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        'ORDER_CREATED_SECURE',
        'orders',
        v_order_id::TEXT,
        jsonb_build_object(
            'reference', v_reference,
            'buyer_id', v_buyer_id,
            'ticket_count', v_ticket_count,
            'total_amount', v_total_amount,
            'reservation_expires_at', v_expires_at,
            'reservation_duration_minutes', v_sys_duration
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'reference', v_reference,
        'buyer_id', v_buyer_id,
        'total_amount', v_total_amount,
        'ticket_count', v_ticket_count,
        'reservation_expires_at', v_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_secure(UUID, TEXT[], JSONB, VARCHAR, VARCHAR) TO anon, authenticated, service_role;



-- ==========================================
-- FILE: 024_admin_users_management.sql
-- ==========================================
-- ==============================================================================
-- Migración 024: Gestión Integral de Administradores del Sistema
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- 1. RPC admin_list_users: Listado real de public.admin_users con datos de vinculación Auth.
-- 2. RPC admin_invite_user: Pre-autorización de administradores con validación de roles y auditoría.
-- 3. RPC admin_toggle_user_status: Activación/desactivación con protección estricta
--    anti-autodesactivación y anti-orfandad de superadmin.
-- 4. Permisos de seguridad estrictos (REVOKE anon / GRANT authenticated).
-- ==============================================================================

-- 1. Función RPC para Listar Todos los Administradores (admin_list_users)
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_users JSONB;
BEGIN
    -- Validar que quien consulta sea un administrador activo
    IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: se requieren privilegios de administrador para consultar el equipo.'
        );
    END IF;

    -- Consultar todos los administradores uniendo con auth.users para metadatos de acceso
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', a.id,
                'user_id', a.user_id,
                'email', a.email,
                'full_name', COALESCE(a.full_name, 'Sin nombre registrado'),
                'role', a.role,
                'is_active', a.is_active,
                'created_at', a.created_at,
                'updated_at', a.updated_at,
                'has_auth_account', (a.user_id IS NOT NULL OR u.id IS NOT NULL),
                'last_sign_in_at', u.last_sign_in_at
            ) ORDER BY a.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_users
    FROM public.admin_users a
    LEFT JOIN auth.users u ON (u.id = a.user_id OR LOWER(u.email) = LOWER(a.email));

    RETURN jsonb_build_object(
        'success', true,
        'users', v_users
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;


-- 2. Función RPC para Invitar/Pre-autorizar Administrador (admin_invite_user)
DROP FUNCTION IF EXISTS public.admin_invite_user(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_invite_user(
    p_email TEXT,
    p_role TEXT DEFAULT 'admin',
    p_full_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_is_superadmin BOOLEAN;
    v_clean_email TEXT;
    v_clean_role TEXT;
    v_clean_name TEXT;
    v_auth_user_id UUID;
    v_new_admin public.admin_users%ROWTYPE;
BEGIN
    -- Validar autenticación y rol de administrador activo
    IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden invitar nuevos usuarios.'
        );
    END IF;

    v_caller_is_superadmin := public.is_superadmin(v_caller_id);

    -- Sanitizar y validar parámetros
    v_clean_email := LOWER(TRIM(COALESCE(p_email, '')));
    v_clean_role := LOWER(TRIM(COALESCE(p_role, 'admin')));
    v_clean_name := NULLIF(TRIM(COALESCE(p_full_name, '')), '');

    IF v_clean_email = '' OR v_clean_email NOT LIKE '%_@_%._%' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Debe proporcionar una dirección de correo electrónico válida.'
        );
    END IF;

    IF v_clean_role NOT IN ('superadmin', 'admin', 'auditor') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Rol no válido. Los roles admitidos son: superadmin, admin o auditor.'
        );
    END IF;

    -- Si quien invita NO es superadmin, no puede conceder el rol superadmin
    IF v_clean_role = 'superadmin' AND NOT v_caller_is_superadmin THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Solo un superadministrador puede designar a otro superadministrador.'
        );
    END IF;

    -- Validar que el correo no esté ya registrado en admin_users
    IF EXISTS (SELECT 1 FROM public.admin_users WHERE LOWER(email) = v_clean_email) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Este correo electrónico ya se encuentra registrado en el equipo de administradores.'
        );
    END IF;

    -- Comprobar si ya existe una cuenta en auth.users con ese correo
    SELECT id INTO v_auth_user_id
    FROM auth.users
    WHERE LOWER(email) = v_clean_email
    LIMIT 1;

    -- Insertar en public.admin_users
    INSERT INTO public.admin_users (
        user_id,
        email,
        full_name,
        role,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        v_auth_user_id,
        v_clean_email,
        v_clean_name,
        v_clean_role,
        true,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_admin;

    -- Registrar evento en bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'ADMIN_USER_INVITED',
        'admin_users',
        v_new_admin.id::TEXT,
        v_caller_id,
        jsonb_build_object(
            'email', v_clean_email,
            'full_name', v_clean_name,
            'role', v_clean_role,
            'auth_account_linked', (v_auth_user_id IS NOT NULL),
            'invited_by', v_caller_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Administrador autorizado exitosamente en el sistema.',
        'user', jsonb_build_object(
            'id', v_new_admin.id,
            'user_id', v_new_admin.user_id,
            'email', v_new_admin.email,
            'full_name', v_new_admin.full_name,
            'role', v_new_admin.role,
            'is_active', v_new_admin.is_active,
            'created_at', v_new_admin.created_at,
            'has_auth_account', (v_auth_user_id IS NOT NULL)
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_invite_user(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_invite_user(TEXT, TEXT, TEXT) TO authenticated, service_role;


-- 3. Función RPC para Activar/Desactivar Administrador (admin_toggle_user_status)
DROP FUNCTION IF EXISTS public.admin_toggle_user_status(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.admin_toggle_user_status(
    p_admin_user_id UUID,
    p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_email TEXT := LOWER(COALESCE(auth.jwt()->>'email', ''));
    v_caller_is_superadmin BOOLEAN;
    v_target public.admin_users%ROWTYPE;
    v_active_superadmins_count INTEGER;
BEGIN
    -- 1. Validar privilegios de administrador del invocador
    IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: se requieren privilegios de administrador.'
        );
    END IF;

    v_caller_is_superadmin := public.is_superadmin(v_caller_id);

    -- 2. Obtener y bloquear la fila del administrador objetivo
    SELECT * INTO v_target
    FROM public.admin_users
    WHERE id = p_admin_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El registro de administrador especificado no existe.'
        );
    END IF;

    -- 3. REGLA DE ORO DE SEGURIDAD 1: NUNCA PERMITIR QUE UN ADMIN SE DESACTIVE A SÍ MISMO
    IF p_is_active = false THEN
        IF (v_target.user_id IS NOT NULL AND v_target.user_id = v_caller_id)
           OR (v_caller_email <> '' AND LOWER(v_target.email) = v_caller_email) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Acción bloqueada por seguridad: No puedes desactivar tu propia cuenta de administrador.'
            );
        END IF;
    END IF;

    -- 4. REGLA DE SEGURIDAD 2: Solo superadmin puede modificar a otro superadmin
    IF v_target.role = 'superadmin' AND NOT v_caller_is_superadmin THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acción denegada: Solo un superadministrador puede modificar el estado de otro superadministrador.'
        );
    END IF;

    -- 5. REGLA DE SEGURIDAD 3: No permitir desactivar al último superadmin activo
    IF v_target.role = 'superadmin' AND p_is_active = false THEN
        SELECT COUNT(*) INTO v_active_superadmins_count
        FROM public.admin_users
        WHERE role = 'superadmin' AND is_active = true;

        IF v_active_superadmins_count <= 1 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Acción bloqueada: No se puede desactivar al único superadministrador activo del sistema.'
            );
        END IF;
    END IF;

    -- 6. Actualizar estado
    UPDATE public.admin_users
    SET is_active = p_is_active,
        updated_at = NOW()
    WHERE id = p_admin_user_id;

    -- 7. Registrar evento en bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        CASE WHEN p_is_active THEN 'ADMIN_USER_ACTIVATED' ELSE 'ADMIN_USER_DEACTIVATED' END,
        'admin_users',
        p_admin_user_id::TEXT,
        v_caller_id,
        jsonb_build_object(
            'target_email', v_target.email,
            'target_name', v_target.full_name,
            'target_role', v_target.role,
            'previous_status', v_target.is_active,
            'new_status', p_is_active,
            'performed_by', v_caller_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'admin_user_id', p_admin_user_id,
        'is_active', p_is_active,
        'message', CASE 
            WHEN p_is_active THEN 'Acceso de administrador activado exitosamente.'
            ELSE 'Acceso de administrador revocado inmediatamente.'
        END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_user_status(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_status(UUID, BOOLEAN) TO authenticated, service_role;

-- ============================================================================
-- FILE: 025_partners_management.sql
-- ============================================================================
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de aliados" ON public.partners;
CREATE POLICY "Lectura pública de aliados" ON public.partners
    FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "Administradores pueden gestionar aliados" ON public.partners;
CREATE POLICY "Administradores pueden gestionar aliados" ON public.partners
    FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.fn_partners_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partners_updated_at ON public.partners;
CREATE TRIGGER trg_partners_updated_at
    BEFORE UPDATE ON public.partners
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_partners_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'partner-logos',
    'partner-logos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

DROP POLICY IF EXISTS "Lectura pública de logos de aliados" ON storage.objects;
CREATE POLICY "Lectura pública de logos de aliados" ON storage.objects
    FOR SELECT USING (bucket_id = 'partner-logos');

DROP POLICY IF EXISTS "Solo administradores pueden subir logos de aliados" ON storage.objects;
CREATE POLICY "Solo administradores pueden subir logos de aliados" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'partner-logos' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores pueden actualizar logos de aliados" ON storage.objects;
CREATE POLICY "Solo administradores pueden actualizar logos de aliados" ON storage.objects
    FOR UPDATE USING (bucket_id = 'partner-logos' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores pueden eliminar logos de aliados" ON storage.objects;
CREATE POLICY "Solo administradores pueden eliminar logos de aliados" ON storage.objects
    FOR DELETE USING (bucket_id = 'partner-logos' AND public.is_admin(auth.uid()));

INSERT INTO public.partners (slug, name, category, description, instagram_url, display_order, is_active)
VALUES
    (
        'photours',
        'PHOTours',
        'Fotografía y contenido audiovisual',
        'Fotografía profesional y contenido audiovisual para experiencias ecoturísticas en la Serranía.',
        'https://www.instagram.com/photour_?stkn=ZDNlZDc0MzIxNw==',
        1,
        true
    ),
    (
        'cuatri-tours-manaure',
        'Cuatri Tours Manaure',
        'Aventura en cuatrimotos y rutas',
        'Rutas guiadas en cuatrimotos por los senderos y miradores de la Serranía del Perijá.',
        'https://www.instagram.com/cuatritours_manaure?stkn=ZDNlZDc0MzIxNw==',
        2,
        true
    ),
    (
        'villa-adelaida',
        'Villa Adelaida',
        'Hospedaje campestre y ecoturismo',
        'Hospedaje campestre, descanso y conexión con la naturaleza en Manaure Balcón del Cesar.',
        'https://www.instagram.com/restaurantevilladelaida?stkn=ZDNlZDc0MzIxNw==',
        3,
        true
    ),
    (
        'absolom-casita-de-la-mora',
        'Absolom - La Casita de la Mora',
        'Sabores y dulces tradicionales',
        'Postres artesanales, dulces típicos de mora y gastronomía local representativa.',
        'https://www.instagram.com/lacasitadelamora?stkn=ZDNlZDc0MzIxNw==',
        4,
        true
    ),
    (
        'los-pinos-manaure',
        'Los Pinos Manaure',
        'Mirador, naturaleza y paisajes',
        'Mirador panorámico, senderismo ecológico y avistamiento de atardeceres en Perijá.',
        'https://www.instagram.com/lospinosmanaure?stkn=ZDNlZDc0MzIxNw==',
        5,
        true
    ),
    (
        'mashiramo-glamping',
        'Mashiramo Glamping',
        'Glamping y descanso en la naturaleza',
        'Experiencia de glamping de lujo y hospedaje exclusivo en el corazón de la montaña.',
        'https://www.instagram.com/mashiramo_glamping?stkn=ZDNlZDc0MzIxNw==',
        6,
        true
    ),
    (
        'la-casa-de-las-arepas',
        'La Casa de las Arepas',
        'Gastronomía típica local',
        'Comida tradicional cesarense y arepas artesanales con auténtico sabor local.',
        NULL,
        7,
        true
    ),
    (
        'metallura',
        'Metallura Nature Tourism',
        'Avistamiento de aves (Birdwatching)',
        'Tours especializados de avistamiento de aves y conservación en la Serranía del Perijá.',
        'https://www.instagram.com/metalluraturismo?stkn=ZDNlZDc0MzIxNw==',
        8,
        true
    ),
    (
        'manaure-aventura',
        'Manaure Aventura',
        'Deportes extremos y vuelos en parapente',
        'Vuelos biplaza en parapente y turismo de adrenalina sobre el hermoso valle de Manaure.',
        'https://www.instagram.com/manaureaventura?stkn=ZDNlZDc0MzIxNw==',
        9,
        true
    ),
    (
        'coruscans',
        'Coruscans',
        'Productos y artesanías locales',
        'Café especial, artesanías y productos autóctonos cultivados por familias de la región.',
        'https://www.instagram.com/elcoruscans?stkn=ZDNlZDc0MzIxNw==',
        10,
        true
    )
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    description = COALESCE(public.partners.description, EXCLUDED.description),
    instagram_url = COALESCE(EXCLUDED.instagram_url, public.partners.instagram_url),
    display_order = EXCLUDED.display_order;


-- ============================================================================
-- MIGRACIÓN 026: RPC get_dashboard_kpis PARA AGREGACIÓN NATIVA EN POSTGRESQL
-- ============================================================================
-- Elimina la necesidad de descargar miles de filas de tickets y orders hacia el cliente.
-- Ejecuta agregaciones nativas (COUNT, SUM, FILTER) en un solo viaje de red y con
-- complejidad O(1) transferida al frontend.

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
    p_raffle_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_admin_uid UUID := auth.uid();
    v_tickets_result RECORD;
    v_orders_result RECORD;
    v_total_buyers BIGINT;
    v_total_tickets BIGINT;
    v_tickets_sold BIGINT;
    v_tickets_available BIGINT;
    v_tickets_reserved BIGINT;
    v_tickets_blocked BIGINT;
    v_percentage_sold NUMERIC;
BEGIN
    -- 1. Verificación de seguridad estricta: solo administradores activos
    IF v_admin_uid IS NULL OR NOT public.is_admin(v_admin_uid) THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores autorizados pueden consultar métricas operativas.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Agregaciones nativas sobre la tabla tickets
    SELECT
        COUNT(*)::BIGINT AS total_tickets,
        COUNT(*) FILTER (WHERE status = 'sold')::BIGINT AS tickets_sold,
        COUNT(*) FILTER (WHERE status = 'available')::BIGINT AS tickets_available,
        COUNT(*) FILTER (WHERE status = 'reserved')::BIGINT AS tickets_reserved,
        COUNT(*) FILTER (WHERE status = 'blocked')::BIGINT AS tickets_blocked
    INTO v_tickets_result
    FROM public.tickets
    WHERE (p_raffle_id IS NULL OR raffle_id = p_raffle_id);

    v_total_tickets := COALESCE(v_tickets_result.total_tickets, 0);
    v_tickets_sold := COALESCE(v_tickets_result.tickets_sold, 0);
    v_tickets_available := COALESCE(v_tickets_result.tickets_available, 0);
    v_tickets_reserved := COALESCE(v_tickets_result.tickets_reserved, 0);
    v_tickets_blocked := COALESCE(v_tickets_result.tickets_blocked, 0);

    -- Si no hay boletos creados para la rifa seleccionada, asumir estándar 1000 para el frontend
    IF v_total_tickets = 0 AND p_raffle_id IS NULL THEN
        v_total_tickets := 1000;
        v_tickets_available := 1000;
    END IF;

    IF v_total_tickets > 0 THEN
        v_percentage_sold := ROUND((v_tickets_sold::NUMERIC / v_total_tickets::NUMERIC) * 100, 2);
    ELSE
        v_percentage_sold := 0;
    END IF;

    -- 3. Agregaciones nativas sobre la tabla orders
    SELECT
        COUNT(*)::BIGINT AS total_orders_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status IN ('paid', 'completed')), 0)::NUMERIC AS confirmed_money,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending_verification'), 0)::NUMERIC AS pending_verification_money,
        COUNT(*) FILTER (WHERE status = 'pending')::BIGINT AS pending_orders_count,
        COUNT(*) FILTER (WHERE status = 'pending_verification')::BIGINT AS pending_receipts_count,
        COUNT(*) FILTER (WHERE status IN ('paid', 'completed'))::BIGINT AS paid_orders_count,
        COUNT(*) FILTER (WHERE status = 'rejected')::BIGINT AS rejected_orders_count,
        COUNT(*) FILTER (WHERE status = 'expired')::BIGINT AS expired_orders_count,
        COUNT(*) FILTER (WHERE status = 'cancelled')::BIGINT AS cancelled_orders_count,
        COUNT(*) FILTER (WHERE status = 'refunded')::BIGINT AS refunded_orders_count,
        COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_orders_count
    INTO v_orders_result
    FROM public.orders
    WHERE (p_raffle_id IS NULL OR raffle_id = p_raffle_id);

    -- 4. Conteo de compradores (total de compradores únicos si es por rifa, o tabla buyers si es global)
    IF p_raffle_id IS NOT NULL THEN
        SELECT COUNT(DISTINCT buyer_id)::BIGINT
        INTO v_total_buyers
        FROM public.orders
        WHERE raffle_id = p_raffle_id;
    ELSE
        SELECT COUNT(*)::BIGINT
        INTO v_total_buyers
        FROM public.buyers;
    END IF;

    -- 5. Retornar objeto JSONB consolidado con ambas nomenclaturas (camelCase y snake_case)
    RETURN jsonb_build_object(
        'totalTickets', v_total_tickets,
        'ticketsAvailable', v_tickets_available,
        'ticketsReserved', v_tickets_reserved,
        'ticketsSold', v_tickets_sold,
        'ticketsBlocked', v_tickets_blocked,
        'percentageSold', v_percentage_sold,
        'pendingOrdersCount', COALESCE(v_orders_result.pending_orders_count, 0),
        'pendingReceiptsCount', COALESCE(v_orders_result.pending_receipts_count, 0),
        'paidOrdersCount', COALESCE(v_orders_result.paid_orders_count, 0),
        'rejectedOrdersCount', COALESCE(v_orders_result.rejected_orders_count, 0),
        'expiredOrdersCount', COALESCE(v_orders_result.expired_orders_count, 0),
        'cancelledOrdersCount', COALESCE(v_orders_result.cancelled_orders_count, 0),
        'refundedOrdersCount', COALESCE(v_orders_result.refunded_orders_count, 0),
        'totalOrdersCount', COALESCE(v_orders_result.total_orders_count, 0),
        'confirmedMoney', COALESCE(v_orders_result.confirmed_money, 0),
        'pendingVerificationMoney', COALESCE(v_orders_result.pending_verification_money, 0),
        'totalBuyersCount', COALESCE(v_total_buyers, 0),
        'totalCollected', COALESCE(v_orders_result.confirmed_money, 0),
        'ordersByStatus', jsonb_build_object(
            'pending', COALESCE(v_orders_result.pending_orders_count, 0),
            'pending_verification', COALESCE(v_orders_result.pending_receipts_count, 0),
            'paid', COALESCE(v_orders_result.paid_orders_count, 0),
            'completed', COALESCE(v_orders_result.completed_orders_count, 0),
            'rejected', COALESCE(v_orders_result.rejected_orders_count, 0),
            'expired', COALESCE(v_orders_result.expired_orders_count, 0),
            'cancelled', COALESCE(v_orders_result.cancelled_orders_count, 0),
            'refunded', COALESCE(v_orders_result.refunded_orders_count, 0)
        ),
        'total_tickets', v_total_tickets,
        'tickets_available', v_tickets_available,
        'tickets_reserved', v_tickets_reserved,
        'tickets_sold', v_tickets_sold,
        'tickets_blocked', v_tickets_blocked,
        'percentage_sold', v_percentage_sold,
        'pending_orders_count', COALESCE(v_orders_result.pending_orders_count, 0),
        'pending_receipts_count', COALESCE(v_orders_result.pending_receipts_count, 0),
        'paid_orders_count', COALESCE(v_orders_result.paid_orders_count, 0),
        'rejected_orders_count', COALESCE(v_orders_result.rejected_orders_count, 0),
        'confirmed_money', COALESCE(v_orders_result.confirmed_money, 0),
        'pending_verification_money', COALESCE(v_orders_result.pending_verification_money, 0),
        'total_buyers_count', COALESCE(v_total_buyers, 0),
        'total_collected', COALESCE(v_orders_result.confirmed_money, 0)
    );
END;
$$;

-- Permisos estrictos de ejecución
REVOKE EXECUTE ON FUNCTION public.get_dashboard_kpis(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(UUID) TO authenticated, service_role;

-- ============================================================================
-- MIGRACIÓN 027: MEJORA ROBUSTA DEL FILTRADO POR RAFFLE_ID EN GET_DASHBOARD_KPIS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
    p_raffle_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_admin_uid UUID := auth.uid();
    v_tickets_result RECORD;
    v_orders_result RECORD;
    v_total_buyers BIGINT;
    v_total_tickets BIGINT;
    v_tickets_sold BIGINT;
    v_tickets_available BIGINT;
    v_tickets_reserved BIGINT;
    v_tickets_blocked BIGINT;
    v_percentage_sold NUMERIC;
BEGIN
    -- 1. Verificación de seguridad: solo administradores autorizados
    IF v_admin_uid IS NULL OR NOT public.is_admin(v_admin_uid) THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores autorizados pueden consultar métricas operativas.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Agregaciones nativas sobre la tabla tickets filtradas por p_raffle_id
    SELECT
        COUNT(*)::BIGINT AS total_tickets,
        COUNT(*) FILTER (WHERE status = 'sold')::BIGINT AS tickets_sold,
        COUNT(*) FILTER (WHERE status = 'available')::BIGINT AS tickets_available,
        COUNT(*) FILTER (WHERE status = 'reserved')::BIGINT AS tickets_reserved,
        COUNT(*) FILTER (WHERE status = 'blocked')::BIGINT AS tickets_blocked
    INTO v_tickets_result
    FROM public.tickets
    WHERE (p_raffle_id IS NULL OR raffle_id = p_raffle_id);

    v_total_tickets := COALESCE(v_tickets_result.total_tickets, 0);
    v_tickets_sold := COALESCE(v_tickets_result.tickets_sold, 0);
    v_tickets_available := COALESCE(v_tickets_result.tickets_available, 0);
    v_tickets_reserved := COALESCE(v_tickets_result.tickets_reserved, 0);
    v_tickets_blocked := COALESCE(v_tickets_result.tickets_blocked, 0);

    -- Si no hay boletos creados para la rifa seleccionada, consultar la definición de la rifa
    IF v_total_tickets = 0 THEN
        IF p_raffle_id IS NOT NULL THEN
            SELECT COALESCE(total_tickets, 1000) INTO v_total_tickets
            FROM public.raffles
            WHERE id = p_raffle_id;
            v_total_tickets := COALESCE(v_total_tickets, 1000);
            v_tickets_available := v_total_tickets;
        ELSE
            v_total_tickets := 1000;
            v_tickets_available := 1000;
        END IF;
    END IF;

    IF v_total_tickets > 0 THEN
        v_percentage_sold := ROUND((v_tickets_sold::NUMERIC / v_total_tickets::NUMERIC) * 100, 2);
    ELSE
        v_percentage_sold := 0;
    END IF;

    -- 3. Agregaciones nativas sobre la tabla orders
    SELECT
        COUNT(*)::BIGINT AS total_orders_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status IN ('paid', 'completed')), 0)::NUMERIC AS confirmed_money,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending_verification'), 0)::NUMERIC AS pending_verification_money,
        COUNT(*) FILTER (WHERE status = 'pending')::BIGINT AS pending_orders_count,
        COUNT(*) FILTER (WHERE status = 'pending_verification')::BIGINT AS pending_receipts_count,
        COUNT(*) FILTER (WHERE status IN ('paid', 'completed'))::BIGINT AS paid_orders_count,
        COUNT(*) FILTER (WHERE status = 'rejected')::BIGINT AS rejected_orders_count,
        COUNT(*) FILTER (WHERE status = 'expired')::BIGINT AS expired_orders_count,
        COUNT(*) FILTER (WHERE status = 'cancelled')::BIGINT AS cancelled_orders_count,
        COUNT(*) FILTER (WHERE status = 'refunded')::BIGINT AS refunded_orders_count,
        COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_orders_count
    INTO v_orders_result
    FROM public.orders
    WHERE (p_raffle_id IS NULL OR raffle_id = p_raffle_id);

    -- 4. Conteo de compradores (total de compradores únicos si es por rifa, o tabla buyers si es global)
    IF p_raffle_id IS NOT NULL THEN
        SELECT COUNT(DISTINCT buyer_id)::BIGINT
        INTO v_total_buyers
        FROM public.orders
        WHERE raffle_id = p_raffle_id;
    ELSE
        SELECT COUNT(*)::BIGINT
        INTO v_total_buyers
        FROM public.buyers;
    END IF;

    -- 5. Retornar objeto JSONB consolidado con ambas nomenclaturas (camelCase y snake_case)
    RETURN jsonb_build_object(
        'totalTickets', v_total_tickets,
        'ticketsAvailable', v_tickets_available,
        'ticketsReserved', v_tickets_reserved,
        'ticketsSold', v_tickets_sold,
        'ticketsBlocked', v_tickets_blocked,
        'percentageSold', v_percentage_sold,
        'pendingOrdersCount', COALESCE(v_orders_result.pending_orders_count, 0),
        'pendingReceiptsCount', COALESCE(v_orders_result.pending_receipts_count, 0),
        'paidOrdersCount', COALESCE(v_orders_result.paid_orders_count, 0),
        'rejectedOrdersCount', COALESCE(v_orders_result.rejected_orders_count, 0),
        'expiredOrdersCount', COALESCE(v_orders_result.expired_orders_count, 0),
        'cancelledOrdersCount', COALESCE(v_orders_result.cancelled_orders_count, 0),
        'refundedOrdersCount', COALESCE(v_orders_result.refunded_orders_count, 0),
        'totalOrdersCount', COALESCE(v_orders_result.total_orders_count, 0),
        'confirmedMoney', COALESCE(v_orders_result.confirmed_money, 0),
        'pendingVerificationMoney', COALESCE(v_orders_result.pending_verification_money, 0),
        'totalBuyersCount', COALESCE(v_total_buyers, 0),
        'totalCollected', COALESCE(v_orders_result.confirmed_money, 0),
        'ordersByStatus', jsonb_build_object(
            'pending', COALESCE(v_orders_result.pending_orders_count, 0),
            'pending_verification', COALESCE(v_orders_result.pending_receipts_count, 0),
            'paid', COALESCE(v_orders_result.paid_orders_count, 0),
            'completed', COALESCE(v_orders_result.completed_orders_count, 0),
            'rejected', COALESCE(v_orders_result.rejected_orders_count, 0),
            'expired', COALESCE(v_orders_result.expired_orders_count, 0),
            'cancelled', COALESCE(v_orders_result.cancelled_orders_count, 0),
            'refunded', COALESCE(v_orders_result.refunded_orders_count, 0)
        ),
        'total_tickets', v_total_tickets,
        'tickets_available', v_tickets_available,
        'tickets_reserved', v_tickets_reserved,
        'tickets_sold', v_tickets_sold,
        'tickets_blocked', v_tickets_blocked,
        'percentage_sold', v_percentage_sold,
        'pending_orders_count', COALESCE(v_orders_result.pending_orders_count, 0),
        'pending_receipts_count', COALESCE(v_orders_result.pending_receipts_count, 0),
        'paid_orders_count', COALESCE(v_orders_result.paid_orders_count, 0),
        'rejected_orders_count', COALESCE(v_orders_result.rejected_orders_count, 0),
        'confirmed_money', COALESCE(v_orders_result.confirmed_money, 0),
        'pending_verification_money', COALESCE(v_orders_result.pending_verification_money, 0),
        'total_buyers_count', COALESCE(v_total_buyers, 0),
        'total_collected', COALESCE(v_orders_result.confirmed_money, 0)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_kpis(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(UUID) TO authenticated, service_role;

-- ============================================================================
-- MIGRACIÓN 033: PREMIO MAYOR OFICIAL (BANNER VERDE) Y SINCRONIZACIÓN DE IMÁGENES
-- ============================================================================
ALTER TABLE public.prize_settings
    ADD COLUMN IF NOT EXISTS official_tour_badge TEXT NOT NULL DEFAULT 'PREMIO MAYOR OFICIAL',
    ADD COLUMN IF NOT EXISTS official_tour_title TEXT NOT NULL DEFAULT 'Tour Vive Manaure • 3 Días y 2 Noches',
    ADD COLUMN IF NOT EXISTS official_tour_subtitle TEXT NOT NULL DEFAULT 'Todo incluido para la pareja (2 personas). Especificación detallada del premio:',
    ADD COLUMN IF NOT EXISTS official_tour_features JSONB NOT NULL DEFAULT '[
        {"title": "Viaje ida y vuelta pago:", "description": "desde tu lugar de residencia hasta Manaure – Cesar para la pareja (2 personas)"},
        {"title": "Hospedaje:", "description": "en uno de los mejores hoteles / glamping campestre"},
        {"title": "Noche romántica:", "description": "velada íntima preparada especialmente para la pareja"},
        {"title": "Alimentación completa:", "description": "desayunos, almuerzos campestres y cenas típicas"},
        {"title": "Experiencia de cuatrimoto:", "description": "ruta guiada por trochas y miradores"},
        {"title": "Experiencia del parapente:", "description": "vuelo libre tándem con piloto certificado"},
        {"title": "Ruta Casa de Vidrio:", "description": "Serranía de Perijá con fogata nocturna"},
        {"title": "Registro fotográfico:", "description": "cobertura profesional en alta definición"}
    ]'::jsonb;

UPDATE public.prize_settings
SET
    official_tour_badge = COALESCE(NULLIF(official_tour_badge, ''), 'PREMIO MAYOR OFICIAL'),
    official_tour_title = COALESCE(NULLIF(official_tour_title, ''), 'Tour Vive Manaure • 3 Días y 2 Noches'),
    official_tour_subtitle = COALESCE(NULLIF(official_tour_subtitle, ''), 'Todo incluido para la pareja (2 personas). Especificación detallada del premio:'),
    official_tour_features = CASE 
        WHEN official_tour_features IS NULL OR jsonb_array_length(official_tour_features) = 0 THEN '[
            {"title": "Viaje ida y vuelta pago:", "description": "desde tu lugar de residencia hasta Manaure – Cesar para la pareja (2 personas)"},
            {"title": "Hospedaje:", "description": "en uno de los mejores hoteles / glamping campestre"},
            {"title": "Noche romántica:", "description": "velada íntima preparada especialmente para la pareja"},
            {"title": "Alimentación completa:", "description": "desayunos, almuerzos campestres y cenas típicas"},
            {"title": "Experiencia de cuatrimoto:", "description": "ruta guiada por trochas y miradores"},
            {"title": "Experiencia del parapente:", "description": "vuelo libre tándem con piloto certificado"},
            {"title": "Ruta Casa de Vidrio:", "description": "Serranía de Perijá con fogata nocturna"},
            {"title": "Registro fotográfico:", "description": "cobertura profesional en alta definición"}
        ]'::jsonb
        ELSE official_tour_features
    END,
    updated_at = NOW()
WHERE id = 'main';

UPDATE public.prize_experiences
SET 
    image_slug = 'gastronomia-casa-arepas',
    updated_at = NOW()
WHERE (title ILIKE '%gastron%mico%' OR partner_name ILIKE '%arepas%')
  AND (image_slug = 'serrania-perija-panoramica' OR image_slug IS NULL OR image_slug = 'cuatrimoto-flota');

-- ============================================================================
-- MIGRACIÓN 032: GESTIÓN DE PREGUNTAS FRECUENTES (faq_items)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.faq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faq_items_sort_idx ON public.faq_items (sort_order);

ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública: cualquier usuario anónimo o autenticado puede leer las publicadas
DROP POLICY IF EXISTS "faq_items_public_read" ON public.faq_items;
CREATE POLICY "faq_items_public_read" ON public.faq_items
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.fn_faq_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_faq_items_updated_at ON public.faq_items;
CREATE TRIGGER trg_faq_items_updated_at
  BEFORE UPDATE ON public.faq_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_faq_items_updated_at();

-- Semilla oficial con las 6 preguntas frecuentes
INSERT INTO public.faq_items (question, answer, sort_order, is_published)
VALUES
(
  '¿Cómo se determina el número ganador del sorteo?',
  'El ganador se define de manera 100% transparente con las 3 últimas cifras del Premio Mayor de la Lotería de Santander en la fecha estipulada del sorteo. No usamos tómbolas internas ni software opaco; los resultados son públicos y auditables por cualquier participante.',
  10,
  true
),
(
  '¿Qué incluye exactamente el paquete para 2 personas?',
  'Incluye el Tour Vive Manaure de 3 días y 2 noches para la pareja (2 personas) con viaje pago ida y vuelta desde tu lugar de residencia hasta Manaure - Cesar, hospedaje en los mejores hoteles / glamping, noche romántica, alimentación completa (desayunos, almuerzos campestres y cenas típicas), experiencia en cuatrimoto por trochas, vuelo libre en parapente tándem, ruta a la Casa de Vidrio en la Serranía de Perijá con fogata nocturna y registro fotográfico profesional.',
  20,
  true
),
(
  '¿Cómo y cuándo recibo la confirmación de mis boletos?',
  'Inmediatamente después de registrar tu transferencia y validar tu comprobante, el sistema te muestra tu certificado digital de compra. Además, puedes consultar en cualquier momento tus boletos activos ingresando tu número de cédula en la sección "Consultar Boletos".',
  30,
  true
),
(
  '¿Qué vigencia tiene el premio y cómo se coordina la fecha del viaje?',
  'El ganador tendrá hasta 6 meses a partir de la fecha del sorteo para coordinar su viaje en la fecha de su preferencia (sujeto a disponibilidad y previa reserva de 15 días con los operadores turísticos de Manaure Vive).',
  40,
  true
),
(
  '¿Puedo transferir o ceder el premio a un familiar o amigo?',
  'Sí. Si eres el titular del boleto ganador y deseas obsequiar o ceder la experiencia a otra persona, podrás hacerlo mediante notificación formal por WhatsApp y correo electrónico con copia de tu documento de identidad.',
  50,
  true
),
(
  '¿Cuáles son los métodos de pago disponibles?',
  'Aceptamos transferencias directas mediante Bre-B, Nequi, Daviplata, Bancolombia y cualquier entidad bancaria nacional que permita transferencias. No recibimos pagos con tarjeta de crédito ni débito.',
  60,
  true
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- MIGRACIÓN 034: POLÍTICAS RLS DE GESTIÓN ADMINISTRATIVA PARA PREGUNTAS FRECUENTES (faq_items)
-- ============================================================================
DROP POLICY IF EXISTS "faq_items_public_read" ON public.faq_items;
CREATE POLICY "faq_items_public_read" ON public.faq_items
  FOR SELECT TO anon, authenticated
  USING (
    is_published = true 
    OR (auth.role() = 'authenticated' AND public.is_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "Administradores gestionan faq_items" ON public.faq_items;
CREATE POLICY "Administradores gestionan faq_items" ON public.faq_items
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- MIGRACIÓN 035: GESTIÓN INTEGRAL DE LA GALERÍA FOTOGRÁFICA (gallery_items)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.gallery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id UUID REFERENCES public.raffles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'serrania',
    image_slug TEXT,
    image_url TEXT,
    alt_text TEXT,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gallery_items_display_order_idx ON public.gallery_items (display_order ASC);
CREATE INDEX IF NOT EXISTS gallery_items_category_idx ON public.gallery_items (category);
CREATE INDEX IF NOT EXISTS gallery_items_raffle_id_idx ON public.gallery_items (raffle_id);
CREATE INDEX IF NOT EXISTS gallery_items_is_active_idx ON public.gallery_items (is_active);

DROP TRIGGER IF EXISTS trg_gallery_items_updated_at ON public.gallery_items;
CREATE TRIGGER trg_gallery_items_updated_at
    BEFORE UPDATE ON public.gallery_items
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prize_updated_at();

ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gallery_items_public_read" ON public.gallery_items;
CREATE POLICY "gallery_items_public_read" ON public.gallery_items
    FOR SELECT
    USING (
        is_active = true
        OR (auth.role() = 'authenticated' AND public.is_admin(auth.uid()))
    );

DROP POLICY IF EXISTS "gallery_items_admin_manage" ON public.gallery_items;
CREATE POLICY "gallery_items_admin_manage" ON public.gallery_items
    FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'gallery-images',
    'gallery-images',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml'];

DROP POLICY IF EXISTS "Lectura pública de fotos de galería" ON storage.objects;
CREATE POLICY "Lectura pública de fotos de galería" ON storage.objects
    FOR SELECT USING (bucket_id = 'gallery-images');

DROP POLICY IF EXISTS "Solo administradores suben fotos de galería" ON storage.objects;
CREATE POLICY "Solo administradores suben fotos de galería" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'gallery-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores actualizan fotos de galería" ON storage.objects;
CREATE POLICY "Solo administradores actualizan fotos de galería" ON storage.objects
    FOR UPDATE USING (bucket_id = 'gallery-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores eliminan fotos de galería" ON storage.objects;
CREATE POLICY "Solo administradores eliminan fotos de galería" ON storage.objects
    FOR DELETE USING (bucket_id = 'gallery-images' AND public.is_admin(auth.uid()));

INSERT INTO public.gallery_items (title, category, image_slug, alt_text, display_order, is_active)
VALUES
    ('Villa Adelaida Campestre', 'hospedaje', 'hospedaje-villa-adelaida', 'Arquitectura campestre y jardines florales en Villa Adelaida', 1, true),
    ('Jardines y Topiarios', 'serrania', 'serrania-topiarios', 'Esculturas vivas y topiarios decorativos en los jardines de Manaure', 2, true),
    ('Aventura en Cuatrimoto por la Cordillera', 'cuatrimoto', 'cuatrimoto-aventura-cordillera', 'Caravana de cuatrimotos todoterreno recorriendo la cresta de la Serranía del Perijá', 3, true),
    ('Trochas y Rutas Ecoturísticas', 'cuatrimoto', 'cuatrimoto-ruta', 'Recorrido guiado en cuatrimoto a través de caminos de montaña', 4, true),
    ('Mirador Panorámico Cuatrimotos', 'cuatrimoto', 'cuatrimoto-mirador', 'Piloto en cuatrimoto contemplando la inmensidad del valle', 5, true),
    ('Cumbre de la Serranía', 'cuatrimoto', 'cuatrimoto-cumbre', 'Llegada a la cima de la montaña con cuatrimotos todoterreno', 6, true),
    ('Despegue al Atardecer', 'parapente', 'parapente-despegue-atardecer', 'Preparación para el vuelo en parapente biplaza durante la puesta de sol', 7, true),
    ('Vuelo con Bandera de Manaure', 'parapente', 'parapente-bandera', 'Parapentista sobrevolando el cañón portando la bandera representativa', 8, true),
    ('Vuelo Libre sobre el Cañón', 'parapente', 'parapente-vuelo', 'Planeo silencioso sobre las corrientes térmicas de la cordillera', 9, true),
    ('Tándem Extremo en el Cañón', 'parapente', 'parapente-tandem-canon', 'Vuelo tándem seguro con instructor certificado en el cañón de Manaure', 10, true),
    ('Laguna Escondida de Alta Montaña', 'serrania', 'serrania-perija-laguna', 'Espejo de agua cristalina en las alturas de la Serranía del Perijá', 11, true),
    ('Páramo y Frailejones', 'serrania', 'serrania-perija-frailejones', 'Vegetación endémica de frailejones en el ecosistema de páramo', 12, true),
    ('Cordillera Majestuosa de Perijá', 'serrania', 'serrania-perija-cordillera', 'Vistas panorámicas del macizo montañoso de la Serranía del Perijá', 13, true),
    ('Pozo de Agua Cristalina', 'serrania', 'serrania-pozo-cristalino', 'Piscina natural de vertiente andina rodeada de vegetación', 14, true),
    ('Mirador Los Pinos', 'serrania', 'serrania-los-pinos', 'Senderos bajo bosque de pinos con vista a las nubes', 15, true),
    ('Sabana Rubia y Frontera', 'serrania', 'serrania-sabana-rubia', 'Planicie de alta montaña en Sabana Rubia, páramo del Perijá', 16, true),
    ('La Casa de las Arepas', 'gastronomia', 'gastronomia-casa-arepas', 'Degustación de arepa rellena artesanal y gastronomía local tradicional', 17, true),
    ('Fogata en la Casa de Vidrio', 'fogata', 'fogata-casa-de-vidrio', 'Fogata cálida al caer la tarde en la terraza mirador de la Casa de Vidrio', 18, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- MIGRACIÓN 036: GESTIÓN DINÁMICA DE CATEGORÍAS DE GALERÍA (gallery_categories)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.gallery_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gallery_categories_order_idx ON public.gallery_categories (display_order ASC);
CREATE INDEX IF NOT EXISTS gallery_categories_slug_idx ON public.gallery_categories (slug);
CREATE INDEX IF NOT EXISTS gallery_categories_is_active_idx ON public.gallery_categories (is_active);

DROP TRIGGER IF EXISTS trg_gallery_categories_updated_at ON public.gallery_categories;
CREATE TRIGGER trg_gallery_categories_updated_at
    BEFORE UPDATE ON public.gallery_categories
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prize_updated_at();

ALTER TABLE public.gallery_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gallery_categories_public_read" ON public.gallery_categories;
CREATE POLICY "gallery_categories_public_read" ON public.gallery_categories
    FOR SELECT
    USING (
        is_active = true
        OR (auth.role() = 'authenticated' AND public.is_admin(auth.uid()))
    );

DROP POLICY IF EXISTS "gallery_categories_admin_manage" ON public.gallery_categories;
CREATE POLICY "gallery_categories_admin_manage" ON public.gallery_categories
    FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.gallery_categories (slug, name, display_order, is_active)
VALUES
    ('cuatrimoto', 'Cuatrimotos', 1, true),
    ('parapente', 'Parapente', 2, true),
    ('serrania', 'Serranía del Perijá', 3, true),
    ('hospedaje', 'Hospedaje & Glamping', 4, true),
    ('gastronomia', 'Gastronomía', 5, true),
    ('fogata', 'Noche & Fogata', 6, true),
    ('otro', 'Otra Experiencia', 7, true)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order;









