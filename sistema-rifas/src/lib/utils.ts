/**
 * Utilidades generales para formateo de moneda (COP), validación y manipulación de datos.
 */

/**
 * Formatea un número a moneda colombiana (COP).
 * Ejemplo: 25000 -> "$ 25.000"
 */
export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formatea un número de boleto con relleno de ceros a la izquierda.
 * Ejemplo: formatTicketNumber(7, 3) -> "007"
 */
export function formatTicketNumber(num: number | string, digits = 3): string {
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
