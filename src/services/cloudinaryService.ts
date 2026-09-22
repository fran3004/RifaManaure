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
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    // 2. Invocar la Edge Function 'cloudinary-sign' para obtener la firma HMAC-SHA1
    const { data: signData, error: signError } = await supabase.functions.invoke<CloudinarySignUploadResponse>(
      'cloudinary-sign',
      {
        body: {
          action: 'upload',
          folder: cleanFolder,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }
    );

    if (signError || !signData || !signData.signature) {
      const errorMsg =
        signData?.error ||
        signError?.message ||
        'No fue posible obtener la firma de autorización para Cloudinary.';
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

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    const { data: signData, error: signError } = await supabase.functions.invoke<CloudinarySignDestroyResponse>(
      'cloudinary-sign',
      {
        body: {
          action: 'destroy',
          public_id: cleanPublicId,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }
    );

    if (signError || !signData || !signData.signature) {
      const errorMsg =
        signData?.error ||
        signError?.message ||
        'No fue posible obtener la firma de eliminación para Cloudinary.';
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
