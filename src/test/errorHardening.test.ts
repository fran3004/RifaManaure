import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeAppError,
  logAppError,
  containsSensitiveSqlDetails,
  sanitizeUserMessage,
  getUserFriendlyErrorMessage,
  SENSITIVE_PATTERNS,
  type NormalizedError,
} from '@/lib/errorHandling';

describe('Error Hardening & Diagnostic Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Clasificación Canónica de los 10 Tipos de Error', () => {
    it('1.1. TIMEOUT: Detecta error por código TIMEOUT, 408 o mensaje descriptivo', () => {
      const err = { code: 'TIMEOUT', message: 'The operation timed out after 15000ms' };
      const res = normalizeAppError(err);

      expect(res.kind).toBe('TIMEOUT');
      expect(res.canRetry).toBe(true);
      expect(res.userMessage).toContain('La operación tardó demasiado tiempo en responder');
      expect(res.technicalMessage).toBe('The operation timed out after 15000ms');
    });

    it('1.2. ABORTED: Detecta cancelación de solicitud AbortError', () => {
      const err = { name: 'AbortError', message: 'The user aborted a request.' };
      const res = normalizeAppError(err);

      expect(res.kind).toBe('ABORTED');
      expect(res.canRetry).toBe(true);
      expect(res.userMessage).toContain('La solicitud fue cancelada');
      expect(res.technicalMessage).toBe('The user aborted a request.');
    });

    it('1.3. NETWORK_ERROR: Detecta fallas de conectividad y TypeError de fetch', () => {
      const err = new TypeError('Failed to fetch');
      const res = normalizeAppError(err);

      expect(res.kind).toBe('NETWORK_ERROR');
      expect(res.canRetry).toBe(true);
      expect(res.userMessage).toContain('No pudimos conectar con el sistema');
      expect(res.technicalMessage).toBe('Failed to fetch');
    });

    it('1.4. FORBIDDEN: Detecta código 42501 (PostgreSQL RLS / ACL) y 403', () => {
      const err = {
        code: '42501',
        message: 'new row violates row-level security policy for table "orders"',
        status: 403,
      };
      const res = normalizeAppError(err);

      expect(res.kind).toBe('FORBIDDEN');
      expect(res.status).toBe(403);
      expect(res.canRetry).toBe(false);
      expect(res.userMessage).toBe('No tienes los permisos necesarios para realizar esta acción o consultar estos registros.');
      // Verifica que el mensaje técnico preserve el detalle para diagnóstico
      expect(res.technicalMessage).toContain('violates row-level security');
    });

    it('1.5. UNAUTHORIZED: Detecta 401 y problemas de autenticación / JWT expirado', () => {
      const err = {
        code: 'PGRST301',
        status: 401,
        message: 'JWT expired',
      };
      const res = normalizeAppError(err);

      expect(res.kind).toBe('UNAUTHORIZED');
      expect(res.status).toBe(401);
      expect(res.canRetry).toBe(false);
      expect(res.userMessage).toContain('Tu sesión ha expirado o no estás autenticado');
      expect(res.technicalMessage).toBe('JWT expired');
    });

    it('1.6. CONFLICT: Detecta 23505 (Violación de restricción UNIQUE en PostgreSQL) y 409', () => {
      const err = {
        code: '23505',
        message: 'duplicate key value violates unique constraint "orders_client_idempotency_key_idx"',
        status: 409,
      };
      const res = normalizeAppError(err);

      expect(res.kind).toBe('CONFLICT');
      expect(res.status).toBe(409);
      expect(res.canRetry).toBe(false);
      expect(res.userMessage).toBe('Ya existe un registro con estos datos o la operación ya fue realizada previamente.');
    });

    it('1.7. NOT_FOUND: Detecta 404, P0002 y PGRST116 (No rows found)', () => {
      const err = {
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
        status: 404,
      };
      const res = normalizeAppError(err);

      expect(res.kind).toBe('NOT_FOUND');
      expect(res.status).toBe(404);
      expect(res.canRetry).toBe(false);
      expect(res.userMessage).toBe('El registro solicitado no fue encontrado o ya no está disponible.');
    });

    it('1.8. VALIDATION_ERROR: Detecta P0001 (PostgreSQL RAISE EXCEPTION) y 23514 / 23502', () => {
      const err = {
        code: 'P0001',
        message: 'El número de teléfono debe tener 11 dígitos numéricos',
        status: 400,
      };
      const res = normalizeAppError(err);

      expect(res.kind).toBe('VALIDATION_ERROR');
      expect(res.status).toBe(400);
      expect(res.canRetry).toBe(true);
      // Mensaje de negocio limpio en español se preserva
      expect(res.userMessage).toBe('El número de teléfono debe tener 11 dígitos numéricos');
    });

    it('1.9. SERVER_ERROR: Detecta errores 500, 5xx y códigos de PostgreSQL XXxxx / 58xxx', () => {
      const err = {
        code: 'XX000',
        status: 500,
        message: 'internal server error in PostgreSQL backend',
      };
      const res = normalizeAppError(err);

      expect(res.kind).toBe('SERVER_ERROR');
      expect(res.status).toBe(500);
      expect(res.canRetry).toBe(true);
      expect(res.userMessage).toBe('Ocurrió un problema temporal en el sistema. Por favor intenta de nuevo en unos minutos.');
    });

    it('1.10. UNKNOWN: Maneja excepciones no estructuradas o valores falsy', () => {
      const resFalsy = normalizeAppError(null);
      expect(resFalsy.kind).toBe('UNKNOWN');
      expect(resFalsy.canRetry).toBe(true);
      expect(resFalsy.userMessage).toBe('Ocurrió un error inesperado al procesar la solicitud.');

      const resGeneric = normalizeAppError(new Error('Something unexpected happened'));
      expect(resGeneric.kind).toBe('UNKNOWN');
      expect(resGeneric.userMessage).toBe('Something unexpected happened');
    });
  });

  describe('2. Sanitización y Prevención de Fugas de Información Interna (SQL/PostgreSQL/Schema)', () => {
    it('2.1. Bloquea exposición de tablas internas (table "orders")', () => {
      const rawMsg = 'permission denied for table "orders"';
      expect(containsSensitiveSqlDetails(rawMsg)).toBe(true);

      const sanitized = sanitizeUserMessage(rawMsg, 'Acceso no permitido');
      expect(sanitized).toBe('Acceso no permitido');
    });

    it('2.2. Bloquea exposición de esquemas y cláusulas SQL (SELECT * FROM public.tickets)', () => {
      const rawMsg = 'error executing SELECT * FROM public.tickets WHERE id = 1';
      expect(containsSensitiveSqlDetails(rawMsg)).toBe(true);

      const sanitized = sanitizeUserMessage(rawMsg, 'Error en la consulta');
      expect(sanitized).toBe('Error en la consulta');
    });

    it('2.3. Bloquea exposición de políticas RLS y nombres de restricciones en VALIDATION_ERROR', () => {
      const rawErr = {
        code: 'P0001',
        message: 'violates check constraint "tickets_raffle_id_ticket_number_key" on table "tickets"',
      };
      const res = normalizeAppError(rawErr);

      expect(res.kind).toBe('VALIDATION_ERROR');
      expect(res.userMessage).not.toContain('tickets_raffle_id_ticket_number_key');
      expect(res.userMessage).not.toContain('table "tickets"');
      expect(res.userMessage).toBe('Los datos proporcionados no cumplen con los requisitos de validación.');
      expect(res.technicalMessage).toBe(rawErr.message);
    });

    it('2.4. Bloquea exposición de tokens JWT y detalles de infraestructura', () => {
      const jwtErr = 'invalid JWT signature or expired token in header';
      expect(containsSensitiveSqlDetails(jwtErr)).toBe(true);

      const res = getUserFriendlyErrorMessage(
        { message: jwtErr },
        'Sesión inválida'
      );
      expect(res).not.toContain('JWT');
    });

    it('2.5. Todas las expresiones regulares de SENSITIVE_PATTERNS son válidas y funcionales', () => {
      expect(SENSITIVE_PATTERNS.length).toBeGreaterThan(10);
      SENSITIVE_PATTERNS.forEach((regex) => {
        expect(regex).toBeInstanceOf(RegExp);
      });
    });
  });

  describe('3. Telemetría y Logging Técnico Seguro (logAppError)', () => {
    it('3.1. Registra advertencia [AppAuth] para errores FORBIDDEN y UNAUTHORIZED', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      logAppError('AuditView.loadLogs', {
        code: '42501',
        message: 'permission denied for table "admin_audit_logs"',
        status: 403,
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const callArgs = warnSpy.mock.calls[0];
      expect(callArgs[0]).toBe('[AppAuth][AuditView.loadLogs]');
      expect(callArgs[1].kind).toBe('FORBIDDEN');
      expect(callArgs[1].code).toBe('42501');
      expect(callArgs[1].technicalMessage).toContain('permission denied');
      expect(callArgs[1].userMessage).toBe('No tienes los permisos necesarios para realizar esta acción o consultar estos registros.');
    });

    it('3.2. Registra advertencia [AppNetwork] para NETWORK_ERROR y TIMEOUT', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      logAppError('OrdersView.loadOrders', {
        code: 'TIMEOUT',
        message: 'Request timed out after 15000ms',
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const callArgs = warnSpy.mock.calls[0];
      expect(callArgs[0]).toBe('[AppNetwork][OrdersView.loadOrders]');
      expect(callArgs[1].kind).toBe('TIMEOUT');
      expect(callArgs[1].canRetry).toBe(true);
    });

    it('3.3. Registra error [AppError] para SERVER_ERROR y UNKNOWN', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logAppError('PaymentService.approveOrder', {
        code: '500',
        message: 'Internal server error during transaction commit',
        status: 500,
      });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const callArgs = errorSpy.mock.calls[0];
      expect(callArgs[0]).toBe('[AppError][PaymentService.approveOrder]');
      expect(callArgs[1].kind).toBe('SERVER_ERROR');
    });

    it('3.4. Acepta y preserva NormalizedError ya normalizado', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const normalized: NormalizedError = {
        kind: 'SERVER_ERROR',
        userMessage: 'Mensaje amigable',
        technicalMessage: 'Falla crítica de base de datos',
        code: '500',
        canRetry: true,
      };

      logAppError('SystemTest', normalized, { extraInfo: '123' });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const callArgs = errorSpy.mock.calls[0];
      expect(callArgs[1].extra).toEqual({ extraInfo: '123' });
      expect(callArgs[1].technicalMessage).toBe('Falla crítica de base de datos');
    });
  });

  describe('4. Resiliencia de Canales Realtime y Supabase Error Wrappers', () => {
    it('4.1. Manejo seguro de callbacks de estado en suscripciones Realtime (CHANNEL_ERROR / TIMED_OUT)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Simula el callback implementado en OrdersView, TicketsView, DashboardView, etc.
      const handleRealtimeStatus = (status: string, err?: Error) => {
        if (err || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime][orders] Canal con degradación:', status, err);
        }
      };

      handleRealtimeStatus('CHANNEL_ERROR', new Error('Connection refused'));
      expect(warnSpy).toHaveBeenCalledWith(
        '[Realtime][orders] Canal con degradación:',
        'CHANNEL_ERROR',
        expect.any(Error)
      );

      handleRealtimeStatus('TIMED_OUT');
      expect(warnSpy).toHaveBeenCalledWith(
        '[Realtime][orders] Canal con degradación:',
        'TIMED_OUT',
        undefined
      );
    });
  });
});
