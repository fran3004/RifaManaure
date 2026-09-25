#!/usr/bin/env node
/**
 * scripts/cleanup-migrated-buckets.mjs
 *
 * Script controlado para la fase destructiva final de los 3 buckets migrados a Cloudinary:
 * - prize-images
 * - partner-logos
 * - winner-documents
 *
 * REGLAS DE SEGURIDAD ESTRICTAS:
 * 1. NUNCA toca 'payment-proofs', 'receipts' ni 'gallery-images'.
 * 2. Descarga un respaldo físico completo de todos los archivos antes de eliminarlos.
 * 3. Requiere la bandera explícita `--confirm-delete` para ejecutar cambios.
 * 4. Por defecto opera en modo `--dry-run`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Cargar variables de entorno locales
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

const isDryRun = !process.argv.includes('--confirm-delete');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: Se requieren SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para ejecutar esta acción.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// LISTA BLANCA ESTRICTA DE BUCKETS A RETIRAR (EXCLUSIÓN ABSOLUTA DE OTROS)
const TARGET_BUCKETS = ['prize-images', 'partner-logos'];
const PROTECTED_BUCKETS = ['payment-proofs', 'receipts', 'gallery-images', 'winner-documents'];

async function listAllFiles(bucket, prefix = '') {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`Error al listar ${bucket}/${prefix}: ${error.message}`);
  let results = [];
  for (const item of data || []) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (!item.id && !item.metadata) {
      const sub = await listAllFiles(bucket, itemPath);
      results = results.concat(sub);
    } else {
      results.push({ bucket, path: itemPath, name: item.name, size: item.metadata?.size || 0 });
    }
  }
  return results;
}

async function runCleanup() {
  console.log('======================================================================');
  console.log('   FASE DESTRUCTORA CONTROLADA: RETIRO DE BUCKETS MIGRADOS');
  console.log('======================================================================');
  console.log(`Modo: ${isDryRun ? '🔍 SIMULACIÓN (Seguro - no elimina nada)' : '⚠️ REAL (Eliminará objetos y buckets)'}`);
  console.log('Buckets a retirar:', TARGET_BUCKETS.join(', '));
  console.log('Buckets protegidos (NUNCA TOCAR):', PROTECTED_BUCKETS.join(', '));
  console.log('----------------------------------------------------------------------\n');

  // 1. Verificación previa de seguridad
  for (const b of TARGET_BUCKETS) {
    if (PROTECTED_BUCKETS.includes(b)) {
      throw new Error(`¡VIOLACIÓN DE SEGURIDAD! El bucket protegido '${b}' está en la lista de eliminación.`);
    }
  }

  // 2. Inventario de archivos en cada bucket objetivo
  const bucketInventories = {};
  for (const bucket of TARGET_BUCKETS) {
    try {
      const files = await listAllFiles(bucket);
      bucketInventories[bucket] = files;
      console.log(`📦 Bucket '${bucket}': ${files.length} archivos físicos encontrados.`);
      for (const f of files) {
        console.log(`   - ${f.path} (${f.size} bytes)`);
      }
    } catch (err) {
      console.warn(`   ⚠️ Bucket '${bucket}' no pudo listarse o ya fue eliminado: ${err.message}`);
      bucketInventories[bucket] = [];
    }
  }

  if (isDryRun) {
    console.log('\n----------------------------------------------------------------------');
    console.log('ℹ️ MODO SIMULACIÓN COMPLETADO.');
    console.log('Para ejecutar la eliminación física real, proporcione la bandera:');
    console.log('  node scripts/cleanup-migrated-buckets.mjs --confirm-delete');
    return;
  }

  // 3. Respaldo físico preventivo de seguridad antes de cualquier borrado
  const backupRoot = path.join(__dirname, 'storage-backups-pre-deletion');
  if (!fs.existsSync(backupRoot)) {
    fs.mkdirSync(backupRoot, { recursive: true });
  }

  console.log('\n💾 Descargando copia física de seguridad antes de proceder con el borrado...');
  for (const bucket of TARGET_BUCKETS) {
    const files = bucketInventories[bucket] || [];
    for (const file of files) {
      const localFilePath = path.join(backupRoot, bucket, file.path);
      const localDir = path.dirname(localFilePath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      const { data, error } = await supabase.storage.from(bucket).download(file.path);
      if (error || !data) {
        throw new Error(`No se pudo respaldar '${file.path}' del bucket '${bucket}': ${error?.message}`);
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(localFilePath, buffer);
      console.log(`   ✅ Respaldado localmente: ${bucket}/${file.path}`);
    }
  }

  // 4. Eliminación de archivos y destrucción de los buckets
  console.log('\n🗑️ Eliminando archivos y destruyendo buckets...');
  for (const bucket of TARGET_BUCKETS) {
    const files = bucketInventories[bucket] || [];
    if (files.length > 0) {
      const filePaths = files.map((f) => f.path);
      const { error: rmErr } = await supabase.storage.from(bucket).remove(filePaths);
      if (rmErr) {
        throw new Error(`Error al eliminar archivos del bucket '${bucket}': ${rmErr.message}`);
      }
      console.log(`   ✅ Eliminados ${files.length} archivos de '${bucket}'.`);
    }

    const { error: delBucketErr } = await supabase.storage.deleteBucket(bucket);
    if (delBucketErr) {
      console.warn(`   ⚠️ Advertencia al eliminar bucket '${bucket}': ${delBucketErr.message}`);
    } else {
      console.log(`   ✅ Bucket '${bucket}' eliminado exitosamente.`);
    }
  }

  // 5. Verificación final de buckets restantes
  console.log('\n🔍 Verificando estado final de buckets en Supabase Storage...');
  const { data: remainingBuckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.warn('No se pudo obtener la lista final de buckets:', listErr.message);
  } else {
    console.log('Buckets activos en el proyecto:');
    for (const b of remainingBuckets || []) {
      console.log(`   - ${b.id} (public=${b.public})`);
    }
  }

  console.log('\n✅ FASE DESTRUCTORA FINALIZADA EXITOSAMENTE.');
}

runCleanup().catch((err) => {
  console.error('\n💥 ERROR DURANTE LA FASE DESTRUCTORA:');
  console.error(err.message || err);
  process.exit(1);
});

