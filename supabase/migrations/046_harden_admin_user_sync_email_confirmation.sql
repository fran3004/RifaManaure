-- ==============================================================================
-- MIGRACIÓN 046: Endurecimiento de Sincronización de Administradores y Verificación de Identidad (SEC-08)
--
-- HALLAZGO:
-- SEC-08 (MEDIA): Prevenir que cuentas creadas en auth.users con correos
-- administrativos pre-invitados obtengan privilegios antes de confirmar su identidad.
--
-- VULNERABILIDAD ANTERIOR:
-- El trigger `on_auth_user_created_sync_admin` se disparaba en `INSERT OR UPDATE OF email`
-- y asignaba automáticamente `admin_users.user_id = NEW.id` incluso si `NEW.email_confirmed_at IS NULL`.
-- Un atacante podía registrar una cuenta con el correo pre-invitado y obtener privilegios
-- administrativos inmediatamente antes de que el legítimo dueño confirmara el correo.
-- Además, `is_admin` e `is_superadmin` contenían una cláusula de respaldo por email que
-- coincidía aun sin validación de `email_confirmed_at`.
--
-- REMEDIACIÓN IMPLEMENTADA:
-- 1. Índice único case-insensitive sobre `LOWER(email)` en `public.admin_users`.
-- 2. Trigger `on_auth_user_created_sync_admin` ampliado para reaccionar a `INSERT OR UPDATE OF email, email_confirmed_at`.
-- 3. Función `sync_admin_user_id()` condicionada estrictamente a `NEW.email_confirmed_at IS NOT NULL`.
--    Si el correo no está verificado, no se enlaza `user_id` (permanece NULL).
--    Si el usuario cambia de correo, se desvinculan asociaciones que no coincidan.
-- 4. Funciones `is_admin(p_user_id)` e `is_superadmin(p_user_id)` blindadas con defensa en profundidad:
--    Exigen que el usuario en `auth.users` tenga `email_confirmed_at IS NOT NULL`.
-- 5. RPC `admin_invite_user` vincula `user_id` en el momento de invitar ÚNICAMENTE si
--    la cuenta existente en `auth.users` ya tiene `email_confirmed_at IS NOT NULL`.
-- 6. RPC `admin_list_users` asocia metadatos de autenticación vía `a.user_id = u.id` y
--    reporta `has_auth_account = true` exclusivamente si la cuenta está confirmada.
-- ==============================================================================

-- 1. Índice único insensible a mayúsculas/minúsculas para blindar admin_users.email
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_lower_email 
ON public.admin_users (LOWER(email));

-- 2. Función sync_admin_user_id() con validación estricta de confirmación de email
CREATE OR REPLACE FUNCTION public.sync_admin_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  -- Solo vincular a admin_users si el usuario tiene el correo confirmado en auth.users
  IF NEW.email_confirmed_at IS NOT NULL THEN
    -- Desvincular cualquier registro previo de admin_users que tuviera este user_id
    -- pero cuyo correo ya no coincida con el email confirmado actual (ej. cambio de correo)
    UPDATE public.admin_users
    SET user_id = NULL,
        updated_at = NOW()
    WHERE user_id = NEW.id
      AND LOWER(email) <> LOWER(NEW.email);

    -- Vincular el registro de admin_users que coincida exactamente con el correo confirmado
    UPDATE public.admin_users
    SET user_id = NEW.id,
        updated_at = NOW()
    WHERE LOWER(email) = LOWER(NEW.email)
      AND (user_id IS NULL OR user_id = NEW.id);

  -- Si el correo NO ha sido confirmado (NEW.email_confirmed_at IS NULL):
  ELSE
    -- Asegurar que ningún registro administrativo esté vinculado a esta cuenta no verificada
    UPDATE public.admin_users
    SET user_id = NULL,
        updated_at = NOW()
    WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Restricción de permisos en sync_admin_user_id
REVOKE ALL ON FUNCTION public.sync_admin_user_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_admin_user_id() TO service_role, postgres;

-- 3. Trigger sobre auth.users que escucha inserciones y actualizaciones de email y email_confirmed_at
DROP TRIGGER IF EXISTS on_auth_user_created_sync_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_sync_admin
  AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_admin_user_id();

-- 4. Blindaje en profundidad de is_admin(p_user_id)
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Endurecimiento DB-16: Si se suministra un UUID explícito que no coincide con
  -- el usuario autenticado real, rechazar de inmediato para evitar confusión y enumeración.
  IF p_user_id IS NOT NULL AND p_user_id <> v_uid THEN
    RETURN false;
  END IF;

  -- Endurecimiento SEC-08: Exigir confirmación estricta de correo en auth.users y rol activo
  RETURN EXISTS (
    SELECT 1 
    FROM public.admin_users a
    JOIN auth.users u ON u.id = v_uid
    WHERE (a.user_id = v_uid OR LOWER(a.email) = LOWER(u.email))
      AND a.is_active = true
      AND u.email_confirmed_at IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated, service_role;

-- 5. Blindaje en profundidad de is_superadmin(p_user_id)
CREATE OR REPLACE FUNCTION public.is_superadmin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Endurecimiento DB-16: Rechazo inmediato ante discrepancia de identidad
  IF p_user_id IS NOT NULL AND p_user_id <> v_uid THEN
    RETURN false;
  END IF;

  -- Endurecimiento SEC-08: Exigir confirmación estricta de correo en auth.users, rol superadmin y activo
  RETURN EXISTS (
    SELECT 1 
    FROM public.admin_users a
    JOIN auth.users u ON u.id = v_uid
    WHERE (a.user_id = v_uid OR LOWER(a.email) = LOWER(u.email))
      AND a.role = 'superadmin'
      AND a.is_active = true
      AND u.email_confirmed_at IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO anon, authenticated, service_role;

-- 6. Hardening de admin_invite_user: Solo enlazar user_id si la cuenta auth ya está confirmada
CREATE OR REPLACE FUNCTION public.admin_invite_user(
    p_email text, 
    p_role text DEFAULT 'admin'::text, 
    p_full_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
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

    -- Obtener rol del invocador verificando que sea un administrador activo y confirmado
    SELECT a.role INTO v_caller_role
    FROM public.admin_users a
    JOIN auth.users u ON u.id = v_caller_id
    WHERE (a.user_id = v_caller_id 
           OR (v_caller_jwt_email <> '' AND LOWER(a.email) = v_caller_jwt_email)
           OR LOWER(a.email) = LOWER(u.email))
      AND a.is_active = true
      AND u.email_confirmed_at IS NOT NULL
    LIMIT 1;

    IF v_caller_role IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores activos con identidad confirmada pueden invitar usuarios.'
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

    -- Endurecimiento SEC-08: Comprobar si ya existe una cuenta en auth.users con ese correo
    -- QUE ADEMÁS TENGA EMAIL CONFIRMADO. Si no está confirmada, v_auth_user_id permanecerá NULL
    SELECT id INTO v_auth_user_id
    FROM auth.users
    WHERE LOWER(email) = v_clean_email
      AND email_confirmed_at IS NOT NULL
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

GRANT EXECUTE ON FUNCTION public.admin_invite_user(text, text, text) TO authenticated, service_role;

-- 7. Hardening de admin_list_users: Reportar has_auth_account = true solo si el enlace y confirmación son reales
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_users JSONB;
BEGIN
    -- Validar que quien consulta sea un administrador activo y confirmado
    IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: se requieren privilegios de administrador para consultar el equipo.'
        );
    END IF;

    -- Consultar todos los administradores uniendo con auth.users exclusivamente por el user_id verificado
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
                'has_auth_account', (a.user_id IS NOT NULL AND u.id IS NOT NULL AND u.email_confirmed_at IS NOT NULL),
                'last_sign_in_at', u.last_sign_in_at
            ) ORDER BY a.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_users
    FROM public.admin_users a
    LEFT JOIN auth.users u ON (u.id = a.user_id);

    RETURN jsonb_build_object(
        'success', true,
        'users', v_users
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;
