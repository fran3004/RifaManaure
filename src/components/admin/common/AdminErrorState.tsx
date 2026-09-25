import React from 'react';
import { AlertCircle, ShieldAlert, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import styles from './AdminErrorState.module.css';

interface AdminErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  isForbidden?: boolean;
}

export const AdminErrorState: React.FC<AdminErrorStateProps> = ({
  title,
  message,
  onRetry,
  isForbidden = false,
}) => {
  const defaultTitle = isForbidden
    ? 'Acceso Restringido o Permisos Insuficientes'
    : 'Ocurrió un error al cargar los datos';

  return (
    <div className={styles.errorContainer} role="alert">
      <div className={styles.iconWrapper}>
        {isForbidden ? <ShieldAlert size={30} /> : <AlertCircle size={30} />}
      </div>
      <h3 className={styles.title}>{title || defaultTitle}</h3>
      <p className={styles.message}>{message}</p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        {onRetry && (
          <button type="button" className={styles.retryButton} onClick={onRetry}>
            <RefreshCw size={16} />
            <span>Reintentar</span>
          </button>
        )}
        {isForbidden && (
          <Link
            to="/admin"
            className={styles.retryButton}
            style={{ backgroundColor: 'var(--color-surface-hover, #334155)', textDecoration: 'none' }}
          >
            <span>Volver al resumen</span>
          </Link>
        )}
      </div>
    </div>
  );
};
