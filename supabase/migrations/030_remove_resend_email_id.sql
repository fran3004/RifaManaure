-- ============================================================================
-- MIGRACIÓN 030: ELIMINACIÓN DE RESEND Y COLUMNAS OBSOLETAS DE EMAIL
-- ============================================================================
-- Propósito: Retirar la columna y el índice específicos de Resend de la tabla
-- notification_logs, preservando la totalidad del historial y funcionamiento
-- para el canal oficial de WhatsApp.
-- ============================================================================

-- 1. Eliminar índice de resend_email_id si existe
DROP INDEX IF EXISTS public.idx_notification_logs_resend_email_id;

-- 2. Eliminar columna resend_email_id de notification_logs de forma segura
ALTER TABLE public.notification_logs 
DROP COLUMN IF EXISTS resend_email_id;

-- 3. Actualizar comentario de la tabla notification_logs
COMMENT ON TABLE public.notification_logs IS 'Registro histórico de trazabilidad de notificaciones enviadas por WhatsApp.';

