import React, { useEffect } from 'react';
import { CheckCircle2, Info, XCircle, X, ShieldAlert } from 'lucide-react';
import styles from './ToastNotification.module.css';

export interface ToastItem {
  id: string;
  type: 'warning' | 'info' | 'error' | 'success';
  title: string;
  message: string;
  duration?: number;
}

interface ToastNotificationProps {
  toast: ToastItem | null;
  onClose: () => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast) return;

    const duration = toast.duration || 4500;
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const renderIcon = () => {
    switch (toast.type) {
      case 'warning':
        return <ShieldAlert size={22} />;
      case 'error':
        return <XCircle size={22} />;
      case 'success':
        return <CheckCircle2 size={22} />;
      case 'info':
      default:
        return <Info size={22} />;
    }
  };

  const getCardTypeClass = () => {
    switch (toast.type) {
      case 'warning':
        return styles.toastWarning;
      case 'error':
        return styles.toastError;
      case 'success':
        return styles.toastSuccess;
      case 'info':
      default:
        return styles.toastInfo;
    }
  };

  return (
    <div className={styles.toastContainer} aria-live="assertive" role="alert">
      <div className={`${styles.toastCard} ${getCardTypeClass()}`}>
        <div className={styles.iconWrapper}>
          {renderIcon()}
        </div>

        <div className={styles.contentWrapper}>
          <h4 className={styles.toastTitle}>
            {toast.title}
          </h4>
          <p className={styles.toastMessage}>
            {toast.message}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className={styles.closeButton}
          aria-label="Cerrar notificación"
        >
          <X size={18} />
        </button>

        <div
          className={styles.progressBar}
          style={{ animationDuration: `${toast.duration || 4500}ms` }}
        />
      </div>
    </div>
  );
};
