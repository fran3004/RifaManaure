import React from 'react';
import styles from './PageLoadingFallback.module.css';

interface PageLoadingFallbackProps {
  message?: string;
}

export const PageLoadingFallback: React.FC<PageLoadingFallbackProps> = ({
  message = 'Cargando contenido oficial...',
}) => {
  return (
    <div className={styles.container}>
      <div className={styles.spinner} />
      <span className={styles.message}>
        {message}
      </span>
    </div>
  );
};
