import React, { useState, useEffect, useRef } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';
import { SectionHeader } from '@/components/public/ui';
import { getCachedFaqs, getPublicFaqs } from '@/services/faqService';
import type { FaqItem } from '@/types/raffle.types';
import styles from './PreguntasFrecuentes.module.css';

export const PreguntasFrecuentes: React.FC = () => {
  // Inicialización sincrónica desde caché o respaldo local: elimina completamente el FOUC
  const [faqs, setFaqs] = useState<FaqItem[]>(() => getCachedFaqs());
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Revalidación en segundo plano desde Supabase (cache-first)
  useEffect(() => {
    let isMounted = true;
    getPublicFaqs().then((data) => {
      if (isMounted && data && data.length > 0) {
        setFaqs(data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const toggleIndex = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  // Navegación por teclado según el estándar WAI-ARIA Accordion
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const total = faqs.length;
    if (total === 0) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = (index + 1) % total;
        buttonRefs.current[nextIndex]?.focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = (index - 1 + total) % total;
        buttonRefs.current[prevIndex]?.focus();
        break;
      }
      case 'Home': {
        e.preventDefault();
        buttonRefs.current[0]?.focus();
        break;
      }
      case 'End': {
        e.preventDefault();
        buttonRefs.current[total - 1]?.focus();
        break;
      }
      default:
        break;
    }
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

        <div className={styles.accordionContainer} role="presentation">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            const questionId = `faq-btn-${index}`;
            const answerId = `faq-panel-${index}`;

            return (
              <div
                key={faq.id || `faq-${index}`}
                className={`${styles.faqCard} ${isOpen ? styles.faqCardOpen : ''}`}
              >
                <button
                  ref={(el) => {
                    buttonRefs.current[index] = el;
                  }}
                  id={questionId}
                  type="button"
                  className={styles.questionBtn}
                  onClick={() => toggleIndex(index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
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

                {/* El contenido permanece en el DOM: animado con CSS grid rows e inert cuando está cerrado */}
                <div
                  id={answerId}
                  className={`${styles.accordionPanel} ${isOpen ? styles.accordionPanelOpen : ''}`}
                  role="region"
                  aria-labelledby={questionId}
                  inert={!isOpen}
                >
                  <div className={styles.accordionInner}>
                    <div className={styles.panelDivider} aria-hidden="true" />
                    <div className={styles.answerContainer}>
                      <p className={styles.answerText}>{faq.answer}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
