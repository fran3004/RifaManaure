#!/usr/bin/env node
/**
 * scripts/upload-brand-logos-to-cloudinary.mjs
 *
 * Sube los logos oficiales de la marca Manaure Vive a Cloudinary
 * en la carpeta 'manaure-vive/marca/':
 * - logo-principal.png -> manaure-vive/marca/logo-principal
 * - logo-principal-completo.png -> manaure-vive/marca/logo-principal-completo
 *
 * Características:
 * - Subida directa firmada con SHA-1 y API Secret.
 * - Comprobación de integridad HTTP 200 en las URLs resultantes.
 * - Soporta --dry-run.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Cargar variables de entorno
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

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

const missing = [];
if (!CLOUDINARY_CLOUD_NAME) missing.push('CLOUDINARY_CLOUD_NAME');
if (!CLOUDINARY_API_KEY) missing.push('CLOUDINARY_API_KEY');
if (!CLOUDINARY_API_SECRET) missing.push('CLOUDINARY_API_SECRET');

if (missing.length > 0) {
  console.error(`[ERROR] Faltan variables requeridas de Cloudinary: ${missing.join(', ')}`);
  process.exit(1);
}

function generateSignature(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  const serialized = sortedKeys
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(serialized + secret).digest('hex');
}

async function uploadFileToCloudinary(filePath, publicId) {
  const buffer = fs.readFileSync(filePath);
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'manaure-vive/marca';

  const paramsToSign = {
    folder,
    overwrite: 'true',
    public_id: publicId,
    timestamp: String(timestamp),
  };

  const signature = generateSignature(paramsToSign, CLOUDINARY_API_SECRET);

  const formData = new FormData();
  formData.append('file', new Blob([buffer]));
  formData.append('api_key', CLOUDINARY_API_KEY);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('folder', folder);
  formData.append('public_id', publicId);
  formData.append('overwrite', 'true');

  const uploadEndpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const response = await fetch(uploadEndpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cloudinary API respondió HTTP ${response.status}: ${errorBody}`);
  }

  return await response.json();
}

async function main() {
  console.log('='.repeat(70));
  console.log(`SUBIDA DE LOGOS DE MARCA MANAURE VIVE A CLOUDINARY`);
  console.log(`Modo: ${isDryRun ? 'DRY-RUN (Simulación)' : 'EJECUCIÓN REAL'}`);
  console.log(`Cloud Name: ${CLOUDINARY_CLOUD_NAME}`);
  console.log(`Carpeta destino: manaure-vive/marca`);
  console.log('='.repeat(70));

  const brandLogos = [
    {
      name: 'Logo Principal (Isotipo Colibrí + Montaña + Manaure Vive)',
      publicId: 'logo-principal',
      localFile: path.join(projectRoot, 'src/assets/logos/master/logo-principal.png'),
    },
    {
      name: 'Logo Principal Completo (Institucional con Slogan)',
      publicId: 'logo-principal-completo',
      localFile: path.join(projectRoot, 'src/assets/logos/master/logo-principal-completo.png'),
    },
  ];

  const results = [];

  for (const item of brandLogos) {
    console.log(`\nProcesando: "${item.name}"`);
    console.log(`- Archivo local: ${item.localFile}`);
    console.log(`- Public ID: manaure-vive/marca/${item.publicId}`);

    if (!fs.existsSync(item.localFile)) {
      console.error(`  [ERROR] No existe el archivo local: ${item.localFile}`);
      results.push({ name: item.name, status: 'ERROR_FILE_NOT_FOUND' });
      continue;
    }

    const stats = fs.statSync(item.localFile);
    console.log(`- Tamaño: ${(stats.size / 1024).toFixed(1)} KB`);

    if (isDryRun) {
      console.log(`  [SIMULACIÓN] Se subiría a Cloudinary como 'manaure-vive/marca/${item.publicId}'`);
      results.push({ name: item.name, status: 'DRY_RUN_OK', publicId: item.publicId });
      continue;
    }

    try {
      console.log(`  Subiendo a Cloudinary...`);
      const uploadRes = await uploadFileToCloudinary(item.localFile, item.publicId);
      console.log(`  ✓ Subida exitosa.`);
      console.log(`  - Secure URL: ${uploadRes.secure_url}`);
      console.log(`  - Formato: ${uploadRes.format}, Dimensiones: ${uploadRes.width}x${uploadRes.height}`);

      // Comprobar accesibilidad HTTP
      const verifyRes = await fetch(uploadRes.secure_url, { method: 'HEAD' });
      console.log(`  - Comprobación HTTP: ${verifyRes.status} ${verifyRes.statusText}`);

      results.push({
        name: item.name,
        publicId: item.publicId,
        secureUrl: uploadRes.secure_url,
        status: verifyRes.ok ? 'SUCCESS' : 'HTTP_VERIFY_WARNING',
      });
    } catch (err) {
      console.error(`  [ERROR] Falló la subida:`, err.message);
      results.push({ name: item.name, status: 'ERROR', error: err.message });
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('RESUMEN DE SUBIDA:');
  console.log('='.repeat(70));
  console.table(results);

  const hasErrors = results.some((r) => r.status.startsWith('ERROR'));
  if (hasErrors) {
    console.error('\nSe registraron errores durante la subida.');
    process.exit(1);
  } else {
    console.log('\n¡Todos los logos de marca fueron procesados exitosamente!');
  }
}

main().catch((err) => {
  console.error('Error fatal no controlado:', err);
  process.exit(1);
});
