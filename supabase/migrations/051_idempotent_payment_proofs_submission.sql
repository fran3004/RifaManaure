-- ============================================================================
-- Migración 051: Idempotencia y Blindaje de Comprobantes de Pago
-- (Auditoría 03 — Remediación 3)
-- ============================================================================
-- 1. Agrega columnas client_idempotency_key e idempotency_fingerprint a public.payment_proofs
-- 2. Backfill transparente de registros históricos de payment_proofs
-- 3. Restricción UNIQUE en client_idempotency_key
-- 4. Restricción UNIQUE parcial: un único comprobante activo (status = 'pending') por order_id
-- 5. Actualiza submit_payment_proof con:
--    - p_client_idempotency_key UUID DEFAULT NULL
--    - Advisory locks para serialización concurrente
--    - Cálculo server-side de fingerprint criptográfico SHA-256
--    - Detección de replay idempotente y conflicto de parámetros
--    - Reemplazo atómico (UPDATE) si ya existe comprobante pending para la orden
--    - Rechazo categórico si la orden está en estado terminal (paid, rejected, expired, cancelled)
--    - Registro en audit_logs de PAYMENT_PROOF_SUBMITTED o PAYMENT_PROOF_REPLACED
-- ============================================================================

-- 1. Agregar columnas a payment_proofs
ALTER TABLE public.payment_proofs
  ADD COLUMN IF NOT EXISTS client_idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint VARCHAR(64);

-- 2. Backfill transparente de filas existentes
UPDATE public.payment_proofs
SET client_idempotency_key = gen_random_uuid()
WHERE client_idempotency_key IS NULL;

ALTER TABLE public.payment_proofs
  ALTER COLUMN client_idempotency_key SET DEFAULT gen_random_uuid(),
  ALTER COLUMN client_idempotency_key SET NOT NULL;

-- 3. Índices de unicidad e idempotencia
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_proofs_client_idempotency_key
  ON public.payment_proofs(client_idempotency_key);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_idempotency_fingerprint
  ON public.payment_proofs(idempotency_fingerprint);

-- 4. Invariante estructural: máximo un comprobante activo por orden
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_proofs_single_pending_per_order
  ON public.payment_proofs(order_id)
  WHERE status = 'pending';

-- 5. Eliminar versión previa de 6 argumentos para prevenir ambigüedad de sobrecarga (42725)
DROP FUNCTION IF EXISTS public.submit_payment_proof(UUID, TEXT, TEXT, INTEGER, VARCHAR, TEXT);
DROP FUNCTION IF EXISTS public.submit_payment_proof(UUID, TEXT, TEXT, INTEGER, CHARACTER VARYING, TEXT);

-- 6. Crear nueva definición con soporte de idempotencia
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
    p_order_id UUID,
    p_file_path TEXT,
    p_file_name TEXT,
    p_file_size INTEGER,
    p_mime_type VARCHAR,
    p_payment_reference TEXT DEFAULT NULL,
    p_client_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_proof_id UUID;
    v_idempotency_key UUID;
    v_fingerprint_source TEXT;
    v_fingerprint VARCHAR(64);
    v_existing_proof_by_key RECORD;
    v_existing_pending_proof RECORD;
    v_is_replacement BOOLEAN := false;
BEGIN
    -- 1. Resolver clave de idempotencia
    v_idempotency_key := COALESCE(p_client_idempotency_key, gen_random_uuid());

    -- 2. Serializar ejecuciones concurrentes con la misma clave mediante bloqueo consultivo
    PERFORM pg_advisory_xact_lock(hashtext('proof:' || v_idempotency_key::TEXT));

    -- 3. Cálculo de la huella digital criptográfica SHA-256 en el servidor
    v_fingerprint_source := p_order_id::TEXT || '|' ||
                            p_file_path || '|' ||
                            COALESCE(p_file_size::TEXT, '0') || '|' ||
                            LOWER(p_mime_type) || '|' ||
                            COALESCE(TRIM(p_payment_reference), '');

    v_fingerprint := encode(digest(v_fingerprint_source, 'sha256'), 'hex');

    -- 4. Verificación de Idempotencia previa: Replay vs Conflicto
    SELECT id, order_id, status, idempotency_fingerprint
    INTO v_existing_proof_by_key
    FROM public.payment_proofs
    WHERE client_idempotency_key = v_idempotency_key;

    IF FOUND THEN
        IF v_existing_proof_by_key.idempotency_fingerprint IS NOT NULL 
           AND v_existing_proof_by_key.idempotency_fingerprint <> v_fingerprint THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'IDEMPOTENCY_CONFLICT',
                'error', 'Conflicto de idempotencia: la clave ya fue utilizada con un comprobante o parámetros diferentes.'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'proof_id', v_existing_proof_by_key.id,
            'order_id', v_existing_proof_by_key.order_id,
            'status', 'pending_verification',
            'idempotency_replayed', true,
            'is_replacement', false,
            'message', 'Comprobante previamente recibido y registrado. Tu pago está pendiente de verificación.'
        );
    END IF;

    -- 5. Validar existencia y bloquear la fila de la orden pesimistamente
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ORDER_NOT_FOUND',
            'error', 'La orden de compra especificada no existe en el sistema.'
        );
    END IF;

    -- 6. Validar estado correcto de la orden
    IF v_order.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_ORDER_STATUS',
            'error', 'La orden se encuentra en estado "' || v_order.status || '" y no admite nuevos comprobantes.'
        );
    END IF;

    -- 7. Validar correspondencia estricta de la ruta del archivo con la orden objetivo (Anti-Spoofing)
    IF NOT (
        p_file_path LIKE 'proofs/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE 'proofs/%/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE '%/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE 'data:image/%'
        OR p_file_path LIKE 'data:application/pdf%'
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_PATH',
            'error', 'La ruta del comprobante no corresponde al identificador de la orden que se intenta procesar.'
        );
    END IF;

    -- 8. Validar formato de archivo y tamaño (5 MB máximo)
    IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_MIME_TYPE',
            'error', 'Formato de archivo no permitido. Solo se admiten JPG, PNG, WEBP o PDF.'
        );
    END IF;

    IF p_file_size > 5242880 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FILE_TOO_LARGE',
            'error', 'El archivo excede el tamaño máximo permitido de 5 MB.'
        );
    END IF;

    -- 9. Invariante: Máximo un comprobante ACTIVO/PENDIENTE por orden
    SELECT id, file_path, client_idempotency_key, idempotency_fingerprint
    INTO v_existing_pending_proof
    FROM public.payment_proofs
    WHERE order_id = p_order_id
      AND status = 'pending'
    FOR UPDATE;

    IF FOUND THEN
        -- Ya existe un comprobante pendiente: reemplazar/actualizar registro existente
        UPDATE public.payment_proofs
        SET file_path = p_file_path,
            file_name = p_file_name,
            file_size = p_file_size,
            mime_type = p_mime_type,
            payment_reference = p_payment_reference,
            client_idempotency_key = v_idempotency_key,
            idempotency_fingerprint = v_fingerprint,
            updated_at = NOW()
        WHERE id = v_existing_pending_proof.id;

        v_proof_id := v_existing_pending_proof.id;
        v_is_replacement := true;
    ELSE
        -- No existe comprobante pendiente: insertar nuevo registro
        BEGIN
            INSERT INTO public.payment_proofs (
                raffle_id,
                order_id,
                buyer_id,
                file_path,
                file_name,
                file_size,
                mime_type,
                status,
                payment_reference,
                client_idempotency_key,
                idempotency_fingerprint
            ) VALUES (
                v_order.raffle_id,
                p_order_id,
                v_order.buyer_id,
                p_file_path,
                p_file_name,
                p_file_size,
                p_mime_type,
                'pending',
                p_payment_reference,
                v_idempotency_key,
                v_fingerprint
            )
            RETURNING id INTO v_proof_id;
            v_is_replacement := false;
        EXCEPTION
            WHEN unique_violation THEN
                -- Reintento concurrente capturado por índice único
                SELECT id, order_id, status, idempotency_fingerprint
                INTO v_existing_proof_by_key
                FROM public.payment_proofs
                WHERE client_idempotency_key = v_idempotency_key;

                IF FOUND THEN
                    IF v_existing_proof_by_key.idempotency_fingerprint IS NOT NULL 
                       AND v_existing_proof_by_key.idempotency_fingerprint <> v_fingerprint THEN
                        RETURN jsonb_build_object(
                            'success', false,
                            'code', 'IDEMPOTENCY_CONFLICT',
                            'error', 'Conflicto de idempotencia: la clave ya fue utilizada con un comprobante o parámetros diferentes.'
                        );
                    END IF;

                    RETURN jsonb_build_object(
                        'success', true,
                        'proof_id', v_existing_proof_by_key.id,
                        'order_id', v_existing_proof_by_key.order_id,
                        'status', 'pending_verification',
                        'idempotency_replayed', true,
                        'is_replacement', false,
                        'message', 'Comprobante previamente recibido y registrado. Tu pago está pendiente de verificación.'
                    );
                ELSE
                    RAISE;
                END IF;
        END;
    END IF;

    -- 10. Actualizar orden al estado 'pending_verification' y asociar el comprobante
    UPDATE public.orders
    SET receipt_url = p_file_path,
        payment_gateway_id = COALESCE(p_payment_reference, payment_gateway_id),
        status = 'pending_verification',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 11. Proteger los boletos vinculados a esta orden
    UPDATE public.tickets
    SET updated_at = NOW()
    WHERE order_id = p_order_id;

    -- 12. Registrar evento en auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        CASE WHEN v_is_replacement THEN 'PAYMENT_PROOF_REPLACED' ELSE 'PAYMENT_PROOF_SUBMITTED' END,
        'order',
        p_order_id::TEXT,
        jsonb_build_object(
            'proof_id', v_proof_id,
            'reference', v_order.reference,
            'file_name', p_file_name,
            'file_size', p_file_size,
            'mime_type', p_mime_type,
            'payment_reference', p_payment_reference,
            'client_idempotency_key', v_idempotency_key,
            'is_replacement', v_is_replacement
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'proof_id', v_proof_id,
        'order_id', p_order_id,
        'status', 'pending_verification',
        'idempotency_replayed', false,
        'is_replacement', v_is_replacement,
        'message', 'Comprobante enviado correctamente. Tu pago está pendiente de verificación.'
    );
END;
$$;

-- 7. Asignar permisos estrictos
REVOKE ALL ON FUNCTION public.submit_payment_proof(UUID, TEXT, TEXT, INTEGER, VARCHAR, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(UUID, TEXT, TEXT, INTEGER, VARCHAR, TEXT, UUID) TO anon, authenticated, service_role;
