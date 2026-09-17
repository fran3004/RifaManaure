-- ============================================================================
-- MIGRACIÓN 008: PREFERENCIA DE CONTACTO Y CANAL DE NOTIFICACIÓN EN ÓRDENES
-- ============================================================================

-- 1. Agregar columna contact_preference a la tabla orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS contact_preference VARCHAR(20) DEFAULT 'both' 
CHECK (contact_preference IN ('whatsapp', 'email', 'both'));

-- 2. Índice para consultas por preferencia de notificación
CREATE INDEX IF NOT EXISTS idx_orders_contact_preference ON public.orders(contact_preference);

-- 3. Comentario explicativo
COMMENT ON COLUMN public.orders.contact_preference IS 'Canal de comunicación preferido por el comprador para recibir confirmaciones: whatsapp, email, o both.';

