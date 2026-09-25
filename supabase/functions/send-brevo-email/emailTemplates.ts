/**
 * ==============================================================================
 * SISTEMA PROFESIONAL DE PLANTILLAS TRANSACCIONALES — MANAURE VIVE
 * ==============================================================================
 * Plantillas HTML y Texto Plano para el servicio de correo transaccional de Brevo.
 *
 * LINEAMIENTOS DE DISEÑO E IDENTIDAD VISUAL:
 * 1. Fiel a la identidad visual de Manaure Vive (theme-public.css):
 *    - Fondo exterior: Crema cálido (#F4EFE4)
 *    - Superficies de tarjetas: Blanco (#FFFFFF) y crema suave (#FBF8F1)
 *    - Bordes sutiles: Arena suave (#DCD5C4)
 *    - Cabecera y acento profundo: Verde Bosque (#0F2E1D / #1B4A2E)
 *    - Acentos dorados / ámbar: (#F5A623 / #FDF1D8 / #D48806)
 *    - Textos: Verde noche (#16261C) y gris bosque (#41564A)
 * 2. Máxima compatibilidad con clientes de correo (Gmail, Outlook, Apple Mail):
 *    - Layout estructurado mediante tablas HTML estándar (role="presentation")
 *    - Estilos 100% inline (sin CSS moderno que Gmail o Outlook descarten)
 *    - Sin variables CSS ni JavaScript
 * 3. Enlaces dinámicos respetando la variable VITE_SITE_URL / SITE_URL.
 * 4. Versión equivalente de texto plano (textContent) para cada evento.
 * ==============================================================================
 */

export interface EmailBuyerInfo {
  fullName: string;
  documentId?: string;
  phone?: string;
  email: string;
  city?: string;
}

export interface EmailRaffleInfo {
  title: string;
  drawDate?: string | null;
  lotteryReference?: string | null;
}

export interface EmailOrderInfo {
  id: string;
  reference: string;
  totalAmount: number;
  ticketCount: number;
  status: string;
  rejectionReason?: string | null;
  confirmedAt?: string | null;
  paymentMethod?: string;
}

export interface EmailTemplateParams {
  eventType: 'payment_approved' | 'payment_rejected' | 'payment_received';
  order: EmailOrderInfo;
  buyer: EmailBuyerInfo;
  raffle: EmailRaffleInfo;
  tickets: string[];
  siteUrl: string;
  hasAttachment?: boolean;
  supportEmail?: string;
  supportPhone?: string;
}

export interface EmailTemplateResult {
  subject: string;
  htmlContent: string;
  textContent: string;
}

/**
 * Paleta de colores canónica extraída de theme-public.css
 */
const BRAND_COLORS = {
  bgPage: '#F4EFE4',          // Crema cálido de fondo
  bgSurface: '#FBF8F1',       // Superficie suave de contenedor interno
  bgCard: '#FFFFFF',          // Fondo de tarjeta principal
  borderSubtle: '#DCD5C4',    // Borde de separación sutil
  brandDeep: '#0F2E1D',       // Verde bosque profundo institucional
  brandPrimary: '#1B4A2E',    // Verde bosque principal
  brandPrimaryHover: '#246A40',
  brandAccent: '#F5A623',     // Dorado / Ámbar de la marca
  brandAccentSoft: '#FDF1D8', // Fondo dorado suave para boletos
  brandAccentBorder: '#D48806', // Borde dorado para boletos
  brandCoralSoft: '#FBE9E1',  // Fondo coral para estados de atención/rechazo
  brandCoralBorder: '#B23A09', // Borde coral
  danger: '#B42318',          // Rojo de alerta / rechazo
  textPrimary: '#16261C',     // Texto oscuro principal
  textSecondary: '#41564A',   // Texto secundario
  textMuted: '#5A6B5F',       // Texto atenuado
  textOnDark: '#EEF4EF',      // Texto claro sobre fondo oscuro
  textOnDarkMuted: '#B9CDBF', // Texto atenuado sobre fondo oscuro
};

const LOGO_URL =
  'https://res.cloudinary.com/ky01b0vz/image/upload/f_png,w_240/v1790100541/manaure-vive/marca/logo-principal.png';

/**
 * Formatea valores numéricos como moneda colombiana (COP).
 */
export function formatCurrencyCOP(amount: number): string {
  try {
    const formatted = new Intl.NumberFormat('es-CO', {
      maximumFractionDigits: 0,
    }).format(amount);
    return `$ ${formatted} COP`;
  } catch {
    return `$ ${amount} COP`;
  }
}

/**
 * Formatea fechas ISO al estándar colombiano en español.
 */
export function formatDateCO(dateIso: string | null | undefined): string {
  if (!dateIso) return 'Por definir';
  try {
    const d = new Date(dateIso);
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Bogota',
    }).format(d);
  } catch {
    return String(dateIso);
  }
}

/**
 * Formatea números de boletos garantizando un estándar legible con padding mínimo.
 */
export function formatTicketNumber(ticket: string | number): string {
  const str = String(ticket).trim();
  if (/^\d+$/.test(str) && str.length < 3) {
    return str.padStart(3, '0');
  }
  return str;
}

/**
 * Componente de aviso sobre clasificación de correo (Spam / Promociones)
 * Redactado con tono respetuoso y educativo sin generar alarma.
 */
function getSpamNoticeHtml(): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:24px;background-color:${BRAND_COLORS.bgSurface};border:1px solid ${BRAND_COLORS.borderSubtle};border-radius:10px;">
      <tr>
        <td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr>
              <td style="vertical-align:top;width:24px;padding-right:12px;font-size:18px;line-height:1;">
                📩
              </td>
              <td style="font-size:13px;line-height:1.5;color:${BRAND_COLORS.textSecondary};">
                <strong style="color:${BRAND_COLORS.brandDeep};">Consejo de seguridad:</strong><br>
                Si no ves este mensaje en tu bandeja principal en el futuro, revisa también tu carpeta de Spam, Correo no deseado o Promociones. Algunos proveedores pueden clasificar automáticamente los correos de confirmación transaccional.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Layout maestro que envuelve cualquier correo transaccional de Manaure Vive.
 */
function wrapInEmailLayout(options: {
  bannerColor: string;
  bannerTitle: string;
  bannerSubtitle: string;
  bannerBadgeHtml?: string;
  bodyContentHtml: string;
  siteUrl: string;
  supportEmail: string;
  supportPhone: string;
}): string {
  const {
    bannerColor,
    bannerTitle,
    bannerSubtitle,
    bannerBadgeHtml = '',
    bodyContentHtml,
    siteUrl,
    supportEmail,
    supportPhone,
  } = options;

  return `
<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${bannerTitle} — Manaure Vive</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BRAND_COLORS.bgPage};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.6;color:${BRAND_COLORS.textPrimary};">
  <center style="width:100%;background-color:${BRAND_COLORS.bgPage};padding:24px 12px 40px 12px;">
    
    <!-- Contenedor Principal (Max 600px) -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;margin:0 auto;background-color:${BRAND_COLORS.bgCard};border-radius:14px;overflow:hidden;border:1px solid ${BRAND_COLORS.borderSubtle};box-shadow:0 8px 24px rgba(22,38,28,0.06);">
      
      <!-- 1. Borde superior dorado representativo -->
      <tr>
        <td style="height:4px;background-color:${BRAND_COLORS.brandAccent};font-size:0;line-height:0;">&nbsp;</td>
      </tr>

      <!-- 2. Header Institucional con Logo Oficial -->
      <tr>
        <td style="background-color:${BRAND_COLORS.brandDeep};padding:26px 24px;text-align:center;">
          <a href="${siteUrl}" target="_blank" style="text-decoration:none;display:inline-block;">
            <img src="${LOGO_URL}" alt="Manaure Vive" width="180" style="display:block;margin:0 auto;border:0;outline:none;max-width:180px;height:auto;" />
          </a>
        </td>
      </tr>

      <!-- 3. Banner Temático del Correo -->
      <tr>
        <td style="background:linear-gradient(135deg, ${BRAND_COLORS.brandDeep} 0%, ${bannerColor} 100%);padding:28px 24px;text-align:center;color:${BRAND_COLORS.textOnDark};border-bottom:1px solid ${BRAND_COLORS.borderSubtle};">
          ${bannerBadgeHtml ? `<div style="margin-bottom:12px;">${bannerBadgeHtml}</div>` : ''}
          <h1 style="margin:0;font-size:22px;font-weight:700;color:${BRAND_COLORS.textOnDark};letter-spacing:-0.3px;line-height:1.3;">
            ${bannerTitle}
          </h1>
          <p style="margin:8px 0 0 0;font-size:14px;color:${BRAND_COLORS.textOnDarkMuted};">
            ${bannerSubtitle}
          </p>
        </td>
      </tr>

      <!-- 4. Cuerpo de Contenido Principal -->
      <tr>
        <td style="padding:32px 28px 24px 28px;background-color:${BRAND_COLORS.bgCard};">
          ${bodyContentHtml}
        </td>
      </tr>

      <!-- 5. Footer Institucional -->
      <tr>
        <td style="background-color:${BRAND_COLORS.bgSurface};padding:24px 28px;border-top:1px solid ${BRAND_COLORS.borderSubtle};text-align:center;">
          <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:${BRAND_COLORS.brandDeep};">
            Rifa Manaure &bull; Manaure Vive
          </p>
          <p style="margin:0 0 12px 0;font-size:12px;color:${BRAND_COLORS.textMuted};line-height:1.5;">
            Iniciativa de turismo y desarrollo ecoturístico en Manaure Balcón del Cesar, Colombia.<br>
            Participación 100% legal, transparente y verificable en línea.
          </p>
          <p style="margin:0;font-size:12px;color:${BRAND_COLORS.textMuted};">
            ¿Necesitas ayuda? Escríbenos a <a href="mailto:${supportEmail}" style="color:${BRAND_COLORS.brandPrimary};text-decoration:none;font-weight:600;">${supportEmail}</a>
            ${supportPhone ? ` o contáctanos al <strong style="color:${BRAND_COLORS.textPrimary};">${supportPhone}</strong>` : ''}
          </p>
        </td>
      </tr>

    </table>

  </center>
</body>
</html>
  `.trim();
}

/**
 * ------------------------------------------------------------------------------
 * A. PLANTILLA: PAYMENT_APPROVED
 * ------------------------------------------------------------------------------
 */
export function buildPaymentApprovedEmail(params: EmailTemplateParams): EmailTemplateResult {
  const { order, buyer, raffle, tickets, siteUrl, hasAttachment } = params;
  const supportEmail = params.supportEmail || 'soporte@rifamanaure.com';
  const supportPhone = params.supportPhone || '+57 300 000 0000';

  const subject = '🎉 ¡Tu pago fue confirmado! — Manaure Vive';
  const totalFormatted = formatCurrencyCOP(order.totalAmount);
  const drawDateFormatted = formatDateCO(raffle.drawDate);
  const confirmationDateFormatted = formatDateCO(order.confirmedAt || new Date().toISOString());
  const cleanSiteUrl = siteUrl.replace(/\/$/, '');
  const verificationUrl = `${cleanSiteUrl}/verificar?ref=${encodeURIComponent(order.reference)}`;

  // Construcción de tarjetas de boletos en HTML
  const formattedTickets = tickets.map(formatTicketNumber);
  const ticketBadgesHtml = formattedTickets
    .map(
      (ticket) => `
        <span style="display:inline-block;background-color:${BRAND_COLORS.brandAccentSoft};border:1.5px solid ${BRAND_COLORS.brandAccentBorder};color:${BRAND_COLORS.brandDeep};font-weight:700;font-size:17px;font-family:'Courier New',Courier,monospace;padding:8px 14px;margin:4px 6px;border-radius:8px;letter-spacing:1px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          ${ticket}
        </span>
      `
    )
    .join('');

  const bodyContentHtml = `
    <!-- Saludo Personalizado -->
    <p style="margin:0 0 16px 0;font-size:16px;color:${BRAND_COLORS.textPrimary};">
      Hola, <strong>${buyer.fullName}</strong>.
    </p>

    <p style="margin:0 0 20px 0;font-size:15px;color:${BRAND_COLORS.textSecondary};line-height:1.6;">
      Tu pago ha sido verificado correctamente y tus números ya están confirmados para participar en:
      <strong style="color:${BRAND_COLORS.brandDeep};">${raffle.title}</strong>.
    </p>

    <!-- Mensaje Destacado de Confirmación -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;background-color:${BRAND_COLORS.brandAccentSoft};border-left:4px solid ${BRAND_COLORS.brandAccent};border-radius:6px;">
      <tr>
        <td style="padding:14px 18px;font-size:14px;color:${BRAND_COLORS.brandDeep};font-weight:600;">
          ✅ Pago confirmado y participación registrada.
        </td>
      </tr>
    </table>

    <!-- Tarjeta Visual de Boletos -->
    <div style="background-color:${BRAND_COLORS.bgSurface};border:1px solid ${BRAND_COLORS.borderSubtle};border-radius:12px;padding:22px;margin-bottom:24px;text-align:center;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:${BRAND_COLORS.brandPrimary};margin-bottom:12px;">
        Tus Números de la Suerte (${formattedTickets.length} ${formattedTickets.length === 1 ? 'boleto' : 'boletos'})
      </div>
      <div style="margin:8px 0 12px 0;">
        ${ticketBadgesHtml}
      </div>
      <div style="font-size:12px;color:${BRAND_COLORS.textMuted};">
        Estos números están asociados oficialmente a tu cédula <strong>${buyer.documentId || 'registrada'}</strong>.
      </div>
    </div>

    <!-- Resumen de la Orden -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;border-collapse:collapse;font-size:14px;">
      <tr style="border-bottom:1px solid ${BRAND_COLORS.borderSubtle};">
        <td style="padding:11px 0;color:${BRAND_COLORS.textMuted};">Referencia de compra:</td>
        <td style="padding:11px 0;font-weight:700;text-align:right;color:${BRAND_COLORS.brandDeep};font-family:monospace;font-size:15px;">
          ${order.reference}
        </td>
      </tr>
      <tr style="border-bottom:1px solid ${BRAND_COLORS.borderSubtle};">
        <td style="padding:11px 0;color:${BRAND_COLORS.textMuted};">Fecha del sorteo:</td>
        <td style="padding:11px 0;font-weight:600;text-align:right;color:${BRAND_COLORS.textPrimary};">
          ${drawDateFormatted}
        </td>
      </tr>
      <tr style="border-bottom:1px solid ${BRAND_COLORS.borderSubtle};">
        <td style="padding:11px 0;color:${BRAND_COLORS.textMuted};">Lotería de referencia:</td>
        <td style="padding:11px 0;font-weight:600;text-align:right;color:${BRAND_COLORS.textPrimary};">
          ${raffle.lotteryReference || 'Lotería Oficial'}
        </td>
      </tr>
      <tr style="border-bottom:1px solid ${BRAND_COLORS.borderSubtle};">
        <td style="padding:11px 0;color:${BRAND_COLORS.textMuted};">Fecha de confirmación:</td>
        <td style="padding:11px 0;text-align:right;color:${BRAND_COLORS.textPrimary};">
          ${confirmationDateFormatted}
        </td>
      </tr>
      <tr>
        <td style="padding:14px 0;color:${BRAND_COLORS.brandDeep};font-weight:700;font-size:15px;">Total pagado:</td>
        <td style="padding:14px 0;text-align:right;color:${BRAND_COLORS.brandPrimary};font-weight:800;font-size:17px;">
          ${totalFormatted}
        </td>
      </tr>
    </table>

    <!-- Botón de Llamada a la Acción (Verificar mis números) -->
    <div style="text-align:center;margin:32px 0 24px 0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${verificationUrl}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="18%" stroke="f" fillcolor="${BRAND_COLORS.brandPrimary}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">Verificar mis números</center>
      </v:roundrect>
      <![endif]-->
      <a href="${verificationUrl}" target="_blank" style="background-color:${BRAND_COLORS.brandPrimary};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block;letter-spacing:0.3px;box-shadow:0 4px 10px rgba(27,74,46,0.25);">
        Verificar mis números &rarr;
      </a>
    </div>

    ${
      hasAttachment
        ? `
        <div style="background-color:${BRAND_COLORS.bgSurface};border:1px solid ${BRAND_COLORS.borderSubtle};border-radius:8px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:${BRAND_COLORS.textSecondary};">
          📎 <strong>Comprobante Oficial Adjunto:</strong> Hemos adjuntado a este correo tu comprobante digital oficial de compra con código QR de verificación rápida. Guárdalo para el día del sorteo.
        </div>
        `
        : ''
    }

    <!-- Advertencia de Seguridad -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:12px;">
      <tr>
        <td style="font-size:12px;color:${BRAND_COLORS.textMuted};line-height:1.5;">
          🔒 <strong>Seguridad:</strong> Esta confirmación es emitida directamente por la plataforma oficial de Manaure Vive. Nunca solicitaremos contraseñas ni pagos adicionales para reclamar tu premio.
        </td>
      </tr>
    </table>

    <!-- Advertencia de Spam / Promociones -->
    ${getSpamNoticeHtml()}
  `;

  const htmlContent = wrapInEmailLayout({
    bannerColor: BRAND_COLORS.brandPrimary,
    bannerTitle: '¡Tu pago fue confirmado!',
    bannerSubtitle: 'Tus números oficiales han sido registrados con éxito',
    bannerBadgeHtml: `<span style="background-color:${BRAND_COLORS.brandAccent};color:${BRAND_COLORS.brandDeep};font-weight:700;font-size:12px;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">Confirmado</span>`,
    bodyContentHtml,
    siteUrl: cleanSiteUrl,
    supportEmail,
    supportPhone,
  });

  const textContent = `
¡TU PAGO FUE CONFIRMADO! — MANAURE VIVE

Hola, ${buyer.fullName}.

Tu pago ha sido verificado correctamente y tus números ya están confirmados para participar en:
${raffle.title}

✅ Pago confirmado y participación registrada.

TUS NÚMEROS:
${formattedTickets.join(', ')} (Total: ${formattedTickets.length})

RESUMEN DE LA ORDEN:
- Referencia: ${order.reference}
- Fecha del sorteo: ${drawDateFormatted}
- Lotería de referencia: ${raffle.lotteryReference || 'Lotería Oficial'}
- Fecha de confirmación: ${confirmationDateFormatted}
- Total pagado: ${totalFormatted}

${hasAttachment ? 'Nota: Tu comprobante digital oficial va adjunto a este mensaje.\n' : ''}
Puedes consultar y verificar tus números oficiales en cualquier momento visitando:
${verificationUrl}

📩 CONSEJO DE SEGURIDAD:
Si no ves este mensaje en tu bandeja principal, revisa también Spam, Correo no deseado o Promociones. Algunos proveedores pueden clasificar automáticamente los correos transaccionales.

Atentamente,
Equipo de Manaure Vive & Rifa Manaure
Soporte: ${supportEmail} | ${supportPhone}
${cleanSiteUrl}
  `.trim();

  return { subject, htmlContent, textContent };
}

/**
 * ------------------------------------------------------------------------------
 * B. PLANTILLA: PAYMENT_REJECTED
 * ------------------------------------------------------------------------------
 */
export function buildPaymentRejectedEmail(params: EmailTemplateParams): EmailTemplateResult {
  const { order, buyer, raffle, siteUrl } = params;
  const supportEmail = params.supportEmail || 'soporte@rifamanaure.com';
  const supportPhone = params.supportPhone || '+57 300 000 0000';

  const subject = `Actualización sobre tu orden — Manaure Vive (${order.reference})`;
  const cleanSiteUrl = siteUrl.replace(/\/$/, '');
  const reasonText =
    order.rejectionReason && order.rejectionReason.trim().length > 0
      ? order.rejectionReason.trim()
      : 'El comprobante adjunto no pudo ser validado o la referencia de pago no coincide con los registros bancarios.';

  const bodyContentHtml = `
    <!-- Saludo Personalizado -->
    <p style="margin:0 0 16px 0;font-size:16px;color:${BRAND_COLORS.textPrimary};">
      Hola, <strong>${buyer.fullName}</strong>.
    </p>

    <p style="margin:0 0 20px 0;font-size:15px;color:${BRAND_COLORS.textSecondary};line-height:1.6;">
      Te informamos que tras la revisión administrativa de tu orden para la rifa <strong>${raffle.title}</strong>, el pago no pudo ser confirmado por el siguiente motivo:
    </p>

    <!-- Caja de Motivo de Rechazo -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;background-color:${BRAND_COLORS.brandCoralSoft};border-left:4px solid ${BRAND_COLORS.danger};border-radius:8px;">
      <tr>
        <td style="padding:16px 20px;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:${BRAND_COLORS.danger};margin-bottom:6px;">
            Motivo de la no aprobación:
          </div>
          <div style="font-size:14px;color:${BRAND_COLORS.textPrimary};line-height:1.5;">
            ${reasonText}
          </div>
        </td>
      </tr>
    </table>

    <!-- Resumen de la Orden -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;border-collapse:collapse;font-size:14px;">
      <tr style="border-bottom:1px solid ${BRAND_COLORS.borderSubtle};">
        <td style="padding:11px 0;color:${BRAND_COLORS.textMuted};">Referencia de orden:</td>
        <td style="padding:11px 0;font-weight:700;text-align:right;color:${BRAND_COLORS.brandDeep};font-family:monospace;">
          ${order.reference}
        </td>
      </tr>
      <tr style="border-bottom:1px solid ${BRAND_COLORS.borderSubtle};">
        <td style="padding:11px 0;color:${BRAND_COLORS.textMuted};">Estado actual:</td>
        <td style="padding:11px 0;font-weight:600;text-align:right;color:${BRAND_COLORS.danger};">
          No Aprobado / Liberado
        </td>
      </tr>
    </table>

    <!-- Qué puede hacer el comprador -->
    <div style="background-color:${BRAND_COLORS.bgSurface};border:1px solid ${BRAND_COLORS.borderSubtle};border-radius:10px;padding:20px;margin-bottom:28px;">
      <h3 style="margin:0 0 10px 0;font-size:15px;color:${BRAND_COLORS.brandDeep};font-weight:700;">
        ¿Qué puedes hacer a continuación?
      </h3>
      <ul style="margin:0;padding-left:20px;font-size:14px;color:${BRAND_COLORS.textSecondary};line-height:1.6;">
        <li style="margin-bottom:8px;">
          <strong>Si ya realizaste la transferencia:</strong> Contáctanos indicando tu número de referencia (<strong>${order.reference}</strong>) y adjuntando un comprobante claro donde se aprecie la fecha, hora y número de aprobación bancaria.
        </li>
        <li>
          <strong>Si deseas realizar una nueva compra:</strong> Los boletos previamente reservados han sido liberados para garantizar la transparencia del sorteo. Puedes ingresar a la plataforma y seleccionar nuevamente tus números favoritos.
        </li>
      </ul>
    </div>

    <!-- Botón de Contacto / Plataforma -->
    <div style="text-align:center;margin:28px 0 20px 0;">
      <a href="${cleanSiteUrl}" target="_blank" style="background-color:${BRAND_COLORS.brandDeep};color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
        Ir a Manaure Vive &rarr;
      </a>
    </div>

    <!-- Advertencia de Spam -->
    ${getSpamNoticeHtml()}
  `;

  const htmlContent = wrapInEmailLayout({
    bannerColor: '#991B1B',
    bannerTitle: 'Actualización sobre tu orden',
    bannerSubtitle: `Orden #${order.reference} &bull; Verificación no completada`,
    bannerBadgeHtml: `<span style="background-color:#FEE2E2;color:${BRAND_COLORS.danger};font-weight:700;font-size:12px;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">No Aprobado</span>`,
    bodyContentHtml,
    siteUrl: cleanSiteUrl,
    supportEmail,
    supportPhone,
  });

  const textContent = `
ACTUALIZACIÓN SOBRE TU ORDEN — MANAURE VIVE

Hola, ${buyer.fullName}.

Te informamos que tras la revisión administrativa de tu orden para la rifa ${raffle.title}, el pago no pudo ser confirmado.

REFERENCIA: ${order.reference}
ESTADO: No Aprobado / Liberado

MOTIVO:
${reasonText}

¿QUÉ PUEDES HACER?
1. Si ya realizaste la transferencia y consideras que hubo un error al revisar el soporte, comunícate con nosotros indicando tu referencia (${order.reference}) para verificarlo manualmente.
2. Los números previamente apartados han sido liberados. Si lo deseas, puedes ingresar nuevamente al portal para generar una nueva reserva.

Soporte: ${supportEmail} | ${supportPhone}
Portal: ${cleanSiteUrl}

📩 CONSEJO DE SEGURIDAD:
Si no ves este mensaje en tu bandeja principal, revisa también Spam, Correo no deseado o Promociones.
  `.trim();

  return { subject, htmlContent, textContent };
}

/**
 * ------------------------------------------------------------------------------
 * C. PLANTILLA: PAYMENT_RECEIVED (Soporte arquitectónico)
 * ------------------------------------------------------------------------------
 */
export function buildPaymentReceivedEmail(params: EmailTemplateParams): EmailTemplateResult {
  const { order, buyer, raffle, tickets, siteUrl } = params;
  const supportEmail = params.supportEmail || 'soporte@rifamanaure.com';
  const supportPhone = params.supportPhone || '+57 300 000 0000';

  const subject = `Recibimos tu comprobante — Manaure Vive (${order.reference})`;
  const totalFormatted = formatCurrencyCOP(order.totalAmount);
  const cleanSiteUrl = siteUrl.replace(/\/$/, '');
  const verificationUrl = `${cleanSiteUrl}/verificar?ref=${encodeURIComponent(order.reference)}`;
  const formattedTickets = tickets.map(formatTicketNumber);

  const ticketBadgesHtml = formattedTickets
    .map(
      (ticket) => `
        <span style="display:inline-block;background-color:${BRAND_COLORS.bgCard};border:1px solid ${BRAND_COLORS.borderSubtle};color:${BRAND_COLORS.textPrimary};font-weight:700;font-size:15px;font-family:'Courier New',Courier,monospace;padding:6px 12px;margin:3px;border-radius:6px;">
          ${ticket}
        </span>
      `
    )
    .join('');

  const bodyContentHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:${BRAND_COLORS.textPrimary};">
      Hola, <strong>${buyer.fullName}</strong>.
    </p>

    <p style="margin:0 0 20px 0;font-size:15px;color:${BRAND_COLORS.textSecondary};line-height:1.6;">
      Recibimos tu comprobante. Ahora será revisado manualmente por nuestro equipo para la rifa <strong>${raffle.title}</strong>.
    </p>

    <!-- Mensaje de estado -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;background-color:${BRAND_COLORS.brandAccentSoft};border-left:4px solid ${BRAND_COLORS.brandAccent};border-radius:6px;">
      <tr>
        <td style="padding:14px 18px;font-size:14px;color:${BRAND_COLORS.brandDeep};">
          ⏳ <strong>En proceso de validación:</strong> Tus números se encuentran temporalmente apartados mientras confirmamos la acreditación en la cuenta oficial.
        </td>
      </tr>
    </table>

    <!-- Boletos en revisión -->
    <div style="background-color:${BRAND_COLORS.bgSurface};border:1px solid ${BRAND_COLORS.borderSubtle};border-radius:10px;padding:18px;margin-bottom:24px;text-align:center;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:${BRAND_COLORS.brandPrimary};margin-bottom:8px;">
        Boletos en Proceso de Verificación
      </div>
      <div>${ticketBadgesHtml}</div>
    </div>

    <!-- Resumen -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;border-collapse:collapse;font-size:14px;">
      <tr style="border-bottom:1px solid ${BRAND_COLORS.borderSubtle};">
        <td style="padding:10px 0;color:${BRAND_COLORS.textMuted};">Referencia:</td>
        <td style="padding:10px 0;font-weight:700;text-align:right;color:${BRAND_COLORS.brandDeep};font-family:monospace;">
          ${order.reference}
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;color:${BRAND_COLORS.brandDeep};font-weight:700;">Total a validar:</td>
        <td style="padding:12px 0;text-align:right;color:${BRAND_COLORS.brandPrimary};font-weight:800;font-size:16px;">
          ${totalFormatted}
        </td>
      </tr>
    </table>

    <div style="text-align:center;margin:28px 0 20px 0;">
      <a href="${verificationUrl}" target="_blank" style="background-color:${BRAND_COLORS.brandPrimary};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
        Consultar Estado en Línea
      </a>
    </div>

    <!-- Advertencia de Spam -->
    ${getSpamNoticeHtml()}
  `;

  const htmlContent = wrapInEmailLayout({
    bannerColor: '#0284C7',
    bannerTitle: 'Comprobante en Revisión',
    bannerSubtitle: `Orden #${order.reference} &bull; Validación manual en curso`,
    bannerBadgeHtml: `<span style="background-color:#E0F2FE;color:#0369A1;font-weight:700;font-size:12px;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">En Revisión</span>`,
    bodyContentHtml,
    siteUrl: cleanSiteUrl,
    supportEmail,
    supportPhone,
  });

  const textContent = `
COMPROBANTE RECIBIDO EN REVISIÓN — MANAURE VIVE

Hola, ${buyer.fullName}.

Recibimos tu comprobante. Ahora será revisado manualmente por nuestro equipo para la rifa ${raffle.title}.

REFERENCIA: ${order.reference}
BOLETOS: ${formattedTickets.join(', ')}
TOTAL: ${totalFormatted}

Una vez verificado tu pago, recibirás la confirmación final con tus números oficiales.
Puedes consultar el estado de tu orden en:
${verificationUrl}

📩 CONSEJO DE SEGURIDAD:
Si no ves este mensaje en tu bandeja principal, revisa también Spam, Correo no deseado o Promociones.

Equipo de Manaure Vive
Soporte: ${supportEmail} | ${supportPhone}
  `.trim();

  return { subject, htmlContent, textContent };
}

/**
 * Despachador principal según el tipo de evento transaccional.
 */
export function generateTransactionalEmail(params: EmailTemplateParams): EmailTemplateResult {
  switch (params.eventType) {
    case 'payment_approved':
      return buildPaymentApprovedEmail(params);
    case 'payment_rejected':
      return buildPaymentRejectedEmail(params);
    case 'payment_received':
      return buildPaymentReceivedEmail(params);
    default:
      return buildPaymentApprovedEmail(params);
  }
}
