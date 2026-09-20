/**
 * Inventario tipado y optimizado de assets (logos e imágenes) de "Manaure Vive".
 * Carga directa mediante Vite import.meta.glob para resolución de URLs en dev y build.
 */

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

// --- Glob imports para Logos ---
const logosWeb = import.meta.glob<string>('./logos/web/*.webp', { eager: true, import: 'default' });
const logosGrid400 = import.meta.glob<string>('./logos/grid-400/*.webp', {
  eager: true,
  import: 'default',
});
const logosGrid800 = import.meta.glob<string>('./logos/grid-800/*.webp', {
  eager: true,
  import: 'default',
});
const logosMaster = import.meta.glob<string>('./logos/master/*.png', {
  eager: true,
  import: 'default',
});

const getLogo = (slug: string) => ({
  web: logosWeb[`./logos/web/${slug}.webp`] || '',
  grid: logosGrid400[`./logos/grid-400/${slug}.webp`] || '',
  grid2x: logosGrid800[`./logos/grid-800/${slug}.webp`] || '',
  master: logosMaster[`./logos/master/${slug}.png`] || '',
});

/** Versión simplificada: Isotipo colibrí + montaña + "MANAURE VIVE". Ideal para Header, Navbar, etc. */
export const logoPrincipal = getLogo('logo-principal');

/** Versión institucional completa con subtítulos y detalles ecoturísticos. */
export const logoPrincipalCompleto = getLogo('logo-principal-completo');

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

export const aliados: Aliado[] = rawAliados.map(([slug, nombre, categoria]) => {
  const assets = getLogo(slug);
  return {
    slug,
    nombre,
    categoria,
    logoWeb: assets.web,
    logoGrid: assets.grid,
    logoGrid2x: assets.grid2x,
    logoMaster: assets.master,
  };
});

import { imageManifest, imageAliases, type ImageEntry } from '@/types/image-manifest';

// --- Constructor de Foto conectado a los derivados optimizados de /images/rifa/ ---
const crearFoto = (
  slug: string,
  alt: string,
  experiencia: Foto['experiencia'],
  heroExtendido = false
): Foto => {
  const canonicalId = imageAliases[slug] || slug;
  const entry: ImageEntry | undefined = imageManifest[canonicalId];

  if (!entry) {
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

  const vHero = entry.variants.find((v) => v.role === 'hero-desktop') || entry.variants[0];
  const vHeroResp = entry.variants.filter((v) => v.role === 'hero-desktop' || v.ratio === '16x9');
  const h640 = vHeroResp.find((v) => v.width === 640)?.webp.url;
  const h1024 = vHeroResp.find((v) => v.width === 1024)?.webp.url;
  const h1600 = vHeroResp.find((v) => v.width === 1600)?.webp.url;
  const h2000 = vHeroResp.find((v) => v.width >= 1920)?.webp.url;

  const heroSrcSet = vHeroResp.length > 0
    ? vHeroResp.map((v) => `${v.webp.url} ${v.width}w`).join(', ')
    : `${vHero?.webp.url || ''} 1920w`;

  const vCard = entry.variants.find((v) => v.role === 'tarjeta') || entry.variants[0];
  const vThumb = entry.variants.find((v) => v.role === 'galeria-thumb') || entry.variants[0];
  const vMovil = entry.variants.find((v) => v.role === 'hero-mobile') || entry.variants[0];
  const vFull = entry.variants.find((v) => v.role === 'lightbox') || entry.variants[0];

  return {
    slug,
    alt: alt || entry.alt,
    experiencia,
    heroExtendido,
    hero: vHero?.webp.url || '',
    heroJpg: vHero?.jpg.url || '',
    hero640: h640,
    hero1024: h1024,
    hero1600: h1600,
    hero2000: h2000,
    heroSrcSet,
    card: vCard?.webp.url || '',
    cardJpg: vCard?.jpg.url || '',
    thumb: vThumb?.webp.url || '',
    thumbJpg: vThumb?.jpg.url || '',
    movil: vMovil?.webp.url || '',
    movilJpg: vMovil?.jpg.url || '',
    full: vFull?.webp.url || '',
    fullJpg: vFull?.jpg.url || '',
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

/** 5 fotografías estelares aprobadas para el carrusel interactivo del Hero */
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
      'parapente-vuelo',
      'Vuelo libre en parapente biplaza sobrevolando el valle verde de Manaure',
      'parapente'
    ),
    slug: 'parapente-vuelo',
    tituloExperiencia: 'Vuelo en Parapente Tándem',
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


