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

console.log('Calculando medición post-limpieza...');

// 1. Árbol de trabajo sin node_modules, .git, dist, assets-source
const workTree = getDirStats(rootDir, ['node_modules', '.git', 'dist', 'assets-source']);
const srcAssets = getDirStats(path.join(rootDir, 'src', 'assets'));
const srcAssetsImagenes = getDirStats(path.join(rootDir, 'src', 'assets', 'imagenes'));
const srcAssetsLogos = getDirStats(path.join(rootDir, 'src', 'assets', 'logos'));
const publicImages = getDirStats(path.join(rootDir, 'public', 'images'));
const publicImagesRifa = getDirStats(path.join(rootDir, 'public', 'images', 'rifa'));
const distStats = getDirStats(path.join(rootDir, 'dist'));

// Leer baseline
let baselineWorkFiles = 754;
let baselineWorkBytes = 84714652;
let baselineDistFiles = 481;
let baselineDistBytes = 45091724;

const outDir = path.join(rootDir, 'docs', 'imagenes', 'limpieza');
const baselinePath = path.join(outDir, 'baseline.txt');
if (fs.existsSync(baselinePath)) {
  const content = fs.readFileSync(baselinePath, 'utf8');
  const matchWorkFiles = content.match(/Número total de archivos:\s+(\d+)/);
  const matchWorkBytes = content.match(/Tamaño total en bytes:\s+(\d+)\s+bytes/);
  const matchDistFiles = content.match(/Número total de archivos en dist\/:\s+(\d+)/);
  const matchDistBytes = content.match(/Tamaño total en bytes:\s+(\d+)\s+bytes/g);
  if (matchWorkFiles) baselineWorkFiles = parseInt(matchWorkFiles[1], 10);
  if (matchWorkBytes) baselineWorkBytes = parseInt(matchWorkBytes[1], 10);
  if (matchDistFiles) baselineDistFiles = parseInt(matchDistFiles[1], 10);
  if (matchDistBytes && matchDistBytes[1]) {
    const bytes2 = matchDistBytes[1].match(/\d+/);
    if (bytes2) baselineDistBytes = parseInt(bytes2[0], 10);
  }
}

const freedWorkBytes = baselineWorkBytes - workTree.totalBytes;
const freedDistBytes = baselineDistBytes - distStats.totalBytes;

const outputLines = [
  '================================================================================',
  'MEDICIÓN POST-LIMPIEZA — MANAURE VIVE',
  `Fecha: ${new Date().toISOString()}`,
  'Rama: limpieza-proyecto',
  '================================================================================\n',
  '1. RESUMEN EJECUTIVO DE REDUCCIÓN:',
  `   - Archivos eliminados del código fuente: ${baselineWorkFiles - workTree.fileCount} archivos`,
  `   - Espacio liberado en código fuente: ${formatBytes(freedWorkBytes)} (${freedWorkBytes} bytes)`,
  `   - Archivos en dist/ de producción: ${distStats.fileCount} (antes: ${baselineDistFiles})`,
  `   - Tamaño total de dist/: ${formatBytes(distStats.totalBytes)} (antes: ${formatBytes(baselineDistBytes)})`,
  `   - Ahorro neto en dist/: ${formatBytes(freedDistBytes)} (${freedDistBytes} bytes)\n`,
  '2. ÁRBOL DE TRABAJO ACTUAL (Sin node_modules, .git, dist ni assets-source):',
  `   - Número total de archivos: ${workTree.fileCount}`,
  `   - Tamaño total en bytes: ${workTree.totalBytes} bytes (${formatBytes(workTree.totalBytes)})\n`,
  '3. CARPETAS DE ASSETS TRAS LIMPIEZA:',
  `   - src/assets/ (completa): ${srcAssets.fileCount} archivos, ${formatBytes(srcAssets.totalBytes)}`,
  `   - src/assets/imagenes/ (imágenes heredadas): ${srcAssetsImagenes.fileCount} archivos (0 eliminados al 100%)`,
  `   - src/assets/logos/ (logotipos oficiales): ${srcAssetsLogos.fileCount} archivos, ${formatBytes(srcAssetsLogos.totalBytes)}`,
  `   - public/images/ (completa): ${publicImages.fileCount} archivos, ${formatBytes(publicImages.totalBytes)}`,
  `   - public/images/rifa/ (derivados canónicos): ${publicImagesRifa.fileCount} archivos, ${formatBytes(publicImagesRifa.totalBytes)}\n`,
  '4. DIST/ BUILD DE PRODUCCIÓN:',
  `   - Número total de archivos en dist/: ${distStats.fileCount}`,
  `   - Tamaño total en bytes: ${distStats.totalBytes} bytes (${formatBytes(distStats.totalBytes)})\n`,
  '   LISTADO COMPLETO DE ARCHIVOS EN DIST/:',
  '   ' + '-'.repeat(76),
  '   Ruta                                                                Tamaño',
  '   ' + '-'.repeat(76),
];

distStats.fileList.sort((a, b) => b.size - a.size);
for (const file of distStats.fileList) {
  const pad = ' '.repeat(Math.max(2, 68 - file.relPath.length));
  outputLines.push(`   ${file.relPath}${pad}${formatBytes(file.size)} (${file.size} B)`);
}

outputLines.push('\n================================================================================');

const outPath = path.join(outDir, 'post-limpieza.txt');
fs.writeFileSync(outPath, outputLines.join('\n'), 'utf8');

console.log('✅ Medición post-limpieza guardada exitosamente en:', outPath);
console.log(`   Archivos eliminados: ${baselineWorkFiles - workTree.fileCount}`);
console.log(`   Espacio liberado: ${formatBytes(freedWorkBytes)}`);
console.log(`   Archivos en dist: ${distStats.fileCount} (${formatBytes(distStats.totalBytes)})`);
