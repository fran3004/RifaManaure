/**
 * Inventario tipado y optimizado de assets (logos e imágenes) de "Manaure Vive".
 * Carga directa mediante Vite import.meta.glob para resolución de URLs en dev y build.
 */

import {
  getOptimizedCloudinaryUrl,
  getCloudinaryResponsiveUrl,
} from '@/services/cloudinaryService';

export type Aliado = {
  slug: string;
  nombre: string;
  categoria: string;
  logoWeb: string;
  logoGrid: string;
  logoGrid2x: string;
  logoMaster: string;
};

export type Foto = {
  slug: string;
  alt: string;
  experiencia: 'cuatrimoto' | 'parapente' | 'serrania' | 'fogata';
  hero: string;
  heroJpg: string;
  hero640?: string;
  hero1024?: string;
  hero1600?: string;
  hero2000?: string;
  heroSrcSet?: string;
  card: string;
  cardJpg: string;
  thumb: string;
  thumbJpg: string;
  movil: string;
  movilJpg: string;
  full: string;
  fullJpg: string;
  /** true = la version hero se armo a partir de una foto vertical con extension de bordes */
  heroExtendido: boolean;
};

// --- URLs de Marca Oficiales en Cloudinary CDN ---
const BRAND_LOGOS = {
  principal:
    'https://res.cloudinary.com/ky01b0vz/image/upload/v1790100541/manaure-vive/marca/logo-principal.png',
  completo:
    'https://res.cloudinary.com/ky01b0vz/image/upload/v1790100543/manaure-vive/marca/logo-principal-completo.png',
};

/** Versión simplificada: Isotipo colibrí + montaña + "MANAURE VIVE". Ideal para Header, Navbar, etc. */
export const logoPrincipal = {
  master: BRAND_LOGOS.principal,
  web: getOptimizedCloudinaryUrl(BRAND_LOGOS.principal, { width: 320 }),
  grid: getOptimizedCloudinaryUrl(BRAND_LOGOS.principal, { width: 400 }),
  grid2x: getOptimizedCloudinaryUrl(BRAND_LOGOS.principal, { width: 800 }),
};

/** Versión institucional completa con subtítulos y detalles ecoturísticos. */
export const logoPrincipalCompleto = {
  master: BRAND_LOGOS.completo,
  web: getOptimizedCloudinaryUrl(BRAND_LOGOS.completo, { width: 480 }),
  grid: getOptimizedCloudinaryUrl(BRAND_LOGOS.completo, { width: 400 }),
  grid2x: getOptimizedCloudinaryUrl(BRAND_LOGOS.completo, { width: 800 }),
};

const rawAliados: [string, string, string][] = [
  ['photours', 'PHOTours', 'Fotografía y contenido audiovisual'],
  ['cuatri-tours-manaure', 'Cuatri Tours Manaure', 'Aventura en cuatrimotos y rutas'],
  ['villa-adelaida', 'Villa Adelaida', 'Hospedaje campestre y ecoturismo'],
  ['absolom-casita-de-la-mora', 'Absolom - La Casita de la Mora', 'Sabores y dulces tradicionales'],
  ['los-pinos-manaure', 'Los Pinos Manaure', 'Mirador, naturaleza y paisajes'],
  ['mashiramo-glamping', 'Mashiramo Glamping', 'Glamping y descanso en la naturaleza'],
  ['la-casa-de-las-arepas', 'La Casa de las Arepas', 'Gastronomía típica local'],
  ['metallura', 'Metallura Nature Tourism', 'Avistamiento de aves (Birdwatching)'],
  ['manaure-aventura', 'Manaure Aventura', 'Deportes extremos y vuelos en parapente'],
  ['coruscans', 'Coruscans', 'Productos y artesanías locales'],
];

const CLOUDINARY_PARTNER_LOGOS: Record<string, string> = {
  photours:
    'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099148/manaure-vive/aliados/photours.png',
  'cuatri-tours-manaure':
    'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099151/manaure-vive/aliados/cuatri-tours-manaure.png',
  'villa-adelaida':
    'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099153/manaure-vive/aliados/villa-adelaida.png',
  'absolom-casita-de-la-mora':
    'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099155/manaure-vive/aliados/absolom-casita-de-la-mora.png',
  'los-pinos-manaure':
    'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099156/manaure-vive/aliados/los-pinos-manaure.png',
  'mashiramo-glamping':
    'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099158/manaure-vive/aliados/mashiramo-glamping.png',
  'la-casa-de-las-arepas':
    'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099159/manaure-vive/aliados/la-casa-de-las-arepas.png',
  metallura:
    'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099161/manaure-vive/aliados/metallura.png',
  'manaure-aventura':
    'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099162/manaure-vive/aliados/manaure-aventura.png',
  coruscans:
    'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099164/manaure-vive/aliados/coruscans.png',
};

export const aliados: Aliado[] = rawAliados.map(([slug, nombre, categoria]) => {
  const masterUrl = CLOUDINARY_PARTNER_LOGOS[slug] || '';
  return {
    slug,
    nombre,
    categoria,
    logoWeb: masterUrl ? getOptimizedCloudinaryUrl(masterUrl, { width: 600 }) : '',
    logoGrid: masterUrl ? getOptimizedCloudinaryUrl(masterUrl, { width: 400 }) : '',
    logoGrid2x: masterUrl ? getOptimizedCloudinaryUrl(masterUrl, { width: 800 }) : '',
    logoMaster: masterUrl,
  };
});

import { imageManifest, imageAliases, type ImageEntry } from '@/types/image-manifest';

// --- Constructor de Foto conectado a los activos optimizados de Cloudinary ---
const crearFoto = (
  slug: string,
  alt: string,
  experiencia: Foto['experiencia'],
  heroExtendido = false
): Foto => {
  const canonicalId = imageAliases[slug] || slug;
  const entry: ImageEntry | undefined = imageManifest[canonicalId];

  if (!entry || !entry.cloudinary) {
    return {
      slug,
      alt,
      experiencia,
      heroExtendido,
      hero: '',
      heroJpg: '',
      heroSrcSet: '',
      card: '',
      cardJpg: '',
      thumb: '',
      thumbJpg: '',
      movil: '',
      movilJpg: '',
      full: '',
      fullJpg: '',
    };
  }

  const secureUrl = entry.cloudinary.secureUrl;

  const hero = getCloudinaryResponsiveUrl(secureUrl, { width: 1920, height: 1080, format: 'webp' });
  const heroJpg = getCloudinaryResponsiveUrl(secureUrl, { width: 1920, height: 1080, format: 'jpg' });
  const h640 = getCloudinaryResponsiveUrl(secureUrl, { width: 640, height: 360, format: 'webp' });
  const h1024 = getCloudinaryResponsiveUrl(secureUrl, { width: 1024, height: 576, format: 'webp' });
  const h1600 = getCloudinaryResponsiveUrl(secureUrl, { width: 1600, height: 900, format: 'webp' });
  const h2000 = getCloudinaryResponsiveUrl(secureUrl, { width: 1920, height: 1080, format: 'webp' });
  const heroSrcSet = `${h640} 640w, ${h1024} 1024w, ${h1600} 1600w, ${h2000} 1920w`;

  const card = getCloudinaryResponsiveUrl(secureUrl, { width: 768, height: 960, format: 'webp' });
  const cardJpg = getCloudinaryResponsiveUrl(secureUrl, { width: 768, height: 960, format: 'jpg' });
  const thumb = getCloudinaryResponsiveUrl(secureUrl, { width: 640, height: 427, format: 'webp' });
  const thumbJpg = getCloudinaryResponsiveUrl(secureUrl, { width: 640, height: 427, format: 'jpg' });
  const movil = getCloudinaryResponsiveUrl(secureUrl, { width: 768, height: 960, format: 'webp' });
  const movilJpg = getCloudinaryResponsiveUrl(secureUrl, { width: 768, height: 960, format: 'jpg' });
  const full = getCloudinaryResponsiveUrl(secureUrl, { width: 1600, format: 'webp' });
  const fullJpg = getCloudinaryResponsiveUrl(secureUrl, { width: 1600, format: 'jpg' });

  return {
    slug,
    alt: alt || entry.alt,
    experiencia,
    heroExtendido,
    hero,
    heroJpg,
    hero640: h640,
    hero1024: h1024,
    hero1600: h1600,
    hero2000: h2000,
    heroSrcSet,
    card,
    cardJpg,
    thumb,
    thumbJpg,
    movil,
    movilJpg,
    full,
    fullJpg,
  };
};

export const fotos: Foto[] = [
  crearFoto(
    'cuatrimoto-flota',
    'Flota de cuatrimotos listas para el recorrido en Manaure',
    'cuatrimoto',
    false
  ),
  crearFoto(
    'serrania-perija-laguna',
    'Laguna natural en las alturas de la Serranía del Perijá',
    'serrania',
    false
  ),
  crearFoto(
    'fogata-casa-de-vidrio',
    'Fogata nocturna en el mirador de la Casa de Vidrio',
    'fogata',
    false
  ),
  crearFoto(
    'serrania-perija-frailejones',
    'Frailejones en el páramo de la Serranía del Perijá',
    'serrania',
    false
  ),
  crearFoto(
    'serrania-perija-panoramica',
    'Vista panorámica de la cordillera en Manaure Balcón del Cesar',
    'serrania',
    false
  ),
  crearFoto(
    'cuatrimoto-mirador',
    'Cuatrimoto en el mirador panorámico de Manaure',
    'cuatrimoto',
    true
  ),
  crearFoto(
    'cuatrimoto-ruta',
    'Recorrido en cuatrimoto por las trochas ecoturísticas',
    'cuatrimoto',
    true
  ),
  crearFoto(
    'parapente-bandera',
    'Vuelo en parapente con la bandera de Manaure Aventura',
    'parapente',
    true
  ),
  crearFoto(
    'parapente-vuelo',
    'Experiencia de vuelo libre en parapente sobre el valle',
    'parapente',
    true
  ),
];

/** Fotos nativas recomendadas para usar como fondo grande / hero de la rifa. */
export const fotosParaHero = fotos.filter((f) => !f.heroExtendido);

export interface HeroSlideFoto extends Foto {
  tituloExperiencia: string;
}

/** 4 fotografías estelares aprobadas para el carrusel interactivo del Hero (excluida parapente-vuelo por solicitud del usuario) */
export const fotosHeroCarousel: HeroSlideFoto[] = [
  {
    ...crearFoto(
      'og-image',
      'Majestuoso cañón montañoso y cordillera de la Serranía del Perijá bajo cielo azul despejado',
      'serrania'
    ),
    slug: 'og-image',
    tituloExperiencia: 'Serranía del Perijá',
  },
  {
    ...crearFoto(
      'cuatrimoto-aventura-cordillera',
      'Caravana de cuatrimotos todoterreno recorriendo la cresta de la Serranía del Perijá',
      'cuatrimoto'
    ),
    slug: 'cuatrimoto-aventura-cordillera',
    tituloExperiencia: 'Aventura en Cuatrimoto',
  },
  {
    ...crearFoto(
      'serrania-perija-laguna',
      'Laguna de alta montaña reflejando el cielo andino y la vegetación de páramo',
      'serrania'
    ),
    slug: 'serrania-perija-laguna',
    tituloExperiencia: 'Laguna Natural en Perijá',
  },
  {
    ...crearFoto(
      'fogata-casa-de-vidrio',
      'Fogata al atardecer en la terraza panorámica de la Casa de Vidrio',
      'fogata'
    ),
    slug: 'fogata-casa-de-vidrio',
    tituloExperiencia: 'Fogata en la Casa de Vidrio',
  },
].filter((f): f is HeroSlideFoto => Boolean(f && f.slug));

export interface CatalogoFotoItem {
  id: string;
  slug: string;
  alt: string;
  caption: string;
  categoria: 'gastronomia' | 'cuatrimoto' | 'glamping' | 'hospedaje' | 'parapente' | 'serrania' | (string & {});
  categoriaLabel: string;
  thumb: string;
  card: string;
  cardJpg: string;
  full: string;
  dominantColor: string;
  isCustom?: boolean;
  imageUrl?: string;
}

const CATEGORIA_LABELS: Record<string, string> = {
  gastronomia: 'Gastronomía Local',
  cuatrimoto: 'Aventura en Cuatrimoto',
  glamping: 'Glamping & Fogata',
  hospedaje: 'Hospedaje Campestre',
  parapente: 'Vuelo en Parapente',
  serrania: 'Serranía del Perijá',
};

/** Catálogo exhaustivo y categorizado de las 26 fotografías optimizadas de Manaure */
export const catalogoFotosManaure: CatalogoFotoItem[] = Object.values(imageManifest).map((entry) => {
  const secureUrl = entry.cloudinary?.secureUrl || '';
  const thumb = getCloudinaryResponsiveUrl(secureUrl, { width: 640, height: 427, format: 'webp' });
  const card = getCloudinaryResponsiveUrl(secureUrl, { width: 768, height: 960, format: 'webp' });
  const cardJpg = getCloudinaryResponsiveUrl(secureUrl, { width: 768, height: 960, format: 'jpg' });
  const full = getCloudinaryResponsiveUrl(secureUrl, { width: 1600, format: 'webp' });

  return {
    id: entry.id,
    slug: entry.id,
    alt: entry.alt,
    caption: entry.caption,
    categoria: entry.category,
    categoriaLabel: CATEGORIA_LABELS[entry.category] || 'Ecoturismo',
    thumb,
    card,
    cardJpg,
    full,
    dominantColor: entry.dominantColor || '#0f2e1d',
  };
});

/**
 * Resuelve la URL optimizada para tarjeta o previsualización a partir de un slug o URL externa.
 */
export function resolveExperienceImage(
  imageSlug: string | null | undefined,
  imageUrl?: string | null | undefined
): string {
  if (imageUrl && imageUrl.trim()) {
    return getOptimizedCloudinaryUrl(imageUrl.trim(), { width: 800 });
  }
  if (!imageSlug || !imageSlug.trim()) {
    return '';
  }
  const cleanSlug = imageSlug.trim();
  const canonicalId = imageAliases[cleanSlug] || cleanSlug;
  const matchCatalogo = catalogoFotosManaure.find(
    (f) => f.id === canonicalId || f.slug === canonicalId
  );
  if (matchCatalogo) {
    return matchCatalogo.card;
  }
  const matchFoto = fotos.find((f) => f.slug === cleanSlug);
  if (matchFoto) {
    return matchFoto.card;
  }
  return '';
}

/**
 * Resuelve la miniatura optimizada para selectores del admin.
 */
export function resolveExperienceThumb(
  imageSlug: string | null | undefined,
  imageUrl?: string | null | undefined
): string {
  if (imageUrl && imageUrl.trim()) {
    return imageUrl.trim();
  }
  if (!imageSlug || !imageSlug.trim()) {
    return '';
  }
  const cleanSlug = imageSlug.trim();
  const canonicalId = imageAliases[cleanSlug] || cleanSlug;
  const matchCatalogo = catalogoFotosManaure.find(
    (f) => f.id === canonicalId || f.slug === canonicalId
  );
  if (matchCatalogo) {
    return matchCatalogo.thumb;
  }
  const matchFoto = fotos.find((f) => f.slug === cleanSlug);
  if (matchFoto) {
    return matchFoto.thumb;
  }
  return '';
}



