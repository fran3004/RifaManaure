import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, Search, MessageCircle, Sparkles, ShieldCheck } from 'lucide-react';
import { logoPrincipalCompleto } from '@/assets/assets';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { createWhatsAppLink } from '@/lib/utils';
import { Button } from '@/components/public/ui/Button';
import styles from './PortalRaffleClosed.module.css';

export const PortalRaffleClosed: React.FC = () => {
  const systemSettings = useSystemSettings();

  const whatsappNumber = systemSettings.support_whatsapp_number || '573001234567';
  const whatsappUrl = createWhatsAppLink(
    whatsappNumber,
    'Hola Manaure Vive, deseo información sobre la próxima edición de la Gran Rifa Ecoturística.'
  );

  return (
    <div className={styles.closedPortalContainer}>
      {/* ── Fondo con degradado ambiental y marca de agua del logo ── */}
      <div className={styles.ambientBackground} aria-hidden="true">
        <div className={styles.radialGlowTop} />
        <div className={styles.radialGlowBottom} />
        <img
          src={logoPrincipalCompleto.web}
          alt=""
          className={styles.logoWatermark}
          loading="eager"
        />
      </div>

      {/* ── Barra Superior Minimalista de Marca (Sustituye al Navbar estándar) ── */}
      <header className={styles.topBrandBar}>
        <div className={`container ${styles.topBarContainer}`}>
          <Link to="/" className={styles.brandLogoLink} title="Manaure Vive - Inicio">
            <img
              src={logoPrincipalCompleto.web}
              alt="Manaure Vive"
              className={styles.topBarLogo}
            />
          </Link>

          <Link
            to="/verificar"
            className={styles.topVerifyBtn}
            title="Consultar boletos adquiridos de cualquier sorteo"
          >
            <Search size={16} aria-hidden="true" />
            <span className={styles.topVerifyText}>Consultar mis Boletos</span>
          </Link>
        </div>
      </header>

      {/* ── Mensaje Principal Hero: Venta Concluida & Próxima Edición ── */}
      <section className={styles.heroSection} aria-labelledby="titulo-edicion-cerrada">
        <div className={`container ${styles.heroContent}`}>
          {/* Badge Dinámico de Estado */}
          <div className={styles.statusBadge} role="status">
            <Lock size={15} aria-hidden="true" />
            <span>Ventas Concluidas · Edición Cerrada</span>
          </div>

          {/* Gran Título Informativo y Dinámico */}
          <h1 id="titulo-edicion-cerrada" className={styles.mainTitle}>
            ¡Gracias por tu Participación!
            <span className={styles.accentGold}>Muy Pronto Nuestra Próxima Edición</span>
          </h1>

          {/* Mensaje descriptivo tranquilizador y de comunidad */}
          <p className={styles.mainDescription}>
            La emisión y venta de boletos para este sorteo ha finalizado oficialmente. Agradecemos
            profundamente a cada participante y comprador que se sumó a esta iniciativa en apoyo al
            turismo de naturaleza, aventura y cultura de <strong>Manaure Balcón del Cesar</strong>.
          </p>

          {/* Tarjeta de Expectativa / Novedades */}
          <div className={styles.expectationCard}>
            <div className={styles.expectationHeader}>
              <div className={styles.expectationIconWrap} aria-hidden="true">
                <Sparkles size={22} />
              </div>
              <div className={styles.expectationHeaderText}>
                <h2 className={styles.expectationTitle}>
                  Estamos preparando una nueva gran experiencia
                </h2>
                <span className={styles.expectationSubtitle}>
                  Nuevos premios, rutas campestres y sorpresas inolvidables
                </span>
              </div>
            </div>

            <p className={styles.expectationBody}>
              El equipo de Manaure Vive y nuestros aliados locales ya estamos trabajando en la
              siguiente edición. Mantente muy atento a nuestros canales oficiales para ser de los
              primeros en conocer la fecha de lanzamiento y asegurar tus números de la suerte.
            </p>

            <div className={styles.securityNote}>
              <ShieldCheck size={18} className={styles.securityIcon} aria-hidden="true" />
              <span>
                <strong>¿Ya compraste boletos en ediciones anteriores?</strong> Tus compras,
                comprobantes y boletos registrados continúan 100% seguros y certificados en la base de
                datos oficial. Puedes consultarlos y descargar tu comprobante digital en cualquier
                momento.
              </span>
            </div>
          </div>

          {/* Fila de Botones de Acción */}
          <div className={styles.actionsRow}>
            <Button
              as="a"
              href="/verificar"
              variant="primary"
              size="lg"
              leftIcon={<Search size={18} aria-hidden="true" />}
              className={styles.btnPrimaryAction}
            >
              Consultar Boletos Adquiridos
            </Button>

            <Button
              as="a"
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="accent"
              size="lg"
              leftIcon={<MessageCircle size={18} aria-hidden="true" />}
              className={styles.btnSecondaryAction}
            >
              Contactar por WhatsApp
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};
