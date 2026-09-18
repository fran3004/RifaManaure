import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = [
    "https://manaurevive.com",
    "https://www.manaurevive.com",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:4173",
  ];

  const isVercel = origin.endsWith(".vercel.app") && origin.startsWith("https://");
  const isAllowed = allowedOrigins.includes(origin) || isVercel;

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const cronSecret = Deno.env.get("CRON_SECRET") || Deno.env.get("FUNCTION_SECRET");

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    // 1. Verificación estricta de autorización por Bearer token (CRON_SECRET / SERVICE_ROLE_KEY)
    const isAuthorized = Boolean(
      token && (
        (cronSecret && token === cronSecret) ||
        (supabaseServiceKey && token === supabaseServiceKey)
      )
    );

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Acceso no autorizado: Bearer token de cron inválido o no suministrado.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Variables de entorno de servicio no configuradas." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Invocar el procedimiento seguro de base de datos
    const { data, error } = await supabase.rpc("release_expired_reservations");

    if (error) {
      console.error("Error al ejecutar release_expired_reservations:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const releasedCount = typeof data === "number" ? data : 0;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Liberación de reservas expiradas ejecutada correctamente.",
        tickets_released: releasedCount,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error inesperado en cron de expiración";
    console.error("Error fatal en Edge Function:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
