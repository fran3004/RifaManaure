-- ==============================================================================
-- Migración 044: Hardening de public.admin_users y Erradicación de Escalación (SEC-04)
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- HALLAZGO ATENDIDO: SEC-04 (Vulnerabilidad Alta en PostgREST sobre admin_users)
-- 
-- OBJETIVOS:
-- 1. Restringir la política RLS de gestión en public.admin_users exclusivamente
--    a superadministradores verificados mediante public.is_superadmin(auth.uid()),
--    impidiendo que administradores regulares o auditores modifiquen registros.
-- 2. Preservar la política de lectura de perfil propio para administradores.
-- 3. Revocar permisos de tabla y de ejecución innecesarios a anon y PUBLIC.
-- 4. Implementar trigger de defensa en profundidad (fn_protect_admin_users) que:
--    a) Impide autodesactivación de cuentas administrativas.
--    b) Impide a cualquier no-superadmin modificar o promover roles.
--    c) Protege al último superadministrador activo contra desactivación,
--       degradación o eliminación física (anti-orfandad estructural).
--    d) Impide autoborrado de cuentas.
-- 5. Endurecer las RPCs administrativas:
--    a) admin_toggle_user_status: Exclusiva para superadministradores activos.
--    b) admin_invite_user: Requiere admin activo, prohíbe creación de superadmins
--       a usuarios regulares, y veta completamente a auditores.
-- ==============================================================================

-- 1. REVOCAR PERMISOS DIRECTOS A ROLES NO PRIVILEGIADOS SOBRE LA TABLA
REVOKE ALL ON TABLE public.admin_users FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_users TO authenticated, service_role;

-- 2. CORREGIR POLÍTICAS RLS EN public.admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Política 1: Lectura de propio perfil (preservada para login y sesión de cualquier admin/auditor)
DROP POLICY IF EXISTS "Admins pueden consultar su propio perfil" ON public.admin_users;
CREATE POLICY "Admins pueden consultar su propio perfil" ON public.admin_users
    FOR SELECT TO authenticated
    USING (
      user_id = auth.uid()
      OR LOWER(email) = LOWER(COALESCE(auth.jwt()->>'email', ''))
    );

-- Política 2: Gestión exclusiva de superadministradores (REEMPLAZO CRÍTICO DE is_admin POR is_superadmin)
DROP POLICY IF EXISTS "Superadmins pueden gestionar administradores" ON public.admin_users;
CREATE POLICY "Superadmins pueden gestionar administradores" ON public.admin_users
    FOR ALL TO authenticated
    USING (
      public.is_superadmin(auth.uid())
    )
    WITH CHECK (
      public.is_superadmin(auth.uid())
    );

-- 3. FUNCIÓN Y TRIGGER DE DEFENSA EN PROFUNDIDAD (ANTI-ESCALACIÓN, ANTI-AUTODESACTIVACIÓN, ANTI-ORFANDAD)
CREATE OR REPLACE FUNCTION public.fn_protect_admin_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_jwt_email TEXT := LOWER(COALESCE(auth.jwt()->>'email', ''));
    v_caller_is_super BOOLEAN;
    v_active_superadmins_count INTEGER;
    v_is_self BOOLEAN := false;
BEGIN
    -- Identificar si la operación afecta al propio usuario que ejecuta la acción
    IF v_caller_id IS NOT NULL THEN
        IF (OLD.user_id IS NOT NULL AND OLD.user_id = v_caller_id)
           OR (v_caller_jwt_email <> '' AND LOWER(OLD.email) = v_caller_jwt_email)
           OR (EXISTS (SELECT 1 FROM auth.users WHERE id = v_caller_id AND LOWER(email) = LOWER(OLD.email))) THEN
            v_is_self := true;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Mantener timestamp de actualización
        NEW.updated_at := NOW();

        -- A. REGLA ANTI-AUTODESACTIVACIÓN: Un usuario autenticado no puede suspender su propia cuenta
        IF v_caller_id IS NOT NULL AND v_is_self AND OLD.is_active = true AND NEW.is_active = false THEN
            RAISE EXCEPTION 'Operación denegada por seguridad: No puedes desactivar tu propia cuenta de administrador.'
                USING ERRCODE = '42501';
        END IF;

        -- B. REGLA DE PROTECCIÓN DE ROLES: Solo un superadministrador activo puede modificar roles
        IF OLD.role IS DISTINCT FROM NEW.role THEN
            IF v_caller_id IS NOT NULL THEN
                v_caller_is_super := public.is_superadmin(v_caller_id);
                IF NOT v_caller_is_super THEN
                    RAISE EXCEPTION 'Operación denegada por seguridad: Solo un superadministrador activo puede modificar roles de administración.'
                        USING ERRCODE = '42501';
                END IF;
            END IF;
        END IF;

        -- C. REGLA ANTI-ORFANDAD: Proteger al último superadministrador activo
        IF OLD.role = 'superadmin' AND OLD.is_active = true AND (NEW.is_active = false OR NEW.role <> 'superadmin') THEN
            SELECT COUNT(*) INTO v_active_superadmins_count
            FROM public.admin_users
            WHERE role = 'superadmin' AND is_active = true;

            IF v_active_superadmins_count <= 1 THEN
                RAISE EXCEPTION 'Operación denegada por integridad: No se puede desactivar ni degradar al único superadministrador activo del sistema.'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;

        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        -- D. REGLA ANTI-AUTOBORRADO: Nadie puede auto-eliminarse
        IF v_caller_id IS NOT NULL AND v_is_self THEN
            RAISE EXCEPTION 'Operación denegada por seguridad: No puedes eliminar tu propia cuenta de administrador.'
                USING ERRCODE = '42501';
        END IF;

        -- E. REGLA DE SUPRESIÓN: Solo un superadministrador activo puede eliminar administradores
        IF v_caller_id IS NOT NULL THEN
            v_caller_is_super := public.is_superadmin(v_caller_id);
            IF NOT v_caller_is_super THEN
                RAISE EXCEPTION 'Operación denegada por seguridad: Solo un superadministrador activo puede eliminar administradores.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        -- F. REGLA ANTI-ORFANDAD EN DELETE: No eliminar al último superadministrador activo
        IF OLD.role = 'superadmin' AND OLD.is_active = true THEN
            SELECT COUNT(*) INTO v_active_superadmins_count
            FROM public.admin_users
            WHERE role = 'superadmin' AND is_active = true;

            IF v_active_superadmins_count <= 1 THEN
                RAISE EXCEPTION 'Operación denegada por integridad: No se puede eliminar al único superadministrador activo del sistema.'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;

        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_admin_users ON public.admin_users;
CREATE TRIGGER trg_protect_admin_users
    BEFORE UPDATE OR DELETE ON public.admin_users
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_protect_admin_users();

-- 4. ENDURECIMIENTO DE RPC admin_toggle_user_status (EXCLUSIVA DE SUPERADMIN)
CREATE OR REPLACE FUNCTION public.admin_toggle_user_status(p_admin_user_id uuid, p_is_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_email TEXT := LOWER(COALESCE(auth.jwt()->>'email', ''));
    v_target public.admin_users%ROWTYPE;
    v_active_superadmins_count INTEGER;
BEGIN
    -- 1. Exclusividad de Superadministrador para modificar estados
    IF v_caller_id IS NULL OR NOT public.is_superadmin(v_caller_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo un superadministrador activo puede modificar el estado de un administrador.'
        );
    END IF;

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

    -- 3. REGLA ANTI-AUTODESACTIVACIÓN
    IF p_is_active = false THEN
        IF (v_target.user_id IS NOT NULL AND v_target.user_id = v_caller_id)
           OR (v_caller_email <> '' AND LOWER(v_target.email) = v_caller_email)
           OR (EXISTS (SELECT 1 FROM auth.users WHERE id = v_caller_id AND LOWER(email) = LOWER(v_target.email))) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Acción bloqueada por seguridad: No puedes desactivar tu propia cuenta de administrador.'
            );
        END IF;
    END IF;

    -- 4. REGLA ANTI-ORFANDAD: Proteger al último superadministrador activo
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

    -- 5. Actualizar estado
    UPDATE public.admin_users
    SET is_active = p_is_active,
        updated_at = NOW()
    WHERE id = p_admin_user_id;

    -- 6. Registrar en bitácora de auditoría
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

-- 5. ENDURECIMIENTO DE RPC admin_invite_user (PROTECCIÓN CONTRA ESCALACIÓN Y VETO DE AUDITORES)
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
    v_caller_is_superadmin BOOLEAN;
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

    IF v_caller_role IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores activos pueden invitar usuarios.'
        );
    END IF;

    -- Los auditores tienen acceso de solo lectura y NO pueden autorizar usuarios
    IF v_caller_role = 'auditor' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acción denegada: Los auditores tienen permisos de solo lectura y no pueden autorizar administradores.'
        );
    END IF;

    v_caller_is_superadmin := (v_caller_role = 'superadmin');

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

    -- Si quien invita NO es superadministrador, está estrictamente prohibido asignar el rol superadmin
    IF v_clean_role = 'superadmin' AND NOT v_caller_is_superadmin THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acción denegada: Solo un superadministrador puede designar a otro superadministrador.'
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

-- 6. PERMISOS DE EJECUCIÓN ESTRICTOS
REVOKE ALL ON FUNCTION public.admin_toggle_user_status(uuid, boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_status(uuid, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_invite_user(text, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_invite_user(text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;

-- 7. COMENTARIOS EN CATÁLOGO
COMMENT ON TABLE public.admin_users IS 'Tabla de administradores autorizados. Modificación protegida por RLS exclusiva para superadmins y trigger fn_protect_admin_users (SEC-04).';
COMMENT ON POLICY "Superadmins pueden gestionar administradores" ON public.admin_users IS 'Permite gestión completa de administradores exclusivamente a superadministradores verificados (SEC-04).';
COMMENT ON FUNCTION public.fn_protect_admin_users() IS 'Trigger de defensa en profundidad contra autodesactivación, escalación de roles y eliminación de superadministradores huérfanos (SEC-04).';
