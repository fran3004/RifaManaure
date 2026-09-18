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

