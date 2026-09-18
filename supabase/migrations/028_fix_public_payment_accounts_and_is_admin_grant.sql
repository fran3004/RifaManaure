-- ============================================================================
-- MIGRACIÓN 028: HABILITAR PERMISOS DE IS_ADMIN, CUENTAS DE PAGO Y RÉPLICA REALTIME
-- PLATAFORMA "MANAURE VIVE" (PRODUCCIÓN VERCEL)
-- ============================================================================

-- 1. Otorgar permisos de ejecución de is_admin y is_superadmin a anon y authenticated
-- Esto previene el error 42501 ("permission denied for function is_admin") cuando
-- usuarios anónimos navegan el checkout público o se evalúan políticas RLS.
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO anon, authenticated, service_role;

-- 2. Asegurar políticas RLS limpias y de alto rendimiento en payment_accounts
DROP POLICY IF EXISTS "Lectura pública de cuentas de pago activas" ON public.payment_accounts;
CREATE POLICY "Lectura pública de cuentas de pago activas" ON public.payment_accounts
    FOR SELECT TO anon, authenticated
    USING (is_active = true);

DROP POLICY IF EXISTS "Administradores pueden gestionar cuentas de pago" ON public.payment_accounts;
CREATE POLICY "Administradores pueden gestionar cuentas de pago" ON public.payment_accounts
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 3. Configurar REPLICA IDENTITY FULL para habilitar Supabase Realtime completo
-- Permite que Supabase transmita los registros completos al crearse o modificarse
ALTER TABLE public.tickets REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.raffles REPLICA IDENTITY FULL;
ALTER TABLE public.system_settings REPLICA IDENTITY FULL;
ALTER TABLE public.winners REPLICA IDENTITY FULL;
ALTER TABLE public.payment_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.partners REPLICA IDENTITY FULL;

-- 4. Asegurar que submit_payment_proof tenga permisos de ejecución para anon y authenticated
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(UUID, TEXT, TEXT, INTEGER, VARCHAR, VARCHAR) TO anon, authenticated, service_role;
