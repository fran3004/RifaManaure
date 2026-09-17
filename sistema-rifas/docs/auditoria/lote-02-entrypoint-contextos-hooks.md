# Auditoría — Lote 2: Entrypoint, rutas, contextos globales y hooks

> Fecha: 2026-09-17 | Estado: ✅ Completo

---

## 14. `src/main.tsx`

### A. Qué hace
Punto de entrada de la SPA. Monta `<App>` dentro de `StrictMode` en el nodo `#root`.

### B. Errores y bugs reales
- **`document.getElementById('root')!`** — Uso de aserción non-null. Si por algún motivo el nodo `root` no existe (HTML malformado, deploy roto), la app lanza un `TypeError` sin mensaje útil. Preferible: `document.getElementById('root') ?? document.body` o al menos un guard explícito.

### C. Calidad de código
- `StrictMode` activo ✅ — Detectará efectos con doble ejecución en desarrollo.
- El archivo es mínimo e intencional. Sin hallazgos adicionales.

### D–F.
- Sin hallazgos.

---

## 15. `src/App.tsx`

### A. Qué hace
Define el árbol de proveedores globales, el router y todas las rutas de la app (públicas y admin).
Es importado por `main.tsx` y es el único consumidor directo de todos los providers.

### B. Errores y bugs reales
- **`TicketCartProvider` no está en el árbol de proveedores de `App.tsx`** pero `TicketCartContext` es consumido por `HomePage` y sus hijos (`SelectorBoletos`, `HeroRifa`, etc.). Esto significa que `TicketCartProvider` debe estar siendo montado dentro de `HomePage` o en algún componente intermedio. **Confirmar en Lote 10/11** — si no está, `useTicketCart()` lanzará un error en runtime en la página pública.

- **Un solo `<Suspense>` para TODAS las rutas (admin + público)** — Cualquier ruta lazy que falle o tarde en cargar mostrará el mismo `<PageLoadingFallback>` genérico. Para rutas de admin sería más apropiado un boundary separado con fallback específico, especialmente porque el admin tiene un `AdminLayout` que puede fallar independientemente del contenido de la vista.

- **`ErrorBoundary` envuelve el `Suspense` pero no viceversa** — Si el propio `Suspense` o sus hijos lanzan un error sincrónico, el `ErrorBoundary` lo atrapa correctamente. Sin embargo, errores en la carga de chunks (ej. chunk 404 por deploy) no serán atrapados por `ErrorBoundary` — quedarán como errores no manejados. Sería más robusto envolver cada grupo de lazy imports con su propio `ErrorBoundary`.

### C. Calidad de código
- Code splitting completo de todas las vistas admin ✅ — 12 imports lazy correctamente declarados.
- `import React` en línea 1 es innecesario cuando sólo se usan `Suspense` y `lazy` (con `react-jsx` transform no se necesita el default import de React).
- La importación de `ErrorBoundary` está al final del bloque de lazy imports (línea 61), mezclando imports estáticos con lazy. Estilísticamente inconsistente — los estáticos deberían ir todos primero.
- `<Navigate to="/" replace />` para rutas 404 (línea 104) es correcto pero silencia errores de navegación. No hay una página 404 real.
- El orden de proveedores: `BrowserRouter > AuthProvider > SystemSettingsProvider` es correcto. `TicketCartProvider` (si existe) debería estar debajo de `SystemSettingsProvider` ya que consume `useSystemSettings`.

### D. Rendimiento
- Lazy loading implementado correctamente para todo el admin. ✅
- `HomePage` se carga de forma estática (sin lazy) — correcto, es la ruta principal y debe estar en el bundle inicial.

### E. UI/UX
- Sin fallback 404 real — el usuario que escribe una URL incorrecta es redirigido silenciosamente a `/`. Puede ser confuso.

### F. Seguridad
- La protección de rutas admin está en `<ProtectedRoute>` ✅. Sin hallazgos en App.tsx.

---

## 16. `src/App.css`

### A. Qué hace
Estilos CSS globales para la landing page: navbar, hero, botones, grid de aliados, responsive. Usa variables CSS del sistema de diseño.
Lo importa `App.tsx` (indirectamente a través de `index.css` o directamente — a verificar).

### B. Errores y bugs reales
- **`App.css` no es importado en `App.tsx` ni en `main.tsx` directamente.** `main.tsx` sólo importa `index.css`. `App.tsx` no importa ningún CSS. Estos estilos sólo se aplican si algún componente de landing los importa. **A verificar**: si `HomePage` o algún componente landing importa `App.css`. De lo contrario, podría ser que los estilos estén declarados aquí pero que la landing use clases que esten definidas en un módulo propio. Riesgo de **estilos que se aplican globalmente** (no son CSS Modules) sin estar claro qué los importa. *(Verificar en Lote 10/11.)*

### C. Calidad de código
- Los estilos son globales (no CSS Module) con nombres de clase descriptivos y específicos del contexto de la landing. Riesgo bajo de colisión de nombres con el admin, que sí usa CSS Modules.
- Usa correctamente variables CSS del sistema (`var(--bg-main)`, `var(--color-brand-accent)`, etc.) ✅.
- **Valores hardcodeados** dentro de CSS:
  - `rgba(10, 20, 16, 0.75)` y `rgba(10, 20, 16, 0.92)` en `.hero-overlay` — estos son el color `--bg-main` pero sin usar la variable CSS (no se puede mezclar con alpha directamente en CSS variable sin `color-mix()` o `rgba()` separados). **Preferencia de estilo, no bug.**
  - `rgba(245, 158, 11, 0.45)` en `.btn-primary:hover` — hardcodeado en vez de usar `--color-brand-accent`. Menor.
  - `linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)` en `.highlight-text` — colores del brand repetidos sin variable.
  - `linear-gradient(135deg, #f59e0b 0%, #d97706 100%)` en `.btn-primary` — lo mismo.
- `.nav-links a:not(.nav-btn-secondary)` en mobile oculta los links de navegación pero no hay menú hamburguesa alternativo. En móvil el usuario sólo ve el botón "Verificar". ¿Intencional?

### D. Rendimiento
- Sin hallazgos. CSS puro sin dependencias.

### E. UI/UX
- `.hero-section` tiene `min-height: 85vh` en desktop — correcta presencia visual.
- En mobile (`max-width: 768px`) el hero queda `min-height: auto` — correcto para no bloquear el scroll.
- `.aliados-grid` responsive con `auto-fill` y `minmax` — bien.

---

## 17. `src/index.css`

### A. Qué hace
Archivo CSS de entrada. Sólo importa `variables.css` y `globals.css`. No declara estilos propios.
Importado por `main.tsx`.

### B–F.
- **Sin hallazgos.** Correcto como archivo de orquestación de imports CSS.
- Nótese que `App.css` no se importa aquí — confirma la duda planteada en el ítem 16.

---

## 18. `src/lib/supabase.ts`

### A. Qué hace
Crea y exporta el cliente singleton de Supabase, tipado con el esquema de base de datos. También exporta `isSupabaseConfigured` para que la app detecte si las variables de entorno están presentes.

### B. Errores y bugs reales
- **`|| ''` como fallback para las env vars** (líneas 4–5) — Si `VITE_SUPABASE_URL` no existe, el valor queda como string vacío, que luego es detectado por `isSupabaseConfigured`. Sin embargo, `createClient` se llama siempre con algún valor (ya sea el real o el placeholder). Esto es correcto y deliberado: evita que la app explote si las vars no están.
- **Placeholder URL hardcodeada** (`'https://placeholder.supabase.co'`) — Si alguien olvida configurar las vars, la app carga en modo "silencioso" sin error visible al usuario. Podría ser útil mostrar un banner de "configuración incompleta" en desarrollo.

### C. Calidad de código
- Singleton correctamente exportado. ✅
- `isSupabaseConfigured` incluye la verificación de que la URL no sea el valor de ejemplo del `.env.example`. ✅ Buena práctica.
- `eventsPerSecond: 10` en Realtime — valor razonable para limitar el throughput de eventos. ✅
- `persistSession: true` y `autoRefreshToken: true` — configuración estándar correcta. ✅
- Doble blank line al final del archivo (línea 30–31) — ruido menor.

### D. Rendimiento
- Cliente singleton — correcto, una sola instancia para toda la app. ✅

### F. Seguridad
- La `ANON_KEY` de Supabase es pública por diseño (Row Level Security la protege). Sin hallazgos adicionales aquí — la seguridad real está en las políticas RLS de las migraciones.

---

## 19. `src/lib/utils.ts`

### A. Qué hace
Biblioteca de utilidades puras: formateo de moneda COP, validación de documentos/teléfonos/emails, generación de links de WhatsApp, selección aleatoria de boletos, enmascaramiento de datos personales.
Importado por múltiples servicios y componentes a lo largo del proyecto.

### B. Errores y bugs reales
- **`getRandomTicketNumbers` usa `Math.random()` para sortear** (línea 70) — Fisher-Yates shuffle parcial via `sort(() => 0.5 - Math.random())`. Este algoritmo produce distribuciones no uniformes (el sort no es un shuffle real). Para una selección casual de boletos es aceptable; **NO debe usarse para sorteos oficiales de ganador** (y aparentemente no se usa para eso). Advertencia menor.
- **`isValidEmail`** (línea 48) — Regex simplificado que no valida dominios con subdominios complejos ni TLDs nuevos con más de una letra por segmento. Aceptable para validación básica de UX.
- **`isValidPhone`** (línea 40) — Valida que sea 10 dígitos empezando con "3". No valida números con prefijo internacional `+57`. Si el usuario escribe `+573001234567` pasará el `replace(/\D/g, '')` pero quedará con 12 dígitos y fallará la validación de longitud. Considerar normalizar quitando "57" si el string tiene 12 dígitos.

### C. Calidad de código
- Funciones bien documentadas con JSDoc. ✅
- Todas las funciones son puras y sin efectos secundarios. ✅
- `maskDocumentId` (línea 78) tiene lógica algo compleja para calcular `first`, `last` y `asterisks`. El cálculo de `first = Math.min(3, Math.floor(clean.length / 3))` produce resultados inconsistentes para documentos cortos (6 dígitos): `Math.floor(6/3) = 2` caracteres visibles al inicio — podría ser confuso. Funciona pero no es obvio.
- `formatPhoneNumber` (línea 123) sólo maneja 12 dígitos con prefijo 57 o 10 dígitos. No maneja el caso de 11 dígitos (ej: `573001234567` sin el `+`). Retorna el string original como fallback — correcto.
- **Línea 119** — falta línea en blanco antes del JSDoc de `formatPhoneNumber` (está junto al `}` del `maskPhone`). Menor, pero inconsistente con el resto del archivo.

### D. Rendimiento
- Todas las funciones son O(n) o menores. Sin hallazgos.

### E–F.
- Sin hallazgos.

---

## 20. `src/database.types.ts` (raíz de `/src`)

### A. Qué hace
Archivo puente que re-exporta todo desde `src/types/database.types.ts`. Permite importar desde `@/database.types` (ruta corta usada por el cliente Supabase y algunos servicios).

### B. Errores y bugs reales
- **Duplicación conceptual leve:** Existe `src/database.types.ts` Y `src/types/database.types.ts`. El archivo raíz es sólo un re-export. El cliente supabase importa de `@/types/database.types`, así que este archivo raíz podría ser **código muerto** — depende de si hay algún import de `@/database.types` (sin la subcarpeta `types/`) en algún archivo.

### C. Calidad de código
- El `export * from` junto con `export type { Database, Json }` produce re-exports duplicados de `Database` y `Json`. Cualquier import de `@/database.types` que use `import type { Database }` recibirá la misma definición dos veces (no es error, pero es ruido). Podría simplificarse a solo `export * from './types/database.types'`.

---

## 21. `src/context/AuthContext.tsx`

### A. Qué hace
Proveedor de autenticación global. Gestiona `user`, `session`, `adminProfile`, `isAdmin`, `isLoading`. Escucha cambios de Supabase Auth con `onAuthStateChange` y verifica autorización de administrador contra la tabla `admin_users`.

### B. Errores y bugs reales
- **Race condition entre `initAuth` y `onAuthStateChange`** — El efecto ejecuta `initAuth()` (async) y simultáneamente registra el listener de auth. Si Supabase dispara `SIGNED_IN` antes de que `initAuth` termine, `verifyAdmin` se ejecutará dos veces para el mismo usuario. En la práctica, `getSession()` y el evento inicial de Supabase a veces coinciden. El flag `isMounted` protege el setState pero no elimina la doble llamada a `checkAdminAuthorization`. **Impacto real: bajo** (una llamada extra a la BD al inicio), pero es un patrón conocido en Supabase. Mitigación: en `onAuthStateChange` ignorar el evento `INITIAL_SESSION` (o `SIGNED_IN` inmediato si `initAuth` ya lo manejó).

- **`verifyAdmin` en `onAuthStateChange` sin `setIsLoading(true)` previo** — Cuando el token se refresca automáticamente, `onAuthStateChange` se dispara con `TOKEN_REFRESHED`. El contexto entra en `verifyAdmin` sin marcar `isLoading: true`, lo que significa que la UI nunca bloquea mientras se re-verifica el admin. En la práctica esto raramente causa problema porque el refresh es transparente, pero es una inconsistencia.

- **`signIn` y `signOut` setean `isLoading(true)` pero si `onAuthStateChange` se dispara antes de que terminen, setean `isLoading(false)` dos veces.** Sin consecuencias graves pero es código redundante.

### C. Calidad de código
- Separación limpia: la lógica de Supabase Auth está en `authService.ts`, el contexto sólo orquesta el estado. ✅
- `useCallback` con dependencias vacías `[]` para `verifyAdmin` — correcto porque no captura variables cambiantes. ✅
- Cleanup correcto de la suscripción con `subscription.unsubscribe()` y flag `isMounted`. ✅
- `refreshAdminStatus` es un método público del contexto — útil para forzar re-verificación manual (ej. cuando un admin cambia los permisos de otro).

### F. Seguridad
- La verificación `profile.is_active` garantiza que admins desactivados no puedan acceder incluso con sesión válida. ✅
- `checkAdminAuthorization` en `authService.ts` debería verificar esto también en la BD (no sólo en el frontend) — a revisar en Lote 4.

---

## 22. `src/context/AuthContextDefinition.ts`

### A. Qué hace
Separación de la definición del contexto (`createContext`, `AuthContextType`) del proveedor. Patrón para evitar ciclos de importación.

### B–F.
- **Sin hallazgos.** Patrón correcto y limpio. El tipo `AuthContextType` cubre todos los valores necesarios del contexto. ✅

---

## 23. `src/context/useAuth.ts`

### A. Qué hace
Hook de consumo del `AuthContext`. Lanza error si se usa fuera del provider.

### B–F.
- **Sin hallazgos.** Implementación canónica y correcta del patrón de hook de contexto con guard. ✅

---

## 24. `src/context/SystemSettingsContext.tsx`

### A. Qué hace
Proveedor que carga `system_settings` de Supabase al inicio y se mantiene sincronizado en tiempo real vía Realtime. Expone la configuración del sistema a toda la app.

### B. Errores y bugs reales
- **`console.warn` en el catch pero no hay estado de error expuesto** — Si `getSystemSettings()` falla (BD caída, timeout), el contexto mantiene `DEFAULT_SYSTEM_SETTINGS` silenciosamente. La app funciona con valores por defecto, pero el admin y el usuario público no saben que los settings no se cargaron. **Impacto potencial:** el `max_tickets_per_buyer` por defecto podría no coincidir con el real, y el precio por defecto (`25000` hardcodeado en `TicketCartContext`) podría mostrar un precio incorrecto al usuario.

- **El canal Realtime escucha `event: '*'` en `system_settings`** — Cualquier INSERT/UPDATE/DELETE recarga toda la configuración. Correcto y deliberado. ✅

### C. Calidad de código
- El canal Realtime se llama `'system_settings_global_channel'` — nombre descriptivo. ✅
- Cleanup correcto con `isMounted` y `supabase.removeChannel()`. ✅
- **`SystemSettingsContext` no se exporta con `export default`** — se exporta como named export al final (línea 63). La definición del contexto (línea 6) está dentro del módulo. Correcto pero ligeramente confuso — el contexto vive en el mismo archivo que el provider. Contrasta con `AuthContext` que tiene un archivo de definición separado.

### D. Rendimiento
- La recarga al recibir cualquier cambio hace un fetch completo de settings en vez de usar el payload del evento Realtime. Para una tabla de una sola fila es completamente aceptable. ✅

---

## 25. `src/context/AdminRaffleContext.tsx`

### A. Qué hace
Proveedor de la rifa seleccionada en el panel admin. Persiste la selección en `localStorage`. Expone `selectedRaffle`, `raffles`, y métodos para recargar y cambiar la selección.
Consumido únicamente dentro del panel admin.

### B. Errores y bugs reales
- **`AdminRaffleProvider` no está montado en `App.tsx`** — No aparece en el árbol de proveedores de `App.tsx`. Debe estar montado en `AdminLayout.tsx` o en cada vista que lo necesite. **A verificar en Lote 13.** Si no está montado en el layout, cada vista admin que use `useAdminRaffle()` lanzará el error "debe usarse dentro de un AdminRaffleProvider".

- **`localStorage.getItem(STORAGE_KEY)` en el initializer del estado** (línea 20) — `localStorage` puede lanzar `SecurityError` en navegadores con storage bloqueado (modo privado en algunos browsers, o iframe con políticas restrictivas). Sin try/catch, esto crashearía el provider al montar.

- **Cuando `reloadRaffles` falla, `isLoadingRaffles` se pone en `false`** (en el `finally`) pero `raffles` queda vacío y sin estado de error expuesto — el panel admin mostraría vacío sin avisar al usuario. *(Ver patrón similar en `SystemSettingsContext`.)*

### C. Calidad de código
- La lógica de priorización de rifa (activa > primera disponible > null) está bien documentada. ✅
- `useMemo` para `selectedRaffle` y `value` — apropiado para evitar re-renders innecesarios de todos los consumidores. ✅
- El método `setSelectedRaffleId` (línea 64) recibe `string` pero el tipo del estado permite `string | null`. No hay forma de deseleccionar una rifa desde el exterior (sólo se puede seleccionar otra). Probablemente intencional.

---

## 26. `src/context/TicketCartContext.tsx`

### A. Qué hace
El contexto más grande del proyecto (313 líneas). Centraliza toda la lógica pública de la rifa: estado de boletos, selección, carrito, checkout, Realtime. Montado en `HomePage` (a confirmar) o en `App.tsx`.

### B. Errores y bugs reales

**1. Duplicación de lógica de carga inicial (BUG REAL):**
Las líneas 39–65 definen `loadData` con exactamente la misma lógica que el `useEffect` de las líneas 67–105 (`init()`). La función `loadData` existe para el Realtime pero el `init` del efecto inicial duplica su código en vez de llamarla. Si se modifica la lógica de carga en `loadData`, hay que actualizarla también en `init` — fuente de bugs futuros. **Deben unificarse.**

**2. `isLoading` nunca se vuelve `true` en las recargas por Realtime:**
`loadData` (usada por Realtime) no pone `isLoading: true` antes de cargar. El usuario podría ver boletos inconsistentes por una fracción de segundo sin indicador de carga. Menor en práctica.

**3. El canal de boletos filtra por `raffle_id` pero escucha `DELETE`:**
En el handler de Realtime (línea 161), sólo se manejan `UPDATE` e `INSERT`. Si un ticket se elimina (posible en flujos admin), el estado local no se actualiza — el ticket eliminado permanece visible en la UI del usuario hasta la próxima recarga completa.

**4. Precio hardcodeado como fallback:**
```ts
const unitPrice = raffle?.ticket_price ? Number(raffle.ticket_price) : 25000;
```
Si la rifa no tiene precio (campo null), se muestra `25000` al usuario. Este valor debería venir de `systemSettings.default_ticket_price` o similar, no estar hardcodeado. **Valor hardcodeado en lógica de negocio.**

**5. `maxTicketsPerBuyer` con doble fallback:**
```ts
const maxTicketsPerBuyer = systemSettings?.max_tickets_per_buyer ?? raffle?.max_tickets_per_buyer ?? 20;
```
El fallback final es `20` hardcodeado. Si ambas fuentes fallan, el usuario puede comprar hasta 20 tickets sin que eso esté configurado en ninguna parte.

**6. `toggleTicketSelection` y `selectRandomTickets` no son estables (sin `useCallback`):**
Estas funciones se recrean en cada render del provider y se pasan al contexto, causando re-renders de todos los consumidores. Deberían envolverse en `useCallback`. (Con React 19 el compilador puede optimizarlo, pero aquí no está habilitado.)

### C. Calidad de código
- Tres `useEffect` separados por responsabilidad — bien estructurado conceptualmente, pero el primero y el tercero hacen lo mismo (ver Bug #1).
- Cleanup correcto de los 3 canales Realtime. ✅
- `clearSelection`, `openCheckout`, `closeCheckout` son funciones simples que podrían ser `useCallback` sin costo.
- El contexto mezcla responsabilidades: gestión de rifa activa + gestión de carrito + estado de UI (checkout abierto/cerrado) + notificaciones toast. Es un God Object de contexto — mejorable dividiéndolo en al menos dos contextos (datos de rifa | carrito/UI), pero funciona.
- **Renderiza `<ToastNotification>` dentro del provider** (línea 307) — patrón inusual pero funcional. Significa que los toasts del usuario público sólo funcionan si `TicketCartProvider` está montado.

### D. Rendimiento
- `getActiveRaffle()` + `getWinnerForRaffle()` + `getTickets()` son 3 llamadas secuenciales al inicio. Podrían paralelizarse con `Promise.all` para reducir el tiempo de carga inicial.

---

## 27. `src/context/TicketCartContextDefinition.ts`

### A. Qué hace
Definición de la interfaz `TicketCartContextType` y el objeto de contexto React.

### B–F.
- **Sin hallazgos.** Tipos correctos y completos. La separación en archivo propio sigue el mismo patrón que `AuthContextDefinition.ts`. ✅

---

## 28. `src/context/useTicketCart.ts`

### A. Qué hace
Hook de consumo de `TicketCartContext`. Exporta además `useOptionalTicketCart` para componentes que pueden vivir fuera del provider.

### B. Errores y bugs reales
- **`useOptionalTicketCart` retorna `null` si no hay provider** — Útil para componentes compartidos entre zonas protegidas y públicas. Sin hallazgos. ✅

### C. Calidad de código
- La existencia de `useOptionalTicketCart` sugiere que hay componentes que se usan tanto dentro como fuera del contexto. Esto puede ser síntoma de que el árbol de providers no está perfectamente definido. A verificar en lotes posteriores.

---

## 29. `src/hooks/useDocumentTitle.ts`

### A. Qué hace
Hook que actualiza `document.title` con sufijo automático "Manaure Vive".

### B. Errores y bugs reales
- **No restaura el título original al desmontar** — Si el componente que usa `useDocumentTitle` se desmonta sin que otro actualice el título, el último título puesto permanece. En una SPA donde siempre hay un componente activo con título, esto es irrelevante, pero es un detalle de implementación incompleto.

### C. Calidad de código
- La comprobación `title.includes(suffix)` para evitar títulos como "Manaure Vive | Manaure Vive" es una buena salvaguarda. ✅
- El sufijo es un parámetro con default — permite flexibilidad para el panel admin si quisiera otro sufijo. ✅

---

## 30. `src/hooks/useSystemSettings.ts`

### A. Qué hace
Hook de consumo del `SystemSettingsContext`. Retorna siempre un valor (nunca `undefined`) gracias al `||`.

### B–F.
- **Sin hallazgos.** Simple y correcto. El `|| DEFAULT_SYSTEM_SETTINGS` es redundante dado que el contexto ya tiene ese default, pero es una defensa extra sin costo. ✅

---

## Resumen del Lote 2

| Archivo | Estado | Severidad máx. | Nota |
|---------|--------|----------------|------|
| `main.tsx` | ⚠ mejorable | Baja | `getElementById!` sin guard |
| `App.tsx` | ⚠ mejorable | Media | `TicketCartProvider` ausente del árbol (a confirmar); Suspense único para todo |
| `App.css` | ⚠ mejorable | Baja | No está claro quién lo importa; valores de color hardcodeados; sin menú hamburguesa en móvil |
| `index.css` | ✅ OK | — | Sólo orquesta imports CSS |
| `lib/supabase.ts` | ✅ OK | — | Cliente singleton bien configurado |
| `lib/utils.ts` | ⚠ mejorable | Baja | `Math.random()` shuffle no uniforme; `isValidPhone` no maneja prefijo +57 |
| `database.types.ts` (raíz) | ⚠ mejorable | Baja | Re-export doble de `Database/Json`; posible código muerto si nada lo importa |
| `context/AuthContext.tsx` | ⚠ mejorable | Media | Race condition leve entre `initAuth` y `onAuthStateChange` |
| `context/AuthContextDefinition.ts` | ✅ OK | — | Correcto |
| `context/useAuth.ts` | ✅ OK | — | Correcto |
| `context/SystemSettingsContext.tsx` | ⚠ mejorable | Media | Error silencioso si settings no cargan; sin estado de error expuesto |
| `context/AdminRaffleContext.tsx` | ⚠ mejorable | Media | `localStorage` sin try/catch; error silencioso; provider no montado en App.tsx (a confirmar) |
| `context/TicketCartContext.tsx` | 🐛 con bugs | **Alta** | Lógica de carga duplicada; DELETE de ticket no manejado; precio `25000` hardcodeado; 3 fetches secuenciales; sin `useCallback` en toggles |
| `context/TicketCartContextDefinition.ts` | ✅ OK | — | Correcto |
| `context/useTicketCart.ts` | ✅ OK | — | Correcto |
| `hooks/useDocumentTitle.ts` | ⚠ mejorable | Baja | No restaura título al desmontar |
| `hooks/useSystemSettings.ts` | ✅ OK | — | Correcto |

### Top hallazgos de este lote
1. **🔴 ALTO:** `TicketCartContext.tsx` — Lógica de carga inicial duplicada (Bug #1), precio hardcodeado `25000`, DELETE de tickets no manejado en Realtime.
2. **🟠 MEDIO:** `App.tsx` — `TicketCartProvider` potencialmente ausente del árbol; un solo `ErrorBoundary`/`Suspense` para todo.
3. **🟠 MEDIO:** `SystemSettingsContext` y `AdminRaffleContext` — Errores silenciosos sin estado de error expuesto al usuario.
4. **🟠 MEDIO:** `AuthContext.tsx` — Race condition leve entre init y onAuthStateChange.
5. **🟡 BAJO:** `AdminRaffleContext` — `localStorage` sin try/catch; podría explotar en modo privado de ciertos browsers.
6. **🟡 BAJO:** `lib/utils.ts` — `isValidPhone` no maneja `+57` al inicio.

