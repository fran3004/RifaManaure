-- ============================================================================
-- MIGRACIÓN 009: TRAZABILIDAD INTEGRAL DE NOTIFICACIONES (WHATSAPP Y EMAIL)
-- ============================================================================

-- 1. Asegurar que la tabla notification_logs existe con todas las columnas requeridas
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    resend_email_id VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 1,
    error_message TEXT,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Normalizar restricciones de CHECK para admitir formato estricto (minúsculas y mayúsculas)
ALTER TABLE public.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_channel_check;
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_channel_check 
    CHECK (channel IN ('whatsapp', 'email', 'sms'));

ALTER TABLE public.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_event_type_check;
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_event_type_check 
    CHECK (event_type IN ('payment_received', 'payment_approved', 'payment_rejected', 'PAYMENT_RECEIVED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED'));

ALTER TABLE public.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_status_check;
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_status_check 
    CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'bounced'));

-- 3. Índices de trazabilidad para búsquedas rápidas en panel de control
CREATE INDEX IF NOT EXISTS idx_notification_logs_order_id ON public.notification_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_channel ON public.notification_logs(channel);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON public.notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON public.notification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_idempotency ON public.notification_logs(idempotency_key);

-- 4. Habilitar RLS y políticas de seguridad
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  -- Política para admins autorizados (SELECT, INSERT, UPDATE)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notification_logs' AND policyname = 'Admins pueden gestionar todos los logs de notificaciones'
  ) THEN
    CREATE POLICY "Admins pueden gestionar todos los logs de notificaciones" ON public.notification_logs
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  -- Política para compradores (SELECT solo de sus propias órdenes)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notification_logs' AND policyname = 'Compradores pueden ver logs de sus órdenes'
  ) THEN
    CREATE POLICY "Compradores pueden ver logs de sus órdenes" ON public.notification_logs
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.orders o
          JOIN public.buyers b ON b.id = o.buyer_id
          WHERE o.id = notification_logs.order_id
            AND LOWER(b.email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.notification_logs IS 'Registro histórico de trazabilidad de notificaciones enviadas por WhatsApp y Email.';

