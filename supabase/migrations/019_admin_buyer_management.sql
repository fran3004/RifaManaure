-- ============================================================================
-- MIGRACIÓN 019: GESTIÓN ADMINISTRATIVA DE COMPRADORES
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Política RLS de SELECT para administradores en public.buyers
DROP POLICY IF EXISTS "Lectura de compradores para administradores" ON public.buyers;
CREATE POLICY "Lectura de compradores para administradores" ON public.buyers
    FOR SELECT
    TO authenticated
    USING (public.is_admin(auth.uid()));

-- 2. Función RPC administrativa para actualizar datos de contacto de un comprador
-- con SECURITY DEFINER y validación estricta de rol de administrador.
CREATE OR REPLACE FUNCTION public.admin_update_buyer(
    p_buyer_id UUID,
    p_full_name TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_city TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_buyer RECORD;
    v_clean_name TEXT;
    v_clean_phone TEXT;
    v_clean_email TEXT;
    v_clean_city TEXT;
BEGIN
    -- 1. Validación de autorización administrativa
    IF NOT public.is_admin(auth.uid()) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: se requieren privilegios de administrador.'
        );
    END IF;

    -- 2. Sanitización y validación de campos obligatorios
    v_clean_name  := TRIM(COALESCE(p_full_name, ''));
    v_clean_phone := TRIM(COALESCE(p_phone, ''));
    v_clean_email := LOWER(TRIM(COALESCE(p_email, '')));
    v_clean_city  := TRIM(COALESCE(p_city, ''));

    IF v_clean_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El nombre completo es obligatorio.');
    END IF;

    IF v_clean_phone = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El número de teléfono es obligatorio.');
    END IF;

    IF v_clean_email = '' OR v_clean_email NOT LIKE '%_@_%._%' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El correo electrónico suministrado no tiene un formato válido.');
    END IF;

    IF v_clean_city = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El municipio o ciudad es obligatorio.');
    END IF;

    -- 3. Bloqueo pesimista del registro del comprador
    SELECT * INTO v_buyer
    FROM public.buyers
    WHERE id = p_buyer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El comprador especificado no existe en la base de datos.'
        );
    END IF;

    -- 4. Actualización del comprador
    UPDATE public.buyers
    SET full_name = v_clean_name,
        phone = v_clean_phone,
        email = v_clean_email,
        city = v_clean_city,
        updated_at = NOW()
    WHERE id = p_buyer_id;

    -- 5. Registrar evento en la bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'BUYER_UPDATED',
        'buyers',
        p_buyer_id::TEXT,
        auth.uid(),
        jsonb_build_object(
            'document_id', v_buyer.document_id,
            'old_full_name', v_buyer.full_name,
            'new_full_name', v_clean_name,
            'old_phone', v_buyer.phone,
            'new_phone', v_clean_phone,
            'old_email', v_buyer.email,
            'new_email', v_clean_email,
            'old_city', v_buyer.city,
            'new_city', v_clean_city
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'buyer_id', p_buyer_id,
        'full_name', v_clean_name,
        'document_id', v_buyer.document_id,
        'phone', v_clean_phone,
        'email', v_clean_email,
        'city', v_clean_city
    );
END;
$$;

-- 3. Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.admin_update_buyer(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

