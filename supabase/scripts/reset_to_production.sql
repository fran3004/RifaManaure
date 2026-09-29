-- ==============================================================================
-- PROTOCOLO OFICIAL DE PURGA Y PUESTA EN PRODUCCIÓN - "MANAURE VIVE"
-- ARCHIVO: supabase/scripts/reset_to_production.sql
-- ==============================================================================
-- PROPÓSITO:
-- Permite vaciar por completo todos los datos transaccionales de prueba
-- (órdenes, comprobantes, compradores, ganadores, notificaciones y logs)
-- dejando la plataforma en blanco, limpia y lista para entregas o nuevas ediciones,
-- PRESERVANDO INTACTOS TODOS LOS ACTIVOS ESENCIALES:
--   1. Rifa activa y su estructura (título, precio, fechas, lotería).
--   2. Numeración completa de boletos (restablecidos al 100% como disponibles).
--   3. Configuración y experiencias del Premio (prize_settings, prize_experiences).
--   4. Red de Aliados y sus perfiles de Instagram (partners).
--   5. Galería fotográfica completa (gallery_items, gallery_categories).
--   6. Diapositivas de la página principal (hero_slides).
--   7. Cuentas bancarias autorizadas (payment_accounts).
--   8. Usuarios administradores y superadministradores (admin_users).
--   9. Ajustes de la plataforma y preguntas frecuentes (system_settings, faq_items).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PASO 1: DESACTIVAR ÚNICAMENTE LOS TRIGGERS DE VALIDACIÓN COMERCIAL POR NOMBRE
-- NOTA IMPORTANTE: En Supabase NO debe usarse 'DISABLE TRIGGER ALL' porque intenta
-- apagar los triggers del sistema de claves foráneas (RI_ConstraintTrigger_*)
-- lo cual genera error 42501. Desactivar por nombre específico es 100% seguro.
-- ------------------------------------------------------------------------------
ALTER TABLE public.tickets DISABLE TRIGGER trg_validate_ticket_status;
ALTER TABLE public.orders DISABLE TRIGGER trg_validate_order_status;

-- ------------------------------------------------------------------------------
-- PASO 2: RESTABLECER LA TOTALIDAD DE LOS BOLETOS A DISPONIBLES Y PURGAR PRUEBAS
-- ------------------------------------------------------------------------------
-- 2.1 Restablecer todos los boletos al estado original 'available' (libres de comprador, orden y reservas)
UPDATE public.tickets
SET 
    status = 'available',
    buyer_id = NULL,
    order_id = NULL,
    reserved_at = NULL,
    reservation_expires_at = NULL,
    updated_at = NOW();

-- 2.2 Sincronizar grilla pública en tiempo real
UPDATE public.ticket_public_state
SET 
    status = 'available',
    updated_at = NOW();

-- 2.3 Eliminar dependencias de órdenes (ganadores, comprobantes y notificaciones)
DELETE FROM public.winners;
DELETE FROM public.payment_proofs;
DELETE FROM public.notification_logs;

-- 2.4 Eliminar órdenes de prueba (ya no tienen boletos asociados)
DELETE FROM public.orders;

-- 2.5 Eliminar compradores de prueba (Habeas data limpio)
DELETE FROM public.buyers;

-- 2.6 Limpiar auditoría transaccional de prueba y bloqueos temporales de rate-limit
DELETE FROM public.audit_logs;
DELETE FROM public.verification_rate_limits;

-- 2.7 Asegurar que la rifa actual quede en estado activo para ventas reales
UPDATE public.raffles
SET 
    status = 'active',
    updated_at = NOW()
WHERE status IN ('active', 'closed', 'paused');

-- ------------------------------------------------------------------------------
-- PASO 3: REACTIVAR DE INMEDIATO LOS TRIGGERS DE SEGURIDAD
-- ------------------------------------------------------------------------------
ALTER TABLE public.tickets ENABLE TRIGGER trg_validate_ticket_status;
ALTER TABLE public.orders ENABLE TRIGGER trg_validate_order_status;

-- ------------------------------------------------------------------------------
-- PASO 4: ALMACENAMIENTO DE COMPROBANTES (STORAGE)
-- NOTA: Supabase bloquea 'DELETE FROM storage.objects' directo por el trigger protect_delete.
-- Para vaciar las imágenes de prueba del bucket privado 'payment-proofs':
--   Opción A: Ir en Supabase Dashboard a Storage > bucket 'payment-proofs' > Seleccionar archivos > Delete.
--   Opción B: Usar la RPC administrativa integrada en el sistema o la Storage API.
-- ------------------------------------------------------------------------------


-- ==============================================================================
-- CONSULTA DE CERTIFICACIÓN Y AUDITORÍA POST-PURGA
-- (Ejecutar para constatar balance en ceros y seguridad activa)
-- ==============================================================================

-- 1. Balance general de datos (Cero ventas, Activos 100% preservados):
SELECT 
    (SELECT COUNT(*) FROM public.buyers) AS compradores_prueba,
    (SELECT COUNT(*) FROM public.orders) AS ordenes_prueba,
    (SELECT COUNT(*) FROM public.payment_proofs) AS comprobantes_prueba,
    (SELECT COUNT(*) FROM public.winners) AS ganadores_prueba,
    (SELECT COUNT(*) FROM public.tickets WHERE status != 'available') AS boletos_ocupados,
    (SELECT COUNT(*) FROM public.tickets WHERE status = 'available') AS boletos_disponibles,
    (SELECT COUNT(*) FROM public.ticket_public_state WHERE status != 'available') AS grilla_ocupados,
    (SELECT COUNT(*) FROM public.ticket_public_state WHERE status = 'available') AS grilla_disponibles,
    (SELECT COUNT(*) FROM public.partners) AS aliados_intactos,
    (SELECT COUNT(*) FROM public.prize_settings) AS premio_intacto,
    (SELECT COUNT(*) FROM public.gallery_items) AS fotos_galeria_intactas,
    (SELECT COUNT(*) FROM public.payment_accounts) AS cuentas_pago_intactas,
    (SELECT COUNT(*) FROM public.admin_users) AS administradores_intactos;

-- 2. Certificación de seguridad (Triggers de integridad activos):
SELECT 
    c.relname AS tabla,
    t.tgname AS disparador_seguridad,
    CASE t.tgenabled
        WHEN 'O' THEN '✅ Activo (Habilitado)'
        WHEN 'D' THEN '❌ Deshabilitado'
        ELSE 'Otro estado'
    END AS estado_politica
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('tickets', 'orders', 'ticket_public_state', 'buyers', 'raffles')
  AND NOT t.tgisinternal;
