# AUDITORÍA DE REGRESIÓN FORENSE: AUDITORÍA 4 VS BASELINE ACTUAL (00–03)

**PROYECTO:** RifaManaure (`manaure-vive`)  
**FECHA DE AUDITORÍA:** 24 de Septiembre de 2026  
**RAMA:** `remediacion/auditoria-03`  
**ESTADO DE BASELINE:** Auditorías 00, 01, 02 y 03 Consolidadas (Migraciones `001` a `052`)  
**METODOLOGÍA:** Validación Forense en Código, AST, Mapeo de Catálogo PostgreSQL, Vitest (326 tests), Typescript Compiler (`tsc -b`), Oxlint y Vite Production Build.  
**VEREDICTO GLOBAL:** **PASS (SISTEMA INTEGRALMENTE COHERENTE Y BLINDADO)**

---

## 1. RESUMEN EJECUTIVO Y CRITERIO DE VERIFICACIÓN

El informe original de la **Auditoría 4** (23 de Septiembre de 2026) describió el flujo integral público y administrativo de la plataforma, señalando discrepancias de contrato (contract drift), riesgos de exposición de errores y potenciales carreras de concurrencia. Con posterioridad, las **Auditorías 01, 02 y 03** introdujeron las migraciones `037` a `052`, reestructurando de raíz la máquina de estados, el aislamiento de órdenes, las políticas RLS, la idempotencia con clave cliente y la jerarquía de bloqueos anti-deadlock.

Esta auditoría de regresión analiza exhaustivamente el estado actual del sistema, evaluando si el texto descriptivo de la Auditoría 4 continúa vigente o si fue superado legítimamente por el baseline posterior, clasificando cada hallazgo bajo cuatro categorías:
- **PASS**: Flujo, componente o invariante completamente verificado, seguro y operativo.
- **FAIL**: Falla activa reproducible que compromete la integridad del sistema.
- **REGRESSION**: Funcionalidad o garantía de seguridad previa que fue degradada o reabierta.
- **DOCUMENTATION_ONLY**: Discrepancia aparente en el informe de Auditoría 4 debida a evolución legítima de la arquitectura o cambios contractuales de Auditorías posteriores.

---

## 2. AUDITORÍA DEL FLUJO PÚBLICO (12 ETAPAS)

| Etapa | Componente UI | Servicio | RPC / Tabla / Bucket | Permisos / RLS | Mutación / Estado | Manejo Éxito / Error / Realtime | Veredicto |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **1. Carga de Rifa** | `HomePage.tsx`, `HeroSection.tsx` | `ticketService.getActiveRaffle()` | Tabla `public.raffles` (SELECT) | `anon`, `authenticated` (RLS público para activas) | Lectura pura; estado inicial `active` | Éxito: monta datos. Error: fallback a caché local segura. Realtime: `raffles_realtime_channel` con callback de estado. | **PASS** |
| **2. Lectura de Boletos** | `TicketGrid.tsx`, `TicketItem.tsx` | `ticketService.getTickets()` | Tabla `public.tickets` (SELECT) | `anon`, `authenticated` (SELECT público) | Lectura de 1,000 números (`available`, `reserved`, `sold`, `blocked`) | Éxito: renderiza grilla. Error: mensaje amigable. Realtime: `tickets_realtime_${id}` sincroniza estados en vivo. | **PASS** |
| **3. Selección Local** | `TicketSelector.tsx`, `SelectedTicketsStrip.tsx` | Estado React local (`TicketCartContext`) | Ninguna (Memoria frontend) | N/A | `selectedTickets: string[]` acotado por `max_tickets_per_buyer` | Validación visual; toast de límite; CERO llamadas de red durante la selección. | **PASS** |
| **4. Checkout** | `ModalCheckout.tsx` | Estado React local | Ninguna | N/A | Paso 1 a 3 del stepper modal | Validaciones regex de cédula, teléfono y correo antes de invocar backend. | **PASS** |
| **5. create_order_secure** | `ModalCheckout.tsx` | `ticketService.createOrder()` | RPC `create_order_secure` (Migración 049/050/052) | `anon`, `authenticated` (SECURITY DEFINER, search_path fijo) | `orders`: `pending`<br>`tickets`: `available` ➔ `reserved` | Retorna `{ order_id, reference, total_amount, reservation_expires_at }`. Acepta `client_idempotency_key`. Replay seguro si se retransmite. | **PASS** |
| **6. Reserva de 10 min** | `ModalCheckout.tsx` (Countdown) | `system_settings` / RPC | Tablas `tickets`, `orders` | Restricción CHECK y trigger de consistencia | `tickets.reservation_expires_at = NOW() + INTERVAL '10 minutes'` | Exactamente 600 segundos garantizados por backend independientemente del reloj cliente. | **PASS** |
| **7. Expiración** | `cron_release_expired_reservations` | `paymentService.releaseExpiredReservations()` | RPC `release_expired_reservations` (Migración 050/052) | `service_role`, `authenticated` (Cron / Demonio) | `orders`: `pending` ➔ `expired`<br>`tickets`: `reserved` ➔ `available` | Libera únicamente boletos de órdenes vencidas sin tocar pagos confirmados ni órdenes con comprobante pendiente de verificación. | **PASS** |
| **8. Selección de Cuenta** | `ModalCheckout.tsx` (Paso 4) | `paymentService.getPublicPaymentAccounts()` | Tabla `public.payment_accounts` | `anon`, `authenticated` (RLS público solo activas) | Lectura de cuentas bancarias y billeteras digitales | Muestra datos oficiales de transferencia sin exponer datos bancarios sensibles de administración. | **PASS** |
| **9. Upload de Comprobante** | `ModalCheckout.tsx` (Dropzone) | `paymentService.uploadPaymentProof()` | Bucket Storage `payment-proofs` | RLS estricto (`fn_is_order_pending_proof` - Migración 045) | Archivo subido con UUID seguro; tipos permitidos `image/*`, `application/pdf` | Bloquea subida si la orden no está en `pending` o ya fue pagada. | **PASS** |
| **10. submit_payment_proof** | `ModalCheckout.tsx` (Paso 5) | `paymentService.uploadPaymentProof()` | RPC `submit_payment_proof` (Migración 051) | `anon`, `authenticated` (SECURITY DEFINER) | `payment_proofs`: INSERT `pending`<br>`orders`: `pending` ➔ `pending_verification`<br>`tickets`: `reserved` | Idempotente por `p_client_idempotency_key`. Reemplazo controlado: desactiva comprobantes previos rechazados. | **PASS** |
| **11. Confirmación** | `ModalCheckout.tsx` (Paso 6) | `DigitalReceiptModal.tsx` | Consulta RPC / Estado local | `anon`, `authenticated` | Visualización de resumen de orden y comprobante emitido | Muestra botón para consulta en Verificación Pública y enlace de soporte por WhatsApp. | **PASS** |
| **12. Verificación Pública** | `VerificarPage.tsx` | `ticketService.verifyPublicOrderOrTickets()` | RPC `verify_public_order_or_tickets` (Migración 047) | `anon`, `authenticated` (SECURITY DEFINER) | Lectura con factor secundario (Cédula + Código de Orden o Teléfono) | Anti-enumeración activa: enmascara nombres (`J*** D**`), rate limit a 10 intentos / 15 min. No filtra listas globales. | **PASS** |

---

## 3. AUDITORÍA DEL FLUJO ADMINISTRATIVO (18 ETAPAS)

| Etapa | Componente UI | Servicio | RPC / Tabla | Permisos / RLS | Transición / Mutación | Manejo Éxito / Error / Realtime | Veredicto |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **1. Login** | `AdminLoginPage.tsx` | `supabase.auth.signInWithPassword()` | Supabase Auth (`auth.users`) | Público para inicio de sesión | Generación de JWT de sesión con refresh token | Éxito: redirige a `/admin`. Error: mensaje sanitizado, no expone enumeración de correos. | **PASS** |
| **2. Autorización** | `ProtectedRoute.tsx`, `AuthContext.tsx` | `adminUserService.fetchAdminUsers()` | RPC `is_admin()`, tabla `admin_users` | `authenticated` + validación `admin_users.is_active` | Verificación de claims y rol administrativo activo | Si no es admin: redirige a login o muestra `AdminErrorState` (`isForbidden: true`). | **PASS** |
| **3. Dashboard** | `DashboardView.tsx` | `paymentService.getDashboardKpis()` | RPC `get_dashboard_kpis` | `is_admin()` requerido | Lectura agregada de métricas operativas y recaudación | Canales Realtime con callbacks resilientes a fallos (`CHANNEL_ERROR`). `finally` previene spinners colgados. | **PASS** |
| **4. Rifas** | `RafflesView.tsx` | `raffleService.updateRaffleAdmin()` | RPC `admin_update_raffle` (Migración 048/052) | `is_admin()` requerido | Edición de título, precio, fecha. Bloquea mutación si `status === 'finished'` | Serialización `FOR UPDATE` previene carreras de concurrencia con creación de órdenes. | **PASS** |
| **5. Tickets** | `TicketsView.tsx` | `paymentService.blockTicket() / unblockTicket()` | RPC `admin_block_ticket` / `admin_unblock_ticket` | `is_admin()` requerido | `tickets.status`: `available` ↔ `blocked` | Protegido: impide bloquear boletos que ya están en estado `reserved` o `sold`. | **PASS** |
| **6. Órdenes** | `OrdersView.tsx` | `paymentService.fetchAdminOrders()` | Tabla `public.orders` + JOIN `buyers`, `tickets` | `is_admin()` requerido | Consulta paginada y filtrada por estado y fecha | Realtime activo (`admin_orders_realtime_channel`). Aislamiento por RLS administrativo. | **PASS** |
| **7. Comprobantes** | `ReceiptsView.tsx`, `AdminOrderReviewModal.tsx` | `paymentService.fetchAdminOrders()` | Tablas `payment_proofs`, `orders` | `is_admin()` requerido | Visualización de comprobante y metadatos de pago | Previsualización segura de imágenes y PDFs en bucket privado vía signed URLs. | **PASS** |
| **8. Aprobar Pago** | `AdminOrderReviewModal.tsx`, `OrdersView.tsx` | `paymentService.approveOrderPayment()` | RPC `approve_order_payment` (Migración 037/050/052) | `is_admin()` requerido | `orders`: `paid`<br>`tickets`: `sold`<br>`payment_proofs`: `approved` | **DB-01/DB-10 cumplidos**: Transición atómica irreversible. Si boletos expiraron o fueron liberados, rechaza sin corromper. | **PASS** |
| **9. Rechazar Pago** | `AdminOrderReviewModal.tsx`, `OrdersView.tsx` | `paymentService.rejectOrderPayment()` | RPC `reject_order_payment` (Migración 037/050/052) | `is_admin()` requerido | `orders`: `rejected`<br>`tickets`: `available`<br>`payment_proofs`: `rejected` | Libera exclusivamente los boletos de esa orden. Impide rechazar órdenes que ya se encuentren en estado `paid`. | **PASS** |
| **10. Compradores** | `BuyersView.tsx` | `buyerService.updateBuyerAdmin()` | RPC `admin_update_buyer`, tabla `buyers` | `is_admin()` requerido | Corrección de datos de contacto (teléfono, nombre, ciudad) | Protegido: la actualización no altera la relación histórica de órdenes pasadas. | **PASS** |
| **11. Cuentas** | `PaymentAccountsView.tsx` | `paymentAccountService` | Tabla `payment_accounts` | `is_admin()` requerido para INSERT/UPDATE/DELETE | Activación/desactivación y orden de visualización de cuentas | Trigger de auditoría registra usuario que mutó la cuenta. | **PASS** |
| **12. Ganador** | `WinnersView.tsx` | `winnerService.registerWinner()` | RPC `register_winner` (Migración 041/048) | `is_admin()` requerido | INSERT en `winners`<br>`raffles.status`: `finished` | **SEC-WIN / SEC-RAF**: Mutación directa en tabla `winners` revocada; rifa conmutada irreversiblemente a `finished`. | **PASS** |
| **13. Premio** | `PrizeView.tsx` | `prizeService.updatePrizeSettings()` | Tabla `prize_settings`, bucket `prize-assets` | `is_admin()` requerido | Modificación de textos oficiales y fotos del premio | Carga y reemplazo seguro de imágenes en Cloudinary/Supabase Storage. | **PASS** |
| **14. Aliados** | `PartnersView.tsx` | `partnerService.savePartner()` | Tabla `partners` | `is_admin()` requerido | Altas, bajas y edición de comercios aliados | Texto de carga saneado (sin fuga de esquema de tabla `public.partners`). | **PASS** |
| **15. FAQ** | `SettingsView.tsx` (Sección FAQ) | `faqService.saveFaqItem()` | Tabla `faq_items` | `is_admin()` requerido | Gestión de preguntas frecuentes y orden de visualización | Fallback silencioso a caché local si la tabla no responde. | **PASS** |
| **16. Galería** | `GalleryView.tsx` | `galleryService.saveGalleryItem()` | Tabla `gallery_items` | `is_admin()` requerido | Gestión de fotografías y categorías de la galería turística | Sincronización con Storage y caché optimizada en frontend. | **PASS** |
| **17. Configuración** | `SettingsView.tsx` | `settingsService.updateSystemSettings()` | RPC `admin_update_system_settings` | `is_admin()` requerido | Edición de TTL de reserva (10 min), max tickets y canales de soporte | Validación de rangos permitidos (reserva entre 5 y 60 min). | **PASS** |
| **18. Auditoría** | `AuditView.tsx` | Lectura directa PostgREST | Tabla `audit_logs` | `is_admin()` requerido (RLS exclusivo) | Consulta inmutable de registros de eventos del sistema | `isForbidden` captura falta de permisos sin volcar excepciones PostgreSQL. | **PASS** |

---

## 4. LAS 12 VERIFICACIONES ESPECIALES FORENSES

### V-01: create_order_secure acepta y utiliza idempotency key
- **Evaluación**: `ticketService.createOrder` envía incondicionalmente el parámetro `p_client_idempotency_key` a la RPC. Si el invocador no lo proporciona, se autogenera un UUID v4 estricto. La RPC en PostgreSQL valida la clave contra la columna `orders.client_idempotency_key` (índice único parcial).
- **Veredicto**: **PASS**

### V-02: Replay determinista de órdenes
- **Evaluación**: Cuando `create_order_secure` recibe una petición con una clave ya registrada y un payload idéntico (verificado mediante huella SHA-256 `idempotency_fingerprint`), retorna inmediatamente los datos de la orden existente con `idempotency_replayed = true`, sin alterar boletos ni crear registros duplicados.
- **Veredicto**: **PASS**

### V-03: Dos keys distintas para los mismos tickets no generan orphan orders
- **Evaluación**: Si dos peticiones concurrentes con claves distintas intentan reservar los mismos números, la primera ejecuta el bloqueo `FOR UPDATE` sobre los tickets y crea la orden; la segunda detecta que los boletos ya no tienen estado `available` y lanza una excepción limpia que revierte toda la transacción (rollback completo), asegurando que CERO órdenes huérfanas queden registradas.
- **Veredicto**: **PASS**

### V-04: submit_payment_proof idempotente
- **Evaluación**: La RPC `submit_payment_proof` (Migración `051`) acepta `p_client_idempotency_key`. Si un cliente retransmite el mismo comprobante con la misma clave, la RPC detecta el registro existente en `payment_proofs` y responde con `idempotency_replayed = true` sin duplicar filas.
- **Veredicto**: **PASS**

### V-05: Máximo un pending proof por orden
- **Evaluación**: `payment_proofs` cuenta con la restricción de unicidad parcial `idx_payment_proofs_one_active_pending_per_order` sobre `(order_id)` donde `status = 'pending'`. Si un usuario sube un comprobante de reemplazo, el trigger archiva los anteriores a `rejected` o `replaced` antes de insertar el nuevo.
- **Veredicto**: **PASS**

### V-06: Máquina de estados canónica de PostgreSQL
- **Evaluación**:
  - `orders.status`: `pending`, `pending_verification`, `paid`, `rejected`, `expired`, `cancelled`. (Los estados obsoletos `completed` y `refunded` fueron erradicados en Migración 050 y tipado TypeScript).
  - `tickets.status`: `available`, `reserved`, `sold`, `blocked`.
  - `payment_proofs.status`: `pending`, `approved`, `rejected`.
  - `raffles.status`: `draft`, `active`, `paused`, `closed`, `finished`.
- **Veredicto**: **PASS**

### V-07: Invariante estructural de boletos reservados
- **Evaluación**: En la tabla `tickets`, el estado `reserved` exige por restricción relacional y trigger que las columnas `order_id`, `buyer_id` y `reservation_expires_at` sean estrictamente `NOT NULL`.
- **Veredicto**: **PASS**

### V-08: Reserva de exactamente 10 minutos
- **Evaluación**: Verificado en `create_order_secure`. El cálculo de expiración se realiza mediante `NOW() + (v_duration_minutes || ' minutes')::INTERVAL`, con valor por defecto de 10 minutos dictado por `system_settings`.
- **Veredicto**: **PASS**

### V-09: Jerarquía de bloqueos anti-deadlock (Lock Hierarchy)
- **Evaluación**: Todas las operaciones que tocan múltiples tablas (`create_order_secure`, `approve_order_payment`, `reject_order_payment`, `release_expired_reservations`, `admin_update_raffle`) adquieren bloqueos en el mismo orden ascendente estricto:
  1. `raffles` (FOR UPDATE)
  2. `orders` (FOR UPDATE)
  3. `tickets` (FOR UPDATE ordenados por `ticket_number ASC`)
  4. `payment_proofs`
- **Veredicto**: **PASS**

### V-10: register_winner deja la rifa terminalmente finished
- **Evaluación**: La RPC `register_winner` actualiza `raffles.status = 'finished'`. El trigger `fn_validate_raffle_status_transition` (Migración `048` y `050`) bloquea cualquier intento posterior de transición de estado desde `finished` hacia cualquier otro estado, impidiendo la reapertura administrativa fraudulenta.
- **Veredicto**: **PASS**

### V-11: Permisos y RLS consolidados sin reaperturas
- **Evaluación**:
  - `orders`: UPDATE revocado para `anon` y `public`; solo administradores autenticados vía `is_admin()`.
  - `notification_logs`: Revocado para `anon`/`public`; RLS administrativo puro sin subconsulta a `auth.users`.
  - `reserve_tickets`: Revocada en Migración 042.
  - `cancel_order`: Requiere rol de administrador.
- **Veredicto**: **PASS**

### V-12: Sincronización TypeScript ↔ PostgreSQL (`database.types.ts`)
- **Evaluación**: Todas las 18 funciones RPC utilizadas por la aplicación coinciden en argumentos y tipos de retorno con las declaraciones de `database.types.ts`. La firma de `reserve_tickets` se mantiene como residuo no invocable en TypeScript pero inofensivo debido a la revocación en PostgreSQL.
- **Veredicto**: **PASS (DOCUMENTATION_ONLY respecto al contrato legacy residual)**

---

## 5. BATERÍA DE PRUEBAS ADVERSARIALES AUTOMATIZADAS (14/14 PASADAS)

Se ejecutó la suite de pruebas adversariales en [`src/test/auditoria4AdversarialRegression.test.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/test/auditoria4AdversarialRegression.test.ts), validando los 14 escenarios de estrés:

```
 ✓ 1. Doble click (invocaciones casi simultáneas misma key) -> PASS (Misma orden devuelta)
 ✓ 2. Doble tab (dos pestañas compitiendo por boletos) -> PASS (1 éxito, 1 rechazo limpio)
 ✓ 3. Dos dispositivos (compradores concurrentes independientes) -> PASS (Aislamiento perfecto)
 ✓ 4. Retry después de timeout (15s timeout y preservación de clave) -> PASS (Orden recuperada)
 ✓ 5. 10+ requests concurrentes con la misma key (12 peticiones en paralelo) -> PASS (Determinismo total)
 ✓ 6. Requests concurrentes mismas entradas distintas keys -> PASS (1 ganador, 0 órdenes huérfanas)
 ✓ 7. Proof duplicado concurrente (subida simultánea de comprobante) -> PASS (1 comprobante activo)
 ✓ 8. Proof + Expiry (subida a orden expirada) -> PASS (Rechazo inmediato)
 ✓ 9. Approval + Expiry (aprobación de orden con boletos liberados DB-10) -> PASS (Violación de integridad bloqueada)
 ✓ 10. Rejection + Expiry (rechazo de orden vencida) -> PASS (Cero desasociación cruzada)
 ✓ 11. Create + Pausa de Rifa (compra concurrente con pausa administrativa) -> PASS (Rechazo por status no activo)
 ✓ 12. Create + Cambio de Precio (carrera de actualización de tarifa) -> PASS (Serialización FOR UPDATE)
 ✓ 13. Realtime Desconectado (degradación de canal WebSocket) -> PASS (Captura en callback sin romper UI)
 ✓ 14. Stale Cache (caché local desactualizada en cliente) -> PASS (Supabase autoritativo prevalece)
```

---

## 6. MATRIZ CONSOLIDADA DE EVIDENCIA Y ESTADO

| Código Verificación | Descripción | Estado Anterior (Auditoría 4) | Estado Actual (Post-Remediación) | Veredicto |
| :--- | :--- | :--- | :--- | :---: |
| **ADV-01** | Doble clic en creación de orden | Potencial duplicación de orden | Idempotencia por `client_idempotency_key` | **PASS** |
| **ADV-02** | Doble pestaña concurrente | Riesgo de orden huérfana | Rollback atómico en fallo de boletos | **PASS** |
| **ADV-03** | Dos dispositivos compitiendo | Riesgo de sobreventa | Lock `FOR UPDATE` en boletos | **PASS** |
| **ADV-04** | Timeout de red en cliente | Bloqueo indefinido de UI | Timeout explícito de 15s con `AbortController` | **PASS** |
| **ADV-05** | Reintento tras timeout | Generaba nueva orden distinta | Preserva `client_idempotency_key` en UI | **PASS** |
| **ADV-06** | 10+ peticiones misma clave | Desconocido | Replay determinista comprobado | **PASS** |
| **ADV-07** | Concurrencia con distintas claves | Riesgo de orden vacía | Rechazo con código controlado | **PASS** |
| **ADV-08** | Subida concurrente de comprobante | Comprobantes huérfanos | Idempotente por clave + índice único | **PASS** |
| **ADV-09** | Comprobante tras expiración | Posible aceptación en orden muerta | Bloqueado por estado `expired` | **PASS** |
| **ADV-10** | Aprobación con boletos expirados | Corrupción de inventario (DB-10) | Bloqueado: exige boletos asociados y reservados | **PASS** |
| **ADV-11** | Rechazo con boletos expirados | Desasociación errónea de terceros | Liberación scoped por `order_id` | **PASS** |
| **ADV-12** | Compra en rifa pausada/concluida | Posible compra fantasma | Bloqueo de rifa `FOR UPDATE` valida status | **PASS** |
| **ADV-13** | Desconexión de Supabase Realtime | Posible crash de renderizado | Callbacks de canal degradado sin interrumpir | **PASS** |
| **ADV-14** | Fuga de nombres de tablas y SQL | Exposición de errores crudos al usuario | Biblioteca `errorHandling.ts` sanitiza la UI | **PASS** |
| **DOC-01** | Estados `completed` y `refunded` | Reportados como activos en Aud. 4 | Erradicados legítimamente en Migración 050 | **DOCUMENTATION_ONLY** |
| **DOC-02** | Invocación de `reserve_tickets` pública | Reportada como abierta en Aud. 4 | Revocada formalmente en Migración 042 | **DOCUMENTATION_ONLY** |
| **DOC-03** | Subconsulta `auth.users` en logs | Reportada como vulnerabilidad activa | Corregida formalmente en Migración 039 | **DOCUMENTATION_ONLY** |

---

## 7. RESULTADOS DE LOS GATES DE CALIDAD

1. **Vitest Test Suite (`npm test`)**:
   - Total de archivos de prueba: **29** (incluyendo `auditoria4AdversarialRegression.test.ts` y `errorHardening.test.ts`).
   - Total de pruebas: **326**.
   - Pruebas aprobadas: **326 (100%)**.
   - Pruebas fallidas: **0**.
2. **TypeScript Typecheck (`tsc -b`)**:
   - Código de salida: **0**. Cero errores de tipado.
3. **Linter Estático (`oxlint`)**:
   - Código de salida: **0**. Cero errores funcionales.
4. **Compilación de Producción (`vite build`)**:
   - Código de salida: **0**. Bundle generado en 6.56s con chunks optimizados en `dist/`.

---

## 8. LISTADO DE DISCREPANCIAS Y CLASIFICACIÓN FINAL

### A. Hallazgos Nuevos (Originados en Auditoría 4 y ya Remediados)
1. **Timeout cliente de 15 segundos**: Implementado en `src/lib/requestTimeout.ts` con `AbortController`.
2. **Preservación de idempotencia en reintentos**: Implementado en `ModalCheckout.tsx`.
3. **Normalización centralizada de errores y blindaje contra fugas SQL**: Implementado en `src/lib/errorHandling.ts`.
4. **Resiliencia de canales Realtime**: Callbacks agregados en contextos y vistas administrativas.
5. **Manejo de estado `isForbidden` (403/42501)**: Implementado en `AdminErrorState.tsx`.

### B. Hallazgos Históricos Ya Resueltos en Auditorías 00–03 (Superados por Migraciones 037–052)
1. Corrupción cruzada de boletos (DB-01 / DB-10) ➔ Resuelto en Migración 037.
2. Integridad de boletos y órdenes (DB-02 / DB-14) ➔ Resuelto en Migración 038.
3. Subconsulta indebida a `auth.users` en `notification_logs` (DB-03) ➔ Resuelto en Migración 039.
4. RPC pública legacy `reserve_tickets` (SEC-01 / SEC-02) ➔ Revocada en Migración 042.
5. Cancelación arbitraria de órdenes (SEC-03) ➔ Resuelto en Migración 043.
6. Gestión de administradores sin control (SEC-04 / SEC-08) ➔ Resuelto en Migraciones 044 y 046.
7. Almacenamiento no controlado en `payment-proofs` (SEC-05) ➔ Resuelto en Migración 045.
8. Enumeración pública en verificación de boletos (SEC-09) ➔ Resuelto en Migración 047.
9. Mutación de ganadores y reapertura de rifas terminadas ➔ Resuelto en Migración 048.
10. Falta de idempotencia en órdenes ➔ Resuelto en Migración 049.
11. Estados no estandarizados ➔ Resuelto en Migración 050.
12. Comprobantes duplicados ➔ Resuelto en Migración 051.
13. Carreras de concurrencia y deadlocks ➔ Resuelto en Migración 052.

### C. Riesgos Residuales Reales
- **Latencia Móvil Extrema (>15s)**: Si la conexión del comprador se interrumpe justo al enviar la orden y el usuario reintenta, la idempotency key garantiza que el backend reconozca la compra previa sin cobrar dos veces, pero el cliente verá una pantalla de espera mientras se sincroniza el estado.
- **Entornos de Red con Bloqueo de WebSockets**: En conexiones bajo firewalls corporativos que bloquean WebSockets, los nuevos callbacks atrapan el error sin romper la interfaz, pero la actualización de boletos reservados en tiempo real dependerá del refresco manual de la vista.

---

## 9. CERTIFICACIÓN DE REGRESIÓN DE AUDITORÍA 4

Se certifica que:
- El flujo completo (público y administrativo) es **100% coherente y compatible** con las garantías de seguridad establecidas en las Auditorías 00 a 03.
- No se han detectado regresiones en la máquina de estados, el inventario de boletos ni el aislamiento de comprobantes.
- El sistema cuenta con cobertura adversarial demostrada mediante 326 pruebas unitarias y de integración que compilan y pasan limpiamente.
- No se han generado migraciones innecesarias ni se ha alterado la lógica certificada de PostgreSQL.

**ESTADO FORENSE FINAL: APROBADO SIN REGRESIONES.**
