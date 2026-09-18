-- ============================================================================
-- MIGRACIÓN 018: CONFIGURAR RÉPLICA COMPLETA PARA REALTIME (TICKETS Y ORDERS)
-- ============================================================================
-- NOTA DE PERMISOS EN SUPABASE:
-- En Supabase, la publicación 'supabase_realtime' es propiedad del rol del sistema
-- 'supabase_admin'. Ejecutar 'ALTER PUBLICATION supabase_realtime ADD TABLE ...'
-- desde el SQL Editor genera el error 42501 (must be owner of publication).
--
-- PASO MANUAL EN EL DASHBOARD DE SUPABASE (Toma 15 segundos):
-- 1. En el menú lateral izquierdo, ve a Database -> Publications.
-- 2. Haz clic en 'supabase_realtime'.
-- 3. Activa los interruptores (toggles) para 'tickets' y 'orders'.
--    (También se puede en Table Editor -> editar tabla -> activar 'Enable Realtime').
--
-- SQL REQUERIDO (REPLICA IDENTITY):
-- Este comando sí pertenece al dueño de las tablas ('postgres') y es indispensable
-- para que Realtime envíe la fila completa en cada UPDATE / DELETE:
-- ============================================================================

ALTER TABLE public.tickets REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- Consulta de sólo lectura para verificar que ambas tablas están en Realtime:
-- SELECT tablename 
-- FROM pg_publication_tables 
-- WHERE pubname = 'supabase_realtime' 
--   AND schemaname = 'public' 
--   AND tablename IN ('tickets', 'orders');
