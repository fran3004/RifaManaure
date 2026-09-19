import React from 'react';
import { fotosParaHero } from '@/assets/assets';
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
} from 'lucide-react';
import { formatCOP } from '@/lib/utils';
import { useTicketCart } from '@/context/useTicketCart';
import { useTicketStats } from '@/hooks/useTicketStats';
import { formatTicketCount } from '@/config/ticketSocialProof';
import { Button } from '@/components/public/ui/Button';
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
  const { raffle, unitPrice, isLoading } = useTicketCart();
  const stats = useTicketStats();

  const isPaused = raffle?.status === 'paused';
  const isClosed = raffle?.status === 'closed' || raffle?.status === 'finished';

  const ticketPrice =
    propTicketPrice ?? (raffle?.ticket_price ? Number(raffle.ticket_price) : unitPrice);
  const drawDateFormatted = propDrawDate ?? formatDrawDate(raffle?.draw_date);
  const lotteryReference =
    propLottery ?? (raffle?.lottery_reference || 'Lotería de Santander (3 cifras)');

  const isColdLoading = isLoading && !raffle;

  const heroImage = fotosParaHero[0] || {
    hero: '',
    heroJpg: '',
    alt: 'Cuatrimotos en Manaure Balcón del Cesar',
  };

  const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.pushState(null, '', `/#${targetId}`);
    }
  };

  return (
    <section className={styles.heroSection} aria-label="Introducción al Gran Sorteo Ecoturístico">
      {/* Fondo de pantalla completa con <picture> optimizado */}
      <div className={styles.bgWrapper}>
        <picture>
          <source srcSet={heroImage.hero} type="image/webp" />
          <img
            src={heroImage.heroJpg}
            alt={heroImage.alt}
            width={1920}
            height={1080}
            className={styles.bgImage}
            loading="eager"
            fetchPriority="high"
          />
        </picture>
        <div className={styles.gradientOverlay} />
      </div>

      <div className={`container ${styles.contentContainer}`}>
        {/* Badge superior con estado de la rifa */}
        {isColdLoading ? (
          <div className={styles.skeletonBadge} aria-hidden="true" />
        ) : isPaused ? (
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

        {/* Titular Impactante */}
        {isColdLoading ? (
          <div className={styles.skeletonTitle} aria-hidden="true" />
        ) : (
          <h1 className={styles.title}>{raffle?.title || 'Gran Rifa Ecoturística Manaure Vive'}</h1>
        )}

        {/* Subtítulo Descriptivo */}
        {isColdLoading ? (
          <div className={styles.skeletonSubtitle} aria-hidden="true" />
        ) : (
          <p className={styles.subtitle}>
            {raffle?.description ||
              'Gana una experiencia ecoturística todo incluido para 2 personas en Manaure (Balcón del Cesar): Hospedaje en Glamping de lujo, Tour en Cuatrimoto por la Serranía del Perijá, Vuelo en Parapente, Cena Gourmet y Fotografía Profesional.'}
          </p>
        )}

        {/* Tarjeta de Precios, CTAs y Progreso Real de Boletos */}
        <div className={styles.ctaBox}>
          <div className={styles.ctaMainRow}>
            <div className={styles.priceTag}>
              <span className={styles.priceLabel}>Valor por Boleto</span>
              {isColdLoading || ticketPrice <= 0 ? (
                <div className={styles.skeletonPrice} aria-hidden="true" />
              ) : (
                <strong className={styles.priceValue}>{formatCOP(ticketPrice)}</strong>
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
                  >
                    <div
                      className={styles.progressSold}
                      style={{ width: `${Math.min(stats.percentageSold, 100)}%` }}
                    />
                    {stats.percentageReserved > 0 && (
                      <div
                        className={styles.progressReserved}
                        style={{
                          width: `${Math.min(stats.percentageReserved, 100 - stats.percentageSold)}%`,
                        }}
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
