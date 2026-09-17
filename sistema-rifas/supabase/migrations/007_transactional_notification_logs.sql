-- ============================================================================
-- MIGRACIÓN 007: REGISTRO DE NOTIFICACIONES TRANSACCIONALES (RESEND EMAIL)
-- ============================================================================

-- 1. Tabla de Logs de Notificaciones
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('PAYMENT_RECEIVED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED')),
    channel VARCHAR(20) DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp', 'sms')),
    recipient VARCHAR(255) NOT NULL,
    resend_email_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    attempts INTEGER DEFAULT 1,
    error_message TEXT,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índices de Rendimiento e Idempotencia
CREATE INDEX IF NOT EXISTS idx_notification_logs_order_id ON public.notification_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_idempotency_key ON public.notification_logs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_notification_logs_resend_email_id ON public.notification_logs(resend_email_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON public.notification_logs(status);

-- 3. Habilitar RLS
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Seguridad (RLS)
-- Los administradores autorizados pueden ver todos los registros de notificaciones
CREATE POLICY "Admins pueden ver todos los logs de notificaciones" ON public.notification_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- Permitir a usuarios autenticados consultar logs de sus propias órdenes
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

-- El servicio backend / Edge Functions gestiona los registros con Service Role
-- (El Service Role omite RLS automáticamente en Supabase).

