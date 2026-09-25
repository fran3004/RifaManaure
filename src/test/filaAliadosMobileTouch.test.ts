import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Blindaje y Resiliencia Táctil Móvil en FilaAliados (Mobile Touch & Anti-Freeze)', () => {
  const readComponent = (relPath: string) => {
    return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf-8');
  };

  const tsx = readComponent('src/components/landing/FilaAliados.tsx');
  const css = readComponent('src/components/landing/FilaAliados.module.css');

  describe('1. Protección contra Hover Sintético y Foco Móvil (Anti-Freeze en Teléfonos)', () => {
    it('debe condicionar onMouseEnter a punteros finos reales para no congelar la animación en smartphones touch', () => {
      expect(tsx).toContain("window.matchMedia('(hover: hover) and (pointer: fine)').matches");
      expect(tsx).toContain('isHoveredRef.current = false');
    });

    it('debe condicionar el bloqueo por foco únicamente a navegación por teclado con :focus-visible', () => {
      expect(tsx).toContain(":focus-visible");
    });

    it('debe ignorar eventos sintéticos de mouse generados por toques móviles recientes en handleMouseDown', () => {
      expect(tsx).toContain('lastTouchEndTimeRef.current');
      expect(tsx).toContain('performance.now() - lastTouchEndTimeRef.current < 600');
    });
  });

  describe('2. Disambiguación y Manejo de Gestos Táctiles Móviles', () => {
    it('debe implementar umbral GESTURE_THRESHOLD = 8 y confirmar movimiento horizontal sin falsos bloqueos', () => {
      expect(tsx).toContain('GESTURE_THRESHOLD = 8');
      expect(tsx).toContain("gestureDirectionRef.current = 'horizontal'");
      expect(tsx).toContain("gestureDirectionRef.current = 'vertical'");
      expect(tsx).toContain('e.cancelable');
    });

    it('debe respetar el scroll vertical nativo de la página cuando el usuario se desplaza verticalmente', () => {
      expect(tsx).toContain('absY >= 14 && absY >= absX * 1.35');
      expect(tsx).toContain("gestureDirectionRef.current = 'vertical'");
    });

    it('debe filtrar toques multitáctiles (e.touches.length !== 1) para permitir pinch-to-zoom nativo', () => {
      expect(tsx).toContain('e.touches.length !== 1');
    });

    it('debe amortiguar con momentum inercial al soltar un deslizamiento horizontal en móvil', () => {
      expect(tsx).toContain('momentumVelocityRef.current = Math.max(-2.5, Math.min(2.5, velocityRef.current * 0.85))');
    });
  });

  describe('3. Blindaje de Enlaces y Navegación a Instagram', () => {
    it('debe bloquear clics accidentales a Instagram tras un gesto de arrastre', () => {
      expect(tsx).toContain('didDragRef.current');
      expect(tsx).toContain('dragDeltaRef.current > 6');
      expect(tsx).toContain('e.preventDefault()');
      expect(tsx).toContain('e.stopPropagation()');
    });

    it('debe mantener una ventana de seguridad (350ms) antes de resetear didDragRef en touchend/touchcancel', () => {
      expect(tsx).toContain('setTimeout(() => {');
      expect(tsx).toContain('didDragRef.current = false;');
    });
  });

  describe('4. Medición Robusta y Auto-Recuperación de Ancho', () => {
    it('debe contar con ResizeObserver para auto-adaptarse a cambios de orientación y renderizado', () => {
      expect(tsx).toContain('ResizeObserver');
      expect(tsx).toContain('ro.observe(track)');
    });

    it('debe contar con auto-recuperación dentro del bucle de animación si el ancho inicial fue 0', () => {
      expect(tsx).toContain('if (oneSetWidthRef.current <= 0 && track)');
      expect(tsx).toContain('oneSetWidthRef.current = scrollW / 3;');
    });

    it('debe anticipar la ejecución de la animación con rootMargin de 120px en IntersectionObserver', () => {
      expect(tsx).toContain("rootMargin: '120px 0px'");
    });
  });

  describe('5. CSS Touch-Action y Prevención de Callouts Nativos', () => {
    it('debe declarar touch-action: pan-y en pista, ítems y logos para reservar el eje horizontal al componente', () => {
      expect(css).toContain('touch-action: pan-y;');
      expect(css).toContain('-webkit-touch-callout: none;');
      expect(css).toContain('-webkit-user-drag: none;');
      expect(css).toContain('-webkit-user-select: none;');
    });

    it('debe habilitar touch-action: pan-x pan-y en modo de movimiento reducido para permitir navegación horizontal accesible', () => {
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toContain('touch-action: pan-x pan-y;');
    });
  });
});
