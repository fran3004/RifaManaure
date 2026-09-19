-- ============================================================================
-- MIGRACIÓN 032: GESTIÓN DE PREGUNTAS FRECUENTES (faq_items)
-- ============================================================================
-- 1. Tabla faq_items para catálogo de preguntas y respuestas oficiales
-- 2. Índice de ordenamiento por sort_order
-- 3. Habilitación de RLS con política de lectura pública exclusiva
-- 4. Trigger para actualización automática de updated_at
-- 5. Semilla inicial con las 6 preguntas frecuentes oficiales (orden 10 a 60)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.faq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faq_items_sort_idx ON public.faq_items (sort_order);

ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública: cualquier usuario anónimo o autenticado puede leer las publicadas
DROP POLICY IF EXISTS "faq_items_public_read" ON public.faq_items;
CREATE POLICY "faq_items_public_read" ON public.faq_items
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

-- Sin políticas de INSERT, UPDATE o DELETE para clientes anon/authenticated.
-- Las mutaciones se realizan exclusivamente vía Supabase Dashboard (Table Editor)
-- o con service_role / superadmin en base de datos.

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.fn_faq_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_faq_items_updated_at ON public.faq_items;
CREATE TRIGGER trg_faq_items_updated_at
  BEFORE UPDATE ON public.faq_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_faq_items_updated_at();

-- Semilla oficial con las 6 preguntas frecuentes
INSERT INTO public.faq_items (question, answer, sort_order, is_published)
VALUES
(
  '¿Cómo se determina el número ganador del sorteo?',
  'El ganador se define de manera 100% transparente con las 3 últimas cifras del Premio Mayor de la Lotería de Santander en la fecha estipulada del sorteo. No usamos tómbolas internas ni software opaco; los resultados son públicos y auditables por cualquier participante.',
  10,
  true
),
(
  '¿Qué incluye exactamente el paquete para 2 personas?',
  'Incluye el Tour Vive Manaure de 3 días y 2 noches para la pareja (2 personas) con viaje pago ida y vuelta desde tu lugar de residencia hasta Manaure - Cesar, hospedaje en los mejores hoteles / glamping, noche romántica, alimentación completa (desayunos, almuerzos campestres y cenas típicas), experiencia en cuatrimoto por trochas, vuelo libre en parapente tándem, ruta a la Casa de Vidrio en la Serranía de Perijá con fogata nocturna y registro fotográfico profesional.',
  20,
  true
),
(
  '¿Cómo y cuándo recibo la confirmación de mis boletos?',
  'Inmediatamente después de registrar tu transferencia y validar tu comprobante, el sistema te muestra tu certificado digital de compra. Además, puedes consultar en cualquier momento tus boletos activos ingresando tu número de cédula en la sección "Consultar Boletos".',
  30,
  true
),
(
  '¿Qué vigencia tiene el premio y cómo se coordina la fecha del viaje?',
  'El ganador tendrá hasta 6 meses a partir de la fecha del sorteo para coordinar su viaje en la fecha de su preferencia (sujeto a disponibilidad y previa reserva de 15 días con los operadores turísticos de Manaure Vive).',
  40,
  true
),
(
  '¿Puedo transferir o ceder el premio a un familiar o amigo?',
  'Sí. Si eres el titular del boleto ganador y deseas obsequiar o ceder la experiencia a otra persona, podrás hacerlo mediante notificación formal por WhatsApp y correo electrónico con copia de tu documento de identidad.',
  50,
  true
),
(
  '¿Cuáles son los métodos de pago disponibles?',
  'Aceptamos transferencias directas mediante Bre-B, Nequi, Daviplata, Bancolombia y cualquier entidad bancaria nacional que permita transferencias. No recibimos pagos con tarjeta de crédito ni débito.',
  60,
  true
)
ON CONFLICT DO NOTHING;

