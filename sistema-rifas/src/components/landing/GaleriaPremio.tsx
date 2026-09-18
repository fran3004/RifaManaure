import React, { useState, useEffect, useCallback } from 'react';
import { fotos, type Foto } from '@/assets/assets';
import { Image, X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import styles from './GaleriaPremio.module.css';

type CategoriaFiltro = 'todas' | 'cuatrimoto' | 'parapente' | 'serrania' | 'fogata';

export const GaleriaPremio: React.FC = () => {
  const [filtroActivo, setFiltroActivo] = useState<CategoriaFiltro>('todas');
  const [fotoSeleccionadaIndex, setFotoSeleccionadaIndex] = useState<number | null>(null);

  const fotosFiltradas =
    filtroActivo === 'todas' ? fotos : fotos.filter((f) => f.experiencia === filtroActivo);

  const handleOpenLightbox = (index: number) => {
    setFotoSeleccionadaIndex(index);
  };

  const handleCloseLightbox = () => {
    setFotoSeleccionadaIndex(null);
  };

  const handlePrev = useCallback(() => {
    if (fotoSeleccionadaIndex === null) return;
    setFotoSeleccionadaIndex((prev) => (prev === 0 ? fotosFiltradas.length - 1 : (prev ?? 0) - 1));
  }, [fotoSeleccionadaIndex, fotosFiltradas.length]);

  const handleNext = useCallback(() => {
    if (fotoSeleccionadaIndex === null) return;
    setFotoSeleccionadaIndex((prev) => (prev === fotosFiltradas.length - 1 ? 0 : (prev ?? 0) + 1));
  }, [fotoSeleccionadaIndex, fotosFiltradas.length]);

  // Soporte para teclado (Esc, Flechas)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (fotoSeleccionadaIndex === null) return;
      if (e.key === 'Escape') handleCloseLightbox();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fotoSeleccionadaIndex, handlePrev, handleNext]);

  const fotoActual: Foto | undefined =
    fotoSeleccionadaIndex !== null ? fotosFiltradas[fotoSeleccionadaIndex] : undefined;

  return (
    <section id="galeria" className={styles.galeriaSection}>
      <div className="container">
        {/* Cabecera */}
        <div className={styles.header}>
          <div className={styles.badge}>
            <Image size={16} />
            <span>Fotografías Reales del Destino</span>
          </div>
          <h2 className={styles.title}>
            Explora los paisajes que <span className="highlight-text">podrías vivir</span>
          </h2>
          <p className={styles.subtitle}>
            Fotos auténticas de las rutas, el glamping y las actividades extremas en Manaure y la
            Serranía del Perijá.
          </p>

          {/* Filtros por Categoría */}
          <div className={styles.filterTabs}>
            <button
              type="button"
              className={`${styles.filterBtn} ${filtroActivo === 'todas' ? styles.filterActive : ''}`}
              onClick={() => setFiltroActivo('todas')}
            >
              Todas ({fotos.length})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${filtroActivo === 'cuatrimoto' ? styles.filterActive : ''}`}
              onClick={() => setFiltroActivo('cuatrimoto')}
            >
              Cuatrimotos
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${filtroActivo === 'parapente' ? styles.filterActive : ''}`}
              onClick={() => setFiltroActivo('parapente')}
            >
              Parapente
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${filtroActivo === 'serrania' ? styles.filterActive : ''}`}
              onClick={() => setFiltroActivo('serrania')}
            >
              Serranía del Perijá
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${filtroActivo === 'fogata' ? styles.filterActive : ''}`}
              onClick={() => setFiltroActivo('fogata')}
            >
              Glamping & Fogata
            </button>
          </div>
        </div>

        {/* Grilla de Galería */}
        <div className={styles.galleryGrid}>
          {fotosFiltradas.map((foto, index) => (
            <div
              key={foto.slug}
              className={styles.galleryItem}
              onClick={() => handleOpenLightbox(index)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleOpenLightbox(index)}
              aria-label={`Ver foto en grande: ${foto.alt}`}
            >
              <picture>
                <source srcSet={foto.card} type="image/webp" />
                <img
                  src={foto.cardJpg}
                  alt={foto.alt}
                  width={1200}
                  height={800}
                  loading="lazy"
                  className={styles.galleryImage}
                />
              </picture>
              <div className={styles.itemOverlay}>
                <Maximize2 size={24} className={styles.zoomIcon} />
                <span className={styles.itemCaption}>{foto.alt}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Visor Lightbox Modal */}
      {fotoActual && (
        <div className={styles.lightboxBackdrop} onClick={handleCloseLightbox}>
          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={handleCloseLightbox}
              aria-label="Cerrar visor"
            >
              <X size={26} />
            </button>

            <button
              type="button"
              className={`${styles.navArrow} ${styles.prevArrow}`}
              onClick={handlePrev}
              aria-label="Foto anterior"
            >
              <ChevronLeft size={32} />
            </button>

            <div className={styles.lightboxImageWrapper}>
              <picture>
                <source srcSet={fotoActual.full} type="image/webp" />
                <img src={fotoActual.fullJpg} alt={fotoActual.alt} className={styles.lightboxImg} />
              </picture>
              <div className={styles.lightboxCaption}>
                <p>{fotoActual.alt}</p>
                <span>
                  {fotoSeleccionadaIndex! + 1} / {fotosFiltradas.length}
                </span>
              </div>
            </div>

            <button
              type="button"
              className={`${styles.navArrow} ${styles.nextArrow}`}
              onClick={handleNext}
              aria-label="Foto siguiente"
            >
              <ChevronRight size={32} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
