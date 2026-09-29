-- ==============================================================================
-- PROTOCOLO OFICIAL DE PURGA Y PUESTA EN PRODUCCIÓN - "MANAURE VIVE"
-- ARCHIVO: supabase/scripts/reset_to_production.sql
-- ==============================================================================
-- PROPÓSITO:
-- Vaciar por completo todos los datos transaccionales de prueba
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
-- TÉCNICA: session_replication_role = 'replica'
--   • Bypasea TODOS los triggers de usuario (incluyendo validaciones comerciales)
--     SIN necesitar ALTER TABLE DISABLE TRIGGER (que falla con pending trigger events).
--   • NO desactiva los triggers de sistema (RI_ConstraintTrigger_* de claves foráneas).
--   • Requiere rol postgres / service_role (Supabase lo permite con acceso total).
--   • Se restaura automáticamente al cerrar la sesión, pero se restaura explícitamente
--     al final para máxima seguridad.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PASO 1: ACTIVAR MODO RÉPLICA — bypasea triggers de validación comercial
-- (Evita el error "cannot ALTER TABLE because it has pending trigger events")
-- ------------------------------------------------------------------------------
SET session_replication_role = 'replica';

-- ------------------------------------------------------------------------------
-- PASO 2: RESTABLECER BOLETOS A DISPONIBLES (sin restricciones de transición)
-- ------------------------------------------------------------------------------

-- 2.1 Restablecer todos los boletos al estado original 'available'
UPDATE public.tickets
SET
    status             = 'available',
    buyer_id           = NULL,
    order_id           = NULL,
    reserved_at        = NULL,
    reservation_expires_at = NULL,
    updated_at         = NOW();

-- 2.2 Sincronizar grilla pública en tiempo real
UPDATE public.ticket_public_state
SET
    status     = 'available',
    updated_at = NOW();

-- ------------------------------------------------------------------------------
-- PASO 3: BORRAR DATOS TRANSACCIONALES (en orden correcto por FK)
-- ------------------------------------------------------------------------------

-- 3.1 Tablas dependientes de orders (antes de borrar órdenes)
DELETE FROM public.winners;
DELETE FROM public.payment_proofs;
DELETE FROM public.notification_logs;

-- 3.2 Órdenes (ya sin boletos ni dependencias)
DELETE FROM public.orders;

-- 3.3 Compradores (Habeas data limpio — sin órdenes huérfanas)
DELETE FROM public.buyers;

-- 3.4 Logs de auditoría y bloqueos de rate-limit de prueba
DELETE FROM public.audit_logs;
DELETE FROM public.verification_rate_limits;

-- ------------------------------------------------------------------------------
-- PASO 4: ACTIVAR LA RIFA PARA VENTAS REALES
-- ------------------------------------------------------------------------------
UPDATE public.raffles
SET
    status     = 'active',
    updated_at = NOW()
WHERE status IN ('active', 'closed', 'paused');

-- ------------------------------------------------------------------------------
-- PASO 5: RESTAURAR MODO NORMAL — reactivar todos los triggers de validación
-- ------------------------------------------------------------------------------
SET session_replication_role = 'origin';

-- ==============================================================================
-- CONSULTA DE CERTIFICACIÓN Y AUDITORÍA POST-PURGA
-- (Ejecutar para constatar balance en ceros y seguridad activa)
-- ==============================================================================

-- 1. Balance general (cero ventas, activos 100% preservados):
SELECT
    (SELECT COUNT(*) FROM public.buyers)                              AS compradores_prueba,
    (SELECT COUNT(*) FROM public.orders)                              AS ordenes_prueba,
    (SELECT COUNT(*) FROM public.payment_proofs)                      AS comprobantes_prueba,
    (SELECT COUNT(*) FROM public.winners)                             AS ganadores_prueba,
    (SELECT COUNT(*) FROM public.notification_logs)                   AS notificaciones_prueba,
    (SELECT COUNT(*) FROM public.tickets WHERE status != 'available') AS boletos_ocupados,
    (SELECT COUNT(*) FROM public.tickets WHERE status = 'available')  AS boletos_disponibles,
    (SELECT COUNT(*) FROM public.partners)                            AS aliados_intactos,
    (SELECT COUNT(*) FROM public.prize_settings)                      AS premio_intacto,
    (SELECT COUNT(*) FROM public.gallery_items)                       AS fotos_galeria_intactas,
    (SELECT COUNT(*) FROM public.payment_accounts)                    AS cuentas_pago_intactas,
    (SELECT COUNT(*) FROM public.admin_users)                         AS administradores_intactos;

-- 2. Certificación de seguridad (triggers de integridad activos post-purga):
SELECT
    c.relname                   AS tabla,
    t.tgname                    AS disparador_seguridad,
    CASE t.tgenabled
        WHEN 'O' THEN '✅ Activo'
        WHEN 'D' THEN '❌ Deshabilitado'
        ELSE t.tgenabled::text
    END                         AS estado_politica
FROM   pg_trigger    t
JOIN   pg_class      c ON t.tgrelid    = c.oid
JOIN   pg_namespace  n ON c.relnamespace = n.oid
WHERE  n.nspname = 'public'
  AND  c.relname IN ('tickets', 'orders', 'ticket_public_state', 'buyers', 'raffles')
  AND  NOT t.tgisinternal
ORDER  BY c.relname, t.tgname;

-- ==============================================================================
-- NOTA SOBRE ALMACENAMIENTO (storage.objects — bucket 'payment-proofs'):
-- Las imágenes de comprobantes NO se pueden borrar con DELETE directo por el
-- trigger storage.protect_delete(). Para vaciarlas usar:
--   Opción A (recomendada): Supabase Dashboard → Storage → payment-proofs → seleccionar todo → Delete.
--   Opción B: RPC administrativa o Storage API con service_role key.
-- ==============================================================================
