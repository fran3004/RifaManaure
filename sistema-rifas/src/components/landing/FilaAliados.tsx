import React, { useState, useEffect, useRef, useMemo } from 'react';
import { aliados as fallbackAliados } from '@/assets/assets';
import { getActivePartners } from '@/services/partnerService';
import type { PartnerRow } from '@/types/raffle.types';
import { Handshake, MoveHorizontal } from 'lucide-react';
import styles from './FilaAliados.module.css';

// Enlaces directos a las cuentas oficiales de Instagram de los aliados
const DEFAULT_INSTAGRAM_URLS: Record<string, string> = {
  photours: 'https://www.instagram.com/photour_?stkn=ZDNlZDc0MzIxNw==',
  'cuatri-tours-manaure': 'https://www.instagram.com/cuatritours_manaure?stkn=ZDNlZDc0MzIxNw==',
  'villa-adelaida': 'https://www.instagram.com/restaurantevilladelaida?stkn=ZDNlZDc0MzIxNw==',
  'absolom-casita-de-la-mora': 'https://www.instagram.com/lacasitadelamora?stkn=ZDNlZDc0MzIxNw==',
  'mashiramo-glamping': 'https://www.instagram.com/mashiramo_glamping?stkn=ZDNlZDc0MzIxNw==',
  'los-pinos-manaure': 'https://www.instagram.com/lospinosmanaure?stkn=ZDNlZDc0MzIxNw==',
  metallura: 'https://www.instagram.com/metalluraturismo?stkn=ZDNlZDc0MzIxNw==',
  'manaure-aventura': 'https://www.instagram.com/manaureaventura?stkn=ZDNlZDc0MzIxNw==',
  coruscans: 'https://www.instagram.com/elcoruscans?stkn=ZDNlZDc0MzIxNw==',
  // 'la-casa-de-las-arepas': pendiente por asignar
};

// Diccionario indexado de logos locales para fallback instantáneo
const localAliadosMap = new Map(
  fallbackAliados.map((a) => [
    a.slug,
    {
      grid: a.logoGrid,
      grid2x: a.logoGrid2x,
      name: a.nombre,
      category: a.categoria,
    },
  ])
);

export const FilaAliados: React.FC = () => {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [isLoadedFromDb, setIsLoadedFromDb] = useState(false);

  // Referencias para el carrusel continuo con acumulador de coma flotante y arrastre
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isHoveredRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const dragDeltaRef = useRef(0);
  const [isDraggingState, setIsDraggingState] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadPartners() {
      try {
        const data = await getActivePartners();
        if (ignore) return;
        if (data && data.length > 0) {
          setPartners(data);
          setIsLoadedFromDb(true);
        }
      } catch (err) {
        console.warn('Aviso: usando catálogo local de aliados:', err);
      }
    }

    void loadPartners();
    return () => {
      ignore = true;
    };
  }, []);

  // Lista normalizada de aliados (prioriza datos de BD con fallback local e Instagram)
  const displayList = useMemo(() => {
    if (isLoadedFromDb && partners.length > 0) {
      return partners.map((p) => {
        const localAsset = localAliadosMap.get(p.slug);
        const hasCustomLogo = Boolean(p.logo_url && p.logo_url.trim() !== '');
        const instagramUrl = p.instagram_url?.trim() || DEFAULT_INSTAGRAM_URLS[p.slug] || null;

        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          category: p.category,
          logoSrc: hasCustomLogo ? p.logo_url! : localAsset?.grid || '',
          logoSrcSet: hasCustomLogo
            ? undefined
            : localAsset
            ? `${localAsset.grid} 400w, ${localAsset.grid2x} 800w`
            : undefined,
          instagramUrl,
        };
      });
    }

    return fallbackAliados.map((a) => ({
      id: a.slug,
      slug: a.slug,
      name: a.nombre,
      category: a.categoria,
      logoSrc: a.logoGrid,
      logoSrcSet: `${a.logoGrid} 400w, ${a.logoGrid2x} 800w`,
      instagramUrl: DEFAULT_INSTAGRAM_URLS[a.slug] || null,
    }));
  }, [isLoadedFromDb, partners]);

  // Duplicamos la lista para crear un bucle infinito perfectamente fluido
  const infiniteList = useMemo(() => {
    if (displayList.length === 0) return [];
    return [...displayList, ...displayList, ...displayList];
  }, [displayList]);

  // Bucle continuo de animación suave con requestAnimationFrame y acumulador sub-píxel
  useEffect(() => {
    const track = trackRef.current;
    if (!track || infiniteList.length === 0) return;

    // Sincronizar posición inicial acumulada
    scrollPosRef.current = track.scrollLeft;

    let animationFrameId: number;
    let lastTime = performance.now();

    const scrollLoop = (currentTime: number) => {
      const deltaTime = Math.min(currentTime - lastTime, 64);
      lastTime = currentTime;

      if (!isHoveredRef.current && !isDraggingRef.current) {
        // Velocidad continua suave (~38 píxeles por segundo)
        const speed = 0.038 * deltaTime;
        scrollPosRef.current += speed;

        // Bucle infinito: cuando avanza un tercio (una copia completa), rebobina sin salto
        const oneSetWidth = track.scrollWidth / 3;
        if (oneSetWidth > 0) {
          if (scrollPosRef.current >= oneSetWidth * 2) {
            scrollPosRef.current -= oneSetWidth;
          } else if (scrollPosRef.current <= 0) {
            scrollPosRef.current += oneSetWidth;
          }
        }
        track.scrollLeft = scrollPosRef.current;
      }

      animationFrameId = requestAnimationFrame(scrollLoop);
    };

    animationFrameId = requestAnimationFrame(scrollLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [infiniteList]);

  // ==========================================
  // Manejadores de Arrastre con Ratón / Touch
  // ==========================================
  const handleMouseDown = (e: React.MouseEvent) => {
    const track = trackRef.current;
    if (!track) return;

    isDraggingRef.current = true;
    setIsDraggingState(true);
    startXRef.current = e.pageX - track.offsetLeft;
    scrollLeftRef.current = track.scrollLeft;
    scrollPosRef.current = track.scrollLeft;
    dragDeltaRef.current = 0;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const track = trackRef.current;
    if (!track) return;

    const currentX = e.pageX - track.offsetLeft;
    const walk = (currentX - startXRef.current) * 1.15;
    dragDeltaRef.current = Math.abs(currentX - startXRef.current);
    const targetScroll = scrollLeftRef.current - walk;
    track.scrollLeft = targetScroll;
    scrollPosRef.current = track.scrollLeft;

    // Normalizar bucle durante el arrastre manual
    const oneSetWidth = track.scrollWidth / 3;
    if (oneSetWidth > 0) {
      if (track.scrollLeft >= oneSetWidth * 2) {
        track.scrollLeft -= oneSetWidth;
        scrollLeftRef.current -= oneSetWidth;
        scrollPosRef.current = track.scrollLeft;
      } else if (track.scrollLeft <= 0) {
        track.scrollLeft += oneSetWidth;
        scrollLeftRef.current += oneSetWidth;
        scrollPosRef.current = track.scrollLeft;
      }
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setIsDraggingState(false);
    if (trackRef.current) {
      scrollPosRef.current = trackRef.current.scrollLeft;
    }
    setTimeout(() => {
      dragDeltaRef.current = 0;
    }, 80);
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setIsDraggingState(false);
    isHoveredRef.current = false;
    if (trackRef.current) {
      scrollPosRef.current = trackRef.current.scrollLeft;
    }
  };

  // Touch en dispositivos táctiles
  const handleTouchStart = (e: React.TouchEvent) => {
    const track = trackRef.current;
    if (!track || e.touches.length === 0) return;

    isDraggingRef.current = true;
    setIsDraggingState(true);
    startXRef.current = e.touches[0].pageX - track.offsetLeft;
    scrollLeftRef.current = track.scrollLeft;
    scrollPosRef.current = track.scrollLeft;
    dragDeltaRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    const track = trackRef.current;
    if (!track || e.touches.length === 0) return;

    const currentX = e.touches[0].pageX - track.offsetLeft;
    const walk = (currentX - startXRef.current) * 1.15;
    dragDeltaRef.current = Math.abs(currentX - startXRef.current);
    const targetScroll = scrollLeftRef.current - walk;
    track.scrollLeft = targetScroll;
    scrollPosRef.current = track.scrollLeft;

    const oneSetWidth = track.scrollWidth / 3;
    if (oneSetWidth > 0) {
      if (track.scrollLeft >= oneSetWidth * 2) {
        track.scrollLeft -= oneSetWidth;
        scrollLeftRef.current -= oneSetWidth;
        scrollPosRef.current = track.scrollLeft;
      } else if (track.scrollLeft <= 0) {
        track.scrollLeft += oneSetWidth;
        scrollLeftRef.current += oneSetWidth;
        scrollPosRef.current = track.scrollLeft;
      }
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    setIsDraggingState(false);
    if (trackRef.current) {
      scrollPosRef.current = trackRef.current.scrollLeft;
    }
    setTimeout(() => {
      dragDeltaRef.current = 0;
    }, 80);
  };

  // Apertura de enlace de Instagram discriminando arrastre vs clic
  const handleCardClick = (url: string | null) => {
    if (dragDeltaRef.current > 6) return;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <section id="aliados" className={styles.aliadosSection}>
      <div className="container">
        <div className={styles.header}>
          <div className={styles.badge}>
            <Handshake size={16} />
            <span>Red de Convenios y Turismo Local</span>
          </div>
          <h2 className={styles.title}>Nuestros Aliados Oficiales</h2>
          <p className={styles.subtitle}>
            Empresas, operadores turísticos y restaurantes locales que hacen posible el premio y respaldan este sorteo. Haz clic en cualquier logo para abrir su Instagram oficial.
          </p>
          <div className={styles.interactionHint}>
            <MoveHorizontal size={14} />
            <span>Desplazamiento automático continuo · Arrastra con el ratón o pulsa sobre un logo para visitar su Instagram</span>
          </div>
        </div>
      </div>

      {/* Contenedor del Carrusel en Fila Única sin barras de scroll */}
      <div className={styles.marqueeOuter}>
        <div className={styles.fadeLeft} />
        <div className={styles.fadeRight} />

        <div
          ref={trackRef}
          className={`${styles.aliadosTrack} ${isDraggingState ? styles.isDragging : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {infiniteList.map((aliado, idx) => {
            const hasInstagram = Boolean(aliado.instagramUrl);

            return (
              <div
                key={`${aliado.slug}-${idx}`}
                className={styles.aliadoItem}
                onClick={() => handleCardClick(aliado.instagramUrl)}
                title={
                  hasInstagram
                    ? `Visitar Instagram de ${aliado.name}`
                    : `${aliado.name} - Aliado Oficial`
                }
                role={hasInstagram ? 'link' : undefined}
                tabIndex={hasInstagram ? 0 : undefined}
                onMouseEnter={() => {
                  isHoveredRef.current = true;
                }}
                onMouseLeave={() => {
                  isHoveredRef.current = false;
                }}
                onKeyDown={(e) => {
                  if (hasInstagram && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    window.open(aliado.instagramUrl!, '_blank', 'noopener,noreferrer');
                  }
                }}
              >
                <div
                  className={`${styles.logoCircle} ${
                    hasInstagram ? styles.logoCircleHasInstagram : styles.logoCircleNoInstagram
                  }`}
                >
                  {aliado.logoSrc ? (
                    <img
                      src={aliado.logoSrc}
                      srcSet={aliado.logoSrcSet}
                      sizes="135px"
                      alt={`Logotipo oficial de ${aliado.name}`}
                      width={135}
                      height={135}
                      loading="lazy"
                      className={styles.aliadoLogo}
                      draggable={false}
                    />
                  ) : (
                    <div className={styles.placeholderLogo}>
                      <Handshake size={36} style={{ color: 'var(--color-brand-accent, #f59e0b)' }} />
                    </div>
                  )}
                </div>

                <strong className={styles.aliadoName} title={aliado.name}>
                  {aliado.name}
                </strong>
                <span className={styles.aliadoCategory} title={aliado.category}>
                  {aliado.category}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
