-- ==============================================================================
-- MIGRACIÓN 047: Endurecimiento de Consulta Pública Anti-Enumeración (SEC-09)
--
-- HALLAZGO:
-- SEC-09 (ALTA): Enumeración pública de participantes y cédulas mediante
-- verify_public_order_or_tickets.
--
-- VULNERABILIDAD ANTERIOR:
-- 1. Cualquier usuario sin autenticar podía iterar documentos de identidad numéricos
--    y descubrir quién compró boletos y qué números posee.
-- 2. La búsqueda por referencia utilizaba ILIKE '%term%', permitiendo enumerar
--    órdenes mediante subcadenas parciales (ej. 'MV-').
-- 3. No existía rate limiting contra ataques de fuerza bruta o escaneo masivo.
--
-- REMEDIACIÓN IMPLEMENTADA:
-- 1. Creación de tabla interna de rate limiting `public.verification_rate_limits`
--    restringida exclusivamente a funciones del sistema (RLS activo, sin acceso público).
-- 2. Búsqueda por referencia blindada a coincidencia exacta (UPPER(TRIM(o.reference)) = UPPER(v_clean_term)).
-- 3. Búsqueda por documento condicionada obligatoriamente a un segundo factor de
--    verificación: teléfono registrado o últimos 4 dígitos del celular.
-- 4. Rate limiting estricto: máximo 5 intentos fallidos por documento/referencia en
--    una ventana de 10 minutos. Al excederse, se bloquea la consulta por 15 minutos.
-- 5. Minimización estricta de PII: no se expone email, teléfono, ni comprobantes.
-- ==============================================================================

-- 1. Tabla de control de rate limiting para verificaciones públicas
CREATE TABLE IF NOT EXISTS public.verification_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lookup_target TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_rate_limits_target 
ON public.verification_rate_limits (lookup_target, window_start);

-- Restricción estricta de acceso: solo backend y funciones SECURITY DEFINER
ALTER TABLE public.verification_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verification_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.verification_rate_limits TO service_role, postgres;

-- 2. Redefinición de verify_public_order_or_tickets con segundo factor y rate limiting
DROP FUNCTION IF EXISTS public.verify_public_order_or_tickets(TEXT);
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
    v_is_numeric := (v_clean_term ~ '^[0-9]{5,20}$');

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
    -- CASO 2: BÚSQUEDA POR DOCUMENTO DE IDENTIDAD (Requiere Segundo Factor)
    -- =========================================================================
    ELSIF v_is_numeric THEN
        -- Exigir obligatoriamente el factor secundario (teléfono o últimos 4 dígitos)
        IF v_clean_secondary = '' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Para consultar por número de documento es obligatorio ingresar el número de teléfono o sus últimos 4 dígitos registrados en la compra.',
                'orders', '[]'::jsonb
            );
        END IF;

        v_sec_digits := REGEXP_REPLACE(v_clean_secondary, '[^0-9]', '', 'g');
        IF length(v_sec_digits) < 4 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'El número de teléfono de validación debe contener al menos 4 dígitos numéricos.',
                'orders', '[]'::jsonb
            );
        END IF;

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

    -- =========================================================================
    -- CASO 3: TÉRMINO GENÉRICO NO IDENTIFICADO
    -- =========================================================================
    ELSE
        -- Coincidencia exacta estricta por referencia como último recurso
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
            'searchTerm', v_clean_term,
            'searchedBy', CASE WHEN v_is_reference THEN 'reference' ELSE 'document' END,
            'orders', v_results
        );
    ELSE
        -- Búsqueda fallida: registrar / incrementar intento fallido
        SELECT id, failed_attempts, window_start INTO v_attempts_record
        FROM public.verification_rate_limits
        WHERE lookup_target = v_target_key
          AND window_start > NOW() - INTERVAL '10 minutes'
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_attempts_record.id IS NOT NULL THEN
            IF v_attempts_record.failed_attempts + 1 >= 5 THEN
                -- Bloquear por 15 minutos al alcanzar 5 intentos fallidos
                UPDATE public.verification_rate_limits
                SET failed_attempts = v_attempts_record.failed_attempts + 1,
                    blocked_until = NOW() + INTERVAL '15 minutes',
                    updated_at = NOW()
                WHERE id = v_attempts_record.id;

                RETURN jsonb_build_object(
                    'success', false,
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
            'success', true,
            'searchTerm', v_clean_term,
            'searchedBy', CASE WHEN v_is_reference THEN 'reference' ELSE 'document' END,
            'orders', '[]'::jsonb
        );
    END IF;
END;
$$;

-- Otorgar permisos de ejecución pública segura
GRANT EXECUTE ON FUNCTION public.verify_public_order_or_tickets(TEXT, TEXT) TO anon, authenticated, service_role;
