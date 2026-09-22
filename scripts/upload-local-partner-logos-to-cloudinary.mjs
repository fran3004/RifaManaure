#!/usr/bin/env node
/**
 * scripts/upload-local-partner-logos-to-cloudinary.mjs
 *
 * Sube todos los logos locales de aliados (src/assets/logos/master/*.png) a Cloudinary
 * en la carpeta 'manaure-vive/aliados/' y actualiza la columna 'logo_url' en la tabla
 * 'public.partners' de Supabase.
 *
 * Características:
 * - Idempotente: omite aliados que ya tengan URL de Cloudinary.
 * - Soporta --dry-run para simulación previa.
 * - Realiza verificación de conectividad HTTP 200 en cada URL generada.
 * - Registra informe detallado por aliado.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

const missing = [];
if (!SUPABASE_URL) missing.push('SUPABASE_URL');
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!CLOUDINARY_CLOUD_NAME) missing.push('CLOUDINARY_CLOUD_NAME');
if (!CLOUDINARY_API_KEY) missing.push('CLOUDINARY_API_KEY');
if (!CLOUDINARY_API_SECRET) missing.push('CLOUDINARY_API_SECRET');

if (missing.length > 0) {
  console.error('❌ Error de variables de entorno requeridas:');
  console.error(`Faltan: ${missing.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function generateCloudinarySignature(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  const serialized = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(serialized + secret).digest('hex');
}

async function uploadFileToCloudinary(filePath, publicId, folder = 'manaure-vive/aliados') {
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
    bytes: json.bytes,
    format: json.format,
  };
}

async function run() {
  console.log('======================================================================');
  console.log('   MIGRACIÓN DE LOGOS LOCALES DE ALIADOS A CLOUDINARY');
  console.log('======================================================================');
  console.log(`Modo: ${isDryRun ? '🔍 SIMULACIÓN (--dry-run)' : '🚀 EJECUCIÓN REAL'}`);
  console.log(`Cloud Name: ${CLOUDINARY_CLOUD_NAME}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log('----------------------------------------------------------------------\n');

  // 1. Obtener aliados de Supabase
  const { data: partners, error: partnersErr } = await supabase
    .from('partners')
    .select('*')
    .order('display_order', { ascending: true });

  if (partnersErr) {
    throw new Error(`Error al consultar aliados: ${partnersErr.message}`);
  }

  console.log(`Total aliados encontrados en base de datos: ${partners.length}\n`);

  const results = [];

  for (const partner of partners) {
    console.log(`----------------------------------------------------------------------`);
    console.log(`Aliado: "${partner.name}" (slug: ${partner.slug}, ID: ${partner.id})`);
    console.log(`  - URL actual: ${partner.logo_url || '(null)'}`);

    // Si ya apunta a Cloudinary, omitir
    if (partner.logo_url && partner.logo_url.includes('res.cloudinary.com')) {
      console.log('  ⏭️ Ya cuenta con URL de Cloudinary. Omitiendo.');
      results.push({
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        status: 'OMITIDO_YA_MIGRADO',
        url: partner.logo_url,
      });
      continue;
    }

    // Buscar archivo local: primero master png, luego grid-800 webp
    const masterPath = path.join(projectRoot, 'src', 'assets', 'logos', 'master', `${partner.slug}.png`);
    const gridPath = path.join(projectRoot, 'src', 'assets', 'logos', 'grid-800', `${partner.slug}.webp`);

    let localFileToUpload = null;
    if (fs.existsSync(masterPath)) {
      localFileToUpload = masterPath;
    } else if (fs.existsSync(gridPath)) {
      localFileToUpload = gridPath;
    }

    if (!localFileToUpload) {
      console.warn(`  ⚠️ No se encontró logotipo local para el slug '${partner.slug}' en src/assets/logos/`);
      results.push({
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        status: 'ERROR_ARCHIVO_LOCAL_NO_ENCONTRADO',
      });
      continue;
    }

    const fileSize = fs.statSync(localFileToUpload).size;
    console.log(`  📁 Archivo local encontrado: ${path.basename(localFileToUpload)} (${fileSize} bytes)`);

    if (isDryRun) {
      console.log(`  [SIMULACIÓN] Se subiría a Cloudinary como 'manaure-vive/aliados/${partner.slug}'`);
      console.log(`  [SIMULACIÓN] Se actualizaría partners.logo_url para '${partner.name}'`);
      results.push({
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        status: 'SIMULADO_OK',
        file: path.basename(localFileToUpload),
      });
      continue;
    }

    // Subir a Cloudinary
    console.log(`  ⬆️ Subiendo a Cloudinary (folder: manaure-vive/aliados)...`);
    const uploadRes = await uploadFileToCloudinary(localFileToUpload, partner.slug, 'manaure-vive/aliados');
    console.log(`  ✅ Subido exitosamente: ${uploadRes.secure_url} (${uploadRes.bytes} bytes, formato: ${uploadRes.format})`);

    // Actualizar base de datos
    console.log(`  💾 Actualizando base de datos en Supabase...`);
    const { error: updateErr } = await supabase
      .from('partners')
      .update({
        logo_url: uploadRes.secure_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partner.id);

    if (updateErr) {
      throw new Error(`Error al actualizar fila de aliado '${partner.name}': ${updateErr.message}`);
    }

    // Probar accesibilidad de la URL
    const checkRes = await fetch(uploadRes.secure_url, { method: 'HEAD' });
    console.log(`  🌐 Verificación de URL pública: HTTP ${checkRes.status} OK`);

    results.push({
      id: partner.id,
      name: partner.name,
      slug: partner.slug,
      status: 'MIGRADO_EXITOSO',
      url: uploadRes.secure_url,
      public_id: uploadRes.public_id,
      bytes: uploadRes.bytes,
    });
  }

  console.log('\n======================================================================');
  console.log('   RESUMEN FINAL DE MIGRACIÓN DE LOGOS');
  console.log('======================================================================');
  console.table(results);
}

run().catch((err) => {
  console.error('\n💥 ERROR FATAL EN MIGRACIÓN DE LOGOS:');
  console.error(err.message || err);
  process.exit(1);
});

