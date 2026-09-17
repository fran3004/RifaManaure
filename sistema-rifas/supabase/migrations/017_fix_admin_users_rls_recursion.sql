-- ============================================================================
-- MIGRACIÓN 017: CORRECCIÓN DE RECURSIÓN INFINITA EN POLÍTICAS RLS DE ADMIN_USERS
-- ============================================================================

-- 1. Redefinir is_admin como SECURITY DEFINER con search_path explícito
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = p_user_id OR email = (SELECT email FROM auth.users WHERE id = p_user_id))
      AND is_active = true
  );
END;
$$;

-- 2. Función auxiliar is_superadmin SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.is_superadmin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = p_user_id OR email = (SELECT email FROM auth.users WHERE id = p_user_id))
      AND role = 'superadmin'
      AND is_active = true
  );
END;
$$;

-- 3. Eliminar políticas con recursión infinita en admin_users
DROP POLICY IF EXISTS "Admins pueden consultar su propio perfil" ON public.admin_users;
DROP POLICY IF EXISTS "Superadmins pueden gestionar administradores" ON public.admin_users;
DROP POLICY IF EXISTS "Permitir lectura de perfil de admin" ON public.admin_users;

-- 4. Crear política SELECT directa (sin auto-invocar consultas a admin_users)
CREATE POLICY "Admins pueden consultar su propio perfil" ON public.admin_users
    FOR SELECT TO authenticated
    USING (
      user_id = auth.uid()
      OR LOWER(email) = LOWER(COALESCE(auth.jwt()->>'email', ''))
      OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
    );

-- 5. Crear política ALL para superadministradores (usando la función SECURITY DEFINER)
CREATE POLICY "Superadmins pueden gestionar administradores" ON public.admin_users
    FOR ALL TO authenticated
    USING (
      public.is_superadmin(auth.uid())
    )
    WITH CHECK (
      public.is_superadmin(auth.uid())
    );

-- 6. Otorgar permisos
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin(UUID) TO authenticated, service_role;

