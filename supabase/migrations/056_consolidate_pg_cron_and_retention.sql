-- ==============================================================================
-- MIGRACIÓN 056: CONSOLIDACIÓN DE PG_CRON, ADVISORY LOCKS Y RETENCIÓN DE HISTORIAL
-- AUDITORÍA 05 — REMEDIACIÓN 5 (CRIT-04, EVENT-08, EVENT-10)
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- 1. Establece pg_cron como el programador primario único y canónico para
--    la liberación periódica de reservas temporales expiradas (cada 5 minutos).
-- 2. Endurece public.release_expired_reservations() con advisory transaction lock
--    (pg_try_advisory_xact_lock) para prevenir cualquier solapamiento concurrente.
-- 3. Implementa una política de retención oficial de 30 días para cron.job_run_details,
--    evitando el crecimiento indefinido de la tabla sin purgar prematuramente bitácoras
--    necesarias para respuesta a incidentes y análisis forense (rechazando purga a 7 días).
-- 4. Programa un job de mantenimiento diario de baja frecuencia para ejecutar la retención.
-- ==============================================================================

-- ==============================================================================
-- SECCIÓN 1: HARDENING ATÓMICO Y CONCURRENTE DE release_expired_reservations()
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_acquired_lock BOOLEAN;
    v_expired_order_ids UUID[];
    v_released_orders_count INTEGER := 0;
    v_released_tickets_count INTEGER := 0;
    v_orphan_tickets_count INTEGER := 0;
BEGIN
    -- 1. Control de Concurrencia y Prevención de Solapamiento (Advisory Transaction Lock)
    -- Si una ejecución de pg_cron o una invocación manual de contingencia ya está en curso,
    -- salir inmediatamente retornando 0 sin bloquear hilos ni generar contención.
    v_acquired_lock := pg_try_advisory_xact_lock(hashtext('release_expired_reservations'));
    IF NOT v_acquired_lock THEN
        RETURN 0;
    END IF;

    -- 2. Identificar y bloquear pesimistamente las órdenes pendientes cuyas reservas ya expiraron
    -- FOR UPDATE SKIP LOCKED sobre órdenes identificadas vía EXISTS
    SELECT array_agg(id)
    INTO v_expired_order_ids
    FROM (
        SELECT o.id
        FROM public.orders o
        WHERE o.status = 'pending'
          AND EXISTS (
              SELECT 1
              FROM public.tickets t
              WHERE t.order_id = o.id
                AND t.status = 'reserved'
                AND t.reservation_expires_at < NOW()
          )
        FOR UPDATE SKIP LOCKED
    ) sub;

    -- 3. Si existen órdenes expiradas bloqueadas, proceder a transicionar y liberar
    IF v_expired_order_ids IS NOT NULL AND array_length(v_expired_order_ids, 1) > 0 THEN
        -- Bloquear pesimistamente los boletos asociados a estas órdenes
        PERFORM 1
        FROM public.tickets
        WHERE order_id = ANY(v_expired_order_ids)
        FOR UPDATE;

        -- Transicionar órdenes a 'expired'
        UPDATE public.orders
        SET status = 'expired',
            rejection_reason = COALESCE(rejection_reason, 'Tiempo límite de reserva de 10 minutos agotado sin confirmación de pago.'),
            updated_at = NOW()
        WHERE id = ANY(v_expired_order_ids)
          AND status = 'pending';

        GET DIAGNOSTICS v_released_orders_count = ROW_COUNT;

        -- Liberar boletos a 'available' en la misma transacción atómica
        -- (El trigger trg_sync_ticket_public_state sincroniza automáticamente la proyección pública)
        UPDATE public.tickets
        SET status = 'available',
            reserved_at = NULL,
            reservation_expires_at = NULL,
            buyer_id = NULL,
            order_id = NULL,
            updated_at = NOW()
        WHERE order_id = ANY(v_expired_order_ids)
          AND status = 'reserved';

        GET DIAGNOSTICS v_released_tickets_count = ROW_COUNT;

        -- Registro en bitácora de auditoría financiera / operativa
        IF v_released_tickets_count > 0 THEN
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
                    'tickets_released', v_released_tickets_count,
                    'orders_expired', v_released_orders_count,
                    'expired_order_ids', v_expired_order_ids,
                    'execution_timestamp', NOW()
                )
            );
        END IF;
    END IF;

    -- 4. Limpieza de contingencia para reservas huérfanas expiradas (tickets apartados sin orden activa)
    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE status = 'reserved'
      AND reservation_expires_at < NOW()
      AND (
          order_id IS NULL 
          OR NOT EXISTS (
              SELECT 1 FROM public.orders o 
              WHERE o.id = tickets.order_id 
                AND o.status IN ('pending', 'pending_verification', 'paid', 'completed')
          )
      );

    GET DIAGNOSTICS v_orphan_tickets_count = ROW_COUNT;

    IF v_orphan_tickets_count > 0 THEN
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
                'orphan_tickets_released', v_orphan_tickets_count,
                'execution_timestamp', NOW()
            )
        );
    END IF;

    RETURN v_released_tickets_count + v_orphan_tickets_count;
END;
$$;

-- Restricción estricta de privilegios: Revocado de anon/PUBLIC; permitido solo a authenticated y service_role
REVOKE ALL ON FUNCTION public.release_expired_reservations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO authenticated, service_role;


-- ==============================================================================
-- SECCIÓN 2: FUNCIÓN DE MANTENIMIENTO Y POLÍTICA DE RETENCIÓN DE PG_CRON
-- ==============================================================================
-- Se establece una política de retención de 30 días para cron.job_run_details.
-- Rechaza la purga agresiva de 7 días para preservar la trazabilidad forense
-- exigida en respuesta a incidentes y auditorías de cumplimiento.

CREATE OR REPLACE FUNCTION public.cleanup_cron_job_run_details(p_retention_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cron, public, pg_temp
AS $$
DECLARE
    v_deleted_count INTEGER := 0;
    v_has_cron_table BOOLEAN;
    v_effective_retention INTEGER;
BEGIN
    -- Validar que la retención no sea inferior a 15 días por política de seguridad
    v_effective_retention := GREATEST(COALESCE(p_retention_days, 30), 15);

    -- Comprobar si el esquema y la tabla cron.job_run_details existen
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'cron'
          AND table_name = 'job_run_details'
    ) INTO v_has_cron_table;

    IF NOT v_has_cron_table THEN
        RETURN 0;
    END IF;

    -- Purgar registros de ejecuciones concluidas anteriores a la ventana de retención
    DELETE FROM cron.job_run_details
    WHERE end_time IS NOT NULL
      AND end_time < NOW() - (v_effective_retention || ' days')::INTERVAL;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Registrar evento en la bitácora de auditoría del sistema
    IF v_deleted_count > 0 THEN
        INSERT INTO public.audit_logs (
            action,
            entity_type,
            entity_id,
            performed_by,
            details
        ) VALUES (
            'CLEANUP_CRON_JOB_RUN_DETAILS',
            'system_maintenance',
            gen_random_uuid()::TEXT,
            NULL,
            jsonb_build_object(
                'purged_records', v_deleted_count,
                'retention_days', v_effective_retention,
                'execution_timestamp', NOW()
            )
        );
    END IF;

    RETURN v_deleted_count;
END;
$$;

-- Restricción estricta: Solo ejecutable por service_role y superusuario
REVOKE ALL ON FUNCTION public.cleanup_cron_job_run_details(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_cron_job_run_details(INTEGER) TO service_role;


-- ==============================================================================
-- SECCIÓN 3: CONSOLIDACIÓN DE JOBS EN PG_CRON
-- ==============================================================================
-- Programa los dos jobs canónicos de forma idempotente y segura en pg_cron:
-- 1. 'release-expired-reservations-job': Cada 5 minutos ('*/5 * * * *')
-- 2. 'cleanup-cron-history-job': Diariamente a las 03:00 UTC ('0 3 * * *')

DO $$
DECLARE
    v_has_pg_cron BOOLEAN;
BEGIN
    -- Verificar disponibilidad de la extensión pg_cron en el entorno actual
    SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) INTO v_has_pg_cron;

    IF NOT v_has_pg_cron THEN
        -- Intentar habilitar si el entorno lo soporta
        BEGIN
            CREATE EXTENSION IF NOT EXISTS pg_cron;
            GRANT USAGE ON SCHEMA cron TO postgres;
            v_has_pg_cron := true;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'pg_cron no disponible en este entorno de base de datos. Saltando programación de jobs nativos: %', SQLERRM;
            v_has_pg_cron := false;
        END;
    END IF;

    IF v_has_pg_cron THEN
        -- 3.1 Unschedule preventivo de versiones previas o duplicadas
        BEGIN
            PERFORM cron.unschedule('release-expired-reservations-job')
            WHERE EXISTS (
                SELECT 1 FROM cron.job WHERE jobname = 'release-expired-reservations-job'
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        BEGIN
            PERFORM cron.unschedule('cleanup-cron-history-job')
            WHERE EXISTS (
                SELECT 1 FROM cron.job WHERE jobname = 'cleanup-cron-history-job'
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        -- 3.2 Programar Job Primario de Expiración de Reservas (Cada 5 minutos)
        PERFORM cron.schedule(
            'release-expired-reservations-job',
            '*/5 * * * *',
            'SELECT public.release_expired_reservations();'
        );

        -- 3.3 Programar Job de Retención de Historial (Diario a las 03:00 UTC, retención de 30 días)
        PERFORM cron.schedule(
            'cleanup-cron-history-job',
            '0 3 * * *',
            'SELECT public.cleanup_cron_job_run_details(30);'
        );

        RAISE NOTICE 'Jobs de pg_cron consolidados exitosamente: release-expired-reservations-job (*/5 * * * *) y cleanup-cron-history-job (0 3 * * *).';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Aviso al registrar jobs en pg_cron: %', SQLERRM;
END $$;
