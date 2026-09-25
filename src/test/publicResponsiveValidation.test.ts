import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Validación de Integridad Responsive y Blindaje Público', () => {
  const readCss = (relativePath: string) => {
    const fullPath = path.resolve(process.cwd(), relativePath);
    return fs.readFileSync(fullPath, 'utf-8');
  };

  const readTsx = (relativePath: string) => {
    const fullPath = path.resolve(process.cwd(), relativePath);
    return fs.readFileSync(fullPath, 'utf-8');
  };

  describe('1. Global Theme & Ultrawide (LOW-02, LOW-01)', () => {
    it('debe definir contenedor fluido y soporte ultrawide hasta 1560px en theme-public.css', () => {
      const css = readCss('src/styles/theme-public.css');
      expect(css).toContain('width: min(1280px, 100% - 3rem);');
      expect(css).toContain('@media (min-width: 2560px)');
      expect(css).toContain('width: min(1560px, 100% - 6rem);');
      expect(css).toContain('overflow-x: clip;');
    });

    it('no debe tener declaraciones de line-height duplicadas en selectores públicos', () => {
      const faqCss = readCss('src/components/landing/PreguntasFrecuentes.module.css');
      const footerCss = readCss('src/components/layout/Footer.module.css');
      const detalleCss = readCss('src/components/landing/DetallePremio.module.css');

      expect(faqCss).not.toMatch(/line-height:[^;]+;\s*line-height:/);
      expect(footerCss).not.toMatch(/line-height:[^;]+;\s*line-height:/);
      expect(detalleCss).not.toMatch(/line-height:[^;]+;\s*line-height:/);
    });
  });

  describe('2. Navbar Responsive (CRIT-03, CRIT-04)', () => {
    it('debe blindar el menú móvil con 100dvh, safe areas y scrolling sin desbordar', () => {
      const css = readCss('src/components/layout/Navbar.module.css');
      expect(css).toContain('100dvh');
      expect(css).toContain('env(safe-area-inset-bottom');
      expect(css).toContain('overflow-y: auto');
    });

    it('debe compactar la botonera y navegación desktop en la franja 900px - 1080px', () => {
      const css = readCss('src/components/layout/Navbar.module.css');
      expect(css).toContain('@media (min-width: 900px) and (max-width: 1079px)');
      expect(css).toContain('.btnFullText');
      expect(css).toContain('.btnShortText');
    });
  });

  describe('3. Checkout Modal Responsive (CRIT-01, HIGH-05, MED-08)', () => {
    it('debe soportar landscape móvil de baja altura con max-height: 520px y safe areas', () => {
      const css = readCss('src/components/checkout/ModalCheckout.module.css');
      expect(css).toContain('@media (max-height: 520px)');
      expect(css).toContain('env(safe-area-inset-bottom');
      expect(css).toContain('100dvh');
    });

    it('debe estructurar el stepper y la navegación sin overflow en móviles estrechos (CRIT-01, MED-08)', () => {
      const css = readCss('src/components/checkout/ModalCheckout.module.css');
      expect(css).toContain('@media (max-width: 420px)');
      expect(css).toContain('@media (max-width: 520px)');
      expect(css).toContain('.stepNavigation');
      expect(css).toContain('.stepperInfo');
    });
  });

  describe('4. Floating Layers, Safe Areas & WhatsApp (HIGH-01, HIGH-02, LOW-05)', () => {
    it('debe respetar env(safe-area-inset-top) en ToastNotification', () => {
      const css = readCss('src/components/common/ToastNotification.module.css');
      expect(css).toContain('env(safe-area-inset-top');
      expect(css).toContain('@media (max-width: 640px)');
    });

    it('debe prevenir invasión del botón WhatsApp en landscape con carrito activo', () => {
      const css = readCss('src/components/common/FloatingWhatsAppBtn.module.css');
      expect(css).toContain('@media (max-height: 520px)');
      expect(css).toContain('max(8px, env(safe-area-inset-bottom, 8px))');
    });

    it('debe limitar el padding inferior del footer a un valor controlado', () => {
      const css = readCss('src/components/layout/Footer.module.css');
      expect(css).toContain('calc(max(2rem, var(--cart-h, 0px) + 1.25rem) + env(safe-area-inset-bottom, 0px))');
    });
  });

  describe('5. Hero & Trust Grid (MED-02, MED-07)', () => {
    it('no debe usar transform invasivo translateY(40px) en trust grid y debe equilibrar columnas en tablets', () => {
      const css = readCss('src/components/landing/HeroRifa.module.css');
      expect(css).not.toContain('translateY(40px)');
      expect(css).toContain('@media (min-width: 640px) and (max-width: 819px)');
      expect(css).toContain('@media (min-width: 820px) and (max-width: 959px)');
    });

    it('debe usar tipografía fluida para el título del Hero', () => {
      const css = readCss('src/components/landing/HeroRifa.module.css');
      expect(css).toContain('clamp(');
      expect(css).toContain('overflow-wrap: break-word');
    });
  });

  describe('6. Selector de Boletos (MED-01, MED-03)', () => {
    it('debe tener altura mínima y contenedor estable para evitar CLS en la botonera de aleatorios', () => {
      const css = readCss('src/components/ticketing/SelectorBoletos.module.css');
      expect(css).toContain('min-height:');
      expect(css).toContain('.randomHeaderRow');
      expect(css).toContain('.randomActionGroup');
      expect(css).toContain('.clearSlot');
    });

    it('debe reorganizar las estadísticas a 2 columnas en la franja 641px - 768px', () => {
      const css = readCss('src/components/ticketing/SelectorBoletos.module.css');
      expect(css).toContain('@media (max-width: 768px)');
      expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    });
  });

  describe('7. Verificación, Términos & Ganador (HIGH-03, MED-05)', () => {
    it('debe pasar ticketsGrid a 1 columna en móviles ultra-estrechos <=360px', () => {
      const css = readCss('src/pages/VerificarPage.module.css');
      expect(css).toContain('@media (max-width: 360px)');
      expect(css).toContain('grid-template-columns: 1fr');
    });

    it('debe definir tipografía fluida y wrap para títulos en Verificar y Términos', () => {
      const verifCss = readCss('src/pages/VerificarPage.module.css');
      const termCss = readCss('src/pages/TerminosPage.module.css');
      expect(verifCss).toContain('clamp(');
      expect(termCss).toContain('clamp(');
    });

    it('debe escalar fluidamente el número ganador en GanadorShowcase', () => {
      const css = readCss('src/components/ticketing/GanadorShowcase.module.css');
      expect(css).toContain('.hugeTicketNumber');
      expect(css).toContain('clamp(');
    });
  });

  describe('8. Carrusel de Aliados Touch Gestures (MED-04)', () => {
    it('debe implementar detección de dirección con umbral de 8px para respetar scroll vertical', () => {
      const tsx = readTsx('src/components/landing/FilaAliados.tsx');
      const css = readCss('src/components/landing/FilaAliados.module.css');
      expect(css).toContain('touch-action: pan-y;');
      expect(tsx).toContain('GESTURE_THRESHOLD = 8');
      expect(tsx).toContain("gestureDirectionRef.current = 'vertical'");
      expect(tsx).toContain("gestureDirectionRef.current = 'horizontal'");
      expect(tsx).toContain('e.cancelable');
    });
  });

  describe('9. Digital Receipt Modal (HIGH-06)', () => {
    it('debe usar distribución progresiva de acciones con container query y soporte landscape', () => {
      const css = readCss('src/components/receipt/DigitalReceiptModal.module.css');
      expect(css).toContain('@container receiptModal (max-width: 480px)');
      expect(css).toContain('@media (max-height: 480px)');
      expect(css).toContain('grid-template-columns: 1fr');
    });
  });

  describe('10. ErrorBoundary Public Theme Preservation (LOW-04)', () => {
    it('debe aplicar estilos armónicos con tema público si se renderiza en la web pública', () => {
      const tsx = readTsx('src/components/common/ErrorBoundary.tsx');
      const css = readCss('src/components/common/ErrorBoundary.module.css');
      expect(tsx).toContain('isAdmin');
      expect(tsx).toContain("data-theme={isAdmin ? 'admin' : 'public'}");
      expect(css).toContain('background-color: var(--bg-page, #f4efe4);');
      expect(css).toContain('.containerAdmin');
    });
  });
});
