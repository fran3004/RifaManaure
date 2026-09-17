import React, { useState, useEffect } from 'react';
import {
  generateDigitalReceiptCanvas,
  downloadDigitalReceiptImage,
  printOrSavePdfDigitalReceipt,
  getWhatsAppShareText,
  type DigitalReceiptData,
} from '@/services/receiptGeneratorService';
import {
  X,
  FileText,
  MessageCircle,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  Smartphone,
} from 'lucide-react';
import styles from './DigitalReceiptModal.module.css';

interface DigitalReceiptModalProps {
  receiptData: DigitalReceiptData | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DigitalReceiptModal: React.FC<DigitalReceiptModalProps> = ({
  receiptData,
  isOpen,
  onClose,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const generatePreview = async () => {
      if (!isOpen || !receiptData) {
        setPreviewUrl(null);
        return;
      }

      setIsGenerating(true);
      setErrorMsg(null);

      try {
        const canvas = await generateDigitalReceiptCanvas(receiptData);
        if (active) {
          const url = canvas.toDataURL('image/png');
          setPreviewUrl(url);
          setIsGenerating(false);
        }
      } catch (err: unknown) {
        if (active) {
          setErrorMsg(err instanceof Error ? err.message : 'Error al generar comprobante.');
          setIsGenerating(false);
        }
      }
    };

    void generatePreview();

    return () => {
      active = false;
    };
  }, [isOpen, receiptData]);

  if (!isOpen || !receiptData) return null;

  const handleDownloadImage = async () => {
    try {
      await downloadDigitalReceiptImage(receiptData);
    } catch (err) {
      console.error('Error al descargar imagen:', err);
    }
  };

  const handlePrintPdf = async () => {
    try {
      await printOrSavePdfDigitalReceipt(receiptData);
    } catch (err) {
      console.error('Error al generar PDF:', err);
    }
  };

  const handleCopyShareLink = async () => {
    try {
      const shareText = getWhatsAppShareText(receiptData);
      await navigator.clipboard.writeText(shareText);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (err) {
      console.error('Error al copiar texto:', err);
    }
  };

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(getWhatsAppShareText(receiptData))}`;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Cabecera */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleGroup}>
            <div className={styles.modalTitleIcon}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className={styles.modalTitle}>Comprobante Digital Oficial</h3>
              <p className={styles.modalSubtitle}>
                Orden: <strong>{receiptData.orderReference}</strong> • {receiptData.ticketNumbers.length} Boletos
              </p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <X size={22} />
          </button>
        </div>

        {/* Previsualización del Comprobante */}
        <div className={styles.previewContainer}>
          {isGenerating ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#9cb5ab' }}>
              <div style={{ fontSize: '1rem', fontWeight: 600 }}>Generando certificado digital en alta resolución...</div>
              <div style={{ fontSize: '0.8rem', color: '#5e7a6f', marginTop: '0.35rem' }}>Verificando validez y sellos oficiales</div>
            </div>
          ) : errorMsg ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#f87171' }}>
              <div>{errorMsg}</div>
            </div>
          ) : previewUrl ? (
            <img src={previewUrl} alt={`Comprobante ${receiptData.orderReference}`} className={styles.previewImage} />
          ) : null}
        </div>

        {/* Mensaje de Seguridad */}
        <div className={styles.securityNotice}>
          <CheckCircle2 size={18} style={{ flexShrink: 0, color: '#34d399' }} />
          <div>
            <strong>Documento Oficial Autenticado:</strong> Este comprobante certifica la titularidad oficial de los números adquiridos ante la plataforma <strong>Manaure Vive</strong> y el sorteo programado.
          </div>
        </div>

        {/* Botones de Acción y Descarga */}
        <div className={styles.actionsGrid}>
          {/* Botón 1: Descargar Imagen para Celular */}
          <button
            type="button"
            className={styles.btnDownloadImage}
            onClick={() => void handleDownloadImage()}
            disabled={isGenerating || Boolean(errorMsg)}
          >
            <Smartphone size={18} />
            <span>Descargar Imagen (PNG)</span>
          </button>

          {/* Botón 2: Guardar como PDF / Imprimir */}
          <button
            type="button"
            className={styles.btnDownloadPdf}
            onClick={() => void handlePrintPdf()}
            disabled={isGenerating || Boolean(errorMsg)}
          >
            <FileText size={18} />
            <span>Guardar como PDF</span>
          </button>

          {/* Botón 3: Compartir por WhatsApp */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btnShareWhatsApp}
          >
            <MessageCircle size={18} />
            <span>Compartir por WhatsApp</span>
          </a>
        </div>

        {/* Copiar enlace / texto directo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '-0.5rem' }}>
          <button
            type="button"
            onClick={() => void handleCopyShareLink()}
            style={{
              background: 'none',
              border: 'none',
              color: copiedLink ? '#34d399' : 'var(--text-secondary, #9cb5ab)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.25rem 0.5rem',
            }}
          >
            {copiedLink ? <Check size={14} /> : <Copy size={14} />}
            <span>{copiedLink ? '¡Texto del comprobante copiado!' : 'Copiar texto y resumen de la orden'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
