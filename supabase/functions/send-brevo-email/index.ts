import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { generateTransactionalEmail } from "./emailTemplates.ts";

/**
 * ==============================================================================
 * SUPABASE EDGE FUNCTION: send-brevo-email
 * ==============================================================================
 * Gateway backend centralizado y seguro para el despacho de correos transaccionales
 * de RifaManaure mediante la API REST de Brevo (Sendinblue).
 *
 * ARQUITECTURA DE SEGURIDAD E INTEGRIDAD:
 * 1. La API Key de Brevo (BREVO_API_KEY) existe exclusivamente en secretos de servidor.
 * 2. Cero confianza en datos financieros enviados por el cliente web: el comprador,
 *    monto, rifa, boletos y estado se recuperan autoritativamente desde PostgreSQL.
 * 3. Para eventos administrativos (payment_approved, payment_rejected), se valida
 *    estrictamente la sesión y privilegios de administrador del invocador vía JWT.
 * 4. Para payment_approved, se exige que la orden se encuentre en estado 'paid'.
 * 5. Para payment_rejected, se exige que la orden se encuentre en estado 'rejected'.
 * 6. Idempotencia estricta por clave 'email-{eventType}-{orderId}'.
 * 7. Trazabilidad completa en la tabla 'notification_logs'.
 * 8. Fallo controlado: Si Brevo presenta incidencias, se registra el fallo sin revertir
 *    ni comprometer la aprobación financiera del pago en PostgreSQL.
 * 9. Plantillas de correo oficiales con la identidad visual completa de Manaure Vive.
 * ==============================================================================
 */

// Tipos de eventos canónicos soportados
const EVENT_PAYMENT_APPROVED = "payment_approved";
const EVENT_PAYMENT_REJECTED = "payment_rejected";
const EVENT_PAYMENT_RECEIVED = "payment_received";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_REQUEST_TIMEOUT_MS = 12000;

/**
 * Encabezados CORS seguros con soporte dinámico de orígenes permitidos.
 */
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const requestHeaders = req.headers.get("access-control-request-headers");

  const allowedOrigins = [
    "https://rifa-manaure.vercel.app",
    "https://manaurevive.com",
    "https://www.manaurevive.com",
  ];

  const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
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

/**
 * Configuración centralizada de variables de entorno y secretos del servidor.
 */
interface ServerConfig {
  brevoApiKey: string;
  brevoSenderEmail: string;
  brevoSenderName: string;
  brevoReplyToEmail: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
}

function getServerConfig(): ServerConfig {
  return {
    brevoApiKey: Deno.env.get("BREVO_API_KEY") || "",
    brevoSenderEmail: Deno.env.get("BREVO_SENDER_EMAIL") || "notificaciones@rifamanaure.com",
    brevoSenderName: Deno.env.get("BREVO_SENDER_NAME") || "Manaure Vive",
    brevoReplyToEmail: Deno.env.get("BREVO_REPLY_TO_EMAIL") || "",
    supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
    supabaseAnonKey: Deno.env.get("SUPABASE_ANON_KEY") || "",
    supabaseServiceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  };
}

/**
 * Contrato recibido en el cuerpo de la petición.
 */
interface SendEmailRequestBody {
  orderId: string;
  eventType: "payment_received" | "payment_approved" | "payment_rejected";
  receiptPngBase64?: string;
  receiptFileName?: string;
  siteUrl?: string;
  isRetry?: boolean;
}

/**
 * Función principal del servidor Deno.
 */
serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // 1. Manejo de preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 2. Restricción estricta a método POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Método no permitido. Solo se admite el método POST.",
      }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const config = getServerConfig();

  // 3. Verificación de configuración básica del servidor Supabase
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Configuración incompleta: credenciales de Supabase no disponibles en el servidor.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: SendEmailRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Cuerpo de solicitud inválido: se esperaba un objeto JSON válido.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { orderId, eventType, receiptPngBase64, receiptFileName, isRetry } = body || {};

  // 4. Validación de campos obligatorios
  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "El parámetro 'orderId' es obligatorio y debe ser una cadena válida.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const cleanEventType = (eventType || "").trim().toLowerCase();
  const validEventTypes = [
    EVENT_PAYMENT_APPROVED,
    EVENT_PAYMENT_REJECTED,
    EVENT_PAYMENT_RECEIVED,
  ];

  if (!validEventTypes.includes(cleanEventType)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `El parámetro 'eventType' no es válido. Debe ser uno de: ${validEventTypes.join(", ")}.`,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 5. Autenticación y Autorización por JWT
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  // Cliente con permisos de servicio autoritativos para consultas PostgreSQL y logs
  const adminClient = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Para eventos administrativos (aprobación y rechazo), el token y rol de administrador son obligatorios
  if (cleanEventType === EVENT_PAYMENT_APPROVED || cleanEventType === EVENT_PAYMENT_REJECTED) {
    if (!token) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Acceso no autorizado: Bearer token de sesión no suministrado.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(config.supabaseUrl, config.supabaseAnonKey || config.supabaseServiceKey, {
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

    // Verificar si el usuario es administrador activo
    let isAdmin = false;
    const { data: rpcIsAdmin, error: rpcError } = await userClient.rpc("is_admin");
    if (!rpcError && typeof rpcIsAdmin === "boolean") {
      isAdmin = rpcIsAdmin;
    } else {
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
          error: "Acceso denegado: se requieren privilegios de administrador para ejecutar este evento.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // 6. Cero confianza en datos enviados por el cliente: Recuperar datos autoritativos desde PostgreSQL
  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select(`
      id,
      reference,
      total_amount,
      ticket_count,
      status,
      payment_method,
      contact_preference,
      created_at,
      verified_at,
      rejection_reason,
      buyer:buyers!orders_buyer_id_fkey(
        id,
        full_name,
        document_id,
        phone,
        email,
        city
      ),
      raffle:raffles!orders_raffle_id_fkey(
        id,
        title,
        draw_date,
        lottery_reference,
        ticket_price
      )
    `)
    .eq("id", orderId.trim())
    .maybeSingle();

  if (orderError || !order) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "La orden especificada no fue encontrada en la base de datos.",
      }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validar consistencia de estado de la orden
  if (cleanEventType === EVENT_PAYMENT_APPROVED && order.status !== "paid") {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Estado de orden no válido para notificación de aprobación: la orden debe estar 'paid' pero se encuentra en '${order.status}'.`,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (cleanEventType === EVENT_PAYMENT_REJECTED && order.status !== "rejected") {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Estado de orden no válido para notificación de rechazo: la orden debe estar 'rejected' pero se encuentra en '${order.status}'.`,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 7. Recuperar boletos oficiales asignados a la orden
  const { data: ticketsData } = await adminClient
    .from("tickets")
    .select("number")
    .eq("order_id", order.id);

  const ticketNumbers = (ticketsData || []).map((t) => t.number).sort();

  // Extraer datos validados del comprador y rifa
  const buyer = order.buyer as any;
  const raffle = order.raffle as any;

  const buyerEmail = buyer?.email ? String(buyer.email).trim() : "";
  const idempotencyKey = `email-${cleanEventType}-${order.id}`;

  if (!buyerEmail || !buyerEmail.includes("@")) {
    const errorMsg = "El comprador asociado a la orden no cuenta con un correo electrónico válido.";
    await adminClient.from("notification_logs").upsert(
      {
        order_id: order.id,
        event_type: cleanEventType,
        channel: "email",
        recipient: buyerEmail || "Sin correo",
        status: "failed",
        attempts: 1,
        error_message: errorMsg,
        idempotency_key: idempotencyKey,
        metadata: {
          error: errorMsg,
          reference: order.reference,
        },
      },
      { onConflict: "idempotency_key" }
    );

    return new Response(
      JSON.stringify({
        success: false,
        eventType: cleanEventType,
        channel: "email",
        status: "failed",
        error: errorMsg,
        idempotencyKey,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 8. Idempotencia: Verificar si ya fue enviado exitosamente
  const { data: existingLog } = await adminClient
    .from("notification_logs")
    .select("id, status, attempts, metadata")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (
    existingLog &&
    (existingLog.status === "sent" || existingLog.status === "delivered") &&
    !isRetry
  ) {
    return new Response(
      JSON.stringify({
        success: true,
        eventType: cleanEventType,
        channel: "email",
        status: "skipped",
        messageId: (existingLog.metadata as any)?.messageId,
        idempotencyKey,
        message: "Notificación de correo ya enviada previamente (idempotente).",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 9. Verificar presencia del secreto de Brevo
  if (!config.brevoApiKey) {
    const errorMsg = "Servicio de correo transaccional no configurado: BREVO_API_KEY no definida.";
    console.error(`[send-brevo-email] Error crítico: ${errorMsg}`);

    await adminClient.from("notification_logs").upsert(
      {
        order_id: order.id,
        event_type: cleanEventType,
        channel: "email",
        recipient: buyerEmail,
        status: "failed",
        attempts: (existingLog?.attempts || 0) + 1,
        error_message: errorMsg,
        idempotency_key: idempotencyKey,
        metadata: {
          error: errorMsg,
          reference: order.reference,
        },
      },
      { onConflict: "idempotency_key" }
    );

    return new Response(
      JSON.stringify({
        success: false,
        eventType: cleanEventType,
        channel: "email",
        status: "failed",
        error: errorMsg,
        idempotencyKey,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 10. Construcción de plantilla y adjuntos con identidad visual oficial
  const hasAttachment = Boolean(
    cleanEventType === EVENT_PAYMENT_APPROVED &&
      receiptPngBase64 &&
      typeof receiptPngBase64 === "string" &&
      receiptPngBase64.trim().length > 0
  );

  // Resolución no hardcodeada de la URL del portal
  const origin = req.headers.get("origin") || "";
  const envSiteUrl = Deno.env.get("SITE_URL") || Deno.env.get("VITE_SITE_URL") || "";
  const siteUrl = (body.siteUrl || origin || envSiteUrl || "https://manaurevive.com").replace(/\/$/, "");

  const { subject, htmlContent, textContent } = generateTransactionalEmail({
    eventType: cleanEventType as "payment_approved" | "payment_rejected" | "payment_received",
    order: {
      id: order.id,
      reference: order.reference,
      totalAmount: order.total_amount,
      ticketCount: order.ticket_count,
      status: order.status,
      rejectionReason: order.rejection_reason,
      confirmedAt: order.verified_at,
      paymentMethod: order.payment_method,
    },
    buyer: {
      fullName: buyer?.full_name || "Comprador",
      documentId: buyer?.document_id,
      phone: buyer?.phone,
      email: buyerEmail,
      city: buyer?.city,
    },
    raffle: {
      title: raffle?.title || "Gran Rifa Manaure",
      drawDate: raffle?.draw_date,
      lotteryReference: raffle?.lottery_reference,
    },
    tickets: ticketNumbers,
    siteUrl,
    hasAttachment,
    supportEmail: config.brevoReplyToEmail || "soporte@rifamanaure.com",
  });

  const emailPayload: Record<string, unknown> = {
    sender: {
      name: config.brevoSenderName,
      email: config.brevoSenderEmail,
    },
    to: [
      {
        email: buyerEmail,
        name: buyer?.full_name || "Comprador",
      },
    ],
    subject,
    htmlContent,
    textContent,
  };

  if (config.brevoReplyToEmail && config.brevoReplyToEmail.includes("@")) {
    emailPayload.replyTo = {
      email: config.brevoReplyToEmail.trim(),
    };
  }

  // Procesar adjunto PNG si aplica
  if (hasAttachment && receiptPngBase64) {
    const sanitizedBase64 = receiptPngBase64.replace(/^data:image\/[a-z]+;base64,/, "").trim();
    const fileName =
      receiptFileName && receiptFileName.trim().length > 0
        ? receiptFileName.trim()
        : `comprobante-${order.reference}.png`;

    emailPayload.attachment = [
      {
        content: sanitizedBase64,
        name: fileName,
      },
    ];
  }

  // 11. Despacho HTTP hacia la API de Brevo
  try {
    const brevoResponse = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": config.brevoApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(emailPayload),
      signal: AbortSignal.timeout(BREVO_REQUEST_TIMEOUT_MS),
    });

    const responseText = await brevoResponse.text();
    let brevoData: any = {};
    try {
      brevoData = JSON.parse(responseText);
    } catch {
      brevoData = { rawResponse: responseText };
    }

    if (brevoResponse.ok) {
      const messageId = brevoData.messageId || `brevo-${Date.now()}`;

      // Registro exitoso en trazabilidad
      await adminClient.from("notification_logs").upsert(
        {
          order_id: order.id,
          event_type: cleanEventType,
          channel: "email",
          recipient: buyerEmail,
          status: "sent",
          attempts: (existingLog?.attempts || 0) + 1,
          error_message: null,
          idempotency_key: idempotencyKey,
          metadata: {
            messageId,
            sent_at: new Date().toISOString(),
            reference: order.reference,
            tickets_count: ticketNumbers.length,
            has_attachment: hasAttachment,
          },
        },
        { onConflict: "idempotency_key" }
      );

      return new Response(
        JSON.stringify({
          success: true,
          eventType: cleanEventType,
          channel: "email",
          status: "sent",
          messageId,
          idempotencyKey,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const sanitizedError =
        brevoData?.message ||
        `Error del proveedor Brevo (HTTP ${brevoResponse.status})`;

      console.error(
        `[send-brevo-email] Fallo de envío para orden ${order.id}:`,
        sanitizedError
      );

      // Registro de fallo en trazabilidad
      await adminClient.from("notification_logs").upsert(
        {
          order_id: order.id,
          event_type: cleanEventType,
          channel: "email",
          recipient: buyerEmail,
          status: "failed",
          attempts: (existingLog?.attempts || 0) + 1,
          error_message: sanitizedError,
          idempotency_key: idempotencyKey,
          metadata: {
            error: sanitizedError,
            failed_at: new Date().toISOString(),
            reference: order.reference,
            status_code: brevoResponse.status,
          },
        },
        { onConflict: "idempotency_key" }
      );

      // Respuesta controlada: HTTP 200 con status: 'failed' para evitar que el frontend
      // interprete erróneamente que la aprobación financiera en DB se frustró.
      return new Response(
        JSON.stringify({
          success: false,
          eventType: cleanEventType,
          channel: "email",
          status: "failed",
          error: sanitizedError,
          idempotencyKey,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.message?.includes("timeout");
    const sanitizedError = isTimeout
      ? "Tiempo de espera agotado al conectar con el servidor de correo Brevo."
      : "Error de conexión o red al despachar el correo transaccional.";

    console.error(`[send-brevo-email] Excepción durante el despacho:`, err);

    await adminClient.from("notification_logs").upsert(
      {
        order_id: order.id,
        event_type: cleanEventType,
        channel: "email",
        recipient: buyerEmail,
        status: "failed",
        attempts: (existingLog?.attempts || 0) + 1,
        error_message: sanitizedError,
        idempotency_key: idempotencyKey,
        metadata: {
          error: sanitizedError,
          failed_at: new Date().toISOString(),
          reference: order.reference,
        },
      },
      { onConflict: "idempotency_key" }
    );

    return new Response(
      JSON.stringify({
        success: false,
        eventType: cleanEventType,
        channel: "email",
        status: "failed",
        error: sanitizedError,
        idempotencyKey,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
