import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

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
    brevoSenderName: Deno.env.get("BREVO_SENDER_NAME") || "Rifa Manaure Balcón del Cesar",
    brevoReplyToEmail: Deno.env.get("BREVO_REPLY_TO_EMAIL") || "",
    supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
    supabaseAnonKey: Deno.env.get("SUPABASE_ANON_KEY") || "",
    supabaseServiceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  };
}

/**
 * Contrato mínimo recibido en el cuerpo de la petición.
 */
interface SendEmailRequestBody {
  orderId: string;
  eventType: "payment_received" | "payment_approved" | "payment_rejected";
  receiptPngBase64?: string;
  receiptFileName?: string;
  isRetry?: boolean;
}

/**
 * Formatea valores numéricos como moneda en pesos colombianos (COP).
 */
function formatCurrency(amount: number): string {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$ ${amount} COP`;
  }
}

/**
 * Formatea fechas ISO en formato legible en español.
 */
function formatDate(dateIso: string | null | undefined): string {
  if (!dateIso) return "Por definir";
  try {
    const d = new Date(dateIso);
    return new Intl.DateTimeFormat("es-CO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return String(dateIso);
  }
}

/**
 * Genera el contenido HTML y texto plano del correo según el evento transaccional.
 */
function buildEmailTemplates(
  eventType: string,
  order: {
    id: string;
    reference: string;
    total_amount: number;
    rejection_reason?: string | null;
  },
  buyer: {
    full_name: string;
    document_id: string;
    phone: string;
    email: string;
    city: string;
  },
  raffle: {
    title: string;
    draw_date: string;
    lottery_reference: string;
  },
  tickets: string[],
  hasAttachment: boolean
): { subject: string; htmlContent: string; textContent: string } {
  const formattedAmount = formatCurrency(order.total_amount);
  const formattedDrawDate = formatDate(raffle.draw_date);
  const ticketsList = tickets.length > 0 ? tickets.join(", ") : "Sin asignar";

  if (eventType === EVENT_PAYMENT_APPROVED) {
    const subject = `¡Pago Confirmado! Boletos Oficiales - Rifa Manaure (${order.reference})`;

    const ticketBadgesHtml = tickets
      .map(
        (t) =>
          `<span style="display:inline-block;background:#059669;color:#ffffff;font-weight:bold;font-size:16px;padding:6px 12px;margin:4px;border-radius:6px;font-family:monospace;">${t}</span>`
      )
      .join(" ");

    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1e293b;background-color:#f8fafc;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);border:1px solid #e2e8f0;">
    
    <!-- Encabezado -->
    <div style="background:linear-gradient(135deg,#064e3b 0%,#059669 100%);color:#ffffff;padding:32px 24px;text-align:center;">
      <h1 style="margin:0;font-size:24px;letter-spacing:-0.5px;">¡Tu Pago ha sido Aprobado!</h1>
      <p style="margin:8px 0 0 0;font-size:15px;opacity:0.9;">Tus boletos oficiales han sido confirmados exitosamente</p>
    </div>

    <!-- Contenido Principal -->
    <div style="padding:28px 24px;">
      <p style="font-size:16px;margin:0 0 16px 0;">Hola <strong>${buyer.full_name}</strong>,</p>
      <p style="margin:0 0 20px 0;color:#475569;">
        Hemos verificado satisfactoriamente tu pago por valor de <strong>${formattedAmount}</strong> correspondiente a la orden <strong>#${order.reference}</strong>.
      </p>

      <!-- Caja de Boletos -->
      <div style="background:#f1f5f9;border-left:4px solid #059669;border-radius:8px;padding:18px;margin-bottom:24px;">
        <h3 style="margin:0 0 10px 0;font-size:15px;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;">Tus Números de la Suerte:</h3>
        <div style="margin-top:8px;">
          ${ticketBadgesHtml}
        </div>
      </div>

      <!-- Detalles del Sorteo -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:10px 0;color:#64748b;">Rifa:</td>
          <td style="padding:10px 0;font-weight:600;text-align:right;color:#0f172a;">${raffle.title}</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:10px 0;color:#64748b;">Fecha del Sorteo:</td>
          <td style="padding:10px 0;font-weight:600;text-align:right;color:#0f172a;">${formattedDrawDate}</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:10px 0;color:#64748b;">Lotería de Referencia:</td>
          <td style="padding:10px 0;font-weight:600;text-align:right;color:#0f172a;">${raffle.lottery_reference}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#64748b;">Referencia de Orden:</td>
          <td style="padding:10px 0;font-weight:600;text-align:right;color:#059669;">${order.reference}</td>
        </tr>
      </table>

      ${
        hasAttachment
          ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:14px;margin-bottom:24px;font-size:14px;color:#065f46;">
               📎 <strong>Comprobante Oficial Adjunto:</strong> Hemos adjuntado a este correo tu comprobante digital oficial de compra con código QR de verificación rápida. Guárdalo para el día del sorteo.
             </div>`
          : ""
      }

      <div style="text-align:center;margin:28px 0 10px 0;">
        <a href="https://manaurevive.com/verificar?q=${encodeURIComponent(order.reference)}" 
           style="background:#059669;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block;">
          Verificar Boletos en Línea
        </a>
      </div>
    </div>

    <!-- Pie de Página -->
    <div style="background:#f8fafc;padding:20px 24px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">
      <p style="margin:0 0 6px 0;">Rifa Manaure Balcón del Cesar &bull; Gestión Transaccional Oficial</p>
      <p style="margin:0;">Si tienes alguna duda o inquietud sobre tus boletos, contáctanos a través de nuestros canales oficiales de soporte.</p>
    </div>
  </div>
</body>
</html>
`;

    const textContent = `
¡TU PAGO HA SIDO APROBADO! - RIFA MANAURE

Hola ${buyer.full_name},

Hemos verificado satisfactoriamente tu pago por valor de ${formattedAmount} correspondiente a la orden #${order.reference}.

TUS NÚMEROS DE LA SUERTE:
${ticketsList}

DETALLES DEL SORTEO:
- Rifa: ${raffle.title}
- Fecha del sorteo: ${formattedDrawDate}
- Lotería de referencia: ${raffle.lottery_reference}
- Referencia de orden: ${order.reference}

${
  hasAttachment
    ? "Nota: Tu comprobante digital oficial con código de verificación QR va adjunto a este correo."
    : ""
}

Puedes verificar el estado oficial de tus boletos en cualquier momento visitando:
https://manaurevive.com/verificar?q=${encodeURIComponent(order.reference)}

Gracias por apoyar esta iniciativa.
Equipo de Rifa Manaure Balcón del Cesar
`;

    return { subject, htmlContent, textContent };
  }

  if (eventType === EVENT_PAYMENT_REJECTED) {
    const subject = `Actualización sobre tu orden - Rifa Manaure (${order.reference})`;
    const reasonText =
      order.rejection_reason && order.rejection_reason.trim().length > 0
        ? order.rejection_reason.trim()
        : "El comprobante adjunto no pudo ser validado o no coincide con los montos/referencias esperadas.";

    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1e293b;background-color:#f8fafc;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);border:1px solid #e2e8f0;">
    
    <!-- Encabezado -->
    <div style="background:linear-gradient(135deg,#991b1b 0%,#dc2626 100%);color:#ffffff;padding:32px 24px;text-align:center;">
      <h1 style="margin:0;font-size:24px;letter-spacing:-0.5px;">Actualización de tu Orden</h1>
      <p style="margin:8px 0 0 0;font-size:15px;opacity:0.9;">Información sobre la verificación de tu pago</p>
    </div>

    <!-- Contenido -->
    <div style="padding:28px 24px;">
      <p style="font-size:16px;margin:0 0 16px 0;">Hola <strong>${buyer.full_name}</strong>,</p>
      <p style="margin:0 0 20px 0;color:#475569;">
        Te informamos que tras la revisión manual de la orden <strong>#${order.reference}</strong>, el pago no pudo ser confirmado por el siguiente motivo:
      </p>

      <div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:8px;padding:16px;margin-bottom:24px;font-size:14px;color:#991b1b;">
        <strong>Motivo reportado:</strong><br>
        ${reasonText}
      </div>

      <p style="color:#475569;font-size:14px;margin-bottom:20px;">
        Los números que habías seleccionado han sido liberados temporalmente para mantener la disponibilidad del sorteo. Si consideras que se trata de un error o deseas enviar un nuevo soporte de transferencia, por favor comunícate de inmediato con nuestro equipo de atención.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:10px 0;color:#64748b;">Rifa:</td>
          <td style="padding:10px 0;font-weight:600;text-align:right;color:#0f172a;">${raffle.title}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#64748b;">Referencia:</td>
          <td style="padding:10px 0;font-weight:600;text-align:right;color:#dc2626;">${order.reference}</td>
        </tr>
      </table>

      <div style="text-align:center;margin:28px 0 10px 0;">
        <a href="https://manaurevive.com" 
           style="background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block;">
          Visitar Rifa Manaure
        </a>
      </div>
    </div>

    <!-- Pie de Página -->
    <div style="background:#f8fafc;padding:20px 24px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">
      <p style="margin:0 0 6px 0;">Rifa Manaure Balcón del Cesar &bull; Soporte Administrativo</p>
      <p style="margin:0;">Para asistencia directa, contáctanos a través de nuestro WhatsApp oficial de atención.</p>
    </div>
  </div>
</body>
</html>
`;

    const textContent = `
ACTUALIZACIÓN SOBRE TU ORDEN - RIFA MANAURE

Hola ${buyer.full_name},

Te informamos que la verificación del pago de tu orden #${order.reference} no pudo ser completada.

MOTIVO DE RECHAZO:
${reasonText}

Los números previamente asociados han sido liberados. Si consideras que hubo una confusión o deseas adjuntar un nuevo soporte, por favor contáctanos con la referencia #${order.reference}.

Atentamente,
Equipo de Atención - Rifa Manaure Balcón del Cesar
`;

    return { subject, htmlContent, textContent };
  }

  // EVENT_PAYMENT_RECEIVED (Soporte arquitectónico)
  const subject = `Comprobante recibido en verificación - Rifa Manaure (${order.reference})`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1e293b;background-color:#f8fafc;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);border:1px solid #e2e8f0;">
    <div style="background:#0284c7;color:#ffffff;padding:28px 24px;text-align:center;">
      <h1 style="margin:0;font-size:22px;">Comprobante Recibido</h1>
      <p style="margin:6px 0 0 0;font-size:14px;opacity:0.9;">Tu orden se encuentra en proceso de validación</p>
    </div>
    <div style="padding:24px;">
      <p>Hola <strong>${buyer.full_name}</strong>,</p>
      <p>Hemos recibido tu soporte de pago para la orden <strong>#${order.reference}</strong> (${formattedAmount}).</p>
      <p>Nuestro equipo administrativo validará la transacción a la mayor brevedad. Una vez aprobada, recibirás la confirmación oficial con tus boletos asignados.</p>
    </div>
  </div>
</body>
</html>
`;

  const textContent = `
COMPROBANTE RECIBIDO EN VERIFICACIÓN - RIFA MANAURE

Hola ${buyer.full_name},

Hemos recibido tu soporte de pago para la orden #${order.reference} por ${formattedAmount}.
Tu orden está en fila de revisión. Tan pronto sea confirmada, recibirás tus boletos oficiales.

Equipo de Rifa Manaure Balcón del Cesar
`;

  return { subject, htmlContent, textContent };
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

  const { orderId, eventType, receiptPngBase64, receiptFileName, isRetry } = body;

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

  // 10. Construcción de plantilla y adjuntos
  const hasAttachment = Boolean(
    cleanEventType === EVENT_PAYMENT_APPROVED &&
      receiptPngBase64 &&
      typeof receiptPngBase64 === "string" &&
      receiptPngBase64.trim().length > 0
  );

  const { subject, htmlContent, textContent } = buildEmailTemplates(
    cleanEventType,
    order,
    buyer,
    raffle,
    ticketNumbers,
    hasAttachment
  );

  const emailPayload: Record<string, unknown> = {
    sender: {
      name: config.brevoSenderName,
      email: config.brevoSenderEmail,
    },
    to: [
      {
        email: buyerEmail,
        name: buyer.full_name || "Comprador",
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
