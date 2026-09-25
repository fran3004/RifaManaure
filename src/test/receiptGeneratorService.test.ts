import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeTicketGridLayout,
  calculateReceiptCanvasDimensions,
  getVerificationUrl,
  getVerificationBaseUrl,
  getWhatsAppShareText,
  fitText,
  wrapText,
  drawRoundedRect,
  drawSectionHeader,
  drawTicketGrid,
  generateDigitalReceiptCanvas,
  type DigitalReceiptData,
} from '../services/receiptGeneratorService';

describe('receiptGeneratorService - Rediseño Integral de Comprobante Digital', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Verificación de URLs y Anti-Hardcoding', () => {
    it('debe construir la URL de verificación con codificación segura de referencia', () => {
      const url = getVerificationUrl('MV-998877');
      expect(url).toContain('/verificar?ref=MV-998877');
      expect(url.startsWith('http')).toBe(true);
    });

    it('debe codificar adecuadamente caracteres especiales en referencias', () => {
      const url = getVerificationUrl('REF 2026/01#A');
      expect(url).toContain('ref=REF%202026%2F01%23A');
    });

    it('getVerificationBaseUrl no debe dejar barras inclinadas finales duplicadas', () => {
      const base = getVerificationBaseUrl();
      expect(base.endsWith('/')).toBe(false);
    });
  });

  describe('2. Disposición Dinámica del Grid de Boletos (computeTicketGridLayout)', () => {
    const availableWidth = 890;

    it('1 boleto: debe calcular 1 columna hero destacada (chip de 280x84, fuente 42px)', () => {
      const layout = computeTicketGridLayout(1, availableWidth);
      expect(layout.cols).toBe(1);
      expect(layout.rows).toBe(1);
      expect(layout.chipWidth).toBe(280);
      expect(layout.chipHeight).toBe(84);
      expect(layout.fontSize).toBe(42);
      expect(layout.totalGridHeight).toBe(84);
    });

    it('3 boletos: debe calcular 3 columnas centradas (chip de 230x76, fuente 34px)', () => {
      const layout = computeTicketGridLayout(3, availableWidth);
      expect(layout.cols).toBe(3);
      expect(layout.rows).toBe(1);
      expect(layout.chipWidth).toBe(230);
      expect(layout.chipHeight).toBe(76);
      expect(layout.fontSize).toBe(34);
      expect(layout.totalGridHeight).toBe(76);
    });

    it('10 boletos: debe calcular 4 columnas y 3 filas adaptadas', () => {
      const layout = computeTicketGridLayout(10, availableWidth);
      expect(layout.cols).toBe(4);
      expect(layout.rows).toBe(3);
      expect(layout.chipHeight).toBe(66);
      expect(layout.fontSize).toBe(28);
      // 3 filas * 66 + 2 gaps * 14 = 198 + 28 = 226
      expect(layout.totalGridHeight).toBe(226);
    });

    it('20 boletos: debe calcular 5 columnas y 4 filas', () => {
      const layout = computeTicketGridLayout(20, availableWidth);
      expect(layout.cols).toBe(5);
      expect(layout.rows).toBe(4);
      expect(layout.chipHeight).toBe(58);
      expect(layout.fontSize).toBe(24);
      // 4 filas * 58 + 3 gaps * 12 = 232 + 36 = 268
      expect(layout.totalGridHeight).toBe(268);
    });

    it('50 boletos: debe calcular 6 columnas y 9 filas sin truncar ningún boleto', () => {
      const layout = computeTicketGridLayout(50, availableWidth);
      expect(layout.cols).toBe(6);
      expect(layout.rows).toBe(9);
      expect(layout.chipHeight).toBe(50);
      expect(layout.fontSize).toBe(20);
      // 9 filas * 50 + 8 gaps * 10 = 450 + 80 = 530
      expect(layout.totalGridHeight).toBe(530);
    });

    it('100 boletos: debe calcular 8 columnas y 13 filas de forma compacta', () => {
      const layout = computeTicketGridLayout(100, availableWidth);
      expect(layout.cols).toBe(8);
      expect(layout.rows).toBe(13);
      expect(layout.chipHeight).toBe(44);
      expect(layout.fontSize).toBe(17);
      // 13 filas * 44 + 12 gaps * 8 = 572 + 96 = 668
      expect(layout.totalGridHeight).toBe(668);
    });
  });

  describe('3. Altura Dinámica del Canvas (calculateReceiptCanvasDimensions)', () => {
    const baseReceiptData: DigitalReceiptData = {
      orderReference: 'MV-TEST-1',
      orderStatus: 'paid',
      createdAt: '2026-03-01T10:00:00Z',
      totalAmount: 25000,
      ticketCount: 1,
      buyerName: 'Carlos Gómez',
      buyerDocumentMasked: 'CC ***.***.340',
      raffleTitle: 'Gran Rifa Ecoturística',
      lotteryReference: 'Lotería de La Guajira',
      ticketNumbers: ['007'],
    };

    it('para 1 boleto, el canvas mantiene la altura mínima óptima (1400px)', () => {
      const dim = calculateReceiptCanvasDimensions(baseReceiptData);
      expect(dim.width).toBe(1000);
      expect(dim.height).toBe(1400);
      expect(dim.gridRows).toBe(1);
    });

    it('para 10 boletos, el canvas se mantiene en la proporción estándar (1400px)', () => {
      const tickets = Array.from({ length: 10 }, (_, i) => String(i).padStart(3, '0'));
      const dim = calculateReceiptCanvasDimensions({
        ...baseReceiptData,
        ticketNumbers: tickets,
        ticketCount: tickets.length,
      });
      expect(dim.width).toBe(1000);
      expect(dim.height).toBe(1400);
      expect(dim.gridRows).toBe(3);
    });

    it('para 50 boletos, el canvas expande dinámicamente su altura (>= 1600px)', () => {
      const tickets = Array.from({ length: 50 }, (_, i) => String(i).padStart(3, '0'));
      const dim = calculateReceiptCanvasDimensions({
        ...baseReceiptData,
        ticketNumbers: tickets,
        ticketCount: tickets.length,
      });
      expect(dim.width).toBe(1000);
      expect(dim.height).toBeGreaterThanOrEqual(1600);
      expect(dim.gridRows).toBe(9);
    });

    it('para 100 boletos, el canvas expande su altura para albergar todos los chips sin solapamiento', () => {
      const tickets = Array.from({ length: 100 }, (_, i) => String(i).padStart(3, '0'));
      const dim = calculateReceiptCanvasDimensions({
        ...baseReceiptData,
        ticketNumbers: tickets,
        ticketCount: tickets.length,
      });
      expect(dim.width).toBe(1000);
      expect(dim.height).toBeGreaterThanOrEqual(1740);
      expect(dim.gridRows).toBe(13);
    });
  });

  describe('4. Funciones Auxiliares de Dibujo y Texto', () => {
    it('fitText reduce el tamaño de fuente si el texto excede el ancho máximo', () => {
      const mockCtx: any = {
        font: '',
        measureText: (text: string) => ({
          width: text.length * 15,
        }),
      };

      const longName = 'Juan Camilo de la Santísima Trinidad Valderrama Hernández';
      const result = fitText(mockCtx, longName, 300, 24, 'sans-serif', 'bold', 14);

      expect(result.fontSize).toBeLessThanOrEqual(24);
      expect(result.font).toContain('bold');
      expect(result.font).toContain('sans-serif');
    });

    it('wrapText divide textos largos en líneas que no superen el ancho', () => {
      const mockCtx: any = {
        measureText: (text: string) => ({
          width: text.length * 8,
        }),
      };

      const longNotice =
        'Este comprobante digital es emitido tras la validación oficial y garantiza la participación de tus números.';
      const lines = wrapText(mockCtx, longNotice, 250, 3);

      expect(lines.length).toBeGreaterThan(1);
      expect(lines.length).toBeLessThanOrEqual(3);
    });

    it('drawRoundedRect invoca roundRect cuando está disponible en el contexto', () => {
      const mockCtx: any = {
        save: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        restore: vi.fn(),
      };

      drawRoundedRect(mockCtx, 10, 20, 100, 50, 8, '#10b981', '#f59e0b', 2);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.roundRect).toHaveBeenCalledWith(10, 20, 100, 50, [8, 8, 8, 8]);
      expect(mockCtx.fill).toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
    });

    it('drawRoundedRect usa fallback de curvas cuadráticas si roundRect no existe', () => {
      const mockCtx: any = {
        save: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        restore: vi.fn(),
      };

      drawRoundedRect(mockCtx, 10, 20, 100, 50, 8, '#10b981', '#f59e0b', 2);

      expect(mockCtx.moveTo).toHaveBeenCalled();
      expect(mockCtx.quadraticCurveTo).toHaveBeenCalled();
      expect(mockCtx.closePath).toHaveBeenCalled();
    });

    it('drawSectionHeader dibuja barra decorativa ámbar y textos de título/subtítulo', () => {
      const mockCtx: any = {
        save: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        fillText: vi.fn(),
        restore: vi.fn(),
      };

      drawSectionHeader(mockCtx, 'NÚMEROS ASIGNADOS (5)', 'Oficiales', 55, 600, 890);

      expect(mockCtx.fillText).toHaveBeenCalledWith('NÚMEROS ASIGNADOS (5)', 67, 600);
      expect(mockCtx.fillText).toHaveBeenCalledWith('Oficiales', 945, 600);
    });

    it('drawTicketGrid dibuja todos los números formateados con # y 3 cifras', () => {
      const mockCtx: any = {
        save: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
        restore: vi.fn(),
        createLinearGradient: () => ({
          addColorStop: vi.fn(),
        }),
      };

      const tickets = ['1', '25', '999'];
      const endY = drawTicketGrid(mockCtx, tickets, 55, 500, 890);

      expect(mockCtx.fillText).toHaveBeenCalledWith('#001', expect.any(Number), expect.any(Number));
      expect(mockCtx.fillText).toHaveBeenCalledWith('#025', expect.any(Number), expect.any(Number));
      expect(mockCtx.fillText).toHaveBeenCalledWith('#999', expect.any(Number), expect.any(Number));
      expect(endY).toBeGreaterThan(500);
    });
  });

  describe('5. Texto Oficial para Compartir en WhatsApp (getWhatsAppShareText)', () => {
    it('incluye todos los datos clave, formato de 3 cifras y enlace seguro de verificación', () => {
      const data: DigitalReceiptData = {
        orderReference: 'MV-ABCD123',
        orderStatus: 'paid',
        createdAt: '2026-03-01T15:30:00Z',
        totalAmount: 75000,
        ticketCount: 3,
        buyerName: 'María Fernanda Gómez',
        buyerDocumentMasked: 'CC ***.***.456',
        raffleTitle: 'Gran Rifa Camioneta y Cuatrimoto',
        lotteryReference: 'Lotería de La Guajira',
        drawDate: '2026-12-31',
        ticketNumbers: ['5', '82', '100'],
      };

      const shareText = getWhatsAppShareText(data);

      expect(shareText).toContain('COMPROBANTE OFICIAL MANAURE VIVE');
      expect(shareText).toContain('MV-ABCD123');
      expect(shareText).toContain('María Fernanda Gómez');
      expect(shareText).toContain('#005, #082, #100');
      expect(shareText).toContain('75.000');
      expect(shareText).toContain('Gran Rifa Camioneta y Cuatrimoto');
      expect(shareText).toContain('Lotería de La Guajira');
      expect(shareText).toContain('/verificar?ref=MV-ABCD123');
    });

    it('no trunca números al compartir una orden con 25 números', () => {
      const tickets = Array.from({ length: 25 }, (_, i) => String(i + 1));
      const data: DigitalReceiptData = {
        orderReference: 'MV-LARGE-25',
        orderStatus: 'paid',
        createdAt: '2026-03-01T15:30:00Z',
        totalAmount: 625000,
        ticketCount: 25,
        buyerName: 'Pedro Alarcón',
        buyerDocumentMasked: 'CC ***.***.890',
        raffleTitle: 'Gran Rifa Ecoturística',
        lotteryReference: 'Lotería de Medellín',
        ticketNumbers: tickets,
      };

      const shareText = getWhatsAppShareText(data);

      expect(shareText).toContain('#001');
      expect(shareText).toContain('#025');
      expect(shareText).not.toContain('+ 5 números adicionales');
    });
  });

  describe('6. Validación Estricta de Estado Financiero', () => {
    it('debe rechazar la generación de comprobante si la orden no está en estado paid', async () => {
      const invalidData: any = {
        orderReference: 'MV-PENDING',
        orderStatus: 'pending',
        ticketNumbers: ['001'],
      };

      await expect(generateDigitalReceiptCanvas(invalidData)).rejects.toThrow(
        'Solo se permite generar comprobantes digitales para órdenes en estado PAGADO'
      );
    });
  });
});
