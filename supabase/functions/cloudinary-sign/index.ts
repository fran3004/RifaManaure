import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const requestHeaders = req.headers.get("access-control-request-headers");

  const allowedOrigins = [
    "https://rifa-manaure.vercel.app",
    "https://manaurevive.com",
    "https://www.manaurevive.com",
  ];

  // Entornos de desarrollo locales (cualquier puerto en localhost o 127.0.0.1)
  const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  // Despliegues en Vercel (producción, ramas de preview, pull requests)
  const isVercel =
    (origin.endsWith(".vercel.app") && origin.startsWith("https://")) ||
    origin === "https://rifa-manaure.vercel.app";

  // Orígenes adicionales configurados en secretos
  const envOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const isAllowed =
    allowedOrigins.includes(origin) ||
    isLocalhost ||
    isVercel ||
    envOrigins.includes(origin);

  const allowOrigin = isAllowed ? origin : (origin || "https://rifa-manaure.vercel.app");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      requestHeaders ||
      "authorization, x-client-info, apikey, content-type, x-supabase-auth, accept, prefer, *",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Calcula el hash SHA-1 hexadecimal requerido por la firma de Cloudinary usando Web Crypto API.
 */
async function generateSha1(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // Manejo de preflight CORS OPTIONS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Restricción a método POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Método no permitido. Solo se admite POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Validar presencia de Authorization / Bearer token
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Acceso no autorizado: Bearer token de autenticación no suministrado.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Validar variables de entorno de Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Configuración del servidor incompleta: variables de Supabase no disponibles.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Validar variables de entorno secretas de Cloudinary (nunca expuestas al cliente)
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "";
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY") || "";
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET") || "";

    if (!cloudName || !apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Configuración del servidor incompleta: secretos de Cloudinary no configurados.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Autenticar usuario con su JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Sesión inválida o expirada. Por favor inicie sesión nuevamente.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Verificar si el usuario tiene rol de administrador activo (is_admin)
    let isAdmin = false;

    const { data: rpcIsAdmin, error: rpcError } = await userClient.rpc("is_admin");
    if (!rpcError && typeof rpcIsAdmin === "boolean") {
      isAdmin = rpcIsAdmin;
    } else if (supabaseServiceKey) {
      // Verificación de respaldo mediante service_role en admin_users
      const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const cleanEmail = user.email ? user.email.trim().toLowerCase() : "";
      const { data: adminRow } = await adminClient
        .from("admin_users")
        .select("id")
        .or(`user_id.eq.${user.id}${cleanEmail ? `,email.eq.${cleanEmail}` : ""}`)
        .eq("is_active", true)
        .maybeSingle();

      isAdmin = Boolean(adminRow);
    }

    if (!isAdmin) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Acceso denegado: se requieren permisos de administrador activos.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Parsear y validar cuerpo de la petición (JSON)
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Cuerpo de solicitud inválido. Debe ser un objeto JSON válido.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const action = body.action;
    if (action !== "upload" && action !== "destroy") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Acción no permitida o no especificada. Debe ser 'upload' o 'destroy'.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generar timestamp en segundos (estándar Cloudinary)
    const timestamp =
      typeof body.timestamp === "number" && Number.isInteger(body.timestamp) && body.timestamp > 0
        ? body.timestamp
        : Math.floor(Date.now() / 1000);

    // 7. Generación de firma según la acción solicitada
    if (action === "upload") {
      const folder = typeof body.folder === "string" ? body.folder.trim() : "";
      if (!folder) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "El parámetro 'folder' es obligatorio para la acción 'upload'.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parámetros ordenados alfabéticamente: folder antes que timestamp
      // Regla de Cloudinary: "folder=<folder>&timestamp=<timestamp><api_secret>"
      const stringToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
      const signature = await generateSha1(stringToSign);

      return new Response(
        JSON.stringify({
          success: true,
          action: "upload",
          signature,
          timestamp,
          folder,
          api_key: apiKey,
          cloud_name: cloudName,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "destroy") {
      const publicId = typeof body.public_id === "string" ? body.public_id.trim() : "";
      if (!publicId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "El parámetro 'public_id' es obligatorio para la acción 'destroy'.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parámetros ordenados alfabéticamente: public_id antes que timestamp
      // Regla de Cloudinary: "public_id=<public_id>&timestamp=<timestamp><api_secret>"
      const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
      const signature = await generateSha1(stringToSign);

      return new Response(
        JSON.stringify({
          success: true,
          action: "destroy",
          signature,
          timestamp,
          public_id: publicId,
          api_key: apiKey,
          cloud_name: cloudName,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Acción no manejada." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error inesperado al generar firma de Cloudinary";
    console.error("Error fatal en Edge Function cloudinary-sign:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
