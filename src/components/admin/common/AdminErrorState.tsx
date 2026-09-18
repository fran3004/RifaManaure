import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import styles from './AdminErrorState.module.css';

interface AdminErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const AdminErrorState: React.FC<AdminErrorStateProps> = ({
  title = 'Ocurrió un error al cargar los datos',
  message,
  onRetry,
}) => {
  return (
    <div className={styles.errorContainer} role="alert">
      <div className={styles.iconWrapper}>
        <AlertCircle size={30} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          <RefreshCw size={16} />
          <span>Reintentar</span>
        </button>
      )}
    </div>
  );
};
