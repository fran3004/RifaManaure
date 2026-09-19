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
        <div className={styles.header}>
          <div className={styles.badge}>
            <Users size={16} aria-hidden="true" />
            <span>{settings.badge_text}</span>
          </div>
          <h2 id="titulo-premio" className={styles.title}>{renderSectionTitle(settings.title)}</h2>
          <p className={styles.subtitle}>{settings.subtitle}</p>
        </div>

        {/* Grilla de Experiencias */}
        <div className={styles.grid}>
          {experiences.map((exp: PrizeExperienceRow) => {
            const fotoObj = getFoto(exp.image_slug);
            const featuresList = Array.isArray(exp.features) ? (exp.features as string[]) : [];

            return (
              <article key={exp.id} className={styles.card}>
                <div className={styles.imageWrapper}>
                  {exp.image_url ? (
                    <img
                      src={exp.image_url}
                      alt={exp.title}
                      width={1200}
                      height={800}
                      loading="lazy"
                      className={styles.image}
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
                        className={styles.image}
                      />
                    </picture>
                  )}
                  <div className={styles.partnerTag}>
                    <span>{exp.partner_name}</span>
                  </div>
                </div>

                <div className={styles.cardContent}>
                  <div className={styles.cardHeader}>
                    <div className={styles.iconBox}>{renderExperienceIcon(exp.icon)}</div>
                    <h3 className={styles.cardTitle}>{exp.title}</h3>
                  </div>

                  <p className={styles.cardDescription}>{exp.description}</p>

                  {featuresList.length > 0 && (
                    <ul className={styles.featureList}>
                      {featuresList.map((feat, idx) => (
                        <li key={idx} className={styles.featureItem}>
                          <CheckCircle2 size={16} aria-hidden="true" className={styles.checkIcon} />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
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
