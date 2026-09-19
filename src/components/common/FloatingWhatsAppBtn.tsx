import React, { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useTicketCart } from '@/context/useTicketCart';
import { createWhatsAppLink } from '@/lib/utils';
import styles from './FloatingWhatsAppBtn.module.css';

interface FloatingWhatsAppBtnProps {
  customMessage?: string;
}

export const FloatingWhatsAppBtn: React.FC<FloatingWhatsAppBtnProps> = ({
  customMessage = 'Hola Manaure Vive, deseo información sobre la Gran Rifa Ecoturística.',
}) => {
  const settings = useSystemSettings();
  const { isCheckoutOpen } = useTicketCart();
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const [hasActiveDialog, setHasActiveDialog] = useState(false);

  const rawNumber = settings.support_whatsapp_number || '573001234567';
  const whatsappUrl = createWhatsAppLink(rawNumber, customMessage);

  // Detección reactiva de modales o lightbox en el DOM
  useEffect(() => {
    const checkDialogs = () => {
      if (typeof document === 'undefined') return;
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]');
      const bodyLocked = document.body.style.overflow === 'hidden';
      setHasActiveDialog(Boolean(dialog || bodyLocked));
    };

    checkDialogs();

    const observer = new MutationObserver(checkDialogs);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  const isHiddenOrInert = isCheckoutOpen || hasActiveDialog;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setTooltipDismissed(true);
    }
  };

  const handlePointerLeave = () => {
    setTooltipDismissed(false);
  };

  const handleBlur = () => {
    setTooltipDismissed(false);
  };

  return (
    <aside
      className={`${styles.floatingBtnWrapper} ${isHiddenOrInert ? styles.btnHidden : ''}`}
      aria-hidden={isHiddenOrInert}
      inert={isHiddenOrInert}
    >
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.floatingBtnContainer}
        aria-label="Escribir por WhatsApp"
        onKeyDown={handleKeyDown}
        onPointerLeave={handlePointerLeave}
        onBlur={handleBlur}
        tabIndex={isHiddenOrInert ? -1 : 0}
      >
        <span
          className={`${styles.tooltip} ${tooltipDismissed ? styles.tooltipDismissed : ''}`}
          role="tooltip"
          id="whatsapp-tooltip"
        >
          ¿Tienes dudas? ¡Escríbenos!
        </span>
        <div className={styles.floatingBtn}>
          <div className={styles.pulseRing} aria-hidden="true" />
          <MessageCircle size={28} strokeWidth={2.2} className={styles.whatsappIcon} aria-hidden="true" />
        </div>
      </a>
    </aside>
  );
};
