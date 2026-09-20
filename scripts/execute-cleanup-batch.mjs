import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const quarantineDir = path.resolve(rootDir, '..', '_cuarentena-limpieza-20260920');

const batchArg = process.argv.find((a) => a.startsWith('--batch='));
if (!batchArg) {
  console.error('Uso: node scripts/execute-cleanup-batch.mjs --batch=<4|6|7>');
  process.exit(1);
}

const batchNum = parseInt(batchArg.split('=')[1], 10);
console.log(`\n============================================================`);
console.log(`EJECUTANDO LIMPIEZA — LOTE ${batchNum}`);
console.log(`============================================================\n`);

let filesToQuarantine = [];
let emptyDirsToClean = [];

if (batchNum === 4) {
  // Lote 4: 108 archivos de src/assets/imagenes/ + public/icons.svg
  const srcAssetsImgs = path.join(rootDir, 'src', 'assets', 'imagenes');
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else filesToQuarantine.push(full);
    }
  }
  walk(srcAssetsImgs);
  const iconsSvg = path.join(rootDir, 'public', 'icons.svg');
  if (fs.existsSync(iconsSvg)) {
    filesToQuarantine.push(iconsSvg);
  }
} else if (batchNum === 6) {
  // Lote 6: src/App.css
  const appCss = path.join(rootDir, 'src', 'App.css');
  if (fs.existsSync(appCss)) {
    filesToQuarantine.push(appCss);
  }
} else if (batchNum === 7) {
  // Lote 7: Directorios vacíos
  const srcAssetsImgs = path.join(rootDir, 'src', 'assets', 'imagenes');
  if (fs.existsSync(srcAssetsImgs)) {
    function walkDirs(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          walkDirs(full);
          emptyDirsToClean.push(full);
        }
      }
    }
    walkDirs(srcAssetsImgs);
    emptyDirsToClean.push(srcAssetsImgs);
  }
}

console.log(`1. Archivos identificados para Lote ${batchNum}: ${filesToQuarantine.length}`);
console.log(`   Directorios identificados: ${emptyDirsToClean.length}`);

// Paso 1: Mover a cuarentena
console.log(`\n2. Moviendo elementos a cuarentena externa (${quarantineDir})...`);
const movedFiles = [];

for (const src of filesToQuarantine) {
  const rel = path.relative(rootDir, src);
  const dest = path.join(quarantineDir, rel);
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  fs.unlinkSync(src);
  movedFiles.push({ src, dest, rel });
}

for (const dir of emptyDirsToClean) {
  if (fs.existsSync(dir)) {
    const rel = path.relative(rootDir, dir);
    const dest = path.join(quarantineDir, rel);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    try {
      fs.rmdirSync(dir);
      console.log(`   Directorio removido: ${rel}`);
    } catch (e) {
      console.warn(`   No se pudo remover directorio (no vacío): ${rel}`);
    }
  }
}

console.log(`   ✅ ${movedFiles.length} archivos transferidos a cuarentena.`);

// Paso 2: Ejecutar comprobaciones de salud del proyecto
console.log('\n3. Ejecutando pruebas de integridad (typecheck, lint, build)...');
try {
  console.log('   - Ejecutando tsc -b (typecheck)...');
  execSync('npm run typecheck', { cwd: rootDir, stdio: 'inherit' });

  console.log('   - Ejecutando oxlint (lint)...');
  execSync('npm run lint', { cwd: rootDir, stdio: 'inherit' });

  console.log('   - Ejecutando vitest (tests)...');
  execSync('npm run test', { cwd: rootDir, stdio: 'inherit' });

  console.log('   - Ejecutando vite build...');
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
  console.log('   ✅ Todas las pruebas pasaron limpiamente.');
} catch (err) {
  console.error('\n❌ ERROR EN LA COMPROBACIÓN DE SALUD DEL LOTE. Restaurando desde cuarentena...');
  for (const item of movedFiles) {
    const parent = path.dirname(item.src);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.copyFileSync(item.dest, item.src);
  }
  console.error('✅ Archivos restaurados exitosamente.');
  process.exit(1);
}

// Paso 3: Verificar que en dist/ no haya enlaces rotos
console.log('\n4. Verificando integridad de dist/ (cero 404s internos)...');
const distDir = path.join(rootDir, 'dist');
function checkDistAssets(dir) {
  let broken = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      broken += checkDistAssets(full);
    } else if (e.name.endsWith('.html') || e.name.endsWith('.js') || e.name.endsWith('.css')) {
      const content = fs.readFileSync(full, 'utf8');
      // Buscar rutas locales como /images/rifa/... o /assets/...
      const assetMatches = content.match(/\/images\/rifa\/[a-zA-Z0-9_\-\.\/]+/g) || [];
      for (const m of assetMatches) {
        const target = path.join(rootDir, 'public', m.replace(/^\//, ''));
        if (!fs.existsSync(target)) {
          console.error(`   ❌ Enlace roto detectado en dist/: ${m}`);
          broken++;
        }
      }
    }
  }
  return broken;
}

const brokenCount = checkDistAssets(distDir);
if (brokenCount === 0) {
  console.log('   ✅ Cero referencias rotas en dist/.');
} else {
  console.error(`   ❌ Se encontraron ${brokenCount} enlaces rotos en dist/.`);
  process.exit(1);
}

console.log(`\n============================================================`);
console.log(`LOTE ${batchNum} VALIDADO Y COMPLETADO EXITOSAMENTE`);
console.log(`============================================================`);
