-- ============================================================================
-- MIGRACIÓN 040: Habilitar Supabase Realtime para Tablas Operativas
-- Resolución Idempotente y Defensiva para Hallazgo DB-02 (Crítico)
-- ============================================================================

-- 1. Asegurar REPLICA IDENTITY FULL en todas las tablas operativas
-- (Permite que Supabase Realtime transmita la fila completa anterior y nueva
--  en eventos UPDATE y DELETE)
-- ----------------------------------------------------------------------------
ALTER TABLE public.tickets REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.raffles REPLICA IDENTITY FULL;
ALTER TABLE public.winners REPLICA IDENTITY FULL;
ALTER TABLE public.system_settings REPLICA IDENTITY FULL;
ALTER TABLE public.payment_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.partners REPLICA IDENTITY FULL;

-- 2. Habilitar publicación 'supabase_realtime' de forma segura e idempotente
-- ----------------------------------------------------------------------------
-- NOTA DE PERMISOS:
-- En Supabase la publicación 'supabase_realtime' usualmente pertenece al rol
-- 'postgres'. Si en algún entorno el runner no cuenta con permisos de propietario
-- sobre la publicación, el bloque de excepciones captura 'insufficient_privilege'
-- emitiendo un NOTICE informativo sin abortar la migración, garantizando que
-- los despliegues limpios nunca fallen por restricciones de rol de infraestructura.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        -- A. Tabla tickets
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN insufficient_privilege THEN
                RAISE NOTICE 'Aviso de infraestructura: Se requieren permisos de propietario en supabase_realtime para agregar public.tickets. Active el toggle en Supabase Dashboard (Database -> Publications).';
        END;

        -- B. Tabla orders
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN insufficient_privilege THEN
                RAISE NOTICE 'Aviso de infraestructura: Se requieren permisos de propietario en supabase_realtime para agregar public.orders. Active el toggle en Supabase Dashboard (Database -> Publications).';
        END;

        -- C. Tabla raffles
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.raffles;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN insufficient_privilege THEN
                RAISE NOTICE 'Aviso de infraestructura: Se requieren permisos de propietario en supabase_realtime para agregar public.raffles.';
        END;

        -- D. Tabla winners
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.winners;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN insufficient_privilege THEN
                RAISE NOTICE 'Aviso de infraestructura: Se requieren permisos de propietario en supabase_realtime para agregar public.winners.';
        END;

        -- E. Tabla system_settings
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN insufficient_privilege THEN
                RAISE NOTICE 'Aviso de infraestructura: Se requieren permisos de propietario en supabase_realtime para agregar public.system_settings.';
        END;
    ELSE
        RAISE NOTICE 'La publicación supabase_realtime no existe en esta instancia de PostgreSQL.';
    END IF;
END $$;
