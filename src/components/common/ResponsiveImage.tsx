import React, { useState } from 'react';
import {
  imageManifest,
  imageAliases,
  type ImageEntry,
  type ImageVariant,
} from '@/types/image-manifest';
import styles from './ResponsiveImage.module.css';

export interface ArtDirectionConfig {
  media: string;
  ratio?: ImageVariant['ratio'];
  role?: ImageVariant['role'];
  variantRole?: ImageVariant['role'];
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
  ratio?: ImageVariant['ratio'];
  /** Rol específico del slot en el manifiesto */
  variantRole?: ImageVariant['role'];
  /** @deprecated Usar variantRole para evitar advertencias de jsx-a11y aria-role */
  role?: ImageVariant['role'];
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
  const effectiveFocal = objectPosition || `${entry.focalPoint.x}% ${entry.focalPoint.y}%`;

  // Filtrar variantes relevantes por aspect ratio y/o rol
  const filterVariants = (rat?: ImageVariant['ratio'], ro?: ImageVariant['role']) => {
    let list = entry.variants;
    if (rat) {
      list = list.filter((v) => v.ratio === rat);
    }
    if (ro) {
      list = list.filter((v) => v.role === ro);
    }
    // Si no hay coincidencias estrictas, caer a las variantes disponibles
    if (list.length === 0) {
      list = entry.variants;
    }
    return [...list].sort((a, b) => a.width - b.width);
  };

  const mainVariants = filterVariants(ratio, effectiveRole);
  // Variante representativa para dimensiones y fallback img
  const fallbackVariant = mainVariants[Math.floor(mainVariants.length / 2)] || mainVariants[0];

  const effectiveWidth = customWidth || fallbackVariant?.width || entry.nativeWidth;
  const effectiveHeight = customHeight || fallbackVariant?.height || entry.nativeHeight;
  const effectiveAlt = alt !== undefined ? alt : entry.alt;

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setIsLoaded(true);
    if (onLoad) {
      onLoad(e);
    }
  };

  // Construir srcsets para una lista de variantes
  const buildSrcSet = (variants: ImageVariant[], format: 'webp' | 'jpg') => {
    return variants
      .map((v) => `${v[format].url} ${v.width}w`)
      .join(', ');
  };

  return (
    <div
      className={`${styles.pictureWrapper} ${containerClassName}`}
      style={{
        ...style,
        backgroundColor: entry.dominantColor,
      }}
    >
      {/* Marcador de Carga LQIP difuminado sin salto de diseño (CLS = 0) */}
      {!disableLqip && (
        <div
          className={`${styles.lqipPlaceholder} ${isLoaded ? styles.lqipHidden : ''} ${priority ? styles.noTransition : ''}`}
          style={{
            backgroundImage: `url(${entry.lqip})`,
            backgroundColor: entry.dominantColor,
            backgroundPosition: effectiveFocal,
          }}
          aria-hidden="true"
        />
      )}

      <picture className={className}>
        {/* Fuentes para dirección de arte responsiva opcional */}
        {artDirection?.map((art, index) => {
          const artRole = art.variantRole || art.role;
          const artVariants = filterVariants(art.ratio, artRole);
          if (artVariants.length === 0) return null;
          return (
            <React.Fragment key={index}>
              <source
                media={art.media}
                type="image/webp"
                srcSet={buildSrcSet(artVariants, 'webp')}
                sizes={art.sizes || sizes}
              />
              <source
                media={art.media}
                type="image/jpeg"
                srcSet={buildSrcSet(artVariants, 'jpg')}
                sizes={art.sizes || sizes}
              />
            </React.Fragment>
          );
        })}

        {/* Fuentes principales WebP y JPG */}
        <source
          type="image/webp"
          srcSet={buildSrcSet(mainVariants, 'webp')}
          sizes={sizes}
        />
        <source
          type="image/jpeg"
          srcSet={buildSrcSet(mainVariants, 'jpg')}
          sizes={sizes}
        />

        {/* Etiqueta <img> de respaldo con dimensiones intrínsecas reales */}
        <img
          src={fallbackVariant?.jpg.url || fallbackVariant?.webp.url}
          alt={effectiveAlt}
          width={effectiveWidth}
          height={effectiveHeight}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : undefined}
          onLoad={handleImageLoad}
          className={`${styles.imgBase} ${isLoaded ? styles.imgLoaded : ''} ${priority ? styles.noTransition : ''} ${imgClassName}`}
          style={{
            objectPosition: effectiveFocal,
            ...imgStyle,
          }}
        />
      </picture>
    </div>
  );
};
