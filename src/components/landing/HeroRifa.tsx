import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fotosHeroCarousel, type HeroSlideFoto } from '@/assets/assets';
import {
  Ticket,
  Sparkles,
  Trophy,
  Calendar,
  ShieldCheck,
  MapPin,
  AlertCircle,
  PauseCircle,
  Flame,
  Compass,
} from 'lucide-react';
import { formatCOP } from '@/lib/utils';
import { useTicketCart } from '@/context/useTicketCart';
import { useTicketStats } from '@/hooks/useTicketStats';
import { formatTicketCount } from '@/config/ticketSocialProof';
import { Button } from '@/components/public/ui/Button';
import { ResponsiveImage } from '@/components/common/ResponsiveImage';
import { getPublicHeroSlides } from '@/services/heroSlideService';
import { getHeroSlideResponsiveUrls } from '@/services/cloudinaryService';
import { imageManifest, imageAliases } from '@/types/image-manifest';
import type { HeroSlideRow } from '@/types/raffle.types';
import styles from './HeroRifa.module.css';

interface HeroRifaProps {
  ticketPrice?: number;
  drawDateFormatted?: string;
  lotteryReference?: string;
}

function formatDrawDate(dateString?: string | null): string {
  if (!dateString) return 'Fecha por definir';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const formatted = date.toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    // Primera letra del mes en mayúscula
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return dateString;
  }
}

export const HeroRifa: React.FC<HeroRifaProps> = ({
  ticketPrice: propTicketPrice,
  drawDateFormatted: propDrawDate,
  lotteryReference: propLottery,
}) => {
  const { raffle, unitPrice } = useTicketCart();
  const stats = useTicketStats();

  const isPaused = raffle?.status === 'paused';
  const isClosed = raffle?.status === 'closed' || raffle?.status === 'finished';

  const ticketPrice =
    propTicketPrice ?? (raffle?.ticket_price ? Number(raffle.ticket_price) : unitPrice);
  const drawDateFormatted = propDrawDate ?? formatDrawDate(raffle?.draw_date);
  const lotteryReference =
    propLottery ?? (raffle?.lottery_reference?.trim() || 'Lotería Oficial');

  // --- Estado del Carrusel de Fondo Automático y Dinámico ---
  const [dynamicSlides, setDynamicSlides] = useState<HeroSlideRow[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    let isMounted = true;
    getPublicHeroSlides()
      .then((data) => {
        if (isMounted && data && data.length > 0) {
          setDynamicSlides(data);
        }
      })
      .catch((err) => {
        console.warn('[HeroRifa] Usando fotos canónicas de respaldo:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const slides: Array<HeroSlideRow | HeroSlideFoto> =
    dynamicSlides.length > 0
      ? dynamicSlides
      : fotosHeroCarousel.length > 0
      ? fotosHeroCarousel
      : [];

  // Referencias para gestos táctiles en móvil (swipe táctil opcional)
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const goToNextSlide = useCallback(() => {
    if (slides.length <= 1) return;
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const goToPrevSlide = useCallback(() => {
    if (slides.length <= 1) return;
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  // Rotación continua y automática de fotos cada 4.5s
  useEffect(() => {
    if (slides.length <= 1) return;

    // Respetar preferencia de movimiento reducido del sistema
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return;

    const interval = setInterval(() => {
      goToNextSlide();
    }, 4500);

    return () => clearInterval(interval);
  }, [slides.length, goToNextSlide]);

  // Manejo de gestos táctiles (Swipe)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    // Solo si el desplazamiento es predominantemente horizontal (> 40px)
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        goToNextSlide();
      } else {
        goToPrevSlide();
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.pushState(null, '', `/#${targetId}`);
    }
  };

  // Renderizado tipográfico del título con acento en "Manaure Vive"
  const rawTitle = raffle?.title || 'Gran Rifa Ecoturística Manaure Vive';
  const renderTitleContent = () => {
    const brandPhrase = 'Manaure Vive';
    if (rawTitle.includes(brandPhrase)) {
      const parts = rawTitle.split(brandPhrase);
      const leadText = parts[0].trim();
      const followText = parts.slice(1).join(brandPhrase).trim();
      return (
        <>
          <span className={styles.titleLead}>{leadText}</span>{' '}
          <span className={styles.titleAccent}>{brandPhrase}</span>
          {followText ? ` ${followText}` : ''}
        </>
      );
    }
    return rawTitle;
  };

  const activePhoto = slides[currentSlide];

  const progressStyle: React.CSSProperties | undefined = stats
    ? {
        ['--progress-sold-width' as string]: `${Math.min(stats.percentageSold, 100)}%`,
        ['--progress-reserved-width' as string]: `${Math.min(stats.percentageReserved, 100 - stats.percentageSold)}%`,
      }
    : undefined;

  return (
    <section
      className={styles.heroSection}
      aria-label="Introducción al Gran Sorteo Ecoturístico"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Fondo de pantalla completa con Carrusel Dinámico Responsive */}
      <div className={styles.bgWrapper}>
        <div className={styles.sliderContainer} aria-hidden="true">
          {slides.map((foto, index) => {
            const isActive = index === currentSlide;
            const slideId = 'id' in foto ? foto.id : (foto as any).slug;
            const slug = 'image_slug' in foto ? foto.image_slug : (foto as any).slug;
            const canonicalSlug = slug ? imageAliases[slug] || slug : '';
            const isManifestEntry = Boolean(canonicalSlug && imageManifest[canonicalSlug]);
            const rawUrl = 'image_url' in foto ? foto.image_url : (foto as any).full || '';
            const altText =
              ('alt_text' in foto ? foto.alt_text : (foto as any).alt) ||
              ('title' in foto ? foto.title : '');

            return (
              <div
                key={slideId || index}
                className={`${styles.slide} ${isActive ? styles.slideActive : ''}`}
                aria-hidden={!isActive}
              >
                {isManifestEntry ? (
                  <ResponsiveImage
                    id={canonicalSlug}
                    priority={index === 0}
                    variantRole="hero-desktop"
                    ratio="16x9"
                    sizes="100vw"
                    artDirection={[
                      {
                        media: '(max-width: 768px)',
                        variantRole: 'hero-mobile',
                        ratio: '4x5',
                        sizes: '100vw',
                      },
                      {
                        media: '(min-width: 769px)',
                        variantRole: 'hero-desktop',
                        ratio: '16x9',
                        sizes: '100vw',
                      },
                    ]}
                    imgClassName={styles.slideImage}
                    alt={altText}
                  />
                ) : (
                  <picture>
                    <source
                      media="(max-width: 768px)"
                      type="image/webp"
                      srcSet={getHeroSlideResponsiveUrls(rawUrl).mobile}
                    />
                    <source
                      media="(max-width: 768px)"
                      type="image/jpeg"
                      srcSet={getHeroSlideResponsiveUrls(rawUrl).mobileJpg}
                    />
                    <source
                      media="(min-width: 769px)"
                      type="image/webp"
                      srcSet={getHeroSlideResponsiveUrls(rawUrl).desktop}
                    />
                    <source
                      media="(min-width: 769px)"
                      type="image/jpeg"
                      srcSet={getHeroSlideResponsiveUrls(rawUrl).desktopJpg}
                    />
                    <img
                      src={getHeroSlideResponsiveUrls(rawUrl).desktopJpg || rawUrl}
                      alt={altText}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      fetchPriority={index === 0 ? 'high' : undefined}
                      className={styles.slideImage}
                    />
                  </picture>
                )}
              </div>
            );
          })}
        </div>

        {/* Degradado cinematográfico que asegura alto contraste sin opacar los colores naturales */}
        <div className={styles.gradientOverlay} />

        {/* Chip flotante con la experiencia activa en la fotografía */}
        {activePhoto && (
          <div className={styles.experienceChip} role="status" aria-live="polite">
            <Compass size={14} className={styles.experienceIcon} aria-hidden="true" />
            <span className={styles.experienceText}>
              {'tituloExperiencia' in activePhoto
                ? (activePhoto as any).tituloExperiencia
                : ('title' in activePhoto ? activePhoto.title : '')}
            </span>
          </div>
        )}
      </div>

      <div className={`container ${styles.contentContainer}`}>
        {/* Fila superior: Badge de estado */}
        <div className={styles.topMetaRow}>
          {isPaused ? (
            <div className={`${styles.badge} ${styles.badgePaused}`} role="status">
              <PauseCircle size={16} aria-hidden="true" className={styles.badgeIcon} />
              <span>Sorteo Temporalmente Pausado</span>
            </div>
          ) : isClosed ? (
            <div className={`${styles.badge} ${styles.badgeClosed}`} role="status">
              <AlertCircle size={16} aria-hidden="true" className={styles.badgeIcon} />
              <span>Edición Finalizada</span>
            </div>
          ) : (
            <div className={`${styles.badge} ${styles.badgeActive}`} role="status">
              <Sparkles size={16} aria-hidden="true" className={styles.badgeIcon} />
              <span>
                {raffle?.status === 'active' ? 'Sorteo Oficial Activo' : 'Gran Sorteo Manaure Vive'}
              </span>
            </div>
          )}
        </div>

        {/* Titular Impactante con Acento Dorado de Alto Contraste */}
        <h1 className={styles.title}>{renderTitleContent()}</h1>

        {/* Subtítulo Descriptivo con Legibilidad Garantizada */}
        <p className={styles.subtitle}>
          {raffle?.description ||
            'Gana una experiencia ecoturística todo incluido para 2 personas en Manaure (Balcón del Cesar): Hospedaje en Glamping de lujo, Tour en Cuatrimoto por la Serranía del Perijá, Vuelo en Parapente, Cena Gourmet y Fotografía Profesional.'}
        </p>

        {/* Tarjeta de Precios, CTAs y Progreso Real de Boletos */}
        <div className={styles.ctaBox}>
          <div className={styles.ctaMainRow}>
            <div className={styles.priceTag}>
              <span className={styles.priceLabel}>Valor por Boleto</span>
              {ticketPrice > 0 ? (
                <strong className={styles.priceValue}>{formatCOP(ticketPrice)}</strong>
              ) : (
                <strong className={styles.priceValue}>{formatCOP(40000)}</strong>
              )}
            </div>

            <div className={styles.ctaActions}>
              <Button
                as="a"
                href="#boletos"
                variant="primary"
                size="lg"
                leftIcon={<Ticket size={20} aria-hidden="true" />}
                disabled={isPaused || isClosed}
                className={styles.ctaBtnPrimary}
                onClick={(e) => {
                  if (isPaused || isClosed) {
                    e.preventDefault();
                    return;
                  }
                  handleScrollTo(e, 'boletos');
                }}
              >
                {isPaused ? 'Sorteo pausado' : isClosed ? 'Sorteo finalizado' : 'Elegir mis Boletos'}
              </Button>
              <Button
                as="a"
                href="#premio"
                variant="accent"
                size="lg"
                leftIcon={<MapPin size={20} aria-hidden="true" />}
                className={styles.ctaBtnSecondary}
                onClick={(e) => handleScrollTo(e, 'premio')}
              >
                Conocer el Premio
              </Button>
            </div>
          </div>

          {/* Bloque de Prueba Social Real */}
          {stats.isLoading ? (
            <div className={styles.socialProofSkeleton} aria-hidden="true">
              <div className={styles.skeletonProgressText} />
              <div className={styles.skeletonProgressBar} />
            </div>
          ) : stats.hasError || stats.total === 0 ? null : (
            <div className={styles.socialProofWrapper}>
              {stats.isEarlyStage ? (
                <div className={styles.socialProofEarly}>
                  <Sparkles size={16} aria-hidden="true" className={styles.earlyIcon} />
                  <span>¡Sé de los primeros en participar!</span>
                </div>
              ) : (
                <>
                  <div className={styles.socialProofHeader}>
                    <span className={styles.socialProofText}>
                      <strong>{formatTicketCount(stats.sold)}</strong> de{' '}
                      {formatTicketCount(stats.total)} boletos vendidos
                    </span>
                    {stats.isAlmostSoldOut && (
                      <span className={styles.almostSoldOutBadge}>
                        <Flame size={14} aria-hidden="true" /> ¡Últimos boletos disponibles!
                      </span>
                    )}
                  </div>

                  <div
                    className={styles.progressTrack}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={stats.total}
                    aria-valuenow={stats.sold}
                    aria-label={`Progreso del sorteo: ${formatTicketCount(stats.sold)} de ${formatTicketCount(stats.total)} boletos vendidos`}
                    style={progressStyle}
                  >
                    <div className={styles.progressSold} />
                    {stats.percentageReserved > 0 && (
                      <div
                        className={styles.progressReserved}
                        title={`${formatTicketCount(stats.reserved)} boletos reservados`}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Franja de Métricas y Transparencia (Trust Grid con solape inferior) */}
        <div className={styles.trustGrid}>
          <div className={styles.trustItem}>
            <div className={styles.trustIconWrapper} aria-hidden="true">
              <Trophy size={22} className={styles.trustIcon} />
            </div>
            <div className={styles.trustContent}>
              <strong className={styles.trustTitle}>Premio Mayor Exclusivo</strong>
              <span className={styles.trustSub}>Experiencia VIP para 2 personas</span>
            </div>
          </div>

          <div className={styles.trustItem}>
            <div className={styles.trustIconWrapper} aria-hidden="true">
              <Calendar size={22} className={styles.trustIcon} />
            </div>
            <div className={styles.trustContent}>
              <strong className={styles.trustTitle}>Fecha del Sorteo</strong>
              <span className={styles.trustSub}>{drawDateFormatted}</span>
            </div>
          </div>

          <div className={styles.trustItem}>
            <div className={styles.trustIconWrapper} aria-hidden="true">
              <ShieldCheck size={22} className={styles.trustIcon} />
            </div>
            <div className={styles.trustContent}>
              <strong className={styles.trustTitle}>Transparencia Garantizada</strong>
              <span className={styles.trustSub}>Juega con {lotteryReference}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
