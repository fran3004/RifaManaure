import { useEffect } from 'react';

/**
 * Hook para actualizar dinámicamente el título del documento (SEO y usabilidad en pestañas).
 */
export function useDocumentTitle(title: string, suffix = 'Manaure Vive'): void {
  useEffect(() => {
    const fullTitle = title.includes(suffix) ? title : `${title} | ${suffix}`;
    document.title = fullTitle;
  }, [title, suffix]);
}
