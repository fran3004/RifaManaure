-- ============================================================================
-- MIGRACIÓN 058: Profesionalización de Trazabilidad en notification_logs (Brevo)
-- ============================================================================
-- Propósito:
-- 1. Añadir columnas aditivas estructuradas a la tabla public.notification_logs:
--    - provider: 'brevo' (para email) | 'manual' (para WhatsApp manual).
--    - provider_message_id: messageId oficial de Brevo (NULL para WhatsApp).
--    - last_attempt_at: marca temporal del intento más reciente.
--    - delivered_at: marca temporal de confirmación de entrega en buzón.
--    - failed_at: marca temporal de fallo o rebote registrado.
-- 2. Asegurar idempotencia estricta mediante idempotency_key UNIQUE (order + event + channel).
-- 3. Crear índices de rendimiento optimizados para búsquedas operativas y webhooks.
-- 4. Preservar 100% el historial existente sin modificaciones destructivas.
-- ============================================================================

-- 1. Incorporar nuevas columnas aditivas de forma segura
ALTER TABLE public.notification_logs 
    ADD COLUMN IF NOT EXISTS provider VARCHAR(50);

ALTER TABLE public.notification_logs 
    ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(255);

ALTER TABLE public.notification_logs 
    ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

ALTER TABLE public.notification_logs 
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE public.notification_logs 
    ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

-- 2. Restricciones de validación (CHECK) para provider
ALTER TABLE public.notification_logs 
    DROP CONSTRAINT IF EXISTS notification_logs_provider_check;

ALTER TABLE public.notification_logs 
    ADD CONSTRAINT notification_logs_provider_check 
    CHECK (provider IS NULL OR provider IN ('brevo', 'manual'));

-- Reafirmar restricciones de estado y evento canónicas
ALTER TABLE public.notification_logs 
    DROP CONSTRAINT IF EXISTS notification_logs_status_check;

ALTER TABLE public.notification_logs 
    ADD CONSTRAINT notification_logs_status_check 
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced'));

ALTER TABLE public.notification_logs 
    DROP CONSTRAINT IF EXISTS notification_logs_event_type_check;

ALTER TABLE public.notification_logs 
    ADD CONSTRAINT notification_logs_event_type_check 
    CHECK (event_type IN (
        'payment_received', 'payment_approved', 'payment_rejected',
        'PAYMENT_RECEIVED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED'
    ));

ALTER TABLE public.notification_logs 
    DROP CONSTRAINT IF EXISTS notification_logs_channel_check;

ALTER TABLE public.notification_logs 
    ADD CONSTRAINT notification_logs_channel_check 
    CHECK (channel IN ('whatsapp', 'email', 'sms'));

-- 3. Garantizar unicidad de la clave idempotente (order + event + channel)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.notification_logs'::regclass 
          AND conname = 'notification_logs_idempotency_key_key'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        WHERE i.indrelid = 'public.notification_logs'::regclass
          AND i.indisunique = true
          AND (
            SELECT string_agg(attname, ',') 
            FROM pg_attribute 
            WHERE attrelid = 'public.notification_logs'::regclass 
              AND attnum = ANY(i.indkey)
          ) = 'idempotency_key'
    ) THEN
        ALTER TABLE public.notification_logs 
            ADD CONSTRAINT notification_logs_idempotency_key_key UNIQUE (idempotency_key);
    END IF;
END $$;

-- 4. Migración de datos existentes (backfill no destructivo)
-- Asignar proveedor según canal
UPDATE public.notification_logs
SET provider = CASE 
    WHEN channel = 'email' THEN 'brevo' 
    ELSE 'manual' 
END
WHERE provider IS NULL;

-- Extraer messageId de metadata si ya existía en registros de correo
UPDATE public.notification_logs
SET provider_message_id = COALESCE(metadata->>'messageId', metadata->>'message_id')
WHERE provider_message_id IS NULL
  AND channel = 'email'
  AND (metadata->>'messageId' IS NOT NULL OR metadata->>'message_id' IS NOT NULL);

-- Inicializar last_attempt_at con la fecha de actualización o creación
UPDATE public.notification_logs
SET last_attempt_at = COALESCE(updated_at, created_at, NOW())
WHERE last_attempt_at IS NULL;

-- Sincronizar fechas de fallo y entrega según estado histórico
UPDATE public.notification_logs
SET failed_at = updated_at
WHERE failed_at IS NULL AND status IN ('failed', 'bounced');

UPDATE public.notification_logs
SET delivered_at = updated_at
WHERE delivered_at IS NULL AND status = 'delivered';

-- 5. Índices optimizados para auditoría, webhooks y deduplicación
CREATE INDEX IF NOT EXISTS idx_notification_logs_provider 
    ON public.notification_logs(provider);

CREATE INDEX IF NOT EXISTS idx_notification_logs_provider_message_id 
    ON public.notification_logs(provider_message_id) 
    WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_logs_order_channel_event 
    ON public.notification_logs(order_id, channel, event_type);

CREATE INDEX IF NOT EXISTS idx_notification_logs_last_attempt_at 
    ON public.notification_logs(last_attempt_at DESC);

-- 6. Documentación del esquema
COMMENT ON COLUMN public.notification_logs.provider IS 
    'Proveedor de mensajería: "brevo" para correos transaccionales automatizados, "manual" para WhatsApp manual.';

COMMENT ON COLUMN public.notification_logs.provider_message_id IS 
    'Identificador oficial devuelto por el proveedor Brevo (messageId). Permanece NULL para WhatsApp manual.';

COMMENT ON COLUMN public.notification_logs.last_attempt_at IS 
    'Fecha y hora del último intento o reintento de despacho.';

COMMENT ON COLUMN public.notification_logs.delivered_at IS 
    'Fecha y hora de confirmación de entrega en el buzón de destino (vía webhook de Brevo).';

COMMENT ON COLUMN public.notification_logs.failed_at IS 
    'Fecha y hora del último error o rebote registrado en el despacho.';
