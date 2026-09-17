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

