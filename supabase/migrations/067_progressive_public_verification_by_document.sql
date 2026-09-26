-- ==============================================================================
-- MIGRACIÓN 067: Consulta pública progresiva de órdenes y boletos por documento
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- OBJETIVO:
-- 1. Permitir que la consulta pública por cédula sea progresiva e inteligente:
--    a) Si la cédula NO tiene órdenes/boletos registrados, retornar directamente
--       sin exigir validación por teléfono ni exponer datos.
--    b) Si la cédula SÍ tiene órdenes/boletos registrados y no se ha enviado el
--       teléfono, responder informando que requiere validación de teléfono (segundo factor).
--    c) Cuando se suministre el teléfono o los últimos 4 dígitos, validar la
--       coincidencia y retornar las órdenes enmascaradas.
-- 2. Mantener intacta la búsqueda por referencia de orden directa (MV-...).
-- 3. Mantener el rate limiting contra intentos de fuerza bruta en verification_rate_limits.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.verify_public_order_or_tickets(
    p_search_term TEXT,
    p_secondary_term TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_term TEXT;
    v_clean_secondary TEXT;
    v_sec_digits TEXT;
    v_is_reference BOOLEAN;
    v_is_numeric BOOLEAN;
    v_target_key TEXT;
    v_blocked_until TIMESTAMPTZ;
    v_results JSONB := '[]'::jsonb;
    v_attempts_record RECORD;
    v_document_has_orders BOOLEAN := false;
BEGIN
    v_clean_term := TRIM(COALESCE(p_search_term, ''));
    v_clean_secondary := TRIM(COALESCE(p_secondary_term, ''));

    IF v_clean_term = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El término de búsqueda no puede estar vacío.',
            'orders', '[]'::jsonb
        );
    END IF;

    -- Clasificar tipo de búsqueda
    v_is_reference := (UPPER(v_clean_term) LIKE 'MV-%' OR v_clean_term ~* '^[A-Z0-9\-]{5,32}$' AND v_clean_term ~* '[A-Z]');
    v_is_numeric := (v_clean_term ~ '^[0-9]{3,20}$');

    -- Clave canónica para rate limiting
    v_target_key := CASE 
        WHEN v_is_reference THEN 'ref:' || UPPER(v_clean_term)
        ELSE 'doc:' || v_clean_term
    END;

    -- Purga oportunista de registros antiguos de rate limiting (> 1 día)
    DELETE FROM public.verification_rate_limits 
    WHERE updated_at < NOW() - INTERVAL '1 day';

    -- 1. VERIFICAR BLOQUEO ACTIVO POR RATE LIMITING
    SELECT blocked_until INTO v_blocked_until
    FROM public.verification_rate_limits
    WHERE lookup_target = v_target_key
      AND blocked_until > NOW()
    LIMIT 1;

    IF v_blocked_until IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Límite de intentos de consulta excedido para este término. Por favor espera 15 minutos antes de intentar de nuevo.',
            'orders', '[]'::jsonb
        );
    END IF;

    -- =========================================================================
    -- CASO 1: BÚSQUEDA POR REFERENCIA DE ORDEN (Coincidencia Exacta Estricta)
    -- =========================================================================
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
        WHERE UPPER(TRIM(o.reference)) = UPPER(v_clean_term)
        LIMIT 5;

    -- =========================================================================
    -- CASO 2: BÚSQUEDA POR DOCUMENTO DE IDENTIDAD (Flujo Progresivo Inteligente)
    -- =========================================================================
    ELSIF v_is_numeric THEN
        -- 2.1 Verificar si este documento de identidad tiene órdenes registradas
        SELECT EXISTS (
            SELECT 1
            FROM public.buyers b
            JOIN public.orders o ON o.buyer_id = b.id
            WHERE b.document_id = v_clean_term
        ) INTO v_document_has_orders;

        -- Subcaso 2.1: Si NO tiene órdenes ni boletos registrados, retornar sin pedir teléfono
        IF NOT v_document_has_orders THEN
            RETURN jsonb_build_object(
                'success', true,
                'found', false,
                'requiresSecondary', false,
                'searchTerm', v_clean_term,
                'searchedBy', 'document',
                'orders', '[]'::jsonb,
                'message', 'No encontramos ningún boleto u orden registrada con este número de cédula.'
            );
        END IF;

        -- Subcaso 2.2: La cédula SÍ existe y tiene órdenes. Si aún no ingresó el teléfono, solicitarlo
        IF v_clean_secondary = '' THEN
            RETURN jsonb_build_object(
                'success', true,
                'found', true,
                'requiresSecondary', true,
                'searchTerm', v_clean_term,
                'searchedBy', 'document',
                'orders', '[]'::jsonb,
                'message', 'Cédula registrada con boletos. Por seguridad, confirma el teléfono registrado o sus últimos 4 dígitos.'
            );
        END IF;

        -- Subcaso 2.3: Se suministró el teléfono o sus 4 dígitos; validar longitud
        v_sec_digits := REGEXP_REPLACE(v_clean_secondary, '[^0-9]', '', 'g');
        IF length(v_sec_digits) < 4 THEN
            RETURN jsonb_build_object(
                'success', false,
                'found', true,
                'requiresSecondary', true,
                'code', 'INVALID_PHONE_FORMAT',
                'error', 'El número de teléfono de validación debe contener al menos 4 dígitos numéricos.',
                'orders', '[]'::jsonb
            );
        END IF;

        -- Consultar órdenes asociadas a la cédula verificando la coincidencia de teléfono
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
          AND (
              REGEXP_REPLACE(b.phone, '[^0-9]', '', 'g') = v_sec_digits
              OR RIGHT(REGEXP_REPLACE(b.phone, '[^0-9]', '', 'g'), 4) = RIGHT(v_sec_digits, 4)
          )
        LIMIT 10;

        -- Si no hubo coincidencias con el teléfono proporcionado
        IF v_results IS NULL OR jsonb_array_length(v_results) = 0 THEN
            -- Registrar intento fallido para rate limiting
            SELECT id, failed_attempts, window_start INTO v_attempts_record
            FROM public.verification_rate_limits
            WHERE lookup_target = v_target_key
              AND window_start > NOW() - INTERVAL '10 minutes'
            ORDER BY created_at DESC
            LIMIT 1;

            IF v_attempts_record.id IS NOT NULL THEN
                IF v_attempts_record.failed_attempts + 1 >= 5 THEN
                    UPDATE public.verification_rate_limits
                    SET failed_attempts = v_attempts_record.failed_attempts + 1,
                        blocked_until = NOW() + INTERVAL '15 minutes',
                        updated_at = NOW()
                    WHERE id = v_attempts_record.id;

                    RETURN jsonb_build_object(
                        'success', false,
                        'found', true,
                        'requiresSecondary', true,
                        'code', 'RATE_LIMIT_EXCEEDED',
                        'error', 'Límite de intentos de consulta excedido para este término. Por favor espera 15 minutos antes de intentar de nuevo.',
                        'orders', '[]'::jsonb
                    );
                ELSE
                    UPDATE public.verification_rate_limits
                    SET failed_attempts = v_attempts_record.failed_attempts + 1,
                        updated_at = NOW()
                    WHERE id = v_attempts_record.id;
                END IF;
            ELSE
                INSERT INTO public.verification_rate_limits (
                    lookup_target,
                    failed_attempts,
                    window_start,
                    updated_at
                ) VALUES (
                    v_target_key,
                    1,
                    NOW(),
                    NOW()
                );
            END IF;

            RETURN jsonb_build_object(
                'success', false,
                'found', true,
                'requiresSecondary', true,
                'code', 'PHONE_MISMATCH',
                'error', 'El número de teléfono o los 4 dígitos no coinciden con los registrados para esta cédula. Intenta nuevamente.',
                'orders', '[]'::jsonb
            );
        END IF;

    -- =========================================================================
    -- CASO 3: TÉRMINO GENÉRICO NO IDENTIFICADO
    -- =========================================================================
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
        WHERE UPPER(TRIM(o.reference)) = UPPER(v_clean_term)
        LIMIT 5;
    END IF;

    -- =========================================================================
    -- CONTROL DE RESULTADOS Y ACTUALIZACIÓN DE RATE LIMITING
    -- =========================================================================
    IF v_results IS NOT NULL AND jsonb_array_length(v_results) > 0 THEN
        -- Búsqueda exitosa: limpiar intentos fallidos acumulados
        DELETE FROM public.verification_rate_limits
        WHERE lookup_target = v_target_key;

        RETURN jsonb_build_object(
            'success', true,
            'found', true,
            'requiresSecondary', false,
            'searchTerm', v_clean_term,
            'searchedBy', CASE WHEN v_is_reference THEN 'reference' ELSE 'document' END,
            'orders', v_results
        );
    ELSE
        RETURN jsonb_build_object(
            'success', true,
            'found', false,
            'requiresSecondary', false,
            'searchTerm', v_clean_term,
            'searchedBy', CASE WHEN v_is_reference THEN 'reference' ELSE 'document' END,
            'orders', '[]'::jsonb
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_public_order_or_tickets(TEXT, TEXT) TO anon, authenticated, service_role;
