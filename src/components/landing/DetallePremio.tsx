import React, { useState, useEffect } from 'react';
import { getCachedPrizeDetails, getPublicPrizeDetails } from '@/services/prizeService';
import type { PublicPrizeData, PrizeExperienceRow } from '@/types/raffle.types';
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

export const DetallePremio: React.FC = () => {
  // Inicialización sincrónica desde caché para eliminar cualquier parpadeo de carga (FOUC)
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
    // Mapeo defensivo si Supabase tiene slugs obsoletos o parches temporales
    if (id === 'exp-gastronomia' && (slug === 'serrania-perija-panoramica' || !slug)) {
      return 'gastronomia-casa-arepas';
    }
    if (id === 'exp-fotografia' && (slug === 'cuatrimoto-mirador' || !slug)) {
      return 'serrania-topiarios';
    }
    if (id === 'exp-cuatrimotos' && (slug === 'cuatrimoto-flota' || !slug)) {
      return 'cuatrimoto-aventura-cordillera';
    }
    if (id === 'exp-glamping' && (!slug || slug === 'fogata-casa-de-vidrio')) {
      return 'hospedaje-villa-adelaida';
    }
    return slug || 'cuatrimoto-aventura-cordillera';
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
        {/* Cabecera de la Sección */}
        <SectionHeader
          id="titulo-premio"
          badge={settings.badge_text}
          icon={<Users size={16} aria-hidden="true" />}
          title={renderSectionTitle(settings.title)}
          subtitle={settings.subtitle}
        />

        {/* Grilla de Experiencias de Igual Altura */}
        <div className={styles.grid}>
          {experiences.map((exp: PrizeExperienceRow, idx: number) => {
            const featuresList = Array.isArray(exp.features) ? (exp.features as string[]) : [];
            const displayNum = exp.display_order
              ? exp.display_order < 10
                ? `0${exp.display_order}`
                : `${exp.display_order}`
              : `0${idx + 1}`;

            return (
              <article key={exp.id} className={styles.card}>
                {/* Fondo de pantalla completa con <picture> optimizada y degradado atmosférico continuo */}
                <div className={styles.cardMedia}>
                  {exp.image_url ? (
                    <img
                      src={exp.image_url}
                      alt={exp.title}
                      width={1080}
                      height={1350}
                      loading="lazy"
                      decoding="async"
                      className={styles.cardBgImage}
                    />
                  ) : (
                    <ResponsiveImage
                      id={getEffectiveSlug(exp.image_slug, exp.id)}
                      ratio="4x5"
                      role="tarjeta"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
                      imgClassName={styles.cardBgImage}
                      alt={exp.title}
                    />
                  )}
                  <div className={styles.cardScrim} />
                </div>

                {/* Contenedor interno unificado sobre la fotografía con degradado */}
                <div className={styles.cardInner}>
                  {/* Barra superior con píldoras de alto contraste y badge de vidrio reacomodados para lectura completa */}
                  <div className={styles.cardTopBar}>
                    <div className={styles.topBarRow}>
                      <span className={styles.pillDarkGold}>
                        {`EXPERIENCIA ${displayNum}`}
                      </span>
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

                  {/* Cuerpo inferior: squircle de vidrio con icono arriba, título serif de ancho completo para lectura perfecta */}
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
