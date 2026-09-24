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

  // Entornos locales de desarrollo
  const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  // Vercel previews y producción
  const isVercel =
    (origin.endsWith(".vercel.app") && origin.startsWith("https://")) ||
    origin === "https://rifa-manaure.vercel.app";

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

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // 1. Manejo de preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Método no permitido. Solo se admite POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 2. Extraer y validar Bearer Token del solicitante
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Acceso no autorizado: Bearer token de sesión no suministrado.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Configuración del servidor incompleta: variables de Supabase ausentes.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Cliente con contexto de usuario (para validar sesión y permisos)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Sesión inválida o expirada. Por favor inicia sesión nuevamente.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Leer y validar payload
    const body = await req.json().catch(() => ({}));
    const { email, role = "admin", fullName, redirectTo } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ success: false, error: "El correo electrónico es inválido o no fue suministrado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validRoles = ["superadmin", "admin", "auditor"];
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ success: false, error: `El rol '${role}' no es válido. Roles permitidos: ${validRoles.join(", ")}.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = typeof fullName === "string" ? fullName.trim() : null;

    // 5. Cliente privilegiado del sistema
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 6. Verificar permisos del llamante en public.admin_users
    const { data: callerAdmin, error: callerError } = await supabaseAdmin
      .from("admin_users")
      .select("role, is_active")
      .or(`user_id.eq.${user.id},email.eq.${user.email?.toLowerCase()}`)
      .eq("is_active", true)
      .maybeSingle();

    if (callerError || !callerAdmin) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Acceso denegado: tu cuenta no tiene permisos de administrador activos.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (callerAdmin.role === "auditor") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Acceso denegado: los auditores no tienen permiso para invitar administradores.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (role === "superadmin" && callerAdmin.role !== "superadmin") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Solo un Superadministrador puede otorgar el rol de Superadmin.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Pre-autorizar en la base de datos invocando la RPC admin_invite_user
    // Esto asegura que se apliquen todas las restricciones de unicidad y bitácora de auditoría
    const { data: rpcResult, error: rpcError } = await userClient.rpc("admin_invite_user", {
      p_email: cleanEmail,
      p_role: role,
      p_full_name: cleanName,
    });

    if (rpcError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: rpcError.message || "Error al pre-autorizar administrador en la base de datos.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!rpcResult?.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: rpcResult?.error || "No fue posible registrar la pre-autorización.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Determinar URL de redirección para cuando el usuario haga clic en el email
    const reqOrigin = req.headers.get("origin") || "";
    let defaultRedirect = "https://rifa-manaure.vercel.app/admin/set-password";
    if (reqOrigin.includes("localhost") || reqOrigin.includes("127.0.0.1")) {
      defaultRedirect = `${reqOrigin}/admin/set-password`;
    } else if (reqOrigin) {
      defaultRedirect = `${reqOrigin}/admin/set-password`;
    }

    const finalRedirectTo = redirectTo || defaultRedirect;

    // 9. Enviar invitación por correo a través de Supabase Admin Auth API
    let emailSent = false;
    let userAlreadyExists = false;
    let warningMessage: string | null = null;

    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      cleanEmail,
      {
        redirectTo: finalRedirectTo,
        data: {
          full_name: cleanName || "",
          assigned_role: role,
        },
      }
    );

    if (inviteError) {
      const errLower = inviteError.message?.toLowerCase() || "";
      if (
        errLower.includes("already registered") ||
        errLower.includes("already exists") ||
        errLower.includes("already been registered")
      ) {
        userAlreadyExists = true;
        emailSent = false;
      } else {
        console.error("[admin-invite-user] Error al enviar invitación por email:", inviteError);
        warningMessage = `El usuario quedó pre-autorizado en la base de datos, pero el servicio de correo reportó: ${inviteError.message}.`;
      }
    } else {
      emailSent = true;
    }

    const responsePayload = {
      success: true,
      user: rpcResult.user,
      emailSent,
      userAlreadyExists,
      warning: warningMessage,
      message: emailSent
        ? `Se ha enviado un correo oficial de invitación a ${cleanEmail} con un enlace para que cree su contraseña.`
        : userAlreadyExists
        ? `El usuario ${cleanEmail} ya cuenta con registro en Supabase Auth y fue autorizado como ${role.toUpperCase()}. Puede ingresar con su contraseña actual.`
        : warningMessage || "Administrador pre-autorizado exitosamente.",
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Error inesperado en Edge Function";
    console.error("[admin-invite-user] Error crítico:", err);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
