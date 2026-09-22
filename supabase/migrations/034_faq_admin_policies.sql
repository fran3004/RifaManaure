-- ============================================================================
-- MIGRACIÓN 034: POLÍTICAS RLS DE GESTIÓN ADMINISTRATIVA PARA PREGUNTAS FRECUENTES (faq_items)
-- ============================================================================
-- 1. Actualizar política SELECT para que administradores activos puedan ver
--    todas las preguntas frecuentes (incluso borradores o despublicadas).
-- 2. Habilitar permisos INSERT, UPDATE y DELETE (FOR ALL) para administradores
--    autenticados verificados mediante la función de seguridad public.is_admin().
-- ============================================================================

-- 1. SELECT ampliado: usuarios anónimos ven publicadas; administradores ven todas
DROP POLICY IF EXISTS "faq_items_public_read" ON public.faq_items;
CREATE POLICY "faq_items_public_read" ON public.faq_items
  FOR SELECT TO anon, authenticated
  USING (
    is_published = true 
    OR (auth.role() = 'authenticated' AND public.is_admin(auth.uid()))
  );

-- 2. MUTACIÓN (INSERT, UPDATE, DELETE) exclusiva para administradores activos
DROP POLICY IF EXISTS "Administradores gestionan faq_items" ON public.faq_items;
CREATE POLICY "Administradores gestionan faq_items" ON public.faq_items
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

