import React, { useState } from 'react';
import {
  imageManifest,
  imageAliases,
  type ImageEntry,
} from '@/types/image-manifest';
import { getCloudinaryResponsiveUrl } from '@/services/cloudinaryService';
import styles from './ResponsiveImage.module.css';

export type ImageRole = 'hero-desktop' | 'hero-mobile' | 'tarjeta' | 'galeria-thumb' | 'lightbox';
export type ImageRatio = '16x9' | '4x5' | '3x2' | 'full';

interface RoleSpec {
  ratio: ImageRatio;
  widths: number[];
}

const ROLE_SPECS: Record<ImageRole, RoleSpec> = {
  'hero-desktop': { ratio: '16x9', widths: [640, 1024, 1600, 1920] },
  'hero-mobile': { ratio: '4x5', widths: [640, 768] },
  'tarjeta': { ratio: '4x5', widths: [480, 768] },
  'galeria-thumb': { ratio: '3x2', widths: [320, 480, 640] },
  'lightbox': { ratio: 'full', widths: [960, 1280, 1600] },
};

const RATIO_FACTORS: Record<ImageRatio, number | null> = {
  '16x9': 9 / 16,
  '4x5': 5 / 4,
  '3x2': 2 / 3,
  'full': null,
};

function calculateDimensions(
  width: number,
  ratio: ImageRatio | undefined,
  entry: ImageEntry
): { width: number; height?: number } {
  if (!ratio || ratio === 'full') {
    const aspect =
      entry.nativeHeight && entry.nativeWidth
        ? entry.nativeHeight / entry.nativeWidth
        : (entry.cloudinary?.height && entry.cloudinary?.width ? entry.cloudinary.height / entry.cloudinary.width : 0.75);
    const height = Math.round(width * aspect);
    return { width, height };
  }

  const factor = RATIO_FACTORS[ratio];
  if (factor) {
    return { width, height: Math.round(width * factor) };
  }

  return { width };
}

function resolveRoleDimensions(
  entry: ImageEntry,
  targetRatio?: ImageRatio,
  targetRole?: ImageRole
): Array<{ width: number; height?: number }> {
  const spec = targetRole ? ROLE_SPECS[targetRole] : undefined;
  const effectiveRatio = targetRatio || spec?.ratio || 'full';
  const widths =
    spec?.widths ||
    (effectiveRatio === '16x9'
      ? [640, 1024, 1600, 1920]
      : effectiveRatio === '4x5'
      ? [480, 640, 768]
      : effectiveRatio === '3x2'
      ? [320, 480, 640]
      : [640, 1024, 1600]);

  return widths.map((w) => calculateDimensions(w, effectiveRatio, entry));
}

function buildSrcSet(
  secureUrl: string,
  dimensions: Array<{ width: number; height?: number }>,
  format: 'webp' | 'jpg'
): string {
  return dimensions
    .map((dim) => {
      const url = getCloudinaryResponsiveUrl(secureUrl, {
        width: dim.width,
        height: dim.height,
        format,
      });
      return `${url} ${dim.width}w`;
    })
    .join(', ');
}

export interface ArtDirectionConfig {
  media: string;
  ratio?: ImageRatio;
  role?: ImageRole;
  variantRole?: ImageRole;
  sizes?: string;
}

export interface ResponsiveImageProps {
  /** ID de la imagen en imageManifest o alias registrado */
  id: string;
  /**
   * Atributo sizes estricto derivado del CSS real del slot (ej: '(max-width: 768px) 100vw, 380px').
   * Prohibido dejar '100vw' por defecto.
   */
  sizes: string;
  /** Variante de recorte por aspect ratio */
  ratio?: ImageRatio;
  /** Rol específico del slot en el manifiesto */
  variantRole?: ImageRole;
  /** @deprecated Usar variantRole para evitar advertencias de jsx-a11y aria-role */
  role?: ImageRole;
  /** Dirección de arte responsiva opcional con media queries específicas (ej. Hero móvil 4:5 vs desktop 16:9) */
  artDirection?: ArtDirectionConfig[];
  /** Si es true, la imagen es crítica para LCP: loading="eager", fetchPriority="high" */
  priority?: boolean;
  /** Texto alternativo accesible. Por defecto utiliza el alt descriptivo del manifiesto */
  alt?: string;
  /** Clases CSS para el contenedor <picture> */
  className?: string;
  /** Clases CSS directas para la etiqueta <img> */
  imgClassName?: string;
  /** Clases para el contenedor envolvente de LQIP */
  containerClassName?: string;
  /** Estilos inline para el contenedor */
  style?: React.CSSProperties;
  /** Estilos inline para la etiqueta <img> */
  imgStyle?: React.CSSProperties;
  /** Posición del objeto CSS (por defecto deriva del punto focal del manifiesto) */
  objectPosition?: string;
  /** Si se deshabilita el placeholder LQIP (por ejemplo en el Hero si ya tiene skeleton externo) */
  disableLqip?: boolean;
  /** Ancho explícito para casos como modal lightbox */
  width?: number;
  /** Alto explícito para casos como modal lightbox */
  height?: number;
  /** Callback al cargar la imagen */
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

export const ResponsiveImage: React.FC<ResponsiveImageProps> = ({
  id,
  sizes,
  ratio,
  variantRole,
  role,
  artDirection,
  priority = false,
  alt,
  className = '',
  imgClassName = '',
  containerClassName = '',
  style,
  imgStyle,
  objectPosition,
  disableLqip = false,
  width: customWidth,
  height: customHeight,
  onLoad,
}) => {
  const [isLoaded, setIsLoaded] = useState(priority);

  // 1. Resolver alias canónico
  const canonicalId = imageAliases[id] || id;
  const entry: ImageEntry | undefined = imageManifest[canonicalId];

  if (!entry) {
    console.warn(`[ResponsiveImage] Imagen no encontrada en imageManifest: "${id}"`);
    return null;
  }

  const effectiveRole = variantRole || role;
  const focalX = entry.focalPoint ? (entry.focalPoint.x > 1 ? entry.focalPoint.x : entry.focalPoint.x * 100) : 50;
  const focalY = entry.focalPoint ? (entry.focalPoint.y > 1 ? entry.focalPoint.y : entry.focalPoint.y * 100) : 50;
  const effectiveFocal = objectPosition || `${focalX}% ${focalY}%`;

  const mainDimensions = resolveRoleDimensions(entry, ratio, effectiveRole);
  const primaryDim = mainDimensions[Math.floor(mainDimensions.length / 2)] || mainDimensions[0];

  const effectiveWidth = customWidth || primaryDim?.width || entry.cloudinary?.width || entry.nativeWidth;
  const effectiveHeight = customHeight || primaryDim?.height || entry.cloudinary?.height || entry.nativeHeight;
  const effectiveAlt = alt !== undefined ? alt : entry.alt;

  const fallbackSrc = getCloudinaryResponsiveUrl(entry.cloudinary?.secureUrl || '', {
    width: effectiveWidth,
    height: effectiveHeight,
    format: 'jpg',
  });

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setIsLoaded(true);
    if (onLoad) {
      onLoad(e);
    }
  };

  const wrapperStyle: React.CSSProperties = {
    ...style,
    ['--img-dominant-color' as string]: entry.dominantColor,
    ['--img-lqip-bg' as string]: `url(${entry.lqip})`,
    ['--img-focal-pos' as string]: effectiveFocal,
  };

  return (
    <div
      className={`${styles.pictureWrapper} ${containerClassName}`}
      style={wrapperStyle}
    >
      {/* Marcador de Carga LQIP difuminado sin salto de diseño (CLS = 0) */}
      {!disableLqip && (
        <div
          className={`${styles.lqipPlaceholder} ${isLoaded ? styles.lqipHidden : ''} ${priority ? styles.noTransition : ''}`}
          aria-hidden="true"
        />
      )}

      <picture className={className}>
        {/* Fuentes para dirección de arte responsiva opcional */}
        {artDirection?.map((art, index) => {
          const artRole = art.variantRole || art.role;
          const artDims = resolveRoleDimensions(entry, art.ratio, artRole);
          if (artDims.length === 0) return null;
          return (
            <React.Fragment key={index}>
              <source
                media={art.media}
                type="image/webp"
                srcSet={buildSrcSet(entry.cloudinary?.secureUrl || '', artDims, 'webp')}
                sizes={art.sizes || sizes}
              />
              <source
                media={art.media}
                type="image/jpeg"
                srcSet={buildSrcSet(entry.cloudinary?.secureUrl || '', artDims, 'jpg')}
                sizes={art.sizes || sizes}
              />
            </React.Fragment>
          );
        })}

        {/* Fuentes principales WebP y JPG */}
        <source
          type="image/webp"
          srcSet={buildSrcSet(entry.cloudinary?.secureUrl || '', mainDimensions, 'webp')}
          sizes={sizes}
        />
        <source
          type="image/jpeg"
          srcSet={buildSrcSet(entry.cloudinary?.secureUrl || '', mainDimensions, 'jpg')}
          sizes={sizes}
        />

        {/* Etiqueta <img> de respaldo con dimensiones intrínsecas reales */}
        <img
          src={fallbackSrc}
          alt={effectiveAlt}
          width={effectiveWidth}
          height={effectiveHeight}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : undefined}
          onLoad={handleImageLoad}
          className={`${styles.imgBase} ${isLoaded ? styles.imgLoaded : ''} ${priority ? styles.noTransition : ''} ${imgClassName}`}
          style={imgStyle}
        />
      </picture>
    </div>
  );
};
