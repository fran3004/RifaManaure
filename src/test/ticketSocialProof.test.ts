import { describe, it, expect } from 'vitest';
import {
  calculateTicketStats,
  formatTicketCount,
  TICKET_STATS_CONFIG,
} from '@/config/ticketSocialProof';

describe('Prueba Social y Estadísticas de Boletos (ticketSocialProof)', () => {
  it('formatea cifras con separador de miles colombiano', () => {
    expect(formatTicketCount(1000)).toBe('1.000');
    expect(formatTicketCount(347)).toBe('347');
    expect(formatTicketCount(0)).toBe('0');
  });

  it('detecta estado inicial (isEarlyStage) cuando vendidos < 5 %', () => {
    // 20 vendidos de 1000 = 2 % (< 5 %)
    const sampleTickets = [
      ...Array(20).fill({ status: 'sold' }),
      ...Array(30).fill({ status: 'reserved' }),
      ...Array(950).fill({ status: 'available' }),
    ];
    const stats = calculateTicketStats(sampleTickets);
    expect(stats.sold).toBe(20);
    expect(stats.reserved).toBe(30);
    expect(stats.available).toBe(950);
    expect(stats.isEarlyStage).toBe(true);
    expect(stats.isAlmostSoldOut).toBe(false);
  });

  it('detecta estado normal cuando vendidos >= 5 % y ocupación < 90 %', () => {
    // 347 vendidos de 1000 = 34.7 %, 50 reservados = 5 % -> total ocupado 39.7 %
    const sampleTickets = [
      ...Array(347).fill({ status: 'sold' }),
      ...Array(50).fill({ status: 'reserved' }),
      ...Array(603).fill({ status: 'available' }),
    ];
    const stats = calculateTicketStats(sampleTickets);
    expect(stats.sold).toBe(347);
    expect(stats.reserved).toBe(50);
    expect(stats.total).toBe(1000);
    expect(stats.isEarlyStage).toBe(false);
    expect(stats.isAlmostSoldOut).toBe(false);
    expect(stats.percentageSold).toBeCloseTo(34.7);
    expect(stats.percentageReserved).toBeCloseTo(5.0);
  });

  it('detecta estado casi agotado (isAlmostSoldOut) cuando vendidos + reservados >= 90 %', () => {
    // 850 vendidos + 60 reservados = 910/1000 = 91 % (>= 90 %)
    const sampleTickets = [
      ...Array(850).fill({ status: 'sold' }),
      ...Array(60).fill({ status: 'reserved' }),
      ...Array(90).fill({ status: 'available' }),
    ];
    const stats = calculateTicketStats(sampleTickets);
    expect(stats.isEarlyStage).toBe(false);
    expect(stats.isAlmostSoldOut).toBe(true);
  });

  it('utiliza el total por defecto de 1000 si el array está vacío', () => {
    const stats = calculateTicketStats([]);
    expect(stats.total).toBe(TICKET_STATS_CONFIG.DEFAULT_TOTAL_TICKETS);
    expect(stats.sold).toBe(0);
    expect(stats.isEarlyStage).toBe(true);
  });
});

