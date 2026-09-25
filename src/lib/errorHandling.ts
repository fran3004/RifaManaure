/**
 * Centralized Error Normalization and Diagnostic Logging System
 *
 * Provides safe, sanitized, user-facing error messages in Spanish while
 * preserving full technical details (codes, raw SQL, stack traces) strictly
 * for diagnostics and development logs. Prevents leakage of database schema,
 * table names, column names, constraints, or RLS policies to UI views.
 */

export type AppErrorKind =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'UNAUTHORIZED' // 401
  | 'FORBIDDEN' // 403, 42501 (RLS / ACL)
  | 'VALIDATION_ERROR' // 400, P0001 (PostgreSQL check / raise)
  | 'CONFLICT' // 409, 23505 (Unique violation / duplicates)
  | 'NOT_FOUND' // 404, P0002, PGRST116
  | 'SERVER_ERROR' // 500, 5xx
  | 'UNKNOWN';

export interface NormalizedError {
  kind: AppErrorKind;
  userMessage: string;
  technicalMessage: string;
  code?: string;
  status?: number;
  details?: unknown;
  canRetry: boolean;
}

export interface RawErrorPayload {
  code?: string | number;
  message?: string;
  details?: unknown;
  hint?: string;
  status?: number;
  statusCode?: number;
  name?: string;
  error?: string;
  error_description?: string;
}

/**
 * Regex patterns identifying raw internal database or infrastructure details
 * that must never be presented to end users in UI views.
 */
export const SENSITIVE_PATTERNS = [
  /permission denied for (table|relation|schema|sequence)/i,
  /new row violates row-level security policy/i,
  /violates row-level security/i,
  /duplicate key value violates unique constraint/i,
  /violates foreign key constraint/i,
  /violates check constraint/i,
  /violates not-null constraint/i,
  /relation "[^"]+" does not exist/i,
  /column "[^"]+" does not exist/i,
  /function [^\s]+ does not exist/i,
  /syntax error at or near/i,
  /schema "[^"]+"/i,
  /table "[^"]+"/i,
  /\bpublic\.[a-z0-9_]+/i,
  /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b/i,
  /\bpgrst\d+\b/i,
  /JWT/i,
  /PostgrestError/i,
  /JSON object requested/i,
  /multiple \(or no\) rows returned/i,
  /supabase/i,
  /postgres/i,
];

/**
 * Checks whether a raw error string contains internal database schema or SQL leakage.
 */
export function containsSensitiveSqlDetails(message: string): boolean {
  if (!message || typeof message !== 'string') return false;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Sanitizes an error message. If the message contains internal database schema,
 * table names, constraints, or SQL syntax, it returns the provided safe fallback.
 */
export function sanitizeUserMessage(rawMessage: string, safeFallback: string): string {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return safeFallback;
  }
  if (containsSensitiveSqlDetails(rawMessage)) {
    return safeFallback;
  }
  // Trim and ensure safe length
  const clean = rawMessage.trim();
  if (clean.length > 250) {
    return safeFallback;
  }
  return clean;
}

/**
 * Normalizes any error (Supabase PostgrestError, AuthError, DOMException, standard Error, RPC result)
 * into a structured NormalizedError with a sanitized user-facing message and technical diagnostic metadata.
 */
export function normalizeAppError(
  error: unknown,
  contextFallback = 'Ocurrió un error inesperado al procesar la solicitud.'
): NormalizedError {
  if (!error) {
    return {
      kind: 'UNKNOWN',
      userMessage: contextFallback,
      technicalMessage: 'Unknown error (falsy value received)',
      canRetry: true,
    };
  }

  const errObj = (typeof error === 'object' && error !== null ? error : {}) as RawErrorPayload;
  const rawCode = String(errObj.code || errObj.status || errObj.statusCode || '').trim();
  const rawName = String(errObj.name || '').trim();
  const rawMsg = String(
    errObj.message ||
      errObj.error ||
      errObj.error_description ||
      (error instanceof Error ? error.message : typeof error === 'string' ? error : '')
  ).trim();
  const technicalMessage = rawMsg || rawName || `Code: ${rawCode}` || 'Unspecified technical error';

  // 1. TIMEOUT
  if (
    rawCode === 'TIMEOUT' ||
    rawCode === '408' ||
    rawName === 'TimeoutError' ||
    /excedi[oó] el tiempo l[ií]mite|operation timed out|request timed out/i.test(rawMsg)
  ) {
    return {
      kind: 'TIMEOUT',
      code: rawCode || 'TIMEOUT',
      userMessage: 'La operación tardó demasiado tiempo en responder. Por favor verifica tu conexión e intenta nuevamente.',
      technicalMessage,
      details: errObj.details,
      canRetry: true,
    };
  }

  // 2. ABORTED
  if (
    rawName === 'AbortError' ||
    rawCode === 'ABORTED' ||
    /abort(ed)?|operaci[oó]n cancelada/i.test(rawMsg)
  ) {
    return {
      kind: 'ABORTED',
      code: rawCode || 'ABORTED',
      userMessage: 'La solicitud fue cancelada antes de completarse.',
      technicalMessage,
      details: errObj.details,
      canRetry: true,
    };
  }

  // 3. NETWORK ERROR
  if (
    rawName === 'TypeError' &&
    (/fetch|network|failed to fetch/i.test(rawMsg) || !rawMsg) ||
    /failed to fetch|network error|conexi[oó]n perdida|net::err/i.test(rawMsg)
  ) {
    return {
      kind: 'NETWORK_ERROR',
      code: rawCode || 'NETWORK_ERROR',
      userMessage: 'No pudimos conectar con el sistema. Revisa tu conexión a internet e intenta de nuevo.',
      technicalMessage,
      details: errObj.details,
      canRetry: true,
    };
  }

  // 4. FORBIDDEN (403, 42501 RLS / ACL)
  if (
    rawCode === '42501' ||
    rawCode === '403' ||
    rawCode === 'FORBIDDEN' ||
    errObj.status === 403 ||
    errObj.statusCode === 403 ||
    /permission denied|not authorized|violates row-level security|acceso denegado/i.test(rawMsg)
  ) {
    const fallback = 'No tienes los permisos necesarios para realizar esta acción o consultar estos registros.';
    const cleanUserMsg = sanitizeUserMessage(rawMsg, fallback);
    return {
      kind: 'FORBIDDEN',
      code: rawCode || '42501',
      status: 403,
      userMessage: cleanUserMsg,
      technicalMessage,
      details: errObj.details,
      canRetry: false,
    };
  }

  // 5. UNAUTHORIZED (401, JWT expired/missing)
  if (
    rawCode === '401' ||
    rawCode === 'PGRST301' ||
    errObj.status === 401 ||
    errObj.statusCode === 401 ||
    /jwt|token|sesi[oó]n expirada|not authenticated|invalido|auth/i.test(rawMsg) &&
      !/p0001|check/i.test(rawCode)
  ) {
    return {
      kind: 'UNAUTHORIZED',
      code: rawCode || '401',
      status: 401,
      userMessage: 'Tu sesión ha expirado o no estás autenticado. Por favor inicia sesión nuevamente.',
      technicalMessage,
      details: errObj.details,
      canRetry: false,
    };
  }

  // 6. CONFLICT (409, 23505 Unique Violation)
  if (
    rawCode === '23505' ||
    rawCode === '409' ||
    rawCode === 'CONFLICT' ||
    errObj.status === 409 ||
    /duplicate key|unique constraint|ya existe/i.test(rawMsg)
  ) {
    const fallback = 'Ya existe un registro con estos datos o la operación ya fue realizada previamente.';
    const cleanUserMsg = sanitizeUserMessage(rawMsg, fallback);
    return {
      kind: 'CONFLICT',
      code: rawCode || '23505',
      status: 409,
      userMessage: cleanUserMsg,
      technicalMessage,
      details: errObj.details,
      canRetry: false,
    };
  }

  // 7. NOT FOUND (404, P0002, PGRST116)
  if (
    rawCode === 'P0002' ||
    rawCode === 'PGRST116' ||
    rawCode === '404' ||
    rawCode === 'NOT_FOUND' ||
    errObj.status === 404 ||
    /not found|no encontrado|no rows/i.test(rawMsg)
  ) {
    const fallback = 'El registro solicitado no fue encontrado o ya no está disponible.';
    const cleanUserMsg = sanitizeUserMessage(rawMsg, fallback);
    return {
      kind: 'NOT_FOUND',
      code: rawCode || '404',
      status: 404,
      userMessage: cleanUserMsg,
      technicalMessage,
      details: errObj.details,
      canRetry: false,
    };
  }

  // 8. VALIDATION ERROR (400, P0001 PostgreSQL RAISE EXCEPTION, 23514 check, 23502 not null, 23503 foreign key)
  if (
    rawCode === 'P0001' ||
    rawCode === '23514' ||
    rawCode === '23502' ||
    rawCode === '23503' ||
    rawCode === '400' ||
    rawCode === 'VALIDATION_ERROR' ||
    rawCode === 'INVALID_STATE' ||
    rawCode === 'INTEGRITY_ERROR' ||
    errObj.status === 400
  ) {
    // If it's a clean Spanish business validation message, sanitize and present it safely
    const cleanBusinessMsg = sanitizeUserMessage(
      rawMsg,
      'Los datos proporcionados no cumplen con los requisitos de validación.'
    );
    return {
      kind: 'VALIDATION_ERROR',
      code: rawCode,
      status: 400,
      userMessage: cleanBusinessMsg,
      technicalMessage,
      details: errObj.details,
      canRetry: true,
    };
  }

  // 9. SERVER ERROR (500, 5xx, PostgreSQL system codes 5xxxx, XXxxx)
  if (
    (typeof errObj.status === 'number' && errObj.status >= 500 && errObj.status < 600) ||
    /^5\d{2}$/.test(rawCode) ||
    /^(XX|58|53|54)/.test(rawCode)
  ) {
    return {
      kind: 'SERVER_ERROR',
      code: rawCode || '500',
      status: 500,
      userMessage: 'Ocurrió un problema temporal en el sistema. Por favor intenta de nuevo en unos minutos.',
      technicalMessage,
      details: errObj.details,
      canRetry: true,
    };
  }

  // 10. UNKNOWN / GENERIC FALLBACK
  const sanitizedFallback = sanitizeUserMessage(rawMsg, contextFallback);
  return {
    kind: 'UNKNOWN',
    code: rawCode || undefined,
    userMessage: sanitizedFallback,
    technicalMessage,
    details: errObj.details,
    canRetry: true,
  };
}

/**
 * Diagnostic logger for application errors. Logs comprehensive diagnostic metadata
 * strictly to the developer console (warn or error level) without exposing internal details to UI views.
 */
export function logAppError(
  context: string,
  error: NormalizedError | unknown,
  extra?: Record<string, unknown>
): void {
  const normalized = (error && typeof error === 'object' && 'kind' in error)
    ? (error as NormalizedError)
    : normalizeAppError(error);

  const payload = {
    context,
    kind: normalized.kind,
    code: normalized.code,
    status: normalized.status,
    technicalMessage: normalized.technicalMessage,
    userMessage: normalized.userMessage,
    canRetry: normalized.canRetry,
    details: normalized.details,
    extra,
    timestamp: new Date().toISOString(),
  };

  if (normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED') {
    console.warn(`[AppAuth][${context}]`, payload);
  } else if (normalized.kind === 'NETWORK_ERROR' || normalized.kind === 'TIMEOUT') {
    console.warn(`[AppNetwork][${context}]`, payload);
  } else {
    console.error(`[AppError][${context}]`, payload);
  }
}

/**
 * Extracts a safe user-friendly message from any error object or exception.
 */
export function getUserFriendlyErrorMessage(
  error: unknown,
  contextFallback = 'Ocurrió un error inesperado al procesar la solicitud.'
): string {
  return normalizeAppError(error, contextFallback).userMessage;
}
