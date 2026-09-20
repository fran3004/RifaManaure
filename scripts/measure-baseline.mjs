import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function getDirStats(dirPath, excludeDirs = []) {
  let fileCount = 0;
  let totalBytes = 0;
  const fileList = [];

  function walk(current) {
    if (!fs.existsSync(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!excludeDirs.includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        fileCount++;
        const stat = fs.statSync(fullPath);
        totalBytes += stat.size;
        fileList.push({
          relPath: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
          size: stat.size,
        });
      }
    }
  }

  walk(dirPath);
  return { fileCount, totalBytes, fileList };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

console.log('Calculando medición base...');

// 1. Árbol de trabajo sin node_modules, .git, dist
const workTree = getDirStats(rootDir, ['node_modules', '.git', 'dist']);

// 2. Carpetas de assets
const srcAssets = getDirStats(path.join(rootDir, 'src', 'assets'));
const srcAssetsImagenes = getDirStats(path.join(rootDir, 'src', 'assets', 'imagenes'));
const srcAssetsLogos = getDirStats(path.join(rootDir, 'src', 'assets', 'logos'));
const publicImages = getDirStats(path.join(rootDir, 'public', 'images'));
const publicImagesRifa = getDirStats(path.join(rootDir, 'public', 'images', 'rifa'));

// 3. dist/ tras npm run build
const distStats = getDirStats(path.join(rootDir, 'dist'));

const outputLines = [
  '================================================================================',
  'MEDICIÓN BASE PRE-LIMPIEZA — MANAURE VIVE',
  `Fecha: ${new Date().toISOString()}`,
  'Rama: limpieza-proyecto | Tag: pre-limpieza',
  '================================================================================\n',
  '1. ÁRBOL DE TRABAJO (Sin node_modules, .git ni dist):',
  `   - Número total de archivos: ${workTree.fileCount}`,
  `   - Tamaño total en bytes: ${workTree.totalBytes} bytes (${formatBytes(workTree.totalBytes)})\n`,
  '2. CARPETAS DE ASSETS:',
  `   - src/assets/ (completa): ${srcAssets.fileCount} archivos, ${formatBytes(srcAssets.totalBytes)}`,
  `   - src/assets/imagenes/ (imágenes heredadas): ${srcAssetsImagenes.fileCount} archivos, ${formatBytes(srcAssetsImagenes.totalBytes)}`,
  `   - src/assets/logos/ (logotipos oficiales): ${srcAssetsLogos.fileCount} archivos, ${formatBytes(srcAssetsLogos.totalBytes)}`,
  `   - public/images/ (completa): ${publicImages.fileCount} archivos, ${formatBytes(publicImages.totalBytes)}`,
  `   - public/images/rifa/ (derivados canónicos): ${publicImagesRifa.fileCount} archivos, ${formatBytes(publicImagesRifa.totalBytes)}\n`,
  '3. DIST/ BUILD DE PRODUCCIÓN:',
  `   - Número total de archivos en dist/: ${distStats.fileCount}`,
  `   - Tamaño total en bytes: ${distStats.totalBytes} bytes (${formatBytes(distStats.totalBytes)})\n`,
  '   LISTADO COMPLETO DE ARCHIVOS EN DIST/:',
  '   ' + '-'.repeat(76),
  '   Ruta                                                                Tamaño',
  '   ' + '-'.repeat(76),
];

// Ordenar archivos de dist por tamaño descendente
distStats.fileList.sort((a, b) => b.size - a.size);
for (const file of distStats.fileList) {
  const pad = ' '.repeat(Math.max(2, 68 - file.relPath.length));
  outputLines.push(`   ${file.relPath}${pad}${formatBytes(file.size)} (${file.size} B)`);
}

outputLines.push('\n================================================================================');

const outDir = path.join(rootDir, 'docs', 'imagenes', 'limpieza');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outPath = path.join(outDir, 'baseline.txt');
fs.writeFileSync(outPath, outputLines.join('\n'), 'utf8');

console.log('✅ Medición base guardada exitosamente en:', outPath);
console.log(`   Archivos de trabajo: ${workTree.fileCount} (${formatBytes(workTree.totalBytes)})`);
console.log(`   Archivos en dist: ${distStats.fileCount} (${formatBytes(distStats.totalBytes)})`);
