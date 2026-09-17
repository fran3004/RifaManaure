-- ==============================================================================
-- Migración 024: Gestión Integral de Administradores del Sistema
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- 1. RPC admin_list_users: Listado real de public.admin_users con datos de vinculación Auth.
-- 2. RPC admin_invite_user: Pre-autorización de administradores con validación de roles y auditoría.
-- 3. RPC admin_toggle_user_status: Activación/desactivación con protección estricta
--    anti-autodesactivación y anti-orfandad de superadmin.
-- 4. Permisos de seguridad estrictos (REVOKE anon / GRANT authenticated).
-- ==============================================================================

-- 1. Función RPC para Listar Todos los Administradores (admin_list_users)
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_users JSONB;
BEGIN
    -- Validar que quien consulta sea un administrador activo
    IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: se requieren privilegios de administrador para consultar el equipo.'
        );
    END IF;

    -- Consultar todos los administradores uniendo con auth.users para metadatos de acceso
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', a.id,
                'user_id', a.user_id,
                'email', a.email,
                'full_name', COALESCE(a.full_name, 'Sin nombre registrado'),
                'role', a.role,
                'is_active', a.is_active,
                'created_at', a.created_at,
                'updated_at', a.updated_at,
                'has_auth_account', (a.user_id IS NOT NULL OR u.id IS NOT NULL),
                'last_sign_in_at', u.last_sign_in_at
            ) ORDER BY a.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_users
    FROM public.admin_users a
    LEFT JOIN auth.users u ON (u.id = a.user_id OR LOWER(u.email) = LOWER(a.email));

    RETURN jsonb_build_object(
        'success', true,
        'users', v_users
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;


-- 2. Función RPC para Invitar/Pre-autorizar Administrador (admin_invite_user)
DROP FUNCTION IF EXISTS public.admin_invite_user(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_invite_user(
    p_email TEXT,
    p_role TEXT DEFAULT 'admin',
    p_full_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_is_superadmin BOOLEAN;
    v_clean_email TEXT;
    v_clean_role TEXT;
    v_clean_name TEXT;
    v_auth_user_id UUID;
    v_new_admin public.admin_users%ROWTYPE;
BEGIN
    -- Validar autenticación y rol de administrador activo
    IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden invitar nuevos usuarios.'
        );
    END IF;

    v_caller_is_superadmin := public.is_superadmin(v_caller_id);

    -- Sanitizar y validar parámetros
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

    -- Si quien invita NO es superadmin, no puede conceder el rol superadmin
    IF v_clean_role = 'superadmin' AND NOT v_caller_is_superadmin THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Solo un superadministrador puede designar a otro superadministrador.'
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

REVOKE ALL ON FUNCTION public.admin_invite_user(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_invite_user(TEXT, TEXT, TEXT) TO authenticated, service_role;


-- 3. Función RPC para Activar/Desactivar Administrador (admin_toggle_user_status)
DROP FUNCTION IF EXISTS public.admin_toggle_user_status(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.admin_toggle_user_status(
    p_admin_user_id UUID,
    p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_email TEXT := LOWER(COALESCE(auth.jwt()->>'email', ''));
    v_caller_is_superadmin BOOLEAN;
    v_target public.admin_users%ROWTYPE;
    v_active_superadmins_count INTEGER;
BEGIN
    -- 1. Validar privilegios de administrador del invocador
    IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: se requieren privilegios de administrador.'
        );
    END IF;

    v_caller_is_superadmin := public.is_superadmin(v_caller_id);

    -- 2. Obtener y bloquear la fila del administrador objetivo
    SELECT * INTO v_target
    FROM public.admin_users
    WHERE id = p_admin_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El registro de administrador especificado no existe.'
        );
    END IF;

    -- 3. REGLA DE ORO DE SEGURIDAD 1: NUNCA PERMITIR QUE UN ADMIN SE DESACTIVE A SÍ MISMO
    IF p_is_active = false THEN
        IF (v_target.user_id IS NOT NULL AND v_target.user_id = v_caller_id)
           OR (v_caller_email <> '' AND LOWER(v_target.email) = v_caller_email) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Acción bloqueada por seguridad: No puedes desactivar tu propia cuenta de administrador.'
            );
        END IF;
    END IF;

    -- 4. REGLA DE SEGURIDAD 2: Solo superadmin puede modificar a otro superadmin
    IF v_target.role = 'superadmin' AND NOT v_caller_is_superadmin THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acción denegada: Solo un superadministrador puede modificar el estado de otro superadministrador.'
        );
    END IF;

    -- 5. REGLA DE SEGURIDAD 3: No permitir desactivar al último superadmin activo
    IF v_target.role = 'superadmin' AND p_is_active = false THEN
        SELECT COUNT(*) INTO v_active_superadmins_count
        FROM public.admin_users
        WHERE role = 'superadmin' AND is_active = true;

        IF v_active_superadmins_count <= 1 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Acción bloqueada: No se puede desactivar al único superadministrador activo del sistema.'
            );
        END IF;
    END IF;

    -- 6. Actualizar estado
    UPDATE public.admin_users
    SET is_active = p_is_active,
        updated_at = NOW()
    WHERE id = p_admin_user_id;

    -- 7. Registrar evento en bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        CASE WHEN p_is_active THEN 'ADMIN_USER_ACTIVATED' ELSE 'ADMIN_USER_DEACTIVATED' END,
        'admin_users',
        p_admin_user_id::TEXT,
        v_caller_id,
        jsonb_build_object(
            'target_email', v_target.email,
            'target_name', v_target.full_name,
            'target_role', v_target.role,
            'previous_status', v_target.is_active,
            'new_status', p_is_active,
            'performed_by', v_caller_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'admin_user_id', p_admin_user_id,
        'is_active', p_is_active,
        'message', CASE 
            WHEN p_is_active THEN 'Acceso de administrador activado exitosamente.'
            ELSE 'Acceso de administrador revocado inmediatamente.'
        END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_user_status(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_status(UUID, BOOLEAN) TO authenticated, service_role;

