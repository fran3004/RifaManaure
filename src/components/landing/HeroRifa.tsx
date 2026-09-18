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
} from 'lucide-react';
import { formatCOP } from '@/lib/utils';
import { useTicketCart } from '@/context/useTicketCart';
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

  return (
    <section className={styles.heroSection}>
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
          <div className={styles.skeletonBadge} />
        ) : isPaused ? (
          <div
            className={styles.badge}
            style={{
              borderColor: '#f59e0b',
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
            }}
          >
            <PauseCircle size={16} className={styles.badgeIcon} />
            <span>Sorteo Temporalmente Pausado</span>
          </div>
        ) : isClosed ? (
          <div
            className={styles.badge}
            style={{
              borderColor: '#64748b',
              background: 'rgba(100, 116, 139, 0.15)',
              color: '#94a3b8',
            }}
          >
            <AlertCircle size={16} className={styles.badgeIcon} />
            <span>Edición Finalizada</span>
          </div>
        ) : (
          <div className={styles.badge}>
            <Sparkles size={16} className={styles.badgeIcon} />
            <span>
              {raffle?.status === 'active' ? 'Sorteo Oficial Activo' : 'Gran Sorteo Manaure Vive'}
            </span>
          </div>
        )}

        {/* Titular Impactante */}
        {isColdLoading ? (
          <div className={styles.skeletonTitle} />
        ) : (
          <h1 className={styles.title}>{raffle?.title || 'Gran Rifa Ecoturística Manaure Vive'}</h1>
        )}

        {/* Subtítulo Descriptivo */}
        {isColdLoading ? (
          <div className={styles.skeletonSubtitle} />
        ) : (
          <p className={styles.subtitle}>
            {raffle?.description ||
              'Gana una experiencia ecoturística todo incluido para 2 personas en Manaure (Balcón del Cesar): Hospedaje en Glamping de lujo, Tour en Cuatrimoto por la Serranía del Perijá, Vuelo en Parapente, Cena Gourmet y Fotografía Profesional.'}
          </p>
        )}

        {/* Tarjeta de Precios y CTA */}
        <div className={styles.ctaBox}>
          <div className={styles.priceTag}>
            <span className={styles.priceLabel}>Valor por Boleto</span>
            {isColdLoading || ticketPrice <= 0 ? (
              <div className={styles.skeletonPrice} />
            ) : (
              <strong className={styles.priceValue}>{formatCOP(ticketPrice)}</strong>
            )}
          </div>

          <div className={styles.ctaActions}>
            <a
              href="#boletos"
              className={styles.btnPrimary}
              style={isPaused || isClosed ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
            >
              <Ticket size={20} />{' '}
              {isPaused ? 'Ventas Pausadas' : isClosed ? 'Sorteo Finalizado' : 'Elegir mis Boletos'}
            </a>
            <a href="#premio" className={styles.btnSecondary}>
              <MapPin size={20} /> Conocer el Premio
            </a>
          </div>
        </div>

        {/* Franja de Métricas y Transparencia */}
        <div className={styles.trustGrid}>
          <div className={styles.trustItem}>
            <div className={styles.trustIconWrapper}>
              <Trophy size={20} />
            </div>
            <div>
              <strong className={styles.trustTitle}>Premio Mayor Exclusivo</strong>
              <span className={styles.trustSub}>Experiencia VIP para 2 personas</span>
            </div>
          </div>

          <div className={styles.trustItem}>
            <div className={styles.trustIconWrapper}>
              <Calendar size={20} />
            </div>
            <div>
              <strong className={styles.trustTitle}>Fecha del Sorteo</strong>
              <span className={styles.trustSub}>{drawDateFormatted}</span>
            </div>
          </div>

          <div className={styles.trustItem}>
            <div className={styles.trustIconWrapper}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <strong className={styles.trustTitle}>Transparencia Garantizada</strong>
              <span className={styles.trustSub}>Juega con {lotteryReference}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
