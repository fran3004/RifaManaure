# Auditoría — Lote 4: Servicios (parte 1)

> Fecha: 2026-09-17 | Estado: ✅ Completo

---

## 33. `src/services/authService.ts`

### A. Qué hace
Encapsula toda la lógica de Supabase Auth para el panel admin: login, logout, recuperación de sesión y verificación de autorización contra `admin_users`. Es el único archivo que accede directamente a `supabase.auth.*`. Lo consume `AuthContext.tsx`.

### B. Errores y bugs reales

**1. `checkAdminAuthorization` hace un UPDATE silencioso sin esperar confirmación ni manejar error:**
```ts
// líneas 148–152
await supabase
  .from('admin_users')
  .update({ user_id: userId, updated_at: new Date().toISOString() })
  .eq('id', row.id);
```
El resultado del UPDATE se descarta completamente (sin `const { error }`). Si el enlace falla (permisos RLS, red), el admin queda sin `user_id` en BD pero la sesión continúa. En la siguiente verificación volverá a intentar el UPDATE innecesariamente. Impacto bajo en práctica, pero es un error silencioso real.

**2. `getInitialAdminSession` existe pero no se usa en `AuthContext.tsx`**
`AuthContext` llama directamente a `supabase.auth.getSession()` + `checkAdminAuthorization` en su `initAuth`, duplicando la lógica de `getInitialAdminSession`. Esta función es **código muerto** o redundante — a confirmar si algún otro componente la importa.

**3. `signInAdmin` retorna `{ user, session }` incluso cuando `isAdmin: false`**
Si un usuario de Supabase Auth existe pero NO está en `admin_users`, se devuelve `user` y `session` válidos con `isAdmin: false`. `AuthContext.signIn` recibe esto y pone `isAdmin: false` en el contexto pero **también pone `user` y `session` con valores**. El usuario queda "autenticado" en Supabase pero denegado como admin — `ProtectedRoute` debería bloquearlo correctamente, pero es un estado inconsistente que podría confundir si el contexto se consume en otros lugares.

### C. Calidad de código
- `translateAuthError` sólo cubre 3 casos. Errores como `"User not found"`, `"Password should be at least 6 characters"` o bloqueos por IP llegarán al usuario en inglés técnico de Supabase.
- `checkAdminAuthorization` consulta con `.or('user_id.eq.${userId},email.eq.${cleanEmail}')` — el filtro OR por `user_id` O `email` es deliberado para el onboarding de admins pre-invitados. Correcto. ✅
- El casting `const row = data as AdminUserRow` (línea 144) es seguro porque la query filtra `is_active = true` y devuelve exactamente la forma de `admin_users.Row`.

### D–F.
- Sin hallazgos de rendimiento. Sin hallazgos de UI.
- **Seguridad:** La verificación de `is_active` ocurre tanto en la consulta SQL (`.eq('is_active', true)`) como en `AuthContext` (`profile.is_active`). Doble verificación — correcto y defensivo. ✅

---

## 34. `src/services/settingsService.ts`

### A. Qué hace
Lee y escribe `system_settings` (fila única `id=1`). Expone `DEFAULT_SYSTEM_SETTINGS` como fallback. Usado por `SystemSettingsContext` y `SettingsView`.

### B. Errores y bugs reales

**1. `DEFAULT_SYSTEM_SETTINGS.support_whatsapp_number = '573001234567'` — número de teléfono de prueba hardcodeado como default visible:**
Si la tabla `system_settings` está vacía o no carga, la app muestra `573001234567` como número de soporte en el botón flotante de WhatsApp y en el footer. El usuario real podría intentar contactar ese número inexistente. **Impacto directo en UX de producción.**

**2. `getSystemSettings` usa `select('*')` con `.eq('id', 1)` — acceso directo a tabla**
Para la lectura pública de settings esto es aceptable si RLS lo permite. A verificar en las migraciones que no haya datos sensibles en `system_settings` que no deban ser públicos (como `updated_by` que es un UUID de admin). En la migración 022 se verá si existe política pública de SELECT.

**3. El casting `return data as SystemSettingsRow` (línea 38)** — el `maybeSingle()` ya retorna el tipo correcto si el cliente está tipado con el esquema. El casting es redundante pero inofensivo.

### C. Calidad de código
- `formatSettingsRpcError` detecta mensajes específicos de error para guiar al admin a ejecutar migraciones — **excelente UX de administración.** ✅
- Las validaciones del lado cliente en `updateSystemSettingsAdmin` (rango 1–120 min, 1–1000 boletos) son correctas como primera línea de defensa, aunque la validación real debe estar en la RPC. ✅
- El número `573001234567` también aparece en `DEFAULT_SYSTEM_SETTINGS.support_email = 'soporte@manaurevive.com'` — este dominio debería existir o el email de soporte quedará en bounce.

### D–F. — Sin hallazgos adicionales.

---

## 35. `src/services/raffleService.ts`

### A. Qué hace
Gestión administrativa de rifas: listado con estadísticas agregadas, actualización y creación vía RPCs. Consumido por `AdminRaffleContext`, `RafflesView` y modales de rifa.

### B. Errores y bugs reales

**1. `fetchAdminRaffles` trae TODOS los tickets de TODAS las rifas para calcular estadísticas en memoria:**
```ts
// línea 60–62
const { data: ticketsData } = await supabase
  .from('tickets')
  .select('raffle_id, status');  // Sin filtro ni paginación
```
Si hay 1.000 boletos por rifa y 5 rifas → 5.000 filas descargadas al cliente sólo para sumar contadores. **Bug de rendimiento real y escalabilidad.** Debería calcularse en la BD (GROUP BY / COUNT con la RPC de dashboard KPIs que ya existe, `get_dashboard_kpis`).

**2. Fallback hardcodeado `|| 1000` en cálculo de `totalTickets` (línea 86):**
```ts
const totalTickets = r.total_tickets || stats.available + ... || 1000;
```
Si `r.total_tickets` es `0` (truthy-falsy bug: `0 || x` = `x`), el fallback toma el conteo de boletos en BD. Si ese también es `0`, usa `1000`. El porcentaje de ventas mostrado al admin sería `0%` cuando en realidad no hay boletos — o peor, si `total_tickets` es `0` intencionalmente (rifa recién creada sin boletos aún), el porcentaje se calcularía sobre `1000`. **Truthy-falsy bug.**

**3. Castings ciegos de RPC (patrón sistémico confirmado):**
```ts
const response = data as { success: boolean; raffle?: RaffleRow; error?: string } | null;
```
Si la RPC devuelve una estructura diferente, el acceso a `response?.raffle` es silenciosamente `undefined`.

**4. `updateRaffleAdmin` convierte la fecha con `new Date(params.drawDate).toISOString()` sin validar que la fecha sea futura:**
Si el admin ingresa una fecha pasada, se guarda sin error. La validación debería existir (al menos como advertencia). No es un bug de crash, sino de integridad de datos.

**5. `createRaffleAdmin` tiene un try/catch interno para la fecha (líneas 186–191) pero lo silencia completamente:**
```ts
try {
  const parsedDate = new Date(params.drawDate);
  drawDateIso = isNaN(parsedDate.getTime()) ? params.drawDate : parsedDate.toISOString();
} catch {
  drawDateIso = params.drawDate;
}
```
Si la fecha es inválida, se envía el string crudo a la RPC. La BD rechazará con un error que el usuario verá como mensaje técnico.

### C. Calidad de código
- `formatRaffleRpcError` con instrucciones específicas para ejecutar migraciones — buena práctica de DX. ✅
- `RaffleWithStats` extiende `RaffleRow` con campos calculados — buen uso de interfaces para enriquecer el tipo base. ✅
- La función `fetchAdminRaffles` mezcla dos responsabilidades: obtener rifas + calcular estadísticas de boletos. Debería delegarse a una RPC o separarse en funciones.

### D. Rendimiento
- **Crítico:** Descargar toda la tabla de `tickets` al cliente para calcular contadores es el peor patrón de rendimiento posible. Con rifas grandes (> 5000 boletos totales), esto puede ser decenas de miles de filas. La RPC `get_dashboard_kpis` ya existe — úsala o crea una RPC específica de estadísticas por rifa.

---

## 36. `src/services/ticketService.ts`

### A. Qué hace
El servicio más importante del flujo público: obtención de rifa activa, carga de boletos, reserva atómica, creación de orden, y verificación pública. Consumido por `TicketCartContext`, `VerificarPage` y `ModalCheckout`.

### B. Errores y bugs reales

**1. `getActiveRaffle` hace DOS queries secuenciales cuando no hay rifa activa (líneas 36–65):**
- Query 1: busca rifa con `status = 'active'`
- Query 2 (si falla): busca la más reciente sin filtro de estado

El problema: si hay una rifa en estado `'draft'` o `'finished'` y el admin no ha activado ninguna, el usuario público verá esa rifa en lugar de una página "sin rifa disponible". La segunda consulta es una trampa que puede mostrar rifas no activas al público. Debería sólo retornar `null` si no hay activa, no un fallback con cualquier rifa.

**2. `registerBuyer` accede directamente a la tabla `buyers` con `.upsert()` desde el cliente:**
```ts
await supabase.from('buyers').upsert(...)
```
Esto requiere que la política RLS de `buyers` permita INSERT/UPDATE desde el anon key. Si las migraciones configuraron RLS correctamente, esto pasa por la RPC `create_order_secure` que ya maneja el upsert. Pero si `registerBuyer` también se llama directamente, hay un path de escritura duplicado. **A verificar en migraciones si RLS permite upsert anónimo en `buyers`.** Si sí, es una superficie de seguridad — cualquier usuario podría modificar datos de compradores.

**3. `createOrder` tiene una firma confusa con `buyerIdOrData: string | BuyerRegistrationData` y un parámetro `buyerDataParam?` adicional:**
```ts
export async function createOrder(
  raffleId: string,
  buyerIdOrData: string | BuyerRegistrationData,  // ¿ID o datos?
  ticketNumbers: string[],
  _clientTotalAmountIgnored?: number,              // Parámetro ignorado con _
  paymentMethod: ...,
  contactPreference: ...,
  buyerDataParam?: BuyerRegistrationData           // ¿Y esto?
)
```
La lógica interna: `const buyerData = typeof buyerIdOrData === 'object' ? buyerIdOrData : buyerDataParam;`. Si `buyerIdOrData` es un `string` (ID) y `buyerDataParam` es `undefined`, `buyerData` es `undefined` y la función retorna error. La firma es innecesariamente compleja y propensa a errores de uso. El parámetro `_clientTotalAmountIgnored` es un vestigio de una versión anterior que calculaba el total en cliente.

**4. `verifyPublicOrderOrTickets` usa `any[]` para el array de órdenes (línea 308):**
```ts
orders: any[];
```
Y luego mapea con `(ord: any)` — la inferencia de tipos del backend se pierde completamente. Cualquier campo renombrado en la RPC romperá el mapeo silenciosamente.

**5. Valores hardcodeados en el fallback del mapeo (líneas 334, 336):**
```ts
title: ord.raffle?.title || 'Gran Rifa Ecoturística Manaure Vive',
lotteryReference: ord.raffle?.lotteryReference || 'Lotería de Santander',
```
Si la RPC no devuelve el nombre de la rifa, el usuario ve un nombre y una referencia de lotería que podrían ser incorrectas. Datos de negocio hardcodeados como fallback de presentación.

**6. Import en medio del archivo (línea 246):**
```ts
import { maskDocumentId, maskFullName } from '@/lib/utils';
```
Está en el medio del archivo, después de funciones. Todos los imports deben ir al principio. Esto viola la convención estándar y puede confundir el tree-shaking.

### C. Calidad de código
- `_clientTotalAmountIgnored` — buen nombre con el prefijo `_` para señalar que es intencional, pero el parámetro debería eliminarse de la firma para no confundir. ✅ (intención)
- `getTicketsByBuyerDocument` es un wrapper de `verifyPublicOrderOrTickets` que devuelve datos enmascarados — correcta separación de responsabilidades para la página de verificación. ✅
- La función `createOrder` usa `create_order_secure` RPC correctamente, delegando el cálculo de `total_amount` al servidor. ✅

### D. Rendimiento
- `getTickets` trae TODOS los boletos de una rifa sin paginación (potencialmente miles de filas). Para la visualización del selector de boletos esto puede ser intencional (el usuario necesita ver todos), pero el tiempo de carga inicial con miles de boletos puede ser perceptible.

### F. Seguridad
- `create_order_secure` RPC protege el total en servidor. ✅
- `registerBuyer` con upsert directo a `buyers` desde cliente — a verificar en migraciones si RLS lo permite apropiadamente. ⚠️

---

## 37. `src/services/buyerService.ts`

### A. Qué hace
Gestión administrativa de compradores: listado paginado con búsqueda, historial de órdenes y tickets por comprador, y actualización de datos via RPC. Consumido por `BuyersView`, `AdminBuyerOrdersModal`, `AdminEditBuyerModal`.

### B. Errores y bugs reales

**1. `BuyerRow` se redefine localmente (línea 5) cuando ya existe en `raffle.types.ts`:**
```ts
export type BuyerRow = Database['public']['Tables']['buyers']['Row'];
```
`raffle.types.ts` ya exporta `BuyerRow`. Tener dos definiciones del mismo tipo en distintos archivos no causa error (son idénticas), pero es confuso y puede llevar a divergencias si alguna se actualiza y la otra no. **Duplicación innecesaria de tipo.**

**2. `fetchBuyersPaginated` hace un join `orders(id, status, total_amount, ticket_count)` embebido en la query de buyers:**
Este join trae TODAS las órdenes de CADA comprador en el rango de la página. Si un comprador tiene 50 órdenes, se descargan 50 filas de órdenes sólo para contar y sumar. Para una página de 20 compradores, esto puede ser hasta 1.000 filas extra. Mejor usar una subquery/VIEW en la BD con los agregados precalculados.

**3. `fetchBuyerOrdersHistory` hace 2 queries secuenciales (órdenes → tickets):**
Podrían paralelizarse con `Promise.all([ordersQuery, ticketsQuery])` para reducir la latencia percibida a la mitad.

**4. En `updateBuyerAdmin`, el resultado exitoso construye `BuyerItem` con `created_at: new Date().toISOString()` (línea 316):**
```ts
created_at: new Date().toISOString(),  // ← incorrecto
updated_at: new Date().toISOString(),
```
`created_at` se sobreescribe con el timestamp actual en vez de mantener el valor original del comprador. Si la vista del admin muestra la fecha de registro del comprador desde este objeto devuelto, mostrará la fecha de la última edición, no la de creación.

**5. `as unknown as RawBuyerWithOrders[]` (línea 119) — doble casting agresivo:**
```ts
const rawList = (data || []) as unknown as RawBuyerWithOrders[];
```
Necesario porque el cliente TS de Supabase no puede inferir joins embebidos. Aceptable como workaround, pero documenta que el tipado del join está perdido.

### C. Calidad de código
- La interfaz `RawBuyerWithOrders` se define dentro de la función `fetchBuyersPaginated` (líneas 115–117) — sería más legible como interfaz de módulo.
- Lo mismo aplica a `RawOrderWithRaffle` definida dentro de `fetchBuyerOrdersHistory` (líneas 229–235).
- La búsqueda con `ilike` en 5 columnas simultáneas sin índices full-text puede ser lenta en tablas grandes. Mejor usar `pg_trgm` o `to_tsvector` para búsquedas multi-campo.

### D. Rendimiento
- Join de órdenes en query de compradores sin agregación en servidor.
- 2 queries secuenciales en historial de comprador.

### F. Seguridad
- `fetchBuyersPaginated` accede directamente a `buyers` y `orders` — requiere que el admin esté autenticado y que RLS proteja estas tablas para anon key. A verificar en migraciones.

---

## 38. `src/services/adminUserService.ts`

### A. Qué hace
Gestión de usuarios administradores: listado, invitación y activación/desactivación. Todo via RPCs seguras. Consumido por `SettingsView` y `AdminInviteUserModal`.

### B. Errores y bugs reales

**1. `data as unknown as AdminUsersResponse` — double casting (línea 58):**
```ts
const payload = data as unknown as AdminUsersResponse;
```
Misma necesidad que en otros servicios: la RPC devuelve `Json` y hay que castear. Funciona mientras la RPC devuelva exactamente esa forma.

**2. `AdminUserItem.full_name: string` (no nullable, línea 7) pero en `database.types.ts` `full_name` es `string | null`:**
Hay una discrepancia de tipos: la tabla real tiene `full_name` nullable, pero `AdminUserItem` lo declara como `string` requerido. Si `admin_list_users` RPC devuelve un admin con `full_name: null`, el frontend recibirá `null` en un campo que TypeScript no espera que sea null. Sin `strict: true`, esto no se detecta en compilación.

**3. Sin validación de `adminUserId` antes de llamar `toggleAdminUserStatus`:**
La función acepta cualquier string como `adminUserId` sin verificar que sea un UUID válido. Si se pasa vacío o malformado, la RPC fallará con mensaje técnico en vez de un error descriptivo.

### C. Calidad de código
- El patrón es consistente en los 3 métodos: llamar RPC → verificar error de Supabase → castear payload → verificar `payload.success`. ✅
- Los mensajes de error son descriptivos y en español. ✅
- Sin `console.log` de debug sobrante. ✅

### D–F. — Sin hallazgos adicionales relevantes.

---

## 39. `src/services/partnerService.ts`

### A. Qué hace
CRUD completo de aliados (partners) + upload de logos a Supabase Storage. Acceso directo a tabla `partners` para todas las operaciones (sin RPC). Consumido por `PartnersView`, `FilaAliados`.

### B. Errores y bugs reales

**1. `createPartner`, `updatePartner`, `togglePartnerActive` y `deletePartner` acceden directamente a `partners` desde el cliente:**
```ts
await supabase.from('partners').insert(...)
await supabase.from('partners').update(...)
await supabase.from('partners').delete().eq('id', id)
```
No hay RPC para estas operaciones — se usa acceso directo con anon key. La seguridad depende 100% de que las políticas RLS de `partners` requieran rol admin para INSERT/UPDATE/DELETE. A verificar en migración 025. Si las políticas están bien, funciona. Si no, cualquier usuario puede manipular aliados.

**2. `deletePartner` no tiene confirmación de integridad referencial:**
Si el aliado tiene registros relacionados (fotos de premios, órdenes que lo referencian, etc.), el DELETE puede fallar silenciosamente o dejar datos huérfanos dependiendo de las FK constraints. El error de la BD llegaría al usuario como mensaje técnico inglés de PostgreSQL.

**3. `uploadPartnerLogo` usa `upsert: true` en el Storage:**
```ts
await supabase.storage.from('partner-logos').upload(filePath, file, { upsert: true })
```
Si dos admins suben un logo con el mismo slug al mismo tiempo, el segundo sobreescribirá el primero sin advertencia. El `Date.now()` en el nombre debería evitar colisiones, pero si se sube el mismo logo dos veces en el mismo milisegundo (extremadamente improbable), ocurriría.

**4. `getPublicUrl` no verifica que el archivo realmente exista:**
```ts
const { data: publicData } = supabase.storage.from('partner-logos').getPublicUrl(filePath);
return { success: true, url: publicData.publicUrl };
```
`getPublicUrl` siempre devuelve una URL sin verificar que el upload fue exitoso. Si `uploadError` es null pero el archivo no se subió (raro pero posible en condiciones de red), se devolverá una URL rota.

### C. Calidad de código
- `generatePartnerSlug` usa normalización Unicode (`NFD`) para manejar tildes y ñ — correcta internacionalización para nombres en español. ✅
- `updatePartner` hace un spread de `updates` y luego sobreescribe campos específicos — si `updates` incluye campos que no deberían actualizarse directamente (como `id` o `created_at`), podrían colarse. Sería más seguro hacer un pick explícito de los campos permitidos en vez del spread.
- `filePath = \`${fileName}\`` en línea 235 es una asignación de template literal innecesaria — `const filePath = fileName` sería equivalente.

### D. Rendimiento
- `getActivePartners` y `getAllPartnersAdmin` traen `select('*')` con todas las columnas incluyendo URLs largas y descripciones. Para listados con muchos aliados, sería mejor seleccionar sólo las columnas necesarias para cada vista.

### F. Seguridad
- Operaciones CRUD directas sin RPC — dependencia total de políticas RLS correctas en migración 025. ⚠️
- El bucket `partner-logos` debería ser público para lectura (logos visibles), pero el upload debería requerir autenticación admin. A verificar en configuración de Storage.

---

## Resumen del Lote 4

| Archivo | Estado | Severidad máx. | Nota |
|---------|--------|----------------|------|
| `authService.ts` | ⚠ mejorable | Media | UPDATE sin manejar error; `getInitialAdminSession` posiblemente muerta; `translateAuthError` incompleto |
| `settingsService.ts` | ⚠ mejorable | Media | Número de WhatsApp de prueba como default visible en producción |
| `raffleService.ts` | 🐛 con bugs | **Alta** | Descarga TODOS los tickets para calcular stats en memoria; truthy-falsy bug en `totalTickets \|\| 1000` |
| `ticketService.ts` | 🐛 con bugs | **Alta** | `getActiveRaffle` muestra rifas no-activas al público; `registerBuyer` con upsert directo a BD; firma de `createOrder` confusa; import en mitad de archivo; valores hardcodeados en fallbacks |
| `buyerService.ts` | ⚠ mejorable | Media | `BuyerRow` redefinida (duplicación); `created_at` sobreescrito al actualizar; queries secuenciales paralelizables; join sin agregación en servidor |
| `adminUserService.ts` | ⚠ mejorable | Media | `full_name` nullable vs tipo que dice `string`; sin validación de UUID en toggle |
| `partnerService.ts` | ⚠ mejorable | Media | CRUD directo a tabla sin RPC (depende de RLS); spread de `updates` puede colar campos no deseados; `getPublicUrl` sin verificación de existencia |

### Top hallazgos de este lote

1. **🔴 ALTO:** `raffleService.fetchAdminRaffles` — descarga toda la tabla de `tickets` al cliente para calcular stats. Con rifas de miles de boletos, esto es un cuello de botella de rendimiento/costo serio.

2. **🔴 ALTO:** `ticketService.getActiveRaffle` — el fallback a "la rifa más reciente" puede mostrar rifas en `draft`, `closed` o `finished` a los usuarios públicos. Si no hay rifa activa, debería mostrar un estado vacío, no una rifa incorrecta.

3. **🟠 MEDIO:** `ticketService.createOrder` — firma de función confusa con parámetro `_clientTotalAmountIgnored` vestigial y doble fuente para los datos del comprador. Riesgo de errores de uso.

4. **🟠 MEDIO:** `ticketService.registerBuyer` — upsert directo a `buyers` desde cliente. Si RLS no está bien configurado, superficie de seguridad.

5. **🟠 MEDIO:** `buyerService.updateBuyerAdmin` — `created_at` se sobreescribe con la fecha actual, corrompiendo la fecha de registro del comprador en las vistas.

6. **🟠 MEDIO:** `settingsService.DEFAULT_SYSTEM_SETTINGS` — número de WhatsApp `573001234567` visible en producción si la BD no carga.

7. **🟡 BAJO:** `raffleService` — truthy-falsy bug: `r.total_tickets || 1000` fallará cuando `total_tickets === 0`.

8. **🟡 BAJO:** `ticketService` — import en medio del archivo (línea 246).

9. **🟡 BAJO:** `adminUserService` — `AdminUserItem.full_name` declarado como `string` cuando la BD permite `null`.

10. **🟡 BAJO:** `buyerService` — `BuyerRow` redefinida localmente, duplicando el tipo de `raffle.types.ts`.

