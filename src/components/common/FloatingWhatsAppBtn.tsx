import React, { useState, useEffect } from 'react';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useTicketCart } from '@/context/useTicketCart';
import { createWhatsAppLink } from '@/lib/utils';
import styles from './FloatingWhatsAppBtn.module.css';

interface FloatingWhatsAppBtnProps {
  customMessage?: string;
}

// Icono oficial de WhatsApp con silueta y auricular de teléfono de alta fidelidad
const WhatsAppIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 36,
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 20.16C10.58 20.16 9.14 19.77 7.87 19.02L7.57 18.84L4.45 19.66L5.28 16.62L5.08 16.3C4.26 15 3.82 13.48 3.82 11.91C3.82 7.37 7.51 3.68 12.05 3.68C14.25 3.68 16.31 4.54 17.87 6.1C19.42 7.66 20.28 9.72 20.28 11.92C20.28 16.46 16.59 20.16 12.05 20.16ZM16.57 14.39C16.32 14.27 15.11 13.67 14.88 13.59C14.66 13.5 14.49 13.46 14.33 13.71C14.16 13.96 13.69 14.52 13.55 14.68C13.41 14.85 13.26 14.87 13.01 14.75C12.76 14.62 11.96 14.36 11.01 13.51C10.27 12.85 9.77 12.04 9.63 11.79C9.48 11.54 9.61 11.41 9.74 11.28C9.85 11.17 9.99 10.99 10.11 10.84C10.24 10.7 10.28 10.59 10.36 10.43C10.45 10.26 10.4 10.12 10.34 10C10.28 9.87 9.77 8.62 9.56 8.11C9.36 7.62 9.15 7.68 9 7.68C8.86 7.67 8.69 7.67 8.53 7.67C8.36 7.67 8.09 7.73 7.86 7.98C7.63 8.23 7 8.82 7 10.02C7 11.22 7.88 12.38 8 12.55C8.12 12.72 9.72 15.2 12.19 16.27C12.78 16.52 13.23 16.67 13.59 16.78C14.18 16.97 14.71 16.94 15.14 16.88C15.61 16.81 16.57 16.3 16.78 15.71C16.98 15.13 16.98 14.63 16.92 14.52C16.86 14.41 16.72 14.35 16.47 14.23L16.57 14.39Z" />
  </svg>
);

export const FloatingWhatsAppBtn: React.FC<FloatingWhatsAppBtnProps> = ({
  customMessage = 'Hola Manaure Vive, deseo información sobre la Gran Rifa Ecoturística.',
}) => {
  const settings = useSystemSettings();
  const { isCheckoutOpen } = useTicketCart();
  const [isHovered, setIsHovered] = useState(false);
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

  const showTooltip = isHovered && !tooltipDismissed && !isHiddenOrInert;

  return (
    <aside
      className={`${styles.floatingBtnWrapper} ${isHiddenOrInert ? styles.btnHidden : ''}`}
      aria-hidden={isHiddenOrInert}
      inert={isHiddenOrInert}
    >
      {/* Tooltip flotante con pointer-events: none estricto (no captura hover) */}
      <span
        className={`${styles.tooltip} ${showTooltip ? styles.tooltipVisible : ''}`}
        role="tooltip"
        id="whatsapp-tooltip"
        aria-hidden={!showTooltip}
      >
        ¿Tienes dudas? ¡Escríbenos!
      </span>

      {/* Botón interactivo: círculo estricto sin áreas transparentes externas */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.floatingBtn}
        aria-label="Escribir por WhatsApp"
        aria-describedby="whatsapp-tooltip"
        onMouseEnter={() => {
          setIsHovered(true);
          setTooltipDismissed(false);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
        }}
        onFocus={() => {
          setIsHovered(true);
          setTooltipDismissed(false);
        }}
        onBlur={() => {
          setIsHovered(false);
          setTooltipDismissed(false);
        }}
        onKeyDown={handleKeyDown}
        tabIndex={isHiddenOrInert ? -1 : 0}
      >
        <div className={styles.pulseRing} aria-hidden="true" />
        <WhatsAppIcon className={styles.whatsappIcon} size={36} />
      </a>
    </aside>
  );
};
