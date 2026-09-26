-- ==============================================================================
-- MIGRACIÓN 070: Vaciado Manual y Gestión de Almacenamiento de Comprobantes
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- OBJETIVOS:
-- 1. Crear función RPC public.admin_get_payment_proofs_storage_stats(p_raffle_id UUID DEFAULT NULL):
--    Permite al administrador auditar el estado del almacenamiento en tiempo real:
--    comprobantes activos, comprobantes resueltos listos para vaciado, comprobantes
--    pendientes protegidos y comprobantes ya depurados previamente.
-- 2. Crear función RPC public.admin_purge_payment_proofs_storage(p_scope TEXT DEFAULT 'resolved', p_raffle_id UUID DEFAULT NULL):
--    Permite vaciar a demanda el almacenamiento del bucket 'payment-proofs' sin
--    tener que esperar el plazo automático de 5 días de retención, liberando espacio
--    inmediatamente mientras se garantiza la integridad contable de órdenes y boletos.
-- ==============================================================================

-- 1. RPC para consultar estadísticas de almacenamiento de comprobantes
CREATE OR REPLACE FUNCTION public.admin_get_payment_proofs_storage_stats(
    p_raffle_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_total_proofs INTEGER := 0;
    v_active_files_count INTEGER := 0;
    v_resolved_files_count INTEGER := 0;
    v_pending_files_count INTEGER := 0;
    v_purged_files_count INTEGER := 0;
    v_storage_objects_count INTEGER := 0;
    v_raffle_title TEXT := NULL;
BEGIN
    -- 1.1 Verificación de autorización de administrador
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE (user_id = v_admin_id OR id = v_admin_id)
          AND is_active = true
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'error', 'Acceso denegado: solo administradores autorizados pueden consultar métricas de almacenamiento.'
        );
    END IF;

    -- 1.2 Obtener título de la rifa si se especifica
    IF p_raffle_id IS NOT NULL THEN
        SELECT title INTO v_raffle_title
        FROM public.raffles
        WHERE id = p_raffle_id;
    END IF;

    -- 1.3 Conteo de registros en public.payment_proofs
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE pp.file_purged = FALSE AND pp.file_path IS NOT NULL AND TRIM(pp.file_path) != ''),
        COUNT(*) FILTER (WHERE pp.file_purged = FALSE AND pp.status IN ('approved', 'rejected') AND o.status IN ('paid', 'rejected', 'expired', 'cancelled')),
        COUNT(*) FILTER (WHERE pp.file_purged = FALSE AND (pp.status = 'pending' OR o.status IN ('pending', 'pending_verification'))),
        COUNT(*) FILTER (WHERE pp.file_purged = TRUE)
    INTO
        v_total_proofs,
        v_active_files_count,
        v_resolved_files_count,
        v_pending_files_count,
        v_purged_files_count
    FROM public.payment_proofs pp
    JOIN public.orders o ON o.id = pp.order_id
    WHERE (p_raffle_id IS NULL OR pp.raffle_id = p_raffle_id);

    -- 1.4 Conteo de archivos físicos en storage.objects para el bucket 'payment-proofs'
    IF p_raffle_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_storage_objects_count
        FROM storage.objects
        WHERE bucket_id = 'payment-proofs'
          AND (name LIKE 'proofs/' || p_raffle_id || '/%' OR name LIKE '%' || p_raffle_id || '%');
    ELSE
        SELECT COUNT(*) INTO v_storage_objects_count
        FROM storage.objects
        WHERE bucket_id = 'payment-proofs';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'raffle_id', p_raffle_id,
        'raffle_title', v_raffle_title,
        'total_proofs', COALESCE(v_total_proofs, 0),
        'active_files_count', COALESCE(v_active_files_count, 0),
        'resolved_files_count', COALESCE(v_resolved_files_count, 0),
        'pending_files_count', COALESCE(v_pending_files_count, 0),
        'purged_files_count', COALESCE(v_purged_files_count, 0),
        'storage_objects_count', COALESCE(v_storage_objects_count, 0)
    );
END;
$$;

-- 2. RPC para vaciado manual de comprobantes de pago a demanda
CREATE OR REPLACE FUNCTION public.admin_purge_payment_proofs_storage(
    p_scope TEXT DEFAULT 'resolved',
    p_raffle_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_acquired_lock BOOLEAN;
    v_target_record RECORD;
    v_target_paths TEXT[] := '{}';
    v_target_proof_ids UUID[] := '{}';
    v_target_order_ids UUID[] := '{}';
    v_purged_proofs_count INTEGER := 0;
    v_purged_files_count INTEGER := 0;
    v_extra_objects_count INTEGER := 0;
    v_valid_scope TEXT;
BEGIN
    -- 2.1 Verificación de autorización de administrador
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE (user_id = v_admin_id OR id = v_admin_id)
          AND is_active = true
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'error', 'Acceso denegado: solo administradores autorizados pueden vaciar el almacenamiento de comprobantes.'
        );
    END IF;

    -- 2.2 Control de concurrencia mediante Advisory Lock
    v_acquired_lock := pg_try_advisory_xact_lock(hashtext('admin_purge_payment_proofs_storage'));
    IF NOT v_acquired_lock THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CONCURRENT_EXECUTION',
            'error', 'Un proceso de vaciado o depuración de comprobantes ya se encuentra en ejecución. Por favor espera unos momentos.',
            'purged_proofs_count', 0,
            'purged_files_count', 0
        );
    END IF;

    -- Normalizar y validar scope ('resolved' o 'all')
    v_valid_scope := LOWER(COALESCE(TRIM(p_scope), 'resolved'));
    IF v_valid_scope NOT IN ('resolved', 'all') THEN
        v_valid_scope := 'resolved';
    END IF;

    -- 2.3 Selección de registros según el alcance
    IF v_valid_scope = 'resolved' THEN
        -- Modo Seguro: Solo órdenes ya concluidas y comprobantes aprobados o rechazados
        FOR v_target_record IN
            SELECT 
                pp.id AS proof_id,
                pp.order_id,
                pp.file_path
            FROM public.payment_proofs pp
            JOIN public.orders o ON o.id = pp.order_id
            WHERE pp.file_purged = FALSE
              AND pp.status IN ('approved', 'rejected')
              AND pp.status != 'pending'
              AND o.status IN ('paid', 'rejected', 'expired', 'cancelled')
              AND o.status NOT IN ('pending', 'pending_verification')
              AND pp.file_path IS NOT NULL
              AND TRIM(pp.file_path) != ''
              AND (p_raffle_id IS NULL OR pp.raffle_id = p_raffle_id)
            FOR UPDATE OF pp SKIP LOCKED
        LOOP
            v_target_proof_ids := array_append(v_target_proof_ids, v_target_record.proof_id);
            v_target_order_ids := array_append(v_target_order_ids, v_target_record.order_id);
            v_target_paths     := array_append(v_target_paths, v_target_record.file_path);
        END LOOP;
    ELSE
        -- Modo Vaciado Completo: Todos los comprobantes con archivo físico
        FOR v_target_record IN
            SELECT 
                pp.id AS proof_id,
                pp.order_id,
                pp.file_path
            FROM public.payment_proofs pp
            JOIN public.orders o ON o.id = pp.order_id
            WHERE pp.file_purged = FALSE
              AND pp.file_path IS NOT NULL
              AND TRIM(pp.file_path) != ''
              AND (p_raffle_id IS NULL OR pp.raffle_id = p_raffle_id)
            FOR UPDATE OF pp SKIP LOCKED
        LOOP
            v_target_proof_ids := array_append(v_target_proof_ids, v_target_record.proof_id);
            v_target_order_ids := array_append(v_target_order_ids, v_target_record.order_id);
            v_target_paths     := array_append(v_target_paths, v_target_record.file_path);
        END LOOP;
    END IF;

    v_purged_proofs_count := COALESCE(array_length(v_target_proof_ids, 1), 0);

    -- 2.4 Eliminación de archivos en storage.objects
    IF v_purged_proofs_count > 0 THEN
        -- Eliminar los archivos específicos de la lista
        DELETE FROM storage.objects
        WHERE bucket_id = 'payment-proofs'
          AND name = ANY(v_target_paths);

        GET DIAGNOSTICS v_purged_files_count = ROW_COUNT;

        -- Marcar comprobantes en public.payment_proofs
        UPDATE public.payment_proofs
        SET file_purged = TRUE,
            file_purged_at = NOW(),
            updated_at = NOW()
        WHERE id = ANY(v_target_proof_ids);

        -- Marcar órdenes asociadas en public.orders
        UPDATE public.orders
        SET receipt_purged = TRUE,
            receipt_purged_at = NOW(),
            updated_at = NOW()
        WHERE id = ANY(v_target_order_ids);
    END IF;

    -- Si se solicitó vaciado completo ('all'), depurar además archivos residuales u huérfanos del bucket
    IF v_valid_scope = 'all' THEN
        IF p_raffle_id IS NOT NULL THEN
            DELETE FROM storage.objects
            WHERE bucket_id = 'payment-proofs'
              AND (name LIKE 'proofs/' || p_raffle_id || '/%' OR name LIKE '%' || p_raffle_id || '%');
        ELSE
            DELETE FROM storage.objects
            WHERE bucket_id = 'payment-proofs';
        END IF;

        GET DIAGNOSTICS v_extra_objects_count = ROW_COUNT;
        v_purged_files_count := v_purged_files_count + v_extra_objects_count;
    END IF;

    -- 2.5 Registro de auditoría administrativa
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'ADMIN_PURGE_PAYMENT_PROOFS_STORAGE',
        'storage_maintenance',
        COALESCE(p_raffle_id::TEXT, 'all_raffles'),
        v_admin_id,
        jsonb_build_object(
            'scope', v_valid_scope,
            'raffle_id', p_raffle_id,
            'purged_proofs_count', v_purged_proofs_count,
            'purged_files_count', v_purged_files_count,
            'executed_by', v_admin_id,
            'timestamp', NOW()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', CASE 
            WHEN v_purged_proofs_count = 0 AND v_purged_files_count = 0 THEN 
                'No se encontraron archivos pendientes por vaciar en el almacenamiento.'
            ELSE 
                format('Almacenamiento vaciado: se depuraron %s comprobante(s) (%s archivo(s) eliminados).', v_purged_proofs_count, v_purged_files_count)
        END,
        'scope', v_valid_scope,
        'raffle_id', p_raffle_id,
        'purged_proofs_count', v_purged_proofs_count,
        'purged_files_count', v_purged_files_count
    );
END;
$$;

-- 3. Permisos de ejecución
REVOKE ALL ON FUNCTION public.admin_get_payment_proofs_storage_stats(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_payment_proofs_storage_stats(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_purge_payment_proofs_storage(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_payment_proofs_storage(TEXT, UUID) TO authenticated, service_role;
