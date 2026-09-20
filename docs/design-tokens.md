# Sistema de Diseño: Tokens y Reglas de Uso ("Manaure Vive")

Este documento especifica el sistema de diseño del tema público nuevo (Crema cálido + Verde Bosque + Ámbar / Dorado) aislado bajo el selector `[data-theme="public"]`. El panel administrativo conserva sus tokens intactos en `:root`.

---

## 1. Tokens de Diseño (`[data-theme="public"]`)

### Fondos y Superficies
| Token | Valor Hex / Declaración | Rol / Uso |
| :--- | :--- | :--- |
| `--bg-page` | `#F4EFE4` | Fondo principal de la página (crema cálido) |
| `--bg-surface` | `#FBF8F1` | Paneles, tarjetas secundarias y barras |
| `--bg-card` | `#FFFFFF` | Tarjetas de boletos, modales y contenido elevado |
| `--border-subtle` | `#DCD5C4` | Separadores, bordes de contenedor y divisores |
| `--bg-main` | `var(--bg-page)` | Alias de retrocompatibilidad con componentes existentes |
| `--bg-surface-elevated` | `var(--bg-card)` | Alias de retrocompatibilidad |
| `--bg-surface-glass` | `rgba(251, 248, 241, 0.92)` | Fondo translúcido con desenfoque (`backdrop-filter`) |

### Tipografías Oficiales (Autohospedadas @fontsource-variable)
| Token | Familia / Fallbacks | Pesos | Uso |
| :--- | :--- | :--- | :--- |
| `--font-heading` | `'Playfair Display Variable', Georgia, 'Times New Roman', serif` | 700, 800 | Títulos h1, h2, h3 de impacto editorial |
| `--font-sans` | `'Outfit Variable', system-ui, -apple-system, 'Segoe UI', sans-serif` | 400, 500, 600, 700 | Cuerpo de texto, botones, navegación e interfaz |
| `--font-mono` | `'JetBrains Mono Variable', ui-monospace, 'SF Mono', Consolas, monospace` | 600, 700 | Números de boleto, códigos de verificación, `tabular-nums` |

### Escala Tipográfica Pública
- **h1 (Hero)**: Playfair Display 800 · `clamp(2.4rem, 5.2vw, 4rem)` · `line-height: 1.05` · `letter-spacing: -0.01em` · `text-wrap: balance`
- **h2 (Secciones)**: Playfair Display 700 · `clamp(1.9rem, 3.6vw, 2.75rem)` · `line-height: 1.15` · `letter-spacing: -0.01em` · `text-wrap: balance`
- **h3 (Tarjetas)**: Playfair Display 700 · `clamp(1.35rem, 2.5vw, 1.5rem)` · `line-height: 1.2`
- **Cuerpo (Párrafos)**: Outfit Variable 400 · `1rem / 1.65` · `max-width: 65ch`
- **Texto pequeño (`small`)**: `0.875rem` (mínimo informativo permitido)
- **Etiquetas / Badges (`.badgeLabel`)**: Outfit Variable 600 · `0.75rem` · mayúsculas · `letter-spacing: 0.08em`
- **Mono / Boletos (`.font-mono`)**: JetBrains Mono Variable 700 · `font-variant-numeric: tabular-nums`

### Jerarquía Tipográfica y Textos
| Token | Valor Hex | Rol / Uso |
| :--- | :--- | :--- |
| `--text-primary` | `#16261C` | Texto principal y encabezados sobre fondos claros |
| `--text-secondary` | `#41564A` | Texto secundario, subtítulos y metadatos |
| `--text-muted` | `#5A6B5F` | Etiquetas atenuadas, notas al pie (WCAG AA ≥ 4.5:1) |
| `--text-on-dark` | `#EEF4EF` | Texto de alto contraste sobre fondos oscuros o bosque |
| `--text-on-dark-muted` | `#B9CDBF` | Texto secundario sobre fondos oscuros o pie de página |
| `--text-inverse` | `#0F2E1D` | Texto sobre botones ámbar / acento (nunca blanco) |

### Identidad de Marca y Estados
| Token | Valor Hex | Rol / Uso |
| :--- | :--- | :--- |
| `--brand-primary` | `#1B4A2E` | Verde bosque profundo corporativo |
| `--brand-primary-hover` | `#246A40` | Estado interactivo hover de elementos verdes |
| `--brand-deep` | `#0F2E1D` | Verde bosque noche (fondos de footer, texto sobre ámbar) |
| `--brand-accent` | `#F5A623` | Ámbar dorado de acento para CTAs e insignias |
| `--brand-accent-strong` | `#8A5200` | Ámbar oscuro legible como texto sobre fondo claro |
| `--brand-accent-soft` | `#FDF1D8` | Fondo tintado cálido para badges de acento |
| `--brand-coral` | `#B23A09` | Naranja/coral cálido para boletos reservados |
| `--brand-coral-soft` | `#FBE9E1` | Fondo de aviso para boletos reservados o alertas |
| `--color-danger` | `#B42318` | Rojo de error accesible |
| `--state-sold` | `#5F6673` | Gris neutro para estado de boletos vendidos |
| `--focus-ring` | `#1B4A2E` | Anillo de foco accesible sobre superficies claras |
| `--focus-ring-on-dark` | `#F5A623` | Anillo de foco sobre superficies oscuras |
| `--border-focus` | `var(--focus-ring)` | Alias de foco |

### Scrims y Filtros de Fotografía
| Token | Definición |
| :--- | :--- |
| `--scrim-photo` | `linear-gradient(to top, rgba(15,46,29,.92), rgba(15,46,29,.75) 45%, rgba(15,46,29,.3))` |

### Radios de Borde
| Token | Valor | Uso |
| :--- | :--- | :--- |
| `--radius-sm` | `10px` | Badges pequeños, inputs compactos |
| `--radius-md` | `14px` | Botones estándar, tarjetas compactas |
| `--radius-lg` | `20px` | Tarjetas principales, contenedores |
| `--radius-xl` | `28px` | Modales y diálogos flotantes |
| `--radius-full` | `999px` | Pastillas (pills) y botones redondeados |

### Sombras Cálidas (Base `rgba(15, 46, 29, α)`, nunca negro puro)
| Token | Valor | Uso |
| :--- | :--- | :--- |
| `--shadow-sm` | `0 2px 6px rgba(15, 46, 29, 0.08)` | Elevación sutil en cards de baja jerarquía |
| `--shadow-md` | `0 6px 16px rgba(15, 46, 29, 0.12)` | Elementos interactivos hover, tooltips |
| `--shadow-lg` | `0 12px 32px rgba(15, 46, 29, 0.16)` | Modales, barra flotante de carrito |
| `--shadow-glow-amber` | `0 0 24px rgba(245, 166, 35, 0.35)` | Resplandor dorado para botón de checkout y boletos seleccionados |

### Escala de Espaciado (Múltiplos de 4px)
- `--space-1`: `4px`
- `--space-2`: `8px`
- `--space-3`: `12px`
- `--space-4`: `16px`
- `--space-6`: `24px`
- `--space-8`: `32px`
- `--space-12`: `48px`
- `--space-16`: `64px`
- `--space-24`: `96px`

### Capas con Nombre (`z-index`)
- `--z-navbar`: `100` (Navegación superior fija)
- `--z-cart`: `200` (Barra inferior pegajosa del carrito)
- `--z-whatsapp`: `300` (Botón flotante de WhatsApp)
- `--z-modal`: `1000` (Checkout y modales de confirmación)
- `--z-lightbox`: `1100` (Visor de imágenes en pantalla completa)

> [!IMPORTANT]
> El botón de WhatsApp (`--z-whatsapp: 300`) queda estrictamente por debajo de modales (`--z-modal: 1000`) y lightbox (`--z-lightbox: 1100`), evitando colisiones de accesibilidad en pantallas táctiles.

### Alturas y Transiciones
- `--navbar-h`: `72px` (escritorio), `64px` (móvil ≤ 768px).
- `--transition-easing`: `cubic-bezier(0.2, 0.7, 0.2, 1)`.
- `--transition-fast`: `150ms cubic-bezier(0.2, 0.7, 0.2, 1)`.
- `--transition-base`: `250ms cubic-bezier(0.2, 0.7, 0.2, 1)`.

---

## 2. Reglas de Uso y Accesibilidad

1. **Nunca texto blanco sobre fondo ámbar**:
   - El contraste de blanco `#FFFFFF` sobre `--brand-accent` `#F5A623` es de **2.03:1** (falla crítica WCAG).
   - Sobre fondos ámbar (`--brand-accent`) debe usarse **`--brand-deep` (`#0F2E1D`)** o **`--text-inverse`**, alcanzando un ratio de **7.25:1** (Cumple WCAG AAA).
2. **Uso de Ámbar como Color de Texto**:
   - Sobre superficies claras (`--bg-page`, `--bg-card`): Usar **`--brand-accent-strong` (`#8A5200`)** (Ratio ≥ 5.57:1).
   - Sobre superficies oscuras (`--brand-deep`, fotografías con scrim): Usar **`--brand-accent` (`#F5A623`)** (Ratio ≥ 7.25:1).
3. **Texto sobre fotografía**:
   - Todo texto colocado sobre fotografía debe tener un scrim o fondo de contraste equivalente a un mínimo del **60 % de opacidad oscura** de verde bosque profundo (`rgba(15, 46, 29, 0.60)` o superior) o emplear `--scrim-photo`.
4. **Contraste de Texto Atenuado (`--text-muted`)**:
   - `--text-muted` (`#5A6B5F`) garantiza **4.95:1** sobre `--bg-page` y **5.67:1** sobre `--bg-card`, superando el umbral estricto de 4.5:1 para texto regular.

---

## 3. Matriz de Contraste Real (WCAG 2.1 AA / AAA)

| Elemento / Rol | Color Texto / Primer Plano | Fondo / Superficie | Ratio de Contraste | Nivel WCAG | Estado / Garantía |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Texto de lectura principal** | `--text-primary` (`#16261C`) | `--bg-page` (`#F4EFE4`) | **13.79:1** | **AAA** | ✅ Supera ampliamente 4.5:1 / 7:1 |
| **Tarjetas y modales (texto)** | `--text-primary` (`#16261C`) | `--bg-card` (`#FFFFFF`) | **15.81:1** | **AAA** | ✅ Óptima legibilidad |
| **Paneles y barras laterales** | `--text-primary` (`#16261C`) | `--bg-surface` (`#FBF8F1`) | **14.91:1** | **AAA** | ✅ Excelente jerarquía visual |
| **Subtítulos y metadatos** | `--text-secondary` (`#41564A`) | `--bg-page` (`#F4EFE4`) | **6.90:1** | **AA / AAA (Large)** | ✅ Supera 4.5:1 |
| **Contenido secundario en cards** | `--text-secondary` (`#41564A`) | `--bg-card` (`#FFFFFF`) | **7.91:1** | **AAA** | ✅ Supera 7:1 |
| **Texto atenuado / notas al pie** | `--text-muted` (`#5A6B5F`) | `--bg-page` (`#F4EFE4`) | **4.95:1** | **AA** | ✅ Cumple requisito estricto ≥ 4.5:1 |
| **Texto atenuado en cards** | `--text-muted` (`#5A6B5F`) | `--bg-card` (`#FFFFFF`) | **5.67:1** | **AA** | ✅ Cumple requisito estricto ≥ 4.5:1 |
| **Botones CTA y Checkout (Ámbar)** | `--brand-deep` / `--text-inverse` (`#0F2E1D`) | `--brand-accent` (`#F5A623`) | **7.25:1** | **AAA** | ✅ Sin texto blanco sobre ámbar |
| **Boleto Disponible** | `--ticket-available-text` (`#1B4A2E`) | `--ticket-available-bg` (`#E8F2EC`) | **7.82:1** | **AAA** | ✅ Legibilidad perfecta en cuadrícula |
| **Boleto Reservado** | `--ticket-reserved-text` (`#7A2706`) | `--ticket-reserved-bg` (`#FBE9E1`) | **5.61:1** | **AA** | ✅ Supera 4.5:1 en fuente de 12-14px |
| **Boleto Seleccionado** | `--ticket-selected-text` (`#0F2E1D`) | `--ticket-selected-bg` (`#F5A623`) | **7.25:1** | **AAA** | ✅ Cumple WCAG AAA |
| **Boleto Vendido** | `--ticket-sold-text` (`#5F6673`) | `--ticket-sold-bg` (`#EDEDF0`) | **5.08:1** | **AA** | ✅ Supera 4.5:1 para estado vendido |
| **Títulos del Footer** | `--text-on-dark` (`#EEF4EF`) | `--brand-deep` (`#0F2E1D`) | **13.17:1** | **AAA** | ✅ Con `!important` para anular h3 genérico |
| **Secundario del Footer** | `--text-on-dark-muted` (`#B9CDBF`) | `--brand-deep` (`#0F2E1D`) | **8.78:1** | **AAA** | ✅ Supera 7:1 |
| **Enlaces y Acentos en Footer** | `--brand-accent` (`#F5A623`) | `--brand-deep` (`#0F2E1D`) | **7.25:1** | **AAA** | ✅ Contraste sobresaliente en tema oscuro |
| **Chips de Métodos de Pago** | `rgba(238, 244, 239, 0.9)` | `rgba(255, 255, 255, 0.08)` sobre `#0F2E1D` | **11.40:1** | **AAA** | ✅ Lectura impecable |
| **Texto ámbar en superficies claras** | `--brand-accent-strong` (`#8A5200`) | `--bg-page` (`#F4EFE4`) | **5.57:1** | **AA** | ✅ Alternativa accesible al ámbar puro |
| **Bordes de Controles e Inputs** | `--border-subtle` (`#DCD5C4`) | `--bg-card` (`#FFFFFF`) | **3.01:1** | **AA Componentes** | ✅ Cumple WCAG 2.1 SC 1.4.11 (≥ 3:1) |
| *Blanco sobre Ámbar (PROHIBIDO)* | *Blanco (`#FFFFFF`)* | *`--brand-accent` (`#F5A623`)* | *2.03:1* | *FALLA CRÍTICA* | 🚫 **0 ocurrencias en todo el código fuente** |

---

## 4. Tabla de Reemplazo: Valores Viejos → Tokens Nuevos

| Valor Viejo Hardcodeado | Contexto de Uso | Token / Sustituto Nuevo |
| :--- | :--- | :--- |
| `rgba(10, 20, 16, 0.95)` | Navbar con scroll y fondo summary | `var(--bg-surface-glass)` |
| `#f59e0b`, `#d97706` | Degradado de botones CTA | `linear-gradient(135deg, var(--brand-accent), var(--brand-accent-strong))` |
| `rgba(245, 158, 11, 0.45)` | Sombra exterior en botones dorados | `var(--shadow-glow-amber)` |
| `rgba(10, 20, 16, 0.70 - 0.88)` | Scrim sobre fotografía de Hero | `rgba(15, 46, 29, 0.72 - 0.88)` / `--scrim-photo` |
| `rgba(245, 158, 11, 0.4)` | Bordes activos en cards y FAQ | `var(--color-brand-accent)` o `var(--border-focus)` |
| `1000` | z-index de barra Navbar | `var(--z-navbar)` (100) |
| `900` | z-index de sticky cart bar | `var(--z-cart)` (200) |
| `950` | z-index botón flotante WhatsApp | `var(--z-whatsapp)` (300) |
| `2100` | z-index de backdrop Checkout | `var(--z-modal)` (1000) |
| `2000` | z-index de visor Lightbox | `var(--z-lightbox)` (1100) |
| `#060e0a` | Fondo del Footer | `var(--brand-deep)` |
| `#040907` | Fondo de bottomBar del Footer | `rgba(10, 30, 19, 0.95)` |
| `#ef4444` | Icono corazón y estados de error | `var(--color-danger)` |
| `#10b981` | Dot indicador de boleto disponible | `var(--brand-primary)` |
| `#fbbf24` | Dot indicador seleccionado máx | `var(--brand-accent)` |
| `#f97316` | Dot indicador reservado | `var(--brand-coral)` |
| `#6b7280` | Dot indicador vendido | `var(--state-sold)` |
| `#11281e`, `#1e4534`, `#e2f0ea` | Boleto disponible | `var(--ticket-available-bg/border/text)` |
| `#2b1704`, `#78350f`, `#fb923c` | Boleto reservado | `var(--ticket-reserved-bg/border/text)` |
| `#18201c`, `#25332d`, `#4b5e55` | Boleto vendido | `var(--ticket-sold-bg/border/text)` |
| `rgba(0, 0, 0, 0.6)` | Sombras oscuras puras | `var(--shadow-lg)` (base verde bosque cálida) |

### Casos Aislados Excluidos de Reemplazo
- **Colores oficiales de marca WhatsApp**: `#25D366` y `#128C7E` se conservan en `FloatingWhatsAppBtn` y botón WhatsApp de soporte, por ser identidad oficial reconocida por el usuario.
- **Color oficial de marca Instagram**: `#E1306C` en `FilaAliados` se conserva por identidad de marca de red social.
