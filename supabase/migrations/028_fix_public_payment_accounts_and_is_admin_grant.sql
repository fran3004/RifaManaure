-- ============================================================================
-- MIGRACIÓN 028 (Secuencia 028.1 / Parte 1 de 2)
-- ARCHIVO: 028_fix_public_payment_accounts_and_is_admin_grant.sql
-- HABILITAR PERMISOS DE IS_ADMIN, CUENTAS DE PAGO Y RÉPLICA REALTIME
-- PLATAFORMA "MANAURE VIVE" (PRODUCCIÓN VERCEL)
-- ============================================================================
-- TRAZABILIDAD Y DETERMINISMO:
-- 1. Historial Git: Introducida en commits cfc380a / 87d550d. Precede históricamente
--    a 028_flexible_raffle_emission.sql (commit bad2160).
-- 2. Orden Lexicográfico: 'fix' < 'fle'. Supabase CLI y ordenadores alfabéticos
--    procesan este archivo en primer lugar dentro del prefijo 028.
-- 3. Alcance DDL: Grants a funciones is_admin/is_superadmin, políticas RLS en
--    payment_accounts, REPLICA IDENTITY FULL y grant a submit_payment_proof.
-- 4. Ortogonalidad: 100% independiente de 028_flexible_raffle_emission.sql (sin colisión de objetos).
-- 5. Preservación: El nombre de archivo se conserva intacto para evitar reescritura
--    destructiva de la historia de migraciones y prevenir drift en entornos desplegados.
-- ============================================================================

-- 1. Otorgar permisos de ejecución de is_admin(uuid) y is_superadmin(uuid) a anon y authenticated
-- Esto previene el error 42501 ("permission denied for function is_admin") cuando
-- usuarios anónimos navegan el checkout público o se evalúan políticas RLS.
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin(UUID) TO anon, authenticated, service_role;

-- 2. Asegurar políticas RLS limpias y de alto rendimiento en payment_accounts
-- Lectura pública para usuarios anónimos y autenticados (solo cuentas activas)
DROP POLICY IF EXISTS "Lectura pública de cuentas de pago activas" ON public.payment_accounts;
CREATE POLICY "Lectura pública de cuentas de pago activas" ON public.payment_accounts
    FOR SELECT TO anon, authenticated
    USING (is_active = true);

-- Gestión administrativa basada en la firma real is_admin((SELECT auth.uid()))
DROP POLICY IF EXISTS "Administradores pueden gestionar cuentas de pago" ON public.payment_accounts;
CREATE POLICY "Administradores pueden gestionar cuentas de pago" ON public.payment_accounts
    FOR ALL TO authenticated
    USING (public.is_admin((SELECT auth.uid())))
    WITH CHECK (public.is_admin((SELECT auth.uid())));

-- 3. Configurar REPLICA IDENTITY FULL para habilitar Supabase Realtime completo
-- Permite que Supabase transmita los registros completos al crearse o modificarse
ALTER TABLE public.tickets REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.raffles REPLICA IDENTITY FULL;
ALTER TABLE public.system_settings REPLICA IDENTITY FULL;
ALTER TABLE public.winners REPLICA IDENTITY FULL;
ALTER TABLE public.payment_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.partners REPLICA IDENTITY FULL;

-- 4. Asegurar que submit_payment_proof tenga permisos de ejecución con su firma real
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(UUID, TEXT, TEXT, INTEGER, VARCHAR, TEXT) TO anon, authenticated, service_role;
