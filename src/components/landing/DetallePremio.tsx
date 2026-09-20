import React, { useState, useEffect } from 'react';
import { fotos } from '@/assets/assets';
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

  const getFoto = (slug: string | null) => {
    // Para cuatrimoto, 'cuatrimoto-ruta' ofrece un fondo de cordillera y naturaleza con óptimo contraste
    const effectiveSlug = slug === 'cuatrimoto-flota' ? 'cuatrimoto-ruta' : slug;
    if (!effectiveSlug) return fotos[0];
    return fotos.find((f) => f.slug === effectiveSlug) || fotos[0];
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
            const fotoObj = getFoto(exp.image_slug);
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
                      className={styles.cardBgImage}
                    />
                  ) : (
                    <picture>
                      {fotoObj.movil && (
                        <source srcSet={fotoObj.movil} type="image/webp" />
                      )}
                      <source srcSet={fotoObj.card} type="image/webp" />
                      <img
                        src={fotoObj.movilJpg || fotoObj.cardJpg}
                        alt={fotoObj.alt}
                        width={1080}
                        height={1350}
                        loading="lazy"
                        className={styles.cardBgImage}
                      />
                    </picture>
                  )}
                  <div className={styles.cardScrim} />
                </div>

                {/* Contenedor interno unificado sobre la fotografía con degradado */}
                <div className={styles.cardInner}>
                  {/* Barra superior con píldoras de alto contraste y badge de vidrio */}
                  <div className={styles.cardTopBar}>
                    <div className={styles.pillsGroup}>
                      <span className={styles.pillDarkGold}>
                        {`EXPERIENCIA ${displayNum}`}
                      </span>
                      {exp.partner_name ? (
                        <span className={styles.pillSolidAmber}>{exp.partner_name}</span>
                      ) : (
                        <span className={styles.pillSolidAmber}>COBERTURA PAREJA</span>
                      )}
                    </div>
                    <div className={styles.topGlassBadge} aria-hidden="true">
                      <Compass size={16} />
                    </div>
                  </div>

                  {/* Cuerpo inferior: squircle de vidrio con icono, título serif, descripción y lista de inclusiones */}
                  <div className={styles.cardBody}>
                    <div className={styles.titleRow}>
                      <div className={styles.titleGlassIcon} aria-hidden="true">
                        {renderExperienceIcon(exp.icon)}
                      </div>
                      <h3 className={styles.cardTitle}>{exp.title}</h3>
                    </div>

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
