import { type ComponentType, lazy } from 'react';

/**
 * Envoltorio resiliente para React.lazy que reintenta automáticamente
 * la importación de fragmentos (chunks) antes de fallar, protegiendo al usuario
 * de fallos esporádicos de red o demoras en la descarga del módulo.
 *
 * @param componentImport Función de importación dinámica (ej. () => import('./MiComponente'))
 * @param componentName Nombre descriptivo para trazabilidad y depuración en consola
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>,
  componentName?: string
) {
  return lazy(async () => {
    try {
      return await componentImport();
    } catch (firstError) {
      console.warn(
        `[lazyWithRetry] Fallo al cargar módulo diferido "${componentName || 'componente'}". Reintentando en 600ms...`,
        firstError
      );

      // Pequeño retardo para dar margen a la estabilización de red o caché
      await new Promise((resolve) => setTimeout(resolve, 600));

      try {
        return await componentImport();
      } catch (secondError) {
        console.error(
          `[lazyWithRetry] Fallo definitivo al cargar módulo diferido "${componentName || 'componente'}":`,
          secondError
        );
        throw secondError;
      }
    }
  });
}
