import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Componente que gestiona el scroll automático hacia anclas (#sección)
 * o hacia la parte superior cuando se navega entre rutas.
 */
export const ScrollToHashElement: React.FC = () => {
  const location = useLocation();
  const lastHash = useRef('');

  useEffect(() => {
    if (location.hash) {
      lastHash.current = location.hash.slice(1);
    }

    if (lastHash.current) {
      let attempts = 0;
      const maxAttempts = 15;

      const tryScroll = () => {
        const element = document.getElementById(lastHash.current);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          lastHash.current = '';
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(tryScroll, 100);
        } else {
          lastHash.current = '';
        }
      };

      // Pequeño retardo para permitir que los componentes perezosos (lazy) se monten
      const timer = setTimeout(tryScroll, 60);
      return () => clearTimeout(timer);
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [location.pathname, location.hash]);

  return null;
};
