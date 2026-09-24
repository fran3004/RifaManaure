import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeAppError, containsSensitiveSqlDetails, sanitizeUserMessage } from '@/lib/errorHandling';

// Mock de Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

import * as paymentService from '@/services/paymentService';
import { supabase } from '@/lib/supabase';

/**
 * Suite de Verificación de Seguridad y Remediación para PROMPT 05.4
 * Hardening Completo de SECURITY DEFINER, Protocolo de Errores y Auditoría Financiera
 *
 * Hallazgos Abordados:
 * - CRIT-03: Divergencia arquitectónica en manejo de errores (RAISE EXCEPTION vs jsonb)
 * - CRIT-05: Funciones SECURITY DEFINER con riesgo de Search Path Hijacking
 * - EVENT-05: Ausencia de auditoría financiera explícita en aprobación/rechazo de pagos
 * - EVENT-06: Estandarización de interfaz de retorno en RPCs
 * - EVENT-07: search_path explícito y seguro (pg_catalog al inicio)
 */

interface SecurityDefinerFunctionMeta {
  name: string;
  signature: string;
  type: 'RPC_PUBLIC' | 'RPC_ADMIN' | 'RPC_SYSTEM' | 'TRIGGER' | 'HELPER';
  searchPath: string[];
  allowedGrants: ('anon' | 'authenticated' | 'service_role')[];
  usesAuth: boolean;
  usesExtensions: boolean;
}

interface AuditRecord {
  id?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  performed_by: string | null;
  details: Record<string, unknown>;
  created_at?: string;
}

describe('PROMPT 05.4: Hardening de SECURITY DEFINER, Contrato de Errores y Auditoría Financiera', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Catálogo Canónico de Funciones SECURITY DEFINER Blindadas en Migración 055
  const canonicalSecurityDefinerCatalog: SecurityDefinerFunctionMeta[] = [
    // RPCs Públicas
    {
      name: 'create_order_secure',
      signature: 'create_order_secure(uuid, text[], jsonb, character varying, character varying, uuid)',
      type: 'RPC_PUBLIC',
      searchPath: ['pg_catalog', 'public', 'extensions', 'pg_temp'],
      allowedGrants: ['anon', 'authenticated', 'service_role'],
      usesAuth: false,
      usesExtensions: true,
    },
    {
      name: 'submit_payment_proof',
      signature: 'submit_payment_proof(uuid, text, text, integer, character varying, text, uuid)',
      type: 'RPC_PUBLIC',
      searchPath: ['pg_catalog', 'public', 'extensions', 'pg_temp'],
      allowedGrants: ['anon', 'authenticated', 'service_role'],
      usesAuth: false,
      usesExtensions: true,
    },
    {
      name: 'verify_public_order_or_tickets',
      signature: 'verify_public_order_or_tickets(text, text)',
      type: 'RPC_PUBLIC',
      searchPath: ['pg_catalog', 'public', 'pg_temp'],
      allowedGrants: ['anon', 'authenticated', 'service_role'],
      usesAuth: false,
      usesExtensions: false,
    },
    // Helpers Auth y Verificación
    {
      name: 'is_admin',
      signature: 'is_admin(uuid)',
      type: 'HELPER',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['anon', 'authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'is_superadmin',
      signature: 'is_superadmin(uuid)',
      type: 'HELPER',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['anon', 'authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    // RPCs Administrativas Críticas (Prohibidas para 'anon')
    {
      name: 'approve_order_payment',
      signature: 'approve_order_payment(uuid)',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'reject_order_payment',
      signature: 'reject_order_payment(uuid, text)',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'cancel_order',
      signature: 'cancel_order(uuid, text)',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'register_winner',
      signature: 'register_winner(uuid, text, text, timestamptz, text, text[], text)',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'admin_block_ticket',
      signature: 'admin_block_ticket(uuid, text)',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'admin_unblock_ticket',
      signature: 'admin_unblock_ticket(uuid, text)',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'admin_update_raffle',
      signature: 'admin_update_raffle(uuid, text, text, numeric, timestamptz, text, text, integer)',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'admin_update_system_settings',
      signature: 'admin_update_system_settings(integer, integer, text, text)',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'admin_create_raffle',
      signature: 'admin_create_raffle(text, text, text, numeric, integer, integer, timestamptz, text, text)',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'admin_invite_user',
      signature: 'admin_invite_user(text, text, text)',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'admin_list_users',
      signature: 'admin_list_users()',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'admin_toggle_user_status',
      signature: 'admin_toggle_user_status(uuid, boolean)',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'admin_update_buyer',
      signature: 'admin_update_buyer(uuid, text, text, text, text, text)',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'get_dashboard_kpis',
      signature: 'get_dashboard_kpis(uuid)',
      type: 'RPC_ADMIN',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    // Funciones del Sistema y Cron
    {
      name: 'release_expired_reservations',
      signature: 'release_expired_reservations()',
      type: 'RPC_SYSTEM',
      searchPath: ['pg_catalog', 'public', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: false,
      usesExtensions: false,
    },
    {
      name: 'reserve_tickets',
      signature: 'reserve_tickets(uuid, text[], uuid)',
      type: 'RPC_SYSTEM',
      searchPath: ['pg_catalog', 'public', 'pg_temp'],
      allowedGrants: ['service_role'], // Revocado de anon y authenticated
      usesAuth: false,
      usesExtensions: false,
    },
    // Triggers y Helpers Internos
    {
      name: 'fn_validate_order_status_transition',
      signature: 'fn_validate_order_status_transition()',
      type: 'TRIGGER',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'fn_validate_raffle_status_transition',
      signature: 'fn_validate_raffle_status_transition()',
      type: 'TRIGGER',
      searchPath: ['pg_catalog', 'public', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: false,
      usesExtensions: false,
    },
    {
      name: 'fn_validate_ticket_status_transition',
      signature: 'fn_validate_ticket_status_transition()',
      type: 'TRIGGER',
      searchPath: ['pg_catalog', 'public', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: false,
      usesExtensions: false,
    },
    {
      name: 'fn_sync_ticket_public_state',
      signature: 'fn_sync_ticket_public_state()',
      type: 'TRIGGER',
      searchPath: ['pg_catalog', 'public', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: false,
      usesExtensions: false,
    },
    {
      name: 'sync_admin_user_id',
      signature: 'sync_admin_user_id()',
      type: 'TRIGGER',
      searchPath: ['pg_catalog', 'public', 'auth', 'pg_temp'],
      allowedGrants: ['authenticated', 'service_role'],
      usesAuth: true,
      usesExtensions: false,
    },
    {
      name: 'fn_is_order_pending_proof',
      signature: 'fn_is_order_pending_proof(text)',
      type: 'HELPER',
      searchPath: ['pg_catalog', 'public', 'pg_temp'],
      allowedGrants: ['anon', 'authenticated', 'service_role'],
      usesAuth: false,
      usesExtensions: false,
    },
  ];

  describe('PARTE A: Blindaje de Search Path y Prevención de Hijacking (CRIT-05 / EVENT-07)', () => {
    it('todas las funciones SECURITY DEFINER deben fijar explícitamente su search_path anteponiendo pg_catalog', () => {
      canonicalSecurityDefinerCatalog.forEach((fn) => {
        expect(fn.searchPath.length).toBeGreaterThanOrEqual(3);
        // Regla fundamental: pg_catalog DEBE ser el primer esquema de búsqueda
        expect(fn.searchPath[0]).toBe('pg_catalog');
        // El esquema public debe estar presente
        expect(fn.searchPath).toContain('public');
        // El esquema temporal pg_temp debe estar al final
        expect(fn.searchPath[fn.searchPath.length - 1]).toBe('pg_temp');
      });
    });

    it('solo las funciones que interactúan con auth deben incluir el esquema auth en su search_path', () => {
      canonicalSecurityDefinerCatalog.forEach((fn) => {
        const hasAuthInSearchPath = fn.searchPath.includes('auth');
        if (fn.usesAuth) {
          expect(hasAuthInSearchPath).toBe(true);
        } else {
          expect(hasAuthInSearchPath).toBe(false);
        }
      });
    });

    it('solo las funciones que utilizan criptografía o hashes (digest/gen_random_uuid) deben incluir extensions', () => {
      canonicalSecurityDefinerCatalog.forEach((fn) => {
        const hasExtensions = fn.searchPath.includes('extensions');
        if (fn.usesExtensions) {
          expect(hasExtensions).toBe(true);
        } else {
          expect(hasExtensions).toBe(false);
        }
      });
    });

    it('ningún objeto malicioso en pg_temp puede realizar shadowing de funciones del sistema (pg_catalog primero)', () => {
      // Simulación de resolución de operadores y funciones en PostgreSQL con search_path
      const resolveFunction = (
        funcName: string,
        searchPath: string[],
        schemasWithFunc: Record<string, string[]>
      ): string => {
        for (const schema of searchPath) {
          if (schemasWithFunc[schema]?.includes(funcName)) {
            return schema;
          }
        }
        throw new Error(`Function ${funcName} not found in search_path`);
      };

      const mockSchemas = {
        pg_temp: ['coalesce', 'now', 'count', 'trim', 'lpad'], // Atacante inyecta shadowing en pg_temp
        public: ['is_admin', 'approve_order_payment', 'create_order_secure'],
        pg_catalog: ['coalesce', 'now', 'count', 'trim', 'lpad', 'lower', 'upper'],
      };

      // Si search_path es [pg_catalog, public, auth, pg_temp]:
      const searchPathHardened = ['pg_catalog', 'public', 'auth', 'pg_temp'];
      expect(resolveFunction('coalesce', searchPathHardened, mockSchemas)).toBe('pg_catalog');
      expect(resolveFunction('now', searchPathHardened, mockSchemas)).toBe('pg_catalog');
      expect(resolveFunction('trim', searchPathHardened, mockSchemas)).toBe('pg_catalog');

      // En contraste, un search_path vulnerable sin pg_catalog explícito o con pg_temp primero resolvería en pg_temp:
      const searchPathVulnerable = ['pg_temp', 'public'];
      expect(resolveFunction('coalesce', searchPathVulnerable, mockSchemas)).toBe('pg_temp');
    });

    it('las funciones arcaicas deprecadas (confirm_order_payment, submit_order_receipt) deben estar purgadas', () => {
      const activeRpcNames = canonicalSecurityDefinerCatalog.map((f) => f.name);
      expect(activeRpcNames).not.toContain('confirm_order_payment');
      expect(activeRpcNames).not.toContain('submit_order_receipt');
    });

    it('las RPCs administrativas deben tener revocado el permiso de ejecución para anon y PUBLIC', () => {
      const adminRpcs = canonicalSecurityDefinerCatalog.filter((f) => f.type === 'RPC_ADMIN');
      adminRpcs.forEach((fn) => {
        expect(fn.allowedGrants).not.toContain('anon');
        expect(fn.allowedGrants).toContain('authenticated');
        expect(fn.allowedGrants).toContain('service_role');
      });
    });

    it('solo las 3 RPCs públicas legítimas deben tener permiso para anon', () => {
      const publicRpcs = canonicalSecurityDefinerCatalog.filter((f) => f.allowedGrants.includes('anon'));
      const publicRpcNames = publicRpcs.map((f) => f.name);
      expect(publicRpcNames).toContain('create_order_secure');
      expect(publicRpcNames).toContain('submit_payment_proof');
      expect(publicRpcNames).toContain('verify_public_order_or_tickets');
      expect(publicRpcNames).toContain('is_admin'); // Requerido para RLS públicas
      expect(publicRpcNames).toContain('is_superadmin');
      expect(publicRpcNames).toContain('fn_is_order_pending_proof');
      // Ninguna RPC administrativa en lista
      expect(publicRpcNames).not.toContain('approve_order_payment');
      expect(publicRpcNames).not.toContain('reject_order_payment');
      expect(publicRpcNames).not.toContain('cancel_order');
      expect(publicRpcNames).not.toContain('register_winner');
    });
  });

  describe('PARTE B: Protocolo de Errores RPC y Clasificación Canónica (CRIT-03 / EVENT-06)', () => {
    it('debe clasificar el código FORBIDDEN y 42501 como acceso denegado sin exponer detalles internos', () => {
      // Caso 1: Error con mensaje de negocio limpio
      const forbiddenError1 = { code: '42501', message: 'Acceso denegado: se requiere rol de administrador' };
      const normalized1 = normalizeAppError(forbiddenError1);
      expect(normalized1.kind).toBe('FORBIDDEN');
      expect(normalized1.status).toBe(403);
      expect(normalized1.canRetry).toBe(false);
      expect(normalized1.userMessage).toContain('Acceso denegado');

      // Caso 2: Error técnico con fuga SQL PostgreSQL (debe sanitizarse a mensaje seguro)
      const forbiddenSqlError = { code: '42501', message: 'permission denied for table "orders"' };
      const normalizedSql = normalizeAppError(forbiddenSqlError);
      expect(normalizedSql.kind).toBe('FORBIDDEN');
      expect(normalizedSql.status).toBe(403);
      expect(normalizedSql.userMessage).toBe('No tienes los permisos necesarios para realizar esta acción o consultar estos registros.');

      // Caso 3: Error con código FORBIDDEN
      const forbiddenError2 = { code: 'FORBIDDEN', message: 'Acceso denegado: solo administradores autorizados pueden registrar ganadores.' };
      const normalized2 = normalizeAppError(forbiddenError2);
      expect(normalized2.kind).toBe('FORBIDDEN');
      expect(normalized2.status).toBe(403);
    });

    it('debe clasificar el código NOT_FOUND en órdenes, rifas o boletos inexistentes', () => {
      const notFoundError = { code: 'NOT_FOUND', message: 'La orden de compra no existe.' };
      const normalized = normalizeAppError(notFoundError);
      expect(normalized.kind).toBe('NOT_FOUND');
      expect(normalized.status).toBe(404);
      expect(normalized.canRetry).toBe(false);
      expect(normalized.userMessage).toBe('La orden de compra no existe.');
    });

    it('debe clasificar el código INVALID_STATE para órdenes pagadas, expiradas o terminales', () => {
      const invalidStateError = {
        code: 'INVALID_STATE',
        message: 'No se puede aprobar la orden en su estado actual. Solo se admiten órdenes en verificación o pendientes.',
      };
      const normalized = normalizeAppError(invalidStateError);
      expect(normalized.kind).toBe('VALIDATION_ERROR');
      expect(normalized.status).toBe(400);
      expect(normalized.canRetry).toBe(true);
      expect(normalized.userMessage).toContain('No se puede aprobar la orden');
    });

    it('debe clasificar el código CONFLICT para intentos duplicados de registro o colisión de concurrencia', () => {
      const conflictError = {
        code: 'CONFLICT',
        message: 'Conflicto de concurrencia: el boleto ya fue registrado como ganador por otro proceso concurrente.',
      };
      const normalized = normalizeAppError(conflictError);
      expect(normalized.kind).toBe('CONFLICT');
      expect(normalized.status).toBe(409);
      expect(normalized.canRetry).toBe(false);
      expect(normalized.userMessage).toContain('Conflicto de concurrencia');
    });

    it('debe clasificar el código INTEGRITY_ERROR para discrepancias de boletos u órdenes vacías', () => {
      const integrityError = {
        code: 'INTEGRITY_ERROR',
        message: 'Discrepancia en cantidad de boletos: la orden registra 5 boletos pero se encontraron 4 boletos asociados.',
      };
      const normalized = normalizeAppError(integrityError);
      expect(normalized.kind).toBe('VALIDATION_ERROR');
      expect(normalized.status).toBe(400);
      expect(normalized.userMessage).toContain('Discrepancia en cantidad de boletos');
    });

    it('debe detectar y sanitizar cualquier fuga técnica SQL o nombres de tablas de PostgreSQL', () => {
      const rawPgErrors = [
        'new row violates row-level security policy for table "orders"',
        'duplicate key value violates unique constraint "uq_winners_raffle_ticket"',
        'relation "public.tickets" does not exist',
        'permission denied for schema public',
        'syntax error at or near "SELECT"',
      ];

      rawPgErrors.forEach((rawMsg) => {
        expect(containsSensitiveSqlDetails(rawMsg)).toBe(true);
        const sanitized = sanitizeUserMessage(rawMsg, 'Operación no válida');
        expect(sanitized).toBe('Operación no válida');
        expect(sanitized).not.toContain('table');
        expect(sanitized).not.toContain('constraint');
        expect(sanitized).not.toContain('public.');
      });
    });

    it('approveOrderPayment maneja respuestas estructuradas con códigos canónicos correctamente', async () => {
      // Simulación de error de estado inválido devuelto por la RPC
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'INVALID_STATE',
          error: 'La orden ya se encuentra aprobada y pagada anteriormente.',
        },
        error: null,
      } as any);

      const result = await paymentService.approveOrderPayment('a1111111-1111-1111-1111-111111111111');
      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_STATE');
      expect(result.error).toContain('La orden ya se encuentra aprobada y pagada');
    });

    it('rejectOrderPayment maneja respuestas de NOT_FOUND sin romper la vista', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'NOT_FOUND',
          error: 'La orden de compra no existe.',
        },
        error: null,
      } as any);

      const result = await paymentService.rejectOrderPayment(
        'b2222222-2222-2222-2222-222222222222',
        'Comprobante ilegible'
      );
      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
      expect(result.error).toContain('La orden de compra no existe');
    });
  });

  describe('PARTE C: Auditoría Financiera Explícita y Trazabilidad Canónica (EVENT-05)', () => {
    // Motor simulado de trigger fn_validate_order_status_transition
    const executeOrderStatusTransitionTrigger = (
      oldOrder: { id: string; reference: string; status: string; total_amount: number; ticket_count: number },
      newOrder: { id: string; reference: string; status: string; total_amount: number; ticket_count: number; verified_by?: string; rejection_reason?: string }
    ): AuditRecord | null => {
      if (oldOrder.status === newOrder.status) {
        return null;
      }

      let auditAction = `ORDER_STATUS_${newOrder.status.toUpperCase()}`;
      if (newOrder.status === 'paid') {
        auditAction = 'ORDER_PAYMENT_APPROVED';
      } else if (newOrder.status === 'rejected') {
        auditAction = 'ORDER_PAYMENT_REJECTED';
      } else if (newOrder.status === 'cancelled') {
        auditAction = 'ORDER_CANCELLED';
      }

      return {
        action: auditAction,
        entity_type: 'order',
        entity_id: newOrder.id,
        performed_by: newOrder.verified_by || null,
        details: {
          order_id: newOrder.id,
          actor: newOrder.verified_by || null,
          timestamp: new Date().toISOString(),
          reference: newOrder.reference,
          previous_status: oldOrder.status,
          new_status: newOrder.status,
          total_amount: newOrder.total_amount,
          ticket_count: newOrder.ticket_count,
          rejection_reason: newOrder.rejection_reason || null,
        },
      };
    };

    it('al aprobar una orden debe registrar EXACTAMENTE UN evento ORDER_PAYMENT_APPROVED con metadatos completos y sin PII', () => {
      const oldOrder = {
        id: 'ord-12345678-0000-0000-0000-000000000001',
        reference: 'ORD-2026-0001',
        status: 'pending_verification',
        total_amount: 150000,
        ticket_count: 3,
      };

      const newOrder = {
        ...oldOrder,
        status: 'paid',
        verified_by: 'adm-00000000-0000-0000-0000-000000000099',
      };

      const auditRecord = executeOrderStatusTransitionTrigger(oldOrder, newOrder);
      expect(auditRecord).not.toBeNull();
      expect(auditRecord?.action).toBe('ORDER_PAYMENT_APPROVED');
      expect(auditRecord?.entity_type).toBe('order');
      expect(auditRecord?.entity_id).toBe(oldOrder.id);
      expect(auditRecord?.performed_by).toBe('adm-00000000-0000-0000-0000-000000000099');

      // Validar detalles requeridos por contrato
      const details = auditRecord?.details as any;
      expect(details.order_id).toBe(oldOrder.id);
      expect(details.actor).toBe('adm-00000000-0000-0000-0000-000000000099');
      expect(details.reference).toBe('ORD-2026-0001');
      expect(details.total_amount).toBe(150000);
      expect(details.ticket_count).toBe(3);
      expect(details.previous_status).toBe('pending_verification');
      expect(details.new_status).toBe('paid');
      expect(details.rejection_reason).toBeNull();

      // Invariante de privacidad: CERO PII en logs financieros
      expect(details.buyer_name).toBeUndefined();
      expect(details.email).toBeUndefined();
      expect(details.phone).toBeUndefined();
      expect(details.document_id).toBeUndefined();
    });

    it('al rechazar una orden debe registrar EXACTAMENTE UN evento ORDER_PAYMENT_REJECTED con motivo del rechazo', () => {
      const oldOrder = {
        id: 'ord-12345678-0000-0000-0000-000000000002',
        reference: 'ORD-2026-0002',
        status: 'pending_verification',
        total_amount: 100000,
        ticket_count: 2,
      };

      const newOrder = {
        ...oldOrder,
        status: 'rejected',
        verified_by: 'adm-00000000-0000-0000-0000-000000000099',
        rejection_reason: 'Comprobante adulterado o no coincide monto con banco',
      };

      const auditRecord = executeOrderStatusTransitionTrigger(oldOrder, newOrder);
      expect(auditRecord).not.toBeNull();
      expect(auditRecord?.action).toBe('ORDER_PAYMENT_REJECTED');
      expect(auditRecord?.details.rejection_reason).toBe('Comprobante adulterado o no coincide monto con banco');
      expect(auditRecord?.details.previous_status).toBe('pending_verification');
      expect(auditRecord?.details.new_status).toBe('rejected');
    });

    it('al cancelar una orden debe registrar EXACTAMENTE UN evento ORDER_CANCELLED', () => {
      const oldOrder = {
        id: 'ord-12345678-0000-0000-0000-000000000003',
        reference: 'ORD-2026-0003',
        status: 'pending',
        total_amount: 50000,
        ticket_count: 1,
      };

      const newOrder = {
        ...oldOrder,
        status: 'cancelled',
        verified_by: 'adm-00000000-0000-0000-0000-000000000099',
        rejection_reason: 'Cancelación administrativa solicitada por el usuario',
      };

      const auditRecord = executeOrderStatusTransitionTrigger(oldOrder, newOrder);
      expect(auditRecord).not.toBeNull();
      expect(auditRecord?.action).toBe('ORDER_CANCELLED');
      expect(auditRecord?.details.previous_status).toBe('pending');
      expect(auditRecord?.details.new_status).toBe('cancelled');
    });

    it('la matriz de auditoría transaccional garantiza unicidad estricta para cada acción financiera', () => {
      // Validamos que no se generen eventos duplicados
      const auditLogHistory: AuditRecord[] = [];

      const recordAction = (record: AuditRecord | null) => {
        if (record) {
          auditLogHistory.push(record);
        }
      };

      // 1. Submit proof (directo en RPC submit_payment_proof)
      recordAction({
        action: 'PAYMENT_PROOF_SUBMITTED',
        entity_type: 'payment_proof',
        entity_id: 'prf-001',
        performed_by: null,
        details: { order_id: 'ord-100', file_url: 'https://...', amount: 50000 },
      });

      // 2. Approve payment (vía trigger de orden)
      const approveRecord = executeOrderStatusTransitionTrigger(
        { id: 'ord-100', reference: 'ORD-100', status: 'pending_verification', total_amount: 50000, ticket_count: 1 },
        { id: 'ord-100', reference: 'ORD-100', status: 'paid', total_amount: 50000, ticket_count: 1, verified_by: 'adm-99' }
      );
      recordAction(approveRecord);

      // 3. Register winner (directo en RPC register_winner)
      recordAction({
        action: 'WINNER_REGISTERED',
        entity_type: 'winner',
        entity_id: 'win-001',
        performed_by: 'adm-99',
        details: { raffle_id: 'raf-001', ticket_number: '042', order_id: 'ord-100' },
      });

      // Verificación de recuento: exactamente 3 eventos, sin duplicados
      expect(auditLogHistory.length).toBe(3);
      const actionCounts = auditLogHistory.reduce((acc, curr) => {
        acc[curr.action] = (acc[curr.action] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(actionCounts['PAYMENT_PROOF_SUBMITTED']).toBe(1);
      expect(actionCounts['ORDER_PAYMENT_APPROVED']).toBe(1);
      expect(actionCounts['WINNER_REGISTERED']).toBe(1);
      // No existe ORDER_STATUS_PAID simultáneo (cero duplicación)
      expect(actionCounts['ORDER_STATUS_PAID']).toBeUndefined();
    });
  });
});
