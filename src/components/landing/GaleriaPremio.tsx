import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fotos, type Foto } from '@/assets/assets';
import { Image, X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { SectionHeader } from '@/components/public/ui';
import styles from './GaleriaPremio.module.css';

type CategoriaFiltro = 'todas' | 'cuatrimoto' | 'parapente' | 'serrania' | 'fogata';

export const GaleriaPremio: React.FC = () => {
  const [filtroActivo, setFiltroActivo] = useState<CategoriaFiltro>('todas');
  const [fotoSeleccionadaIndex, setFotoSeleccionadaIndex] = useState<number | null>(null);

  const triggerRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const fotosFiltradas =
    filtroActivo === 'todas' ? fotos : fotos.filter((f) => f.experiencia === filtroActivo);

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
      // Foco inicial en el botón cerrar
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

        // Focus trap dentro del diálogo
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

  // Precarga de la imagen anterior y siguiente
  useEffect(() => {
    if (fotoSeleccionadaIndex === null || fotosFiltradas.length <= 1) return;

    const prevIndex =
      fotoSeleccionadaIndex === 0 ? fotosFiltradas.length - 1 : fotoSeleccionadaIndex - 1;
    const nextIndex =
      fotoSeleccionadaIndex === fotosFiltradas.length - 1 ? 0 : fotoSeleccionadaIndex + 1;

    const preload = (src: string) => {
      if (!src) return;
      const img = new window.Image();
      img.src = src;
    };

    if (fotosFiltradas[prevIndex]) {
      preload(fotosFiltradas[prevIndex].full);
      preload(fotosFiltradas[prevIndex].fullJpg);
    }
    if (fotosFiltradas[nextIndex]) {
      preload(fotosFiltradas[nextIndex].full);
      preload(fotosFiltradas[nextIndex].fullJpg);
    }
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

  const fotoActual: Foto | undefined =
    fotoSeleccionadaIndex !== null ? fotosFiltradas[fotoSeleccionadaIndex] : undefined;

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
              Todas ({fotos.length})
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
              className={`${styles.filterChip} ${filtroActivo === 'fogata' ? styles.filterChipActive : ''}`}
              onClick={() => setFiltroActivo('fogata')}
              aria-pressed={filtroActivo === 'fogata'}
            >
              Glamping
            </button>
          </div>

          {/* Región aria-live para anunciar el conteo tras filtrar */}
          <div className="visually-hidden" aria-live="polite" aria-atomic="true">
            Mostrando {fotosFiltradas.length} {fotosFiltradas.length === 1 ? 'foto' : 'fotos'}
          </div>
        </SectionHeader>

        {/* Grilla de Galería */}
        <div className={styles.galleryGrid}>
          {fotosFiltradas.map((foto, index) => (
            <button
              key={foto.slug}
              type="button"
              className={styles.galleryItem}
              onClick={(e) => handleOpenLightbox(index, e.currentTarget)}
              aria-label={`Ver fotografía ampliada: ${foto.alt}`}
            >
              <picture>
                <source srcSet={foto.card} type="image/webp" />
                <img
                  src={foto.cardJpg}
                  alt=""
                  width={1200}
                  height={800}
                  loading="lazy"
                  className={styles.galleryImage}
                />
              </picture>
              <div className={styles.itemOverlay} aria-hidden="true">
                <Maximize2 size={24} className={styles.zoomIcon} />
                <span className={styles.itemCaption}>{foto.alt}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Visor Lightbox Modal */}
      {fotoActual && (
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
              <picture>
                <source srcSet={fotoActual.full} type="image/webp" />
                <img
                  src={fotoActual.fullJpg}
                  alt={fotoActual.alt}
                  className={styles.lightboxImg}
                />
              </picture>
              <div className={styles.lightboxCaption}>
                <p className={styles.lightboxAlt}>{fotoActual.alt}</p>
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
