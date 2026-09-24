import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

/**
 * Supabase Edge Function: cron-release-expired-reservations
 * 
 * PROPÓSITO:
 * Endpoint de contingencia (Break-Glass) para la liberación periódica de reservas expiradas.
 * El programador primario de producción es pg_cron (cada 5 minutos dentro de PostgreSQL).
 * 
 * REGLAS DE SEGURIDAD (AUDITORÍA 05 - REMEDIACIÓN 5):
 * 1. Solo admite el método POST (Rechaza GET y otros con 405 Method Not Allowed).
 * 2. Autenticación estricta: Requiere el secreto dedicado CRON_SECRET vía header `Authorization: Bearer <CRON_SECRET>` o `x-cron-secret: <CRON_SECRET>`.
 * 3. Prohibición de SERVICE_ROLE_KEY como credencial HTTP: El token recibido NO debe coincidir con SUPABASE_SERVICE_ROLE_KEY para evitar filtraciones de credenciales maestras.
 * 4. Sin CORS de navegador: No expone cabeceras permisivas ni es consumible desde el frontend web.
 * 5. Cero filtración de secretos: Nunca registra ni devuelve el valor de tokens o secretos.
 * 6. Idempotencia: Invoca el procedimiento atómico `public.release_expired_reservations()`.
 */

serve(async (req: Request) => {
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const cronSecret = Deno.env.get("CRON_SECRET");

    // 2. VERIFICACIÓN DE CONFIGURACIÓN DEL SERVIDOR
    if (!cronSecret) {
      console.error("[CRON_CONTINGENCY] Error: La variable de entorno CRON_SECRET no está configurada.");
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
      console.error("[CRON_CONTINGENCY] Error: Credenciales de infraestructura Supabase ausentes.");
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
      console.warn("[CRON_CONTINGENCY] Intento de acceso rechazado: Se utilizó SUPABASE_SERVICE_ROLE_KEY en lugar de CRON_SECRET.");
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase.rpc("release_expired_reservations");

    if (error) {
      console.error("[CRON_CONTINGENCY] Error al ejecutar release_expired_reservations:", error.message);
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
    console.error("[CRON_CONTINGENCY] Excepción no controlada:", errorMsg);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Error interno inesperado en el servicio de contingencia.",
        code: "INTERNAL_SERVER_ERROR",
      }),
      { status: 500, headers: standardHeaders }
    );
  }
});
