/**
 * Utilidades generales para formateo de moneda (COP), validación y manipulación de datos.
 */

/**
 * Extrae y normaliza de forma segura un valor de precio numérico entero positivo.
 * Previene errores de parseo, cadenas corruptas, formatos con separadores de miles ($ 25.000 / 25,000) o valores negativos.
 */
export function parseNumericPrice(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  }
  if (typeof value === 'string') {
    let cleaned = value.trim().replace(/[$\s]/g, '');
    if (!cleaned) return 0;

    // Caso 1: Ambos separadores presentes (ej. "25.000,00" o "25,000.00")
    if (cleaned.includes('.') && cleaned.includes(',')) {
      if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
        // Formato latino: 25.000,00
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        // Formato anglosajón: 25,000.00
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes('.')) {
      // Caso 2: Solo punto(s)
      const dotCount = (cleaned.match(/\./g) || []).length;
      if (dotCount > 1) {
        // Múltiples puntos: "1.000.000" -> separador de miles
        cleaned = cleaned.replace(/\./g, '');
      } else {
        // Un solo punto:
        const parts = cleaned.split('.');
        // Si hay exactamente 3 dígitos tras el punto (ej: "25.000", "5.000"), es separador de miles en COP
        if (parts[1] && parts[1].length === 3 && parts[0].length >= 1) {
          cleaned = cleaned.replace('.', '');
        }
      }
    } else if (cleaned.includes(',')) {
      // Caso 3: Solo coma(s)
      const commaCount = (cleaned.match(/,/g) || []).length;
      if (commaCount > 1) {
        cleaned = cleaned.replace(/,/g, '');
      } else {
        const parts = cleaned.split(',');
        if (parts[1] && parts[1].length === 3 && parts[0].length >= 1) {
          cleaned = cleaned.replace(',', '');
        } else {
          cleaned = cleaned.replace(',', '.');
        }
      }
    }

    const num = Number(cleaned);
    if (Number.isFinite(num) && num > 0) {
      return Math.round(num);
    }
  }
  return 0;
}

/**
 * Formatea un número o string a moneda colombiana (COP) redondeado a entero.
 * Ejemplo: 25000 -> "$ 25.000"
 */
export function formatCOP(amount: number | string | null | undefined): string {
  const numeric = typeof amount === 'number' ? amount : Number(amount);
  const safeAmount = Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(safeAmount);
}

/**
 * Formatea un número de boleto con relleno de ceros a la izquierda.
 * Ejemplo: formatTicketNumber(7, 3) -> "007"
 */
export function formatTicketNumber(num: number | string, digits = 3): string {
  if (typeof num === 'string') {
    const trimmed = num.trim();
    if (/^\d+$/.test(trimmed)) {
      const targetDigits = Math.max(digits, trimmed.length);
      const parsed = parseInt(trimmed, 10);
      if (isNaN(parsed)) return trimmed.padStart(targetDigits, '0');
      return String(parsed).padStart(targetDigits, '0');
    }
    return trimmed;
  }
  const parsed = typeof num === 'number' ? num : parseInt(num, 10);
  if (isNaN(parsed)) return String(num).padStart(digits, '0');
  return String(parsed).padStart(digits, '0');
}


/**
 * Valida formato de documento de identidad (Cédula de Ciudadanía / Extranjería / NIT básico).
 * Entre 6 y 11 dígitos numéricos.
 */
export function isValidDocument(doc: string): boolean {
  const clean = doc.replace(/\D/g, '');
  return clean.length >= 6 && clean.length <= 11;
}

/**
 * Valida número de teléfono celular colombiano (10 dígitos comenzando con 3).
 */
export function isValidPhone(phone: string): boolean {
  const clean = phone.replace(/\D/g, '');
  return clean.length === 10 && clean.startsWith('3');
}

/**
 * Valida formato básico de correo electrónico.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Genera un enlace directo a WhatsApp con mensaje codificado.
 */
export function createWhatsAppLink(phone: string, message: string): string {
  const cleanPhone = phone.replace(/\D/g, '');
  const targetPhone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;
  return `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Genera N números aleatorios dentro de un rango sin repeticiones.
 */
export function getRandomTicketNumbers(availableNumbers: string[], count: number): string[] {
  if (availableNumbers.length <= count) {
    return [...availableNumbers];
  }
  const shuffled = [...availableNumbers].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/**
 * Protege parcialmente el documento de identidad para privacidad en vistas administrativas.
 * Ejemplo: "1065892340" -> "106*****40"
 */
export function maskDocumentId(doc?: string | null): string {
  if (!doc) return 'N/A';
  const clean = doc.trim();
  if (clean.length <= 4) return clean;
  const first = clean.slice(0, Math.min(3, Math.floor(clean.length / 3)));
  const last = clean.slice(-2);
  const asterisks = '*'.repeat(Math.max(3, clean.length - first.length - last.length));
  return `${first}${asterisks}${last}`;
}

/**
 * Enmascara un nombre completo para consultas públicas: "Carlos Arturo Mendoza" -> "Carlos M."
 */
export function maskFullName(name?: string | null): string {
  if (!name) return 'Comprador';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

/**
 * Enmascara correo electrónico: "carlos.mendoza@gmail.com" -> "c***a@gmail.com"
 */
export function maskEmail(email?: string | null): string {
  if (!email || !email.includes('@')) return '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user.charAt(0)}*@${domain}`;
  return `${user.charAt(0)}***${user.charAt(user.length - 1)}@${domain}`;
}

/**
 * Enmascara teléfono celular: "3001234567" -> "300****567"
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 7) return '***';
  return `${clean.slice(0, 3)}****${clean.slice(-3)}`;
}
/**
 * Formatea un número de teléfono para presentación visual amigable.
 * Ejemplo: "573001234567" -> "+57 300 123 4567"
 */
export function formatPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 12 && clean.startsWith('57')) {
    return `+57 ${clean.slice(2, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  if (clean.length === 10) {
    return `+57 ${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  return phone;
}
