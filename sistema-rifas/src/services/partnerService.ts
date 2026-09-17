import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database.types';
import type { PartnerRow } from '@/types/raffle.types';

export type PartnerInsert = Database['public']['Tables']['partners']['Insert'];
export type PartnerUpdate = Database['public']['Tables']['partners']['Update'];

export interface PartnerMutationResult {
  success: boolean;
  data?: PartnerRow;
  error?: string;
}

export interface UploadLogoResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Genera un slug seguro a partir del nombre si no se provee uno.
 */
export function generatePartnerSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

/**
 * Obtiene la lista de aliados activos para el componente público FilaAliados.
 * Ordenados por display_order y nombre.
 */
export async function getActivePartners(): Promise<PartnerRow[]> {
  try {
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.warn('[partnerService] Advertencia al consultar aliados activos:', error.message);
      return [];
    }

    return (data || []) as PartnerRow[];
  } catch (err) {
    console.error('[partnerService] Error de red al cargar aliados:', err);
    return [];
  }
}

/**
 * Obtiene todos los aliados (activos e inactivos) para la vista administrativa.
 */
export async function getAllPartnersAdmin(): Promise<PartnerRow[]> {
  try {
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[partnerService] Error al consultar aliados para admin:', error.message);
      return [];
    }

    return (data || []) as PartnerRow[];
  } catch (err) {
    console.error('[partnerService] Error al cargar lista administrativa de aliados:', err);
    return [];
  }
}

/**
 * Crea un nuevo aliado en la base de datos.
 */
export async function createPartner(
  partner: PartnerInsert
): Promise<PartnerMutationResult> {
  try {
    const cleanName = partner.name.trim();
    const cleanSlug = (partner.slug && partner.slug.trim()) || generatePartnerSlug(cleanName);

    const { data, error } = await supabase
      .from('partners')
      .insert({
        name: cleanName,
        slug: cleanSlug,
        category: partner.category.trim(),
        description: partner.description ? partner.description.trim() : null,
        logo_url: partner.logo_url ? partner.logo_url.trim() : null,
        website_url: partner.website_url ? partner.website_url.trim() : null,
        instagram_url: partner.instagram_url ? partner.instagram_url.trim() : null,
        display_order: partner.display_order ?? 0,
        is_active: partner.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as PartnerRow };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al crear el aliado.',
    };
  }
}

/**
 * Actualiza los datos de un aliado existente.
 */
export async function updatePartner(
  id: string,
  updates: PartnerUpdate
): Promise<PartnerMutationResult> {
  try {
    const { data, error } = await supabase
      .from('partners')
      .update({
        ...updates,
        name: updates.name ? updates.name.trim() : undefined,
        slug: updates.slug ? updates.slug.trim() : undefined,
        category: updates.category ? updates.category.trim() : undefined,
        description: updates.description !== undefined ? (updates.description?.trim() || null) : undefined,
        logo_url: updates.logo_url !== undefined ? (updates.logo_url?.trim() || null) : undefined,
        website_url: updates.website_url !== undefined ? (updates.website_url?.trim() || null) : undefined,
        instagram_url: updates.instagram_url !== undefined ? (updates.instagram_url?.trim() || null) : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as PartnerRow };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al actualizar el aliado.',
    };
  }
}

/**
 * Activa o desactiva la visibilidad pública de un aliado.
 */
export async function togglePartnerActive(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('partners')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al cambiar estado del aliado.',
    };
  }
}

/**
 * Elimina un aliado de la base de datos.
 */
export async function deletePartner(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('partners').delete().eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al eliminar el aliado.',
    };
  }
}

/**
 * Sube una imagen de logotipo al bucket 'partner-logos' en Supabase Storage.
 * Retorna la URL pública permanente para almacenarla en la base de datos.
 */
export async function uploadPartnerLogo(
  file: File,
  slug: string
): Promise<UploadLogoResult> {
  try {
    // Validar tipo de archivo
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Formato inválido. Solo se admiten imágenes PNG, WebP, JPG o SVG.',
      };
    }

    // Validar tamaño máximo (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      return {
        success: false,
        error: 'El archivo supera el tamaño máximo permitido de 5 MB.',
      };
    }

    const fileExt = file.name.split('.').pop() || 'webp';
    const cleanSlug = slug.trim() || 'aliado';
    const fileName = `${cleanSlug}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('partner-logos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('[partnerService] Error en Storage al subir logo:', uploadError);
      return {
        success: false,
        error: uploadError.message || 'No fue posible subir el archivo a Supabase Storage.',
      };
    }

    const { data: publicData } = supabase.storage
      .from('partner-logos')
      .getPublicUrl(filePath);

    return {
      success: true,
      url: publicData.publicUrl,
    };
  } catch (err) {
    console.error('[partnerService] Error inesperado al subir logo:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al cargar la imagen.',
    };
  }
}

