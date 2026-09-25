import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { aliados as fallbackAliados } from '@/assets/assets';
import { getActivePartners } from '@/services/partnerService';
import { getOptimizedCloudinaryUrl } from '@/services/cloudinaryService';
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
  const outerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);
  const oneSetWidthRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  const isPausedRef = useRef(false);
  const isHoveredRef = useRef(false);
  const isFocusedRef = useRef(false);
  const isTabVisibleRef = useRef(true);
  const isInViewportRef = useRef(false);

  // Referencias para el arrastre y detección direccional de gestos táctiles (MED-04)
  const isDraggingRef = useRef(false);
  const isTrackingTouchRef = useRef(false);
  const gestureDirectionRef = useRef<'undetermined' | 'horizontal' | 'vertical'>('undetermined');
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startPosRef = useRef(0);
  const dragDeltaRef = useRef(0);
  const didDragRef = useRef(false);
  const lastTouchEndTimeRef = useRef(0);

  // Inercia / Momentum tras arrastre
  const lastTouchXRef = useRef(0);
  const lastTouchTimeRef = useRef(0);
  const velocityRef = useRef(0);
  const momentumVelocityRef = useRef(0);

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
          logoSrc: hasCustomLogo
            ? getOptimizedCloudinaryUrl(p.logo_url!, { width: 300 })
            : localAsset?.grid || '',
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
      const scrollW = trackRef.current.scrollWidth;
      if (scrollW > 0) {
        oneSetWidthRef.current = scrollW / 3;
        if (scrollPosRef.current === 0) {
          scrollPosRef.current = scrollW / 3;
          if (trackRef.current) {
            trackRef.current.style.transform = `translate3d(${-scrollPosRef.current}px, 0, 0)`;
          }
        }
      }
    }
  }, [infiniteList.length]);

  useEffect(() => {
    measureWidth();
    const track = trackRef.current;
    if (!track) return;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        measureWidth();
      });
      ro.observe(track);
    }
    window.addEventListener('resize', measureWidth);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measureWidth);
    };
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

      if (!isHalted) {
        // Auto-recuperación si el ancho no se había podido calcular en el primer paint
        if (oneSetWidthRef.current <= 0 && track) {
          const scrollW = track.scrollWidth;
          if (scrollW > 0) {
            oneSetWidthRef.current = scrollW / 3;
            if (scrollPosRef.current === 0) {
              scrollPosRef.current = scrollW / 3;
            }
          }
        }

        if (oneSetWidthRef.current > 0) {
          let deltaScroll = 0.038 * deltaTime;

          // Desaceleración suave por momentum tras soltar arrastre
          if (Math.abs(momentumVelocityRef.current) > 0.01) {
            deltaScroll -= momentumVelocityRef.current * deltaTime;
            momentumVelocityRef.current *= Math.pow(0.92, deltaTime / 16);
            if (Math.abs(momentumVelocityRef.current) <= 0.01) {
              momentumVelocityRef.current = 0;
            }
          } else {
            momentumVelocityRef.current = 0;
          }

          scrollPosRef.current += deltaScroll;

          const oneSet = oneSetWidthRef.current;
          if (scrollPosRef.current >= oneSet * 2) {
            scrollPosRef.current -= oneSet;
          } else if (scrollPosRef.current < oneSet) {
            scrollPosRef.current += oneSet;
          }

          track.style.transform = `translate3d(${-scrollPosRef.current}px, 0, 0)`;
        }
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

    // IntersectionObserver: Activar RAF con antelación antes de entrar al viewport
    const observer = new IntersectionObserver(
      ([entry]) => {
        isInViewportRef.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          startLoop();
        } else {
          stopLoop();
        }
      },
      { threshold: 0, rootMargin: '120px 0px' }
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
  // Manejadores de Arrastre con Ratón
  // ==========================================
  const handleMouseDown = (e: React.MouseEvent) => {
    if (prefersReducedMotion) return;
    // Ignorar eventos sintéticos de mouse derivados de un toque táctil móvil reciente
    if (performance.now() - lastTouchEndTimeRef.current < 600) return;
    if (e.button !== 0) return;

    const track = trackRef.current;
    if (!track) return;

    isDraggingRef.current = true;
    setIsDraggingState(true);
    momentumVelocityRef.current = 0;
    startXRef.current = e.pageX;
    startPosRef.current = scrollPosRef.current;
    dragDeltaRef.current = 0;
    didDragRef.current = false;

    lastTouchXRef.current = e.pageX;
    lastTouchTimeRef.current = performance.now();
    velocityRef.current = 0;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const track = trackRef.current;
    if (!track) return;

    const currentX = e.pageX;
    const now = performance.now();
    const dt = now - lastTouchTimeRef.current;
    if (dt > 0) {
      velocityRef.current = (currentX - lastTouchXRef.current) / dt;
    }
    lastTouchXRef.current = currentX;
    lastTouchTimeRef.current = now;

    const diff = (currentX - startXRef.current) * 1.15;
    const absDiff = Math.abs(currentX - startXRef.current);
    if (absDiff > 6) {
      didDragRef.current = true;
    }
    dragDeltaRef.current = absDiff;

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
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDraggingState(false);

    // Momentum si hubo inercia al soltar ratón
    const timeSinceLast = performance.now() - lastTouchTimeRef.current;
    if (timeSinceLast < 140 && Math.abs(velocityRef.current) > 0.12) {
      momentumVelocityRef.current = Math.max(-2.5, Math.min(2.5, velocityRef.current * 0.85));
    }

    setTimeout(() => {
      didDragRef.current = false;
      dragDeltaRef.current = 0;
    }, 200);
  };

  const handleMouseLeave = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDraggingState(false);
    }
    isHoveredRef.current = false;
  };

  // ==============================================================================
  // Detección Direccional Robusta de Gestos Táctiles Móviles (MED-04)
  // Permite scroll vertical nativo fluido y drag horizontal voluntario sin jitter
  // ==============================================================================
  useEffect(() => {
    const track = trackRef.current;
    const container = outerRef.current || track;
    if (!container || !track) return;

    const GESTURE_THRESHOLD = 8; // Umbral en px para disambiguar dirección sin jitter

    const onTouchStart = (e: TouchEvent) => {
      if (prefersReducedMotion || e.touches.length !== 1) return;

      isHoveredRef.current = false;
      isTrackingTouchRef.current = true;
      gestureDirectionRef.current = 'undetermined';
      isDraggingRef.current = false;
      momentumVelocityRef.current = 0;
      didDragRef.current = false;

      const touch = e.touches[0];
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      startPosRef.current = scrollPosRef.current;
      dragDeltaRef.current = 0;

      lastTouchXRef.current = touch.clientX;
      lastTouchTimeRef.current = performance.now();
      velocityRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isTrackingTouchRef.current || e.touches.length !== 1) return;

      // Si el gesto fue catalogado como scroll vertical, se libera al navegador sin interferir
      if (gestureDirectionRef.current === 'vertical') {
        return;
      }

      const currentTrack = trackRef.current;
      if (!currentTrack) return;

      const touch = e.touches[0];
      const currentX = touch.clientX;
      const currentY = touch.clientY;
      const diffX = currentX - startXRef.current;
      const diffY = currentY - startYRef.current;
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);

      // Si la dirección no se ha resuelto aún, evaluar con umbral anti-jitter
      if (gestureDirectionRef.current === 'undetermined') {
        if (absX < GESTURE_THRESHOLD && absY < GESTURE_THRESHOLD) {
          return;
        }

        // Si el usuario mueve claramente en vertical, ceder al scroll nativo de la página
        if (absY >= 14 && absY >= absX * 1.35) {
          gestureDirectionRef.current = 'vertical';
          isTrackingTouchRef.current = false;
          isDraggingRef.current = false;
          setIsDraggingState(false);
          return;
        } else if (absX >= GESTURE_THRESHOLD && absX >= absY) {
          // Movimiento horizontal confirmado
          gestureDirectionRef.current = 'horizontal';
          isDraggingRef.current = true;
          setIsDraggingState(true);
        } else if (absY >= absX * 1.15 && absY >= 12) {
          gestureDirectionRef.current = 'vertical';
          isTrackingTouchRef.current = false;
          isDraggingRef.current = false;
          setIsDraggingState(false);
          return;
        } else if (absX > absY) {
          gestureDirectionRef.current = 'horizontal';
          isDraggingRef.current = true;
          setIsDraggingState(true);
        } else {
          // Ambigüedad en los primeros píxeles: esperar al siguiente evento sin bloquear
          return;
        }
      }

      // Gesto horizontal confirmado: arrastrar carrusel y bloquear scroll vertical indeseado
      if (gestureDirectionRef.current === 'horizontal') {
        if (e.cancelable) {
          e.preventDefault();
        }

        const now = performance.now();
        const dt = now - lastTouchTimeRef.current;
        if (dt > 0) {
          velocityRef.current = (currentX - lastTouchXRef.current) / dt;
        }
        lastTouchXRef.current = currentX;
        lastTouchTimeRef.current = now;

        if (absX > 6) {
          didDragRef.current = true;
        }
        dragDeltaRef.current = absX;

        const effectiveDiff = diffX * 1.15;
        let targetScroll = startPosRef.current - effectiveDiff;
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
        currentTrack.style.transform = `translate3d(${-targetScroll}px, 0, 0)`;
      }
    };

    const onTouchEnd = () => {
      lastTouchEndTimeRef.current = performance.now();
      isHoveredRef.current = false;

      if (gestureDirectionRef.current === 'horizontal') {
        const timeSinceLast = performance.now() - lastTouchTimeRef.current;
        if (timeSinceLast < 140 && Math.abs(velocityRef.current) > 0.12) {
          momentumVelocityRef.current = Math.max(-2.5, Math.min(2.5, velocityRef.current * 0.85));
        }
      }

      isTrackingTouchRef.current = false;
      isDraggingRef.current = false;
      gestureDirectionRef.current = 'undetermined';
      setIsDraggingState(false);

      setTimeout(() => {
        didDragRef.current = false;
        dragDeltaRef.current = 0;
      }, 350);
    };

    const onTouchCancel = () => {
      lastTouchEndTimeRef.current = performance.now();
      isHoveredRef.current = false;
      isTrackingTouchRef.current = false;
      isDraggingRef.current = false;
      gestureDirectionRef.current = 'undetermined';
      setIsDraggingState(false);
      setTimeout(() => {
        didDragRef.current = false;
        dragDeltaRef.current = 0;
      }, 350);
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [prefersReducedMotion]);

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
          subtitle="Empresas, operadores turísticos y restaurantes locales que hacen posible el premio y respaldan este sorteo. Pulsa en cualquier logo para abrir su perfil oficial en Instagram."
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
        ref={outerRef}
        className={styles.marqueeOuter}
        onMouseEnter={() => {
          // Solo pausar por hover si el dispositivo cuenta con un puntero fino real (mouse/trackpad)
          // En móviles touch, mouseenter es sintético y se queda pegado para siempre sin emitir mouseleave
          if (
            typeof window !== 'undefined' &&
            window.matchMedia &&
            window.matchMedia('(hover: hover) and (pointer: fine)').matches
          ) {
            isHoveredRef.current = true;
          }
        }}
        onMouseLeave={() => {
          isHoveredRef.current = false;
        }}
        onFocusCapture={(e) => {
          // Solo pausar si el foco proviene de navegación por teclado (:focus-visible)
          try {
            if (e.target instanceof HTMLElement && e.target.matches(':focus-visible')) {
              isFocusedRef.current = true;
            }
          } catch {
            // Fallback seguro
          }
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
                    if (didDragRef.current || dragDeltaRef.current > 6) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                >
                  <div className={styles.logoTile}>
                    {aliado.logoSrc ? (
                      <img
                        src={aliado.logoSrc}
                        srcSet={aliado.logoSrcSet}
                        sizes="160px"
                        alt={`Logo de ${aliado.name}`}
                        width={150}
                        height={150}
                        loading="lazy"
                        className={styles.aliadoLogo}
                        draggable={false}
                        onError={(e) => {
                          const fallback = localAliadosMap.get(aliado.slug)?.grid;
                          if (fallback && e.currentTarget.src !== fallback) {
                            e.currentTarget.src = fallback;
                            e.currentTarget.srcset = '';
                          }
                        }}
                      />
                    ) : (
                      <div className={styles.placeholderLogo}>
                        <Handshake size={40} aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <strong className={styles.aliadoName} title={aliado.name}>
                    {aliado.name}
                  </strong>
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
                      sizes="160px"
                      alt={`Logo de ${aliado.name}`}
                      width={150}
                      height={150}
                      loading="lazy"
                      className={styles.aliadoLogo}
                      draggable={false}
                      onError={(e) => {
                        const fallback = localAliadosMap.get(aliado.slug)?.grid;
                        if (fallback && e.currentTarget.src !== fallback) {
                          e.currentTarget.src = fallback;
                          e.currentTarget.srcset = '';
                        }
                      }}
                    />
                  ) : (
                    <div className={styles.placeholderLogo}>
                      <Handshake size={40} aria-hidden="true" />
                    </div>
                  )}
                </div>

                <strong className={styles.aliadoName} title={aliado.name}>
                  {aliado.name}
                </strong>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
