-- ====================================================================
-- MIGRACIÓN 042: Eliminación de Superficie de Ataque en reserve_tickets (SEC-02)
-- ====================================================================
-- Hallazgo: SEC-02 (Severidad: ALTA)
-- 
-- Contexto:
-- La función `public.reserve_tickets` formaba parte de la arquitectura histórica
-- de reservas (migraciones 001, 022, 023). Dicha función permitía reservar boletos
-- sin asociar un `order_id`, sin validación de compradores ni cálculo de precios,
-- y se encontraba expuesta a través de PostgREST con permisos de ejecución otorgados
-- a `PUBLIC`, `anon` y `authenticated`.
--
-- Decisión Arquitectónica:
-- 1. El único flujo legítimo, atómico y seguro de reservas y órdenes del proyecto
--    es la RPC `public.create_order_secure` (implementada en la migración 012 y
--    consolidada con hardening en 016, 022 y 023).
-- 2. El frontend de RifaManaure no invoca `reserve_tickets` en ningún componente,
--    servicio, hook o test.
-- 3. Para preservar la compatibilidad con el historial de base de datos sin
--    romper scripts internos ni referencias existentes, se conserva la definición
--    en PostgreSQL pero se revoca TODO acceso público y PostgREST.
-- 4. Se conserva únicamente el acceso técnico a `service_role` y al propietario `postgres`.
-- ====================================================================

-- 1. Revocar permisos de ejecución a PUBLIC, anon y authenticated
REVOKE ALL ON FUNCTION public.reserve_tickets(UUID, TEXT[], UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_tickets(UUID, TEXT[], UUID, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reserve_tickets(UUID, TEXT[], UUID, INTEGER) FROM authenticated;

-- 2. Garantizar que service_role conserve acceso técnico interno justificado
GRANT EXECUTE ON FUNCTION public.reserve_tickets(UUID, TEXT[], UUID, INTEGER) TO service_role;

-- 3. Documentar formalmente la deprecación de la función en el catálogo de PostgreSQL
COMMENT ON FUNCTION public.reserve_tickets(UUID, TEXT[], UUID, INTEGER) IS 
'DEPRECATED (SEC-02): Función histórica de reservas. El único flujo legítimo y seguro del sistema es create_order_secure. Acceso revocado a PUBLIC, anon y authenticated para cerrar superficie de ataque en PostgREST.';
