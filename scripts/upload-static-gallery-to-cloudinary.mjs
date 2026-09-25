#!/usr/bin/env node
/**
 * scripts/upload-static-gallery-to-cloudinary.mjs
 *
 * Sube a Cloudinary las 26 fotografías del catálogo estático de la galería
 * (ubicadas en public/images/rifa/** y catalogadas en src/types/image-manifest.ts)
 * en la carpeta 'manaure-vive/galeria/<category>/' con su ID original como public_id.
 *
 * Características:
 * - Carga variables desde .env y .env.local.
 * - Soporta modo de simulación mediante la bandera `--dry-run`.
 * - Selección automática del archivo de mayor calidad (priorizando role === 'lightbox').
 * - Firma HMAC-SHA1 directa sin dependencias externas pesadas.
 * - Idempotente: lee mapeos previos en scripts/migration-backups/ para evitar resubidas.
 * - Verificación de conectividad HTTP 200 en cada URL generada.
 * - Guarda el mapa generado en scripts/migration-backups/gallery-static-cloudinary-map-<timestamp>.json.
 * - No altera archivos locales en public/ ni modifica image-manifest.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. Cargar variables de entorno locales desde .env o .env.local
function loadLocalEnv() {
  const envFiles = ['.env', '.env.local'];
  for (const envFile of envFiles) {
    const filePath = path.join(projectRoot, envFile);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadLocalEnv();

const isDryRun = process.argv.includes('--dry-run');

// 2. Validación de credenciales de Cloudinary
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || 'ky01b0vz';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

const missing = [];
if (!CLOUDINARY_CLOUD_NAME) missing.push('CLOUDINARY_CLOUD_NAME');
if (!isDryRun) {
  if (!CLOUDINARY_API_KEY) missing.push('CLOUDINARY_API_KEY');
  if (!CLOUDINARY_API_SECRET) missing.push('CLOUDINARY_API_SECRET');
}

if (missing.length > 0) {
  console.error('\n❌ ERROR: Faltan variables de entorno requeridas para ejecutar la subida a Cloudinary:\n');
  for (const v of missing) {
    console.error(`  - ${v}`);
  }
  console.error('\nUso seguro recomendado:');
  console.error(
    '  CLOUDINARY_API_KEY="..." CLOUDINARY_API_SECRET="..." node scripts/upload-static-gallery-to-cloudinary.mjs [--dry-run]\n'
  );
  process.exit(1);
}

// 3. Importar manifiesto de imágenes
import { imageManifest } from '../src/types/image-manifest.ts';

// Cargar manifiesto crudo con variantes físicas locales de respaldo
let rawManifestImages = null;
const rawManifestPath = path.join(projectRoot, 'public', 'images', 'rifa', 'image-manifest.json');
if (fs.existsSync(rawManifestPath)) {
  try {
    const rawData = JSON.parse(fs.readFileSync(rawManifestPath, 'utf-8'));
    if (Array.isArray(rawData.images)) {
      rawManifestImages = new Map(rawData.images.map((img) => [img.id, img]));
    }
  } catch {}
}

/**
 * Genera la firma SHA-1 requerida por la API de Cloudinary.
 */
function generateCloudinarySignature(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  const serialized = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(serialized + secret).digest('hex');
}

/**
 * Sube un archivo local a Cloudinary mediante llamada HTTPS directa y autenticada.
 */
async function uploadFileToCloudinary(filePath, publicId, folder) {
  const buffer = fs.readFileSync(filePath);
  const timestamp = Math.floor(Date.now() / 1000);

  const signParams = {
    folder,
    public_id: publicId,
    timestamp: String(timestamp),
  };

  const signature = generateCloudinarySignature(signParams, CLOUDINARY_API_SECRET);

  const formData = new FormData();
  formData.append('file', new Blob([buffer]));
  formData.append('api_key', CLOUDINARY_API_KEY);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('folder', folder);
  formData.append('public_id', publicId);

  const uploadEndpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const response = await fetch(uploadEndpoint, {
    method: 'POST',
    body: formData,
  });

  const json = await response.json();
  if (!response.ok || !json.secure_url) {
    throw new Error(json?.error?.message || `Fallo al subir a Cloudinary (HTTP ${response.status})`);
  }

  return {
    secure_url: json.secure_url,
    public_id: json.public_id,
    width: json.width,
    height: json.height,
    bytes: json.bytes,
    format: json.format,
  };
}

/**
 * Resuelve la variante de mayor calidad disponible para una entrada del catálogo:
 * Prioriza la variante con role === 'lightbox'; si no existe, usa la de width más alto.
 */
function resolveHighestQualityVariant(entry) {
  let variants = entry.variants;
  if (!variants || variants.length === 0) {
    if (rawManifestImages && rawManifestImages.has(entry.id)) {
      variants = rawManifestImages.get(entry.id).variants;
    }
  }

  if (!variants || variants.length === 0) {
    throw new Error(`La entrada '${entry.id}' no contiene ninguna variante fotográfica.`);
  }

  const lightboxVariant = variants.find((v) => v.role === 'lightbox');
  if (lightboxVariant) {
    return { variant: lightboxVariant, reason: 'lightbox' };
  }

  const sortedByWidth = [...variants].sort((a, b) => (b.width || 0) - (a.width || 0));
  return { variant: sortedByWidth[0], reason: 'max_width' };
}

/**
 * Resuelve la ruta física del archivo .jpg de la variante seleccionada en el sistema de archivos.
 */
function resolveLocalFilePath(entry, chosenVariant) {
  if (!chosenVariant.jpg || !chosenVariant.jpg.url) {
    throw new Error(`La variante seleccionada para '${entry.id}' no contiene una URL válida de .jpg.`);
  }

  const relPath = chosenVariant.jpg.url.replace(/^\//, '');
  const fullPath = path.resolve(projectRoot, 'public', relPath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`El archivo físico no fue encontrado en disco: ${fullPath}`);
  }

  return fullPath;
}

/**
 * Carga mapeos previos desde archivos en scripts/migration-backups/ para garantizar idempotencia.
 */
function loadPreviousMappings() {
  const backupDir = path.join(__dirname, 'migration-backups');
  if (!fs.existsSync(backupDir)) return new Map();

  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('gallery-static-cloudinary-map-') && f.endsWith('.json'))
    .sort()
    .reverse();

  const map = new Map();
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(backupDir, file), 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item?.id && item?.secureUrl && item.secureUrl.includes('res.cloudinary.com')) {
            if (!map.has(item.id)) {
              map.set(item.id, item);
            }
          }
        }
      }
    } catch {
      // Ignorar archivos corruptos o ilegibles
    }
  }
  return map;
}

/**
 * Función principal del proceso de subida
 */
async function run() {
  console.log('======================================================================');
  console.log('   SUBIDA DE GALERÍA ESTÁTICA A CLOUDINARY (MANAURE VIVE)');
  console.log('======================================================================');
  console.log(`Modo:        ${isDryRun ? '🔍 SIMULACIÓN (--dry-run)' : '🚀 EJECUCIÓN REAL'}`);
  console.log(`Cloud Name:  ${CLOUDINARY_CLOUD_NAME}`);
  console.log(`Origen:      public/images/rifa/** via src/types/image-manifest.ts`);
  console.log('----------------------------------------------------------------------\n');

  const entries = Object.values(imageManifest);
  console.log(`Total fotos catalogadas en imageManifest: ${entries.length}\n`);

  const previousMap = loadPreviousMappings();
  if (previousMap.size > 0) {
    console.log(`ℹ️ Se detectaron ${previousMap.size} activos ya mapeados en respaldos previos.`);
  }

  const summary = [];
  const finalMap = [];

  let countSuccess = 0;
  let countSkipped = 0;
  let countFailed = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const indexStr = `[${String(i + 1).padStart(2, '0')}/${entries.length}]`;
    const targetFolder = `manaure-vive/galeria/${entry.category}`;
    const targetPublicId = entry.id;
    const expectedFullPath = `${targetFolder}/${targetPublicId}`;

    console.log(`----------------------------------------------------------------------`);
    console.log(`${indexStr} Foto: "${entry.id}" | Categoría: ${entry.category}`);
    console.log(`   Carpeta destino: ${targetFolder}`);
    console.log(`   Public ID:       ${targetPublicId}`);
    console.log(`   Ruta Cloudinary: ${expectedFullPath}`);

    // Regla 3: Idempotencia - verificar si ya existe en mapeo previo y en Cloudinary
    if (previousMap.has(entry.id)) {
      const prev = previousMap.get(entry.id);
      let existsOnCloudinary = false;
      try {
        const testRes = await fetch(prev.secureUrl, { method: 'HEAD' });
        existsOnCloudinary = testRes.ok;
      } catch {}

      if (existsOnCloudinary) {
        console.log(`   ⏭️ Ya cuenta con mapeo válido y verificado en Cloudinary (HTTP 200): ${prev.secureUrl}. Omitiendo.`);
        countSkipped++;
        summary.push({
          num: i + 1,
          id: entry.id,
          category: entry.category,
          folder: targetFolder,
          publicId: prev.publicId || expectedFullPath,
          status: 'OMITIDO_YA_MIGRADO',
          secureUrl: prev.secureUrl,
        });
        finalMap.push({
          id: entry.id,
          category: entry.category,
          publicId: prev.publicId || expectedFullPath,
          secureUrl: prev.secureUrl,
          width: prev.width,
          height: prev.height,
        });
        continue;
      } else {
        console.log(`   ℹ️ Mapeo previo no responde HTTP 200 en Cloudinary. Procediendo con la subida física...`);
      }
    }

    // Regla 1: Resolver variante de mayor calidad y archivo físico .jpg
    let chosenVariant;
    let localFilePath;
    try {
      const resolved = resolveHighestQualityVariant(entry);
      chosenVariant = resolved.variant;
      localFilePath = resolveLocalFilePath(entry, chosenVariant);
    } catch (err) {
      console.error(`   ❌ Error resolviendo archivo local: ${err.message}`);
      countFailed++;
      summary.push({
        num: i + 1,
        id: entry.id,
        category: entry.category,
        folder: targetFolder,
        publicId: targetPublicId,
        status: 'ERROR_ARCHIVO_LOCAL',
        secureUrl: null,
      });
      continue;
    }

    const fileSize = fs.statSync(localFilePath).size;
    console.log(`   📁 Archivo de origen: ${path.relative(projectRoot, localFilePath)}`);
    console.log(
      `   📐 Dimensiones: ${chosenVariant.width}x${chosenVariant.height} (${(fileSize / 1024).toFixed(1)} KB) [role: ${chosenVariant.role}]`
    );

    // Regla 6: Simulación
    if (isDryRun) {
      console.log(`   🔍 [SIMULACIÓN] Se subiría a Cloudinary como '${expectedFullPath}'`);
      summary.push({
        num: i + 1,
        id: entry.id,
        category: entry.category,
        folder: targetFolder,
        publicId: targetPublicId,
        status: 'SIMULADO_LISTO',
        secureUrl: `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${expectedFullPath}.jpg`,
      });
      finalMap.push({
        id: entry.id,
        category: entry.category,
        publicId: expectedFullPath,
        secureUrl: `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${expectedFullPath}.jpg`,
        width: chosenVariant.width,
        height: chosenVariant.height,
      });
      continue;
    }

    // Ejecución Real
    try {
      console.log(`   ⬆️ Subiendo a Cloudinary...`);
      const uploadRes = await uploadFileToCloudinary(localFilePath, targetPublicId, targetFolder);
      console.log(`   ✅ Subido exitosamente: ${uploadRes.secure_url}`);

      // Verificación de conectividad HTTP 200
      console.log(`   🌐 Verificando conectividad HTTP 200...`);
      const checkRes = await fetch(uploadRes.secure_url, { method: 'HEAD' });
      if (!checkRes.ok) {
        throw new Error(`Verificación HTTP falló para ${uploadRes.secure_url} (status ${checkRes.status})`);
      }
      console.log(`   ✅ Verificación HTTP 200 OK.`);

      countSuccess++;
      summary.push({
        num: i + 1,
        id: entry.id,
        category: entry.category,
        folder: targetFolder,
        publicId: uploadRes.public_id,
        status: 'SUBIDO_EXITOSO',
        secureUrl: uploadRes.secure_url,
      });
      finalMap.push({
        id: entry.id,
        category: entry.category,
        publicId: uploadRes.public_id,
        secureUrl: uploadRes.secure_url,
        width: uploadRes.width || chosenVariant.width,
        height: uploadRes.height || chosenVariant.height,
      });
    } catch (uploadErr) {
      console.error(`   ❌ Error subiendo '${entry.id}': ${uploadErr.message}`);
      countFailed++;
      summary.push({
        num: i + 1,
        id: entry.id,
        category: entry.category,
        folder: targetFolder,
        publicId: targetPublicId,
        status: 'ERROR_SUBIDA',
        secureUrl: null,
      });
    }
  }

  // Resumen Final
  console.log('\n======================================================================');
  console.log('   RESUMEN DETALLADO DE SUBIDA DE GALERÍA ESTÁTICA');
  console.log('======================================================================');
  console.table(
    summary.map((s) => ({
      '#': s.num,
      ID: s.id,
      Categoría: s.category,
      'Carpeta Destino': s.folder,
      'Public ID': s.publicId,
      Estado: s.status,
    }))
  );

  console.log('----------------------------------------------------------------------');
  console.log(`Total fotos catalogadas: ${entries.length}`);
  if (isDryRun) {
    const readyCount = summary.filter((s) => s.status === 'SIMULADO_LISTO').length;
    console.log(`Fotos listas para subir (simuladas): ${readyCount}`);
    console.log(`Fotos ya en Cloudinary (omitidas):   ${countSkipped}`);
    console.log(`Errores detectados en archivos:     ${countFailed}`);
    console.log('\nPara ejecutar la subida real a Cloudinary, corre el comando sin --dry-run.');
  } else {
    console.log(`Fotos subidas exitosamente:          ${countSuccess}`);
    console.log(`Fotos ya existentes (omitidas):      ${countSkipped}`);
    console.log(`Fotos fallidas:                      ${countFailed}`);

    if (finalMap.length > 0) {
      const backupDir = path.join(__dirname, 'migration-backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilePath = path.join(backupDir, `gallery-static-cloudinary-map-${timestamp}.json`);
      fs.writeFileSync(backupFilePath, JSON.stringify(finalMap, null, 2), 'utf-8');
      console.log(`\n💾 Mapeo guardado exitosamente en:\n   ${backupFilePath}`);
    }
  }
}

run().catch((err) => {
  console.error('\n💥 ERROR FATAL EN SUBIDA DE GALERÍA ESTÁTICA:');
  console.error(err.message || err);
  process.exit(1);
});
