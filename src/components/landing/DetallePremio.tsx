import React, { useState, useEffect } from 'react';
import { getCachedPrizeDetails, getPublicPrizeDetails } from '@/services/prizeService';
import type { PublicPrizeData, PrizeExperienceRow } from '@/types/raffle.types';
import { imageAliases, imageManifest } from '@/types/image-manifest';
import {
  Sparkles,
  Flame,
  Wind,
  Mountain,
  Utensils,
  Camera,
  Users,
  Tent,
  Compass,
  Heart,
  Plane,
  Palmtree,
  MapPin,
} from 'lucide-react';
import { SectionHeader } from '@/components/public/ui';
import { ResponsiveImage } from '@/components/common/ResponsiveImage';
import styles from './DetallePremio.module.css';

function renderExperienceIcon(iconName: string): React.ReactNode {
  switch (iconName) {
    case 'Flame':
      return <Flame size={24} aria-hidden="true" />;
    case 'Wind':
      return <Wind size={24} aria-hidden="true" />;
    case 'Mountain':
      return <Mountain size={24} aria-hidden="true" />;
    case 'Utensils':
      return <Utensils size={24} aria-hidden="true" />;
    case 'Camera':
      return <Camera size={24} aria-hidden="true" />;
    case 'Tent':
      return <Tent size={24} aria-hidden="true" />;
    case 'Compass':
      return <Compass size={24} aria-hidden="true" />;
    case 'Heart':
      return <Heart size={24} aria-hidden="true" />;
    case 'Plane':
      return <Plane size={24} aria-hidden="true" />;
    case 'Palmtree':
      return <Palmtree size={24} aria-hidden="true" />;
    case 'MapPin':
      return <MapPin size={24} aria-hidden="true" />;
    case 'Sparkles':
    default:
      return <Sparkles size={24} aria-hidden="true" />;
  }
}

type CardFit = 'cover' | 'contain' | 'asis';

function getCardImageData(slug: string | null, title: string) {
  const canonicalId = imageAliases[slug || ''] || slug || 'cuatrimoto-aventura-cordillera';
  const entry = imageManifest[canonicalId];

  const fit = (entry?.card?.fit as CardFit | undefined) || 'cover';
  const focal = entry?.card?.focal || entry?.focalPoint || { x: 0.5, y: 0.5 };
  const dominantColor = entry?.dominantColor || entry?.card?.dominantColor || '#0f2e1d';

  let primarySrc = entry?.variants.find((variant) => variant.role === 'tarjeta')?.jpg.url;
  const fullSrc = entry?.variants.find((variant) => variant.role === 'lightbox')?.jpg.url || primarySrc;

  if (fit === 'contain') {
    primarySrc = fullSrc || primarySrc || '/images/rifa/gastronomia/gastronomia-local.jpg';
  }

  if (fit === 'asis') {
    primarySrc = '/images/rifa/gastronomia/gastronomia-local.jpg';
  }

  return {
    fit,
    slug: canonicalId,
    focalX: focal.x,
    focalY: focal.y,
    dominantColor,
    primarySrc,
    backdropSrc: primarySrc || '/images/rifa/gastronomia/gastronomia-local.jpg',
    alt: title,
  };
}

export const DetallePremio: React.FC = () => {
  const [prizeData, setPrizeData] = useState<PublicPrizeData>(() => getCachedPrizeDetails());

  useEffect(() => {
    let isMounted = true;
    getPublicPrizeDetails()
      .then((data) => {
        if (isMounted && data) {
          setPrizeData(data);
        }
      })
      .catch((err) => {
        console.warn('[DetallePremio] Error al sincronizar con el servidor:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const { settings, experiences } = prizeData;

  const getEffectiveSlug = (slug: string | null, id: string): string => {
    const map: Record<string, string> = {
      'exp-cuatrimotos': 'cuatrimoto-aventura-cordillera',
      'exp-glamping': 'fogata-casa-de-vidrio',
      'exp-parapente': 'parapente-bandera',
      'exp-paramo': 'serrania-perija-laguna',
      'exp-gastronomia': 'gastronomia-local',
      'exp-fotografia': 'cuatrimoto-mirador',
    };

    if (slug && slug.trim()) {
      return slug.trim();
    }

    return map[id] || 'cuatrimoto-aventura-cordillera';
  };

  const renderSectionTitle = (rawTitle: string) => {
    if (rawTitle.includes('Premio Mayor')) {
      const parts = rawTitle.split('Premio Mayor');
      return (
        <>
          {parts[0]}
          <span className="highlight-text">Premio Mayor</span>
          {parts[1]}
        </>
      );
    }
    return rawTitle;
  };

  return (
    <section id="premio" className={styles.premioSection} aria-labelledby="titulo-premio">
      <div className="container">
        <SectionHeader
          id="titulo-premio"
          badge={settings.badge_text}
          icon={<Users size={16} aria-hidden="true" />}
          title={renderSectionTitle(settings.title)}
          subtitle={settings.subtitle}
        />

        <div className={styles.grid}>
          {experiences.map((exp: PrizeExperienceRow, idx: number) => {
            const featuresList = Array.isArray(exp.features) ? (exp.features as string[]) : [];
            const displayNum = exp.display_order
              ? exp.display_order < 10
                ? `0${exp.display_order}`
                : `${exp.display_order}`
              : `0${idx + 1}`;
            const media = getCardImageData(getEffectiveSlug(exp.image_slug, exp.id), exp.title);

            return (
              <article key={exp.id} className={styles.card}>
                <div
                  className={styles.cardMedia}
                  data-fit={media.fit}
                  style={{
                    ['--dominant' as string]: media.dominantColor,
                    ['--focal-x' as string]: `${media.focalX * 100}%`,
                    ['--focal-y' as string]: `${media.focalY * 100}%`,
                  }}
                >
                  {media.fit !== 'cover' && (
                    <img
                      src={media.backdropSrc}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                      className={styles.backdrop}
                    />
                  )}

                  {media.fit === 'asis' ? (
                    <img
                      src={media.primarySrc}
                      alt={media.alt}
                      width={710}
                      height={960}
                      loading="lazy"
                      decoding="async"
                      className={styles.foreground}
                      style={{ objectPosition: 'center top' }}
                    />
                  ) : (
                    <ResponsiveImage
                      id={media.slug}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
                      variantRole={media.fit === 'contain' ? 'lightbox' : 'tarjeta'}
                      ratio={media.fit === 'contain' ? 'full' : '4x5'}
                      className={styles.foreground}
                      imgClassName={styles.foregroundImage}
                      alt={media.alt}
                      objectPosition={`${media.focalX * 100}% ${media.focalY * 100}%`}
                    />
                  )}

                  <div className={styles.cardScrim} />
                </div>

                <div className={styles.cardInner}>
                  <div className={styles.cardTopBar}>
                    <div className={styles.topBarRow}>
                      <span className={styles.pillDarkGold}>{`EXPERIENCIA ${displayNum}`}</span>
                      <div className={styles.topGlassBadge} aria-hidden="true">
                        <Compass size={16} />
                      </div>
                    </div>
                    {exp.partner_name && (
                      <div className={styles.partnerRow}>
                        <span className={styles.pillSolidAmber}>{exp.partner_name}</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.cardBody}>
                    <div className={styles.titleGlassIcon} aria-hidden="true">
                      {renderExperienceIcon(exp.icon)}
                    </div>
                    <h3 className={styles.cardTitle}>{exp.title}</h3>

                    <p className={styles.cardDescription}>{exp.description}</p>

                    {featuresList.length > 0 && (
                      <>
                        <hr className={styles.divider} />
                        <ul className={styles.featureList}>
                          {featuresList.map((feat, fIdx) => (
                            <li key={fIdx} className={styles.featureItem}>
                              <Sparkles size={16} aria-hidden="true" className={styles.featureIcon} />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};
