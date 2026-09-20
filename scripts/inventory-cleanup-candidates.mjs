import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('Iniciando inventario exhaustivo de candidatos de limpieza...');

// 1. Obtener todos los archivos del repositorio (excepto node_modules y .git)
function getAllFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        getAllFiles(fullPath, fileList);
      }
    } else if (entry.isFile()) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allFiles = getAllFiles(rootDir);
console.log(`Total archivos inspeccionados: ${allFiles.length}`);

// 2. Cargar todos los textos de código fuente para búsqueda textual insensible
const sourceExtensions = ['.ts', '.tsx', '.js', '.mjs', '.jsx', '.css', '.html', '.json', '.sql', '.md'];
const sourceFiles = allFiles.filter(f => sourceExtensions.includes(path.extname(f).toLowerCase()));
const sourceContents = sourceFiles.map(f => ({
  path: f,
  relPath: path.relative(rootDir, f).replace(/\\/g, '/'),
  content: fs.readFileSync(f, 'utf8'),
}));

// Manifiesto de imágenes en public/images/rifa
const manifestPath = path.join(rootDir, 'public', 'images', 'rifa', 'image-manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { images: [] };
const manifestUrls = new Set();
for (const img of manifest.images) {
  for (const v of img.variants) {
    manifestUrls.add(v.webp.url);
    manifestUrls.add(v.jpg.url);
  }
}

// 3. Evaluar candidatos de limpieza
const candidates = [];

for (const fullPath of allFiles) {
  const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
  const filename = path.basename(fullPath);
  const ext = path.extname(fullPath).toLowerCase();
  const stat = fs.statSync(fullPath);

  // Lista Protegida G2
  const isProtected =
    relPath.startsWith('.git') ||
    relPath.startsWith('.github') ||
    relPath.startsWith('.vscode') ||
    relPath.startsWith('.env') ||
    relPath === 'package.json' ||
    relPath === 'package-lock.json' ||
    relPath.startsWith('vite.config') ||
    relPath.startsWith('tsconfig') ||
    relPath.startsWith('eslint') ||
    relPath.startsWith('wrangler') ||
    relPath.startsWith('README') ||
    relPath.startsWith('LICENSE') ||
    relPath.startsWith('supabase/') ||
    relPath.startsWith('docs/') ||
    relPath.startsWith('scripts/') ||
    relPath.startsWith('assets-source/') ||
    relPath.startsWith('src/pages/admin/') ||
    // Convenciones web protegidas en public/
    relPath === 'public/favicon.ico' ||
    relPath.startsWith('public/favicon') ||
    relPath.startsWith('public/apple-touch-icon') ||
    relPath.startsWith('public/site.webmanifest') ||
    relPath.startsWith('public/robots.txt') ||
    relPath.startsWith('public/_headers') ||
    relPath.startsWith('public/_redirects') ||
    relPath.startsWith('public/_routes.json') ||
    // Derivados canónicos en public/images/rifa/
    relPath.startsWith('public/images/rifa/') ||
    relPath === 'public/og-image-v2.jpg' ||
    relPath === 'public/og-image-v2-branded.jpg';

  if (isProtected) {
    continue;
  }

  // Comprobar si el archivo es referenciado por alguno de los 7 métodos
  const fileUrl = '/' + relPath.replace(/^public\//, '');
  const baseNameWithoutExt = path.basename(filename, ext);

  // Comprobar coincidencias textuales en sourceContents (excluyendo el propio archivo)
  const references = [];
  for (const src of sourceContents) {
    if (src.path === fullPath) continue;
    // Búsqueda del nombre exacto, ruta relativa o URL
    if (
      src.content.includes(filename) ||
      src.content.includes(relPath) ||
      (fileUrl !== '/' && src.content.includes(fileUrl))
    ) {
      references.push(src.relPath);
    }
  }

  // Verificar si es derivado del manifest
  const isManifestVariant = manifestUrls.has(fileUrl);

  // Clasificación por categoría
  let category = '';
  let batch = 0;

  // Lote 1 — Basura de sistema, logs y temporales (E, D temporal)
  if (
    filename === '.DS_Store' ||
    filename === 'Thumbs.db' ||
    filename === 'desktop.ini' ||
    ext === '.log' ||
    filename.startsWith('npm-debug.log') ||
    filename.startsWith('yarn-error.log') ||
    ext === '.tmp' ||
    ext === '.swp' ||
    ext === '.bak'
  ) {
    category = 'E';
    batch = 1;
  }
  // Lote 3 — Respaldos, empaquetados, capturas, copias (B, C, D)
  else if (
    ['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext) ||
    /^(WhatsApp Image|Captura de pantalla|Screenshot|IMG_|Untitled)/i.test(filename) ||
    /\s*\(\d+\)\.[^.]+$/.test(filename) ||
    /(- copia|copy|_old|_bak)\.[^.]+$/i.test(filename)
  ) {
    category = 'C/D/B';
    batch = 3;
  }
  // Lote 4 — Imágenes y medios antiguos sustituidos (A)
  else if (
    ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg'].includes(ext)
  ) {
    category = 'A';
    batch = 4;
  }
  // Lote 5 — Fuentes tipográficas sin uso
  else if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) {
    category = 'Fuentes';
    batch = 5;
  }
  // Lote 6 — Código y estilos huérfanos (H)
  else if (['.ts', '.tsx', '.js', '.jsx', '.css', '.module.css'].includes(ext)) {
    category = 'H';
    batch = 6;
  }

  // Evaluar confianza de eliminación
  let decision = 'ELIMINAR';
  let reason = '';

  // Archivos potencialmente compartidos externamente
  if (relPath === 'public/og-image.jpg') {
    decision = 'DUDOSO';
    reason = 'og-image.jpg previo pudo haber sido compartido externamente o guardado en caché de redes sociales.';
  } else if (relPath.startsWith('public/icons.svg')) {
    if (references.length > 0) {
      decision = 'PROTEGIDO';
      reason = `Referenciado en ${references.join(', ')}`;
    }
  } else if (references.length > 0) {
    decision = 'PROTEGIDO';
    reason = `Referenciado en ${references.join(', ')}`;
  } else if (isManifestVariant) {
    decision = 'PROTEGIDO';
    reason = 'Es un derivado canónico del image-manifest.';
  }

  if (batch > 0 && decision !== 'PROTEGIDO') {
    candidates.push({
      relPath,
      filename,
      size: stat.size,
      category,
      batch,
      decision,
      reason: decision === 'ELIMINAR' ? 'Cero referencias en el grafo, CSS, HTML, datos y búsqueda textual.' : reason,
      references,
    });
  }
}

console.log(`\nCandidatos clasificados: ${candidates.length}`);
console.log('ELIMINAR (Confianza Alta):', candidates.filter(c => c.decision === 'ELIMINAR').length);
console.log('DUDOSO / NO VERIFICABLE:', candidates.filter(c => c.decision === 'DUDOSO').length);

fs.writeFileSync(
  path.join(rootDir, 'docs', 'imagenes', 'limpieza', 'candidates.json'),
  JSON.stringify(candidates, null, 2),
  'utf8'
);
console.log('Guardado en docs/imagenes/limpieza/candidates.json');
