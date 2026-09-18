import React from 'react';
import { fotos } from '@/assets/assets';
import {
  Sparkles,
  Flame,
  Wind,
  Mountain,
  Utensils,
  Camera,
  CheckCircle2,
  Users,
} from 'lucide-react';
import styles from './DetallePremio.module.css';

interface ExperienciaCard {
  id: string;
  icon: React.ReactNode;
  title: string;
  partner: string;
  description: string;
  imageSlug: string;
  features: string[];
}

const experiencias: ExperienciaCard[] = [
  {
    id: 'cuatrimotos',
    icon: <Sparkles size={24} />,
    title: 'Tour en Cuatrimoto por Trochas',
    partner: 'Cuatri Tours Manaure',
    description:
      'Recorrido guiado en cuatrimotos todoterreno por caminos veredales y miradores panorámicos de la Serranía.',
    imageSlug: 'cuatrimoto-flota',
    features: [
      'Equipamiento de seguridad incluido',
      'Guía turístico certificado',
      'Paradas en miradores fotográficos',
    ],
  },
  {
    id: 'glamping',
    icon: <Flame size={24} />,
    title: 'Noche de Glamping & Fogata',
    partner: 'Mashiramo Glamping / Villa Adelaida',
    description:
      'Alojamiento exclusivo bajo las estrellas con fogata privada en mirador y desayuno campestre.',
    imageSlug: 'fogata-casa-de-vidrio',
    features: [
      'Cama King-size & Jacuzzi',
      'Fogata con malvaviscos y vino',
      'Vista panorámica nocturna',
    ],
  },
  {
    id: 'parapente',
    icon: <Wind size={24} />,
    title: 'Vuelo en Parapente Tándem',
    partner: 'Manaure Aventura',
    description:
      'Experiencia inolvidable de vuelo libre sobre el valle de Manaure con piloto profesional certificado.',
    imageSlug: 'parapente-bandera',
    features: [
      'Pilotos con licencia FAI/Aeroclub',
      'Grabación de video en vuelo',
      'Charla técnica y seguros',
    ],
  },
  {
    id: 'paramo',
    icon: <Mountain size={24} />,
    title: 'Expedición a la Serranía del Perijá',
    partner: 'Los Pinos Manaure & Metallura',
    description: 'Caminata ecológica por el ecosistema de frailejones y lagunas de alta montaña.',
    imageSlug: 'serrania-perija-laguna',
    features: [
      'Avistamiento de aves endémicas',
      'Interpretación ambiental',
      'Refrigerio de montaña',
    ],
  },
  {
    id: 'gastronomia',
    icon: <Utensils size={24} />,
    title: 'Tour Gastronómico Local',
    partner: 'La Casa de las Arepas & Absolom',
    description:
      'Degustación de arepas típicas rellenas, dulces tradicionales de mora y café de altura cosechado en Perijá.',
    imageSlug: 'serrania-perija-panoramica',
    features: [
      'Almuerzo típico completo',
      'Degustación de postres de mora',
      'Café especial de origen',
    ],
  },
  {
    id: 'fotografia',
    icon: <Camera size={24} />,
    title: 'Registro Fotográfico Pro',
    partner: 'PHOTours',
    description:
      'Acompañamiento audiovisual durante las actividades para que te lleves recuerdos inolvidables en alta resolución.',
    imageSlug: 'cuatrimoto-mirador',
    features: [
      'Galería digital entregada en 48h',
      'Edición profesional de color',
      'Reel editado para redes sociales',
    ],
  },
];

export const DetallePremio: React.FC = () => {
  const getFoto = (slug: string) => fotos.find((f) => f.slug === slug) || fotos[0];

  return (
    <section id="premio" className={styles.premioSection}>
      <div className="container">
        {/* Cabecera de la Sección */}
        <div className={styles.header}>
          <div className={styles.badge}>
            <Users size={16} />
            <span>Paquete Todo Incluido para 2 Personas</span>
          </div>
          <h2 className={styles.title}>
            ¿Qué incluye el <span className="highlight-text">Premio Mayor</span>?
          </h2>
          <p className={styles.subtitle}>
            Una vivencia integral que reúne la mejor hotelería campestre, aventura extrema y la
            riqueza cultural y gastronómica de Manaure.
          </p>
        </div>

        {/* Grilla de Experiencias */}
        <div className={styles.grid}>
          {experiencias.map((exp) => {
            const fotoObj = getFoto(exp.imageSlug);
            return (
              <article key={exp.id} className={styles.card}>
                <div className={styles.imageWrapper}>
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
                  <div className={styles.partnerTag}>
                    <span>{exp.partner}</span>
                  </div>
                </div>

                <div className={styles.cardContent}>
                  <div className={styles.cardHeader}>
                    <div className={styles.iconBox}>{exp.icon}</div>
                    <h3 className={styles.cardTitle}>{exp.title}</h3>
                  </div>

                  <p className={styles.cardDescription}>{exp.description}</p>

                  <ul className={styles.featureList}>
                    {exp.features.map((feat, idx) => (
                      <li key={idx} className={styles.featureItem}>
                        <CheckCircle2 size={16} className={styles.checkIcon} />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};
