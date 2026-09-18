# Auditoría — Lote 11: Componentes de la Landing Page

> Fecha: 2026-09-17 | Estado: ✅ Completo

---

## 100. `src/components/landing/HeroRifa.tsx` & 101. `HeroRifa.module.css`

### A. Qué hace
Sección principal del banner inicial (Hero). Presenta el premio mayor, valor del boleto, fecha del sorteo, lotería de referencia y botones de llamada a la acción hacia el catálogo de boletos y el detalle del premio.

### B. Hallazgos
- **Optimización de carga crítica (LCP):** La imagen de fondo utiliza `<picture>` con WebP/JPG, dimensiones explícitas `1920x1080`, `loading="eager"` y `fetchPriority="high"`, previniendo penalizaciones en Core Web Vitals. ✅
- **Manejo de estados de la rifa:** Detecta automáticamente si la rifa está activa, pausada (`isPaused`) o finalizada (`isClosed`), adaptando badges, colores y deshabilitando el CTA de compra según corresponda. ✅
- **Formateo de fechas:** Función utilitaria interna `formatDrawDate` con capitalización del mes en español (ej. *"15 de Noviembre de 2026"*). ✅

---

## 102. `src/components/landing/DetallePremio.tsx` & 103. `DetallePremio.module.css`

### A. Qué hace
Sección detallada (`#premio`) que desglosa las 6 experiencias incluidas en el paquete para 2 personas:
1. Cuatrimotos todoterreno (Cuatri Tours Manaure)
2. Glamping y fogata nocturna (Mashiramo / Villa Adelaida)
3. Vuelo en parapente tándem (Manaure Aventura)
4. Expedición a la Serranía del Perijá (Los Pinos / Metallura)
5. Tour gastronómico local (La Casa de las Arepas / Absolom)
6. Registro fotográfico profesional (PHOTours)

### B. Hallazgos
- **Diseño modular y responsive:** Grilla adaptable (`minmax(340px, 1fr)`) con etiquetas del aliado respectivo en cada tarjeta, iconografía temática de Lucide y lista de inclusiones con checkmarks. ✅
- **Carga diferida:** Imágenes con `loading="lazy"` para no competir con el Hero. ✅

---

## 104. `src/components/landing/GaleriaPremio.tsx` & 105. `GaleriaPremio.module.css`

### A. Qué hace
Galería interactiva (`#galeria`) con filtro por categorías (`todas`, `cuatrimoto`, `parapente`, `serrania`, `fogata`) y visor Lightbox a pantalla completa.

### B. Hallazgos
- **Lightbox accesible y completo:**
  - Control mediante teclado: tecla `Escape` para cerrar, `ArrowLeft` / `ArrowRight` para navegar entre fotos.
  - Indicador de posición actual (`X / Y`) y descripción textual en la base del visor.
  - Event listeners globales limpiados adecuadamente en el `useEffect`. ✅
- **Accesibilidad:** Cada elemento de la grilla cuenta con `role="button"`, `tabIndex={0}`, `aria-label` y soporte para activación con tecla `Enter`. ✅

---

## 106. `src/components/landing/FilaAliados.tsx` & 107. `FilaAliados.module.css`

### A. Qué hace
Carrusel infinito continuo de la red de aliados y operadores turísticos con enlaces a sus perfiles de Instagram.

### B. Hallazgos
- **Arquitectura de animación:**
  - Implementa un bucle continuo fluido con `requestAnimationFrame` a ~38 px/segundo y acumulador sub-píxel (`scrollPosRef`), pausándose automáticamente al hacer hover (`onMouseEnter`/`onMouseLeave`).
  - Lista triplicada (`infiniteList = [...displayList, ...displayList, ...displayList]`) para permitir un rebobinado sin saltos visuales al alcanzar un tercio del ancho total. ✅
- **Interacción táctil y de ratón (Drag & Drop):**
  - Permite arrastre manual en escritorio (`onMouseDown/Move/Up`) y en móviles (`onTouchStart/Move/End`).
  - **Discriminador de arrastre vs. clic:** Mediante `dragDeltaRef.current > 6`, distingue si el usuario estaba arrastrando el carrusel o si hizo un clic intencional para abrir la URL de Instagram del aliado. ✅
- **Resiliencia de datos:** Consume la base de datos Supabase mediante `getActivePartners()` y cuenta con un fallback local instantáneo (`aliados as fallbackAliados`) y mapeo de URLs en `DEFAULT_INSTAGRAM_URLS`. ✅

---

## 108. `src/components/landing/PreguntasFrecuentes.tsx` & 109. `PreguntasFrecuentes.module.css`

### A. Qué hace
Sección de preguntas frecuentes (`#faq`) con acordeón interactivo que resuelve dudas sobre legalidad, lotería de Santander, medios de pago, vigencia y cesión del premio.

### B. Hallazgos
- **Accesibilidad en acordeón:** Los botones de pregunta controlan el estado con `aria-expanded={isOpen}` y la rotación del chevron (`transform: rotate(180deg)`). ✅
- **Animación:** Transición suave `slideDown` al desplegar las respuestas. ✅

---

## Resumen del Lote 11

| Archivo | Estado | Severidad | Nota |
|---------|--------|-----------|------|
| `HeroRifa.tsx` + `.css` | ✅ OK | — | LCP optimizado, badges de estado y diseño responsivo |
| `DetallePremio.tsx` + `.css` | ✅ OK | — | Desglose completo de las 6 experiencias con lazy loading |
| `GaleriaPremio.tsx` + `.css` | ✅ OK | — | Filtros interactivos y Lightbox con soporte de teclado |
| `FilaAliados.tsx` + `.css` | 🟢 Destacado | — | Carrusel continuo con requestAnimationFrame, drag & drop y discriminador de clics |
| `PreguntasFrecuentes.tsx` + `.css` | ✅ OK | — | Acordeón accesible con aria-expanded y animación fluida |

### Calidad general del Lote 11: 🟢 Excelente
Componentes de alta calidad visual, optimización de assets e interactividad pulida tanto en dispositivos de escritorio como móviles.

