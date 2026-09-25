import { describe, it, expect } from 'vitest';
import {
  generateTicketRanges,
  getTicketDigits,
  resolveChunkSize,
  findMatchingRangeIndex,
  type TicketRange,
} from '@/lib/ticketRanges';
import { formatTicketNumber } from '@/lib/utils';

describe('Generador Dinámico de Rangos de Boletos (src/lib/ticketRanges.ts)', () => {
  describe('getTicketDigits', () => {
    it('debe devolver 2 cifras para emisiones menores o iguales a 100 boletos', () => {
      expect(getTicketDigits(1)).toBe(2);
      expect(getTicketDigits(10)).toBe(2);
      expect(getTicketDigits(50)).toBe(2);
      expect(getTicketDigits(100)).toBe(2);
    });

    it('debe devolver 3 cifras para emisiones entre 101 y 1.000 boletos', () => {
      expect(getTicketDigits(101)).toBe(3);
      expect(getTicketDigits(500)).toBe(3);
      expect(getTicketDigits(999)).toBe(3);
      expect(getTicketDigits(1000)).toBe(3);
    });

    it('debe devolver 4 cifras para emisiones entre 1.001 y 10.000 boletos', () => {
      expect(getTicketDigits(1001)).toBe(4);
      expect(getTicketDigits(5000)).toBe(4);
      expect(getTicketDigits(9999)).toBe(4);
      expect(getTicketDigits(10000)).toBe(4);
    });

    it('debe calcular dinámicamente cifras para emisiones mayores a 10.000', () => {
      expect(getTicketDigits(10001)).toBe(5);
      expect(getTicketDigits(50000)).toBe(5);
      expect(getTicketDigits(100000)).toBe(5);
    });

    it('debe responder defensivamente a valores inválidos o menores a 1', () => {
      expect(getTicketDigits(0)).toBe(2);
      expect(getTicketDigits(-10)).toBe(2);
    });
  });

  describe('resolveChunkSize', () => {
    it('respeta tamaño numérico explícito si es suministrado', () => {
      expect(resolveChunkSize(1000, 250)).toBe(250);
      expect(resolveChunkSize(1000, { chunkSize: 500 })).toBe(500);
    });

    it('resuelve adecuadamente estrategia desktop para emisiones comunes', () => {
      expect(resolveChunkSize(100, 'desktop')).toBe(100);
      expect(resolveChunkSize(500, 'desktop')).toBe(100);
      expect(resolveChunkSize(1000, 'desktop')).toBe(200);
      expect(resolveChunkSize(5000, 'desktop')).toBe(1000);
      expect(resolveChunkSize(10000, 'desktop')).toBe(1000);
    });

    it('resuelve adecuadamente estrategia compact para móviles y tablets', () => {
      expect(resolveChunkSize(100, 'compact')).toBe(100);
      expect(resolveChunkSize(1000, 'compact')).toBe(100);
      expect(resolveChunkSize(10000, 'compact')).toBe(1000); // Evita 100 opciones absurdas en móvil
    });
  });

  describe('generateTicketRanges - Casos Obligatorios e Invariantes', () => {
    const MANDATORY_CASES = [10, 50, 100, 101, 500, 999, 1000, 1001, 5000, 9999, 10000];

    const verifyRangeInvariants = (ranges: TicketRange[], totalTickets: number) => {
      // 1. Cero rangos vacíos
      expect(ranges.length).toBeGreaterThan(0);

      // 2. Cobertura completa: inicia en 0 y finaliza en totalTickets - 1
      expect(ranges[0].min).toBe(0);
      expect(ranges[ranges.length - 1].max).toBe(totalTickets - 1);

      let accumulatedCount = 0;
      const digits = getTicketDigits(totalTickets);

      for (let i = 0; i < ranges.length; i++) {
        const current = ranges[i];

        // Validaciones numéricas
        expect(current.min).toBeGreaterThanOrEqual(0);
        expect(current.max).toBeLessThan(totalTickets);
        expect(current.min).toBeLessThanOrEqual(current.max);
        expect(current.count).toBe(current.max - current.min + 1);
        accumulatedCount += current.count;

        // 3. Cero solapamientos y cero huecos con el rango anterior
        if (i > 0) {
          const previous = ranges[i - 1];
          expect(current.min).toBe(previous.max + 1);
        }

        // 5. Formato de etiquetas homogéneo y con ceros a la izquierda
        const expectedLabel = `${formatTicketNumber(current.min, digits)} - ${formatTicketNumber(current.max, digits)}`;
        expect(current.label).toBe(expectedLabel);
      }

      // Suma total de conteos cubre exactamente el total de la emisión
      expect(accumulatedCount).toBe(totalTickets);
    };

    MANDATORY_CASES.forEach((total) => {
      it(`cumple todas las validaciones e invariantes para ${total} boletos (desktop)`, () => {
        const ranges = generateTicketRanges(total, 'desktop');
        verifyRangeInvariants(ranges, total);
      });

      it(`cumple todas las validaciones e invariantes para ${total} boletos (compact)`, () => {
        const ranges = generateTicketRanges(total, 'compact');
        verifyRangeInvariants(ranges, total);
      });
    });

    it('devuelve array vacío para totalTickets <= 0', () => {
      expect(generateTicketRanges(0)).toEqual([]);
      expect(generateTicketRanges(-50)).toEqual([]);
    });
  });

  describe('Ejemplos Obligatorios Exactos', () => {
    it('100 boletos: 00 - 99', () => {
      const ranges = generateTicketRanges(100, 'desktop');
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({
        min: 0,
        max: 99,
        label: '00 - 99',
        count: 100,
      });
    });

    it('1000 boletos: 5 rangos de 200 en desktop (000 - 199 a 800 - 999)', () => {
      const ranges = generateTicketRanges(1000, 'desktop');
      expect(ranges).toHaveLength(5);
      expect(ranges.map((r) => r.label)).toEqual([
        '000 - 199',
        '200 - 399',
        '400 - 599',
        '600 - 799',
        '800 - 999',
      ]);
    });

    it('10000 boletos: 10 rangos de 1000 (0000 - 0999 a 9000 - 9999)', () => {
      const ranges = generateTicketRanges(10000, 'desktop');
      expect(ranges).toHaveLength(10);
      expect(ranges.map((r) => r.label)).toEqual([
        '0000 - 0999',
        '1000 - 1999',
        '2000 - 2999',
        '3000 - 3999',
        '4000 - 4999',
        '5000 - 5999',
        '6000 - 6999',
        '7000 - 7999',
        '8000 - 8999',
        '9000 - 9999',
      ]);
    });

    it('1000 boletos en mobile/compact genera 10 opciones de 100', () => {
      const ranges = generateTicketRanges(1000, 'compact');
      expect(ranges).toHaveLength(10);
      expect(ranges[0].label).toBe('000 - 099');
      expect(ranges[9].label).toBe('900 - 999');
    });

    it('10000 boletos en compact no genera 100 opciones sino 10 opciones usables', () => {
      const ranges = generateTicketRanges(10000, 'compact');
      expect(ranges).toHaveLength(10);
      expect(ranges[0].label).toBe('0000 - 0999');
      expect(ranges[9].label).toBe('9000 - 9999');
    });
  });

  describe('findMatchingRangeIndex', () => {
    it('encuentra el índice correcto que contiene un boleto determinado', () => {
      const desktopRanges = generateTicketRanges(1000, 'desktop'); // 0-199, 200-399, etc.
      expect(findMatchingRangeIndex(desktopRanges, 0)).toBe(0);
      expect(findMatchingRangeIndex(desktopRanges, 199)).toBe(0);
      expect(findMatchingRangeIndex(desktopRanges, 200)).toBe(1);
      expect(findMatchingRangeIndex(desktopRanges, 555)).toBe(2);
      expect(findMatchingRangeIndex(desktopRanges, 999)).toBe(4);
    });

    it('mapea correctamente entre rangos de desktop y compact', () => {
      const desktopRanges = generateTicketRanges(1000, 'desktop'); // 5 de 200
      const compactRanges = generateTicketRanges(1000, 'compact'); // 10 de 100

      // Seleccionar rango 2 en desktop (400 - 599) debe encontrar rango 4 en compact (400 - 499)
      const desktopRange = desktopRanges[2];
      const compactIdx = findMatchingRangeIndex(compactRanges, desktopRange.min);
      expect(compactIdx).toBe(4);
      expect(compactRanges[compactIdx].label).toBe('400 - 499');
    });

    it('devuelve 0 de forma segura si la lista de rangos está vacía', () => {
      expect(findMatchingRangeIndex([], 50)).toBe(0);
    });
  });

  describe('Validación de Búsqueda Dinámica y Longitudes de Dígitos', () => {
    it('determina la longitud máxima del buscador según las cifras correspondientes', () => {
      expect(getTicketDigits(100)).toBe(2); // maxLength = 2
      expect(getTicketDigits(1000)).toBe(3); // maxLength = 3
      expect(getTicketDigits(10000)).toBe(4); // maxLength = 4 (permite introducir 4 cifras correctamente)
    });
  });
});
