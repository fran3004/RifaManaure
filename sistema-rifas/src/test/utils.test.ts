import { describe, it, expect } from 'vitest';
import {
  formatCOP,
  formatTicketNumber,
  isValidDocument,
  isValidPhone,
  isValidEmail,
  createWhatsAppLink,
  getRandomTicketNumbers,
  maskDocumentId,
  maskFullName,
  maskEmail,
  maskPhone,
  formatPhoneNumber,
} from '@/lib/utils';

describe('Utilidades de Formato y Validación (src/lib/utils.ts)', () => {
  describe('formatCOP', () => {
    it('debe formatear montos en pesos colombianos sin decimales', () => {
      const formatted = formatCOP(25000);
      expect(formatted).toContain('25.000');
      expect(formatted).toContain('$');
    });

    it('debe manejar monto 0', () => {
      const formatted = formatCOP(0);
      expect(formatted).toContain('0');
      expect(formatted).toContain('$');
    });
  });

  describe('formatTicketNumber', () => {
    it('debe rellenar con ceros a la izquierda para 3 dígitos por defecto', () => {
      expect(formatTicketNumber(7)).toBe('007');
      expect(formatTicketNumber(42)).toBe('042');
      expect(formatTicketNumber(999)).toBe('999');
    });

    it('debe soportar cadenas numéricas', () => {
      expect(formatTicketNumber('5')).toBe('005');
      expect(formatTicketNumber('128')).toBe('128');
    });

    it('debe respetar la cantidad personalizada de dígitos', () => {
      expect(formatTicketNumber(12, 4)).toBe('0012');
    });
  });

  describe('isValidDocument', () => {
    it('debe aceptar cédulas válidas entre 6 y 11 dígitos', () => {
      expect(isValidDocument('123456')).toBe(true);
      expect(isValidDocument('1065892340')).toBe(true);
      expect(isValidDocument('10658923401')).toBe(true);
    });

    it('debe rechazar documentos con menos de 6 o más de 11 dígitos', () => {
      expect(isValidDocument('12345')).toBe(false);
      expect(isValidDocument('123456789012')).toBe(false);
    });

    it('debe limpiar caracteres no numéricos como puntos o guiones', () => {
      expect(isValidDocument('1.065.892-3')).toBe(true);
    });
  });

  describe('isValidPhone', () => {
    it('debe validar celulares colombianos de 10 dígitos iniciando en 3', () => {
      expect(isValidPhone('3001234567')).toBe(true);
      expect(isValidPhone('3159876543')).toBe(true);
    });

    it('debe rechazar teléfonos fijos o que no comiencen por 3', () => {
      expect(isValidPhone('6051234567')).toBe(false);
      expect(isValidPhone('1234567890')).toBe(false);
    });

    it('debe rechazar longitudes diferentes a 10 dígitos', () => {
      expect(isValidPhone('300123456')).toBe(false);
      expect(isValidPhone('30012345678')).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('debe aceptar correos con estructura estándar válida', () => {
      expect(isValidEmail('usuario@manaurevive.com')).toBe(true);
      expect(isValidEmail('juan.perez@gmail.com')).toBe(true);
    });

    it('debe rechazar correos inválidos o incompletos', () => {
      expect(isValidEmail('invalido')).toBe(false);
      expect(isValidEmail('usuario@')).toBe(false);
      expect(isValidEmail('@dominio.com')).toBe(false);
      expect(isValidEmail('usuario@dominio')).toBe(false);
    });
  });

  describe('createWhatsAppLink', () => {
    it('debe generar enlace codificado con código 57 de Colombia', () => {
      const link = createWhatsAppLink('3001234567', 'Hola Manaure Vive');
      expect(link).toContain('https://wa.me/573001234567');
      expect(link).toContain('Hola%20Manaure%20Vive');
    });

    it('no debe duplicar el código 57 si ya viene incluido', () => {
      const link = createWhatsAppLink('+573001234567', 'Consulta');
      expect(link).toContain('https://wa.me/573001234567');
      expect(link).not.toContain('5757');
    });
  });

  describe('getRandomTicketNumbers', () => {
    it('debe seleccionar la cantidad solicitada de números sin duplicados', () => {
      const available = ['001', '002', '003', '004', '005', '006'];
      const picked = getRandomTicketNumbers(available, 3);
      expect(picked).toHaveLength(3);
      expect(new Set(picked).size).toBe(3);
      picked.forEach((num) => expect(available).toContain(num));
    });

    it('debe retornar todos los números si la cantidad solicitada supera el total disponible', () => {
      const available = ['001', '002'];
      const picked = getRandomTicketNumbers(available, 5);
      expect(picked).toHaveLength(2);
    });
  });

  describe('Enmascaramiento de Datos Sensibles', () => {
    it('maskDocumentId debe proteger dígitos centrales', () => {
      const masked = maskDocumentId('1065892340');
      expect(masked.startsWith('106')).toBe(true);
      expect(masked.endsWith('40')).toBe(true);
      expect(masked).toContain('***');
    });

    it('maskFullName debe proteger apellido completo mostrando solo inicial', () => {
      expect(maskFullName('Carlos Arturo Mendoza')).toBe('Carlos M.');
      expect(maskFullName('Ana Gómez')).toBe('Ana G.');
      expect(maskFullName('Pedro')).toBe('Pedro');
      expect(maskFullName('')).toBe('Comprador');
    });

    it('maskEmail debe ocultar caracteres entre la primera y última letra del usuario', () => {
      expect(maskEmail('carlos.mendoza@gmail.com')).toBe('c***a@gmail.com');
      expect(maskEmail('')).toBe('');
    });

    it('maskPhone debe conservar los primeros 3 y últimos 3 dígitos', () => {
      expect(maskPhone('3001234567')).toBe('300****567');
      expect(maskPhone('')).toBe('');
    });

    it('formatPhoneNumber debe formatear a presentación internacional legible', () => {
      expect(formatPhoneNumber('3001234567')).toBe('+57 300 123 4567');
      expect(formatPhoneNumber('573001234567')).toBe('+57 300 123 4567');
    });
  });
});

