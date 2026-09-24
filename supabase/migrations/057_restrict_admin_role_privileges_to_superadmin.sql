-- ==============================================================================
-- Migración 057: Reglas Estrictas de Privilegios para Rol 'admin' vs 'superadmin'
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- OBJETIVOS:
-- 1. Exclusividad Absoluta de Invitaciones para Superadmin:
--    Modificar public.admin_invite_user() para que solo invocadores con
--    role = 'superadmin' puedan autorizar o invitar nuevos administradores.
--    Cualquier intento por parte de un admin regular o auditor es rechazado (42501).
--
-- 2. Restricción Estricta de Gestión de Aliados (public.partners):
--    Reemplazar la política permisiva de 'is_admin' por 'is_superadmin'
--    para las operaciones de INSERT, UPDATE y DELETE.
--    Los administradores regulares NO pueden modificar nada de aliados.
--
-- 3. Restricción Estricta de Storage para Logos de Aliados ('partner-logos'):
--    Modificar las políticas de storage.objects en el bucket 'partner-logos'
--    para que solo superadministradores puedan subir, actualizar o borrar logos.
--
-- 4. Restricción Estricta de Cuentas de Pago (public.payment_accounts):
--    Reemplazar la política permisiva de 'is_admin' por 'is_superadmin'
--    para las operaciones de INSERT, UPDATE y DELETE.
--    Los administradores regulares NO pueden crear, alterar ni borrar cuentas bancarias.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDENING DE RPC admin_invite_user (EXCLUSIVO SUPERADMIN)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_invite_user(
    p_email text,
    p_role text DEFAULT 'admin'::text,
    p_full_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_jwt_email TEXT := LOWER(COALESCE(auth.jwt()->>'email', ''));
    v_caller_role TEXT;
    v_clean_email TEXT;
    v_clean_role TEXT;
    v_clean_name TEXT;
    v_auth_user_id UUID;
    v_new_admin public.admin_users%ROWTYPE;
BEGIN
    -- Validar autenticación básica
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: se requiere sesión autenticada.'
        );
    END IF;

    -- Obtener rol del invocador
    SELECT role INTO v_caller_role
    FROM public.admin_users
    WHERE (user_id = v_caller_id 
           OR (v_caller_jwt_email <> '' AND LOWER(email) = v_caller_jwt_email)
           OR (EXISTS (SELECT 1 FROM auth.users WHERE id = v_caller_id AND LOWER(email) = LOWER(admin_users.email))))
      AND is_active = true
    LIMIT 1;

    -- REGLA ESTRICTA 1: Solo superadministradores activos pueden invitar usuarios
    IF v_caller_role IS NULL OR v_caller_role <> 'superadmin' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo los superadministradores pueden invitar a nuevos administradores al sistema.'
        );
    END IF;

    -- Sanitizar y normalizar parámetros
    v_clean_email := LOWER(TRIM(COALESCE(p_email, '')));
    v_clean_role := LOWER(TRIM(COALESCE(p_role, 'admin')));
    v_clean_name := NULLIF(TRIM(COALESCE(p_full_name, '')), '');

    IF v_clean_email = '' OR v_clean_email NOT LIKE '%_@_%._%' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Debe proporcionar una dirección de correo electrónico válida.'
        );
    END IF;

    IF v_clean_role NOT IN ('superadmin', 'admin', 'auditor') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Rol no válido. Los roles admitidos son: superadmin, admin o auditor.'
        );
    END IF;

    -- Validar que el correo no esté ya registrado en admin_users
    IF EXISTS (SELECT 1 FROM public.admin_users WHERE LOWER(email) = v_clean_email) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Este correo electrónico ya se encuentra registrado en el equipo de administradores.'
        );
    END IF;

    -- Comprobar si ya existe una cuenta en auth.users con ese correo
    SELECT id INTO v_auth_user_id
    FROM auth.users
    WHERE LOWER(email) = v_clean_email
    LIMIT 1;

    -- Insertar en public.admin_users
    INSERT INTO public.admin_users (
        user_id,
        email,
        full_name,
        role,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        v_auth_user_id,
        v_clean_email,
        v_clean_name,
        v_clean_role,
        true,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_admin;

    -- Registrar evento en bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'ADMIN_USER_INVITED',
        'admin_users',
        v_new_admin.id::TEXT,
        v_caller_id,
        jsonb_build_object(
            'email', v_clean_email,
            'full_name', v_clean_name,
            'role', v_clean_role,
            'auth_account_linked', (v_auth_user_id IS NOT NULL),
            'invited_by', v_caller_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Administrador autorizado exitosamente en el sistema.',
        'user', jsonb_build_object(
            'id', v_new_admin.id,
            'user_id', v_new_admin.user_id,
            'email', v_new_admin.email,
            'full_name', v_new_admin.full_name,
            'role', v_new_admin.role,
            'is_active', v_new_admin.is_active,
            'created_at', v_new_admin.created_at,
            'has_auth_account', (v_auth_user_id IS NOT NULL)
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_invite_user(text, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_invite_user(text, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. HARDENING RLS EN public.partners (ALIADOS)
-- ------------------------------------------------------------------------------
-- Eliminar políticas previas permisivas para admins regulares
DROP POLICY IF EXISTS "Administradores pueden gestionar aliados" ON public.partners;
DROP POLICY IF EXISTS "Superadmins pueden gestionar aliados" ON public.partners;

-- Política de lectura administrativa: Admins pueden leer para previsualización interna
DROP POLICY IF EXISTS "Lectura administrativa de aliados" ON public.partners;
CREATE POLICY "Lectura administrativa de aliados" ON public.partners
    FOR SELECT TO authenticated
    USING (public.is_admin(auth.uid()));

-- Política de mutación estricta: Solo superadministradores pueden crear, modificar o borrar
CREATE POLICY "Superadmins pueden gestionar aliados" ON public.partners
    FOR ALL TO authenticated
    USING (public.is_superadmin(auth.uid()))
    WITH CHECK (public.is_superadmin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 3. HARDENING RLS EN storage.objects ('partner-logos')
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Solo administradores pueden subir logos de aliados" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden actualizar logos de aliados" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden eliminar logos de aliados" ON storage.objects;
DROP POLICY IF EXISTS "Solo superadministradores pueden subir logos de aliados" ON storage.objects;
DROP POLICY IF EXISTS "Solo superadministradores pueden actualizar logos de aliados" ON storage.objects;
DROP POLICY IF EXISTS "Solo superadministradores pueden eliminar logos de aliados" ON storage.objects;

CREATE POLICY "Solo superadministradores pueden subir logos de aliados" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'partner-logos' AND public.is_superadmin(auth.uid()));

CREATE POLICY "Solo superadministradores pueden actualizar logos de aliados" ON storage.objects
    FOR UPDATE USING (bucket_id = 'partner-logos' AND public.is_superadmin(auth.uid()));

CREATE POLICY "Solo superadministradores pueden eliminar logos de aliados" ON storage.objects
    FOR DELETE USING (bucket_id = 'partner-logos' AND public.is_superadmin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 4. HARDENING RLS EN public.payment_accounts (CUENTAS DE PAGO)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Administradores pueden gestionar cuentas de pago" ON public.payment_accounts;
DROP POLICY IF EXISTS "Superadmins pueden gestionar cuentas de pago" ON public.payment_accounts;

-- Política de lectura administrativa: Admins pueden consultar para revisión de pagos
DROP POLICY IF EXISTS "Lectura administrativa de cuentas de pago" ON public.payment_accounts;
CREATE POLICY "Lectura administrativa de cuentas de pago" ON public.payment_accounts
    FOR SELECT TO authenticated
    USING (public.is_admin(auth.uid()));

-- Política de mutación estricta: Solo superadministradores pueden insertar, modificar o eliminar cuentas bancarias
CREATE POLICY "Superadmins pueden gestionar cuentas de pago" ON public.payment_accounts
    FOR ALL TO authenticated
    USING (public.is_superadmin(auth.uid()))
    WITH CHECK (public.is_superadmin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 5. COMENTARIOS DE SEGURIDAD EN CATÁLOGO
-- ------------------------------------------------------------------------------
COMMENT ON POLICY "Superadmins pueden gestionar aliados" ON public.partners IS 
    'Restringe la mutación (INSERT/UPDATE/DELETE) de aliados exclusivamente a superadministradores activos.';
COMMENT ON POLICY "Superadmins pueden gestionar cuentas de pago" ON public.payment_accounts IS 
    'Restringe la mutación (INSERT/UPDATE/DELETE) de cuentas de pago exclusivamente a superadministradores activos.';
COMMENT ON FUNCTION public.admin_invite_user(text, text, text) IS 
    'Permite la invitación y preautorización de administradores exclusivamente a usuarios con rol superadmin activo.';
