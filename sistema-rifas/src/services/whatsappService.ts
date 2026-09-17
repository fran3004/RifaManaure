/**
 * Servicio desacoplado para la integración y comunicación mediante WhatsApp.
 * 
 * NOTA DE ARQUITECTURA:
 * - WhatsApp actúa exclusivamente como canal de comunicación y notificación.
 * - No es ni reemplaza una pasarela de pagos.
 * - No incluye credenciales ni tokens sensibles en el frontend.
 * - Soporta la interfaz WhatsAppProvider para permitir integración futura con
 *   WhatsApp Business Cloud API o servicios backend autorizados.
 */

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WhatsAppProvider {
  readonly id: string;
  readonly name: string;
  isConfigured(): boolean;
  generateLink(toPhone: string, message: string): string;
  sendDirectMessage?(toPhone: string, message: string): Promise<WhatsAppSendResult>;
}

/**
 * Limpia y normaliza un número telefónico al estándar internacional de Colombia (+57).
 */
export function formatPhoneForWhatsApp(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (!clean) return '';
  if (clean.startsWith('57') && clean.length > 10) {
    return clean;
  }
  return `57${clean}`;
}

/**
 * Proveedor manual predeterminado basado en enlaces universales wa.me
 * Seguro para entornos cliente sin necesidad de API keys en frontend.
 */
export class ManualWhatsAppProvider implements WhatsAppProvider {
  readonly id = 'manual_link';
  readonly name = 'Enlace Directo WhatsApp (wa.me)';

  isConfigured(): boolean {
    return true;
  }

  generateLink(toPhone: string, message: string): string {
    const formattedPhone = formatPhoneForWhatsApp(toPhone);
    const encodedMessage = encodeURIComponent(message);
    if (!formattedPhone) {
      return `https://wa.me/?text=${encodedMessage}`;
    }
    return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
  }
}

/**
 * Proveedor preparado para integración futura con WhatsApp Business Cloud API.
 * Se delega a una Edge Function o endpoint backend seguro para no exponer credenciales.
 */
export class WhatsAppBusinessCloudProvider implements WhatsAppProvider {
  readonly id = 'whatsapp_cloud_api';
  readonly name = 'WhatsApp Business Cloud API';

  private apiUrl?: string;

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl;
  }

  isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiUrl.trim().length > 0);
  }

  generateLink(toPhone: string, message: string): string {
    // Fallback a enlace manual si se requiere apertura directa en navegador
    return new ManualWhatsAppProvider().generateLink(toPhone, message);
  }

  async sendDirectMessage(toPhone: string, message: string): Promise<WhatsAppSendResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'WhatsApp Business Cloud API no está configurado en el backend.',
      };
    }

    try {
      const response = await fetch(this.apiUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: formatPhoneForWhatsApp(toPhone),
          message,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errJson.message || `Error del servidor WhatsApp: ${response.statusText}`,
        };
      }

      const result = await response.json();
      return {
        success: true,
        messageId: result.messageId || result.id,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Error al enviar mensaje directo por WhatsApp API',
      };
    }
  }
}

// Registro singleton de proveedores
const providers: Record<string, WhatsAppProvider> = {
  manual: new ManualWhatsAppProvider(),
  cloud_api: new WhatsAppBusinessCloudProvider(
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_WHATSAPP_API_ENDPOINT
      ? String(import.meta.env.VITE_WHATSAPP_API_ENDPOINT)
      : undefined
  ),
};

/**
 * Obtiene el proveedor de WhatsApp activo.
 */
export function getWhatsAppProvider(providerId = 'manual'): WhatsAppProvider {
  return providers[providerId] || providers.manual;
}

/**
 * Genera un enlace directo wa.me con mensaje prellenado.
 */
export function createWhatsAppLink(phone: string, message: string): string {
  const provider = getWhatsAppProvider('manual');
  return provider.generateLink(phone, message);
}

/**
 * Abre una ventana o pestaña de WhatsApp con el mensaje prellenado.
 */
export function openWhatsApp(phone: string, message: string): void {
  const link = createWhatsAppLink(phone, message);
  if (typeof window !== 'undefined') {
    window.open(link, '_blank', 'noopener,noreferrer');
  }
}

