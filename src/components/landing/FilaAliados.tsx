import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { aliados as fallbackAliados } from '@/assets/assets';
import { getActivePartners } from '@/services/partnerService';
import type { PartnerRow } from '@/types/raffle.types';
import { Handshake, MoveHorizontal, Pause, Play } from 'lucide-react';
import { SectionHeader } from '@/components/public/ui';
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

const PARTNERS_CACHE_KEY = 'manaure_partners_cache';

function getCachedPartners(): PartnerRow[] {
  try {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(PARTNERS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch {
    // Ignorar errores de cache
  }
  return [];
}

export const FilaAliados: React.FC = () => {
  const cachedPartners = getCachedPartners();
  const [partners, setPartners] = useState<PartnerRow[]>(cachedPartners);
  const [isLoadedFromDb, setIsLoadedFromDb] = useState<boolean>(() => cachedPartners.length > 0);

  // Estados de control de animación y accesibilidad
  const [isPaused, setIsPaused] = useState(false);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Referencias para el bucle de animación sin lecturas de layout
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);
  const oneSetWidthRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  const isPausedRef = useRef(false);
  const isHoveredRef = useRef(false);
  const isFocusedRef = useRef(false);
  const isTabVisibleRef = useRef(true);
  const isInViewportRef = useRef(false);

  // Referencias para el arrastre
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startPosRef = useRef(0);
  const dragDeltaRef = useRef(0);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    let ignore = false;

    async function loadPartners() {
      try {
        const data = await getActivePartners();
        if (ignore) return;
        if (data && data.length > 0) {
          setPartners(data);
          setIsLoadedFromDb(true);
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem(PARTNERS_CACHE_KEY, JSON.stringify(data));
            }
          } catch {}
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

  // Escuchar preferencia de movimiento reducido
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Lista normalizada de aliados
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

  // Duplicamos 3 veces la lista para el bucle continuo infinito
  const infiniteList = useMemo(() => {
    if (displayList.length === 0) return [];
    return [...displayList, ...displayList, ...displayList];
  }, [displayList]);

  // Medición de una sola copia fuera del bucle de animación para evitar layout reflows
  const measureWidth = useCallback(() => {
    if (trackRef.current && infiniteList.length > 0) {
      oneSetWidthRef.current = trackRef.current.scrollWidth / 3;
    }
  }, [infiniteList.length]);

  useEffect(() => {
    measureWidth();
    window.addEventListener('resize', measureWidth);
    return () => window.removeEventListener('resize', measureWidth);
  }, [measureWidth]);

  // Bucle de animación suave con translate3d, 0 lecturas de layout y 0% CPU inactivo
  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track || infiniteList.length === 0 || prefersReducedMotion) {
      if (track && prefersReducedMotion) {
        track.style.transform = 'none';
      }
      return;
    }

    let lastTime = performance.now();

    const tick = (currentTime: number) => {
      // Si la pestaña está oculta o el carrusel no está en el viewport, detenemos el scheduling
      if (!isTabVisibleRef.current || !isInViewportRef.current) {
        rafIdRef.current = null;
        return;
      }

      const deltaTime = Math.min(currentTime - lastTime, 64);
      lastTime = currentTime;

      const isHalted =
        isPausedRef.current ||
        isHoveredRef.current ||
        isFocusedRef.current ||
        isDraggingRef.current;

      if (!isHalted && oneSetWidthRef.current > 0) {
        const speed = 0.038 * deltaTime;
        scrollPosRef.current += speed;

        const oneSet = oneSetWidthRef.current;
        if (scrollPosRef.current >= oneSet * 2) {
          scrollPosRef.current -= oneSet;
        } else if (scrollPosRef.current < oneSet) {
          scrollPosRef.current += oneSet;
        }

        track.style.transform = `translate3d(${-scrollPosRef.current}px, 0, 0)`;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (
        rafIdRef.current === null &&
        isTabVisibleRef.current &&
        isInViewportRef.current &&
        !prefersReducedMotion
      ) {
        lastTime = performance.now();
        rafIdRef.current = requestAnimationFrame(tick);
      }
    };

    const stopLoop = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    // IntersectionObserver: Detener RAF cuando sale del viewport
    const observer = new IntersectionObserver(
      ([entry]) => {
        isInViewportRef.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          startLoop();
        } else {
          stopLoop();
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(section);

    // VisibilityChange: Detener RAF cuando la pestaña está oculta
    const handleVisibilityChange = () => {
      isTabVisibleRef.current = document.visibilityState === 'visible';
      if (document.visibilityState === 'visible') {
        startLoop();
      } else {
        stopLoop();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Inicializar posición
    if (oneSetWidthRef.current > 0 && scrollPosRef.current === 0) {
      scrollPosRef.current = oneSetWidthRef.current;
      track.style.transform = `translate3d(${-scrollPosRef.current}px, 0, 0)`;
    }

    return () => {
      stopLoop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [infiniteList, prefersReducedMotion]);

  // ==========================================
  // Manejadores de Arrastre con Ratón y Touch
  // ==========================================
  const handleMouseDown = (e: React.MouseEvent) => {
    if (prefersReducedMotion) return;
    const track = trackRef.current;
    if (!track) return;

    isDraggingRef.current = true;
    setIsDraggingState(true);
    startXRef.current = e.pageX;
    startPosRef.current = scrollPosRef.current;
    dragDeltaRef.current = 0;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const track = trackRef.current;
    if (!track) return;

    const currentX = e.pageX;
    const diff = (currentX - startXRef.current) * 1.15;
    dragDeltaRef.current = Math.abs(currentX - startXRef.current);

    let targetScroll = startPosRef.current - diff;
    const oneSet = oneSetWidthRef.current;

    if (oneSet > 0) {
      if (targetScroll >= oneSet * 2) {
        targetScroll -= oneSet;
        startPosRef.current -= oneSet;
      } else if (targetScroll < oneSet) {
        targetScroll += oneSet;
        startPosRef.current += oneSet;
      }
    }

    scrollPosRef.current = targetScroll;
    track.style.transform = `translate3d(${-targetScroll}px, 0, 0)`;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setIsDraggingState(false);
    setTimeout(() => {
      dragDeltaRef.current = 0;
    }, 80);
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setIsDraggingState(false);
    isHoveredRef.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (prefersReducedMotion || e.touches.length === 0) return;
    const track = trackRef.current;
    if (!track) return;

    isDraggingRef.current = true;
    setIsDraggingState(true);
    startXRef.current = e.touches[0].pageX;
    startPosRef.current = scrollPosRef.current;
    dragDeltaRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || e.touches.length === 0) return;
    const track = trackRef.current;
    if (!track) return;

    const currentX = e.touches[0].pageX;
    const diff = (currentX - startXRef.current) * 1.15;
    dragDeltaRef.current = Math.abs(currentX - startXRef.current);

    let targetScroll = startPosRef.current - diff;
    const oneSet = oneSetWidthRef.current;

    if (oneSet > 0) {
      if (targetScroll >= oneSet * 2) {
        targetScroll -= oneSet;
        startPosRef.current -= oneSet;
      } else if (targetScroll < oneSet) {
        targetScroll += oneSet;
        startPosRef.current += oneSet;
      }
    }

    scrollPosRef.current = targetScroll;
    track.style.transform = `translate3d(${-targetScroll}px, 0, 0)`;
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    setIsDraggingState(false);
    setTimeout(() => {
      dragDeltaRef.current = 0;
    }, 80);
  };

  const togglePause = () => {
    setIsPaused((prev) => !prev);
  };

  return (
    <section
      ref={sectionRef}
      id="aliados"
      className={styles.aliadosSection}
      aria-labelledby="titulo-aliados"
    >
      <div className="container">
        <SectionHeader
          id="titulo-aliados"
          badge="Red de Convenios y Turismo Local"
          icon={<Handshake size={16} aria-hidden="true" />}
          title="Nuestros Aliados Oficiales"
          subtitle="Empresas, operadores turísticos y restaurantes locales que hacen posible el premio y respaldan este sorteo. Haz clic en cualquier logo para abrir su Instagram oficial."
        >
          {/* Barra de Controles: Guía de uso y botón accesible de Pausar / Reanudar */}
          <div className={styles.controlsBar}>
            <div className={styles.interactionHint}>
              <MoveHorizontal size={14} aria-hidden="true" />
              <span>
                Arrastra para explorar o pulsa en cualquier logo para abrir su Instagram oficial
              </span>
            </div>

            <button
              type="button"
              className={styles.pauseBtn}
              onClick={togglePause}
              aria-label={
                isPaused ? 'Reanudar movimiento automático' : 'Pausar movimiento automático'
              }
              aria-pressed={isPaused}
            >
              {isPaused ? (
                <>
                  <Play size={15} aria-hidden="true" />
                  <span>Reanudar</span>
                </>
              ) : (
                <>
                  <Pause size={15} aria-hidden="true" />
                  <span>Pausar</span>
                </>
              )}
            </button>
          </div>
        </SectionHeader>
      </div>

      {/* Contenedor del Carrusel con desvanecido CSS por mask-image */}
      <div
        className={styles.marqueeOuter}
        onMouseEnter={() => {
          isHoveredRef.current = true;
        }}
        onMouseLeave={() => {
          isHoveredRef.current = false;
        }}
        onFocusCapture={() => {
          isFocusedRef.current = true;
        }}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            isFocusedRef.current = false;
          }
        }}
      >
        <div
          ref={trackRef}
          className={`${styles.aliadosTrack} ${isDraggingState ? styles.isDragging : ''} ${
            prefersReducedMotion ? styles.reducedMotionTrack : ''
          }`}
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

            if (hasInstagram) {
              return (
                <a
                  key={`${aliado.slug}-${idx}`}
                  href={aliado.instagramUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.aliadoItem}
                  aria-label={`Visitar Instagram de ${aliado.name}`}
                  onClick={(e) => {
                    if (dragDeltaRef.current > 6) {
                      e.preventDefault();
                    }
                  }}
                >
                  <div className={styles.logoTile}>
                    {aliado.logoSrc ? (
                      <img
                        src={aliado.logoSrc}
                        srcSet={aliado.logoSrcSet}
                        sizes="120px"
                        alt=""
                        width={120}
                        height={120}
                        loading="lazy"
                        className={styles.aliadoLogo}
                        draggable={false}
                      />
                    ) : (
                      <div className={styles.placeholderLogo}>
                        <Handshake size={36} aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <strong className={styles.aliadoName} title={aliado.name}>
                    {aliado.name}
                  </strong>
                  <span className={styles.aliadoCategory} title={aliado.category}>
                    {aliado.category}
                  </span>
                  <span className="visually-hidden"> (se abre en una pestaña nueva)</span>
                </a>
              );
            }

            return (
              <div
                key={`${aliado.slug}-${idx}`}
                className={`${styles.aliadoItem} ${styles.aliadoItemStatic}`}
                aria-label={`${aliado.name} - Aliado oficial`}
              >
                <div className={styles.logoTile}>
                  {aliado.logoSrc ? (
                    <img
                      src={aliado.logoSrc}
                      srcSet={aliado.logoSrcSet}
                      sizes="120px"
                      alt=""
                      width={120}
                      height={120}
                      loading="lazy"
                      className={styles.aliadoLogo}
                      draggable={false}
                    />
                  ) : (
                    <div className={styles.placeholderLogo}>
                      <Handshake size={36} aria-hidden="true" />
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
