-- ============================================================================
-- MIGRACIÓN 029: ENDURECIMIENTO DE SEGURIDAD EN IS_ADMIN (ANTI-ENUMERACIÓN)
-- ============================================================================
-- Garantiza que las funciones SECURITY DEFINER evalúen estrictamente la sesión
-- autenticada real (auth.uid()), ignorando UUIDs arbitrarios suministrados por
-- terceros para evitar enumeración de cuentas privilegiadas.

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = v_uid OR LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = v_uid))
      AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = v_uid OR LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = v_uid))
      AND role = 'superadmin'
      AND is_active = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin(UUID) TO anon, authenticated, service_role;

