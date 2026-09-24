-- ==============================================================================
-- MIGRACIÓN 053: Proyección Pública de Boletos y Aislamiento de PII en Realtime
-- Auditoría 05 — Remediación 2 (EVENT-02 / CRIT-01)
-- ==============================================================================
-- OBJETIVO:
-- Erradicar la fuga de datos personales (PII) y metadatos sensibles (buyer_id,
-- order_id) en el flujo público y en Supabase Realtime al consultar o recibir
-- eventos de boletos.
--
-- ARQUITECTURA:
-- 1. Tabla de Proyección Pública: public.ticket_public_state
--    - Contiene única y exclusivamente el estado mínimo requerido por la grilla
--      y la UI pública: id, raffle_id, number, status, updated_at.
--    - No contiene columnas de buyer_id, order_id, datos de comprador ni referencia de orden.
--    - Actualización atómica en la misma transacción mediante trigger sobre public.tickets.
--    - Lectura pública irrestricta (SELECT a anon y authenticated).
--    - Mutaciones directas bloqueadas para todos los roles de PostgREST.
--    - Agregada a la publicación 'supabase_realtime' con REPLICA IDENTITY FULL.
--
-- 2. Blindaje de la Fuente Privada: public.tickets
--    - Eliminación de la política permisiva "Lectura pública de boletos" (USING true).
--    - Revocación de permisos SELECT/ALL a 'anon' y 'PUBLIC'.
--    - Creación de política RLS administrativa estricta: solo usuarios authenticated
--      que cumplan public.is_admin(auth.uid()) pueden consultar y gestionar public.tickets.
--    - Removida de la publicación 'supabase_realtime' para evitar broadcast a clientes anónimos.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CREACIÓN Y DEFINICIÓN DE TABLA: public.ticket_public_state
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_public_state (
    id UUID PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
    raffle_id UUID NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
    number VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'available',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ticket_public_state_raffle_number UNIQUE (raffle_id, number)
);

-- Asegurar / actualizar restricción de verificación de estados
-- Admite los estados canónicos ('available', 'reserved', 'sold', 'blocked') así como alias
-- seguros y de compatibilidad ('paid', 'vendido') para garantizar resiliencia total frente
-- a datos legados y ejecuciones previas parciales.
ALTER TABLE public.ticket_public_state 
    DROP CONSTRAINT IF EXISTS ticket_public_state_status_check;

ALTER TABLE public.ticket_public_state 
    ADD CONSTRAINT ticket_public_state_status_check 
    CHECK (status IN ('available', 'reserved', 'sold', 'paid', 'blocked', 'vendido'));

-- Índices de alto rendimiento para filtros por rifa, estado y búsqueda de número
CREATE INDEX IF NOT EXISTS idx_ticket_public_state_raffle_status 
    ON public.ticket_public_state(raffle_id, status);

CREATE INDEX IF NOT EXISTS idx_ticket_public_state_number 
    ON public.ticket_public_state(number);

-- ------------------------------------------------------------------------------
-- 2. SANEAMIENTO PREVENTIVO Y BACKFILL DESDE public.tickets
-- ------------------------------------------------------------------------------
-- Paso 2.1: Saneamiento de datos históricos en public.tickets si existen valores en español
DO $$
BEGIN
    BEGIN
        ALTER TABLE public.tickets DISABLE TRIGGER trg_validate_ticket_status_transition;
    EXCEPTION
        WHEN undefined_object THEN NULL;
        WHEN insufficient_privilege THEN NULL;
    END;

    UPDATE public.tickets
    SET status = CASE LOWER(TRIM(status))
        WHEN 'vendido' THEN 'sold'
        WHEN 'disponible' THEN 'available'
        WHEN 'reservado' THEN 'reserved'
        WHEN 'bloqueado' THEN 'blocked'
        ELSE status
    END
    WHERE status IN ('vendido', 'disponible', 'reservado', 'bloqueado');

    BEGIN
        ALTER TABLE public.tickets ENABLE TRIGGER trg_validate_ticket_status_transition;
    EXCEPTION
        WHEN undefined_object THEN NULL;
        WHEN insufficient_privilege THEN NULL;
    END;
END $$;

-- Paso 2.2: Poblado de proyección pública con normalización canónica de estados
INSERT INTO public.ticket_public_state (
    id,
    raffle_id,
    number,
    status,
    updated_at
)
SELECT 
    t.id,
    t.raffle_id,
    t.number,
    CASE LOWER(TRIM(t.status))
        WHEN 'vendido' THEN 'sold'
        WHEN 'disponible' THEN 'available'
        WHEN 'reservado' THEN 'reserved'
        WHEN 'bloqueado' THEN 'blocked'
        ELSE t.status
    END AS status,
    COALESCE(t.updated_at, t.created_at, NOW())
FROM public.tickets t
ON CONFLICT (id) DO UPDATE SET
    raffle_id = EXCLUDED.raffle_id,
    number = EXCLUDED.number,
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at;

-- ------------------------------------------------------------------------------
-- 3. TRIGGER TRANSACCIONAL DE SINCRONIZACIÓN ATÓMICA
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_ticket_public_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_norm_status VARCHAR(20);
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_norm_status := CASE LOWER(TRIM(NEW.status))
            WHEN 'vendido' THEN 'sold'
            WHEN 'disponible' THEN 'available'
            WHEN 'reservado' THEN 'reserved'
            WHEN 'bloqueado' THEN 'blocked'
            ELSE NEW.status
        END;

        INSERT INTO public.ticket_public_state (
            id,
            raffle_id,
            number,
            status,
            updated_at
        ) VALUES (
            NEW.id,
            NEW.raffle_id,
            NEW.number,
            v_norm_status,
            COALESCE(NEW.updated_at, NOW())
        )
        ON CONFLICT (id) DO UPDATE SET
            raffle_id = EXCLUDED.raffle_id,
            number = EXCLUDED.number,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at;
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Sincronizar solo si hay cambios en columnas expuestas
        IF OLD.status IS DISTINCT FROM NEW.status 
           OR OLD.number IS DISTINCT FROM NEW.number 
           OR OLD.raffle_id IS DISTINCT FROM NEW.raffle_id 
           OR OLD.updated_at IS DISTINCT FROM NEW.updated_at THEN
            
            v_norm_status := CASE LOWER(TRIM(NEW.status))
                WHEN 'vendido' THEN 'sold'
                WHEN 'disponible' THEN 'available'
                WHEN 'reservado' THEN 'reserved'
                WHEN 'bloqueado' THEN 'blocked'
                ELSE NEW.status
            END;

            UPDATE public.ticket_public_state
            SET raffle_id = NEW.raffle_id,
                number = NEW.number,
                status = v_norm_status,
                updated_at = COALESCE(NEW.updated_at, NOW())
            WHERE id = NEW.id;

            -- Contingencia si el registro público no existía previamente
            IF NOT FOUND THEN
                INSERT INTO public.ticket_public_state (
                    id,
                    raffle_id,
                    number,
                    status,
                    updated_at
                ) VALUES (
                    NEW.id,
                    NEW.raffle_id,
                    NEW.number,
                    v_norm_status,
                    COALESCE(NEW.updated_at, NOW())
                )
                ON CONFLICT (id) DO UPDATE SET
                    status = EXCLUDED.status,
                    updated_at = EXCLUDED.updated_at;
            END IF;
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM public.ticket_public_state WHERE id = OLD.id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ticket_public_state ON public.tickets;
CREATE TRIGGER trg_sync_ticket_public_state
AFTER INSERT OR UPDATE OR DELETE ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_ticket_public_state();

-- ------------------------------------------------------------------------------
-- 4. POLÍTICAS ROW LEVEL SECURITY (RLS) PARA ticket_public_state
-- ------------------------------------------------------------------------------
ALTER TABLE public.ticket_public_state ENABLE ROW LEVEL SECURITY;

-- Lectura pública para anon y authenticated (grilla pública sin PII)
DROP POLICY IF EXISTS "Lectura pública de estado de boletos" ON public.ticket_public_state;
CREATE POLICY "Lectura pública de estado de boletos" 
ON public.ticket_public_state
FOR SELECT 
USING (true);

-- Revocar privilegios de mutación a clientes de PostgREST
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.ticket_public_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ticket_public_state TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. BLINDAJE DE PRIVACIDAD EN public.tickets (SOLO ADMINISTRADORES)
-- ------------------------------------------------------------------------------
-- Eliminar la política permisiva histórica de lectura pública
DROP POLICY IF EXISTS "Lectura pública de boletos" ON public.tickets;

-- Revocar SELECT directo a usuarios anónimos y al rol público general
REVOKE ALL ON TABLE public.tickets FROM anon, PUBLIC;

-- Permitir SELECT a authenticated y service_role (restringido por RLS)
GRANT SELECT ON TABLE public.tickets TO authenticated, service_role;

-- Crear política RLS exclusiva para administradores autenticados
DROP POLICY IF EXISTS "Administradores pueden gestionar boletos" ON public.tickets;
CREATE POLICY "Administradores pueden gestionar boletos" 
ON public.tickets
FOR ALL 
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 6. CONFIGURACIÓN DEFENSIVA DE SUPABASE REALTIME
-- ------------------------------------------------------------------------------
ALTER TABLE public.ticket_public_state REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        -- A. Remover public.tickets de la publicación para prevenir difusión de PII
        BEGIN
            ALTER PUBLICATION supabase_realtime DROP TABLE public.tickets;
        EXCEPTION
            WHEN undefined_object THEN NULL;
            WHEN insufficient_privilege THEN
                RAISE NOTICE 'Aviso de infraestructura: Rol de runner no es propietario de supabase_realtime para remover tickets.';
        END;

        -- B. Agregar public.ticket_public_state a la publicación
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_public_state;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN insufficient_privilege THEN
                RAISE NOTICE 'Aviso de infraestructura: Rol de runner no es propietario de supabase_realtime para agregar ticket_public_state.';
        END;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7. COMENTARIOS FORMALES EN EL CATÁLOGO DE POSTGRESQL
-- ------------------------------------------------------------------------------
COMMENT ON TABLE public.ticket_public_state IS 
'Proyección pública del estado de boletos para visualización en la grilla y Realtime (CRIT-01 / EVENT-02). Libre de PII (sin buyer_id ni order_id).';

COMMENT ON POLICY "Lectura pública de estado de boletos" ON public.ticket_public_state IS 
'Permite SELECT público anónimo y autenticado exclusivamente sobre id, raffle_id, number, status y updated_at.';

COMMENT ON POLICY "Administradores pueden gestionar boletos" ON public.tickets IS 
'Acceso a la tabla completa public.tickets (con buyer_id y order_id) restringido exclusivamente a administradores verificados mediante is_admin().';
