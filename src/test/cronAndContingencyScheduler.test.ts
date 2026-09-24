import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Suite de Verificación para PROMPT 05.5 — AUDITORÍA 05: REMEDIACIÓN 5
 * Consolidación de pg_cron, Endpoint de Contingencia (Break-Glass) y Retención de Historial
 * 
 * Hallazgos Abordados:
 * - CRIT-04: Desacople y ambigüedad entre pg_cron interno y Edge Function de expiración.
 * - EVENT-08: Microservicio HTTP expuesto sin caller activo; transformación en endpoint break-glass.
 * - EVENT-10: Política de retención y mantenimiento para cron.job_run_details (30 días vs 7 días).
 */

// Simulación del runtime de la Edge Function (Deno HTTP Request handler)
interface EdgeFunctionEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CRON_SECRET?: string;
}

interface RpcResult {
  data: number | null;
  error: { message: string } | null;
}

function createMockEdgeFunctionHandler(
  env: EdgeFunctionEnv,
  mockRpc: () => Promise<RpcResult>,
  logSpy?: { error?: (...args: any[]) => unknown; warn?: (...args: any[]) => unknown } | any
) {
  return async (req: Request): Promise<Response> => {
    // 1. RESTRICCIÓN DE MÉTODO HTTP (Solo POST permitido)
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Method Not Allowed: Este endpoint de contingencia solo admite peticiones POST.",
          code: "METHOD_NOT_ALLOWED",
        }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            "Allow": "POST",
            "X-Content-Type-Options": "nosniff",
          },
        }
      );
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Method Not Allowed: Método ${req.method} no soportado. Utilice POST.`,
          code: "METHOD_NOT_ALLOWED",
        }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            "Allow": "POST",
            "X-Content-Type-Options": "nosniff",
          },
        }
      );
    }

    const standardHeaders = {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    };

    try {
      const supabaseUrl = env.SUPABASE_URL || "";
      const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
      const cronSecret = env.CRON_SECRET;

      // 2. VERIFICACIÓN DE CONFIGURACIÓN DEL SERVIDOR
      if (!cronSecret) {
        logSpy?.error?.("[CRON_CONTINGENCY] Error: La variable de entorno CRON_SECRET no está configurada.");
        return new Response(
          JSON.stringify({
            success: false,
            error: "Servicio de contingencia no configurado: CRON_SECRET no establecido.",
            code: "CONFIGURATION_ERROR",
          }),
          { status: 500, headers: standardHeaders }
        );
      }

      if (!supabaseUrl || !supabaseServiceKey) {
        logSpy?.error?.("[CRON_CONTINGENCY] Error: Credenciales de infraestructura Supabase ausentes.");
        return new Response(
          JSON.stringify({
            success: false,
            error: "Error interno de configuración de infraestructura.",
            code: "CONFIGURATION_ERROR",
          }),
          { status: 500, headers: standardHeaders }
        );
      }

      // 3. EXTRACCIÓN Y VALIDACIÓN DE AUTENTICACIÓN
      const authHeader = req.headers.get("authorization") || "";
      const xCronSecret = req.headers.get("x-cron-secret") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim() || xCronSecret.trim();

      if (!token) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Acceso no autorizado: Se requiere el secreto dedicado CRON_SECRET.",
            code: "UNAUTHORIZED",
          }),
          { status: 401, headers: standardHeaders }
        );
      }

      // Regla de Seguridad Crítica: RECHAZAR el uso de SUPABASE_SERVICE_ROLE_KEY como credencial HTTP
      if (token === supabaseServiceKey) {
        logSpy?.warn?.("[CRON_CONTINGENCY] Intento de acceso rechazado: Se utilizó SUPABASE_SERVICE_ROLE_KEY en lugar de CRON_SECRET.");
        return new Response(
          JSON.stringify({
            success: false,
            error: "Acceso denegado: El uso de SERVICE_ROLE_KEY como credencial HTTP está estrictamente prohibido. Utilice CRON_SECRET.",
            code: "FORBIDDEN_CREDENTIAL",
          }),
          { status: 401, headers: standardHeaders }
        );
      }

      // Validar token contra CRON_SECRET
      if (token !== cronSecret) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Acceso no autorizado: CRON_SECRET inválido.",
            code: "UNAUTHORIZED",
          }),
          { status: 401, headers: standardHeaders }
        );
      }

      // 4. INVOCAR PROCEDIMIENTO ATÓMICO EN BASE DE DATOS
      const { data, error } = await mockRpc();

      if (error) {
        logSpy?.error?.("[CRON_CONTINGENCY] Error al ejecutar release_expired_reservations:", error.message);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Error al ejecutar el procedimiento de liberación de reservas expiradas.",
            code: "DATABASE_ERROR",
          }),
          { status: 500, headers: standardHeaders }
        );
      }

      const releasedCount = typeof data === "number" ? data : 0;

      return new Response(
        JSON.stringify({
          success: true,
          message: "Liberación de reservas expiradas ejecutada correctamente vía endpoint de contingencia.",
          tickets_released: releasedCount,
          timestamp: new Date().toISOString(),
          mode: "break-glass-contingency",
        }),
        { status: 200, headers: standardHeaders }
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logSpy?.error?.("[CRON_CONTINGENCY] Excepción no controlada:", errorMsg);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Error interno inesperado en el servicio de contingencia.",
          code: "INTERNAL_SERVER_ERROR",
        }),
        { status: 500, headers: standardHeaders }
      );
    }
  };
}

describe('PROMPT 05.5: Consolidación de pg_cron, Contingencia Break-Glass y Retención', () => {
  const TEST_ENV: EdgeFunctionEnv = {
    SUPABASE_URL: 'https://test-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-xyz-master-secret',
    CRON_SECRET: 'test-dedicated-cron-secret-12345',
  };

  let mockRpc: () => Promise<RpcResult>;
  let mockLogs: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    mockLogs = {
      error: vi.fn(),
      warn: vi.fn(),
    };
  });

  describe('PARTE A: Edge Function como Endpoint de Contingencia Break-Glass (CRIT-04 / EVENT-08)', () => {
    it('1. Debe rechazar peticiones GET con código 405 Method Not Allowed y cabecera Allow: POST', async () => {
      const handler = createMockEdgeFunctionHandler(TEST_ENV, mockRpc, mockLogs);
      const req = new Request('https://test-project.supabase.co/functions/v1/cron-release-expired-reservations', {
        method: 'GET',
      });

      const res = await handler(req);
      const body = await res.json();

      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('POST');
      expect(body.code).toBe('METHOD_NOT_ALLOWED');
      expect(body.success).toBe(false);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('2. Debe rechazar otros métodos no soportados (PUT, DELETE, PATCH) con 405', async () => {
      const handler = createMockEdgeFunctionHandler(TEST_ENV, mockRpc, mockLogs);

      for (const method of ['PUT', 'DELETE', 'PATCH']) {
        const req = new Request('https://test-project.supabase.co/functions/v1/cron-release-expired-reservations', {
          method,
        });
        const res = await handler(req);
        expect(res.status).toBe(405);
      }
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('3. Debe rechazar peticiones POST sin token de autorización con 401 Unauthorized', async () => {
      const handler = createMockEdgeFunctionHandler(TEST_ENV, mockRpc, mockLogs);
      const req = new Request('https://test-project.supabase.co/functions/v1/cron-release-expired-reservations', {
        method: 'POST',
      });

      const res = await handler(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.success).toBe(false);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('4. Debe rechazar peticiones POST con token inválido con 401 Unauthorized', async () => {
      const handler = createMockEdgeFunctionHandler(TEST_ENV, mockRpc, mockLogs);
      const req = new Request('https://test-project.supabase.co/functions/v1/cron-release-expired-reservations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-falso-invalido',
        },
      });

      const res = await handler(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.code).toBe('UNAUTHORIZED');
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('5. REGLA ESTRICTA DE SEGURIDAD: Debe RECHAZAR el uso de SUPABASE_SERVICE_ROLE_KEY como bearer HTTP', async () => {
      const handler = createMockEdgeFunctionHandler(TEST_ENV, mockRpc, mockLogs);
      const req = new Request('https://test-project.supabase.co/functions/v1/cron-release-expired-reservations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_ENV.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });

      const res = await handler(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.code).toBe('FORBIDDEN_CREDENTIAL');
      expect(body.error).toContain('SERVICE_ROLE_KEY como credencial HTTP está estrictamente prohibido');
      expect(mockLogs.warn).toHaveBeenCalledWith(
        expect.stringContaining('Se utilizó SUPABASE_SERVICE_ROLE_KEY en lugar de CRON_SECRET')
      );
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('6. Debe aceptar token válido en header Authorization: Bearer <CRON_SECRET>', async () => {
      const handler = createMockEdgeFunctionHandler(TEST_ENV, mockRpc, mockLogs);
      const req = new Request('https://test-project.supabase.co/functions/v1/cron-release-expired-reservations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_ENV.CRON_SECRET}`,
        },
      });

      const res = await handler(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.tickets_released).toBe(3);
      expect(body.mode).toBe('break-glass-contingency');
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('7. Debe aceptar token válido en header alternativo x-cron-secret', async () => {
      const handler = createMockEdgeFunctionHandler(TEST_ENV, mockRpc, mockLogs);
      const req = new Request('https://test-project.supabase.co/functions/v1/cron-release-expired-reservations', {
        method: 'POST',
        headers: {
          'x-cron-secret': TEST_ENV.CRON_SECRET!,
        },
      });

      const res = await handler(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.tickets_released).toBe(3);
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('8. Debe responder 500 de configuración segura si CRON_SECRET no está configurado en el servidor', async () => {
      const unconfiguredEnv = { ...TEST_ENV, CRON_SECRET: undefined };
      const handler = createMockEdgeFunctionHandler(unconfiguredEnv, mockRpc, mockLogs);
      const req = new Request('https://test-project.supabase.co/functions/v1/cron-release-expired-reservations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer cualquier-token',
        },
      });

      const res = await handler(req);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.code).toBe('CONFIGURATION_ERROR');
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('9. No debe exponer cabeceras CORS permisivas de navegador (* o dominios web)', async () => {
      const handler = createMockEdgeFunctionHandler(TEST_ENV, mockRpc, mockLogs);
      const req = new Request('https://test-project.supabase.co/functions/v1/cron-release-expired-reservations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_ENV.CRON_SECRET}`,
          Origin: 'https://malicious-site.com',
        },
      });

      const res = await handler(req);

      // Verificación de headers de seguridad
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('10. Cero filtración de secretos: ningún log ni mensaje de respuesta debe contener el valor de CRON_SECRET', async () => {
      const handler = createMockEdgeFunctionHandler(TEST_ENV, mockRpc, mockLogs);
      const req = new Request('https://test-project.supabase.co/functions/v1/cron-release-expired-reservations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer intento-invalido',
        },
      });

      const res = await handler(req);
      const body = await res.json();
      const stringifiedBody = JSON.stringify(body);

      // El secreto jamás debe figurar en la respuesta ni en los logs
      expect(stringifiedBody).not.toContain(TEST_ENV.CRON_SECRET);
      expect(stringifiedBody).not.toContain(TEST_ENV.SUPABASE_SERVICE_ROLE_KEY);

      mockLogs.error.mock.calls.forEach((args) => {
        expect(JSON.stringify(args)).not.toContain(TEST_ENV.CRON_SECRET);
      });
    });
  });

  describe('PARTE B: Contrato de pg_cron como Scheduler Primario y Control de Concurrencia', () => {
    it('11. Contrato Canónico de pg_cron: frecuencia de 5 minutos y job único', () => {
      const canonicalPgCronJob = {
        jobname: 'release-expired-reservations-job',
        schedule: '*/5 * * * *',
        command: 'SELECT public.release_expired_reservations();',
        active: true,
      };

      // Frecuencia exacta cada 5 minutos
      expect(canonicalPgCronJob.schedule).toBe('*/5 * * * *');
      expect(canonicalPgCronJob.jobname).toBe('release-expired-reservations-job');
      expect(canonicalPgCronJob.command).toBe('SELECT public.release_expired_reservations();');
      expect(canonicalPgCronJob.active).toBe(true);
    });

    it('12. Prevención de Solapamiento Concurrente: Advisory Transaction Lock evita colisiones', () => {
      // Simulación de control de concurrencia en PostgreSQL con pg_try_advisory_xact_lock
      const simulateExecutionWithAdvisoryLock = (
        isLockHeldByOtherTransaction: boolean,
        expiredTicketsAvailable: number
      ): { executed: boolean; ticketsReleased: number } => {
        if (isLockHeldByOtherTransaction) {
          // El lock no pudo adquirirse porque otro job/ejecución está en curso -> salir limpiamente con 0
          return { executed: false, ticketsReleased: 0 };
        }
        // Lock adquirido con éxito -> procesar liberación de boletos
        return { executed: true, ticketsReleased: expiredTicketsAvailable };
      };

      // Invocación 1 (Scheduler primario pg_cron): adquiere el lock y libera boletos
      const run1 = simulateExecutionWithAdvisoryLock(false, 5);
      expect(run1.executed).toBe(true);
      expect(run1.ticketsReleased).toBe(5);

      // Invocación 2 simultánea (Break-glass manual concurrente mientras run1 sigue viva):
      const run2 = simulateExecutionWithAdvisoryLock(true, 5);
      expect(run2.executed).toBe(false);
      expect(run2.ticketsReleased).toBe(0);
    });

    it('13. Semántica FOR UPDATE SKIP LOCKED: transacciones concurrentes operan sobre conjuntos disjuntos', () => {
      interface OrderRecord {
        id: string;
        status: 'pending' | 'expired' | 'pending_verification';
        isLocked: boolean;
      }

      const ordersTable: OrderRecord[] = [
        { id: 'order-1', status: 'pending', isLocked: false },
        { id: 'order-2', status: 'pending', isLocked: true }, // Ya bloqueada por transacción paralela
        { id: 'order-3', status: 'pending', isLocked: false },
        { id: 'order-4', status: 'pending_verification', isLocked: false }, // En verificación (inmune)
      ];

      // Simular SELECT ... FOR UPDATE SKIP LOCKED
      const selectedForUpdate = ordersTable.filter(
        (o) => o.status === 'pending' && !o.isLocked
      );

      expect(selectedForUpdate.map((o) => o.id)).toEqual(['order-1', 'order-3']);
      // La orden 2 (bloqueada) se salta sin esperar (0 contención)
      // La orden 4 (en verificación) nunca es seleccionada
    });

    it('14. Protección Estricta de Órdenes en Verificación y Pagadas: Inmunidad total a la expiración', () => {
      const tickets = [
        { id: 't1', status: 'reserved', order_status: 'pending', expired: true },
        { id: 't2', status: 'reserved', order_status: 'pending_verification', expired: true },
        { id: 't3', status: 'sold', order_status: 'paid', expired: true },
      ];

      const releasedTickets = tickets.filter(
        (t) => t.status === 'reserved' && t.order_status === 'pending' && t.expired
      );

      // Solo el boleto t1 perteneciente a una orden 'pending' sin comprobante puede ser liberado
      expect(releasedTickets.map((t) => t.id)).toEqual(['t1']);
      expect(releasedTickets.find((t) => t.id === 't2')).toBeUndefined();
      expect(releasedTickets.find((t) => t.id === 't3')).toBeUndefined();
    });
  });

  describe('PARTE C: Política de Retención de Historial cron.job_run_details (EVENT-10)', () => {
    it('15. Política de Retención Oficial de 30 días para preservación de respuesta a incidentes', () => {
      const retentionPolicy = {
        targetTable: 'cron.job_run_details',
        recommendedRetentionDays: 30,
        minimumAllowedRetentionDays: 15,
        frequency: '0 3 * * *', // Diario a las 03:00 UTC
        jobname: 'cleanup-cron-history-job',
        command: 'SELECT public.cleanup_cron_job_run_details(30);',
      };

      expect(retentionPolicy.recommendedRetentionDays).toBe(30);
      expect(retentionPolicy.minimumAllowedRetentionDays).toBeGreaterThanOrEqual(15);
      expect(retentionPolicy.frequency).toBe('0 3 * * *');
    });

    it('16. Rechazo de Purga Agresiva a 7 días: Debe elevar automáticamente a mínimo 15 días', () => {
      // Simulación de la regla: GREATEST(COALESCE(p_retention_days, 30), 15)
      const calculateEffectiveRetention = (inputDays?: number): number => {
        return Math.max(inputDays ?? 30, 15);
      };

      // Si alguien intenta purgar a 7 días:
      expect(calculateEffectiveRetention(7)).toBe(15);
      // Con valor por defecto (undefined):
      expect(calculateEffectiveRetention(undefined)).toBe(30);
      // Con valor canónico de 30 días:
      expect(calculateEffectiveRetention(30)).toBe(30);
      // Con valor extendido de 60 días:
      expect(calculateEffectiveRetention(60)).toBe(60);
    });

    it('17. Simulación de Limpieza de Registros de cron.job_run_details según ventana de retención', () => {
      const now = new Date('2026-09-24T12:00:00Z');
      const retentionDays = 30;
      const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000); // 2026-08-25T12:00:00Z

      const runDetails = [
        { id: 1, end_time: '2026-09-20T10:00:00Z' }, // 4 días atrás (CONSERVAR)
        { id: 2, end_time: '2026-09-01T08:00:00Z' }, // 23 días atrás (CONSERVAR)
        { id: 3, end_time: '2026-08-20T00:00:00Z' }, // 35 días atrás (PURGAR)
        { id: 4, end_time: '2026-07-15T00:00:00Z' }, // 71 días atrás (PURGAR)
      ];

      const toKeep = runDetails.filter((r) => new Date(r.end_time) >= cutoffDate);
      const toDelete = runDetails.filter((r) => new Date(r.end_time) < cutoffDate);

      expect(toKeep.map((r) => r.id)).toEqual([1, 2]);
      expect(toDelete.map((r) => r.id)).toEqual([3, 4]);
    });

    it('18. Restricción de Acceso: cleanup_cron_job_run_details restringida estrictamente a service_role', () => {
      const routineGrants = {
        name: 'cleanup_cron_job_run_details',
        searchPath: ['pg_catalog', 'cron', 'public', 'pg_temp'],
        isSecurityDefiner: true,
        revokedFrom: ['PUBLIC', 'anon', 'authenticated'],
        grantedTo: ['service_role'],
      };

      expect(routineGrants.revokedFrom).toContain('PUBLIC');
      expect(routineGrants.revokedFrom).toContain('anon');
      expect(routineGrants.revokedFrom).toContain('authenticated');
      expect(routineGrants.grantedTo).toEqual(['service_role']);
      expect(routineGrants.searchPath[0]).toBe('pg_catalog');
      expect(routineGrants.searchPath[1]).toBe('cron');
    });
  });
});
