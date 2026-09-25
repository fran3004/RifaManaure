import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Image, X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { SectionHeader } from '@/components/public/ui';
import { ResponsiveImage } from '@/components/common/ResponsiveImage';
import { imageManifest, type ImageEntry } from '@/types/image-manifest';
import { resolveExperienceImage } from '@/assets/assets';
import {
  getCachedGalleryItems,
  getPublicGalleryItems,
  getCachedGalleryCategories,
  getGalleryCategories,
} from '@/services/galleryService';
import { getCloudinaryResponsiveUrl, getOptimizedCloudinaryUrl } from '@/services/cloudinaryService';
import type { GalleryItemRow, GalleryCategoryItem } from '@/types/raffle.types';
import styles from './GaleriaPremio.module.css';

type CategoriaFiltro = string;

export const GaleriaPremio: React.FC = () => {
  const [items, setItems] = useState<GalleryItemRow[]>(getCachedGalleryItems);
  const [categories, setCategories] = useState<GalleryCategoryItem[]>(getCachedGalleryCategories);
  const [filtroActivo, setFiltroActivo] = useState<CategoriaFiltro>('todas');
  const [fotoSeleccionadaIndex, setFotoSeleccionadaIndex] = useState<number | null>(null);

  const triggerRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Sincronización en segundo plano con Supabase sin FOUC
  useEffect(() => {
    let isMounted = true;
    getPublicGalleryItems().then((dbData) => {
      if (isMounted && dbData && dbData.length > 0) {
        setItems(dbData);
      }
    });
    getGalleryCategories().then((dbCats) => {
      if (isMounted && dbCats && dbCats.length > 0) {
        setCategories(dbCats);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const fotosFiltradas =
    filtroActivo === 'todas'
      ? items
      : items.filter((f) => f.category.toLowerCase() === filtroActivo.toLowerCase());

  const handleOpenLightbox = (index: number, element?: HTMLElement) => {
    if (element) {
      triggerRef.current = element;
    }
    setFotoSeleccionadaIndex(index);
  };

  const handleCloseLightbox = useCallback(() => {
    setFotoSeleccionadaIndex(null);
    setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  }, []);

  const handlePrev = useCallback(() => {
    if (fotoSeleccionadaIndex === null) return;
    setFotoSeleccionadaIndex((prev) => (prev === 0 ? fotosFiltradas.length - 1 : (prev ?? 0) - 1));
  }, [fotoSeleccionadaIndex, fotosFiltradas.length]);

  const handleNext = useCallback(() => {
    if (fotoSeleccionadaIndex === null) return;
    setFotoSeleccionadaIndex((prev) => (prev === fotosFiltradas.length - 1 ? 0 : (prev ?? 0) + 1));
  }, [fotoSeleccionadaIndex, fotosFiltradas.length]);

  // Bloqueo del scroll en el body mientras el lightbox esté abierto
  useEffect(() => {
    if (fotoSeleccionadaIndex !== null) {
      const originalOverflow = document.body.style.overflow;
      const originalOverscrollBehavior = document.body.style.overscrollBehavior;
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.overscrollBehavior = originalOverscrollBehavior;
      };
    }
  }, [fotoSeleccionadaIndex]);

  // Foco inicial, Focus Trap y soporte de teclado (Esc, Flechas, Tab)
  useEffect(() => {
    if (fotoSeleccionadaIndex !== null) {
      closeBtnRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleCloseLightbox();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePrev();
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleNext();
          return;
        }

        if (e.key === 'Tab' && dialogRef.current) {
          const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (focusableElements.length === 0) return;

          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [fotoSeleccionadaIndex, handleCloseLightbox, handlePrev, handleNext]);

  // Precarga de la imagen anterior y siguiente en resolución lightbox
  useEffect(() => {
    if (fotoSeleccionadaIndex === null || fotosFiltradas.length <= 1) return;

    const prevIndex =
      fotoSeleccionadaIndex === 0 ? fotosFiltradas.length - 1 : fotoSeleccionadaIndex - 1;
    const nextIndex =
      fotoSeleccionadaIndex === fotosFiltradas.length - 1 ? 0 : fotoSeleccionadaIndex + 1;

    const preload = (item?: GalleryItemRow) => {
      if (!item) return;
      if (item.image_url) {
        const img = new window.Image();
        img.src = getOptimizedCloudinaryUrl(item.image_url, { width: 1600 });
        return;
      }
      const slug = item.image_slug || item.id;
      const entry: ImageEntry | undefined = imageManifest[slug];
      if (!entry || !entry.cloudinary) return;
      const urlWebp = getCloudinaryResponsiveUrl(entry.cloudinary.secureUrl, { width: 1600, format: 'webp' });
      const urlJpg = getCloudinaryResponsiveUrl(entry.cloudinary.secureUrl, { width: 1600, format: 'jpg' });
      if (urlWebp) {
        const imgWebp = new window.Image();
        imgWebp.src = urlWebp;
      }
      if (urlJpg) {
        const imgJpg = new window.Image();
        imgJpg.src = urlJpg;
      }
    };

    preload(fotosFiltradas[prevIndex]);
    preload(fotosFiltradas[nextIndex]);
  }, [fotoSeleccionadaIndex, fotosFiltradas]);

  // Soporte táctil para deslizar con detección direccional estricta (umbral 45px)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const diffX = e.changedTouches[0].clientX - touchStartX.current;
    const diffY = e.changedTouches[0].clientY - touchStartY.current;

    // Solo se interpreta como swipe horizontal si supera el umbral y domina al desplazamiento vertical
    const isHorizontalSwipe = Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY) * 1.4;

    if (isHorizontalSwipe) {
      if (diffX > 0) {
        handlePrev();
      } else {
        handleNext();
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const fotoActualItem =
    fotoSeleccionadaIndex !== null ? fotosFiltradas[fotoSeleccionadaIndex] : undefined;
  const fotoActualSlug = fotoActualItem ? fotoActualItem.image_slug || fotoActualItem.id : undefined;
  const fotoActualEntry: ImageEntry | undefined = fotoActualSlug
    ? imageManifest[fotoActualSlug]
    : undefined;

  return (
    <section id="galeria" className={styles.galeriaSection} aria-labelledby="titulo-galeria">
      <div className="container">
        {/* Cabecera */}
        <SectionHeader
          id="titulo-galeria"
          badge="Fotografías Reales del Destino"
          icon={<Image size={16} aria-hidden="true" />}
          title={
            <>
              Explora los paisajes que <span className="highlight-text">podrías vivir</span>
            </>
          }
          subtitle="Fotos auténticas de las rutas, el hospedaje campestre y las actividades inolvidables en Manaure y la Serranía del Perijá."
        >
          {/* Filtros por Categoría como Chips */}
          <div
            className={styles.filterTabs}
            role="toolbar"
            aria-label="Filtrar fotografías por categoría"
          >
            <button
              type="button"
              className={`${styles.filterChip} ${filtroActivo === 'todas' ? styles.filterChipActive : ''}`}
              onClick={() => setFiltroActivo('todas')}
              aria-pressed={filtroActivo === 'todas'}
            >
              Todas ({items.length})
            </button>
            {categories.map((cat) => {
              const count = items.filter(
                (f) => f.category.toLowerCase() === cat.slug.toLowerCase()
              ).length;
              if (count === 0) return null;
              return (
                <button
                  key={cat.slug}
                  type="button"
                  className={`${styles.filterChip} ${
                    filtroActivo === cat.slug ? styles.filterChipActive : ''
                  }`}
                  onClick={() => setFiltroActivo(cat.slug)}
                  aria-pressed={filtroActivo === cat.slug}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>

          {/* Región aria-live para anunciar el conteo tras filtrar */}
          <div className="visually-hidden" aria-live="polite" aria-atomic="true">
            Mostrando {fotosFiltradas.length} {fotosFiltradas.length === 1 ? 'foto' : 'fotos'}
          </div>
        </SectionHeader>

        {/* Grilla de Galería */}
        <div className={styles.galleryGrid}>
          {fotosFiltradas.map((item, index) => {
            const slug = item.image_slug || item.id;
            const entry = imageManifest[slug];
            const altText = item.alt_text || entry?.alt || item.title || 'Fotografía de la experiencia en Manaure';
            const captionText = item.title || entry?.caption || altText;

            return (
              <button
                key={item.id}
                type="button"
                className={styles.galleryItem}
                onClick={(e) => handleOpenLightbox(index, e.currentTarget)}
                aria-label={`Ver fotografía ampliada: ${altText}`}
              >
                {item.image_url ? (
                  <img
                    src={getOptimizedCloudinaryUrl(item.image_url, { width: 800 })}
                    alt={altText}
                    className={styles.galleryImage}
                    loading="lazy"
                    decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : entry ? (
                  <ResponsiveImage
                    id={slug}
                    ratio="3x2"
                    role="galeria-thumb"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    imgClassName={styles.galleryImage}
                    alt={altText}
                  />
                ) : (
                  <img
                    src={resolveExperienceImage(slug)}
                    alt={altText}
                    className={styles.galleryImage}
                    loading="lazy"
                    decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                <div className={styles.itemOverlay} aria-hidden="true">
                  <Maximize2 size={24} className={styles.zoomIcon} />
                  <span className={styles.itemCaption}>{captionText}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Visor Lightbox Modal Accesible */}
      {fotoActualItem && (
        <div
          ref={dialogRef}
          className={styles.lightboxBackdrop}
          onClick={handleCloseLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Galería de imágenes"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Botón de Cierre Fijo en Viewport con Safe Areas */}
          <button
            ref={closeBtnRef}
            type="button"
            className={styles.closeBtn}
            onClick={(e) => {
              e.stopPropagation();
              handleCloseLightbox();
            }}
            aria-label="Cerrar galería de imágenes"
          >
            <X size={24} aria-hidden="true" />
          </button>

          {/* Flecha Anterior Accesible */}
          <button
            type="button"
            className={`${styles.navArrow} ${styles.prevArrow}`}
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            aria-label="Ver fotografía anterior"
          >
            <ChevronLeft size={28} aria-hidden="true" />
          </button>

          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.lightboxImageWrapper}>
              {fotoActualItem.image_url ? (
                <div className={styles.lightboxPicture}>
                  <img
                    src={getOptimizedCloudinaryUrl(fotoActualItem.image_url, { width: 1600 })}
                    alt={fotoActualItem.alt_text || fotoActualItem.title}
                    className={styles.lightboxImg}
                  />
                </div>
              ) : fotoActualEntry ? (
                <ResponsiveImage
                  id={fotoActualSlug!}
                  role="lightbox"
                  sizes="(max-width: 1200px) 90vw, 1600px"
                  containerClassName={styles.lightboxPicture}
                  imgClassName={styles.lightboxImg}
                  alt={fotoActualItem.alt_text || fotoActualEntry.alt}
                />
              ) : (
                <div className={styles.lightboxPicture}>
                  <img
                    src={resolveExperienceImage(fotoActualSlug)}
                    alt={fotoActualItem.alt_text || fotoActualItem.title}
                    className={styles.lightboxImg}
                  />
                </div>
              )}

              {/* Leyenda y Contador */}
              <div className={styles.lightboxCaption}>
                <p className={styles.lightboxAlt}>
                  {fotoActualItem.alt_text || fotoActualEntry?.caption || fotoActualItem.title}
                </p>
                <span className={styles.lightboxCounter}>
                  {fotoSeleccionadaIndex! + 1} / {fotosFiltradas.length}
                </span>
              </div>

              {/* Indicador de Páginas / Dots interactivo */}
              {fotosFiltradas.length > 1 && (
                <div
                  className={styles.paginationDots}
                  role="tablist"
                  aria-label="Selector de fotografías"
                >
                  {fotosFiltradas.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={idx === fotoSeleccionadaIndex}
                      aria-label={`Ver fotografía ${idx + 1} de ${fotosFiltradas.length}`}
                      className={`${styles.paginationDot} ${
                        idx === fotoSeleccionadaIndex ? styles.paginationDotActive : ''
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFotoSeleccionadaIndex(idx);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Flecha Siguiente Accesible */}
          <button
            type="button"
            className={`${styles.navArrow} ${styles.nextArrow}`}
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            aria-label="Ver fotografía siguiente"
          >
            <ChevronRight size={28} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
};

