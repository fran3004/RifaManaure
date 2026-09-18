# Auditoría — Lote 5: Servicios (parte 2)

> Fecha: 2026-09-17 | Estado: ✅ Completo

---

## 40. `src/services/paymentService.ts`

### A. Qué hace
El servicio más grande del proyecto (1516 líneas, 43 KB). Centraliza:
- CRUD de cuentas de pago (`payment_accounts`)
- Validación y subida de comprobantes al bucket privado `payment-proofs`
- Aprobación/rechazo/cancelación de órdenes vía RPC
- Consulta paginada de órdenes, tickets y audit logs para el admin
- Métricas del dashboard (con RPC + fallback manual)
- Bloqueo/desbloqueo administrativo de boletos

### B. Errores y bugs reales

**1. `fetchAdminOrders` (L674–733) — función no paginada que carga TODAS las órdenes:**
```ts
export async function fetchAdminOrders(...): Promise<OrderWithDetails[]>
```
Esta función existe en paralelo a `fetchAdminOrdersPaginated`. Carga todas las órdenes sin límite. Cualquier componente que la use en lugar de la versión paginada cargará todo el dataset de órdenes. Con órdenes de varios meses y miles de compradores, esto es inviable. **A verificar en lotes de vistas admin cuál de las dos usa cada vista.**

**2. `fetchAdminTicketsWithDetails` (L1278–1329) — función no paginada que carga TODOS los boletos:**
```ts
export async function fetchAdminTicketsWithDetails(): Promise<AdminTicketWithDetails[]>
```
Ídem: carga absolutamente todos los boletos de todas las rifas con joins de compradores y órdenes. Sin filtro de rifa, sin paginación. La versión paginada `fetchAdminTicketsPaginated` existe y debe usarse en su lugar.

**3. `fetchAdminTicketCounts` (L1096–1135) — tercera descarga masiva de tickets:**
```ts
const { data } = await supabase.from('tickets').select('status');
```
Trae todos los tickets (solo `status`) para contar por categoría. Patrón idéntico al de `raffleService.fetchAdminRaffles`. La RPC `get_dashboard_kpis` ya calcula estos conteos — debería usarse en vez de este fetch masivo.

**4. `fetchAdminDashboardMetrics` — fallback que descarga tickets Y órdenes masivamente (L806–893):**
El fallback manual (cuando la RPC falla) hace:
- `supabase.from('tickets').select('status')` — todos los tickets sin paginación
- `supabase.from('orders').select('status, total_amount')` — todas las órdenes

Este es el mismo anti-patrón de descarga masiva, esta vez como código de respaldo. El valor hardcodeado `totalTickets: 1000` en el fallback del fallback (L877–892) es llamativo — si el sistema tiene 500 boletos, el dashboard mostraría `1000` como total.

**5. `cancelOrder` (L899–937) — fallback directo con UPDATE múltiple sin transacción:**
```ts
// Si la RPC falla, fallback directo:
await supabase.from('orders').update({ status: 'cancelled', ... }).eq('id', orderId);
await supabase.from('tickets').update({ status: 'available', ... }).eq('order_id', orderId);
```
Si el primer UPDATE tiene éxito pero el segundo falla, la orden queda en `'cancelled'` pero los tickets siguen `'reserved'` o `'sold'` — **estado inconsistente permanente** en la BD. Los dos UPDATEs deben ser atómicos (dentro de una transacción o RPC). El fallback introduce un bug de integridad de datos real.

**6. `adminBlockTicket` y `adminUnblockTicket` — mismo patrón de fallback peligroso:**
Ambas funciones siguen el patrón: RPC → fallback con UPDATE directo + INSERT en `audit_logs`. Si el fallback de `audit_logs.insert` falla después del `tickets.update`, el ticket queda modificado sin registro de auditoría. No es atómico. (L1394–1417 y L1466–1489).

**7. `getSignedProofUrl` — el fallback al bucket `'receipts'` legacy puede retornar URLs expiradas:**
```ts
// Fallback al bucket anterior si la migración de storage aún se está procesando
const { data: legacyData } = await supabase.storage.from('receipts').createSignedUrl(cleanPath, expiresInSeconds);
```
El bucket `'receipts'` mencionado como "legado" sigue en uso como fallback activo. Si hay comprobantes en ambos buckets, el código intenta primero `'payment-proofs'` y luego `'receipts'`. Esta migración de bucket parece incompleta — hay datos en dos lugares distintos.

**8. `submitOrderReceipt` (L404–437) — función de compatibilidad con datos hardcodeados:**
```ts
p_file_size: 1024,          // ← hardcodeado, no es el tamaño real
p_mime_type: 'image/jpeg',  // ← hardcodeado, no es el tipo real
```
Si esta función se usa (es "de compatibilidad"), registra metadata incorrecta del comprobante en `payment_proofs`. El tamaño `1024` (1 KB) no refleja el archivo real.

**9. `fetchAuditLogsPaginated` (L962–1031) — SQL injection potencial via interpolación de string:**
```ts
query = query.or(
  `entity_id.in.(${matchIds.join(',')}),details->>'raffle_id'.eq.${raffleId}`
);
```
`matchIds` viene de una query previa a la BD (IDs de órdenes), por lo que no es entrada directa del usuario. Sin embargo, el patrón de interpolar UUIDs en strings de filtro es frágil. Si algún ID contuviera caracteres especiales (improbable con UUIDs v4 pero posible con otros formatos), podría romper la query. Bajo en práctica pero es un code smell.

**10. `fetchAdminOrdersPaginated` (L551–669) — búsqueda con subquery extra:**
```ts
// Si hay searchTerm:
const { data: matchedBuyers } = await supabase.from('buyers').select('id').or(...).limit(150);
```
La búsqueda hace una query extra a `buyers` antes de la query principal de órdenes. Esto añade latencia perceptible en cada búsqueda. Mejor hacer el filtro con un JOIN directo o una vista materializada.

### C. Calidad de código
- **El archivo tiene 1516 líneas y debería dividirse.** Es un "servicio God" que mezcla: gestión de comprobantes + gestión de cuentas + gestión de órdenes + gestión de tickets + dashboard + auditoría. Debería separarse en al menos 4 archivos: `orderService`, `ticketAdminService`, `dashboardService`, `proofService`.
- Existen funciones duplicadas con y sin paginación para la misma entidad: `fetchAdminOrders` / `fetchAdminOrdersPaginated`, `fetchAdminTicketsWithDetails` / `fetchAdminTicketsPaginated`, `fetchAuditLogs` / `fetchAuditLogsPaginated`. El patrón "versión legacy + versión paginada" genera confusión sobre cuál usar.
- La RPC `get_dashboard_kpis` se usa correctamente como primer intento ✅. El fallback manual es el problema.
- Validaciones de archivo en `validateProofFile` bien separadas como función pura exportable. ✅
- `MAX_PROOF_FILE_SIZE`, `ALLOWED_PROOF_MIME_TYPES`, `ALLOWED_PROOF_EXTENSIONS` como constantes exportadas — buena práctica. ✅
- `fetchAdminDashboardMetrics` tiene doble normalización de nombres de campo (`ticketsSold ?? tickets_sold`) para soportar respuestas en camelCase y snake_case de la RPC — señal de que el formato de la RPC no está estabilizado.

### D. Rendimiento
- 4 funciones distintas que descargan tickets masivamente al cliente: `fetchAdminRaffles` (Lote 4), `fetchAdminTicketCounts`, `fetchAdminTicketsWithDetails`, fallback de `fetchAdminDashboardMetrics`. El anti-patrón está sistematizado.

### F. Seguridad
- El bucket `payment-proofs` usa URLs firmadas temporales (15 min) para acceso privado. ✅
- El bucket `partner-logos` (Lote 4) es público pero `payment-proofs` es privado. ✅
- `validateProofFile` valida tanto la extensión como el MIME type. ✅

---

## 41. `src/services/emailService.ts`

### A. Qué hace
Envío de emails transaccionales vía Supabase Edge Function → Resend. Patrón Provider con interfaz `EmailProvider`. Logging de notificaciones en `notification_logs`.

### B. Errores y bugs reales

**1. `getOrderEmailLogs` es funcionalmente idéntica a `getOrderNotificationLogs` en `notificationService.ts`:**
Ambas funciones consultan `notification_logs` filtrando por `order_id` con el mismo `.select('*').order('created_at', { ascending: false })`. **Función duplicada entre servicios.** Una debería llamar a la otra o ambas deberían consolidarse.

**2. `NotificationLogRow` se exporta desde `emailService.ts` e importada por `notificationService.ts`:**
`notificationService.ts` importa `NotificationLogRow` de `emailService` (línea 27 de notificationService). Este acoplamiento entre servicios es incorrecto — `NotificationLogRow` debería venir de `database.types.ts` o `raffle.types.ts`, no de un servicio de email.

**3. Import de `Database` en mitad del archivo (línea 25):**
```ts
export type EmailEventType = '...'
export interface EmailSendResult { ... }

import type { Database } from '@/database.types';  // ← import en mitad del archivo
```
Igual que el bug reportado en `ticketService.ts` (Lote 4). Los imports deben ir al inicio.

### C. Calidad de código
- Patrón Provider con `EmailProvider` interface — correcto para hacer el proveedor intercambiable sin modificar la lógica de negocio. ✅
- `defaultEmailProvider` como singleton exportado — correcto. ✅
- Las funciones de conveniencia (`sendPaymentReceivedEmail`, etc.) son simples wrappers — limpio. ✅
- `isRetry` como parámetro en `sendOrderEmail` — bien, permite que la Edge Function sepa si es un reintento y evite duplicar logs.

---

## 42. `src/services/notificationService.ts`

### A. Qué hace
Orquestador de notificaciones: construye mensajes de WhatsApp, coordina envío de emails, registra trazabilidad en `notification_logs`. Combina `whatsappService` y `emailService`. Importado por las vistas de admin cuando aprueban/rechazan órdenes.

### B. Errores y bugs reales

**1. El registro de WhatsApp como `status: 'sent'` es semánticamente incorrecto (L360):**
```ts
status: hasPhone ? 'sent' : 'failed',
```
WhatsApp en este sistema es un enlace `wa.me` que el admin abre manualmente. No hay API real de envío. Registrar `'sent'` implica que el mensaje llegó, cuando en realidad sólo se generó el enlace. El estado real debería ser algo como `'link_generated'` o `'pending_manual_dispatch'`. Esto distorsiona los datos de trazabilidad.

**2. En `retryNotification` para WhatsApp, el log registra `status: 'sent'` (L446) aunque el mensaje NO se envió automáticamente:**
Mismo problema que el punto anterior — se registra como enviado un enlace que el admin debe abrir manualmente.

**3. `retryNotification` para WhatsApp genera un mensaje con `ticketNumbers: []` y `totalAmount: 0` (L432–439):**
```ts
generateOrderNotification(typeMapping[normalizedType], {
  reference: data?.orderReference || 'N/A',
  buyerName: data?.buyerName || 'Comprador',
  buyerPhone: phone,
  ticketNumbers: [],   // ← vacío
  totalAmount: 0,      // ← cero
  rejectionReason: data?.reason,
})
```
El mensaje de reintento de WhatsApp generado no incluye los números de boletos ni el monto. El comprador recibiría un mensaje de confirmación sin los datos más importantes. **Bug real en la experiencia del usuario.**

**4. `recordNotificationLog` usa upsert con `idempotency_key` pero la key puede colisionar:**
```ts
const key = input.idempotencyKey || `${input.channel}-${normalizedType}/${input.orderId}`;
```
Para una orden que recibe dos notificaciones del mismo tipo y canal (ej: dos reintentos de email de aprobación), la key es la misma. El upsert actualizará el mismo registro en lugar de crear uno nuevo. **El conteo de `attempts` se incrementa** (L122: `(existing.attempts || 1) + 1`) pero el historial no queda como líneas separadas — sólo hay una entrada por canal+tipo+orden, con el último estado. Esto puede ocultar fallos intermedios de la trazabilidad.

**5. `DEFAULT_RAFFLE_TITLE = 'Gran Rifa Manaure Balcón del Cesar'` — valor hardcodeado diferente al de `ticketService` (que usa 'Gran Rifa Ecoturística Manaure Vive'):**
Hay dos versiones hardcodeadas del nombre de la rifa en dos archivos distintos. Si alguna cambia, el otro seguirá con el nombre viejo. Ambos son fallbacks que deberían venir de `systemSettings` o de los datos de la rifa.

### C. Calidad de código
- `normalizeEventType` centraliza la conversión de mayúsculas/minúsculas para eventos. ✅ Esto resuelve parcialmente el problema del `event_type` duplicado en la tabla (visto en Lote 3).
- `dispatchOrderNotifications` cumple la regla crítica: el fallo de notificación nunca revierte la transacción. ✅
- Las 3 funciones de plantilla de mensaje (`buildReceiptReceivedMessage`, `buildPaymentApprovedMessage`, `buildPaymentRejectedMessage`) son puras y bien documentadas. ✅
- `void recordNotificationLog(...)` — el `void` es intencional para no bloquear el flujo principal. Correcto. ✅

---

## 43. `src/services/whatsappService.ts`

### A. Qué hace
Abstracción del canal WhatsApp: generación de links `wa.me`, y proveedor preparado para futura integración con WhatsApp Business Cloud API. Sin lógica de negocio propia.

### B. Errores y bugs reales

**1. `formatPhoneForWhatsApp` no maneja el prefijo `+57` (con `+`):**
```ts
const clean = phone.replace(/\D/g, '');
if (clean.startsWith('57') && clean.length > 10) {
  return clean;
}
return `57${clean}`;
```
Si el teléfono es `+573001234567`, `replace(/\D/g, '')` produce `573001234567` (12 dígitos). La condición `startsWith('57') && length > 10` es verdadera, devuelve `573001234567`. ✅ Correcto.

Si el teléfono es `3001234567` (10 dígitos), devuelve `573001234567`. ✅ Correcto.

Si el teléfono es `57 300 123 4567` (con espacios), produce `573001234567`. ✅ Correcto.

**Pero:** si el teléfono es `300 123 4567` (10 dígitos con espacios), produce `3001234567` (10 dígitos). `startsWith('57')` → false → devuelve `573001234567`. ✅ Correcto.

**Sin hallazgos funcionales reales.** El único edge case dudoso: teléfonos con `+1`, `+34` u otros prefijos internacionales se les añadiría `57` incorrectamente. Pero el sistema es colombiano y probablemente sólo maneja números colombianos.

**2. `WhatsAppBusinessCloudProvider.sendDirectMessage` llama a `this.apiUrl!` con `!` forzado (L92):**
```ts
const response = await fetch(this.apiUrl!, { ... });
```
`isConfigured()` ya verifica que `apiUrl` existe antes de llamar `sendDirectMessage`, por lo que el `!` nunca debería dispararse. Pero si alguien llama `sendDirectMessage` directamente sin pasar por `isConfigured()`, TypeScript no lo detecta. El riesgo real es bajo dado que es un proveedor futuro no activo.

### C. Calidad de código
- Arquitectura Provider correcta y extensible. ✅
- `openWhatsApp` verifica `typeof window !== 'undefined'` — SSR safe. ✅
- El registro de proveedores como singleton (L126–133) es limpio. ✅
- **`WhatsAppBusinessCloudProvider` es código muerto actualmente** — su `isConfigured()` sólo devuelve `true` si hay `VITE_WHATSAPP_API_ENDPOINT` en `.env`, que no está presente en `.env.example`. La integración real con la Cloud API no está activa.

---

## 44. `src/services/winnerService.ts`

### A. Qué hace
Gestión de ganadores: consulta, registro vía RPC, búsqueda de candidatos, upload de actas PDF y fotos de entrega. También tiene funciones de enmascaramiento (`maskBuyerName`, `maskDocumentId`, `maskPhone`) para la exhibición pública.

### B. Errores y bugs reales

**1. `maskBuyerName`, `maskDocumentId`, `maskPhone` son funciones duplicadas de `lib/utils.ts`:**
`utils.ts` ya exporta `maskDocumentId`, `maskFullName`, `maskEmail`, `maskPhone`. `winnerService.ts` define sus propias versiones con lógica similar pero diferente:
- `winnerService.maskDocumentId` devuelve `"C.C. 1065******"` (4 dígitos + 6 asteriscos)
- `utils.maskDocumentId` devuelve un formato diferente (calculado con `Math.floor(length/3)`)
**Hay dos implementaciones de enmascaramiento con resultados diferentes para el mismo dato.** El panel de ganadores y la página de verificación pública pueden mostrar formatos distintos para el mismo documento.

**2. `getWinnerForRaffle` devuelve sólo 1 ganador (con `.limit(1).maybeSingle()`) ordenado por `draw_date` descendente:**
Si una rifa tiene múltiples ganadores registrados (posible si hay premios 2° y 3°, o si se registró por error), sólo se muestra el más reciente. No hay validación de "un único ganador por rifa". El componente público que muestre el ganador asume que sólo hay uno.

**3. `searchWinningTicketCandidate` acepta boletos con status `'sold'` pero no verifica que la orden esté en estado `'paid'` o `'completed'`:**
Un ticket puede estar `'sold'` con una orden `'rejected'` si hubo un bug previo en el flujo. La búsqueda del candidato devolvería ese ticket como ganador válido cuando en realidad el pago fue rechazado.
*(Verificado en el código: L236 chequea `data.status !== 'sold'` pero no el status de la orden del ticket.)*

**4. `uploadWinnerActDocument` y `uploadWinnerDeliveryPhoto` usan `getPublicUrl` sin verificar existencia del archivo (mismo patrón que `partnerService`):**
El acta oficial del ganador termina con una URL pública de un bucket que debería ser privado o con acceso controlado. Si `winner-documents` es público, cualquiera con la URL podría descargarlo.

**5. El campo `delivery_photos` en la BD es `string[]` pero se construye subiendo fotos individualmente:**
Cada llamada a `uploadWinnerDeliveryPhoto` devuelve una URL. El código que llama esta función debe ensamblar el array y actualizar el registro del ganador. No hay función que haga el update atómico de `delivery_photos`. A verificar cómo se usa en la vista de ganadores (Lote 14/15).

### C. Calidad de código
- Manejo correcto del caso de join ambiguo (`Array.isArray(data.order)`) en `searchWinningTicketCandidate` — buena defensa ante el comportamiento de Supabase con joins. ✅
- `paddedNum = cleanNum.padStart(3, '0')` — busca tanto el número como su versión con padding. ✅

---

## 45. `src/services/receiptGeneratorService.ts`

### A. Qué hace
Genera comprobantes digitales de pago en formato Canvas 2D (1080×1440 px) con diseño de alta resolución. Permite descargar como PNG o imprimir como PDF vía `window.print()`.

### B. Errores y bugs reales

**1. `printOrSavePdfDigitalReceipt` usa `document.write()` para insertar HTML en una ventana nueva (L302–343):**
```ts
printWindow.document.write(`<!DOCTYPE html>...`);
```
`document.write()` en ventanas nuevas puede fallar o producir comportamiento inconsistente en navegadores modernos (especialmente Chrome 100+). El estándar recomendado es usar `printWindow.document.body.innerHTML` o crear un Blob URL con `URL.createObjectURL`. En Safari iOS puede causar pantalla en blanco.

**2. El texto "manaurevive.com/verificar" está hardcodeado en el canvas (L262):**
```ts
ctx.fillText('Verifica la validez de este comprobante en: manaurevive.com/verificar', ...);
```
Si el dominio cambia o se usa un entorno de staging, el comprobante mostrará una URL incorrecta. Debería usar `window.location.origin` o una variable de entorno.

**3. El canvas tiene altura fija de 1440px pero el grid de boletos puede excederla para >20 tickets:**
El grid ocupa hasta 4 filas × 65px + gaps, lo que para 20 boletos usa aproximadamente 340px. Si hay más de 20 boletos, se muestra "+" en L219–224 pero el canvas no se redimensiona dinámicamente. Para compras de 10–20 boletos el diseño encaja, pero el código hardcodea las posiciones Y de cada sección. Si se aumentan los boletos máximos por comprador, el comprobante podría estar mal diagramado.

**4. `downloadDigitalReceiptImage` usa `document.body.appendChild(link)` + `click()` (L284–286):**
Patrón válido pero puede fallar en algunos entornos de iframe o CSP estrictos que bloqueen `document.body` modificado desde JavaScript. La alternativa más moderna y segura es `link.dispatchEvent(new MouseEvent('click'))` sin attachear al DOM.

**5. `getWhatsAppShareText` incluye la URL `https://manaurevive.com/verificar?ref=${data.orderReference}` hardcodeada (L361):**
Mismo problema que el punto 2 — URL de producción hardcodeada que no funcionará en desarrollo o staging.

### C. Calidad de código
- El canvas está correctamente dimensionado para alta resolución (1080×1440). ✅
- `loadImage` como promesa — correcto manejo del `img.onload`. ✅
- Validación de `orderStatus !== 'paid' && !=='completed'` antes de generar el canvas — correcta protección contra generación de comprobantes de órdenes no pagadas. ✅
- El fallback tipográfico si el logo no carga (`ctx.fillText('MANAURE VIVE', ...)`) — buena práctica defensiva. ✅
- Colores hardcodeados en el canvas (`#0a1712`, `#f59e0b`, `#34d399`, etc.) — inevitable para Canvas 2D, pero no usan las variables CSS del sistema de diseño. Inconsistencia visual si los colores del brand cambian.
- `ctx.roundRect()` — disponible en Chrome 99+, Firefox 112+, Safari 15.4+. En navegadores más antiguos puede fallar. Sin polyfill.

### D. Rendimiento
- Generar un canvas de 1080×1440 con múltiples gradientes, texto y una imagen puede tardar 200–500ms en móviles de gama baja. No hay feedback de carga antes de que el canvas termine. Si el logo tarda en cargar, la descarga se bloquea.

### F. Seguridad
- No envía datos al servidor — toda la generación es cliente-side. ✅
- Los datos del comprobante ya fueron mascarados antes de llegar a este servicio (`buyerDocumentMasked`). ✅

---

## Resumen del Lote 5

| Archivo | Estado | Severidad máx. | Nota |
|---------|--------|----------------|------|
| `paymentService.ts` | 🐛 con bugs | **Alta** | Anti-patrón de descarga masiva en 3 funciones adicionales; `cancelOrder` fallback no atómico; God File de 1516 líneas; funciones legacy sin paginar conviviendo con las paginadas |
| `emailService.ts` | ⚠ mejorable | Media | `getOrderEmailLogs` duplicada con `notificationService`; import en mitad del archivo; acoplamiento incorrecto de `NotificationLogRow` |
| `notificationService.ts` | 🐛 con bugs | **Alta** | WhatsApp registrado como `'sent'` cuando es sólo un enlace; reintento de WA genera mensaje sin boletos ni monto; `DEFAULT_RAFFLE_TITLE` diferente al de `ticketService` |
| `whatsappService.ts` | ✅ OK | — | Sin bugs reales; `WhatsAppBusinessCloudProvider` es código futuro inactivo |
| `winnerService.ts` | 🐛 con bugs | **Alta** | `maskBuyerName/maskDocumentId/maskPhone` duplicadas con formatos distintos a `utils.ts`; `searchWinningTicketCandidate` no valida status de la orden; `getPublicUrl` sin verificación de existencia para documentos sensibles |
| `receiptGeneratorService.ts` | ⚠ mejorable | Media | `document.write()` obsoleto; URL producción hardcodeada; `ctx.roundRect()` sin polyfill; canvas estático sin redimensión para >20 boletos |

### Top hallazgos de este lote

1. **🔴 ALTO:** `paymentService.ts` — 3 funciones adicionales que descargan toda la tabla de tickets al cliente (patrón sistémico: suma 4 funciones en total entre Lotes 4 y 5 con este anti-patrón). El archivo necesita refactoring urgente en cuanto a tamaño y separación de responsabilidades.

2. **🔴 ALTO:** `paymentService.cancelOrder` fallback — `orders.update` + `tickets.update` en dos queries no atómicas. Si la segunda falla, hay corrupción de estado en la BD.

3. **🔴 ALTO:** `winnerService` — dos implementaciones de enmascaramiento de datos personales con resultados diferentes (`maskDocumentId` de `utils.ts` vs. `maskDocumentId` de `winnerService.ts`). El panel y la página pública pueden mostrar formatos inconsistentes.

4. **🔴 ALTO:** `notificationService` — el reintento de WhatsApp genera un mensaje vacío (sin números de boletos ni monto). El comprador recibe una notificación de pago sin los datos relevantes.

5. **🟠 MEDIO:** `notificationService` — WhatsApp registrado como `'sent'` cuando es un enlace manual. Los datos de trazabilidad son engañosos.

6. **🟠 MEDIO:** `winnerService.searchWinningTicketCandidate` — no verifica que la orden del boleto ganador esté en estado `'paid'`. Podría registrar un ganador de una orden rechazada.

7. **🟠 MEDIO:** `receiptGeneratorService` — `document.write()` para la ventana de impresión PDF, obsoleto en navegadores modernos.

8. **🟡 BAJO:** `emailService` + `notificationService` — `getOrderEmailLogs` / `getOrderNotificationLogs` son funciones duplicadas. `NotificationLogRow` importada desde el servicio de email incorrecto.

9. **🟡 BAJO:** `receiptGeneratorService` — URLs de producción hardcodeadas en canvas y en el texto de WhatsApp sharing.

10. **🟡 BAJO:** `emailService` — import en mitad del archivo (segundo caso después del de `ticketService.ts`).

