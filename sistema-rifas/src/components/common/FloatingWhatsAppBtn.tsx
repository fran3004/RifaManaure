import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { createWhatsAppLink } from '@/lib/utils';
import styles from './FloatingWhatsAppBtn.module.css';

interface FloatingWhatsAppBtnProps {
  customMessage?: string;
}

export const FloatingWhatsAppBtn: React.FC<FloatingWhatsAppBtnProps> = ({
  customMessage = 'Hola Manaure Vive, deseo información sobre la Gran Rifa Ecoturística.',
}) => {
  const settings = useSystemSettings();
  const rawNumber = settings.support_whatsapp_number || '573001234567';
  const whatsappUrl = createWhatsAppLink(rawNumber, customMessage);

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.floatingBtnContainer}
      aria-label="Atención y soporte oficial por WhatsApp"
      title="Atención directa por WhatsApp"
    >
      <span className={styles.tooltip}>¿Tienes dudas? ¡Escríbenos!</span>
      <div className={styles.floatingBtn}>
        <div className={styles.pulseRing} />
        <MessageCircle size={30} strokeWidth={2.2} />
      </div>
    </a>
  );
};

