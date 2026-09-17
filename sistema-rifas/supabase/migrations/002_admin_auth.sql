-- ============================================================================
-- MIGRACIÓN 002: TABLA DE ADMINISTRADORES Y POLÍTICAS DE AUTORIZACIÓN (SUPABASE AUTH)
-- ============================================================================

-- 1. Tabla de Administradores Autorizados
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(200),
    role VARCHAR(50) DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin', 'auditor')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 3. Función auxiliar para verificar si el usuario autenticado actual es un administrador activo
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = p_user_id OR email = (SELECT email FROM auth.users WHERE id = p_user_id))
      AND is_active = true
  );
$$;

-- 4. Función trigger para auto-vincular user_id cuando un admin se registra o hace login
CREATE OR REPLACE FUNCTION public.sync_admin_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.admin_users
  SET user_id = NEW.id,
      updated_at = NOW()
  WHERE LOWER(email) = LOWER(NEW.email)
    AND (user_id IS NULL OR user_id = NEW.id);
  RETURN NEW;
END;
$$;

-- Trigger sobre auth.users para sincronizar automáticamente el user_id del admin por correo
DROP TRIGGER IF EXISTS on_auth_user_created_sync_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_sync_admin
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_admin_user_id();

-- 5. Políticas RLS (Sin recursión infinita)
-- Permitir que un usuario autenticado lea su propio registro de admin
DROP POLICY IF EXISTS "Admins pueden consultar su propio perfil" ON public.admin_users;
CREATE POLICY "Admins pueden consultar su propio perfil" ON public.admin_users
    FOR SELECT TO authenticated
    USING (
      user_id = auth.uid()
      OR LOWER(email) = LOWER(COALESCE(auth.jwt()->>'email', ''))
      OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
    );

-- Permitir que solo administradores activos modifiquen la tabla admin_users
DROP POLICY IF EXISTS "Superadmins pueden gestionar administradores" ON public.admin_users;
CREATE POLICY "Superadmins pueden gestionar administradores" ON public.admin_users
    FOR ALL TO authenticated
    USING (
      public.is_admin(auth.uid())
    )
    WITH CHECK (
      public.is_admin(auth.uid())
    );


