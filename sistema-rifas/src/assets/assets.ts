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
const logosGrid400 = import.meta.glob<string>('./logos/grid-400/*.webp', { eager: true, import: 'default' });
const logosGrid800 = import.meta.glob<string>('./logos/grid-800/*.webp', { eager: true, import: 'default' });
const logosMaster = import.meta.glob<string>('./logos/master/*.png', { eager: true, import: 'default' });

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

// --- Glob imports para Imágenes ---
const imgsHeroWebp = import.meta.glob<string>('./imagenes/hero-1920x1080/*.webp', { eager: true, import: 'default' });
const imgsHeroJpg = import.meta.glob<string>('./imagenes/hero-1920x1080/*.jpg', { eager: true, import: 'default' });

const imgsCardWebp = import.meta.glob<string>('./imagenes/card-1200x800/*.webp', { eager: true, import: 'default' });
const imgsCardJpg = import.meta.glob<string>('./imagenes/card-1200x800/*.jpg', { eager: true, import: 'default' });

const imgsThumbWebp = import.meta.glob<string>('./imagenes/thumb-600x400/*.webp', { eager: true, import: 'default' });
const imgsThumbJpg = import.meta.glob<string>('./imagenes/thumb-600x400/*.jpg', { eager: true, import: 'default' });

const imgsMovilWebp = import.meta.glob<string>('./imagenes/movil-1080x1350/*.webp', { eager: true, import: 'default' });
const imgsMovilJpg = import.meta.glob<string>('./imagenes/movil-1080x1350/*.jpg', { eager: true, import: 'default' });

const imgsFullWebp = import.meta.glob<string>('./imagenes/original-optimizado/*.webp', { eager: true, import: 'default' });
const imgsFullJpg = import.meta.glob<string>('./imagenes/original-optimizado/*.jpg', { eager: true, import: 'default' });

const crearFoto = (
  slug: string,
  alt: string,
  experiencia: Foto['experiencia'],
  heroExtendido = false
): Foto => ({
  slug,
  alt,
  experiencia,
  heroExtendido,
  hero: imgsHeroWebp[`./imagenes/hero-1920x1080/${slug}.webp`] || '',
  heroJpg: imgsHeroJpg[`./imagenes/hero-1920x1080/${slug}.jpg`] || '',
  card: imgsCardWebp[`./imagenes/card-1200x800/${slug}.webp`] || '',
  cardJpg: imgsCardJpg[`./imagenes/card-1200x800/${slug}.jpg`] || '',
  thumb: imgsThumbWebp[`./imagenes/thumb-600x400/${slug}.webp`] || '',
  thumbJpg: imgsThumbJpg[`./imagenes/thumb-600x400/${slug}.jpg`] || '',
  movil: imgsMovilWebp[`./imagenes/movil-1080x1350/${slug}.webp`] || '',
  movilJpg: imgsMovilJpg[`./imagenes/movil-1080x1350/${slug}.jpg`] || '',
  full: imgsFullWebp[`./imagenes/original-optimizado/${slug}.webp`] || '',
  fullJpg: imgsFullJpg[`./imagenes/original-optimizado/${slug}.jpg`] || '',
});

export const fotos: Foto[] = [
  crearFoto('cuatrimoto-flota', 'Flota de cuatrimotos listas para el recorrido en Manaure', 'cuatrimoto', false),
  crearFoto('serrania-perija-laguna', 'Laguna natural en las alturas de la Serranía del Perijá', 'serrania', false),
  crearFoto('fogata-casa-de-vidrio', 'Fogata nocturna en el mirador de la Casa de Vidrio', 'fogata', false),
  crearFoto('serrania-perija-frailejones', 'Frailejones en el páramo de la Serranía del Perijá', 'serrania', false),
  crearFoto('serrania-perija-panoramica', 'Vista panorámica de la cordillera en Manaure Balcón del Cesar', 'serrania', false),
  crearFoto('cuatrimoto-mirador', 'Cuatrimoto en el mirador panorámico de Manaure', 'cuatrimoto', true),
  crearFoto('cuatrimoto-ruta', 'Recorrido en cuatrimoto por las trochas ecoturísticas', 'cuatrimoto', true),
  crearFoto('parapente-bandera', 'Vuelo en parapente con la bandera de Manaure Aventura', 'parapente', true),
  crearFoto('parapente-vuelo', 'Experiencia de vuelo libre en parapente sobre el valle', 'parapente', true),
];

/** Fotos nativas recomendadas para usar como fondo grande / hero de la rifa. */
export const fotosParaHero = fotos.filter((f) => !f.heroExtendido);
