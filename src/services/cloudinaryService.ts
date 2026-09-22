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

  // 1. Verificar si es una URL de Cloudinary
  if (!trimmed.includes('res.cloudinary.com') || !trimmed.includes('/upload/')) {
    return trimmed;
  }

  // 2. Proteger archivos no compatibles (ej. PDFs o recursos raw)
  const cleanPath = trimmed.split('?')[0].toLowerCase();
  if (cleanPath.endsWith('.pdf') || trimmed.includes('/raw/upload/')) {
    return trimmed;
  }

  // 3. Proteger URLs firmadas para no romper la firma HMAC de Cloudinary (ej: /s--abcdef12--/)
  if (/\/s--[a-zA-Z0-9_-]{8}--\//.test(trimmed)) {
    return trimmed;
  }

  // 4. Si la URL ya posee transformaciones que incluyan f_auto o q_auto, no duplicar
  if (/\/upload\/[^/]*f_auto[^/]*\//.test(trimmed)) {
    return trimmed;
  }

  // 5. Construir los parámetros de transformación solicitados
  const transforms: string[] = ['f_auto', 'q_auto'];

  if (options.width && options.width > 0) {
    transforms.push(`w_${Math.round(options.width)}`);
  }

  if (options.quality) {
    transforms.push(`q_${options.quality}`);
  }

  const transformString = transforms.join(',');

  // 6. Insertar las transformaciones inmediatamente después de '/upload/'
  return trimmed.replace('/upload/', `/upload/${transformString}/`);
}


