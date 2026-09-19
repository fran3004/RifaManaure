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
  CheckCircle2,
  Users,
  Tent,
  Compass,
  Heart,
} from 'lucide-react';
import { SectionHeader, Pill } from '@/components/public/ui';
import styles from './DetallePremio.module.css';

function renderExperienceIcon(iconName: string): React.ReactNode {
  switch (iconName) {
    case 'Flame':
      return <Flame size={22} aria-hidden="true" />;
    case 'Wind':
      return <Wind size={22} aria-hidden="true" />;
    case 'Mountain':
      return <Mountain size={22} aria-hidden="true" />;
    case 'Utensils':
      return <Utensils size={22} aria-hidden="true" />;
    case 'Camera':
      return <Camera size={22} aria-hidden="true" />;
    case 'Tent':
      return <Tent size={22} aria-hidden="true" />;
    case 'Compass':
      return <Compass size={22} aria-hidden="true" />;
    case 'Heart':
      return <Heart size={22} aria-hidden="true" />;
    case 'Sparkles':
    default:
      return <Sparkles size={22} aria-hidden="true" />;
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
    if (!slug) return fotos[0];
    return fotos.find((f) => f.slug === slug) || fotos[0];
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

            return (
              <article key={exp.id} className={styles.card}>
                {/* Fondo de pantalla completa con <picture> y degradado oscuro continuo */}
                <div className={styles.cardMedia}>
                  {exp.image_url ? (
                    <img
                      src={exp.image_url}
                      alt={exp.title}
                      width={1200}
                      height={800}
                      loading="lazy"
                      className={styles.cardBgImage}
                    />
                  ) : (
                    <picture>
                      <source srcSet={fotoObj.card} type="image/webp" />
                      <img
                        src={fotoObj.cardJpg}
                        alt={fotoObj.alt}
                        width={1200}
                        height={800}
                        loading="lazy"
                        className={styles.cardBgImage}
                      />
                    </picture>
                  )}
                  <div className={styles.cardScrim} />
                </div>

                {/* Barra superior con píldoras e icono decorativo */}
                <div className={styles.cardTopBar}>
                  <div className={styles.pillsGroup}>
                    <Pill variant="dark">
                      {exp.display_order ? `Experiencia 0${exp.display_order}` : `Experiencia 0${idx + 1}`}
                    </Pill>
                    {exp.partner_name && (
                      <Pill variant="accent">{exp.partner_name}</Pill>
                    )}
                  </div>
                  <div className={styles.topIconBox} aria-hidden="true">
                    {renderExperienceIcon(exp.icon)}
                  </div>
                </div>

                {/* Panel de contenido oscurecido para máxima legibilidad sobre cualquier fotografía */}
                <div className={styles.contentPanel}>
                  <h3 className={styles.cardTitle}>{exp.title}</h3>
                  <p className={styles.cardDescription}>{exp.description}</p>

                  {featuresList.length > 0 && (
                    <>
                      <hr className={styles.divider} />
                      <ul className={styles.featureList}>
                        {featuresList.map((feat, fIdx) => (
                          <li key={fIdx} className={styles.featureItem}>
                            <CheckCircle2 size={18} aria-hidden="true" className={styles.checkIcon} />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};
