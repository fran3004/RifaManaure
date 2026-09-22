import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/outfit';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import App from './App.tsx';

// Auto-recuperación ante actualizaciones de despliegue en Vite (desajuste de hash en chunks)
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[Vite] Detectada nueva versión de la aplicación. Recargando con recursos actualizados...', event);
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
