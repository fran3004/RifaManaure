import { supabase } from '@/lib/supabase';

export interface CloudinaryUploadOptions {
  resourceType?: 'image' | 'auto';
}

export interface CloudinaryUploadResult {
  success: boolean;
  secure_url?: string;
  public_id?: string;
  error?: string;
}

export interface CloudinaryDeleteResult {
  success: boolean;
  error?: string;
}

interface CloudinarySignUploadResponse {
  success: boolean;
  action: 'upload';
  signature: string;
  timestamp: number;
  folder: string;
  api_key: string;
  cloud_name: string;
  error?: string;
}

interface CloudinarySignDestroyResponse {
  success: boolean;
  action: 'destroy';
  signature: string;
  timestamp: number;
  public_id: string;
  api_key: string;
  cloud_name: string;
  error?: string;
}

/**
 * Sube un archivo a Cloudinary mediante firma segura generada por la Edge Function 'cloudinary-sign'.
 * Requiere que el usuario tenga una sesión administrativa activa.
 *
 * @param file Archivo local a subir (File o Blob)
 * @param folder Carpeta destino en Cloudinary (ej: 'manaure-vive/premios', 'manaure-vive/aliados')
 * @param options Opciones adicionales (tipo de recurso: 'image' | 'auto')
 */
export async function uploadToCloudinary(
  file: File | Blob,
  folder: string,
  options: CloudinaryUploadOptions = {}
): Promise<CloudinaryUploadResult> {
  try {
    if (!file) {
      return { success: false, error: 'No se suministró ningún archivo para subir.' };
    }

    const cleanFolder = folder.trim();
    if (!cleanFolder) {
      return { success: false, error: 'Debe especificarse una carpeta de destino válida.' };
    }

    // 1. Obtener sesión de Supabase Auth para autorizar la invocación de la Edge Function
    let { data: sessionData } = await supabase.auth.getSession();
    let token = sessionData?.session?.access_token;

    // Si no hay token o la sesión está próxima a caducar, intentar refrescar
    if (!token) {
      const { data: refreshData } = await supabase.auth.refreshSession();
      token = refreshData?.session?.access_token;
    }

    if (!token) {
      return {
        success: false,
        error: 'Sesión no iniciada o expirada. Por favor inicia sesión nuevamente en el panel.',
      };
    }

    // 2. Invocar la Edge Function 'cloudinary-sign' para obtener la firma HMAC-SHA1
    const { data: signData, error: signError } = await supabase.functions.invoke<CloudinarySignUploadResponse>(
      'cloudinary-sign',
      {
        body: {
          action: 'upload',
          folder: cleanFolder,
        },
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (signError || !signData || !signData.signature) {
      let errorMsg = signData?.error;

      // Extraer mensaje de error detallado del cuerpo devuelto por la Edge Function
      if (!errorMsg && signError && typeof signError === 'object' && 'context' in signError) {
        try {
          const resp = (signError as { context: Response }).context;
          if (resp && typeof resp.clone === 'function') {
            const errBody = await resp.clone().json();
            if (errBody?.error) {
              errorMsg = errBody.error;
            }
          }
        } catch {
          // Ignorar parseo si no es JSON
        }
      }

      if (!errorMsg) {
        errorMsg =
          signError?.message ||
          'No fue posible obtener la firma de autorización para Cloudinary.';
      }

      console.error('[cloudinaryService] Error al obtener firma de subida:', errorMsg);
      return { success: false, error: errorMsg };
    }

    const { signature, timestamp, api_key, cloud_name, folder: signedFolder } = signData;

    // 3. Construir FormData con los parámetros autenticados
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', api_key);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);
    formData.append('folder', signedFolder);

    const resourceType = options.resourceType || 'image';
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloud_name}/${resourceType}/upload`;

    // 4. Subir directamente por HTTPS a la API de Cloudinary
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    const uploadResult = await uploadResponse.json();

    if (!uploadResponse.ok || !uploadResult.secure_url) {
      const errorDetail =
        uploadResult?.error?.message ||
        `Error del servidor de almacenamiento (${uploadResponse.status}).`;
      console.error('[cloudinaryService] Error en respuesta de Cloudinary API:', errorDetail);
      return { success: false, error: errorDetail };
    }

    return {
      success: true,
      secure_url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error de red inesperado al subir a Cloudinary.';
    console.error('[cloudinaryService] Error fatal en uploadToCloudinary:', message);
    return { success: false, error: message };
  }
}

/**
 * Elimina un recurso alojado en Cloudinary a partir de su public_id.
 *
 * @param publicId Identificador único del recurso en Cloudinary (ej: 'manaure-vive/premios/xyz')
 */
export async function deleteFromCloudinary(publicId: string): Promise<CloudinaryDeleteResult> {
  try {
    const cleanPublicId = publicId.trim();
    if (!cleanPublicId) {
      return { success: false, error: 'public_id no suministrado para eliminación.' };
    }

    let { data: sessionData } = await supabase.auth.getSession();
    let token = sessionData?.session?.access_token;

    if (!token) {
      const { data: refreshData } = await supabase.auth.refreshSession();
      token = refreshData?.session?.access_token;
    }

    if (!token) {
      return {
        success: false,
        error: 'Sesión no iniciada. Inicia sesión nuevamente para realizar esta acción.',
      };
    }

    const { data: signData, error: signError } = await supabase.functions.invoke<CloudinarySignDestroyResponse>(
      'cloudinary-sign',
      {
        body: {
          action: 'destroy',
          public_id: cleanPublicId,
        },
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (signError || !signData || !signData.signature) {
      let errorMsg = signData?.error;
      if (!errorMsg && signError && typeof signError === 'object' && 'context' in signError) {
        try {
          const resp = (signError as { context: Response }).context;
          if (resp && typeof resp.clone === 'function') {
            const errBody = await resp.clone().json();
            if (errBody?.error) {
              errorMsg = errBody.error;
            }
          }
        } catch {
          // Ignorar parseo
        }
      }
      if (!errorMsg) {
        errorMsg =
          signError?.message ||
          'No fue posible obtener la firma de eliminación para Cloudinary.';
      }
      return { success: false, error: errorMsg };
    }

    const { signature, timestamp, api_key, cloud_name, public_id: signedPublicId } = signData;

    const formData = new FormData();
    formData.append('public_id', signedPublicId);
    formData.append('api_key', api_key);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);

    const destroyUrl = `https://api.cloudinary.com/v1_1/${cloud_name}/image/destroy`;

    const destroyResponse = await fetch(destroyUrl, {
      method: 'POST',
      body: formData,
    });

    const destroyResult = await destroyResponse.json();

    if (!destroyResponse.ok || destroyResult.result !== 'ok') {
      const errorDetail =
        destroyResult?.error?.message ||
        destroyResult?.result ||
        'No fue posible eliminar el archivo de Cloudinary.';
      return { success: false, error: errorDetail };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado al eliminar de Cloudinary.';
    return { success: false, error: message };
  }
}

/**
 * Resuelve la carpeta destino en Cloudinary según el slug de categoría para la galería.
 * La categoría base 'otro' (Otra Experiencia) se guarda en la carpeta raíz 'manaure-vive/galeria'.
 * Las demás categorías se guardan en su subcarpeta respectiva 'manaure-vive/galeria/<categoria>'.
 */
export function resolveGalleryFolderForCategory(categorySlug?: string | null): string {
  const clean = categorySlug ? categorySlug.toLowerCase().trim() : 'otro';
  if (!clean || clean === 'otro' || clean === 'general') {
    return 'manaure-vive/galeria';
  }
  if (clean === 'hero') {
    return 'manaure-vive/galeria/hero';
  }
  if (clean === 'fogata' || clean === 'glamping') {
    return 'manaure-vive/galeria/glamping';
  }
  if (['cuatrimoto', 'parapente', 'serrania', 'hospedaje', 'gastronomia'].includes(clean)) {
    return `manaure-vive/galeria/${clean}`;
  }
  return `manaure-vive/galeria/${clean}`;
}

/**
 * Resuelve la carpeta destino en Cloudinary según el slug de categoría para las imágenes del Premio Mayor.
 * La categoría base 'otro' o sin especificar se guarda en la carpeta raíz 'manaure-vive/premios'.
 * Las demás categorías se guardan en su subcarpeta respectiva 'manaure-vive/premios/<categoria>'.
 */
export function resolvePrizeFolderForCategory(categorySlug?: string | null): string {
  const clean = categorySlug ? categorySlug.toLowerCase().trim() : '';
  if (!clean || clean === 'otro' || clean === 'general') {
    return 'manaure-vive/premios';
  }
  if (clean === 'fogata' || clean === 'glamping') {
    return 'manaure-vive/premios/glamping';
  }
  return `manaure-vive/premios/${clean}`;
}

/**
 * Solicita la creación de una carpeta en Cloudinary vía Edge Function.
 */
export async function createCloudinaryFolder(
  folderPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanFolder = folderPath.trim();
    if (!cleanFolder) return { success: false, error: 'Carpeta no especificada.' };

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      return { success: false, error: 'Sesión no iniciada.' };
    }

    const { data, error } = await supabase.functions.invoke('cloudinary-sign', {
      body: { action: 'create_folder', folder: cleanFolder },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (error || (data && !data.success)) {
      return { success: false, error: data?.error || error?.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error al crear carpeta.' };
  }
}

/**
 * Solicita la eliminación de una carpeta en Cloudinary vía Edge Function, protegiendo las carpetas oficiales.
 */
export async function deleteCloudinaryFolder(
  folderPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanFolder = folderPath.trim();
    if (!cleanFolder) return { success: false, error: 'Carpeta no especificada.' };

    const protectedFolders = [
      'manaure-vive/galeria',
      'manaure-vive/galeria/hero',
      'manaure-vive/galeria/cuatrimoto',
      'manaure-vive/galeria/parapente',
      'manaure-vive/galeria/serrania',
      'manaure-vive/galeria/hospedaje',
      'manaure-vive/galeria/gastronomia',
      'manaure-vive/galeria/glamping',
      'manaure-vive/galeria/fogata',
      'manaure-vive/premios',
      'manaure-vive/premios/cuatrimoto',
      'manaure-vive/premios/parapente',
      'manaure-vive/premios/serrania',
      'manaure-vive/premios/hospedaje',
      'manaure-vive/premios/gastronomia',
      'manaure-vive/premios/glamping',
      'manaure-vive/premios/fogata',
      'manaure-vive/aliados',
      'manaure-vive/actas-ganadores',
      'manaure-vive/marca',
    ];

    if (protectedFolders.includes(cleanFolder)) {
      return { success: false, error: 'La carpeta especificada está protegida y no puede eliminarse.' };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      return { success: false, error: 'Sesión no iniciada.' };
    }

    const { data, error } = await supabase.functions.invoke('cloudinary-sign', {
      body: { action: 'delete_folder', folder: cleanFolder },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (error || (data && !data.success)) {
      return { success: false, error: data?.error || error?.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error al eliminar carpeta.' };
  }
}

/**
 * Extrae el public_id de un recurso de Cloudinary a partir de su URL completa o identificador.
 * Soporta URLs versionadas, transformadas, con o sin extensión.
 *
 * @param urlOrPublicId URL o identificador del recurso
 * @returns public_id relativo (ej: 'manaure-vive/aliados/photours') o null si no es válido
 */
export function extractCloudinaryPublicId(urlOrPublicId: string | null | undefined): string | null {
  if (!urlOrPublicId || typeof urlOrPublicId !== 'string') return null;
  const trimmed = urlOrPublicId.trim();
  if (!trimmed) return null;

  // Si ya es un public_id directo (ej: 'manaure-vive/aliados/photours') sin protocolo http
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed.replace(/\.[a-zA-Z0-9]+$/, '');
  }

  // Si es una URL de Cloudinary
  if (!trimmed.includes('res.cloudinary.com') || !trimmed.includes('/upload/')) {
    return null;
  }

  try {
    const cleanUrl = trimmed.split('?')[0].split('#')[0];
    const uploadIndex = cleanUrl.indexOf('/upload/');
    if (uploadIndex === -1) return null;

    const pathAfterUpload = cleanUrl.slice(uploadIndex + '/upload/'.length);
    const segments = pathAfterUpload.split('/');
    const nonMetadataSegments: string[] = [];
    let pastMetadata = false;

    for (const segment of segments) {
      if (!pastMetadata) {
        // Ignorar firmas s--...--
        if (/^s--[a-zA-Z0-9_-]{8}--$/.test(segment)) continue;
        // Ignorar versión v123456789
        if (/^v\d+$/.test(segment)) {
          pastMetadata = true;
          continue;
        }
        // Ignorar transformaciones conocidas (ej: f_auto, w_200, c_fill, etc.)
        if (segment.includes(',') || /^[a-z]{1,3}_[a-zA-Z0-9]+/.test(segment)) continue;
      }
      nonMetadataSegments.push(segment);
    }

    if (nonMetadataSegments.length === 0) return null;
    const fullPathWithExt = nonMetadataSegments.join('/');
    const publicId = fullPathWithExt.replace(/\.[a-zA-Z0-9]+$/, '');
    return publicId || null;
  } catch {
    return null;
  }
}

export interface CloudinaryUrlOptions {
  width?: number;
  quality?: string | number;
}

export interface CloudinaryResponsiveOptions {
  width?: number;
  height?: number;
  crop?: string;
  format?: 'webp' | 'jpg' | 'auto';
  quality?: string | number;
}

/**
 * Valida si una URL de Cloudinary es elegible para transformación dinámica.
 * Protege URLs no Cloudinary, documentos PDF/raw y firmas HMAC criptográficas.
 */
function isTransformableCloudinaryUrl(url: string): boolean {
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) {
    return false;
  }
  const cleanPath = url.split('?')[0].toLowerCase();
  if (cleanPath.endsWith('.pdf') || url.includes('/raw/upload/')) {
    return false;
  }
  if (/\/s--[a-zA-Z0-9_-]{8}--\//.test(url)) {
    return false;
  }
  return true;
}

/**
 * Optimiza URLs de Cloudinary aplicando transformaciones automáticas (f_auto, q_auto y ancho opcional).
 *
 * Reglas de seguridad y preservación:
 * 1. Solo transforma URLs alojadas en Cloudinary (dominio 'res.cloudinary.com').
 * 2. Si la URL pertenece a Supabase Storage, rutas locales o URLs externas, se retorna idéntica sin alteración.
 * 3. Si la URL ya contiene transformaciones de formato/calidad ('f_auto'), no se duplican.
 * 4. No transforma URLs firmadas (con segmento 's--...--') para no invalidar la firma criptográfica.
 * 5. No transforma archivos no compatibles (como documentos PDF o raw) para garantizar visualización y descarga directa.
 *
 * @param url URL de la imagen o recurso
 * @param options Opciones de transformación (ej: width: 800)
 */
export function getOptimizedCloudinaryUrl(
  url: string | null | undefined,
  options: CloudinaryUrlOptions = {}
): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  if (!isTransformableCloudinaryUrl(trimmed)) {
    return trimmed;
  }

  // Si la URL ya posee transformaciones que incluyan f_auto o q_auto, no duplicar
  if (/\/upload\/[^/]*f_auto[^/]*\//.test(trimmed)) {
    return trimmed;
  }

  // Construir los parámetros de transformación solicitados
  const transforms: string[] = ['f_auto', 'q_auto'];

  if (options.width && options.width > 0) {
    transforms.push(`w_${Math.round(options.width)}`);
  }

  if (options.quality) {
    transforms.push(`q_${options.quality}`);
  }

  const transformString = transforms.join(',');

  // Insertar las transformaciones inmediatamente después de '/upload/'
  return trimmed.replace('/upload/', `/upload/${transformString}/`);
}

/**
 * Construye URLs de Cloudinary con transformaciones responsivas explícitas (ancho, alto/recorte, formato y calidad).
 *
 * Características:
 * 1. Si se define `height`, aplica `c_fill,g_auto` (o el recorte en `options.crop`) para encuadrar la relación de aspecto.
 * 2. Si no hay `height`, solo escala proporcionalmente por ancho (`w_`).
 * 3. Aplica siempre optimización perceptual `q_auto` (o la calidad especificada).
 * 4. Permite forzar el formato explícito ('webp' | 'jpg') en vez de 'f_auto', necesario para generar conjuntos `<source type="...">`.
 * 5. Reutiliza las protecciones de seguridad: preserva URLs no Cloudinary, URLs firmadas criptográficamente y archivos no transformables (PDFs/raw).
 * 6. Admite tanto URLs completas de Cloudinary como public IDs directos.
 *
 * @param url URL completa o public_id de Cloudinary
 * @param options Opciones de transformación responsiva
 */
export function getCloudinaryResponsiveUrl(
  url: string | null | undefined,
  options: CloudinaryResponsiveOptions = {}
): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  let trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  // Si se pasa un public_id directo en vez de una URL completa
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('/')) {
    const cloudName =
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CLOUDINARY_CLOUD_NAME) ||
      'ky01b0vz';
    trimmed = `https://res.cloudinary.com/${cloudName}/image/upload/${trimmed}`;
  }

  if (!isTransformableCloudinaryUrl(trimmed)) {
    return trimmed;
  }

  // Construir los parámetros de transformación solicitados
  const transforms: string[] = [];

  // Dimensiones y recorte
  if (options.height && options.height > 0) {
    if (options.crop) {
      transforms.push(options.crop.startsWith('c_') ? options.crop : `c_${options.crop}`);
    } else {
      transforms.push('c_fill', 'g_auto');
    }
    if (options.width && options.width > 0) {
      transforms.push(`w_${Math.round(options.width)}`);
    }
    transforms.push(`h_${Math.round(options.height)}`);
  } else {
    if (options.crop) {
      transforms.push(options.crop.startsWith('c_') ? options.crop : `c_${options.crop}`);
    }
    if (options.width && options.width > 0) {
      transforms.push(`w_${Math.round(options.width)}`);
    }
  }

  // Calidad
  if (options.quality) {
    transforms.push(`q_${options.quality}`);
  } else {
    transforms.push('q_auto');
  }

  // Formato explícito (webp | jpg | auto)
  const format = options.format || 'webp';
  transforms.push(`f_${format}`);

  const transformString = transforms.join(',');

  // Inyectar o reemplazar las transformaciones tras '/upload/'
  let result = trimmed;
  // Solo consideramos como transformación existente segmentos que tengan el patrón param_valor (ej: c_fill, w_800, q_auto)
  if (/\/upload\/(?:[a-z]{1,3}_[^/]+,?)+\//.test(result)) {
    result = result.replace(/\/upload\/(?:[a-z]{1,3}_[^/]+,?)+\//, `/upload/${transformString}/`);
  } else {
    result = result.replace('/upload/', `/upload/${transformString}/`);
  }

  // Actualizar o agregar la extensión en la ruta si el formato es explícito
  if (format === 'webp' || format === 'jpg') {
    const ext = format === 'jpg' ? '.jpg' : '.webp';
    if (/\.[a-zA-Z0-9]+$/.test(result)) {
      result = result.replace(/\.[a-zA-Z0-9]+$/, ext);
    } else {
      result = `${result}${ext}`;
    }
  }

  return result;
}

/**
 * Genera URLs responsivas optimizadas con transformaciones de Cloudinary para fondos del Hero:
 * - Desktop: 16:9 cinematográfico (w_1920,h_1080,c_fill,f_auto,q_auto)
 * - Tablet: 16:9 (w_1280,h_720,c_fill,f_auto,q_auto)
 * - Mobile: 4:5 vertical centrado (w_768,h_960,c_fill,g_auto,f_auto,q_auto)
 * - Thumbnail: 320x180 (16:9)
 */
export function getHeroSlideResponsiveUrls(url: string | null | undefined) {
  if (!url || typeof url !== 'string') {
    return { desktop: '', desktopJpg: '', tablet: '', mobile: '', mobileJpg: '', thumb: '', full: '' };
  }
  const clean = url.trim();
  return {
    desktop: getCloudinaryResponsiveUrl(clean, { width: 1920, height: 1080, crop: 'fill', format: 'webp' }),
    desktopJpg: getCloudinaryResponsiveUrl(clean, { width: 1920, height: 1080, crop: 'fill', format: 'jpg' }),
    tablet: getCloudinaryResponsiveUrl(clean, { width: 1280, height: 720, crop: 'fill', format: 'webp' }),
    mobile: getCloudinaryResponsiveUrl(clean, { width: 768, height: 960, crop: 'fill', format: 'webp' }),
    mobileJpg: getCloudinaryResponsiveUrl(clean, { width: 768, height: 960, crop: 'fill', format: 'jpg' }),
    thumb: getCloudinaryResponsiveUrl(clean, { width: 320, height: 180, crop: 'fill', format: 'webp' }),
    full: getOptimizedCloudinaryUrl(clean, { width: 1920 }),
  };
}
