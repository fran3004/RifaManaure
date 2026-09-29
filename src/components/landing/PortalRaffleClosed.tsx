import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Lock,
  Search,
  MessageCircle,
  Sparkles,
  ShieldCheck,
  Handshake,
  ExternalLink,
} from 'lucide-react';
import { logoPrincipalCompleto, aliados as fallbackAliados } from '@/assets/assets';
import { getActivePartners } from '@/services/partnerService';
import { getOptimizedCloudinaryUrl } from '@/services/cloudinaryService';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { createWhatsAppLink } from '@/lib/utils';
import { Button } from '@/components/public/ui/Button';
import type { PartnerRow } from '@/types/raffle.types';
import styles from './PortalRaffleClosed.module.css';

// Enlaces de Instagram de respaldo para aliados
const DEFAULT_INSTAGRAM_URLS: Record<string, string> = {
  photours: 'https://www.instagram.com/photour_?stkn=ZDNlZDc0MzIxNw==',
  'cuatri-tours-manaure': 'https://www.instagram.com/cuatritours_manaure?stkn=ZDNlZDc0MzIxNw==',
  'villa-adelaida': 'https://www.instagram.com/restaurantevilladelaida?stkn=ZDNlZDc0MzIxNw==',
  'absolom-casita-de-la-mora': 'https://www.instagram.com/lacasitadelamora?stkn=ZDNlZDc0MzIxNw==',
  'mashiramo-glamping': 'https://www.instagram.com/mashiramo_glamping?stkn=ZDNlZDc0MzIxNw==',
  'los-pinos-manaure': 'https://www.instagram.com/lospinosmanaure?stkn=ZDNlZDc0MzIxNw==',
  metallura: 'https://www.instagram.com/metalluraturismo?stkn=ZDNlZDc0MzIxNw==',
  'manaure-aventura': 'https://www.instagram.com/manaureaventura?stkn=ZDNlZDc0MzIxNw==',
  coruscans: 'https://www.instagram.com/elcoruscans?stkn=ZDNlZDc0MzIxNw==',
};

const localAliadosMap = new Map(
  fallbackAliados.map((a) => [
    a.slug,
    {
      grid: a.logoGrid,
      grid2x: a.logoGrid2x,
      name: a.nombre,
      category: a.categoria,
    },
  ])
);

export const PortalRaffleClosed: React.FC = () => {
  const systemSettings = useSystemSettings();
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [isLoadedFromDb, setIsLoadedFromDb] = useState(false);

  const whatsappNumber = systemSettings.support_whatsapp_number || '573001234567';
  const whatsappUrl = createWhatsAppLink(
    whatsappNumber,
    'Hola Manaure Vive, deseo información sobre la próxima edición de la Gran Rifa Ecoturística.'
  );

  useEffect(() => {
    let isMounted = true;
    getActivePartners()
      .then((data) => {
        if (isMounted && data && data.length > 0) {
          setPartners(data);
          setIsLoadedFromDb(true);
        }
      })
      .catch((err) => {
        console.warn('[PortalRaffleClosed] Usando catálogo local de aliados:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Lista normalizada de aliados
  const displayPartners = useMemo(() => {
    if (isLoadedFromDb && partners.length > 0) {
      return partners.map((p) => {
        const localAsset = localAliadosMap.get(p.slug);
        const hasCustomLogo = Boolean(p.logo_url && p.logo_url.trim() !== '');
        const instagramUrl = p.instagram_url?.trim() || DEFAULT_INSTAGRAM_URLS[p.slug] || '#';

        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          category: p.category,
          logoSrc: hasCustomLogo
            ? getOptimizedCloudinaryUrl(p.logo_url!, { width: 300 })
            : localAsset?.grid || '',
          instagramUrl,
        };
      });
    }

    return fallbackAliados.map((a) => ({
      id: a.slug,
      slug: a.slug,
      name: a.nombre,
      category: a.categoria,
      logoSrc: a.logoGrid,
      instagramUrl: DEFAULT_INSTAGRAM_URLS[a.slug] || '#',
    }));
  }, [isLoadedFromDb, partners]);

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
            <span>Consultar mis Boletos</span>
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

          {/* Gran Título Informativo y Llamativo */}
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
              <div>
                <h2 className={styles.expectationTitle}>
                  Estamos preparando una nueva gran experiencia
                </h2>
                <span className={styles.partnerCategory}>
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

      {/* ── Vitrina de Aliados Ecoturísticos (Diseño solemne y refinado) ── */}
      <section
        id="aliados"
        className={styles.partnersSection}
        aria-labelledby="titulo-aliados-cerrada"
      >
        <div className="container">
          <div className={styles.partnersHeader}>
            <div className={styles.partnersBadge}>
              <Handshake size={15} aria-hidden="true" />
              <span>Comunidad & Operadores</span>
            </div>
            <h2 id="titulo-aliados-cerrada" className={styles.partnersTitle}>
              Nuestra Red de Aliados Ecoturísticos
            </h2>
            <p className={styles.partnersSubtitle}>
              Empresas, operadores campestres y emprendimientos locales que impulsan el desarrollo
              sostenible y hacen posibles las experiencias en Manaure Balcón del Cesar.
            </p>
          </div>

          <div className={styles.partnersGrid}>
            {displayPartners.map((aliado) => (
              <a
                key={aliado.slug}
                href={aliado.instagramUrl}
                target={aliado.instagramUrl !== '#' ? '_blank' : undefined}
                rel={aliado.instagramUrl !== '#' ? 'noopener noreferrer' : undefined}
                className={styles.partnerCard}
                title={`Conocer a ${aliado.name} en Instagram`}
              >
                <div className={styles.partnerLogoWrap}>
                  <img
                    src={aliado.logoSrc}
                    alt={`Logo de ${aliado.name}`}
                    className={styles.partnerLogo}
                    loading="lazy"
                  />
                </div>
                <div className={styles.partnerInfo}>
                  <strong className={styles.partnerName}>{aliado.name}</strong>
                  <span className={styles.partnerCategory}>{aliado.category}</span>
                  <span className={styles.partnerLinkHint}>
                    <span>Ver perfil oficial</span>
                    <ExternalLink size={12} aria-hidden="true" />
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
