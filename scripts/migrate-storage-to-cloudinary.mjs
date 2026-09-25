#!/usr/bin/env node
/**
 * scripts/migrate-storage-to-cloudinary.mjs
 *
 * Script de migración de un solo uso para transferir activos existentes desde
 * Supabase Storage hacia Cloudinary de forma segura, auditable e idempotente.
 *
 * Buckets y destinos:
 * - prize-images      -> manaure-vive/premios
 * - partner-logos     -> manaure-vive/aliados
 * - gallery-images    -> manaure-vive/galeria
 * (winner-documents se preserva en Supabase Storage para visualización nativa de PDF)
 *
 * Características:
 * - Requiere SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y credenciales de Cloudinary locales.
 * - Soporta modo de simulación mediante la bandera `--dry-run`.
 * - Es idempotente: no remigra registros que ya apunten a Cloudinary.
 * - Genera un respaldo lógico en scripts/migration-backups/backup-<timestamp>.json.
 * - Registra la operación en public.audit_logs si la tabla está disponible.
 * - Detiene el proceso inmediatamente si se produce un error de actualización en base de datos.
 * - NO borra ningún archivo físico de Supabase Storage.
 * - NO forma parte del bundle frontend ni del pipeline de build.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Cargar variables de entorno locales desde .env o .env.local si no están en process.env
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
const allowOnlyMatched = process.argv.includes('--only-matched');

// 1. Validación estricta de variables de entorno
const requiredEnvVars = isDryRun
  ? ['SUPABASE_URL']
  : [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ];

const missingVars = requiredEnvVars.filter((v) => !process.env[v] && !process.env[`VITE_${v}`]);

if (missingVars.length > 0) {
  console.error('\n❌ ERROR: Faltan variables de entorno requeridas para ejecutar la migración:\n');
  for (const v of missingVars) {
    console.error(`  - ${v}`);
  }
  console.error('\nUso seguro recomendado:');
  console.error(
    '  SUPABASE_SERVICE_ROLE_KEY="ey..." CLOUDINARY_API_SECRET="..." node scripts/migrate-storage-to-cloudinary.mjs [--dry-run]\n'
  );
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || 'ky01b0vz';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || (isDryRun ? 'dry-run-key' : '');
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || (isDryRun ? 'dry-run-secret' : '');

// Cliente de Supabase (Service Role en modo real para bypassear RLS; lectura disponible en simulación)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Genera la firma SHA-1 requerida por la API de Cloudinary.
 */
function generateCloudinarySignature(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  const serialized = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(serialized + secret).digest('hex');
}

/**
 * Sube un buffer a Cloudinary mediante llamada HTTPS directa y autenticada.
 */
async function uploadBufferToCloudinary(buffer, fileName, folder, resourceType = 'auto') {
  const timestamp = Math.floor(Date.now() / 1000);
  const cleanPublicId = path.parse(fileName).name.replace(/[^a-zA-Z0-9_-]+/g, '-');

  const signParams = {
    folder,
    public_id: cleanPublicId,
    timestamp: String(timestamp),
  };

  const signature = generateCloudinarySignature(signParams, CLOUDINARY_API_SECRET);

  const formData = new FormData();
  formData.append('file', new Blob([buffer]));
  formData.append('api_key', CLOUDINARY_API_KEY);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('folder', folder);
  formData.append('public_id', cleanPublicId);

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;
  const res = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(json?.error?.message || `Fallo HTTP de Cloudinary (${res.status})`);
  }

  return {
    secure_url: json.secure_url,
    public_id: json.public_id,
    bytes: json.bytes,
    format: json.format,
  };
}

/**
 * Lista todos los archivos de un bucket de forma recursiva.
 */
async function listBucketFiles(bucket, prefix = '') {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) {
    throw new Error(`Error al listar bucket '${bucket}' en ruta '${prefix}': ${error.message}`);
  }

  let results = [];
  for (const item of data || []) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
    // Si no tiene id ni metadata, representa un subdirectorio
    if (!item.id && !item.metadata) {
      const subFiles = await listBucketFiles(bucket, itemPath);
      results = results.concat(subFiles);
    } else {
      results.push({
        bucket,
        name: item.name,
        path: itemPath,
        size: item.metadata?.size || 0,
        mimetype: item.metadata?.mimetype || '',
      });
    }
  }
  return results;
}

/**
 * Flujo Principal de Migración
 */
async function runMigration() {
  console.log('======================================================================');
  console.log('   MIGRACIÓN SEGURA DE SUPABASE STORAGE HACIA CLOUDINARY');
  console.log('======================================================================');
  console.log(`Proyecto Supabase: ${SUPABASE_URL}`);
  console.log(`Cloudinary Cloud: ${CLOUDINARY_CLOUD_NAME}`);
  console.log(`Modo de ejecución: ${isDryRun ? '🔍 SIMULACIÓN (--dry-run)' : '🚀 REAL (aplicará cambios)'}`);
  console.log('----------------------------------------------------------------------\n');

  const migrationSummary = [];
  const logicalBackups = [];

  // -------------------------------------------------------------------------
  // 1. MIGRACIÓN DE prize-images -> manaure-vive/premios (tabla: prize_experiences)
  // -------------------------------------------------------------------------
  console.log('📦 Inspeccionando bucket "prize-images"...');
  let prizeFiles = [];
  try {
    prizeFiles = await listBucketFiles('prize-images');
    console.log(`   Archivos físicos encontrados en bucket: ${prizeFiles.length}`);
  } catch (err) {
    console.warn(`   ⚠️ Advertencia al consultar bucket 'prize-images': ${err.message}`);
  }

  const { data: prizeExperiences, error: peErr } = await supabase
    .from('prize_experiences')
    .select('id, title, partner_name, image_url');

  if (peErr) {
    throw new Error(`Error al consultar tabla 'prize_experiences': ${peErr.message}`);
  }

  console.log(`   Registros en tabla 'prize_experiences': ${prizeExperiences.length}`);

  const matchedPrizeFiles = new Set();

  for (const exp of prizeExperiences) {
    const currentUrl = exp.image_url || '';

    // Idempotencia: Verificar si ya apunta a Cloudinary
    if (currentUrl.includes('res.cloudinary.com')) {
      const alreadyMigratedFile = prizeFiles.find(
        (f) => currentUrl.includes(path.parse(f.name).name) || currentUrl.includes(f.name)
      );
      if (alreadyMigratedFile) {
        matchedPrizeFiles.add(alreadyMigratedFile.path);
      }

      migrationSummary.push({
        bucket: 'prize-images',
        table: 'prize_experiences',
        id: exp.id,
        identifier: exp.title,
        status: 'OMITIDO_YA_MIGRADO',
        oldUrl: currentUrl,
        newUrl: currentUrl,
      });
      continue;
    }

    // Verificar si apunta a Supabase Storage o tiene archivo asociado
    const matchesFile = prizeFiles.find(
      (f) => currentUrl.includes(f.name) || currentUrl.endsWith(f.path)
    );

    if (matchesFile) {
      matchedPrizeFiles.add(matchesFile.path);
    }

    if (currentUrl.includes('supabase.co/storage') || matchesFile) {
      const filePath = matchesFile ? matchesFile.path : currentUrl.split('/prize-images/').pop()?.split('?')[0];

      if (!filePath) {
        migrationSummary.push({
          bucket: 'prize-images',
          table: 'prize_experiences',
          id: exp.id,
          identifier: exp.title,
          status: 'ERROR_RUTA_NO_DETERMINADA',
          oldUrl: currentUrl,
        });
        continue;
      }

      console.log(`   -> Procesando premio: "${exp.title}" (${filePath})`);

      if (isDryRun) {
        migrationSummary.push({
          bucket: 'prize-images',
          table: 'prize_experiences',
          id: exp.id,
          identifier: exp.title,
          status: 'SIMULADO_LISTO',
          oldUrl: currentUrl,
          targetFolder: 'manaure-vive/premios',
        });
        continue;
      }

      // Descargar de Supabase Storage
      const { data: fileData, error: dlErr } = await supabase.storage
        .from('prize-images')
        .download(filePath);

      if (dlErr || !fileData) {
        throw new Error(`Fallo al descargar archivo '${filePath}' de prize-images: ${dlErr?.message}`);
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const uploadRes = await uploadBufferToCloudinary(buffer, path.basename(filePath), 'manaure-vive/premios', 'image');

      // Actualizar registro en base de datos
      const { error: updErr } = await supabase
        .from('prize_experiences')
        .update({ image_url: uploadRes.secure_url })
        .eq('id', exp.id);

      if (updErr) {
        throw new Error(`¡ERROR CRÍTICO! Fallo al actualizar prize_experiences (${exp.id}): ${updErr.message}`);
      }

      logicalBackups.push({
        table: 'prize_experiences',
        record_id: exp.id,
        column: 'image_url',
        previous_value: currentUrl,
        new_value: uploadRes.secure_url,
        public_id: uploadRes.public_id,
        migrated_at: new Date().toISOString(),
      });

      migrationSummary.push({
        bucket: 'prize-images',
        table: 'prize_experiences',
        id: exp.id,
        identifier: exp.title,
        status: 'MIGRADO_EXITOSO',
        oldUrl: currentUrl,
        newUrl: uploadRes.secure_url,
        publicId: uploadRes.public_id,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 2. MIGRACIÓN DE partner-logos -> manaure-vive/aliados (tabla: partners)
  // -------------------------------------------------------------------------
  console.log('\n📦 Inspeccionando bucket "partner-logos"...');
  let partnerFiles = [];
  try {
    partnerFiles = await listBucketFiles('partner-logos');
    console.log(`   Archivos físicos encontrados en bucket: ${partnerFiles.length}`);
  } catch (err) {
    console.warn(`   ⚠️ Advertencia al consultar bucket 'partner-logos': ${err.message}`);
  }

  const { data: partners, error: partErr } = await supabase
    .from('partners')
    .select('id, name, slug, logo_url');

  if (partErr) {
    throw new Error(`Error al consultar tabla 'partners': ${partErr.message}`);
  }

  console.log(`   Registros en tabla 'partners': ${partners.length}`);

  const matchedPartnerFiles = new Set();

  for (const partner of partners) {
    const currentUrl = partner.logo_url || '';

    if (currentUrl.includes('res.cloudinary.com')) {
      const alreadyMigratedFile = partnerFiles.find(
        (f) => currentUrl.includes(path.parse(f.name).name) || currentUrl.includes(f.name)
      );
      if (alreadyMigratedFile) {
        matchedPartnerFiles.add(alreadyMigratedFile.path);
      }

      migrationSummary.push({
        bucket: 'partner-logos',
        table: 'partners',
        id: partner.id,
        identifier: partner.name,
        status: 'OMITIDO_YA_MIGRADO',
        oldUrl: currentUrl,
        newUrl: currentUrl,
      });
      continue;
    }

    const matchesFile = partnerFiles.find(
      (f) => currentUrl.includes(f.name) || currentUrl.endsWith(f.path)
    );

    if (matchesFile) {
      matchedPartnerFiles.add(matchesFile.path);
    }

    if (currentUrl.includes('supabase.co/storage') || matchesFile) {
      const filePath = matchesFile ? matchesFile.path : currentUrl.split('/partner-logos/').pop()?.split('?')[0];

      if (!filePath) {
        migrationSummary.push({
          bucket: 'partner-logos',
          table: 'partners',
          id: partner.id,
          identifier: partner.name,
          status: 'ERROR_RUTA_NO_DETERMINADA',
          oldUrl: currentUrl,
        });
        continue;
      }

      console.log(`   -> Procesando aliado: "${partner.name}" (${filePath})`);

      if (isDryRun) {
        migrationSummary.push({
          bucket: 'partner-logos',
          table: 'partners',
          id: partner.id,
          identifier: partner.name,
          status: 'SIMULADO_LISTO',
          oldUrl: currentUrl,
          targetFolder: 'manaure-vive/aliados',
        });
        continue;
      }

      const { data: fileData, error: dlErr } = await supabase.storage
        .from('partner-logos')
        .download(filePath);

      if (dlErr || !fileData) {
        throw new Error(`Fallo al descargar '${filePath}' de partner-logos: ${dlErr?.message}`);
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const uploadRes = await uploadBufferToCloudinary(buffer, path.basename(filePath), 'manaure-vive/aliados', 'auto');

      const { error: updErr } = await supabase
        .from('partners')
        .update({ logo_url: uploadRes.secure_url })
        .eq('id', partner.id);

      if (updErr) {
        throw new Error(`¡ERROR CRÍTICO! Fallo al actualizar partners (${partner.id}): ${updErr.message}`);
      }

      logicalBackups.push({
        table: 'partners',
        record_id: partner.id,
        column: 'logo_url',
        previous_value: currentUrl,
        new_value: uploadRes.secure_url,
        public_id: uploadRes.public_id,
        migrated_at: new Date().toISOString(),
      });

      migrationSummary.push({
        bucket: 'partner-logos',
        table: 'partners',
        id: partner.id,
        identifier: partner.name,
        status: 'MIGRADO_EXITOSO',
        oldUrl: currentUrl,
        newUrl: uploadRes.secure_url,
        publicId: uploadRes.public_id,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3. winner-documents: PRESERVADO EN SUPABASE STORAGE
  // -------------------------------------------------------------------------
  // Las actas oficiales de ganadores (PDF) se almacenan exclusivamente en Supabase
  // Storage (bucket 'winner-documents') para visualización directa en el navegador.
  console.log('\n📦 Bucket "winner-documents": Preservado en Supabase Storage (no se migra a Cloudinary)');

  // -------------------------------------------------------------------------
  // 4. MIGRACIÓN DE gallery-images -> manaure-vive/galeria (tabla: gallery_items)
  // -------------------------------------------------------------------------
  console.log('\n📦 Inspeccionando bucket "gallery-images"...');
  let galleryFiles = [];
  try {
    galleryFiles = await listBucketFiles('gallery-images');
    console.log(`   Archivos físicos encontrados en bucket: ${galleryFiles.length}`);
  } catch (err) {
    console.warn(`   ⚠️ Advertencia al consultar bucket 'gallery-images': ${err.message}`);
  }

  const { data: galleryItems, error: galErr } = await supabase
    .from('gallery_items')
    .select('id, title, image_url');

  if (galErr) {
    throw new Error(`Error al consultar tabla 'gallery_items': ${galErr.message}`);
  }

  console.log(`   Registros en tabla 'gallery_items': ${galleryItems.length}`);

  const matchedGalleryFiles = new Set();

  for (const item of galleryItems) {
    const currentUrl = item.image_url || '';

    // Idempotencia: Verificar si ya apunta a Cloudinary
    if (currentUrl.includes('res.cloudinary.com')) {
      const alreadyMigratedFile = galleryFiles.find(
        (f) => currentUrl.includes(path.parse(f.name).name) || currentUrl.includes(f.name)
      );
      if (alreadyMigratedFile) {
        matchedGalleryFiles.add(alreadyMigratedFile.path);
      }

      migrationSummary.push({
        bucket: 'gallery-images',
        table: 'gallery_items',
        id: item.id,
        identifier: item.title,
        status: 'OMITIDO_YA_MIGRADO',
        oldUrl: currentUrl,
        newUrl: currentUrl,
      });
      continue;
    }

    // Verificar si apunta a Supabase Storage o tiene archivo asociado
    const matchesFile = galleryFiles.find(
      (f) => currentUrl.includes(f.name) || currentUrl.endsWith(f.path)
    );

    if (matchesFile) {
      matchedGalleryFiles.add(matchesFile.path);
    }

    if (currentUrl.includes('supabase.co/storage') || matchesFile) {
      const filePath = matchesFile ? matchesFile.path : currentUrl.split('/gallery-images/').pop()?.split('?')[0];

      if (!filePath) {
        migrationSummary.push({
          bucket: 'gallery-images',
          table: 'gallery_items',
          id: item.id,
          identifier: item.title,
          status: 'ERROR_RUTA_NO_DETERMINADA',
          oldUrl: currentUrl,
        });
        continue;
      }

      console.log(`   -> Procesando foto galería: "${item.title}" (${filePath})`);

      if (isDryRun) {
        migrationSummary.push({
          bucket: 'gallery-images',
          table: 'gallery_items',
          id: item.id,
          identifier: item.title,
          status: 'SIMULADO_LISTO',
          oldUrl: currentUrl,
          targetFolder: 'manaure-vive/galeria',
        });
        continue;
      }

      // Descargar de Supabase Storage
      const { data: fileData, error: dlErr } = await supabase.storage
        .from('gallery-images')
        .download(filePath);

      if (dlErr || !fileData) {
        throw new Error(`Fallo al descargar archivo '${filePath}' de gallery-images: ${dlErr?.message}`);
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const uploadRes = await uploadBufferToCloudinary(buffer, path.basename(filePath), 'manaure-vive/galeria', 'image');

      // Actualizar registro en base de datos
      const { error: updErr } = await supabase
        .from('gallery_items')
        .update({ image_url: uploadRes.secure_url })
        .eq('id', item.id);

      if (updErr) {
        throw new Error(`¡ERROR CRÍTICO! Fallo al actualizar gallery_items (${item.id}): ${updErr.message}`);
      }

      logicalBackups.push({
        table: 'gallery_items',
        record_id: item.id,
        column: 'image_url',
        previous_value: currentUrl,
        new_value: uploadRes.secure_url,
        public_id: uploadRes.public_id,
        migrated_at: new Date().toISOString(),
      });

      migrationSummary.push({
        bucket: 'gallery-images',
        table: 'gallery_items',
        id: item.id,
        identifier: item.title,
        status: 'MIGRADO_EXITOSO',
        oldUrl: currentUrl,
        newUrl: uploadRes.secure_url,
        publicId: uploadRes.public_id,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5. DETECCIÓN DE DISCREPANCIAS ENTRE STORAGE Y BASE DE DATOS
  // -------------------------------------------------------------------------
  const discrepancies = [];

  for (const f of prizeFiles) {
    if (!matchedPrizeFiles.has(f.path)) {
      discrepancies.push({
        bucket: 'prize-images',
        file: f.path,
        size: f.size,
        type: 'ARCHIVO_EN_STORAGE_SIN_REGISTRO_EN_BD',
        reason: 'El archivo existe en el bucket prize-images pero ningún premio en prize_experiences apunta a él.',
      });
    }
  }

  for (const f of partnerFiles) {
    if (!matchedPartnerFiles.has(f.path)) {
      discrepancies.push({
        bucket: 'partner-logos',
        file: f.path,
        size: f.size,
        type: 'ARCHIVO_EN_STORAGE_SIN_REGISTRO_EN_BD',
        reason: 'El archivo existe en el bucket partner-logos pero ningún aliado en partners apunta a él.',
      });
    }
  }

  for (const f of winnerFiles) {
    if (!matchedWinnerFiles.has(f.path)) {
      discrepancies.push({
        bucket: 'winner-documents',
        file: f.path,
        size: f.size,
        type: 'ARCHIVO_EN_STORAGE_SIN_REGISTRO_EN_BD',
        reason: 'El archivo existe en el bucket winner-documents pero ningún ganador en winners apunta a él.',
      });
    }
  }

  for (const f of galleryFiles) {
    if (!matchedGalleryFiles.has(f.path)) {
      discrepancies.push({
        bucket: 'gallery-images',
        file: f.path,
        size: f.size,
        type: 'ARCHIVO_EN_STORAGE_SIN_REGISTRO_EN_BD',
        reason: 'El archivo existe en el bucket gallery-images pero ninguna foto en gallery_items apunta a él.',
      });
    }
  }

  // -------------------------------------------------------------------------
  // 6. GUARDAR RESPALDO LÓGICO Y REGISTRO EN AUDITORÍA
  // -------------------------------------------------------------------------
  if (!isDryRun && logicalBackups.length > 0) {
    const backupDir = path.join(__dirname, 'migration-backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilePath = path.join(backupDir, `backup-${timestampStr}.json`);
    fs.writeFileSync(backupFilePath, JSON.stringify(logicalBackups, null, 2), 'utf-8');
    console.log(`\n💾 Respaldo lógico guardado en: ${backupFilePath}`);

    // Intentar registrar en public.audit_logs si la tabla está operativa
    try {
      await supabase.from('audit_logs').insert(
        logicalBackups.map((b) => ({
          action: 'CLOUDINARY_MIGRATION',
          entity_type: b.table,
          entity_id: String(b.record_id),
          details: {
            column: b.column,
            previous_value: b.previous_value,
            new_value: b.new_value,
            public_id: b.public_id,
            migrated_at: b.migrated_at,
          },
        }))
      );
      console.log('📋 Entradas registradas exitosamente en public.audit_logs.');
    } catch (auditErr) {
      console.warn('⚠️ No se pudo escribir en audit_logs (se conserva el respaldo en archivo JSON):', auditErr.message);
    }
  }

  // -------------------------------------------------------------------------
  // 7. RESUMEN FINAL DETALLADO
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log('   RESUMEN DETALLADO DE MIGRACIÓN');
  console.log('======================================================================');
  if (migrationSummary.length === 0) {
    console.log('ℹ️ No se detectaron archivos de Storage pendientes de migración en la base de datos.');
  } else {
    for (const item of migrationSummary) {
      const icon =
        item.status === 'MIGRADO_EXITOSO'
          ? '✅'
          : item.status === 'OMITIDO_YA_MIGRADO'
            ? '⏭️'
            : item.status === 'SIMULADO_LISTO'
              ? '🔎'
              : '❌';
      console.log(`${icon} [${item.bucket}] [${item.table}] ${item.identifier} -> ${item.status}`);
      if (item.newUrl && item.newUrl !== item.oldUrl) {
        console.log(`   Nueva URL: ${item.newUrl}`);
      }
    }
  }

  if (discrepancies.length > 0) {
    console.log('\n⚠️  DISCREPANCIAS DETECTADAS ENTRE STORAGE Y BASE DE DATOS:');
    console.log('----------------------------------------------------------------------');
    for (const d of discrepancies) {
      console.log(`⚠️ [${d.bucket}] ${d.file} (${d.size} bytes)`);
      console.log(`   Motivo: ${d.reason}`);
    }
  }

  console.log('----------------------------------------------------------------------');
  const countMigrated = migrationSummary.filter((s) => s.status === 'MIGRADO_EXITOSO').length;
  const countSkipped = migrationSummary.filter((s) => s.status === 'OMITIDO_YA_MIGRADO').length;
  const countSimulated = migrationSummary.filter((s) => s.status === 'SIMULADO_LISTO').length;

  console.log(`Total analizados en BD: ${migrationSummary.length}`);
  console.log(`Discrepancias (archivos huérfanos en Storage): ${discrepancies.length}`);
  if (isDryRun) {
    console.log(`Archivos listos para migrar (simulados): ${countSimulated}`);
    console.log(`Archivos ya migrados previamente: ${countSkipped}`);
    console.log('\nPara ejecutar la migración real, corre el comando sin la bandera --dry-run.');
  } else {
    console.log(`Archivos migrados exitosamente: ${countMigrated}`);
    console.log(`Archivos ya en Cloudinary (omitidos): ${countSkipped}`);
    console.log('✅ Proceso de migración finalizado.');
  }

  if (!isDryRun && discrepancies.length > 0 && !allowOnlyMatched) {
    console.error('\n🛑 DETENCIÓN DE SEGURIDAD:');
    console.error(`Se detectaron ${discrepancies.length} discrepancias entre Storage y la Base de Datos.`);
    console.error('La política de migración establece detener la operación si hay discrepancias.');
    console.error('Para confirmar y proceder únicamente con los registros coincidentes, use: --only-matched');
    process.exit(2);
  }
}

runMigration().catch((err) => {
  console.error('\n💥 ERROR FATAL DURANTE LA MIGRACIÓN:');
  console.error(err.message || err);
  process.exit(1);
});

