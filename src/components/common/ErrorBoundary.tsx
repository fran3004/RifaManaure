import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Capturado error de renderizado:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    try {
      sessionStorage.removeItem('manaure_chunk_reload_ts');
      sessionStorage.removeItem('manaure_chunk_retry_count');
    } catch {
      // Ignorar errores en navegadores con almacenamiento restringido
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isAdmin =
        typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

      return (
        <div
          className={`${styles.container} ${isAdmin ? styles.containerAdmin : styles.containerPublic}`}
          data-theme={isAdmin ? 'admin' : 'public'}
          role="alert"
        >
          <div className={styles.iconCircle}>
            <AlertCircle size={32} aria-hidden="true" />
          </div>
          <h2 className={styles.title}>
            Algo no cargó correctamente
          </h2>
          <p className={styles.description}>
            Ocurrió una eventualidad inesperada al inicializar este módulo. Puedes intentar recargar
            la página.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className={styles.retryButton}
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span>Recargar Página</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
