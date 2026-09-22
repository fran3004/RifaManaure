import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Image, X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { SectionHeader } from '@/components/public/ui';
import { ResponsiveImage } from '@/components/common/ResponsiveImage';
import { imageManifest, type ImageEntry } from '@/types/image-manifest';
import { resolveExperienceImage } from '@/assets/assets';
import { getCachedGalleryItems, getPublicGalleryItems } from '@/services/galleryService';
import type { GalleryItemRow } from '@/types/raffle.types';
import styles from './GaleriaPremio.module.css';

type CategoriaFiltro =
  | 'todas'
  | 'cuatrimoto'
  | 'parapente'
  | 'serrania'
  | 'hospedaje'
  | 'gastronomia'
  | 'fogata';

export const GaleriaPremio: React.FC = () => {
  const [items, setItems] = useState<GalleryItemRow[]>(getCachedGalleryItems);
  const [filtroActivo, setFiltroActivo] = useState<CategoriaFiltro>('todas');
  const [fotoSeleccionadaIndex, setFotoSeleccionadaIndex] = useState<number | null>(null);

  const triggerRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  // Sincronización en segundo plano con Supabase sin FOUC
  useEffect(() => {
    let isMounted = true;
    getPublicGalleryItems().then((dbData) => {
      if (isMounted && dbData && dbData.length > 0) {
        setItems(dbData);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const fotosFiltradas =
    filtroActivo === 'todas'
      ? items
      : items.filter((f) => f.category === filtroActivo);

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
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
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
        img.src = item.image_url;
        return;
      }
      const slug = item.image_slug || item.id;
      const entry: ImageEntry | undefined = imageManifest[slug];
      if (!entry) return;
      const v = entry.variants.find((x) => x.role === 'lightbox') || entry.variants[0];
      if (v?.webp?.url) {
        const imgWebp = new window.Image();
        imgWebp.src = v.webp.url;
      }
      if (v?.jpg?.url) {
        const imgJpg = new window.Image();
        imgJpg.src = v.jpg.url;
      }
    };

    preload(fotosFiltradas[prevIndex]);
    preload(fotosFiltradas[nextIndex]);
  }, [fotoSeleccionadaIndex, fotosFiltradas]);

  // Soporte táctil para deslizar (umbral 50 px)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diffX = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diffX) > 50) {
      if (diffX > 0) {
        handlePrev();
      } else {
        handleNext();
      }
    }
    touchStartX.current = null;
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
          subtitle="Fotos auténticas de las rutas, el glamping y las actividades extremas en Manaure y la Serranía del Perijá."
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
            <button
              type="button"
              className={`${styles.filterChip} ${filtroActivo === 'cuatrimoto' ? styles.filterChipActive : ''}`}
              onClick={() => setFiltroActivo('cuatrimoto')}
              aria-pressed={filtroActivo === 'cuatrimoto'}
            >
              Cuatrimotos
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${filtroActivo === 'parapente' ? styles.filterChipActive : ''}`}
              onClick={() => setFiltroActivo('parapente')}
              aria-pressed={filtroActivo === 'parapente'}
            >
              Parapente
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${filtroActivo === 'serrania' ? styles.filterChipActive : ''}`}
              onClick={() => setFiltroActivo('serrania')}
              aria-pressed={filtroActivo === 'serrania'}
            >
              Serranía
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${filtroActivo === 'hospedaje' ? styles.filterChipActive : ''}`}
              onClick={() => setFiltroActivo('hospedaje')}
              aria-pressed={filtroActivo === 'hospedaje'}
            >
              Hospedaje & Glamping
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${filtroActivo === 'gastronomia' ? styles.filterChipActive : ''}`}
              onClick={() => setFiltroActivo('gastronomia')}
              aria-pressed={filtroActivo === 'gastronomia'}
            >
              Gastronomía
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${filtroActivo === 'fogata' ? styles.filterChipActive : ''}`}
              onClick={() => setFiltroActivo('fogata')}
              aria-pressed={filtroActivo === 'fogata'}
            >
              Noche & Fogata
            </button>
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
                    src={item.image_url}
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
          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <button
              ref={closeBtnRef}
              type="button"
              className={styles.closeBtn}
              onClick={handleCloseLightbox}
              aria-label="Cerrar galería de imágenes"
            >
              <X size={24} aria-hidden="true" />
            </button>

            <button
              type="button"
              className={`${styles.navArrow} ${styles.prevArrow}`}
              onClick={handlePrev}
              aria-label="Ver fotografía anterior"
            >
              <ChevronLeft size={28} aria-hidden="true" />
            </button>

            <div className={styles.lightboxImageWrapper}>
              {fotoActualItem.image_url ? (
                <div className={styles.lightboxPicture}>
                  <img
                    src={fotoActualItem.image_url}
                    alt={fotoActualItem.alt_text || fotoActualItem.title}
                    className={styles.lightboxImg}
                    style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain' }}
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
                    style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain' }}
                  />
                </div>
              )}
              <div className={styles.lightboxCaption}>
                <p className={styles.lightboxAlt}>
                  {fotoActualItem.alt_text || fotoActualEntry?.caption || fotoActualItem.title}
                </p>
                <span className={styles.lightboxCounter}>
                  {fotoSeleccionadaIndex! + 1} / {fotosFiltradas.length}
                </span>
              </div>
            </div>

            <button
              type="button"
              className={`${styles.navArrow} ${styles.nextArrow}`}
              onClick={handleNext}
              aria-label="Ver fotografía siguiente"
            >
              <ChevronRight size={28} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

