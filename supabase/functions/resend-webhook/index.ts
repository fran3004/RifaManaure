import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { Webhook } from "https://esm.sh/svix@1.15.0";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("RESEND_WEBHOOK_SECRET no está configurado en los secretos de Supabase.");
      return new Response(
        JSON.stringify({ success: false, error: "Servicio de webhook no configurado en el servidor." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Verificación criptográfica obligatoria de firma Svix
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response(
        JSON.stringify({ success: false, error: "Cabeceras Svix faltantes en el webhook de Resend." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      const wh = new Webhook(webhookSecret);
      wh.verify(rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch (verifyError: unknown) {
      const verifyMsg = verifyError instanceof Error ? verifyError.message : "Firma inválida";
      return new Response(
        JSON.stringify({ success: false, error: `Firma de webhook inválida: ${verifyMsg}` }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: { type?: string; data?: { email_id?: string; id?: string } } | null = null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Payload JSON malformado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body || !body.type || !body.data) {
      return new Response(
        JSON.stringify({ success: false, error: "Payload de webhook inválido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { type, data } = body;
    const emailId = data.email_id || data.id;

    if (!emailId) {
      return new Response(
        JSON.stringify({ success: true, message: "Evento ignorado (sin identificador de email)." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Mapear eventos de Resend a estados de notification_logs
    let newStatus: string | null = null;
    switch (type) {
      case "email.sent":
        newStatus = "sent";
        break;
      case "email.delivered":
        newStatus = "delivered";
        break;
      case "email.bounced":
        newStatus = "bounced";
        break;
      case "email.complained":
        newStatus = "complained";
        break;
      case "email.failed":
        newStatus = "failed";
        break;
      default:
        console.log(`Evento de Resend recibido (${type}) no requiere actualización de estado en notification_logs.`);
        newStatus = null;
    }

    if (newStatus) {
      // Actualizar registro de notificación de forma idempotente
      const { error } = await supabase
        .from("notification_logs")
        .update({
          status: newStatus,
          metadata: {
            last_webhook_event: type,
            webhook_payload: data,
            received_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("resend_email_id", emailId);

      if (error) {
        console.error("Error al actualizar notification_logs por webhook:", error.message);
        return new Response(
          JSON.stringify({ success: false, error: "Error al actualizar estado en base de datos." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, event: type, emailId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al procesar webhook";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
