import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { logoPrincipalCompleto } from '@/assets/assets';
import { ShieldCheck, MessageCircle, MapPin, Heart, Mail } from 'lucide-react';
import { createWhatsAppLink, formatPhoneNumber } from '@/lib/utils';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useActiveRaffle } from '@/hooks/useActiveRaffle';
import { PAYMENT_METHODS } from '@/data/faqFallback';
import styles from './Footer.module.css';

export const Footer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const systemSettings = useSystemSettings();
  const { lotteryReference } = useActiveRaffle();

  const whatsappNumber = systemSettings.support_whatsapp_number || '573001234567';
  const supportEmail = systemSettings.support_email || 'soporte@manaurevive.com';

  const whatsappUrl = createWhatsAppLink(
    whatsappNumber,
    'Hola Manaure Vive, deseo información sobre la Gran Rifa Ecoturística.'
  );

  const handleSectionClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault();
    if (location.pathname === '/') {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      window.history.pushState(null, '', `/#${sectionId}`);
    } else {
      navigate(`/#${sectionId}`);
    }
  };

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerContainer}`}>
        {/* Columna 1: Marca y Propósito */}
        <div className={styles.brandCol}>
          <img
            src={logoPrincipalCompleto.web}
            alt="Manaure Vive - Naturaleza, Cultura y Experiencias"
            width={240}
            height={160}
            className={styles.footerLogo}
          />
          <p className={styles.brandDesc}>
            Iniciativa de promoción del turismo de naturaleza, aventura y cultura en Manaure Balcón
            del Cesar, impulsando el desarrollo de operadores y emprendimientos locales.
          </p>
          <div className={styles.location}>
            <MapPin size={16} aria-hidden="true" className={styles.locIcon} />
            <span>Manaure Balcón del Cesar, Colombia</span>
          </div>

          {/* Bloque Oficial de Métodos de Pago */}
          <div className={styles.paymentMethodsBlock}>
            <span className={styles.paymentTitle}>Métodos de Pago</span>
            <div className={styles.paymentChipsList} aria-label="Métodos de pago autorizados">
              {PAYMENT_METHODS.map((method) => (
                <span key={method} className={styles.paymentChip}>
                  {method}
                </span>
              ))}
            </div>
            <p className={styles.noCardsNotice}>
              No recibimos pagos con tarjeta de crédito ni débito.
            </p>
          </div>
        </div>

        {/* Columna 2: Navegación Rápida */}
        <div className={styles.linksCol}>
          <h3 className={styles.colTitle}>Navegación</h3>
          <ul className={styles.linkList}>
            <li>
              <a href="/#premio" onClick={(e) => handleSectionClick(e, 'premio')}>
                Detalle del Premio
              </a>
            </li>
            <li>
              <a href="/#boletos" onClick={(e) => handleSectionClick(e, 'boletos')}>
                Comprar Boletos
              </a>
            </li>
            <li>
              <a href="/#galeria" onClick={(e) => handleSectionClick(e, 'galeria')}>
                Galería de Fotos
              </a>
            </li>
            <li>
              <a href="/#aliados" onClick={(e) => handleSectionClick(e, 'aliados')}>
                Red de Aliados
              </a>
            </li>
            <li>
              <a href="/#faq" onClick={(e) => handleSectionClick(e, 'faq')}>
                Preguntas Frecuentes
              </a>
            </li>
            <li>
              <Link to="/verificar">Consultar Boletos Adquiridos</Link>
            </li>
          </ul>
        </div>

        {/* Columna 3: Legal y Transparencia */}
        <div className={styles.legalCol}>
          <h3 className={styles.colTitle}>Transparencia y Legalidad</h3>
          <ul className={styles.linkList}>
            <li>
              <Link to="/terminos">Términos y Condiciones del Sorteo</Link>
            </li>
            <li>
              <Link to="/terminos#privacidad">Tratamiento de Datos Personales</Link>
            </li>
            <li>
              <Link to="/terminos#entrega">Protocolo de Entrega del Premio</Link>
            </li>
          </ul>

          <div className={styles.supportBox}>
            <span className={styles.supportTitle}>Canal de Atención Oficial</span>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.whatsappBtn}
              aria-label={`Contactar por WhatsApp: ${formatPhoneNumber(whatsappNumber)}`}
            >
              <MessageCircle size={18} aria-hidden="true" />
              <span>WhatsApp: {formatPhoneNumber(whatsappNumber)}</span>
            </a>
            {supportEmail && (
              <a
                href={`mailto:${supportEmail}?subject=${encodeURIComponent('Consulta Gran Rifa Ecoturística Manaure Vive')}`}
                className={styles.emailSupportLink}
                aria-label={`Enviar correo a ${supportEmail}`}
              >
                <Mail size={15} aria-hidden="true" />
                <span>{supportEmail}</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Barra Inferior de Derechos */}
      <div className={styles.bottomBar}>
        <div className={`container ${styles.bottomContainer}`}>
          <div className={styles.copyright}>
            <span>
              &copy; {new Date().getFullYear()} Manaure Vive. Todos los derechos reservados.
            </span>
          </div>
          <div className={styles.guaranteeNote}>
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Sorteo auditable con {lotteryReference}</span>
          </div>
          <div className={styles.madeWith}>
            <span>
              Hecho con <Heart size={14} aria-hidden="true" className={styles.heartIcon} /> para el turismo de Colombia
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
