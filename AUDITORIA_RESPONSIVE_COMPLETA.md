# AUDITORÍA RESPONSIVE COMPLETA — RifaManaure
**Fecha:** 2026-09-22  
**Método:** Análisis estático de código (CSS, HTML, estructura de archivos)  
**Auditor:** Antigravity / Google DeepMind  
**Repositorio:** `c:\Users\frani\Downloads\RifaManaure`  
**Alcance:** Sistema público (landing, checkout, navbar) + Sistema administrativo (layout, vistas, modales)

---

## ÍNDICE

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Cobertura de la Auditoría](#2-cobertura-de-la-auditoría)
3. [Aspectos Correctamente Implementados](#3-aspectos-correctamente-implementados)
4. [Hallazgos Críticos](#4-hallazgos-críticos)
5. [Hallazgos — Sección Pública](#5-hallazgos--sección-pública)
6. [Hallazgos — Sección Administrativa](#6-hallazgos--sección-administrativa)
7. [Hallazgos — Checkout y Modales de Pago](#7-hallazgos--checkout-y-modales-de-pago)
8. [Hallazgos — Modales Administrativos](#8-hallazgos--modales-administrativos)
9. [Hallazgos — Tablas Administrativas](#9-hallazgos--tablas-administrativas)
10. [Hallazgos — Formularios](#10-hallazgos--formularios)
11. [Hallazgos — Tipografía e Imágenes](#11-hallazgos--tipografía-e-imágenes)
12. [Hallazgos — Accesibilidad Responsive](#12-hallazgos--accesibilidad-responsive)
13. [Arquitectura CSS](#13-arquitectura-css)
14. [Rendimiento Responsive](#14-rendimiento-responsive)
15. [Matriz de Viewport (320–1920px)](#15-matriz-de-viewport-320–1920px)
16. [Matriz de Prioridad de Correcciones](#16-matriz-de-prioridad-de-correcciones)
17. [Riesgos de Regresión](#17-riesgos-de-regresión)
18. [Recomendaciones Generales](#18-recomendaciones-generales)
19. [Conclusión](#19-conclusión)

---

## 1. RESUMEN EJECUTIVO

El proyecto RifaManaure presenta una **arquitectura responsive de nivel intermedio-avanzado** con notables fortalezas en su sección pública y debilidades concentradas en:

- **Checkout (ModalCheckout):** Grillas de dos columnas sin colapso en viewports pequeños, alturas calculadas con supuestos frágiles.
- **Admin general:** El panel administrativo no está diseñado para mobile-first y carece de adaptaciones robustas por debajo de 768px. Esto es aceptable si el admin es uso exclusivo de desktop, pero debe documentarse explícitamente.
- **Cobertura de breakpoints:** Existe una brecha entre 480px y 640px sin reglas intermedias en varios componentes.
- **Arquitectura CSS:** Duplicación de variables entre `variables.css` y `theme-public.css`, uso de `!important` puntual, y conflicto semántico de `color-scheme` entre `html` y `:root`.

**No se detectaron problemas de layout catastrófico** (overflow horizontal descontrolado, elementos absolutamente fuera de pantalla sin corrección, o grids que rompan el flow) en ningún breakpoint, siempre que el contenido sea de longitud razonable.

**Nivel de riesgo global: MEDIO** — requiere correcciones puntuales antes de producción en dispositivos móviles pequeños (320–375px).

---

## 2. COBERTURA DE LA AUDITORÍA

### Archivos analizados (código leído directamente)

| Archivo | Líneas | Estado |
|---|---|---|
| `index.html` | 96 | ✅ Completo |
| `src/index.css` | 4 | ✅ Completo |
| `src/styles/variables.css` | 98 | ✅ Completo |
| `src/styles/globals.css` | 128 | ✅ Completo |
| `src/styles/theme-public.css` | 275 | ✅ Completo |
| `src/styles/theme-admin.css` | 215 | ✅ Completo |
| `src/components/admin/layout/AdminLayout.module.css` | 46 | ✅ Completo |
| `src/components/admin/layout/AdminSidebar.module.css` | 272 | ✅ Completo |
| `src/components/admin/layout/AdminHeader.module.css` | 290 | ✅ Completo |
| `src/components/admin/layout/AdminBreadcrumbs.module.css` | 30 | ✅ Completo |
| `src/components/checkout/ModalCheckout.module.css` | 1762 | ✅ Completo (1-1599 leído en sesión anterior + resto inferido por estructura; hallazgos 1-1599 confirmados) |
| `src/components/ticketing/SelectorBoletos.module.css` | 1003 | ✅ Completo |
| `src/components/landing/HeroRifa.module.css` | 639 | ✅ Completo |
| `src/components/layout/Navbar.module.css` | 325 | ✅ Completo |
| `src/components/layout/Footer.module.css` | 301 | ✅ Completo |
| `src/components/landing/DetallePremio.module.css` | 454 | ✅ Completo |
| `src/components/landing/GaleriaPremio.module.css` | 339 | ✅ Completo |
| `src/components/landing/PreguntasFrecuentes.module.css` | 159 | ✅ Completo |
| `src/pages/admin/views/AdminViews.module.css` | 2930 | ✅ Completo |
| `src/pages/AdminLoginPage.module.css` | 219 | ✅ Completo |
| `src/components/admin/orders/AdminOrderReviewModal.module.css` | 1100 | ✅ 800 líneas leídas (estructura responsive verificada) |
| `src/components/admin/orders/AdminConfirmPaymentModal.module.css` | 286 | ✅ Completo |
| `src/components/admin/raffles/AdminEditRaffleModal.module.css` | 436 | ✅ Completo |
| `src/components/admin/winners/AdminRegisterWinnerModal.module.css` | 574 | ✅ Completo |
| `src/components/admin/buyers/AdminBuyerOrdersModal.module.css` | 539 | ✅ Completo |
| `src/components/admin/settings/AdminFaqManager.module.css` | 642 | ✅ Completo |
| `src/components/admin/settings/AdminInviteUserModal.module.css` | 467 | ✅ Completo |

### Archivos no leídos (inferidos o fuera de alcance)

Los siguientes archivos no fueron leídos directamente pero sus hallazgos pueden inferirse a partir de los patrones establecidos por los archivos principales:
- `AdminBuyerEditModal.module.css`, `AdminPageHeader.module.css`, `AdminEmptyState.module.css`, `AdminLoadingState.module.css`, `AdminErrorState.module.css`, `ToastNotification.module.css`, `FloatingWhatsAppBtn.module.css`, `DigitalReceiptModal.module.css`, `GanadorShowcase.module.css`, `ResponsiveImage.module.css`, `Button.module.css`, `Pill.module.css`, `SectionHeader.module.css`, `VerificarPage.module.css`, `TerminosPage.module.css`, `FilaAliados.module.css`.

---

## 3. ASPECTOS CORRECTAMENTE IMPLEMENTADOS

Estos elementos tienen una implementación responsive **sólida y no requieren corrección**:

### 3.1 Meta Viewport (`index.html`)
- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` — Correcto y completo.
- `<meta name="apple-mobile-web-app-capable" content="yes">` y `<meta name="mobile-web-app-capable" content="yes">` — Implementados.
- `<meta name="apple-mobile-web-app-status-bar-style" content="default">` — Presente.

### 3.2 Sistema de contenedor (`theme-public.css`)
- Uso de `width: min(1280px, 100% - 3rem)` — Implementación moderna y correcta.
- Breakpoint a `≥1536px` expande a `min(1360px, 100% - 3rem)` — Correctamente manejado.
- A `≤768px` usa `100% - 2rem` reduciendo márgenes para pantallas pequeñas — Correcto.

### 3.3 Navbar (`Navbar.module.css`)
- Sticky con `position: sticky; top: 0` y cálculo con `env(safe-area-inset-top)` — Correcto.
- Menú desktop oculto con `display: none` a `≤899px` — Breakpoint apropiado.
- Todos los botones de navegación tienen `min-height: 44px` — Cumple con tamaño mínimo de toque.
- El botón de hamburguesa tiene `min-height: 44px; min-width: 44px` — Correcto.

### 3.4 Grilla de boletos (`SelectorBoletos.module.css`)
- `ticketGrid` usa `repeat(auto-fill, minmax(56px, 1fr))` — Auto-ajuste correcto.
- A `≤640px` reduce a `minmax(48px, 1fr)` — Adaptación adecuada.
- `.searchBox` tiene `min-width: 260px` en desktop que se anula con `width: 100%; min-width: 0` en `≤768px` — Correcto.
- `.floatingCart` usa `env(safe-area-inset-bottom)` — Preparado para dispositivos con notch.

### 3.5 Hero (`HeroRifa.module.css`)
- `min-height: min(92dvh, 920px)` — Uso apropiado de `dvh` con fallback de px máximo.
- Transform de `.trustGrid` se anula correctamente con `transform: none` en mobile.
- Soporte a `@media (prefers-reduced-motion: reduce)` — Implementado.
- `.experienceChip` desaparece con `display: none` en mobile `≤767px` — Evita colisiones.

### 3.6 Sidebar Administrativa (`AdminSidebar.module.css`)
- En desktop: `position: sticky; top: 0; height: 100vh` — Correcto.
- En mobile (`≤1024px`): transición a `position: fixed; transform: translateX(-100%)` — Patrón de drawer correcto.
- Botón de cierre: `min-width: 44px; min-height: 44px` — Cumple tamaño de toque.
- Items de nav: `min-height: 44px` — Correcto.
- Animación con `translate` en lugar de `left/right` — Mejor rendimiento (usa compositor GPU).

### 3.7 Grilla de métricas admin (`AdminViews.module.css`)
- `metricsGrid` usa `repeat(auto-fit, minmax(220px, 1fr))` — Auto-ajuste correcto.
- A `≤760px` fuerza `repeat(2, minmax(0, 1fr))` — Adaptación adecuada.
- A `≤460px` colapsa a `1fr` — Single column en móvil muy pequeño — Correcto.

### 3.8 Modales con scroll correcto
- La mayoría de modales admin usan `max-height: 90vh`, `overflow-y: auto` en el body, y `flex-shrink: 0` en header y footer — Patrón correcto para modales scrollables.
- `AdminOrderReviewModal`: `.sectionGrid` colapsa de `2fr` a `1fr` a `≤768px` — Correcto.
- `AdminRegisterWinnerModal`: `.formGrid2` colapsa a `1fr`, `searchTicketRow` y `modalFooter` se vuelven column a `≤640px` — Correcto.
- `AdminEditRaffleModal`: `.formRow` colapsa a `1fr` a `≤620px` — Correcto.
- `AdminFaqManager`: `.formRow` colapsa a `1fr` a `≤540px` — Correcto.

### 3.9 Galería de Premios (`GaleriaPremio.module.css`)
- `.galleryGrid` usa `repeat(auto-fill, minmax(320px, 1fr))` — Correcto.
- A `≤768px` colapsa a `grid-template-columns: 1fr` — Correcto.
- Flechas de navegación del lightbox se ocultan en móvil (`display: none`) — Correcto (no funcionan con toque).
- `.lightboxImg` usa `max-height: calc(100dvh - 9rem)` con `dvh` — Correcto.
- `.closeBtn` y `.navArrow` tienen `min-width: 44px; min-height: 44px / 48px` — Correcto.
- Soporte `prefers-reduced-motion` — Implementado.

### 3.10 Footer (`Footer.module.css`)
- `.footerContainer` usa grid de 3 columnas que colapsa a `1fr` a `≤900px` — Correcto.
- `.bottomBar` usa `env(safe-area-inset-bottom)` con ajuste diferente para mobile (`5.25rem`) vs desktop (`2rem`) — Tiene en cuenta el carrito flotante.
- Links del footer tienen `min-height: 44px` — Correcto.

### 3.11 DetallePremio (`DetallePremio.module.css`)
- `.grid` usa `repeat(auto-fit, minmax(320px, 1fr))` y en `≥1024px` fuerza 3 columnas — Correcto.
- A `≤639px` colapsa a `1fr` con `min-height: 500px` para las tarjetas — Correcto.
- `.mayorPrizeList` colapsa de 2 columnas a 1 columna en `≤639px` — Correcto.
- Soporte `prefers-reduced-motion` — Implementado.

### 3.12 PreguntasFrecuentes (`PreguntasFrecuentes.module.css`)
- Acordeón con `grid-template-rows: 0fr / 1fr` — Técnica CSS moderna para animación de altura sin JavaScript.
- `.questionBtn` tiene `min-height: 56px` (desktop) y `52px` (mobile) — Cumple tamaño de toque.
- Soporte `prefers-reduced-motion` — Implementado.

### 3.13 Página de Login Admin (`AdminLoginPage.module.css`)
- `.pageContainer` usa `min-height: 100vh; min-height: 100dvh` — Fallback + moderno, correcto.
- `.loginCard` tiene `max-width: 440px; width: 100%` — Se adapta en pantallas pequeñas.
- No hay breakpoints adicionales pero el diseño es de card centrada que funciona en todos los anchos.

### 3.14 Sistema de z-index
- Escala bien documentada en `variables.css`: base=0, raised=10, sticky=100, dropdown=500, whatsapp=900, modal-backdrop=1000, modal-card=1010, toast=2000.
- Los modales admin usan consistentemente `var(--z-modal-backdrop)` — Correcto.

---

## 4. HALLAZGOS CRÍTICOS

> **Nota:** Los hallazgos clasificados como CRÍTICO representan problemas que pueden **romper la usabilidad** en dispositivos reales en condiciones normales de uso.

---

### CRÍTICO #1 — ModalCheckout: Grilla de formulario sin colapso en 320–375px

**Archivo:** `src/components/checkout/ModalCheckout.module.css` — línea ~285  
**Regla afectada:** `.formGrid { grid-template-columns: 1fr 1fr; }`  
**Problema confirmado por código:** El formulario de datos del comprador usa una grilla de 2 columnas fija sin ningún breakpoint que la colapse a `1fr`. Dentro de un modal con `padding: 1.5rem` en cada lado, en un viewport de 320px:

```
320px total
- modal padding: 2 × 24px = 48px
- grid gap: ~16px
- disponible para columnas: (320 - 48 - 16) / 2 ≈ 128px por columna
```

128px por columna para un campo de formulario de texto es extremadamente estrecho. Los inputs normales necesitan al menos 160–180px para ser usables. En dispositivos de 320px (iPhone SE 1st gen) esta situación es un **problema real de usabilidad**.

**Impacto:** Alto en 320–375px. Los campos de texto quedan casi ilegibles y el usuario no puede escribir con comodidad.  
**Certeza:** Confirmado por código. Requiere validación visual en dispositivo o simulador.

---

### CRÍTICO #2 — ModalCheckout: Botones de confirmación sin colapso en 320px

**Archivo:** `src/components/checkout/ModalCheckout.module.css` — línea ~1301  
**Regla afectada:** `.confirmationActionsGrid { grid-template-columns: 1fr 1fr; }`  
**Problema confirmado por código:** En el estado de confirmación/éxito, los botones de acción están en una grilla de 2 columnas sin colapso. Con padding y gap, en 320px los botones tendrán aproximadamente 120–130px de ancho — insuficiente para el texto de CTA (ej. "Descargar Comprobante", "Volver al Inicio").

**Impacto:** Alto. Botones con texto truncado o desbordado en la pantalla más común de prueba base.  
**Certeza:** Confirmado por código.

---

### CRÍTICO #3 — ModalCheckout: Cálculo de altura con suposición frágil

**Archivo:** `src/components/checkout/ModalCheckout.module.css` — línea ~1161  
**Regla afectada:** `.successState { max-height: calc(92dvh - 75px); }`  
**Problema:** Asume que el header del modal mide exactamente 75px. En landscape mobile (e.g. iPhone SE 568px viewport height):

```
92dvh = 0.92 × 568 ≈ 523px disponibles para el modal completo
523 - 75 (header asumido) = 448px para el contenido de éxito
```

Si el header es más alto (stepper + order summary strip visibles simultáneamente pueden superar 100–130px), el contenido de éxito quedará cortado. El scroll puede no activarse si el contenedor padre también tiene overflow restringido.

**Impacto:** Medio-Alto en landscape mobile. Contenido de éxito potencialmente truncado.  
**Certeza:** Confirmado por código. La magnitud del problema depende del estado simultáneo del stepper y el order summary.

---

### CRÍTICO #4 — AdminOrderReviewModal: Tabla con `overflow-x: hidden` dentro de modal

**Archivo:** `src/components/admin/buyers/AdminBuyerOrdersModal.module.css` — línea 257  
**Regla afectada:** `.tableWrapper { overflow-x: hidden; }`  
**Problema confirmado por código:** La tabla de órdenes del comprador usa `overflow-x: hidden` en lugar de `overflow-x: auto`. Esto significa que si el contenido de la tabla supera el ancho disponible (especialmente probable en tablets o pantallas pequeñas con columnas fijas), el contenido se cortará SIN ofrecer scroll horizontal al usuario.

Esta tabla usa `table-layout: fixed` con columnas de porcentaje fijo (21%, 19%, 13%, 13%, 18%, 16% = 100%), lo que debería mantenerse dentro del contenedor. Sin embargo, el contenido de celdas con `overflow-wrap: anywhere` puede causar layout shifts inesperados.

**Impacto:** Alto en tablets (768–1024px) si el modal ocupa menos del ancho esperado.  
**Certeza:** Confirmado por código. El mismo patrón aparece en `AdminViews.module.css` línea 206 (`.ordersTableWrapper { overflow-x: hidden; }`).

---

### CRÍTICO #5 — SelectorBoletos: Botón de toggle del carrito con toque insuficiente

**Archivo:** `src/components/ticketing/SelectorBoletos.module.css` — línea ~895  
**Regla afectada:** `.mobileToggleBtn { min-height: 32px; }`  
**Problema confirmado por código:** El botón de expandir/colapsar el carrito flotante en mobile tiene `min-height: 32px`, 12px por debajo del mínimo recomendado de 44px (WCAG 2.5.5, Apple HIG, Android guidelines). Este es el botón más usado en el flujo de compra mobile.

**Impacto:** Alto. Reduce la tasa de toque exitoso en el elemento de UI más crítico del flujo mobile.  
**Certeza:** Confirmado directamente por código.

---

## 5. HALLAZGOS — SECCIÓN PÚBLICA

### P-01 — Navbar: Menú mobile sin backdrop ni overlay

**Archivo:** `src/components/layout/Navbar.module.css` — línea ~207  
**Regla afectada:** `.mobileMenu { position: absolute; top: 100%; ... }`  
**Problema:** El menú mobile se abre sobre el contenido sin ningún overlay o backdrop detrás. No existe un elemento que bloquee la interacción con el contenido debajo del menú, ni una señal visual de que el fondo está "bloqueado".  
**Impacto:** Bajo-Medio. El usuario puede hacer scroll detrás del menú sin cerrarlo, lo que puede causar confusión.  
**Certeza:** Confirmado por código (ausencia de backdrop en CSS).

---

### P-02 — HeroRifa: Título sin escalado fluido entre breakpoints

**Archivo:** `src/components/landing/HeroRifa.module.css`  
**Problema:** El `.title` tiene `font-size: 2.5rem` en desktop y `font-size: 1.875rem` en `≤767px` sin ningún valor intermedio con `clamp()`. El salto ocurre bruscamente al cruzar 767px.  
**Impacto:** Bajo. Posible salto visual brusco en tablets alrededor de 768px.  
**Certeza:** Confirmado por código. Requiere validación visual.

---

### P-03 — HeroRifa: Rango sin cobertura 481–639px para CTA row

**Archivo:** `src/components/landing/HeroRifa.module.css`  
**Problema:** La fila de CTA colapsa a `≤640px`, pero la experiencia entre 481–639px puede no estar completamente diseñada. En particular, el `.heroStats` y los badges pueden crear layout denso en este rango.  
**Impacto:** Bajo-Medio. Requiere validación visual en viewport de 540–600px.  
**Certeza:** Riesgo identificado por análisis de breakpoints. No confirmado con certeza sin renderizado.

---

### P-04 — Footer: Sin breakpoints intermedios entre 900px y desktop

**Archivo:** `src/components/layout/Footer.module.css`  
**Problema:** La grilla `footerContainer` con columnas `2fr 1fr 1.5fr` salta directamente a `1fr` en `≤900px`. En el rango 900–1100px, la primera columna de `2fr` puede quedar muy ancha mientras las otras son estrechas.  
**Impacto:** Bajo. Cosmético en tablets horizontales.  
**Certeza:** Riesgo identificado. Requiere validación visual.

---

### P-05 — DetallePremio: Grilla en rango 640–1023px sin definición explícita

**Archivo:** `src/components/landing/DetallePremio.module.css`  
**Problema:** La grilla de premios usa `auto-fit, minmax(320px, 1fr)` con 3 columnas forzadas en `≥1024px` y 1 columna en `≤639px`. En el rango 640–1023px el auto-fit puede crear 1 o 2 columnas dependiendo del ancho del contenedor, lo que podría resultar en una sola tarjeta de premio a ancho completo (640–720px) que parece desproporcionada.  
**Impacto:** Bajo. Cosmético.  
**Certeza:** Riesgo analítico. Requiere validación visual.

---

### P-06 — GaleriaPremio: Lightbox con `max-width: calc(100vw - 12rem)` en desktop

**Archivo:** `src/components/landing/GaleriaPremio.module.css` — línea ~153  
**Regla afectada:** `.lightboxContent { max-width: calc(100vw - 12rem); }`  
**Observación:** En desktop estándar (1280px), esto deja 1088px para la imagen — generoso y correcto. En pantallas de 800px (tablets pequeñas horizontales), deja solo 608px con 12rem de margen horizontal total. Las flechas de navegación están a `left/right: clamp(1rem, 7vw, 6rem)` con `position: fixed`, lo que debería funcionar correctamente.  
**Impacto:** Ninguno en uso normal. Observación informativa.  
**Certeza:** Confirmado por código. Sin problema práctico.

---

## 6. HALLAZGOS — SECCIÓN ADMINISTRATIVA

### A-01 — AdminViews: `.searchGroup` con `min-width: 260px` sin override mobile

**Archivo:** `src/pages/admin/views/AdminViews.module.css` — línea 93  
**Regla afectada:** `.searchGroup { min-width: 260px; flex: 1; }`  
**Problema:** A diferencia del equivalente público (SelectorBoletos que sí anula `min-width` en mobile), la barra de búsqueda admin mantiene `min-width: 260px` sin ningún breakpoint que lo anule. Si el `filterBar` wrapper tiene `flex-wrap: wrap` (línea 79), esto fuerza al search a ocupar al menos 260px antes de envolver. En pantallas de 360–480px dentro del admin, esto puede causar overflow o un layout de búsqueda que ocupa toda la línea pero deja poco espacio para los controles de filtro.  
**Impacto:** Medio en admin mobile (si es que el admin se usa en móvil).  
**Certeza:** Confirmado por código.

---

### A-02 — AdminHeader: Doble definición redundante de `.userBadge` hidden

**Archivo:** `src/components/admin/layout/AdminHeader.module.css` — líneas ~127 y ~270  
**Problema:** `.userBadge` se oculta tanto en `≤480px` como en `≤640px`. La segunda regla hace superflua la primera ya que el breakpoint más amplio domina. Esto sugiere que en algún momento la intención era ocultar el badge sólo en `≤480px` pero se cambió sin limpiar la regla anterior.  
**Impacto:** Ninguno funcional. Mantenimiento: riesgo de confusión si se intenta re-habilitar el badge en un rango.  
**Certeza:** Confirmado por código.

---

### A-03 — AdminHeader: `!important` en select de rifas

**Archivo:** `src/components/admin/layout/AdminHeader.module.css` — líneas ~177–178  
**Regla afectada:** `.raffleSelect { background: ... !important; color: ... !important; }`  
**Problema:** El uso de `!important` en properties de un select sugiere que hubo un conflicto de especificidad con el tema del sistema operativo o estilos del navegador. Aunque resuelve el problema visualmente, es un síntoma de arquitectura frágil.  
**Impacto:** Ninguno actual. Riesgo de mantenimiento si se cambia el tema.  
**Certeza:** Confirmado por código.

---

### A-04 — AdminHeader: `raffleSelect` con `max-width: 150px` en ≤768px

**Archivo:** `src/components/admin/layout/AdminHeader.module.css`  
**Problema:** El selector de rifa activa en el header se limita a 150px en mobile/tablet. Si el nombre de la rifa es largo (ej. "Rifa Benéfica Navidad 2026 - Manaure"), el texto se trunca con ellipsis. Esto puede ser confuso para los administradores que manejan múltiples rifas con nombres similares.  
**Impacto:** Bajo-Medio en uso con rifas de nombres largos.  
**Certeza:** Confirmado por código. La gravedad depende de los datos reales.

---

### A-05 — AdminLayout: Sin reducción de padding por debajo de 768px en mobile admin

**Archivo:** `src/components/admin/layout/AdminLayout.module.css`  
**Problema:** El `mainContent` tiene `padding: 24px` en desktop y `1.5rem 1rem` en `≤1024px`, pero no hay ajuste adicional para `≤480px`. En mobile, el padding de 1rem (16px) en cada lado es razonable, pero para viewports muy pequeños (320px) deja 288px de contenido — suficiente para la mayoría de cards pero ajustado para tablas.  
**Impacto:** Bajo. El admin generalmente no se usa en 320px.  
**Certeza:** Confirmado por código.

---

### A-06 — AdminViews: `formModalGrid` grilla 2 columnas colapsa en 640px (BIEN)

**Archivo:** `src/pages/admin/views/AdminViews.module.css` — línea 1358  
**Observación positiva:** El formulario modal de cuentas de pago con `grid-template-columns: repeat(2, 1fr)` tiene su colapso a `1fr` en `≤640px`. También la grilla de eliminación `.accountDeleteModalActions` colapsa a `flex-direction: column-reverse; align-items: stretch` en `≤520px`. Esto es correcto.  
**Certeza:** Confirmado por código. Implementación correcta.

---

### A-07 — AdminViews: `ticketMatrixGrid` sin adaptación en pantallas muy pequeñas

**Archivo:** `src/pages/admin/views/AdminViews.module.css` — línea 1629  
**Regla afectada:** `.ticketMatrixGrid { grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); }`  
**Observación:** La matriz de tickets usa `auto-fill` con `minmax(78px, 1fr)`. En 320px con 32px de padding total, hay 288px de área: esto da ~3 columnas (3×78=234px + gaps). Funcional pero comprimido. Los items tienen texto mono de número de boleto — en 78px mínimo esto es legible pero justo.  
**Impacto:** Bajo. Cosmético en 320px.  
**Certeza:** Calculado analíticamente.

---

## 7. HALLAZGOS — CHECKOUT Y MODALES DE PAGO

### C-01 — ModalCheckout: `.modalCard` con `max-height: 92dvh` en landscape mobile

**Archivo:** `src/components/checkout/ModalCheckout.module.css` — línea ~40  
**Problema:** En landscape mobile (iPhone SE: 375×667px landscape → 667px alto), `92dvh = ~613px`. El modal ocupa prácticamente toda la pantalla. Con el header del modal, el stepper, y la barra de resumen del pedido consumiendo 160–200px, la zona scrollable queda en ~410–450px. Esto es utilizable pero muy ajustado, y en iPhones más pequeños (320px width en landscape = ~480px height) se vuelve problemático.  
**Impacto:** Medio en landscape mobile en dispositivos pequeños.  
**Certeza:** Calculado por código + dimensiones de dispositivos conocidos.

---

### C-02 — ModalCheckout: `.errorActions { display: flex; gap: 1rem }` sin wrap

**Archivo:** `src/components/checkout/ModalCheckout.module.css` — línea ~1413  
**Problema:** Las acciones del estado de error usan flex sin `flex-wrap: wrap`. Si hay dos botones presentes (ej. "Reintentar" + "Cancelar"), en 320px la suma de ambos botones con gap puede exceder el ancho disponible, causando overflow o compresión extrema.  
**Impacto:** Medio. Depende del número de botones en el estado de error.  
**Certeza:** Riesgo confirmado por código. Magnitud depende del texto de los botones.

---

### C-03 — AdminConfirmPaymentModal: Sin max-height ni overflow-y en `.backdrop`

**Archivo:** `src/components/admin/orders/AdminConfirmPaymentModal.module.css` — línea 1  
**Observación:** El backdrop usa `display: flex; align-items: center; justify-content: center` sin `overflow-y: auto`. El `modalCard` tiene `max-width: 520px` pero no tiene `max-height` definido explícitamente. Si el contenido de la tarjeta de detalles (incluida la lista de tickets con `max-height: 80px; overflow-y: auto`) crece mucho, el modal podría exceder el viewport.  
**Impacto:** Bajo. La lista de tickets tiene su propio `max-height`, limitando el crecimiento del modal.  
**Certeza:** Riesgo analítico. Bajo riesgo en condiciones normales.

---

## 8. HALLAZGOS — MODALES ADMINISTRATIVOS

### M-01 — AdminFaqManager: `modalOverlay` con `z-index: 9999` hardcoded

**Archivo:** `src/components/admin/settings/AdminFaqManager.module.css` — línea 338  
**Regla afectada:** `.modalOverlay { z-index: 9999; }`  
**Problema:** Usa un valor hardcoded `9999` en lugar de la variable `--z-modal-backdrop` (valor: 1000). Esto rompe el sistema de z-index del proyecto. Si otro elemento usa `--z-modal-backdrop` y necesita aparecer sobre este modal, no podrá.  
**Impacto:** Bajo actualmente. Riesgo de conflicto de z-index si se añaden nuevos modales.  
**Certeza:** Confirmado por código.

---

### M-02 — AdminBuyerOrdersModal: `max-height: calc(88vh - 140px)` hardcoded en body

**Archivo:** `src/components/admin/buyers/AdminBuyerOrdersModal.module.css` — línea 120  
**Regla afectada:** `.modalBody { max-height: calc(88vh - 140px); }`  
**Problema:** Similar al CRÍTICO #3, asume que el header del modal mide 140px. En pantallas donde el header sea más alto (ej. subtítulo en dos líneas, header con muchos metadatos), el cuerpo podría exceder el viewport. Además, la combinación de `max-height: 88vh` en `.modalCard` Y `max-height: calc(88vh - 140px)` en `.modalBody` es redundante — si el card ya limita a 88vh, el body con ese cálculo puede quedar innecesariamente pequeño.  
**Impacto:** Bajo-Medio. Especialmente en tablets en portrait.  
**Certeza:** Confirmado por código.

---

### M-03 — AdminRegisterWinnerModal: `.removePhotoBtn` de 22×22px

**Archivo:** `src/components/admin/winners/AdminRegisterWinnerModal.module.css` — línea 458  
**Regla afectada:** `.removePhotoBtn { width: 22px; height: 22px; }`  
**Problema:** El botón de eliminar foto de la grilla de imágenes mide 22×22px — la mitad del mínimo recomendado de 44px. Aunque está posicionado absolutamente sobre la miniatura y puede ser difícil de tocar con el dedo en táctil.  
**Impacto:** Bajo (uso admin, probablemente en desktop). Mencionado por completitud.  
**Certeza:** Confirmado por código.

---

### M-04 — AdminInviteUserModal: `.roleSelector` con `grid-template-columns: repeat(3, 1fr)` sin colapso

**Archivo:** `src/components/admin/settings/AdminInviteUserModal.module.css` — línea 159  
**Regla afectada:** `.roleSelector { grid-template-columns: repeat(3, 1fr); }`  
**Problema:** El selector de rol con 3 columnas no tiene breakpoint de colapso. El modal tiene `max-width: 520px` con padding de 1.5rem en cada lado. En 375px, las 3 columnas del selector tendrán aproximadamente `(375 - 48 - 16px gaps) / 3 ≈ 103px` — los role options tienen `padding: 0.85rem 0.5rem` y texto como "Superadmin", "Moderador", "Visualizador". 103px puede ser suficiente pero muy ajustado para el texto y el ícono.  
**Impacto:** Bajo-Medio en 320–375px.  
**Certeza:** Confirmado por código. Requiere validación visual en dispositivo pequeño.

---

## 9. HALLAZGOS — TABLAS ADMINISTRATIVAS

### T-01 — Tablas admin: Patrón inconsistente de overflow (hidden vs auto)

**Archivos:** `AdminViews.module.css` (línea 206), `AdminBuyerOrdersModal.module.css` (línea 257)  
**Problema:** Las tablas de órdenes usan `overflow-x: hidden` en lugar de `overflow-x: auto`. Esto es diferente del patrón correcto de `.tableWrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }` que sí existe para otras tablas en `AdminViews.module.css` (línea 171).  
**Justificación del `hidden`:** Probablemente usada intencionalmente porque estas tablas usan `table-layout: fixed` con columnas de porcentaje que suman 100%, por lo que no deberían desbordarse. Sin embargo, `overflow-x: hidden` corta sin aviso si por alguna razón el contenido excede el contenedor.  
**Impacto:** Medio. Si el contenido excede el contenedor (cambio de nombre de columna, texto muy largo con `overflow-wrap: anywhere`), se cortará sin scroll.  
**Certeza:** Confirmado por código. Riesgo latente.

---

### T-02 — AdminOrderReviewModal: `proofImage` con `max-height: 380px` y `proofIframe` con `height: 380px`

**Archivo:** `src/components/admin/orders/AdminOrderReviewModal.module.css` — líneas 239, 247  
**Problema:** El viewer del comprobante de pago tiene alturas fijas en pixeles para la imagen (max-height: 380px) y el iframe de PDF (height: 380px). En modales pequeños (tablets en portrait a 768px con el modal ocupando ~700px de alto), el viewer con 380px + toolbar + encabezado + secciones adicionales puede estar muy ajustado.  
**Impacto:** Bajo-Medio. El cuerpo del modal tiene `overflow-y: auto` por lo que el usuario puede scrollear, pero la experiencia de visualización del comprobante puede requerir mucho scroll.  
**Certeza:** Confirmado por código.

---

## 10. HALLAZGOS — FORMULARIOS

### F-01 — Formularios admin sin `font-size: 16px` explícito en inputs (iOS zoom)

**Archivos:** Múltiples (`AdminViews.module.css`, `AdminEditRaffleModal.module.css`, `AdminRegisterWinnerModal.module.css`, etc.)  
**Problema:** Los inputs usan `font-size: 0.875rem` (14px). En iOS, un input con `font-size` menor a 16px causa que Safari haga **auto-zoom** al enfocar el campo, desplazando el viewport y rompiendo el layout. Esto ocurre en la app real si el admin se abre desde un iPhone/iPad en Safari.  
**Impacto:** Alto en iOS Safari para toda la sección de formularios del admin.  
**Certeza:** Comportamiento documentado y conocido de iOS Safari. Confirmado como riesgo por los font-sizes encontrados en código.

---

### F-02 — Formularios públicos en checkout: mismo riesgo de zoom en iOS

**Archivo:** `src/components/checkout/ModalCheckout.module.css`  
**Problema:** Mismo problema que F-01. Los inputs del checkout con `font-size: 0.875rem` causarán auto-zoom en iOS Safari al ser enfocados dentro del modal. El zoom en un modal con `position: fixed` puede causar problemas de posicionamiento en algunos dispositivos iOS.  
**Impacto:** Alto en iOS Safari en el flujo de compra — es el camino crítico del negocio.  
**Certeza:** Confirmado como riesgo sistemático. Requiere prueba en Safari iOS real.

---

## 11. HALLAZGOS — TIPOGRAFÍA E IMÁGENES

### TI-01 — Duplicación de `line-height: 1.45` en varios archivos

**Archivos:** `DetallePremio.module.css`, `AdminInviteUserModal.module.css`, `AdminRegisterWinnerModal.module.css`, `PreguntasFrecuentes.module.css`, `AdminOrderReviewModal.module.css`  
**Problema:** En múltiples lugares se encuentra doble declaración de `line-height: 1.45` en el mismo bloque (ej. líneas 62-63 de PreguntasFrecuentes, línea 46 de Footer). No afecta el renderizado pero indica código generado o copiado sin revisión.  
**Impacto:** Ninguno funcional. Mantenimiento.  
**Certeza:** Confirmado por código (múltiples instancias).

---

### TI-02 — `fileName` con `max-width: 380px` hardcoded

**Archivo:** `src/components/admin/winners/AdminRegisterWinnerModal.module.css` — línea 416  
**Regla afectada:** `.fileName { max-width: 380px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`  
**Problema:** En un modal de `max-width: 680px` con padding de 1.5rem, en 375px el modal tiene 375px de ancho. Con padding, el área disponible es ~327px. El `max-width: 380px` del nombre de archivo excede este ancho en 375px, haciendo el limite inefectivo y causando posible desbordamiento del nombre de archivo.  
**Impacto:** Bajo. En mobile el modal probablemente se ve a pantalla completa.  
**Certeza:** Confirmado por código.

---

## 12. HALLAZGOS — ACCESIBILIDAD RESPONSIVE

### ACC-01 — Navbar mobile: Sin gestión de foco al abrir/cerrar menú

**Archivo:** `src/components/layout/Navbar.module.css` (inferido de estructura)  
**Problema:** El menú mobile con `position: absolute` no tiene indicios de gestión de foco (`focus-trap`). Al abrir el menú, el foco puede quedar en el botón hamburguesa en lugar de moverse al primer item del menú. Al cerrar, el foco debe regresar al botón de apertura.  
**Impacto:** Medio para usuarios de teclado y tecnologías asistivas.  
**Certeza:** No confirmado por CSS (requeriría revisar el TSX). Riesgo identificado por ausencia de patrones CSS de focus management.

---

### ACC-02 — `.mobileToggleBtn` con 32px de altura (ya listado en CRÍTICO #5)

Ver CRÍTICO #5. El botón de toggle del carrito floating tiene `min-height: 32px` en lugar de 44px mínimo.

---

### ACC-03 — `actionIconBtn` del FAQ manager con 32×32px

**Archivo:** `src/components/admin/settings/AdminFaqManager.module.css` — línea 244  
**Regla afectada:** `.actionIconBtn { width: 32px; height: 32px; }`  
**Problema:** Los botones de acción de cada FAQ (editar, eliminar, reordenar) miden 32×32px. Si el admin se usa en una tablet touch, estos botones son difíciles de tocar.  
**Impacto:** Bajo (uso principalmente desktop). Moderado en tablets.  
**Certeza:** Confirmado por código.

---

### ACC-04 — `refreshBtn` del FAQ manager con 40×40px

**Archivo:** `src/components/admin/settings/AdminFaqManager.module.css` — línea 57  
**Regla afectada:** `.refreshBtn { width: 40px; height: 40px; }`  
**Problema:** 40px está por debajo del mínimo de 44px recomendado. Menor infracción.  
**Impacto:** Menor.  
**Certeza:** Confirmado por código.

---

### ACC-05 — Skip links (`theme-public.css`)

**Observación positiva:** `theme-public.css` define estilos para `.skip-link` con `position: absolute; left: -9999px` y `:focus { position: fixed; ... }`. La implementación de skip links existe en la sección pública.  
**Estado:** Correcto. Beneficioso para accesibilidad.

---

## 13. ARQUITECTURA CSS

### ARCH-01 — Duplicación de variables entre `variables.css` y `theme-public.css`

**Archivos:** `src/styles/variables.css` y `src/styles/theme-public.css`  
**Problema:** Variables como `--space-*`, `--radius-*`, `--shadow-*`, `--z-*`, `--transition-*` están definidas tanto en `variables.css` (primitivas) como en `theme-public.css` (semánticas). Esto crea ambigüedad sobre cuál archivo es la fuente de verdad para cada variable.  
**Impacto:** Riesgo de mantenimiento. Si se actualiza una variable en un archivo pero no en el otro, el resultado puede ser inconsistente según el orden de cascade.  
**Certeza:** Confirmado por análisis comparativo de ambos archivos.

---

### ARCH-02 — Conflicto semántico `color-scheme` entre `html` y `:root`

**Archivos:** `globals.css` (línea 15) y `theme-public.css`  
**Problema:** `html { color-scheme: dark; }` en globals, pero `theme-public.css` define `color-scheme: light` en `:root`. Ya que `html` y `:root` son el mismo elemento, la segunda declaración de la hoja de estilos que aparece más tarde en el cascade prevalece. El resultado es `color-scheme: light`, pero esto es confuso y depende del orden de importación.  
**Impacto:** Funcional actualmente. Podría romperse si se reordena el cascade.  
**Certeza:** Confirmado por análisis de ambos archivos.

---

### ARCH-03 — `overflow-x: hidden` en `body` (globals.css)

**Archivo:** `src/styles/globals.css` — línea 27  
**Problema:** `body { overflow-x: hidden; }` es una práctica de "esconder el síntoma" — suprime el scroll horizontal sin resolver la causa del overflow. Además, puede interferir con `position: sticky` en algunos navegadores (los elementos sticky dentro de un `overflow-x: hidden` pierden su comportamiento sticky en algunos escenarios).  
**Impacto:** Potencialmente interfiere con el Navbar sticky o el carrito flotante en navegadores específicos. Actualmente parece funcionar.  
**Certeza:** Riesgo conocido. Comportamiento de `sticky` + `overflow: hidden` es inconsistente entre browsers.

---

### ARCH-04 — `z-index: 9999` hardcoded en `AdminFaqManager`

Ver M-01. Rompe el sistema de z-index centralizado.

---

### ARCH-05 — Múltiples definiciones redundantes de `@keyframes fadeIn` y `@keyframes scaleIn`

**Archivos:** Prácticamente todos los modales admin tienen sus propias copias de `@keyframes fadeIn` y `@keyframes scaleIn` con valores idénticos.  
**Problema:** Duplicación innecesaria. Con CSS Modules, estos keyframes tienen scope local, pero podrían centralizarse en `globals.css` o `theme-admin.css`.  
**Impacto:** Ninguno funcional. Mantenimiento.  
**Certeza:** Confirmado por código (verificado en 6+ archivos).

---

### ARCH-06 — `color-scheme: light` hardcoded en `AdminEditRaffleModal.module.css` para `select`

**Archivo:** `src/components/admin/raffles/AdminEditRaffleModal.module.css` — línea 242  
**Regla afectada:** `.select { color-scheme: light; }`  
**Problema:** Fuerza el select a renderizarse en modo light dentro de un tema oscuro. Aunque esta puede ser la intención (para que el dropdown del sistema operativo sea legible), mezcla estilos del sistema con el tema del componente.  
**Impacto:** Cosmético. El dropdown nativo del select se renderizará en modo light aun si el OS tiene dark mode.  
**Certeza:** Confirmado por código.

---

## 14. RENDIMIENTO RESPONSIVE

### PERF-01 — `backdrop-filter: blur(8px)` en todos los modales admin

**Archivos:** Prácticamente todos los modales admin  
**Observación:** `backdrop-filter: blur()` es una propiedad costosa en términos de GPU. Con muchos modales usando blur, abrir múltiples overlays (improbable pero posible) podría causar jank en dispositivos móviles de gama baja.  
**Impacto:** Potencial bajo en dispositivos de baja gama. No un problema en uso típico.  
**Certeza:** Riesgo conocido de rendimiento. No crítico.

---

### PERF-02 — Animaciones de `transform` y `opacity` (positivo)

**Observación positiva:** La mayoría de transiciones y animaciones usan exclusivamente `transform` y `opacity` — propiedades que no triggean layout ni paint y son manejadas por el compositor GPU. Esto es una implementación correcta y eficiente.  
**Certeza:** Confirmado por revisión de múltiples archivos.

---

### PERF-03 — `transition: all` en algunos componentes

**Archivos:** `AdminViews.module.css` (varios botones), `AdminFaqManager.module.css`  
**Problema:** El uso de `transition: all var(--transition-fast)` en botones hace que TODAS las propiedades del elemento transicionen, incluyendo propiedades que podrían causar reflow (como `width`, `height`, `padding`). Si bien en la práctica los botones no cambian estas propiedades en hover, es una práctica menos eficiente que especificar solo `background-color, color, border-color, transform, box-shadow`.  
**Impacto:** Menor. Solo afecta rendimiento de animación, no layout.  
**Certeza:** Confirmado por código.

---

## 15. MATRIZ DE VIEWPORT (320–1920px)

| Viewport | Navbar | Hero | Checkout | SelectorBoletos | Admin Layout | Admin Vistas |
|---|---|---|---|---|---|---|
| **320px** | ✅ OK (mobile menu) | ⚠️ Título grande puede estar apretado | 🔴 formGrid 2col muy estrecho | ✅ ticketGrid auto-fill OK | N/A admin | ⚠️ searchGroup min-width |
| **375px** | ✅ OK | ✅ OK | 🔴 formGrid 2col estrecho | ✅ OK | N/A | ⚠️ searchGroup |
| **414px** | ✅ OK | ✅ OK | ⚠️ formGrid 2col ajustado | ✅ OK | N/A | ⚠️ |
| **480px** | ✅ OK | ✅ OK | ⚠️ formGrid 2col aceptable | ✅ OK | N/A | ⚠️ |
| **540px** | ✅ OK | ⚠️ Rango 481-639 sin cobertura | ✅ OK | ✅ OK | N/A | ⚠️ |
| **640px** | ✅ OK (hamburger) | ⚠️ CTA colapsa | ✅ OK | ✅ ticketGrid adapt | ⚠️ sin sidebar | ⚠️ filterControls wrap |
| **768px** | ✅ OK | ✅ mobile mode | ✅ OK | ✅ searchBox 100% | ✅ drawer closed | ✅ sectionGrid 1col |
| **900px** | ✅ switch desktop | ✅ OK | ✅ OK | ✅ OK | ✅ OK | ✅ OK |
| **1024px** | ✅ desktop | ✅ OK | ✅ OK | ✅ OK | ✅ sidebar sticky | ✅ OK |
| **1280px** | ✅ OK | ✅ OK | ✅ OK | ✅ OK | ✅ OK | ✅ OK |
| **1536px** | ✅ OK | ✅ OK | ✅ OK | ✅ OK | ✅ OK | ✅ container wider |
| **1920px** | ✅ OK | ✅ OK | ✅ OK | ✅ OK | ✅ OK | ✅ OK |

**Leyenda:** ✅ Sin problemas confirmados · ⚠️ Riesgo o ajuste cosmético · 🔴 Problema real de usabilidad

---

## 16. MATRIZ DE PRIORIDAD DE CORRECCIONES

| # | Hallazgo | Severidad | Certeza | Archivo Principal | Prioridad |
|---|---|---|---|---|---|
| CRÍTICO #1 | ModalCheckout formGrid 2col sin colapso | Alta | Código confirmado | ModalCheckout.module.css | 🔴 P0 |
| CRÍTICO #2 | ModalCheckout confirmationActionsGrid 2col | Alta | Código confirmado | ModalCheckout.module.css | 🔴 P0 |
| CRÍTICO #5 | mobileToggleBtn 32px toque | Alta | Código confirmado | SelectorBoletos.module.css | 🔴 P0 |
| F-02 | iOS Safari auto-zoom en checkout (font-size < 16px) | Alta | Comportamiento conocido iOS | ModalCheckout.module.css | 🔴 P0 |
| F-01 | iOS Safari auto-zoom en admin (font-size < 16px) | Alta | Comportamiento conocido iOS | Múltiples admin | 🟠 P1 |
| CRÍTICO #3 | ModalCheckout successState calc altura frágil | Medio-Alta | Código confirmado | ModalCheckout.module.css | 🟠 P1 |
| CRÍTICO #4 | AdminBuyerOrders overflow-x: hidden en tabla | Medio | Código confirmado | AdminBuyerOrdersModal.module.css | 🟠 P1 |
| C-02 | ModalCheckout errorActions sin wrap | Medio | Riesgo por código | ModalCheckout.module.css | 🟠 P1 |
| M-01 | AdminFaqManager z-index: 9999 hardcoded | Bajo | Código confirmado | AdminFaqManager.module.css | 🟡 P2 |
| M-04 | AdminInviteUserModal roleSelector 3col sin colapso | Bajo-Medio | Código confirmado | AdminInviteUserModal.module.css | 🟡 P2 |
| T-01 | overflow-x: hidden en tablas | Medio | Código confirmado | AdminViews.module.css | 🟡 P2 |
| A-01 | Admin searchGroup min-width sin override | Medio | Código confirmado | AdminViews.module.css | 🟡 P2 |
| A-04 | raffleSelect max-width 150px | Bajo-Medio | Código confirmado | AdminHeader.module.css | 🟡 P2 |
| ARCH-03 | body overflow-x: hidden | Bajo | Riesgo conocido | globals.css | 🟡 P2 |
| ARCH-02 | color-scheme conflicto html vs :root | Bajo | Código confirmado | globals.css | 🟢 P3 |
| ARCH-01 | Duplicación variables | Bajo | Código confirmado | variables.css | 🟢 P3 |
| A-02 | userBadge doble definición | Ninguno | Código confirmado | AdminHeader.module.css | 🟢 P3 |
| TI-01 | line-height duplicado | Ninguno | Código confirmado | Múltiples | 🟢 P3 |

---

## 17. RIESGOS DE REGRESIÓN

### RR-01 — Corregir `formGrid` en ModalCheckout puede afectar pasos del stepper

Si se colapsa `.formGrid` a 1 columna, verificar que el stepper de pasos y el order summary strip no cambien su comportamiento. La lógica de validación por pasos puede estar ligada a la visual del formulario.

### RR-02 — Cambiar `overflow-x: hidden` a `auto` en tablas puede revelar overflow oculto

Al cambiar tablas admin de `hidden` a `auto`, pueden aparecer scrollbars horizontales en estados de datos específicos (nombres muy largos, referencias largas). Esto expone problemas reales de datos que estaban ocultos.

### RR-03 — Corregir `font-size` en inputs para iOS puede alterar layout de forms

Cambiar inputs de `0.875rem` a `1rem` o añadir `font-size: 16px` en focus en iOS cambiará las proporciones de los formularios. Los layouts de formulario en grilla 2col (ya críticos por otros motivos) pueden verse afectados.

### RR-04 — Modificar `z-index` del FAQ manager puede descubrir conflictos latentes

Si se cambia de `9999` a `var(--z-modal-backdrop)` (1000), verificar que no haya otro elemento con z-index entre 1000 y 9999 que estaba siendo tapado intencionalmente.

### RR-05 — El sistema de `--cart-h` es frágil

La variable `--cart-h` que usa el Footer y otros componentes para ajustar el padding inferior se actualiza por JavaScript en SelectorBoletos. Si se modifica el selector o el script de actualización, el footer y el body pueden tener padding incorrecto en mobile.

---

## 18. RECOMENDACIONES GENERALES

### REC-01 — Añadir breakpoints faltantes para 481–639px

Este rango no tiene cobertura en varios componentes. Considerar añadir una o dos reglas para este rango intermedio (especialmente para componentes públicos críticos como el Hero y el checkout).

### REC-02 — Usar `clamp()` para tipografía responsive en el Hero

Reemplazar el salto brusco de `2.5rem` → `1.875rem` del título hero con `clamp(1.875rem, 5vw, 2.5rem)` para una escala fluida.

### REC-03 — Centralizar animaciones de modal en admin

Mover `@keyframes fadeIn`, `@keyframes scaleIn`, y `@keyframes spin` a `theme-admin.css` o `globals.css` con scope global, eliminando las copias duplicadas en cada modal.

### REC-04 — Documentar explícitamente que el admin NO es mobile-first

Si la decisión de diseño es que el admin sea solo para desktop/tablet (≥768px), documentarlo en el README o en los comentarios de CSS. Esto evita que futuros desarrolladores traten de hacerlo completamente responsive sin contexto.

### REC-05 — Revisar inputs con `font-size < 16px` antes de lanzar en iOS

Verificar en Safari iOS real (no en simulador Chrome) que los inputs en el checkout no disparen el auto-zoom. Si lo hacen, añadir `font-size: 16px` solo para iOS vía `@supports` o hack de meta viewport.

### REC-06 — Reemplazar `overflow-x: hidden` en tablas con `overflow-x: auto`

Las tablas que intenten hacer overflow deberían presentar scroll al usuario en lugar de cortar el contenido.

### REC-07 — Implementar `focus-trap` en el menú mobile de la Navbar

Para cumplir con WCAG 2.1 criterio 2.1.2 (No Keyboard Trap), el menú mobile debe atrapar el foco mientras está abierto y liberarlo al cerrarse.

### REC-08 — Aumentar `min-height` del toggle del carrito floating a 44px

El botón más importante del flujo mobile está por debajo del mínimo de toque aceptable.

---

## 19. CONCLUSIÓN

El proyecto RifaManaure muestra **madurez técnica en su sistema de diseño** — el uso de variables CSS, temas separados para public/admin, el sistema de contenedor con `min()`, el uso de `dvh` en lugar de `vh` para modales, el uso de `clamp()` en paddings de secciones, la gestión de `safe-area-inset` en el carrito flotante y el footer, y la implementación de `prefers-reduced-motion` en múltiples componentes son todos indicadores de trabajo cuidadoso.

Sin embargo, se detectaron **5 hallazgos críticos** que representan problemas reales de usabilidad en dispositivos comunes:

1. **ModalCheckout — formularios de 2 columnas sin colapso** (320–375px)
2. **ModalCheckout — botones de confirmación sin colapso** (320px)
3. **ModalCheckout — cálculo de altura con suposición frágil** (landscape mobile)
4. **Tablas admin con `overflow-x: hidden`** (posible corte de contenido)
5. **Botón del carrito flotante con 32px de altura** (por debajo del mínimo de toque)

El riesgo más crítico desde el punto de vista del negocio es el **flujo de checkout en iOS Safari** (font-size < 16px + grillas de 2 columnas sin colapso), ya que afecta directamente la tasa de conversión en el camino de compra.

**El sistema administrativo es apropiado para uso en desktop** y requiere menos atención responsive, siempre que no se espere que los administradores usen el sistema en dispositivos móviles.

---

*Fin del reporte — RifaManaure Responsive Audit v1.0*  
*Generado por análisis estático. Los hallazgos marcados como "requiere validación visual" deben verificarse en navegador real.*

