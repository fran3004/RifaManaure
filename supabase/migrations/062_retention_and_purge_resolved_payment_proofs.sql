-- ==============================================================================
-- Migración 062: Sistema de Retención y Depuración Automática de Comprobantes (5 Días)
-- ==============================================================================
-- Justificación y Regla de Negocio:
-- 1. Los comprobantes de pago (imágenes y PDFs) de órdenes ya revisadas (aprobadas
--    o rechazadas) deben conservarse durante 5 días calendario para su respectiva
--    auditoría visual por parte de los administradores.
-- 2. Transcurridos 5 días desde su verificación (verified_at), el archivo binario pesado
--    se elimina del almacenamiento del sistema ('payment-proofs') para evitar el copado
--    de la cuota de almacenamiento.
-- 3. GARANTÍA ESTRICTA DE SEGURIDAD: JAMÁS se eliminan comprobantes en estado 'pending'
--    ni órdenes en proceso de verificación ('pending', 'pending_verification').
-- 4. INTEGRIDAD FINANCIERA: La orden de compra, el comprador, el monto pagado, la
--    referencia bancaria, las notas del administrador y los boletos asignados permanecen
--    100% intactos en la base de datos de manera permanente. Solo se retira el archivo adjunto.
-- ==============================================================================

-- 1. Agregar columnas de trazabilidad de depuración en public.payment_proofs y public.orders
ALTER TABLE public.payment_proofs 
ADD COLUMN IF NOT EXISTS file_purged BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS file_purged_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS receipt_purged BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS receipt_purged_at TIMESTAMPTZ DEFAULT NULL;

-- Índices para optimizar las consultas del procedimiento de depuración
CREATE INDEX IF NOT EXISTS idx_payment_proofs_retention 
ON public.payment_proofs (status, verified_at) 
WHERE file_purged = FALSE AND status IN ('approved', 'rejected');

CREATE INDEX IF NOT EXISTS idx_orders_receipt_purged 
ON public.orders (receipt_purged, status);

-- 2. Función del Sistema para Depuración Automática de Comprobantes Resueltos
CREATE OR REPLACE FUNCTION public.cleanup_resolved_payment_proofs(
    p_retention_days INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage, pg_temp
AS $$
DECLARE
    v_acquired_lock BOOLEAN;
    v_effective_retention INTEGER;
    v_purged_proofs_count INTEGER := 0;
    v_purged_files_count INTEGER := 0;
    v_target_record RECORD;
    v_target_paths TEXT[] := '{}';
    v_target_proof_ids UUID[] := '{}';
    v_target_order_ids UUID[] := '{}';
BEGIN
    -- 2.1 Control de concurrencia mediante Advisory Lock
    -- Evita ejecuciones paralelas simultáneas del proceso de depuración
    v_acquired_lock := pg_try_advisory_xact_lock(hashtext('cleanup_resolved_payment_proofs'));
    IF NOT v_acquired_lock THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'El proceso de depuración ya se encuentra en ejecución.',
            'purged_count', 0
        );
    END IF;

    -- Validar que la retención no sea inferior a 1 día por seguridad
    v_effective_retention := GREATEST(COALESCE(p_retention_days, 5), 1);

    -- 2.2 Seleccionar comprobantes aprobados o rechazados con más de p_retention_days días
    -- FILTRO ESTRICTO: Exclusión absoluta de estado 'pending' o verificaciones pendientes
    FOR v_target_record IN
        SELECT 
            pp.id AS proof_id,
            pp.order_id,
            pp.file_path
        FROM public.payment_proofs pp
        JOIN public.orders o ON o.id = pp.order_id
        WHERE pp.file_purged = FALSE
          AND pp.status IN ('approved', 'rejected') -- Solo estados resueltos
          AND pp.status != 'pending'                 -- INVARIANTE INQUEBRANTABLE
          AND pp.verified_at IS NOT NULL
          AND pp.verified_at < NOW() - (v_effective_retention || ' days')::INTERVAL
          AND o.status IN ('paid', 'rejected', 'expired', 'cancelled') -- Solo órdenes concluidas
          AND o.status NOT IN ('pending', 'pending_verification')      -- INVARIANTE INQUEBRANTABLE
          AND pp.file_path IS NOT NULL
          AND TRIM(pp.file_path) != ''
        FOR UPDATE OF pp SKIP LOCKED
    LOOP
        v_target_proof_ids := array_append(v_target_proof_ids, v_target_record.proof_id);
        v_target_order_ids := array_append(v_target_order_ids, v_target_record.order_id);
        v_target_paths     := array_append(v_target_paths, v_target_record.file_path);
    END LOOP;

    v_purged_proofs_count := COALESCE(array_length(v_target_proof_ids, 1), 0);

    -- 2.3 Si hay comprobantes para depurar, proceder a eliminar archivos de storage.objects
    IF v_purged_proofs_count > 0 THEN
        -- A. Eliminar archivos binarios pesados del almacenamiento
        DELETE FROM storage.objects
        WHERE bucket_id = 'payment-proofs'
          AND name = ANY(v_target_paths);

        GET DIAGNOSTICS v_purged_files_count = ROW_COUNT;

        -- B. Marcar comprobantes como depurados en public.payment_proofs
        UPDATE public.payment_proofs
        SET file_purged = TRUE,
            file_purged_at = NOW(),
            updated_at = NOW()
        WHERE id = ANY(v_target_proof_ids);

        -- C. Marcar órdenes correspondientes con soporte archivado
        UPDATE public.orders
        SET receipt_purged = TRUE,
            receipt_purged_at = NOW(),
            updated_at = NOW()
        WHERE id = ANY(v_target_order_ids);

        -- D. Registrar en bitácora de auditoría del sistema
        INSERT INTO public.audit_logs (
            action,
            entity_type,
            entity_id,
            performed_by,
            details
        ) VALUES (
            'CLEANUP_PAYMENT_PROOFS',
            'system_maintenance',
            gen_random_uuid()::TEXT,
            auth.uid(),
            jsonb_build_object(
                'purged_proofs_count', v_purged_proofs_count,
                'purged_files_count', v_purged_files_count,
                'retention_days', v_effective_retention,
                'execution_timestamp', NOW()
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Depuración de comprobantes ejecutada correctamente.',
        'purged_proofs_count', v_purged_proofs_count,
        'purged_files_count', v_purged_files_count,
        'retention_days', v_effective_retention
    );
END;
$$;

-- 3. Permisos de Ejecución
-- Solo administradores autenticados o service_role pueden invocar la depuración
REVOKE ALL ON FUNCTION public.cleanup_resolved_payment_proofs(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_resolved_payment_proofs(INTEGER) TO authenticated, service_role;

-- 4. Programación Automática en el Planificador del Sistema (pg_cron)
-- Se programa para ejecutarse diariamente a las 04:00 AM UTC
DO $$
DECLARE
    v_has_pg_cron BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) INTO v_has_pg_cron;

    IF v_has_pg_cron THEN
        -- Desprogramar versión anterior si existía para evitar duplicados
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-resolved-payment-proofs-job') THEN
            PERFORM cron.unschedule('cleanup-resolved-payment-proofs-job');
        END IF;

        -- Programar ejecución diaria a las 04:00 AM UTC
        PERFORM cron.schedule(
            'cleanup-resolved-payment-proofs-job',
            '0 4 * * *',
            'SELECT public.cleanup_resolved_payment_proofs(5);'
        );
    END IF;
END;
$$;
