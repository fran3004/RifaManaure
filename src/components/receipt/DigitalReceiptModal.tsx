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
  Download,
  Loader2,
  AlertTriangle,
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

  // Cierre mediante tecla Escape para accesibilidad
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Generación reactiva del Canvas de alta resolución
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
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-receipt-title"
        aria-busy={isGenerating}
      >
        {/* Cabecera */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleGroup}>
            <div className={styles.modalTitleIcon}>
              <ShieldCheck size={24} aria-hidden="true" />
            </div>
            <div>
              <h3 id="modal-receipt-title" className={styles.modalTitle}>
                Comprobante Digital Oficial
              </h3>
              <p className={styles.modalSubtitle}>
                Orden: <strong className={styles.referenceText}>{receiptData.orderReference}</strong> •{' '}
                <span className={styles.ticketCountBadge}>
                  {receiptData.ticketNumbers.length}{' '}
                  {receiptData.ticketNumbers.length === 1 ? 'Boleto' : 'Boletos'}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Cerrar comprobante digital"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Previsualización del Comprobante */}
        <div className={styles.previewContainer}>
          {isGenerating ? (
            <div className={styles.previewLoading}>
              <Loader2 size={36} className={styles.previewSpinner} aria-hidden="true" />
              <div className={styles.previewLoadingTitle}>
                Generando comprobante digital oficial...
              </div>
              <div className={styles.previewLoadingSubtitle}>
                Verificando sellos de seguridad y validez de la orden
              </div>
            </div>
          ) : errorMsg ? (
            <div className={styles.previewError}>
              <AlertTriangle size={32} className={styles.previewErrorIcon} aria-hidden="true" />
              <div className={styles.previewErrorTitle}>No se pudo cargar el certificado</div>
              <div className={styles.previewErrorMsg}>{errorMsg}</div>
            </div>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt={`Comprobante digital para la orden ${receiptData.orderReference}`}
              className={styles.previewImage}
            />
          ) : null}
        </div>

        {/* Mensaje de Seguridad / Certificado Autenticado */}
        <div className={styles.securityNotice}>
          <CheckCircle2 size={18} className={styles.securityIcon} aria-hidden="true" />
          <div>
            <strong>Documento Oficial Autenticado:</strong> Este comprobante certifica la
            titularidad oficial de los números adquiridos ante la plataforma{' '}
            <strong>Manaure Vive</strong> y el sorteo programado.
          </div>
        </div>

        {/* Botones de Acción y Descarga */}
        <div className={styles.actionsGrid}>
          {/* Botón 1: Descargar Imagen PNG */}
          <button
            type="button"
            className={styles.btnDownloadImage}
            onClick={() => void handleDownloadImage()}
            disabled={isGenerating || Boolean(errorMsg)}
          >
            <Download size={18} aria-hidden="true" />
            <span>Descargar Imagen</span>
          </button>

          {/* Botón 2: Guardar como PDF / Imprimir */}
          <button
            type="button"
            className={styles.btnDownloadPdf}
            onClick={() => void handlePrintPdf()}
            disabled={isGenerating || Boolean(errorMsg)}
          >
            <FileText size={18} aria-hidden="true" />
            <span>Guardar como PDF</span>
          </button>

          {/* Botón 3: Compartir por WhatsApp */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btnShareWhatsApp}
          >
            <MessageCircle size={18} aria-hidden="true" />
            <span>Compartir por WhatsApp</span>
          </a>
        </div>

        {/* Copiar enlace / texto directo */}
        <div className={styles.copyShareWrapper}>
          <button
            type="button"
            onClick={() => void handleCopyShareLink()}
            className={`${styles.btnCopyShare} ${
              copiedLink ? styles.btnCopyShareCopied : ''
            }`}
          >
            {copiedLink ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            <span>
              {copiedLink
                ? '¡Texto y resumen del comprobante copiados!'
                : 'Copiar texto y resumen de la orden'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
