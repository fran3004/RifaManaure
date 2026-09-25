/**
 * Script de sincronización de carpetas de categorías de galería en Cloudinary.
 *
 * Verifica que todas las categorías registradas en Supabase (y las canónicas)
 * cuenten con su carpeta correspondiente en Cloudinary sin borrar carpetas existentes.
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Cargar variables de entorno de .env
const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const cloudName = env.VITE_CLOUDINARY_CLOUD_NAME;
const apiKey = env.CLOUDINARY_API_KEY;
const apiSecret = env.CLOUDINARY_API_SECRET;
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!cloudName || !apiKey || !apiSecret) {
  console.error('❌ Error: Credenciales de Cloudinary incompletas en .env');
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getExistingSubfolders(parentPath) {
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/folders/${encodeURIComponent(parentPath)}`, {
    headers: { Authorization: authHeader },
  });
  if (!res.ok) {
    console.warn(`Advertencia al listar ${parentPath}: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return (data.folders || []).map((f) => f.name);
}

async function createFolder(folderPath) {
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/folders/${encodeURIComponent(folderPath)}`, {
    method: 'POST',
    headers: { Authorization: authHeader },
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log(`  ✅ Carpeta creada en Cloudinary: "${folderPath}"`);
    return true;
  }
  console.log(`  ℹ️ Estado al crear "${folderPath}": ${data?.error?.message || res.statusText}`);
  return false;
}

async function main() {
  console.log('=====================================================');
  console.log(' Sincronización de Carpetas por Categoría Cloudinary ');
  console.log('=====================================================');
  console.log(`Cloud Name: ${cloudName}`);

  // 1. Obtener carpetas existentes en manaure-vive/galeria
  const existingSubfolders = await getExistingSubfolders('manaure-vive/galeria');
  console.log('Carpetas existentes actualmente en manaure-vive/galeria:');
  console.log(existingSubfolders.map((f) => ` - ${f}`).join('\n') || ' (ninguna)');

  // 2. Obtener categorías de Supabase
  const { data: dbCategories, error: catError } = await supabase.from('gallery_categories').select('*');
  if (catError) {
    console.warn('⚠️ No se pudieron consultar las categorías de Supabase:', catError.message);
  }

  const categorySlugs = new Set([
    'cuatrimoto',
    'parapente',
    'serrania',
    'hospedaje',
    'gastronomia',
    'glamping',
    'fogata',
  ]);

  if (dbCategories) {
    for (const c of dbCategories) {
      if (c.slug && c.slug !== 'otro') {
        categorySlugs.add(c.slug);
      }
    }
  }

  console.log(`\nVerificando ${categorySlugs.size} categorías objetivo...`);
  for (const slug of categorySlugs) {
    const targetFolder = `manaure-vive/galeria/${slug}`;
    if (existingSubfolders.includes(slug)) {
      console.log(`  ✓ Carpeta ya existente: "${targetFolder}"`);
    } else {
      console.log(`  ⏳ Creando carpeta faltante: "${targetFolder}"...`);
      await createFolder(targetFolder);
    }
  }

  // 3. Revisar fotos registradas en Supabase
  const { data: items, error: itemsError } = await supabase
    .from('gallery_items')
    .select('id, title, category, image_url, image_slug');

  if (items && items.length > 0) {
    console.log(`\nVerificadas ${items.length} fotos en gallery_items:`);
    const customCount = items.filter((i) => i.image_url).length;
    const staticCount = items.filter((i) => !i.image_url && i.image_slug).length;
    console.log(` - Fotos con archivo personalizado (Cloudinary): ${customCount}`);
    console.log(` - Fotos vinculadas al catálogo estático: ${staticCount}`);
  }

  console.log('\n=====================================================');
  console.log(' Sincronización completada exitosamente.');
  console.log('=====================================================');
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
