#!/usr/bin/env node
/**
 * scripts/delete-cloudinary-actas-folder.mjs
 *
 * Script de saneamiento y purga definitiva para eliminar la carpeta
 * 'manaure-vive/actas-ganadores' en Cloudinary, tras haber migrado
 * el almacenamiento de actas oficialmente a Supabase Storage.
 *
 * Modos de ejecución:
 * 1. Mediante credenciales de Cloudinary (CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET):
 *    CLOUDINARY_API_KEY="..." CLOUDINARY_API_SECRET="..." node scripts/delete-cloudinary-actas-folder.mjs
 *
 * 2. Mediante sesión administrativa de Supabase (invocando la Edge Function cloudinary-sign):
 *    node scripts/delete-cloudinary-actas-folder.mjs --token <jwt_admin_token>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Cargar variables locales desde .env o .env.local
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

const FOLDER_TO_DELETE = 'manaure-vive/actas-ganadores';
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || 'ky01b0vz';

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx < process.argv.length - 1 ? process.argv[idx + 1] : null;
}

const apiKey = getArg('--api-key') || process.env.CLOUDINARY_API_KEY;
const apiSecret = getArg('--api-secret') || process.env.CLOUDINARY_API_SECRET;
const adminToken = getArg('--token') || process.env.ADMIN_TOKEN;
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://bxhzvmbbsisxqpwrgvgn.supabase.co';

async function main() {
  console.log('====================================================================');
  console.log('🧹 Purga y Eliminación de Carpeta en Cloudinary: ' + FOLDER_TO_DELETE);
  console.log('====================================================================\n');

  if (adminToken) {
    console.log('🔑 Modo: Utilizando Token Administrativo de Supabase y Edge Function cloudinary-sign...');
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/cloudinary-sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          action: 'delete_folder',
          folder: FOLDER_TO_DELETE,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        console.log(`✅ ¡Carpeta "${FOLDER_TO_DELETE}" eliminada exitosamente en Cloudinary!`);
        process.exit(0);
      } else {
        console.error(`❌ Error al eliminar carpeta vía Edge Function: ${data?.error || res.statusText}`);
        process.exit(1);
      }
    } catch (err) {
      console.error('❌ Excepción al invocar Edge Function:', err.message);
      process.exit(1);
    }
  }

  if (apiKey && apiSecret) {
    console.log(`🔑 Modo: Utilizando API Credentials de Cloudinary (${CLOUD_NAME})...`);
    const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;

    try {
      // 1. Purgar recursos dentro de la carpeta (tanto image como raw si existieran)
      console.log(`⏳ Purgando recursos existentes en "${FOLDER_TO_DELETE}"...`);
      for (const resType of ['image', 'raw']) {
        const deleteResUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/${resType}/upload?prefix=${encodeURIComponent(FOLDER_TO_DELETE)}&all=true`;
        const delRes = await fetch(deleteResUrl, {
          method: 'DELETE',
          headers: { Authorization: authHeader },
        });
        const delData = await delRes.json().catch(() => ({}));
        console.log(`   - Purgado de recursos (${resType}):`, delData?.deleted ? Object.keys(delData.deleted).length : '0 o no encontrados');
      }

      // 2. Eliminar la carpeta
      console.log(`⏳ Eliminando carpeta "${FOLDER_TO_DELETE}" en Cloudinary...`);
      const deleteFolderUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/folders/${encodeURIComponent(FOLDER_TO_DELETE)}`;
      const folderRes = await fetch(deleteFolderUrl, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      });

      const folderData = await folderRes.json().catch(() => ({}));
      if (folderRes.ok) {
        console.log(`✅ ¡Carpeta "${FOLDER_TO_DELETE}" eliminada exitosamente en Cloudinary!`);
        process.exit(0);
      } else {
        if (folderData?.error?.message?.includes('not found') || folderData?.error?.message?.includes('does not exist')) {
          console.log(`ℹ️ La carpeta "${FOLDER_TO_DELETE}" ya no existe en Cloudinary (previamente eliminada).`);
          process.exit(0);
        }
        console.error(`❌ Error al eliminar carpeta: ${folderData?.error?.message || folderRes.statusText}`);
        process.exit(1);
      }
    } catch (err) {
      console.error('❌ Error de conexión con Cloudinary:', err.message);
      process.exit(1);
    }
  }

  console.log('ℹ️ Para ejecutar la eliminación física de la carpeta en Cloudinary:');
  console.log('\nOpción 1: Con credenciales de Cloudinary:');
  console.log('  CLOUDINARY_API_KEY="..." CLOUDINARY_API_SECRET="..." node scripts/delete-cloudinary-actas-folder.mjs');
  console.log('\nOpción 2: Con sesión de administrador Supabase:');
  console.log('  node scripts/delete-cloudinary-actas-folder.mjs --token <tu_token_jwt_de_admin>');
}

main();
