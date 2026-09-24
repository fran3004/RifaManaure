# AUDITORÍA 4 — FLUJO INTEGRAL PÚBLICO ↔ ADMINISTRATIVO
**PROYECTO:** RifaManaure (`manaure-vive`)
**FECHA DE AUDITORÍA:** 23 de Septiembre de 2026
**ALCANCE:** Arquitectura de Interacción Frontend ↔ Backend, Experiencia de Usuario Pública, Flujo Operativo Administrativo, Contratos de Tipado, Gestión de Errores y Sincronización en Tiempo Real.
**ESTADO DE EJECUCIÓN:** Auditoría Exhaustiva de Solo Lectura — CERO Modificaciones al Código.

---

## RESUMEN EJECUTIVO Y EVALUACIÓN DEL SISTEMA INTEGRAL

Esta auditoría analiza la coherencia punta a punta (**End-to-End**) de la aplicación **RifaManaure**, evaluando cómo interactúa la interfaz de usuario React/Vite con la capa de servicios, el cliente de Supabase, las llamadas RPC, las políticas RLS y el motor de base de datos PostgreSQL.

### Veredicto General de Integración: **COHERENTE CON DISCREPANCIAS DE CONTRATO**
- **Flujo Público:** Diseñado de forma fluida con un modal de checkout guiado en 7 pasos, reactividad en tiempo real mediante WebSockets (`Supabase Realtime`) y cálculo de precios estrictamente delegado al servidor.
- **Flujo Administrativo:** Panel de control modularizado en 13 vistas administrativas protegidas por sesión y autorización forzada contra la tabla `admin_users`.
- **Contrato de Datos (TypeScript vs DB):** El esquema general se encuentra sincronizado en un 95%, pero presenta **deriva de código (contract drift)**: existen firmas RPC obsoletas en `database.types.ts` (`submit_order_receipt`, `confirm_order_payment`) que fueron reemplazadas en la base de datos pero aún persisten en los tipos.

---

## SECCIÓN 1: RECONSTRUCCIÓN DEL FLUJO PÚBLICO (PASO A PASO)

El flujo del comprador abarca 12 fases interconectadas:

### 1. HOME (Aterrizaje y Carga Inicial)
- **Componente:** `HomePage.tsx`, `Navbar.tsx`, `HeroSection.tsx`, `SocialProofBar.tsx`
- **Hook / Context:** `useSystemSettings()`, `useTicketStats()` | `SystemSettingsContext`, `TicketCartContext`
- **Servicio:** `ticketService.getActiveRaffle()`, `settingsService.getSystemSettings()`
- **RPC / Endpoint:** Lectura directa PostgREST sobre `raffles` y `system_settings`
- **Tablas Afectadas:** `public.raffles` (SELECT), `public.system_settings` (SELECT)
- **Mutación de Estado:** Local: `isLoading = true` ➔ `raffle != null`. Rifa en estado `active`.
- **Respuesta:** Objeto de rifa activa (id, title, ticket_price, total_tickets) y settings del sistema.
- **Manejo de Error:** Fallback silencioso a caché local (`localStorage`) si la red falla.
- **Tiempo Real (Realtime):** Suscripción a cambios en tabla `raffles` mediante canal `raffles_realtime_channel`.

### 2. RIFA (Comprobación de Estado y Ganador)
- **Componente:** `TicketCartContext.tsx`, `WinnerBanner.tsx`
- **Hook / Context:** `useCallback(loadData)` | `TicketCartContext`
- **Servicio:** `winnerService.getWinnerForRaffle(raffleId)`
- **RPC / Endpoint:** Lectura PostgREST `supabase.from('winners').select(...)`
- **Tablas Afectadas:** `public.winners` (SELECT)
- **Mutación de Estado:** Si `raffle.status === 'finished'`, conmuta la UI a vista de "Rifa Concluida con Ganador Oficial".
- **Respuesta:** Fila de ganador con boleto, nombre y cédula enmascarada.
- **Manejo de Error:** Si falla la consulta de ganador, asume rifa en curso.
- **Tiempo Real (Realtime):** Canal `winners_realtime_channel` escuchando inserts en `winners`.

### 3. NÚMEROS (Renderizado de Grilla de Boletos)
- **Componente:** `TicketGrid.tsx`, `TicketItem.tsx`, `TicketFilterBar.tsx`
- **Hook / Context:** `useTicketCart()` | `TicketCartContext`
- **Servicio:** `ticketService.getTickets(raffleId)`
- **RPC / Endpoint:** PostgREST: `supabase.from('tickets').select('id, number, status, ...').eq('raffle_id', id)`
- **Tablas Afectadas:** `public.tickets` (SELECT público irrestricto)
- **Mutación de Estado:** Arreglo en memoria `tickets: TicketRow[]` (1,000 elementos: `000` a `999`).
- **Respuesta:** Listado completo con estados `available`, `reserved`, `sold`, `blocked`.
- **Manejo de Error:** Muestra mensaje de reintento si la API no responde.
- **Tiempo Real (Realtime):** Canal `tickets_realtime_${raffle.id}` sincroniza cambios de estado en milisegundos.

### 4. SELECCIÓN DE NÚMEROS
- **Componente:** `TicketSelector.tsx`, `SelectedTicketsStrip.tsx`, `RandomPickerModal.tsx`
- **Hook / Context:** `useTicketCart()` | `TicketCartContext` (`toggleTicketSelection`, `selectRandomTickets`)
- **Servicio:** Lógica local en frontend (`getRandomTicketNumbers`)
- **RPC / Endpoint:** Ninguna (Cero consumo de API durante la selección)
- **Tablas Afectadas:** Ninguna
- **Mutación de Estado:** Estado React: `selectedTickets: string[]` acotado por `maxTicketsPerBuyer` (máx. 20).
- **Respuesta:** Actualización visual instantánea de chips y cálculo de subtotal COP.
- **Manejo de Error:** Toast de advertencia si intenta exceder el límite de 20 boletos.
- **Tiempo Real (Realtime):** Si un número seleccionado pasa a `reserved` por otro usuario, se deselecciona automáticamente.

### 5. CHECKOUT (Apertura de Pasarela Guiada)
- **Componente:** `ModalCheckout.tsx`
- **Hook / Context:** `useState(currentStep = 1)` | `TicketCartContext`
- **Servicio:** Ninguno
- **RPC / Endpoint:** Ninguna
- **Tablas Afectadas:** Ninguna
- **Mutación de Estado:** Apertura de ventana modal accesible (`aria-modal="true"`), stepper en Paso 1.
- **Respuesta:** Renderizado del formulario de datos personales.
- **Manejo de Error:** Cierre controlado si no hay rifa activa.
- **Tiempo Real (Realtime):** Canal Realtime activo de fondo.

### 6. DATOS DEL COMPRADOR (Paso 1 del Checkout)
- **Componente:** `ModalCheckout.tsx` (Formulario)
- **Hook / Context:** `useState(formData)` | Local en `ModalCheckout`
- **Servicio:** Validaciones regex locales (`validateForm`)
- **RPC / Endpoint:** Ninguna
- **Tablas Afectadas:** Ninguna
- **Mutación de Estado:** Captura: `fullName`, `documentId`, `phone`, `email`, `city`, `acceptTerms`.
- **Respuesta:** Avance a Paso 2 (Verificación de Boletos) y Paso 3 (Resumen de Compra).
- **Manejo de Error:** Resaltado de campos inválidos con mensajes de error accesibles.
- **Tiempo Real (Realtime):** Ninguno.

### 7. CREACIÓN DE ORDEN Y RESERVA EN BASE DE DATOS (Paso 3 ➔ 4)
- **Componente:** `ModalCheckout.tsx` (`handleConfirmReservation`)
- **Hook / Context:** `useState(isReserving = true)` | `TicketCartContext`
- **Servicio:** `ticketService.createOrder(...)`
- **RPC / Endpoint:** `create_order_secure(p_raffle_id, p_ticket_numbers, p_buyer_data, ...)`
- **Tablas Afectadas:** `buyers` (UPSERT), `orders` (INSERT `pending`), `tickets` (UPDATE `reserved`), `audit_logs`
- **Mutación de Estado:** Orden creada en `pending`. Boletos pasan a `reserved` con `order_id` asignado.
- **Respuesta:** `{ success: true, order_id, reference, total_amount, reservation_expires_at }`.
- **Manejo de Error:** Si un número fue tomado: `hasReservationError = true`, muestra modal con números fallidos.
- **Tiempo Real (Realtime):** Emite broadcast masivo de tickets en amarillo a todos los visitantes conectados.

### 8. TEMPORIZADOR DE RESERVA Y ADVERTENCIA DE EXPIRACIÓN
- **Componente:** `ModalCheckout.tsx` (Cronómetro Superior)
- **Hook / Context:** `useEffect` con `setInterval` cada 1000ms (`timeLeftSeconds`) | Local
- **Servicio:** `paymentService.triggerReleaseExpiredReservations()` al llegar a 0
- **RPC / Endpoint:** `release_expired_reservations()` al vencer el tiempo
- **Tablas Afectadas:** `tickets` (vuelven a `available`), `orders` (pasa a `expired`)
- **Mutación de Estado:** Temporizador decrementando desde 600 segundos (10 minutos).
- **Respuesta:** Al llegar a 0: alerta modal "Tu reserva ha expirado" y reseteo del carrito.
- **Manejo de Error:** Si el cliente pierde conexión, el servidor expira la orden de forma autónoma.
- **Tiempo Real (Realtime):** Boletos liberados se vuelven verdes en la grilla pública.

### 9. SELECCIÓN DE CUENTA Y TRANSFERENCIA (Paso 4 y 5)
- **Componente:** `ModalCheckout.tsx` (Sección Cuentas Bancarias)
- **Hook / Context:** `useState(selectedAccount)` | Local
- **Servicio:** `paymentService.getPaymentAccounts()`
- **RPC / Endpoint:** PostgREST: `supabase.from('payment_accounts').select('*').eq('is_active', true)`
- **Tablas Afectadas:** `public.payment_accounts` (SELECT público)
- **Mutación de Estado:** Visualización de datos bancarios (Nequi, Bancolombia, Daviplata) con copiado rápido.
- **Respuesta:** Cuentas activas con titular, número de cuenta y tipo.
- **Manejo de Error:** Mensaje de advertencia si no hay cuentas configuradas.
- **Tiempo Real (Realtime):** Ninguno.

### 10. SUBIDA DE COMPROBANTE DE PAGO (Paso 6)
- **Componente:** `ModalCheckout.tsx` (FileInput y Preview)
- **Hook / Context:** `useState(receiptFile, isSubmittingProof)` | Local
- **Servicio:** `paymentService.uploadPaymentProof(file, orderId, ...)`
- **RPC / Endpoint:** Storage API (`payment-proofs/proofs/...`) y RPC `submit_payment_proof(...)`
- **Tablas Afectadas:** Bucket `payment-proofs`, tabla `payment_proofs` (INSERT), `orders` (UPDATE a `pending_verification`)
- **Mutación de Estado:** La orden pasa de `pending` a `pending_verification`. Boletos protegidos contra expiración.
- **Respuesta:** `{ success: true, proof_id, status: 'pending_verification' }`.
- **Manejo de Error:** Alerta si el archivo supera 5 MB o no es imagen/PDF válida.
- **Tiempo Real (Realtime):** Notifica al panel de administración que hay un nuevo comprobante por revisar.

### 11. CONFIRMACIÓN Y DESPACHO CIUDADANO (Paso 7)
- **Componente:** `ModalCheckout.tsx` (Paso 7: Éxito), `DigitalReceiptModal.tsx`
- **Hook / Context:** `useMemo(receiptNotification)` | `TicketCartContext.clearSelection()`
- **Servicio:** `receiptGeneratorService.generateDigitalReceipt(...)` y `whatsappService`
- **RPC / Endpoint:** Ninguna
- **Tablas Afectadas:** Ninguna
- **Mutación de Estado:** Pantalla de éxito: Muestra referencia `MV-XXXXXXXX`, botón directo de soporte WhatsApp y recibo digital.
- **Respuesta:** Recibo imprimible y descargable en PDF/Canvas.
- **Manejo de Error:** Generación local resiliente; no bloquea al usuario si el PDF falla.
- **Tiempo Real (Realtime):** Carrito de compras se vacía completamente.

### 12. CONSULTA Y VERIFICACIÓN OFICIAL CIUDADANA
- **Componente:** `VerificarPage.tsx` (`/verificar`)
- **Hook / Context:** `useState(searchQuery, orders)` | Autónomo
- **Servicio:** `ticketService.verifyPublicOrderOrTickets(query)`
- **RPC / Endpoint:** `verify_public_order_or_tickets(p_search_term)`
- **Tablas Afectadas:** `orders`, `buyers`, `raffles`, `tickets` (JOIN securizado en PostgreSQL)
- **Mutación de Estado:** Muestra tarjeta con estado (`PAGADO`, `PENDIENTE`, `EN VERIFICACIÓN`), boletos y comprador enmascarado (`Carlos M.`, `1065***40`).
- **Respuesta:** JSON estructurado con datos oficiales de la orden sin exponer PII confidencial.
- **Manejo de Error:** `No se encontraron compras con el término ingresado.`
- **Tiempo Real (Realtime):** Permite reconsultar en cualquier momento.

---

## SECCIÓN 2: RECONSTRUCCIÓN DEL FLUJO ADMINISTRATIVO

El flujo administrativo gobierna la operación interna, auditoría y control de sorteos a través de 18 sub-módulos:

### 1. LOGIN Y CONTROL DE ACCESO
- **Ruta / Componente:** `/admin/login` (`AdminLoginPage.tsx`)
- **Servicio Frontend:** `authService.signInAdmin(email, pass)`
- **Backend / Endpoint:** Supabase Auth (`auth.signInWithPassword`) + consulta a `public.admin_users`
- **Seguridad y RLS:** Autenticación en gateway + RLS SELECT sobre `admin_users`
- **Acción Operativa:** Valida credenciales criptográficas, comprueba `is_active = true` y almacena JWT en LocalStorage.

### 2. GUARDIA DE RUTAS PROTEGIDAS
- **Ruta / Componente:** `ProtectedRoute.tsx` y `AdminLayout.tsx`
- **Servicio Frontend:** `useAuth()` (`AuthContext.tsx`)
- **Backend / Endpoint:** `supabase.auth.getSession()` + `checkAdminAuthorization()`
- **Seguridad y RLS:** Evalúa sesión activa y perfil de administrador cargado
- **Acción Operativa:** Si no hay sesión o no es admin, redirige automáticamente a `/admin/login`. Si es admin, renderiza barra de navegación y sub-rutas.

### 3. PANEL PRINCIPAL (DASHBOARD)
- **Ruta / Componente:** `/admin` (`DashboardView.tsx`)
- **Servicio Frontend:** `paymentService.getDashboardKPIs(raffleId)`
- **Backend / Endpoint:** RPC `get_dashboard_kpis(p_raffle_id)`
- **Seguridad y RLS:** Exige `is_admin(auth.uid())`
- **Acción Operativa:** Calcula agregaciones en servidor: total recaudado COP, dinero en verificación, porcentaje vendido, conteo de órdenes por estado y métricas de compradores.

### 4. GESTIÓN DE RIFAS Y EDICIONES
- **Ruta / Componente:** `/admin/rifas` (`RafflesView.tsx`)
- **Servicio Frontend:** `raffleService.getAllRaffles()`, `createRaffle()`, `updateRaffle()`
- **Backend / Endpoint:** RPCs `admin_create_raffle` y `admin_update_raffle`
- **Seguridad y RLS:** Exige `is_admin(auth.uid())`
- **Acción Operativa:** Crea nuevas rifas generando automáticamente los 1,000 boletos iniciales en `tickets`, modifica precios, fechas de sorteo y estado (activo, pausado, cerrado).

### 5. AUDITORÍA Y CONTROL DE BOLETOS
- **Ruta / Componente:** `/admin/tickets` (`TicketsView.tsx`)
- **Servicio Frontend:** `ticketService.getTickets()`, `adminBlockTicket()`, `adminUnblockTicket()`
- **Backend / Endpoint:** RPCs `admin_block_ticket` y `admin_unblock_ticket`
- **Seguridad y RLS:** Exige `is_admin(auth.uid())`
- **Acción Operativa:** Visualiza la matriz completa de boletos, filtra por comprador y permite bloquear boletos sospechosos (con motivo obligatorio) o desbloquearlos.

### 6. CONTROL MAESTRO DE ÓRDENES
- **Ruta / Componente:** `/admin/ordenes` (`OrdersView.tsx`)
- **Servicio Frontend:** `paymentService.fetchAdminOrders(...)`
- **Backend / Endpoint:** PostgREST: `orders` con joins a `buyers`, `tickets` y `payment_proofs`
- **Seguridad y RLS:** Policy: `Solo administradores pueden consultar órdenes directamente`
- **Acción Operativa:** Tabla paginada con filtros por estado, buscador por referencia/cédula, exportación de datos y acceso al modal de detalle.

### 7. REVISIÓN DE COMPROBANTES DE PAGO
- **Ruta / Componente:** `/admin/comprobantes` (`ReceiptsView.tsx`)
- **Servicio Frontend:** `paymentService.fetchPendingVerificationOrders()`, `getReceiptSignedUrl()`
- **Backend / Endpoint:** Storage API (firmado temporal de URL) + tabla `payment_proofs`
- **Seguridad y RLS:** Storage Policy: `Solo administradores pueden leer comprobantes de payment-proofs`
- **Acción Operativa:** Bandeja de entrada de comprobantes pendientes. Muestra visor con zoom para imágenes y visor integrado de PDFs.

### 8. APROBACIÓN DE PAGOS (VENTA DEFINITIVA)
- **Ruta / Componente:** Modal `AdminConfirmPaymentModal.tsx`
- **Servicio Frontend:** `paymentService.approveOrderPayment(orderId)`
- **Backend / Endpoint:** RPC `approve_order_payment(p_order_id)`
- **Seguridad y RLS:** Exige `is_admin(auth.uid())`
- **Acción Operativa:** Transiciona orden a `paid`, comprobante a `approved`, boletos a `sold` definitivamente, emite auditoría y dispara notificaciones transaccionales.

### 9. RECHAZO DE PAGOS Y LIBERACIÓN
- **Ruta / Componente:** Modal `AdminRejectPaymentModal.tsx`
- **Servicio Frontend:** `paymentService.rejectOrderPayment(orderId, reason)`
- **Backend / Endpoint:** RPC `reject_order_payment(p_order_id, p_reason)`
- **Seguridad y RLS:** Exige `is_admin(auth.uid())`
- **Acción Operativa:** Transiciona orden a `rejected` con motivo, comprobante a `rejected`, libera los boletos a `available` y notifica al comprador vía WhatsApp/Email.

### 10. DIRECTORIO DE COMPRADORES (PII)
- **Ruta / Componente:** `/admin/compradores` (`BuyersView.tsx`)
- **Servicio Frontend:** `buyerService.fetchBuyers()`, `buyerService.updateBuyer()`
- **Backend / Endpoint:** PostgREST `buyers` (SELECT) + RPC `admin_update_buyer`
- **Seguridad y RLS:** Policy: `Lectura de compradores para administradores`
- **Acción Operativa:** Búsqueda de clientes, historial de compras acumuladas, edición de datos de contacto corregidos y exportación CSV.

### 11. CUENTAS BANCARIAS DE RECAUDO
- **Ruta / Componente:** `/admin/cuentas` (`PaymentAccountsView.tsx`)
- **Servicio Frontend:** `paymentService.getPaymentAccounts()`, `createPaymentAccount()`, ...
- **Backend / Endpoint:** PostgREST directo en tabla `payment_accounts`
- **Seguridad y RLS:** Policy: `Administradores pueden gestionar cuentas de pago`
- **Acción Operativa:** Creación y edición de cuentas de recaudo. Cada mutación dispara el trigger de auditoría `trg_audit_payment_accounts`.

### 12. REGISTRO OFICIAL DE GANADORES
- **Ruta / Componente:** `/admin/ganadores` (`WinnersView.tsx`)
- **Servicio Frontend:** `winnerService.registerWinner(...)`
- **Backend / Endpoint:** RPC `register_winner(...)`
- **Seguridad y RLS:** Exige `is_admin(auth.uid())`
- **Acción Operativa:** Valida que el boleto esté vendido, registra número de lotería, sube acta oficial y fotografías de entrega, y finaliza la rifa en una sola transacción.

### 13. CONFIGURACIÓN DEL PREMIO MAYOR Y EXPERIENCIAS
- **Ruta / Componente:** `/admin/premio` (`PrizeView.tsx`)
- **Servicio Frontend:** `prizeService.updatePrizeSettings()`, `createPrizeExperience()`, ...
- **Backend / Endpoint:** Tablas `prize_settings` y `prize_experiences`
- **Seguridad y RLS:** Policy: `Administradores gestionan prize_settings / prize_experiences`
- **Acción Operativa:** Edición de títulos, valor económico y tarjetas de experiencias turísticas.

### 14. ALIADOS Y PATROCINADORES
- **Ruta / Componente:** `/admin/aliados` (`PartnersView.tsx`)
- **Servicio Frontend:** `partnerService.createPartner()`, `updatePartner()`, `deletePartner()`
- **Backend / Endpoint:** Tabla `partners` + subida de logos a Storage
- **Seguridad y RLS:** Policy: `Administradores pueden gestionar aliados`
- **Acción Operativa:** CRUD de patrocinadores ecoturísticos, URLs de contacto y orden de aparición.

### 15. CENTRO DE PREGUNTAS FRECUENTES
- **Ruta / Componente:** `FAQView.tsx` / `faqService.ts`
- **Servicio Frontend:** `faqService.createFAQ()`, `updateFAQ()`, `deleteFAQ()`
- **Backend / Endpoint:** Tabla `faq_items`
- **Seguridad y RLS:** Policy: `Administradores gestionan faq_items`
- **Acción Operativa:** Gestión de preguntas y respuestas para la landing page.

### 16. GALERÍA ECOTURÍSTICA MULTIMEDIA
- **Ruta / Componente:** `/admin/galeria` (`GalleryView.tsx`)
- **Servicio Frontend:** `galleryService.uploadGalleryImage()`, `createGalleryItem()`, ...
- **Backend / Endpoint:** Storage bucket `gallery-images` y tablas `gallery_items` / `gallery_categories`
- **Seguridad y RLS:** Policy: `gallery_items_admin_manage`
- **Acción Operativa:** Subida y clasificación de fotografías de Manaure, Salinas y aviturismo.

### 17. PARÁMETROS OPERATIVOS Y EQUIPO ADMINISTRATIVO
- **Ruta / Componente:** `/admin/configuracion` (`SettingsView.tsx`)
- **Servicio Frontend:** `settingsService.updateSystemSettings()`, `adminUserService.*`
- **Backend / Endpoint:** RPCs `admin_update_system_settings`, `admin_invite_user`, `admin_toggle_user_status`, `admin_list_users`
- **Seguridad y RLS:** Exige `is_admin(auth.uid())` y `is_superadmin(auth.uid())` para invitaciones de superadmin
- **Acción Operativa:** Configura tiempos de reserva, límites de boletos, número de soporte y gestiona permisos del equipo de colaboradores.

### 18. BITÁCORA FORENSE DE AUDITORÍA
- **Ruta / Componente:** `/admin/auditoria` (`AuditView.tsx`)
- **Servicio Frontend:** `supabase.from('audit_logs').select('*')`
- **Backend / Endpoint:** Tabla `audit_logs`
- **Seguridad y RLS:** Policy: `Solo administradores pueden consultar bitácora de auditoría`
- **Acción Operativa:** Visor cronológico inmutable de eventos con buscador JSON, operador responsable y marcas de tiempo exactas.

---

## SECCIÓN 3: ANÁLISIS DETALLADO DE OPERACIONES CRÍTICAS (12 PREGUNTAS CLAVE)

Para garantizar la solidez del sistema, se auditan las 6 operaciones de mayor impacto técnico y financiero respondiendo de forma estricta a las 12 preguntas obligatorias:

### OPERACIÓN A: Creación de Orden Pública y Reserva de Boletos
1. **Qué ve el usuario:** El modal de checkout avanza del Paso 3 al Paso 4, mostrando la referencia generada (MV-XXXXXXXX) y un cronómetro de 10:00 minutos.
2. **Request generada:**
```http
POST /rest/v1/rpc/create_order_secure con payload JSON: { p_raffle_id, p_ticket_numbers, p_buyer_data, p_payment_method, p_contact_preference }.
```
3. **Servicio frontend:** `ticketService.createOrder() en src/services/ticketService.ts.`
4. **RPC / Tablas involucradas:** `RPC public.create_order_secure (modifica buyers, orders, tickets, audit_logs).`
5. **Validación Frontend:** Inputs no vacíos, formato de cédula, celular de 10 dígitos, email válido y aceptación obligatoria de términos.
6. **Validación Backend:** Rifa en estado active, cupo no excedido (<= 20 boletos), datos de comprador completos y boletos disponibles bajo lock FOR UPDATE.
7. **Seguridad y RLS:** Ejecuta como SECURITY DEFINER (bypasea RLS interno), pero verifica disponibilidad estricta.
8. **Mutación de Estado:** Boletos pasan de available a reserved; se inserta nueva orden en pending.
9. **Respuesta hacia la UI:** `{ success: true, order_id: UUID, reference: "MV-XXXX", total_amount: 50000, reservation_expires_at: "..." }.`
10. **Comportamiento ante Falla:** Retorna error descriptivo ({ success: false, error, failed_numbers }). El modal muestra pantalla de error con opción de reintentar sin romper la UI.
11. **Comportamiento ante Repetición:** Si se envía dos veces la misma petición, se crean 2 órdenes en orders y la segunda absorbe los boletos (debilidad de idempotencia SEC-01 / Concurrencia Caso 6).
12. **Comportamiento Concurrente:** Si dos usuarios compiten por los mismos números, uno gana el lock pesimista FOR UPDATE y reserva; el segundo es rechazado de inmediato con failed_numbers.

### OPERACIÓN B: Envío y Registro de Comprobante de Pago
1. **Qué ve el usuario:** El cliente ve una barra de progreso de subida en el Paso 6, pasando luego a la confirmación definitiva (Paso 7) con botón de soporte WhatsApp.
2. **Request generada:**
```http
1. POST /storage/v1/object/payment-proofs/proofs/... (binario multipart).
2. POST /rest/v1/rpc/submit_payment_proof con JSON: { p_order_id, p_file_path, p_file_name, p_file_size, p_mime_type, p_payment_reference }.
```
3. **Servicio frontend:** `paymentService.uploadPaymentProof() en src/services/paymentService.ts.`
4. **RPC / Tablas involucradas:** `Bucket payment-proofs y RPC public.submit_payment_proof (modifica payment_proofs, orders, tickets, audit_logs).`
5. **Validación Frontend:** Archivo seleccionado no nulo, tamaño menor o igual a 5 MB, extensión válida (jpg, png, webp, pdf).
6. **Validación Backend:** Orden existente en estado pending o pending_verification; tamaño de archivo <= 5 MB en RPC; nombre y ruta no vacíos.
7. **Seguridad y RLS:** Storage Policy valida que el orderId en el path pertenezca a una orden en pending/pending_verification. RPC ejecuta como SECURITY DEFINER.
8. **Mutación de Estado:** Orden pasa de pending a pending_verification; comprobante queda registrado en pending; tickets quedan protegidos contra expiración.
9. **Respuesta hacia la UI:** `{ success: true, proof_id: UUID, order_id: UUID, status: "pending_verification" }.`
10. **Comportamiento ante Falla:** Muestra mensaje de error en rojo bajo el área de carga y permite volver a seleccionar el archivo sin reiniciar el formulario.
11. **Comportamiento ante Repetición:** Si se invoca múltiples veces, inserta múltiples comprobantes en payment_proofs asociados a la misma orden (no idempotente).
12. **Comportamiento Concurrente:** Ambas subidas se completan; la orden queda en pending_verification con el último comprobante procesado.

### OPERACIÓN C: Aprobación Administrativa de Pago
1. **Qué ve el usuario:** El modal AdminConfirmPaymentModal muestra un spinner de procesamiento; al finalizar, se cierra y la fila de la orden cambia a verde ("PAGADO") con badge de confirmación.
2. **Request generada:**
```http
POST /rest/v1/rpc/approve_order_payment con JSON: { p_order_id: UUID } y header Authorization: Bearer <jwt_admin>.
```
3. **Servicio frontend:** `paymentService.approveOrderPayment() en src/services/paymentService.ts.`
4. **RPC / Tablas involucradas:** `RPC public.approve_order_payment (modifica orders, payment_proofs, tickets, audit_logs).`
5. **Validación Frontend:** Confirmación explícita mediante botón con modal de doble verificación que muestra la lista de boletos y el comprador.
6. **Validación Backend:** Verificación estricta de is_admin(auth.uid()); orden existente; status no está ya en paid/completed; orden bloqueada con FOR UPDATE.
7. **Seguridad y RLS:** SECURITY DEFINER valida internamente que el llamador autenticado sea un administrador activo en admin_users.
8. **Mutación de Estado:** Orden pasa a paid; comprobante pasa a approved; tickets pasan a sold definitivamente; se guardan verified_by y verified_at.
9. **Respuesta hacia la UI:** `{ success: true, order_id: UUID, status: "paid", tickets_sold_count: N, message: "..." }.`
10. **Comportamiento ante Falla:** Muestra notificación Toast de error en el panel de administración; la orden y boletos no sufren mutación.
11. **Comportamiento ante Repetición:** Idempotente: detecta IF v_order.status IN ('paid', 'completed') THEN RETURN error y no altera nada.
12. **Comportamiento Concurrente:** El bloqueo pesimista FOR UPDATE en orders serializa las peticiones; una transacción aprueba y la otra recibe error controlado de "ya pagada anteriormente".

### OPERACIÓN D: Rechazo Administrativo de Pago
1. **Qué ve el usuario:** El administrador ingresa el motivo en el modal de rechazo; al enviar, la fila pasa a rojo ("RECHAZADA") y los boletos se liberan en la grilla.
2. **Request generada:**
```http
POST /rest/v1/rpc/reject_order_payment con JSON: { p_order_id: UUID, p_reason: "..." } y token admin.
```
3. **Servicio frontend:** `paymentService.rejectOrderPayment() en src/services/paymentService.ts.`
4. **RPC / Tablas involucradas:** `RPC public.reject_order_payment (modifica orders, payment_proofs, tickets, audit_logs).`
5. **Validación Frontend:** Motivo de rechazo obligatorio (mínimo 5 caracteres).
6. **Validación Backend:** is_admin(auth.uid()); orden no pagada; motivo no nulo ni vacío.
7. **Seguridad y RLS:** SECURITY DEFINER valida permisos de administrador.
8. **Mutación de Estado:** Orden pasa a rejected; comprobante a rejected; tickets vuelven a available con campos de reserva en NULL.
9. **Respuesta hacia la UI:** `{ success: true, order_id: UUID, status: "rejected", released_tickets_count: N }.`
10. **Comportamiento ante Falla:** Alerta Toast de error administrativo; la orden permanece en pending_verification.
11. **Comportamiento ante Repetición:** Idempotente si la orden ya está rechazada; rechaza si la orden ya fue pagada.
12. **Comportamiento Concurrente:** Serializada bajo FOR UPDATE en orders.

### OPERACIÓN E: Adjudicación Oficial de Ganador de la Rifa
1. **Qué ve el usuario:** El panel WinnersView muestra la tarjeta con el boleto premiado; la rifa pasa a estado FINALIZADA y en la web pública se despliega el banner oficial de ganador.
2. **Request generada:**
```http
POST /rest/v1/rpc/register_winner con JSON: { p_raffle_id, p_ticket_number, p_lottery_draw_number, p_draw_date, p_official_act_url, p_delivery_photos, p_notes }.
```
3. **Servicio frontend:** `winnerService.registerWinner() en src/services/winnerService.ts.`
4. **RPC / Tablas involucradas:** `RPC public.register_winner (modifica winners, raffles, audit_logs, bloquea tickets).`
5. **Validación Frontend:** Número de boleto obligatorio, número de sorteo de lotería obligatorio, selección de rifa activa.
6. **Validación Backend:** is_admin(auth.uid()); existencia de rifa; boleto existente en la rifa; boleto estrictamente en status = 'sold'; orden asociada en paid.
7. **Seguridad y RLS:** SECURITY DEFINER valida rol de admin y estado de venta del boleto.
8. **Mutación de Estado:** Inserta fila en winners; rifa pasa a finished; se emite registro en audit_logs.
9. **Respuesta hacia la UI:** `{ success: true, winner_id: UUID, ticket_number: "...", buyer_name: "...", message: "..." }.`
10. **Comportamiento ante Falla:** Retorna error descriptivo (e.g. "El boleto no está vendido"). La rifa sigue abierta.
11. **Comportamiento ante Repetición:** Falla por llave primaria en winners o porque la rifa ya quedó en finished.
12. **Comportamiento Concurrente:** Serializada mediante FOR UPDATE OF t en tickets.

### OPERACIÓN F: Consulta Ciudadana de Verificación de Boletos
1. **Qué ve el usuario:** El ciudadano ve sus órdenes en una tarjeta detallada con el estado oficial, los números comprados y el nombre enmascarado (Carlos M., 1065***40).
2. **Request generada:**
```http
POST /rest/v1/rpc/verify_public_order_or_tickets con JSON: { p_search_term: "..." } y anon key.
```
3. **Servicio frontend:** `ticketService.verifyPublicOrderOrTickets() en src/services/ticketService.ts.`
4. **RPC / Tablas involucradas:** `RPC public.verify_public_order_or_tickets (SELECT sobre orders, buyers, raffles, tickets).`
5. **Validación Frontend:** Término de búsqueda no vacío (mínimo 3 caracteres).
6. **Validación Backend:** Sanitización de caracteres; búsqueda por referencia (ILIKE) o por cédula exacta; enmascaramiento SQL nativo de nombres y cédulas; límite de 10 filas.
7. **Seguridad y RLS:** SECURITY DEFINER permite lectura pública controlada sin dar permisos directos sobre la tabla buyers.
8. **Mutación de Estado:** Cero mutaciones en base de datos (operación pura de lectura).
9. **Respuesta hacia la UI:** `{ success: true, searchTerm: "...", searchedBy: "document", orders: [...] }.`
10. **Comportamiento ante Falla:** Muestra mensaje "No se encontraron órdenes asociadas a los datos ingresados".
11. **Comportamiento ante Repetición:** Idempotente (lectura pura).
12. **Comportamiento Concurrente:** Totalmente concurrente (lecturas paralelas sin contención de locks).

---

## SECCIÓN 4: CONTRATO FRONTEND ↔ BASE DE DATOS (DISCREPANCIAS Y DRIFT)

Se realizó una auditoría diferencial automatizada comparando `src/types/database.types.ts`, los esquemas de las migraciones, las rutinas reales en PostgreSQL y los servicios TypeScript:

### 1. RPCs Fantasma en `database.types.ts` (Existen en Typescript pero NO en PostgreSQL)
- **`submit_order_receipt`:** Definida en `database.types.ts` (línea 774). En PostgreSQL la función real es `submit_payment_proof`. El servicio `paymentService.ts` resolvió esto internamente llamando a `submit_payment_proof`, pero los tipos mantienen la firma obsoleta.
- **`confirm_order_payment`:** Definida en `database.types.ts` (línea 795). En PostgreSQL no existe con este nombre; fue reemplazada por `approve_order_payment`.

### 2. RPCs Existentes en PostgreSQL Ausentes en `database.types.ts`
- **`admin_list_users`:** Presente en la base de datos viva; omitida en la sección `Functions` del archivo de tipos.
- **`is_superadmin`:** Función de seguridad de PostgreSQL omitida en `database.types.ts`.

### 3. Discrepancia de Estados entre Check Constraints y Servicios
- **Estados de Orden en DB:** `pending`, `pending_verification`, `paid`, `completed`, `rejected`, `expired`, `cancelled`, `refunded`.
- **Estados en Typescript / UI:** El frontend contempla activamente solo `pending`, `pending_verification`, `paid`, `rejected`, `expired`, `cancelled`.
- **Diagnóstico:** Los estados `completed` y `refunded` son huérfanos en la base de datos; ningún servicio de la aplicación emite órdenes con dichos estados.

---

## SECCIÓN 5: GESTIÓN DE ERRORES Y CASOS DE BORDE

| Tipo de Error | ¿Cómo lo maneja el Frontend? | ¿Cómo responde el Backend? | Nivel de Resiliencia |
| :--- | :--- | :--- | :---: |
| **Timeout de Red** | Mantiene spinner en botón hasta timeout del navegador. No tiene timeout configurable por cliente. | Si la orden se confirmó en DB, persiste; si se cortó antes de commit, hace rollback. | ⚠️ **MEDIA** |
| **Fallo de Conexión (Offline)** | Captura en bloque `catch (err)` y muestra mensaje amigable: "Ocurrió un problema de conexión". | Ninguno (request no llega). | ✅ **ALTA** |
| **Error RPC de Base de Datos** | Lee `error.message` retornado por Supabase y lo expone en un modal o notificación Toast. | Retorna JSON con `{"success": false, "error": "..."}` o HTTP 400. | ✅ **ALTA** |
| **Fallo de Permisos (RLS 42501)** | En `notification_logs`, la consulta falla silenciosamente o rompe la vista si no hay `try/catch`. | Arroja `ERROR 42501: permission denied for table users`. | ❌ **CRÍTICA** (SEC-07) |
| **Error de Validación de Formulario** | Bloquea el botón de envío y resalta campos con bordes rojos y mensajes aria-live. | RPC rechaza con error si campos obligatorios vienen vacíos. | ✅ **ALTA** |
| **Doble Envío / Clic Rápido** | Deshabilita el botón con `isReserving = true`, pero ante lags de red permite dobles reservas del mismo comprador. | Crea órdenes adicionales en `orders`. | ⚠️ **MEDIA** |
| **Expiración de Reserva en Vivo** | Cronómetro local llega a 0, emite alerta modal y vacía el carrito automáticamente. | `release_expired_reservations` libera boletos a `available`. | ✅ **ALTA** |
| **Datos Obsoletos en Caché (Stale Data)** | Realtime emite eventos que fuerzan la recarga o deselección inmediata del boleto. | El lock `FOR UPDATE` rechaza cualquier intento de compra sobre datos desactualizados. | ✅ **ALTA** |
| **Retardo o Desconexión de Realtime** | Si el WebSocket se desconecta, el usuario intenta reservar un boleto ya tomado; la DB lo rechaza de forma segura. | Lock pesimista en PostgreSQL garantiza integridad absoluta. | ✅ **ALTA** |
| **Fallo de Carga de Módulos (Chunk Failure)** | `lazyWithRetry.ts` captura el fallo de red, almacena timestamp en SessionStorage y recarga la página hasta 3 veces. | N/A (archivos estáticos de Vercel). | 🌟 **EXCELENTE** |

---

## SECCIÓN 6: CONCLUSIONES Y PLAN DE MEJORA INTEGRAL

### Fortalezas de la Integración:
1. **Experiencia de Usuario Segura:** La interfaz pública no permite la inyección de precios arbitrarios ni depende de la honestidad del navegador.
2. **Cero Confianza en Totales de Carrito:** `create_order_secure` recalcula el valor total en el servidor.
3. **Resiliencia ante Fallos de Red en Rutas:** El wrapper `lazyWithRetry` mitiga errores de despliegue y chunks obsoletos.

### Puntos de Remediación Obligatorios:
1. **Regenerar `database.types.ts`:** Ejecutar `npx supabase gen types typescript` para eliminar las RPCs obsoletas (`submit_order_receipt`, `confirm_order_payment`) y sincronizar `admin_list_users`.
2. **Corregir el Error 42501 en `notification_logs`:** Modificar la política RLS para evitar que los compradores autenticados sufran denegación de servicio.
3. **Implementar AbortController con Timeout en el Cliente Supabase:** Configurar un timeout explícito de 15 segundos para evitar que la UI quede congelada ante interrupciones de red.

---
*Fin del Informe de Auditoría 4 — Flujo Integral Público ↔ Administrativo.*
