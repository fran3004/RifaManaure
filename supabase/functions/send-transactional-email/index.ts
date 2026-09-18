import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const envOrigins = Deno.env.get("ALLOWED_ORIGINS")
    ? Deno.env.get("ALLOWED_ORIGINS")!.split(",").map((o) => o.trim()).filter(Boolean)
    : [];
  const defaultOrigins = [
    "https://rifa-manaure.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:4173",
  ];
  const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

  const isVercel = origin.endsWith(".vercel.app") && origin.startsWith("https://");
  const isAllowed = allowedOrigins.includes(origin) || isVercel;

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : (allowedOrigins[0] || "*"),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

interface RequestPayload {
  orderId: string;
  eventType: "PAYMENT_RECEIVED" | "PAYMENT_APPROVED" | "PAYMENT_REJECTED";
  reason?: string;
  isRetry?: boolean;
}

function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTicketNumber(num: string | number, digits = 3): string {
  const parsed = typeof num === "number" ? num : parseInt(num, 10);
  if (isNaN(parsed)) return String(num).padStart(digits, "0");
  return String(parsed).padStart(digits, "0");
}

function getEmailHtml(
  eventType: "PAYMENT_RECEIVED" | "PAYMENT_APPROVED" | "PAYMENT_REJECTED",
  data: {
    buyerName: string;
    orderReference: string;
    totalAmount: number;
    ticketNumbers: string[];
    raffleTitle: string;
    drawDate?: string;
    rejectionReason?: string;
    verificationUrl: string;
    supportEmail: string;
    supportPhone: string;
  }
): { subject: string; html: string } {
  const brandGreen = "#10b981";
  const brandGold = "#f59e0b";
  const bgDark = "#0a1410";
  const bgCard = "#11221c";
  const textLight = "#f3f7f5";
  const textMuted = "#9cb5ab";

  const ticketsChipsHtml = data.ticketNumbers
    .map(
      (n) =>
        `<span style="display:inline-block;padding:4px 10px;margin:3px;background-color:#162c24;border:1px solid #34d399;color:#34d399;font-family:monospace;font-size:14px;font-weight:bold;border-radius:6px;">${formatTicketNumber(n)}</span>`
    )
    .join(" ");

  let subject = "";
  let statusBadgeHtml = "";
  let mainMessageHtml = "";

  switch (eventType) {
    case "PAYMENT_RECEIVED":
      subject = "Comprobante recibido - Manaure Vive";
      statusBadgeHtml = `
        <div style="background-color:rgba(245,158,11,0.15);border:1px solid #f59e0b;color:#fbbf24;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:bold;display:inline-block;margin-bottom:16px;">
          ⏳ Pendiente de verificación manual
        </div>`;
      mainMessageHtml = `
        <p style="color:${textLight};font-size:15px;line-height:1.6;margin:0 0 16px 0;">
          Hemos recibido tu comprobante de transferencia bancaria. Nuestro equipo administrativo verificará el ingreso de los fondos en la cuenta oficial.
        </p>
        <div style="background-color:rgba(245,158,11,0.1);border-left:4px solid ${brandGold};padding:12px 16px;margin:16px 0;border-radius:4px;">
          <p style="color:#fef3c7;font-size:13px;line-height:1.5;margin:0;">
            <strong>Nota importante:</strong> Por favor conserva el comprobante original de tu transferencia. Una vez verificado el pago por el administrador, recibirás la confirmación oficial definitiva.
          </p>
        </div>`;
      break;

    case "PAYMENT_APPROVED":
      subject = "Pago confirmado - Manaure Vive";
      statusBadgeHtml = `
        <div style="background-color:rgba(16,185,129,0.15);border:1px solid #10b981;color:#34d399;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:bold;display:inline-block;margin-bottom:16px;">
          ✅ Pago confirmado y boletos confirmados
        </div>`;
      mainMessageHtml = `
        <p style="color:${textLight};font-size:15px;line-height:1.6;margin:0 0 16px 0;">
          ¡Excelente noticia! Tu comprobante de pago ha sido <strong>verificado y aprobado exitosamente</strong>. Tus boletos están oficialmente registrados para el sorteo.
        </p>
        <div style="background-color:rgba(16,185,129,0.1);border-left:4px solid ${brandGreen};padding:12px 16px;margin:16px 0;border-radius:4px;">
          <p style="color:#d1fae5;font-size:13px;line-height:1.5;margin:0;">
            Puedes consultar tus números y verificar la autenticidad de tu compra en cualquier momento en nuestro módulo oficial de verificación.
          </p>
        </div>`;
      break;

    case "PAYMENT_REJECTED":
      subject = "Pago no confirmado - Manaure Vive";
      statusBadgeHtml = `
        <div style="background-color:rgba(239,68,68,0.15);border:1px solid #ef4444;color:#f87171;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:bold;display:inline-block;margin-bottom:16px;">
          ❌ Pago no aprobado
        </div>`;
      mainMessageHtml = `
        <p style="color:${textLight};font-size:15px;line-height:1.6;margin:0 0 16px 0;">
          Lamentamos informarte que tu comprobante de pago para la orden <strong>${data.orderReference}</strong> no pudo ser aprobado.
        </p>
        <div style="background-color:rgba(239,68,68,0.1);border-left:4px solid #ef4444;padding:12px 16px;margin:16px 0;border-radius:4px;">
          <p style="color:#fecaca;font-size:13px;line-height:1.5;margin:0 0 6px 0;">
            <strong>Motivo informado:</strong>
          </p>
          <p style="color:#ffffff;font-size:14px;line-height:1.5;margin:0;font-style:italic;">
            "${data.rejectionReason || "Comprobante no válido o no identificado en cuenta bancaria."}"
          </p>
        </div>
        <p style="color:${textMuted};font-size:13px;line-height:1.5;margin:16px 0 0 0;">
          ⚠️ Los boletos que tenías en reserva han sido liberados. Si consideras que se trata de un error o deseas suministrar el comprobante correcto, por favor comunícate con nuestro equipo de atención.
        </p>`;
      break;
  }

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:${bgDark};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${textLight};">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:${bgDark};padding:30px 10px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:${bgCard};border:1px solid rgba(156,181,171,0.2);border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color:#162c24;padding:24px 30px;border-bottom:1px solid rgba(156,181,171,0.15);text-align:center;">
              <h1 style="margin:0;font-size:22px;color:#ffffff;letter-spacing:0.5px;">
                🌴 MANAURE VIVE
              </h1>
              <p style="margin:4px 0 0 0;font-size:12px;color:${brandGold};text-transform:uppercase;letter-spacing:1.5px;font-weight:bold;">
                ${data.raffleTitle}
              </p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:32px 30px;">
              <p style="font-size:16px;color:${textLight};margin:0 0 16px 0;">
                Hola <strong>${data.buyerName}</strong>,
              </p>

              <div style="text-align:center;margin:16px 0 20px 0;">
                ${statusBadgeHtml}
              </div>

              ${mainMessageHtml}

              <!-- Order Summary Table -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0;background-color:#0a1410;border:1px solid rgba(156,181,171,0.15);border-radius:10px;padding:16px;">
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid rgba(156,181,171,0.1);color:${textMuted};font-size:13px;">
                    Referencia de Orden:
                  </td>
                  <td align="right" style="padding:8px 0;border-bottom:1px solid rgba(156,181,171,0.1);color:${brandGold};font-family:monospace;font-size:14px;font-weight:bold;">
                    ${data.orderReference}
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid rgba(156,181,171,0.1);color:${textMuted};font-size:13px;">
                    Total Liquidado:
                  </td>
                  <td align="right" style="padding:8px 0;border-bottom:1px solid rgba(156,181,171,0.1);color:${brandGreen};font-size:15px;font-weight:bold;">
                    ${formatCOP(data.totalAmount)}
                  </td>
                </tr>
                ${data.drawDate ? `
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid rgba(156,181,171,0.1);color:${textMuted};font-size:13px;">
                    Fecha de Sorteo:
                  </td>
                  <td align="right" style="padding:8px 0;border-bottom:1px solid rgba(156,181,171,0.1);color:${textLight};font-size:13px;">
                    ${data.drawDate}
                  </td>
                </tr>` : ""}
                <tr>
                  <td colspan="2" style="padding:12px 0 4px 0;">
                    <span style="color:${textMuted};font-size:12px;display:block;margin-bottom:6px;">
                      Números Asociados (${data.ticketNumbers.length}):
                    </span>
                    <div style="margin-top:4px;">
                      ${ticketsChipsHtml}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${data.verificationUrl}" target="_blank" style="display:inline-block;padding:12px 24px;background-color:${brandGreen};color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;border-radius:8px;box-shadow:0 4px 12px rgba(16,185,129,0.3);">
                      Consultar Estado de Boletos
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#0a1410;padding:20px 30px;border-top:1px solid rgba(156,181,171,0.15);text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;color:${textMuted};">
                ¿Tienes dudas o necesitas asistencia? Contáctanos:
              </p>
              <p style="margin:0;font-size:12px;color:${textLight};">
                WhatsApp / Teléfono: <strong>${data.supportPhone}</strong> | Correo: <strong>${data.supportEmail}</strong>
              </p>
              <p style="margin:16px 0 0 0;font-size:11px;color:#5e7a6f;">
                Este es un mensaje transaccional automático de Manaure Vive. Por favor no respondas directamente a este correo si fue enviado desde una dirección automática.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Manejo de preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const functionSecret = Deno.env.get("FUNCTION_SECRET") ?? "";

    const payload: RequestPayload = await req.json().catch(() => ({} as RequestPayload));
    const { orderId, eventType, reason, isRetry } = payload;

    // Validación estricta de parámetros obligatorios
    const ALLOWED_EVENTS = ["PAYMENT_RECEIVED", "PAYMENT_APPROVED", "PAYMENT_REJECTED"] as const;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!orderId || typeof orderId !== "string" || !UUID_REGEX.test(orderId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "El parámetro orderId es obligatorio y debe ser un UUID válido.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!eventType || !ALLOWED_EVENTS.includes(eventType)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `El evento '${eventType}' no es válido. Eventos permitidos: ${ALLOWED_EVENTS.join(", ")}.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Verificación estricta de autorización y permisos por rol
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const apiKeyHeader = req.headers.get("apikey") || "";

    let isAuthorized = false;

    // A. Validación por secreto de función o clave de servicio interna
    if (token && ((functionSecret && token === functionSecret) || (supabaseServiceKey && token === supabaseServiceKey))) {
      isAuthorized = true;
    }

    // B. Validación por JWT de sesión de usuario administrador autenticado
    if (!isAuthorized && token && token !== supabaseAnonKey) {
      const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey);
      const { data: userData, error: userError } = await supabaseUserClient.auth.getUser(token);
      if (!userError && userData?.user) {
        // Consultar rol en la tabla admin_users para garantizar privilegios administrativos
        const { data: adminRecord } = await supabase
          .from("admin_users")
          .select("role")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (adminRecord && ["superadmin", "admin"].includes(adminRecord.role)) {
          isAuthorized = true;
        }
      }
    }

    // C. Validación por clave anónima (checkout público legítimo):
    // Únicamente permitida para notificar PAYMENT_RECEIVED tras subir comprobante y JAMÁS para reintentos
    if (!isAuthorized && (token === supabaseAnonKey || apiKeyHeader === supabaseAnonKey)) {
      if (eventType === "PAYMENT_RECEIVED" && !isRetry) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Acceso no autorizado: la operación solicitada requiere permisos de administrador.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "RESEND_API_KEY no está configurada en los secretos de Supabase.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fromEmail =
      Deno.env.get("RESEND_FROM_EMAIL") || "Manaure Vive <onboarding@resend.dev>";
    const appUrl = Deno.env.get("PUBLIC_APP_URL") || "https://rifa-manaure.vercel.app";
    const supportPhone = Deno.env.get("SUPPORT_PHONE") || "+57 300 000 0000";
    const supportEmail = Deno.env.get("SUPPORT_EMAIL") || "soporte@manaurevive.com";

    const replyTo = Deno.env.get("RESEND_REPLY_TO") || supportEmail;

    // 2. Obtener datos reales de la orden desde PostgreSQL
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        id,
        reference,
        total_amount,
        status,
        created_at,
        verified_at,
        rejection_reason,
        raffle_id,
        buyer_id,
        buyers (
          id,
          full_name,
          email,
          phone,
          document_id
        ),
        raffles (
          id,
          title,
          draw_date
        )
      `)
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No se encontró la orden de compra especificada en la base de datos.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Obtener y validar los boletos asociados a la orden
    const { data: tickets } = await supabase
      .from("tickets")
      .select("number, status")
      .eq("order_id", orderId);

    const ticketNumbers = (tickets || []).map((t: { number: string }) => t.number);
    if (!ticketNumbers || ticketNumbers.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "La orden no registra ningún boleto asociado en la base de datos.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validar monto total positivo
    if (typeof order.total_amount !== "number" || order.total_amount <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "El monto total de la orden en la base de datos es inválido.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const buyer = order.buyers as unknown as { full_name: string; email: string; phone: string } | null;
    const raffle = order.raffles as unknown as { title: string; draw_date?: string } | null;

    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const cleanBuyerEmail = buyer?.email?.trim().toLowerCase() || "";

    if (!cleanBuyerEmail || !EMAIL_REGEX.test(cleanBuyerEmail)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "El comprador asociado a la orden no tiene una dirección de correo electrónico válida.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Validar consistencia estricta entre el evento solicitado y el estado real de la orden
    if (eventType === "PAYMENT_RECEIVED" && order.status !== "pending_verification") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No se puede enviar email de comprobante recibido porque la orden está en estado '${order.status}' y no en 'pending_verification'.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (eventType === "PAYMENT_APPROVED" && !["paid", "completed"].includes(order.status)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No se puede enviar email de aprobación porque la orden está en estado '${order.status}'.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (eventType === "PAYMENT_REJECTED" && order.status !== "rejected") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No se puede enviar email de rechazo porque la orden está en estado '${order.status}'.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Clave de Idempotencia determinística
    const idempotencyKey = isRetry
      ? `email-${eventType.toLowerCase()}/${order.id}/retry-${Date.now()}`
      : `email-${eventType.toLowerCase()}/${order.id}`;

    // Verificar si ya existe un log previo exitoso con la clave determinística base
    if (!isRetry) {
      const { data: existingLog } = await supabase
        .from("notification_logs")
        .select("id, status, resend_email_id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingLog && ["sent", "delivered"].includes(existingLog.status)) {
        return new Response(
          JSON.stringify({
            success: true,
            emailId: existingLog.resend_email_id,
            status: existingLog.status,
            cached: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 6. Construir contenido del correo
    const { subject, html } = getEmailHtml(eventType, {
      buyerName: buyer?.full_name || "Comprador",
      orderReference: order.reference,
      totalAmount: order.total_amount,
      ticketNumbers,
      raffleTitle: raffle?.title || "Gran Rifa Manaure Vive",
      drawDate: raffle?.draw_date,
      rejectionReason: reason || order.rejection_reason || undefined,
      verificationUrl: `${appUrl}/verificar`,
      supportEmail,
      supportPhone,
    });

    // 7. Enviar mediante la API HTTP de Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [cleanBuyerEmail],
        ...(replyTo ? { reply_to: replyTo.trim() } : {}),
        subject,
        html,
        tags: [
          { name: "order_id", value: order.id },
          { name: "event_type", value: eventType },
          { name: "reference", value: order.reference },
        ],
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      const errorMsg = resendData.message || resendData.error || "Error al enviar correo mediante Resend";

      // Registrar fallo en notification_logs
      await supabase.from("notification_logs").upsert(
        {
          order_id: order.id,
          event_type: eventType,
          channel: "email",
          recipient: buyer.email,
          status: "failed",
          error_message: errorMsg,
          idempotency_key: idempotencyKey,
          metadata: { resend_response: resendData, from_email: fromEmail },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "idempotency_key" }
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMsg,
          status: "failed",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Registrar envío exitoso en notification_logs
    await supabase.from("notification_logs").upsert(
      {
        order_id: order.id,
        event_type: eventType,
        channel: "email",
        recipient: buyer.email,
        resend_email_id: resendData.id,
        status: "sent",
        error_message: null,
        idempotency_key: idempotencyKey,
        metadata: { resend_response: resendData, from_email: fromEmail },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "idempotency_key" }
    );

    return new Response(
      JSON.stringify({
        success: true,
        emailId: resendData.id,
        status: "sent",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Error inesperado en la Edge Function";
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
