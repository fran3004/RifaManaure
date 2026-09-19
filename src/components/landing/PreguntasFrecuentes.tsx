import React, { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';
import { SectionHeader } from '@/components/public/ui';
import styles from './PreguntasFrecuentes.module.css';

interface FaqItem {
  question: string;
  answer: string;
}

const faqs: FaqItem[] = [
  {
    question: '¿Cómo se determina el número ganador del sorteo?',
    answer:
      'El ganador se define de manera 100% transparente con las 3 últimas cifras del Premio Mayor de la Lotería de Santander en la fecha estipulada del sorteo. No usamos tómbolas internas ni software opaco; los resultados son públicos y auditables por cualquier participante.',
  },
  {
    question: '¿Qué incluye exactamente el paquete para 2 personas?',
    answer:
      'Incluye 3 días y 2 noches en Glamping de lujo con fogata y desayuno campestre, tour guiado en cuatrimotos todoterreno, vuelo tándem en parapente con registro en video, expedición ecológica a la Serranía del Perijá, almuerzo típico tradicional y sesión de fotos profesional.',
  },
  {
    question: '¿Cómo y cuándo recibo la confirmación de mis boletos?',
    answer:
      'Inmediatamente después de confirmar tu pago en la pasarela o validar tu comprobante, el sistema te muestra tu certificado digital de compra. Además, puedes consultar en cualquier momento tus boletos activos ingresando tu número de cédula en la sección "Consultar Boletos".',
  },
  {
    question: '¿Qué vigencia tiene el premio y cómo se coordina la fecha del viaje?',
    answer:
      'El ganador tendrá hasta 6 meses a partir de la fecha del sorteo para coordinar su viaje en la fecha de su preferencia (sujeto a disponibilidad y previa reserva de 15 días con los operadores turísticos de Manaure Vive).',
  },
  {
    question: '¿Puedo transferir o ceder el premio a un familiar o amigo?',
    answer:
      'Sí. Si eres el titular del boleto ganador y deseas obsequiar o ceder la experiencia a otra persona, podrás hacerlo mediante notificación formal por WhatsApp y correo electrónico con copia de tu documento de identidad.',
  },
  {
    question: '¿Cuáles son los métodos de pago disponibles?',
    answer:
      'Aceptamos pagos en línea mediante PSE, tarjetas de crédito/débito (Visa, Mastercard, American Express), y transferencias directas desde Nequi, Daviplata y Bancolombia.',
  },
];

export const PreguntasFrecuentes: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleIndex = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className={styles.faqSection} aria-labelledby="titulo-faq">
      <div className="container">
        <SectionHeader
          id="titulo-faq"
          badge="Transparencia y Legalidad"
          icon={<HelpCircle size={16} aria-hidden="true" />}
          title="Preguntas Frecuentes"
          subtitle="Todo lo que necesitas saber sobre la mecánica del sorteo, medios de pago y entrega del premio."
        />

        <div className={styles.accordionContainer}>
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            const questionId = `faq-btn-${index}`;
            const answerId = `faq-answer-${index}`;

            return (
              <div key={index} className={`${styles.faqCard} ${isOpen ? styles.faqCardOpen : ''}`}>
                <button
                  id={questionId}
                  type="button"
                  className={styles.questionBtn}
                  onClick={() => toggleIndex(index)}
                  aria-expanded={isOpen}
                  aria-controls={answerId}
                >
                  <span className={styles.questionText}>{faq.question}</span>
                  <ChevronDown
                    size={20}
                    aria-hidden="true"
                    className={`${styles.chevron} ${isOpen ? styles.chevronRotated : ''}`}
                  />
                </button>

                {isOpen && (
                  <div
                    id={answerId}
                    className={styles.answerContainer}
                    role="region"
                    aria-labelledby={questionId}
                  >
                    <p className={styles.answerText}>{faq.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
