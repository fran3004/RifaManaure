import React, { useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import styles from './PageLoadingFallback.module.css';

interface PageLoadingFallbackProps {
  message?: string;
}

export const PageLoadingFallback: React.FC<PageLoadingFallbackProps> = ({
  message = 'Cargando contenido oficial...',
}) => {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSlow(true);
    }, 7000);
    return () => clearTimeout(timer);
  }, []);

  const handleManualReload = () => {
    try {
      sessionStorage.removeItem('manaure_chunk_reload_ts');
      sessionStorage.removeItem('manaure_chunk_retry_count');
    } catch {
      // Ignorar restricciones en entornos sin storage
    }
    window.location.reload();
  };

  return (
    <div className={styles.container}>
      <div className={styles.spinner} />
      <span className={styles.message}>
        {message}
      </span>
      {isSlow && (
        <div className={styles.slowNotice}>
          <p className={styles.slowText}>
            La carga está tomando más tiempo del habitual debido a la red o actualización de recursos.
          </p>
          <button
            type="button"
            onClick={handleManualReload}
            className={styles.reloadBtn}
          >
            <RotateCcw size={13} />
            <span>Recargar página</span>
          </button>
        </div>
      )}
    </div>
  );
};
