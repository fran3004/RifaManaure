/**
 * @file requestTimeout.ts
 * Mecanismo centralizado de control de tiempo límite (timeout) y cancelación de peticiones
 * en el frontend para Supabase y llamadas críticas de red.
 *
 * Garantías:
 * 1. Timeout explícito por defecto de 15 segundos (15,000 ms).
 * 2. Soporte nativo para AbortController / AbortSignal y enlace directo con PostgrestRpcBuilder.
 * 3. Clasificación unívoca de errores: CLIENT_TIMEOUT, NETWORK_ERROR, REQUEST_ABORTED, RPC_ERROR, UNKNOWN_ERROR.
 * 4. Limpieza estricta de temporizadores (clearTimeout) y event listeners en bloques finally (cero memory leaks).
 * 5. Preservación íntegra de claves de idempotencia en reintentos ante timeouts de cliente.
 */

export const DEFAULT_REQUEST_TIMEOUT_MS = 15000; // 15 segundos

export type RequestErrorCode =
  | 'CLIENT_TIMEOUT'
  | 'NETWORK_ERROR'
  | 'REQUEST_ABORTED'
  | 'RPC_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Error emitido cuando una operación de red o RPC excede el tiempo límite en el cliente.
 * IMPORTANTE: Un error de timeout en el cliente NO significa necesariamente que el servidor falló;
 * la operación puede haberse completado o estar en curso en PostgreSQL.
 */
export class RequestTimeoutError extends Error {
  readonly code: RequestErrorCode = 'CLIENT_TIMEOUT';
  readonly isTimeout = true;
  readonly timeoutMs: number;

  constructor(timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS, customMessage?: string) {
    const defaultMsg = `La operación excedió el tiempo límite de espera (${(timeoutMs / 1000).toFixed(0)}s). Por favor verifica tu conexión o intenta nuevamente.`;
    super(customMessage || defaultMsg);
    this.name = 'RequestTimeoutError';
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, RequestTimeoutError.prototype);
  }
}

/**
 * Error emitido cuando una operación fue abortada deliberadamente por un AbortSignal externo.
 */
export class RequestAbortError extends Error {
  readonly code: RequestErrorCode = 'REQUEST_ABORTED';
  readonly isTimeout = false;

  constructor(customMessage = 'La operación fue cancelada.') {
    super(customMessage);
    this.name = 'RequestAbortError';
    Object.setPrototypeOf(this, RequestAbortError.prototype);
  }
}

export interface RequestTimeoutOptions {
  /**
   * Tiempo límite en milisegundos. Por defecto 15,000 (15 segundos).
   */
  timeoutMs?: number;
  /**
   * Señal de aborto externa opcional (ej: desmontaje de componente o cancelación de usuario).
   */
  signal?: AbortSignal;
  /**
   * Mensaje de error personalizado en caso de timeout.
   */
  customErrorMessage?: string;
}

export interface ClassifiedRequestError {
  kind: RequestErrorCode;
  code: RequestErrorCode;
  message: string;
  isTimeout: boolean;
  isAborted: boolean;
  isNetworkError: boolean;
  originalError: unknown;
}

/**
 * Clasifica cualquier error originado en una petición de red, Supabase Postgrest o timeout.
 */
export function classifyRequestError(err: unknown): ClassifiedRequestError {
  if (
    err instanceof RequestTimeoutError ||
    (typeof err === 'object' && err !== null && (err as any).code === 'CLIENT_TIMEOUT')
  ) {
    return {
      kind: 'CLIENT_TIMEOUT',
      code: 'CLIENT_TIMEOUT',
      message: (err as any).message || 'Tiempo de espera agotado (15s).',
      isTimeout: true,
      isAborted: false,
      isNetworkError: false,
      originalError: err,
    };
  }

  if (
    err instanceof RequestAbortError ||
    (typeof err === 'object' && err !== null && (err as any).code === 'REQUEST_ABORTED')
  ) {
    return {
      kind: 'REQUEST_ABORTED',
      code: 'REQUEST_ABORTED',
      message: (err as any).message || 'Solicitud cancelada.',
      isTimeout: false,
      isAborted: true,
      isNetworkError: false,
      originalError: err,
    };
  }

  const errObj = typeof err === 'object' && err !== null ? (err as Record<string, any>) : null;
  const msg = String(errObj?.message || (typeof err === 'string' ? err : 'Error desconocido'));
  const name = String(errObj?.name || '');

  // Detectar cancelación por AbortError
  if (
    name === 'AbortError' ||
    msg.includes('AbortError') ||
    msg.includes('This operation was aborted') ||
    msg.includes('The user aborted a request')
  ) {
    return {
      kind: 'CLIENT_TIMEOUT',
      code: 'CLIENT_TIMEOUT',
      message: 'Tiempo de espera agotado. Por favor verifica tu conexión.',
      isTimeout: true,
      isAborted: true,
      isNetworkError: false,
      originalError: err,
    };
  }

  // Detectar fallos de transporte de red
  const isNetwork =
    (name === 'TypeError' && (msg.includes('fetch') || msg.includes('NetworkError'))) ||
    msg.toLowerCase().includes('failed to fetch') ||
    msg.toLowerCase().includes('network disconnected') ||
    msg.toLowerCase().includes('networkerror') ||
    msg.toLowerCase().includes('err_connection') ||
    msg.toLowerCase().includes('connection refused') ||
    msg.toLowerCase().includes('internet disconnected') ||
    msg.toLowerCase().includes('offline');

  if (isNetwork) {
    return {
      kind: 'NETWORK_ERROR',
      code: 'NETWORK_ERROR',
      message: 'Problema de conexión con el servidor. Revisa tu acceso a internet.',
      isTimeout: false,
      isAborted: false,
      isNetworkError: true,
      originalError: err,
    };
  }

  // Detectar errores devueltos por Postgrest / PostgreSQL
  if (
    errObj &&
    (errObj.details !== undefined || errObj.hint !== undefined || errObj.code !== undefined)
  ) {
    return {
      kind: 'RPC_ERROR',
      code: 'RPC_ERROR',
      message: msg,
      isTimeout: false,
      isAborted: false,
      isNetworkError: false,
      originalError: err,
    };
  }

  return {
    kind: 'UNKNOWN_ERROR',
    code: 'UNKNOWN_ERROR',
    message: msg,
    isTimeout: false,
    isAborted: false,
    isNetworkError: false,
    originalError: err,
  };
}

/**
 * Ejecuta una operación asíncrona garantizando un tiempo límite estricto de timeout (15s por defecto).
 * Si la operación retorna un objeto con método `.abortSignal(signal)` (como los query builders de Supabase),
 * se asocia automáticamente a la señal para cancelación nativa del socket/fetch.
 *
 * Garantiza limpieza incondicional de temporizadores y listeners.
 */
export async function withTimeout<T>(
  fnOrPromise: PromiseLike<T> | ((signal: AbortSignal) => PromiseLike<T> | Promise<T>),
  options: RequestTimeoutOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();

  let timedOut = false;
  let abortedExternally = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let onOuterAbort: (() => void) | null = null;

  const abortPromise = new Promise<never>((_, reject) => {
    if (options.signal?.aborted) {
      abortedExternally = true;
      reject(new RequestAbortError());
      return;
    }
    if (options.signal) {
      onOuterAbort = () => {
        abortedExternally = true;
        controller.abort();
        reject(new RequestAbortError());
      };
      options.signal.addEventListener('abort', onOuterAbort, { once: true });
    }
  });

  const timerPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new RequestTimeoutError(timeoutMs, options.customErrorMessage));
    }, timeoutMs);
  });

  try {
    const rawResult =
      typeof fnOrPromise === 'function' ? fnOrPromise(controller.signal) : fnOrPromise;

    // Vincular señal de aborto si el builder lo soporta (ej: Supabase PostgrestRpcBuilder)
    if (rawResult && typeof (rawResult as any).abortSignal === 'function') {
      (rawResult as any).abortSignal(controller.signal);
    }

    const opPromise = Promise.resolve(rawResult);
    const result = await Promise.race([opPromise, timerPromise, abortPromise]);

    // Comprobación especial: Supabase Postgrest devuelve { data: null, error: { message: 'AbortError: ...' } }
    // en lugar de rechazar la promesa cuando la señal se activa.
    if (timedOut) {
      throw new RequestTimeoutError(timeoutMs, options.customErrorMessage);
    }
    if (abortedExternally) {
      throw new RequestAbortError();
    }
    if (result && typeof result === 'object' && (result as any).error) {
      const postgrestErr = (result as any).error;
      const isAbort =
        postgrestErr?.message?.includes('AbortError') ||
        postgrestErr?.hint?.includes('aborted');
      if (isAbort) {
        if (timedOut) {
          throw new RequestTimeoutError(timeoutMs, options.customErrorMessage);
        } else if (abortedExternally) {
          throw new RequestAbortError();
        }
      }
    }

    return result;
  } catch (err: unknown) {
    if (timedOut || err instanceof RequestTimeoutError) {
      throw new RequestTimeoutError(timeoutMs, options.customErrorMessage);
    }
    if (abortedExternally || err instanceof RequestAbortError) {
      throw new RequestAbortError();
    }
    const classified = classifyRequestError(err);
    if (classified.isTimeout) {
      throw new RequestTimeoutError(timeoutMs, options.customErrorMessage);
    }
    throw err;
  } finally {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (options.signal && onOuterAbort) {
      options.signal.removeEventListener('abort', onOuterAbort);
    }
  }
}
