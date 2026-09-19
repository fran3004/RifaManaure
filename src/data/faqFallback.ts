import type { FaqItem } from '@/types/raffle.types';

/**
 * Métodos de pago oficiales aceptados.
 * Fuente única compartida entre el módulo de preguntas frecuentes y el pie de página.
 */
export const PAYMENT_METHODS = [
  'Bre-B',
  'Nequi',
  'Daviplata',
  'Bancolombia',
  'Transferencias bancarias',
] as const;

export type PaymentMethodName = typeof PAYMENT_METHODS[number];

/**
 * Respaldo local oficial de Preguntas Frecuentes.
 * Garantiza que la landing page nunca quede vacía en caso de problemas de red
 * o si la base de datos Supabase aún no tiene cargada la tabla faq_items.
 */
export const FALLBACK_FAQS: FaqItem[] = [
  {
    id: 'faq-1',
    question: '¿Cómo se determina el número ganador del sorteo?',
    answer:
      'El ganador se define de manera 100% transparente con las 3 últimas cifras del Premio Mayor de la Lotería de Santander en la fecha estipulada del sorteo. No usamos tómbolas internas ni software opaco; los resultados son públicos y auditables por cualquier participante.',
    sort_order: 10,
    is_published: true,
  },
  {
    id: 'faq-2',
    question: '¿Qué incluye exactamente el paquete para 2 personas?',
    answer:
      'Incluye el Tour Vive Manaure de 3 días y 2 noches para la pareja (2 personas) con viaje pago ida y vuelta desde tu lugar de residencia hasta Manaure - Cesar, hospedaje en los mejores hoteles / glamping, noche romántica, alimentación completa (desayunos, almuerzos campestres y cenas típicas), experiencia en cuatrimoto por trochas, vuelo libre en parapente tándem, ruta a la Casa de Vidrio en la Serranía de Perijá con fogata nocturna y registro fotográfico profesional.',
    sort_order: 20,
    is_published: true,
  },
  {
    id: 'faq-3',
    question: '¿Cómo y cuándo recibo la confirmación de mis boletos?',
    answer:
      'Inmediatamente después de registrar tu transferencia y validar tu comprobante, el sistema te muestra tu certificado digital de compra. Además, puedes consultar en cualquier momento tus boletos activos ingresando tu número de cédula en la sección "Consultar Boletos".',
    sort_order: 30,
    is_published: true,
  },
  {
    id: 'faq-4',
    question: '¿Qué vigencia tiene el premio y cómo se coordina la fecha del viaje?',
    answer:
      'El ganador tendrá hasta 6 meses a partir de la fecha del sorteo para coordinar su viaje en la fecha de su preferencia (sujeto a disponibilidad y previa reserva de 15 días con los operadores turísticos de Manaure Vive).',
    sort_order: 40,
    is_published: true,
  },
  {
    id: 'faq-5',
    question: '¿Puedo transferir o ceder el premio a un familiar o amigo?',
    answer:
      'Sí. Si eres el titular del boleto ganador y deseas obsequiar o ceder la experiencia a otra persona, podrás hacerlo mediante notificación formal por WhatsApp y correo electrónico con copia de tu documento de identidad.',
    sort_order: 50,
    is_published: true,
  },
  {
    id: 'faq-6',
    question: '¿Cuáles son los métodos de pago disponibles?',
    answer:
      'Aceptamos transferencias directas mediante Bre-B, Nequi, Daviplata, Bancolombia y cualquier entidad bancaria nacional que permita transferencias. No recibimos pagos con tarjeta de crédito ni débito.',
    sort_order: 60,
    is_published: true,
  },
];

