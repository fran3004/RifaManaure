import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, 'assets-source', 'imagnes a utilizar');
const publicDir = path.join(rootDir, 'public');
const outputBaseDir = path.join(publicDir, 'images', 'rifa');
const docsDir = path.join(rootDir, 'docs', 'imagenes');
const draftManifestPath = path.join(docsDir, 'image-manifest.draft.json');

// Parse CLI flags
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const onlyIndex = args.indexOf('--only');
const onlySlug = onlyIndex !== -1 && args[onlyIndex + 1] ? args[onlyIndex + 1] : null;
const isVerbose = args.includes('--verbose');

console.log('=====================================================');
console.log('   MANAURE VIVE: PROCESAMIENTO Y OPTIMIZACIÓN (P2)  ');
console.log('=====================================================');
if (isDryRun) console.log('[MODO DRY-RUN ACTIVADO: Simulación sin escritura en disco]');
if (onlySlug) console.log(`[FILTRO ACTIVADO: Solo slug '${onlySlug}']`);

// 1. REGLA 1: HASH PREVIO DE ORIGINALES
console.log('\n[1/6] Verificando integridad de los 27 archivos originales...');
const originalFiles = fs.readdirSync(sourceDir).filter(f => f.endsWith('.jpg')).sort();
if (originalFiles.length !== 27) {
  throw new Error(`Se esperaban 27 archivos en ${sourceDir}, pero se encontraron ${originalFiles.length}`);
}

const preHashes = {};
for (const f of originalFiles) {
  const buf = fs.readFileSync(path.join(sourceDir, f));
  preHashes[f] = crypto.createHash('sha256').update(buf).digest('hex');
}
console.log('✓ 27 archivos originales verificados e indexados con SHA-256.');

// Helper para calcular recorte con punto focal
function computeCropBox(srcW, srcH, targetRatio, focalPoint = { x: 0.5, y: 0.5 }) {
  const currentRatio = srcW / srcH;
  if (Math.abs(currentRatio - targetRatio) < 0.005) {
    return { left: 0, top: 0, width: srcW, height: srcH };
  }

  let cropW, cropH, cropX, cropY;
  if (currentRatio > targetRatio) {
    cropH = srcH;
    cropW = Math.round(srcH * targetRatio);
    const centerX = Math.round(srcW * (focalPoint?.x ?? 0.5));
    cropX = Math.max(0, Math.min(srcW - cropW, Math.round(centerX - cropW / 2)));
    cropY = 0;
  } else {
    cropW = srcW;
    cropH = Math.round(srcW / targetRatio);
    const centerY = Math.round(srcH * (focalPoint?.y ?? 0.5));
    cropY = Math.max(0, Math.min(srcH - cropH, Math.round(centerY - cropH / 2)));
    cropX = 0;
  }

  return { left: cropX, top: cropY, width: cropW, height: cropH };
}

// Presupuestos de peso por rol (en bytes)
function getBudget(role, width) {
  if (role === 'hero-desktop') return 260 * 1024; // <= 260 KB
  if (role === 'hero-mobile') return 110 * 1024;  // <= 110 KB
  if (role === 'tarjeta') return 80 * 1024;       // <= 80 KB
  if (role === 'galeria-thumb') {
    if (width <= 320) return 25 * 1024;          // <= 25 KB
    return 40 * 1024;                            // <= 40 KB
  }
  if (role === 'lightbox') return 220 * 1024;     // <= 220 KB
  return 120 * 1024;
}

// Definición estricta de asignación por slot aprobada en Fase D (Regla 7)
const approvedAssignments = {
  'og-image': {
    slots: ['hero', 'galeria', 'og-image'],
    category: 'serrania',
    sourceFile: 'og-image.jpg',
    alt: 'Majestuoso cañón montañoso y cordillera de la Serranía del Perijá bajo cielo azul despejado',
    caption: 'Paisaje insigne de la Serranía del Perijá en Manaure Balcón del Cesar.',
    focalPoint: { x: 0.50, y: 0.50 }
  },
  'cuatrimoto-aventura-cordillera': {
    slots: ['hero', 'tarjeta', 'galeria'],
    category: 'cuatrimoto',
    sourceFile: 'cuatrimoto-aventura-cordillera.jpg',
    alt: 'Grupo de cuatrimotos todoterreno estacionadas en una cresta verde con vista panorámica a la Serranía del Perijá',
    caption: 'Rutas todoterreno en las alturas de la Serranía del Perijá.',
    focalPoint: { x: 0.35, y: 0.65 }
  },
  'serrania-perija-cordillera': {
    slots: ['hero', 'galeria'],
    category: 'serrania',
    sourceFile: 'serrania-perija-cordillera.jpg',
    alt: 'Grandes cañones y formaciones geológicas de la Serranía del Perijá en un día soleado',
    caption: 'Imponente geografía montañosa que enmarca el Balcón del Cesar.',
    focalPoint: { x: 0.50, y: 0.55 }
  },
  'fogata-casa-de-vidrio': {
    slots: ['hero', 'tarjeta', 'galeria'],
    category: 'glamping',
    sourceFile: 'fogata-casa-de-vidrio.jpg',
    alt: 'Círculo de fogata en piedra sobre terraza de montaña con vista panorámica a la Serranía del Perijá',
    caption: 'Fogata nocturna privada en el mirador de la Casa de Vidrio con vista panorámica al valle.',
    focalPoint: { x: 0.55, y: 0.55 }
  },
  'parapente-vuelo': {
    slots: ['hero-mobile', 'galeria'],
    category: 'parapente',
    sourceFile: 'parapente-vuelo.jpg',
    alt: 'Parapente con vela deportiva roja y amarilla volando en altura sobre el valle verde de Manaure',
    caption: 'Vuelo panorámico con vela deportiva sobre la geografía del Cesar.',
    focalPoint: { x: 0.50, y: 0.40 }
  },
  'serrania-perija-laguna': {
    slots: ['hero', 'tarjeta', 'galeria'],
    category: 'serrania',
    sourceFile: 'serrania-perija-laguna.jpg',
    alt: 'Laguna natural de montaña reflejando los árboles y el cielo en la Serranía del Perijá',
    caption: 'Espejo de agua natural en las alturas de la Serranía del Perijá.',
    focalPoint: { x: 0.50, y: 0.50 }
  },
  'parapente-bandera': {
    slots: ['tarjeta', 'galeria'],
    category: 'parapente',
    sourceFile: 'parapente-bandera.jpg',
    alt: 'Vuelo en parapente sobre el valle ondeando la bandera amarilla de Manaure Aventura',
    caption: 'Vuelos tándem con instructores certificados sobre los cielos de Manaure.',
    focalPoint: { x: 0.55, y: 0.45 }
  },
  'hospedaje-villa-adelaida': {
    slots: ['tarjeta', 'galeria'],
    category: 'hospedaje',
    sourceFile: 'hospedaje-villa-adelaida.jpg',
    alt: 'Cabaña campestre de piedra y teja colonial rodeada de jardines floridos y terrazas verdes en Villa Adelaida',
    caption: 'Alojamiento campestre y descanso en Villa Adelaida, aliado oficial de hotelería.',
    focalPoint: { x: 0.50, y: 0.50 }
  },
  'gastronomia-casa-arepas': {
    slots: ['tarjeta', 'galeria'],
    category: 'gastronomia',
    sourceFile: 'gastronomia-casa-arepas.jpg',
    alt: 'Fachada del restaurante La Casa de las Arepas con comensales disfrutando comida típica en Manaure',
    caption: 'Experiencia gastronómica tradicional en La Casa de las Arepas.',
    focalPoint: { x: 0.50, y: 0.55 }
  },
  'gastronomia-arepa': {
    slots: ['tarjeta', 'galeria'],
    category: 'gastronomia',
    sourceFile: 'gastronomia-local.jpg',
    alt: 'Arepa de maíz caliente rellena con carne desmechada y queso fundido en Manaure',
    caption: 'Arepas típicas rellenas tradicionales de La Casa de las Arepas.',
    focalPoint: { x: 0.55, y: 0.50 },
    customCrop: { left: 0, top: 0, width: 710, height: 468 }
  },
  'gastronomia-plato': {
    slots: ['galeria'],
    category: 'gastronomia',
    sourceFile: 'gastronomia-local.jpg',
    alt: 'Plato típico montañero con arroz tostado, pechuga criolla, yuca cocida y ensalada fresca',
    caption: 'Almuerzo tradicional campestre de la gastronomía de Manaure.',
    focalPoint: { x: 0.50, y: 0.50 },
    customCrop: { left: 0, top: 480, width: 710, height: 480 }
  },
  'serrania-topiarios': {
    slots: ['tarjeta', 'galeria'],
    category: 'serrania',
    sourceFile: 'serrania-topiarios.jpg',
    alt: 'Mirador con figuras topiarias esculpidas en arbustos verdes frente al valle de Manaure',
    caption: 'Jardines topiarios con mirador hacia el valle en el Balcón del Cesar.',
    focalPoint: { x: 0.45, y: 0.50 }
  },
  'cuatrimoto-ruta': {
    slots: ['tarjeta', 'galeria'],
    category: 'cuatrimoto',
    sourceFile: 'cuatrimoto-ruta.jpg',
    alt: 'Cuatrimoto transitando por una trocha ecoturística rodeada de densa vegetación tropical en Manaure',
    caption: 'Recorridos guiados por senderos naturales y caminos veredales.',
    focalPoint: { x: 0.50, y: 0.60 }
  },
  'cuatrimoto-mirador': {
    slots: ['tarjeta', 'galeria'],
    category: 'cuatrimoto',
    sourceFile: 'cuatrimoto-mirador.jpg',
    alt: 'Piloto en cuatrimoto posando junto a jardines topiarios y mirador de montaña en Manaure',
    caption: 'Paradas fotográficas en los miradores icónicos de la ruta en cuatrimoto.',
    focalPoint: { x: 0.50, y: 0.45 }
  },
  'cuatrimoto-cumbre': {
    slots: ['galeria'],
    category: 'cuatrimoto',
    sourceFile: 'cuatrimoto-cumbre.jpg',
    alt: 'Cuatrimotos en la cima de la montaña frente a un amplio horizonte nublado en Manaure',
    caption: 'Ascenso en cuatrimoto a los puntos más elevados de la cordillera.',
    focalPoint: { x: 0.45, y: 0.60 }
  },
  'cuatrimoto-flota': {
    slots: ['galeria'],
    category: 'cuatrimoto',
    sourceFile: 'cuatrimoto-flota.jpg',
    alt: 'Cuatrimoto amarilla y negra todoterreno equipada y lista para el tour en la base de operaciones',
    caption: 'Vehículos todoterreno de última generación con mantenimiento certificado.',
    focalPoint: { x: 0.50, y: 0.55 }
  },
  'parapente-despegue-atardecer': {
    slots: ['galeria'],
    category: 'parapente',
    sourceFile: 'parapente-despegue-atardecer.jpg',
    alt: 'Siluetas de pilotos y parapente despegando en la montaña frente al sol poniente en Manaure',
    caption: 'Despegue en parapente durante el atardecer en los miradores de Manaure.',
    focalPoint: { x: 0.70, y: 0.60 }
  },
  'parapente-tandem-canon': {
    slots: ['galeria'],
    category: 'parapente',
    sourceFile: 'parapente-tandem-canon.jpg',
    alt: 'Piloto y pasajero volando en parapente tándem sobre el profundo cañón verde de Manaure',
    caption: 'Sobrevuelo biplaza disfrutando la inmensidad del cañón del Perijá.',
    focalPoint: { x: 0.35, y: 0.60 }
  },
  'serrania-los-pinos': {
    slots: ['galeria'],
    category: 'serrania',
    sourceFile: 'serrania-los-pinos.jpg',
    alt: 'Bosque de pinos y senderos verdes en las alturas de Manaure con vista a la cordillera',
    caption: 'Senderismo y contacto con la naturaleza en la reserva Los Pinos.',
    focalPoint: { x: 0.50, y: 0.50 }
  },
  'serrania-perija-frailejones': {
    slots: ['galeria'],
    category: 'serrania',
    sourceFile: 'serrania-perija-frailejones.jpg',
    alt: 'Campo de frailejones florecidos en el páramo de la Serranía del Perijá',
    caption: 'Ecosistema único de páramo y frailejones en las cumbres del Perijá.',
    focalPoint: { x: 0.40, y: 0.55 }
  },
  'serrania-pozo-cristalino': {
    slots: ['galeria'],
    category: 'serrania',
    sourceFile: 'serrania-pozo-cristalino.jpg',
    alt: 'Pozo natural de agua cristalina entre formaciones rocosas en Manaure',
    caption: 'Aguas cristalinas y pozos naturales para refrescarse tras las caminatas.',
    focalPoint: { x: 0.50, y: 0.50 }
  },
  'serrania-sabana-rubia': {
    slots: ['galeria'],
    category: 'serrania',
    sourceFile: 'serrania-sabana-rubia.jpg',
    alt: 'Páramo de Sabana Rubia con vegetación dorada y senderos de alta montaña',
    caption: 'Pastizales dorados característicos de Sabana Rubia en Perijá.',
    focalPoint: { x: 0.50, y: 0.55 }
  },
  'serrania-valle-nubes': {
    slots: ['galeria'],
    category: 'serrania',
    sourceFile: 'registro-fotografico.jpg',
    alt: 'Valle verde y laderas montañosas de la Serranía del Perijá cubiertas por nubes bajas',
    caption: 'Paisaje de valles y neblina en las estribaciones de la Serranía.',
    focalPoint: { x: 0.50, y: 0.50 }
  },
  'fogata-mirador-nocturno': {
    slots: ['galeria'],
    category: 'glamping',
    sourceFile: 'fogata-mirador-nocturno.jpg',
    alt: 'Carpa iluminada en campamento nocturno de montaña junto a sillas con cobijas bajo el cielo estrellado',
    caption: 'Noche bajo las estrellas en los campamentos de alta montaña de Manaure.',
    focalPoint: { x: 0.40, y: 0.65 },
    tonalAdjust: { brightness: 1.08, saturation: 1.05 }
  },
  'glamping-mashiramo-domo': {
    slots: ['galeria'],
    category: 'glamping',
    sourceFile: 'glamping-mashiramo-domo.jpg',
    alt: 'Domo geodésico de Mashiramo Glamping iluminado en la noche sobre plataforma de madera en el bosque',
    caption: 'Hospedaje de lujo en domos geodésicos en medio de la naturaleza de Manaure.',
    focalPoint: { x: 0.45, y: 0.55 }
  }
};

// Aliases documentados
const aliasesMap = {
  'fogata-circulo-piedra': 'fogata-casa-de-vidrio',
  'cuatrimoto-topiario': 'cuatrimoto-mirador',
  'serrania-perija-panoramica': 'og-image',
  'registro-fotografico': 'serrania-valle-nubes'
};

const reportStats = {
  totalProcessed: 0,
  totalVariants: 0,
  totalOriginalBytes: 0,
  totalWebpBytes: 0,
  totalJpgBytes: 0,
  budgetExceeded: [],
  insufficientRes: [],
  tonalAdjustments: [],
  variantsList: []
};

const finalManifestItems = [];

console.log(`\n[2/6] Preparando activos canónicos aprobados (${Object.keys(approvedAssignments).length} activos)...`);

// 3. PROCESAR CADA ACTIVO
console.log('\n[3/6] Procesando variantes optimizadas y recortes...');

for (const [id, info] of Object.entries(approvedAssignments)) {
  if (onlySlug && id !== onlySlug) continue;

  const categoryDir = path.join(outputBaseDir, info.category);
  if (!isDryRun && !fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir, { recursive: true });
  }

  const sourcePath = path.join(sourceDir, info.sourceFile);
  const rawSourceBuf = fs.readFileSync(sourcePath);
  reportStats.totalOriginalBytes += rawSourceBuf.length;

  let baseSharp = sharp(rawSourceBuf).rotate().toColorspace('srgb');

  if (info.customCrop) {
    baseSharp = baseSharp.extract(info.customCrop);
  }

  if (info.tonalAdjust) {
    baseSharp = baseSharp.modulate(info.tonalAdjust);
    reportStats.tonalAdjustments.push({
      id,
      adjust: `Brillo: +${Math.round((info.tonalAdjust.brightness - 1) * 100)}%, Sat: +${Math.round((info.tonalAdjust.saturation - 1) * 100)}%`,
      reason: 'Subexposición y balance de sombras nocturnas'
    });
  }

  const cleanBaseBuf = await baseSharp.toBuffer();
  const baseMeta = await sharp(cleanBaseBuf).metadata();
  const nativeW = baseMeta.width;
  const nativeH = baseMeta.height;

  // LQIP (WebP 24px) y Dominant Color
  const lqipH = Math.max(1, Math.round(24 * (nativeH / nativeW)));
  const lqipBuf = await sharp(cleanBaseBuf)
    .resize(24, lqipH, { fit: 'fill' })
    .webp({ quality: 50 })
    .toBuffer();
  const lqipBase64 = `data:image/webp;base64,${lqipBuf.toString('base64')}`;

  const lqipRaw = await sharp(cleanBaseBuf).resize(1, 1).raw().toBuffer();
  const dominantColor = `#${lqipRaw[0].toString(16).padStart(2, '0')}${lqipRaw[1].toString(16).padStart(2, '0')}${lqipRaw[2].toString(16).padStart(2, '0')}`;

  const itemManifestEntry = {
    id,
    category: info.category,
    sourceFile: info.sourceFile,
    nativeWidth: nativeW,
    nativeHeight: nativeH,
    alt: info.alt,
    caption: info.caption,
    focalPoint: info.focalPoint,
    dominantColor,
    lqip: lqipBase64,
    variants: []
  };

  // Construir variantes requeridas
  const variantConfigs = [];

  // Hero Desktop (16:9)
  if (info.slots.includes('hero')) {
    const candidateWidths = [1920, 1600, 1024, 640].filter(w => w <= nativeW);
    for (const w of candidateWidths) {
      variantConfigs.push({ role: 'hero-desktop', ratioName: '16x9', ratioVal: 16 / 9, width: w });
    }
  }

  // Hero Mobile (4:5)
  if (info.slots.includes('hero') || info.slots.includes('hero-mobile')) {
    const candidateWidths = [768, 640].filter(w => w <= nativeW);
    if (candidateWidths.length === 0 && nativeW < 640) {
      candidateWidths.push(nativeW);
    }
    for (const w of candidateWidths) {
      variantConfigs.push({ role: 'hero-mobile', ratioName: '4x5', ratioVal: 4 / 5, width: w });
    }
  }

  // Tarjeta (4:5)
  if (info.slots.includes('tarjeta')) {
    const candidateWidths = [768, 480].filter(w => w <= nativeW);
    if (candidateWidths.length === 0 && nativeW < 480) {
      candidateWidths.push(nativeW);
    }
    if (nativeW < 768) {
      reportStats.insufficientRes.push({
        id,
        slot: 'tarjeta (DPR2 768px)',
        nativeWidth: nativeW,
        status: 'insuficiente'
      });
    }
    for (const w of candidateWidths) {
      if (!variantConfigs.some(v => v.role === 'tarjeta' && v.width === w)) {
        variantConfigs.push({ role: 'tarjeta', ratioName: '4x5', ratioVal: 4 / 5, width: w });
      }
    }
  }

  // Galeria Thumbnails (3:2)
  if (info.slots.includes('galeria')) {
    const candidateWidths = [640, 480, 320].filter(w => w <= nativeW);
    if (candidateWidths.length === 0 && nativeW < 320) {
      candidateWidths.push(nativeW);
    }
    for (const w of candidateWidths) {
      variantConfigs.push({ role: 'galeria-thumb', ratioName: '3x2', ratioVal: 3 / 2, width: w });
    }

    // Lightbox / Uncropped
    // Solo anchos <= nativeW. Si nativeW es menor a 960, se genera un único lightbox a nativeW.
    let candidateLightbox = [1600, 1280, 960].filter(w => w <= nativeW);
    if (candidateLightbox.length === 0) {
      candidateLightbox.push(nativeW);
    }
    for (const w of candidateLightbox) {
      variantConfigs.push({ role: 'lightbox', ratioName: 'full', ratioVal: null, width: w });
    }
  }

  // Generar cada variante
  for (const cfg of variantConfigs) {
    let pipeline = sharp(cleanBaseBuf);
    let targetH;

    if (cfg.ratioVal) {
      const crop = computeCropBox(nativeW, nativeH, cfg.ratioVal, info.focalPoint);
      pipeline = pipeline.extract(crop).resize(cfg.width, Math.round(cfg.width / cfg.ratioVal), {
        fit: 'cover',
        withoutEnlargement: true
      });
      targetH = Math.round(cfg.width / cfg.ratioVal);
    } else {
      targetH = Math.round(cfg.width * (nativeH / nativeW));
      pipeline = pipeline.resize(cfg.width, targetH, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    const budget = getBudget(cfg.role, cfg.width);
    const fileBaseName = cfg.ratioName === 'full'
      ? `${id}-${cfg.width}w`
      : `${id}--${cfg.ratioName}-${cfg.width}w`;

    // WebP con compresión adaptativa
    let webpQuality = 78;
    let webpBuf = await pipeline.clone().webp({ quality: webpQuality, effort: 4 }).toBuffer();
    while (webpBuf.length > budget && webpQuality > 68) {
      webpQuality -= 2;
      webpBuf = await pipeline.clone().webp({ quality: webpQuality, effort: 4 }).toBuffer();
    }

    // JPG mozjpeg con compresión adaptativa
    let jpgQuality = 80;
    let jpgBuf = await pipeline.clone().jpeg({ quality: jpgQuality, mozjpeg: true, progressive: true }).toBuffer();
    while (jpgBuf.length > budget && jpgQuality > 72) {
      jpgQuality -= 2;
      jpgBuf = await pipeline.clone().jpeg({ quality: jpgQuality, mozjpeg: true, progressive: true }).toBuffer();
    }

    if (webpBuf.length > budget) {
      reportStats.budgetExceeded.push({
        file: `${fileBaseName}.webp`,
        bytes: webpBuf.length,
        budget,
        quality: webpQuality
      });
    }
    if (jpgBuf.length > budget) {
      reportStats.budgetExceeded.push({
        file: `${fileBaseName}.jpg`,
        bytes: jpgBuf.length,
        budget,
        quality: jpgQuality
      });
    }

    reportStats.totalWebpBytes += webpBuf.length;
    reportStats.totalJpgBytes += jpgBuf.length;
    reportStats.totalVariants += 2;

    const webpRelPath = `/images/rifa/${info.category}/${fileBaseName}.webp`;
    const jpgRelPath = `/images/rifa/${info.category}/${fileBaseName}.jpg`;

    if (!isDryRun) {
      fs.writeFileSync(path.join(categoryDir, `${fileBaseName}.webp`), webpBuf);
      fs.writeFileSync(path.join(categoryDir, `${fileBaseName}.jpg`), jpgBuf);
    }

    itemManifestEntry.variants.push({
      role: cfg.role,
      ratio: cfg.ratioName,
      width: cfg.width,
      height: targetH,
      webp: { url: webpRelPath, bytes: webpBuf.length, quality: webpQuality },
      jpg: { url: jpgRelPath, bytes: jpgBuf.length, quality: jpgQuality }
    });

    reportStats.variantsList.push({
      id,
      variant: fileBaseName,
      role: cfg.role,
      width: cfg.width,
      height: targetH,
      webpKb: (webpBuf.length / 1024).toFixed(1),
      jpgKb: (jpgBuf.length / 1024).toFixed(1),
      budgetKb: (budget / 1024).toFixed(1)
    });
  }

  finalManifestItems.push(itemManifestEntry);
  reportStats.totalProcessed++;
  process.stdout.write(`  [${reportStats.totalProcessed}/${Object.keys(approvedAssignments).length}] ${id} (${variantConfigs.length * 2} derivados)\n`);
}

// 4. OPEN GRAPH V2 (FASE D)
console.log('\n[4/6] Generando imágenes para compartir Open Graph (1200×630 baseline sRGB)...');
const ogSourcePath = path.join(sourceDir, 'og-image.jpg');
const ogSourceBuf = fs.readFileSync(ogSourcePath);

const ogCleanBuf = await sharp(ogSourceBuf)
  .resize(1200, 630, { fit: 'cover', position: 'center' })
  .toColorspace('srgb')
  .jpeg({ quality: 84, progressive: false })
  .toBuffer();

const logoMasterPath = path.join(rootDir, 'src', 'assets', 'logos', 'master', 'logo-principal.png');
let ogBrandedBuf = ogCleanBuf;
if (fs.existsSync(logoMasterPath)) {
  const logoBuf = await sharp(logoMasterPath).resize(220).toBuffer();
  const logoMeta = await sharp(logoBuf).metadata();
  const svgPill = Buffer.from(`
    <svg width="${logoMeta.width + 32}" height="${logoMeta.height + 20}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="14" fill="rgba(15, 31, 22, 0.85)" stroke="rgba(245, 166, 35, 0.45)" stroke-width="1.5"/>
    </svg>
  `);
  ogBrandedBuf = await sharp(ogCleanBuf)
    .composite([
      { input: svgPill, left: 40, top: 40 },
      { input: logoBuf, left: 56, top: 50 }
    ])
    .jpeg({ quality: 84, progressive: false })
    .toBuffer();
}

if (!isDryRun) {
  fs.writeFileSync(path.join(publicDir, 'og-image-v2.jpg'), ogCleanBuf);
  fs.writeFileSync(path.join(publicDir, 'og-image-v2-branded.jpg'), ogBrandedBuf);
}
console.log(`✓ public/og-image-v2.jpg: ${(ogCleanBuf.length / 1024).toFixed(1)} KB (Presupuesto: <= 300 KB, baseline, 1200x630).`);
console.log(`✓ public/og-image-v2-branded.jpg: ${(ogBrandedBuf.length / 1024).toFixed(1)} KB.`);

// 5. MANIFIESTO TIPADO Y TYPESCRIPT
console.log('\n[5/6] Generando manifiestos finales y tipos TypeScript...');
const finalManifestJson = {
  version: '2.0.0',
  generatedAt: new Date().toISOString(),
  basePublicPath: '/images/rifa',
  aliases: aliasesMap,
  images: finalManifestItems
};

if (!isDryRun) {
  fs.writeFileSync(path.join(docsDir, 'image-manifest.json'), JSON.stringify(finalManifestJson, null, 2), 'utf8');
  if (!fs.existsSync(outputBaseDir)) fs.mkdirSync(outputBaseDir, { recursive: true });
  fs.writeFileSync(path.join(outputBaseDir, 'image-manifest.json'), JSON.stringify(finalManifestJson, null, 2), 'utf8');

  // Tipos TypeScript en src/types/image-manifest.ts
  const tsContent = `/**
 * MANIFEST DE IMÁGENES AUTOGENERADO - MANAURE VIVE
 * Generado el: ${new Date().toISOString()}
 * Archivos optimizados WebP y JPG en /public/images/rifa/
 */

export interface ImageVariantFormat {
  url: string;
  bytes: number;
  quality: number;
}

export interface ImageVariant {
  role: 'hero-desktop' | 'hero-mobile' | 'tarjeta' | 'galeria-thumb' | 'lightbox';
  ratio: '16x9' | '4x5' | '3x2' | 'full';
  width: number;
  height: number;
  webp: ImageVariantFormat;
  jpg: ImageVariantFormat;
}

export interface ImageEntry {
  id: string;
  category: 'cuatrimoto' | 'parapente' | 'serrania' | 'glamping' | 'gastronomia' | 'hospedaje';
  sourceFile: string;
  nativeWidth: number;
  nativeHeight: number;
  alt: string;
  caption: string;
  focalPoint: { x: number; y: number };
  dominantColor: string;
  lqip: string;
  variants: ImageVariant[];
}

export const imageAliases: Record<string, string> = ${JSON.stringify(aliasesMap, null, 2)};

export const imageManifest: Record<string, ImageEntry> = ${JSON.stringify(
    finalManifestItems.reduce((acc, curr) => {
      acc[curr.id] = curr;
      return acc;
    }, {}),
    null,
    2
  )};

export default imageManifest;
`;

  const tsDir = path.join(rootDir, 'src', 'types');
  if (!fs.existsSync(tsDir)) fs.mkdirSync(tsDir, { recursive: true });
  fs.writeFileSync(path.join(tsDir, 'image-manifest.ts'), tsContent, 'utf8');
  console.log(`✓ Manifiesto JSON y TypeScript guardados en src/types/image-manifest.ts.`);
}

// 6. REGLA 1: HASH POST-EJECUCIÓN DE ORIGINALES
console.log('\n[6/6] Verificación final de inmutabilidad de los 27 archivos originales...');
let hashMismatch = false;
for (const f of originalFiles) {
  const buf = fs.readFileSync(path.join(sourceDir, f));
  const postHash = crypto.createHash('sha256').update(buf).digest('hex');
  if (postHash !== preHashes[f]) {
    console.error(`¡ERROR CRÍTICO! El archivo original ${f} fue modificado.`);
    hashMismatch = true;
  }
}

if (hashMismatch) {
  throw new Error('Violación de Regla 1: Uno o más archivos originales fueron alterados.');
}
console.log('✓ GARANTÍA ABSOLUTA: Los 27 archivos originales permanecen 100% INTACTOS (SHA-256 idéntico).');

// Resumen final
console.log('\n=== RESUMEN TÉCNICO DE PROCESAMIENTO ===');
console.log(`- Activos canónicos procesados: ${reportStats.totalProcessed}`);
console.log(`- Derivados generados: ${reportStats.totalVariants} archivos`);
console.log(`- Volumen WebP generado: ${(reportStats.totalWebpBytes / (1024 * 1024)).toFixed(2)} MB`);
console.log(`- Volumen JPG generado: ${(reportStats.totalJpgBytes / (1024 * 1024)).toFixed(2)} MB`);
console.log(`- Presupuestos excedidos: ${reportStats.budgetExceeded.length}`);
if (reportStats.insufficientRes.length > 0) {
  console.log(`- Resoluciones insuficientes documentadas: ${reportStats.insufficientRes.length}`);
}
console.log('Proceso completado exitosamente.\n');

