# Auditoría — Lote 9: Componentes comunes, layout público y estilos

> Fecha: 2026-09-17 | Estado: ✅ Completo

---

## 78. `src/components/common/ErrorBoundary.tsx`

### A. Qué hace
Capturador de errores de renderizado en React (Class Component). Presenta una interfaz de recuperación accesible con botón de recarga (`window.location.reload()`) o un componente `fallback` opcional.

### B. Hallazgos
- **Diseño resiliente:** Utiliza estilos inline intencionales para garantizar que la pantalla de error se renderice incluso si hay fallos al cargar las hojas de estilos CSS externas. ✅
- **Logging en consola:** Registra `error` y `errorInfo` en `componentDidCatch`. ✅
- **Estado limpio:** `handleReset` resetea el estado y recarga la ventana. ✅

---

## 79. `src/components/common/FloatingWhatsAppBtn.tsx` & 80. `FloatingWhatsAppBtn.module.css`

### A. Qué hace
Botón flotante fijo (`z-index: 950`) en la esquina inferior derecha para contacto y soporte directo por WhatsApp.

### B. Hallazgos
- **Integración dinámica:** Consume el número de soporte desde el hook `useSystemSettings()`, con fallback seguro a `'573001234567'`. ✅
- **Accesibilidad y UX:** Cuenta con `aria-label`, `title`, tooltip flotante en hover y animación de onda de pulso (`pulseRing`). En pantallas móviles (`<= 640px`) oculta el tooltip y reduce el tamaño de 58px a 52px. ✅

---

## 81. `src/components/common/PageLoadingFallback.tsx`

### A. Qué hace
Indicador visual de carga para transiciones de rutas con `React.lazy` y `Suspense`.

### B. Hallazgos
- **Animación ligera:** Spinner con doble gradiente de marca (`#f59e0b` y `#10b981`) y mensaje parametrizable (`message`). ✅

---

## 82. `src/components/common/ScrollToHashElement.tsx`

### A. Qué hace
Controlador de navegación y scroll automático hacia anclas (`#seccion`) o al tope de la página (`top: 0`) al cambiar de ruta.

### B. Hallazgos
- **Manejo de componentes Lazy:** Implementa un mecanismo de reintento inteligente (hasta 15 intentos cada 100ms) para esperar a que los componentes cargados dinámicamente (`React.lazy`) se monten en el DOM antes de disparar `scrollIntoView({ behavior: 'smooth' })`. ✅

---

## 83. `src/components/common/ToastNotification.tsx` & 84. `ToastNotification.module.css`

### A. Qué hace
Componente flotante de notificaciones tipo Toast con 4 variantes: `warning`, `error`, `success`, `info`.

### B. Hallazgos
- **Accesibilidad:** Marcado con `role="alert"` y `aria-live="assertive"`. ✅
- **Temporizador y barra de progreso:** Temporizador de auto-cierre con barra de progreso animada CSS (`progressAnim`) sincronizada con `duration` (default 4500ms). ✅
- **Diseño:** Glassmorphism con `backdrop-filter: blur(16px)` y paleta diferenciada por tipo de notificación. ✅

---

## 85. `src/components/layout/Footer.tsx` & 86. `Footer.module.css`

### A. Qué hace
Pie de página institucional del sitio público con 3 columnas (Marca/Propósito, Navegación, Legalidad/Soporte) y barra inferior de derechos y garantías.

### B. Hallazgos
- **Navegación fluida por anclas:** `handleSectionClick` detecta si el usuario ya está en la ruta raíz (`/`) para hacer scroll suave directamente sin recargar, o usa `navigate('/#seccion')` si está en otra página (`/verificar`, `/terminos`). ✅
- **Parámetros dinámicos:** Enlaces de WhatsApp y correo de soporte conectados a `useSystemSettings()`. ✅
- **Optimización de imágenes:** Logo principal con dimensiones explícitas `width={240}` y `height={160}` para prevenir saltos de maquetación (CLS). ✅

---

## 87. `src/components/layout/Navbar.tsx` & 88. `Navbar.module.css`

### A. Qué hace
Barra de navegación principal fija (`sticky`) con efecto translúcido, menú de escritorio, botón de llamada a la acción (CTA) para compra de boletos y menú móvil desplegable.

### B. Hallazgos
- **Scroll listener optimizado:** Listener pasivo `{ passive: true }` para conmutar clase `.scrolled` al sobrepasar 20px de scroll vertical. ✅
- **Diseño responsive:** Menú hamburguesa accesible que conmuta íconos `Menu` y `X`, cerrándose automáticamente al seleccionar cualquier enlace. ✅
- **CTA destacado:** Botón "Comprar Boletos" con gradiente dorado y resplandor (`box-shadow: var(--shadow-glow)`). ✅

---

## 89. `src/components/auth/ProtectedRoute.tsx` & 90. `ProtectedRoute.module.css`

### A. Qué hace
Guardián de rutas protegidas para el panel de administración (`/admin/*`).

### B. Hallazgos
- **Validación en 3 etapas:**
  1. Si `isLoading === true`: Renderiza pantalla de verificación de permisos.
  2. Si `!user`: Redirige a `/admin/login` preservando la ruta previa en `state.from`.
  3. Si `user && !isAdmin`: Muestra pantalla completa de "Acceso Denegado" con el correo del usuario, botón de cierre de sesión (`signOut`) y enlace al inicio público.
  4. Si `user && isAdmin`: Permite el paso al componente hijo (`children`). ✅
- **Seguridad en frontend:** Evita flashes de contenido no autorizado antes de confirmar el rol con Supabase. ✅

---

## 91. `src/styles/globals.css` & 92. `src/styles/variables.css`

### A. Qué hace
- `globals.css`: Reset CSS moderno (`box-sizing: border-box`, `color-scheme: dark`, fuentes, contenedor responsivo y clase `.visually-hidden`).
- `variables.css`: Sistema de diseño completo (Design Tokens):
  - Paleta de marca (`--color-brand-primary: #0f382c`, `--color-brand-accent: #f59e0b`).
  - Tokens de estados de boletos (`available`, `selected`, `reserved`, `sold`).
  - Superficies glassmorphism, sombras de resplandor, tipografía (`Inter` y `Outfit`) y radios de borde.

### B. Hallazgos
- **Consistencia visual:** Variables CSS bien estructuradas y respetadas en los módulos CSS del proyecto. ✅

---

## Resumen del Lote 9

| Archivo | Estado | Severidad | Nota |
|---------|--------|-----------|------|
| `ErrorBoundary.tsx` | ✅ OK | — | Robusto con estilos inline y fallback |
| `FloatingWhatsAppBtn.tsx` + `.css` | ✅ OK | — | Accesible, responsivo y dinámico |
| `PageLoadingFallback.tsx` | ✅ OK | — | Ligero y visualmente integrado |
| `ScrollToHashElement.tsx` | ✅ OK | — | Manejo de anclas con reintentos para lazy routes |
| `ToastNotification.tsx` + `.css` | ✅ OK | — | Accesible con barra de progreso y glassmorphism |
| `Footer.tsx` + `.css` | ✅ OK | — | Responsive, enlaces dinámicos y scroll suave |
| `Navbar.tsx` + `.css` | ✅ OK | — | Sticky glassmorphism, menú móvil y CTA destacado |
| `ProtectedRoute.tsx` + `.css` | ✅ OK | — | Flujo completo de autorización y pantalla de acceso denegado |
| `globals.css` + `variables.css` | ✅ OK | — | Tokens de diseño completos y consistentes |

### Calidad general del Lote 9: 🟢 Excelente
Todos los componentes comunes y de layout demuestran atención a la accesibilidad (atributos ARIA, roles, etiquetas), rendimiento (CLS, passive listeners) y experiencia de usuario (scroll suave, glassmorphism coherente).

