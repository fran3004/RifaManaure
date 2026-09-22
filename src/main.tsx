import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/outfit';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import App from './App.tsx';

// Claves para el control de bucles de recarga ante desajustes de despliegue / caché
const RELOAD_KEY = 'manaure_chunk_reload_ts';
const RETRY_COUNT_KEY = 'manaure_chunk_retry_count';

// Auto-recuperación controlada ante actualizaciones de despliegue en Vite (desajuste de hash en chunks)
window.addEventListener('vite:preloadError', (event) => {
  // Evitar que Vite maneje el error de manera descontrolada
  event.preventDefault();

  try {
    const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
    const retryCount = Number(sessionStorage.getItem(RETRY_COUNT_KEY) || '0');
    const now = Date.now();

    // Si ya se intentó una recarga en los últimos 15 segundos:
    // Detener la recarga automática para evitar bucles infinitos y permitir que el ErrorBoundary capture el estado
    if (retryCount >= 1 && now - lastReload < 15000) {
      console.error(
        '[Vite] Fallo persistente al precargar fragmentos de la aplicación. Deteniendo recarga automática para evitar bucle.',
        event
      );
      return;
    }

    sessionStorage.setItem(RELOAD_KEY, String(now));
    sessionStorage.setItem(RETRY_COUNT_KEY, String(retryCount + 1));
    console.warn(
      '[Vite] Detectada actualización o desajuste en fragmentos dinámicos. Recargando versión reciente...',
      event
    );
    window.location.reload();
  } catch {
    console.error('[Vite] Error de precarga de recursos:', event);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
