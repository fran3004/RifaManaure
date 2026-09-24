# AUDITORÍA FINAL CONSOLIDADA — REVISIÓN CRUZADA Y CONTROL DE COMPLETITUD

**Proyecto:** RifaManaure (`manaure-vive`)  
**Repositorio:** `fran3004/RifaManaure`  
**Fecha de Emisión:** 23 de Septiembre de 2026  
**Entorno de Base de Datos:** PostgreSQL 15.8 (Supabase Cloud Hosted `bxhzvmbbsisxqpwrgvgn`)  
**Fase:** AUDITORÍA FINAL DE CONTROL DE CALIDAD Y CONSOLIDACIÓN MAESTRA — CERO MODIFICACIONES DE CÓDIGO  

---

## 1. INTRODUCCIÓN Y METADATOS TÉCNICOS

Esta auditoría final ("Auditoría de las Auditorías") realiza un control de completitud exhaustivo, una conciliación cruzada de discrepancias y la verificación de cobertura del 100% de los elementos del repositorio frente a las seis auditorías precedentes:
- **AUDITORIA_00_MAPA_MAESTRO.md** (Arquitectura y mapa inicial)
- **AUDITORIA_01_BASE_DATOS.md** (Esquema, migraciones, constraints y triggers)
- **AUDITORIA_02_SEGURIDAD.md** (Modelo de amenazas, RLS, matrices de privilegios)
- **AUDITORIA_03_RESERVAS_ESTADOS.md** (Máquina de estados finitos y concurrencia)
- **AUDITORIA_04_FLUJO_INTEGRAL.md** (Trazabilidad público ↔ administrativo)
- **AUDITORIA_05_BACKEND_EVENTOS.md** (RPCs, Edge Functions, Cron, Realtime, Storage)
- **AUDITORIA_06_PRUEBAS_ADVERSARIALES.md** (50 pruebas de penetración y fuzzing)

Adicionalmente, se acompaña de dos entregables normativos:
1. **`AUDITORIA_MATRIZ_HALLAZGOS.csv`**: Matriz técnica tabular con 14 hallazgos consolidados.
2. **`AUDITORIA_COBERTURA.md`**: Certificación formal de cobertura del 100% de archivos y elementos.

---

## 2. SECCIÓN 1: ANÁLISIS DE OMISIONES DETECTADAS

Al cotejar el inventario real del repositorio contra `AUDITORIA_00_MAPA_MAESTRO.md`, se identificaron las siguientes omisiones iniciales que fueron subsanadas en las auditorías posteriores:

1. **Servicios Omitidos en el Inventario Inicial:**
   - `src/services/authService.ts`: Servicio nuclear de autenticación de administradores con Supabase Auth (login, logout, getSession).
   - `src/services/faqService.ts`: Servicio de preguntas frecuentes con mecanismo de fallback local.
   - `src/services/whatsappService.ts`: Generador de enlaces dinámicos y plantillas de contacto de WhatsApp.
2. **Componentes y Modales Administrativos:**
   - Modales especializados como `AdminBuyerOrdersModal.tsx`, `AdminEditBuyerModal.tsx`, `AdminConfirmPaymentModal.tsx` y componentes de layout como `AdminBreadcrumbs.tsx` y `AdminHeader.tsx` no fueron desglosados individualmente en la Auditoría 00 (se agruparon por carpetas).
3. **Catálogo Detallado de Migraciones:**
   - La Auditoría 00 describió la arquitectura evolutiva sin enumerar los 38 archivos individuales de migración. Esta omisión fue completamente resuelta en la **Auditoría 01**, donde se reconstruyó la secuencia cronológica desde `001_initial_schema.sql` hasta `036_gallery_categories.sql`.
4. **Estado Real de Supabase Realtime en Producción:**
   - En la Auditoría 00 se asumió la operatividad de los WebSockets basándose en las suscripciones del frontend. Fue en la **Auditoría 05** donde se descubrió forensemente que la publicación `supabase_realtime` tiene **0 tablas** en la base viva.

---

## 3. SECCIÓN 2: CONTRADICCIONES IDENTIFICADAS Y RESOLUCIÓN TÉCNICA

| # | Tópico de Contradicción | Informe A | Informe B | Veredicto y Resolución Técnica Forense |
|---|---|---|---|---|
| **C-01** | **Operatividad de Realtime** | *Auditoría 00 y 04:* Asumen que los boletos se actualizan reactivamente por WebSocket. | *Auditoría 05:* Demuestra que `pg_publication_tables` tiene 0 tablas. | **Veredicto Real:** Realtime está 100% inactivo en producción. La UI funciona exclusivamente por recargas manuales o polling HTTP. Las suscripciones WebSocket están en silencio perpetuo. |
| **C-02** | **Privacidad de Comprobantes** | *Auditoría 01 y 02:* Indican que los comprobantes son privados en `payment-proofs`. | *Auditoría 05:* Descubre que el bucket legacy `receipts` tiene `public = true` en BD viva. | **Veredicto Real:** Existe una brecha de seguridad en comprobantes antiguos: la CDN pública de Supabase sirve archivos de `receipts` sin evaluar RLS si se conoce la ruta. |
| **C-03** | **Protocolo de Errores RPC** | *Auditoría 04:* Describe que las RPCs retornan `{"success": false, "error": "..."}`. | *Auditoría 05:* Identifica que `approve_order_payment` y `reject_order_payment` usan `RAISE EXCEPTION`. | **Veredicto Real:** Divergencia arquitectónica. `approve` y `reject` provocan error HTTP 400 en PostgREST, mientras que `create_order` y `admin_block` retornan HTTP 200 con payload de error. |
| **C-04** | **Replay de Comprobantes** | *Auditoría 03:* Considera el flujo de comprobante consistente y protegido. | *Auditoría 06 (REP-03):* Califica como `FAIL` por falta de límite de subidas. | **Veredicto Real:** La máquina de estados no se corrompe, pero la función es vulnerable a spam de registros en `payment_proofs` para una orden abierta. |
| **C-05** | **Cancelación de Órdenes** | *Auditoría 03 y 04:* Describen que un comprador puede cancelar su orden. | *Auditoría 02 y 05:* Verifican que `cancel_order` fue revocada de `anon` en migración 024. | **Veredicto Real:** En producción viva, un usuario anónimo NO puede cancelar órdenes por la RPC (recibe HTTP 403). Solo administradores o el cron pueden cancelar. |
| **C-06** | **Fuente de Verdad en Contenido** | *Auditoría 01:* Considera las tablas de base de datos como la única fuente de verdad. | *Auditoría 04 y 07:* Revelan que `faqService` y `galleryService` tienen fallbacks locales en memoria. | **Veredicto Real:** Si la BD falla, el frontend muestra contenido en caché local desincronizado del servidor. |

---

## 4. SECCIÓN 3: AGRUPACIÓN DE HALLAZGOS DUPLICADOS

Para eliminar redundancias en la remediación futura, se agrupan los problemas reportados en las auditorías previas:

- **Grupo DUP-01: Exposición y Privacidad de Comprobantes de Pago**  
  *Reportado como:* SEC-04 (Auditoría 02), CRIT-02 y EVENT-03 (Auditoría 05), AUTH-06 (Auditoría 06).  
  *Causa Raíz:* Bucket legacy `receipts` configurado con `public = true` en `storage.buckets`.  
  *Acción Única:* Ejecutar `UPDATE storage.buckets SET public = false WHERE id = 'receipts';` y purgar archivos legacy.

- **Grupo DUP-02: Apagón de Supabase Realtime y Riesgo de Fuga**  
  *Reportado como:* CRIT-01, EVENT-01, EVENT-02 (Auditoría 05), CONC-05 (Auditoría 06).  
  *Causa Raíz:* Líneas comentadas en migración 018 por permisos de `supabase_admin` + `REPLICA IDENTITY FULL` en `tickets`.  
  *Acción Única:* Crear vista pública sanitizada para Realtime o canal de broadcast, y activar publicación desde Dashboard.

- **Grupo DUP-03: Omisión de Cláusula search_path en Funciones SECURITY DEFINER**  
  *Reportado como:* SEC-08 (Auditoría 02), CRIT-05 y EVENT-07 (Auditoría 05).  
  *Causa Raíz:* 29 de 30 procedimientos carecen de `SET search_path = public, pg_temp`.  
  *Acción Única:* Script de parche aplicando `ALTER FUNCTION ... SET search_path = public, pg_temp;`.

- **Grupo DUP-04: Inconsistencia en Protocolo de Retorno de Errores**  
  *Reportado como:* Auditoría 04 y EVENT-06 (Auditoría 05).  
  *Causa Raíz:* Coexistencia de `RAISE EXCEPTION` y `jsonb_build_object('success', false)`.  
  *Acción Única:* Homologar retorno a `jsonb` uniforme en todas las RPCs administrativas.

- **Grupo DUP-05: Políticas RLS Huérfanas en Storage**  
  *Reportado como:* Auditoría 01 y EVENT-09 (Auditoría 05).  
  *Causa Raíz:* Políticas para `prize-images`, `partner-logos`, `winner-documents` sin buckets creados.  
  *Acción Única:* Migración de limpieza eliminando las políticas inactivas.

- **Grupo DUP-06: Duplicidad del Cron de Expiración**  
  *Reportado como:* CRIT-04 y EVENT-08 (Auditoría 05).  
  *Causa Raíz:* `pg_cron` asume toda la carga en la BD; la Edge Function `cron-release-expired-reservations` está sin uso.  
  *Acción Única:* Documentar como contingencia o proteger con secret exclusivo.

---

## 5. SECCIÓN 4: INVENTARIO CONSOLIDADO DE HALLAZGOS NO RESUELTOS

### 5.1. Hallazgos CRÍTICOS
1. **CRIT-01 (Realtime Roto en Producción):** Publicación `supabase_realtime` con 0 tablas. Los clientes React no reciben eventos CDC en vivo.
2. **CRIT-02 (Riesgo de Fuga de Datos en Boletos):** `tickets` tiene `REPLICA IDENTITY FULL`. Si se activa en Realtime sin sanitización, expondrá `buyer_id` y `order_id` en WebSocket a usuarios anónimos.

### 5.2. Hallazgos ALTOS
3. **HIGH-01 (Bucket receipts Público):** Exposición de comprobantes bancarios antiguos mediante URL directa en la CDN pública de Supabase sin pasar por RLS.
4. **HIGH-02 (Spam de Comprobantes en submit_payment_proof):** Ausencia de cuota máxima de comprobantes por orden (FAIL en prueba REP-03).
5. **HIGH-03 (Bloqueo de Cancelación en Checkout):** Permiso de `cancel_order` revocado para `anon` en DB mientras la UI intenta invocarlo.

### 5.3. Hallazgos MEDIOS
6. **MED-01 (Divergencia de Errores RPC):** `RAISE EXCEPTION` (HTTP 400) vs `jsonb success: false` (HTTP 200).
7. **MED-02 (Falta de Auditoría Directa en Aprobación):** `approve_order_payment` y `reject_order_payment` no insertan directamente en `audit_logs` (dependen de trigger).
8. **MED-03 (Search Path Vulnerable):** 29 funciones `SECURITY DEFINER` sin `SET search_path = public, pg_temp`.
9. **MED-04 (Doble Fuente de Verdad en Contenido):** Fallback local en memoria en `faqService` y `galleryService` susceptible a desincronización.

### 5.4. Hallazgos BAJOS
10. **LOW-01 (Edge Function de Expiración Huérfana):** Microservicio desplegado pero sin tráfico activo frente a `pg_cron`.
11. **LOW-02 (Políticas RLS Huérfanas de Storage):** Políticas para buckets inexistentes sobrecargan la evaluación de `storage.objects`.
12. **LOW-03 (Crecimiento de Telemetría pg_cron):** Falta de purga automática semanal en `cron.job_run_details`.

### 5.5. Hallazgos INFORMATIVOS
13. **INFO-01 (Deuda Técnica en Migraciones):** 38 migraciones acumulativas con reescrituras de funciones críticas.
14. **INFO-02 (Protección Colateral por Desconexión):** La inactividad de Realtime evitó colapsos de WebSocket por sobrecarga de conexiones concurrentes.

---

## 6. SECCIÓN 5: AUDITORÍA EXHAUSTIVA DE LOS 20 FLUJOS COMPLETOS

A continuación se evalúa cada uno de los **20 flujos críticos** del sistema respondiendo formalmente a las **10 dimensiones de calidad y confiabilidad**:
1. ¿Existe? | 2. ¿Está conectado? | 3. ¿Está protegido? | 4. ¿Es atómico? | 5. ¿Es consistente?  
6. ¿Es idempotente? | 7. ¿Es observable? | 8. ¿Tiene rollback? | 9. ¿Tiene manejo de errores? | 10. ¿Tiene auditoría?

### Flujo 1: Crear Rifa

- **1. ¿Existe?:** SÍ. Existe en backend (`admin_create_raffle`) y frontend (`AdminCreateRaffleModal.tsx`, `adminRaffleService.ts`).
- **2. ¿Está conectado?:** SÍ. El modal de administración llama a `adminRaffleService.createRaffle()`, el cual invoca la RPC `admin_create_raffle`.
- **3. ¿Está protegido?:** SÍ. La RPC es `SECURITY DEFINER`, valida `is_admin(auth.uid())` y los permisos de ejecución están revocados para `anon` y `PUBLIC`.
- **4. ¿Es atómico?:** SÍ. Transacción atómica única de PostgreSQL que inserta la rifa en `raffles`, genera masivamente los boletos en `tickets` mediante `generate_series` e inserta en `audit_logs`.
- **5. ¿Es consistente?:** SÍ. Valida constraints de precio >= 0, total_tickets > 0 y unicidad de slug.
- **6. ¿Es idempotente?:** NO. Un segundo intento idéntico falla por colisión de constraint UNIQUE en `slug`. Es seguro contra duplicación accidental.
- **7. ¿Es observable?:** SÍ. Registra evento `RAFFLE_CREATED_BY_ADMIN` en `audit_logs` con el ID de la rifa y total de boletos generados.
- **8. ¿Tiene rollback?:** SÍ. Si falla la generación de boletos o colisiona el slug, PostgreSQL hace rollback automático completo.
- **9. ¿Tiene manejo de errores?:** SÍ. Captura excepciones y retorna objeto JSON estructurado con `success: false` y mensaje legible.
- **10. ¿Tiene auditoría?:** SÍ. Inserta registro en `audit_logs` con `entity_type: raffle`, `performed_by: admin_uid` y detalles de configuración.

---

### Flujo 2: Publicar Rifa (Cambio a estado "active")

- **1. ¿Existe?:** SÍ. Implementado en RPC `admin_update_raffle` y servicio `adminRaffleService.updateRaffleStatus()`.
- **2. ¿Está conectado?:** SÍ. El switch de estado en `RafflesView.tsx` dispara la actualización de estado a `active`.
- **3. ¿Está protegido?:** SÍ. Requiere rol de administrador activo verificado por `is_admin(auth.uid())`.
- **4. ¿Es atómico?:** SÍ. Sentencia `UPDATE public.raffles SET status = 'active' ...` con lock pesimista `FOR UPDATE`.
- **5. ¿Es consistente?:** SÍ. El trigger y la RPC validan que no se reactive una rifa que ya está en `finished`.
- **6. ¿Es idempotente?:** SÍ. Si ya está en `active`, volver a asignar `active` no corrompe datos.
- **7. ¿Es observable?:** SÍ. Registra cambio en `audit_logs`.
- **8. ¿Tiene rollback?:** SÍ. Si la sentencia DML falla, aborta la transacción.
- **9. ¿Tiene manejo de errores?:** SÍ. Retorna `{"success": false, "error": "..."}`.
- **10. ¿Tiene auditoría?:** SÍ. Evento `RAFFLE_UPDATED_BY_ADMIN` en `audit_logs` detallando estado previo y nuevo.

---

### Flujo 3: Visualizar Números (Cuadrícula Pública)

- **1. ¿Existe?:** SÍ. Implementado en `src/components/tickets/TicketGrid.tsx`, `useTickets.ts` y `ticketService.ts`.
- **2. ¿Está conectado?:** SÍ. El componente solicita los boletos vía Supabase REST: `supabase.from('tickets').select('id, number, status, ...')`.
- **3. ¿Está protegido?:** PARCIALMENTE. La política RLS permite SELECT público a `anon` y `authenticated`. Sin embargo, la tabla tiene `REPLICA IDENTITY FULL`, lo que representaría un riesgo si se activa Realtime sin filtros (CRIT-02). Actualmente opera de forma segura vía HTTP.
- **4. ¿Es atómico?:** SÍ (Lectura de snapshot MVCC no bloqueante).
- **5. ¿Es consistente?:** SÍ. Muestra los estados oficiales `available`, `reserved`, `sold`, `blocked`.
- **6. ¿Es idempotente?:** SÍ. Operación pura de solo lectura.
- **7. ¿Es observable?:** NO (No se auditan lecturas masivas de catálogo para no saturar la base de datos).
- **8. ¿Tiene rollback?:** NO APLICA (Lectura pura).
- **9. ¿Tiene manejo de errores?:** SÍ. `useTickets` maneja estado de carga, error de red y reintentos.
- **10. ¿Tiene auditoría?:** NO (Consulta frecuente pública sin auditoría persistente).

---

### Flujo 4: Reservar Números (Carrito Temporal)

- **1. ¿Existe?:** SÍ. Backend: `reserve_tickets`; Frontend: `ticketService.reserveTickets()` y `TicketCartContext.tsx`.
- **2. ¿Está conectado?:** SÍ. Al seleccionar boletos y proceder, el carrito llama a la RPC `reserve_tickets`.
- **3. ¿Está protegido?:** SÍ. La función es `SECURITY DEFINER`, valida disponibilidad con lock pesimista y valida límites globales.
- **4. ¿Es atómico?:** SÍ. Bloquea las filas solicitadas con `FOR UPDATE` y actualiza todas o ninguna.
- **5. ¿Es consistente?:** SÍ. Asigna `reserved_at` y calcula `reservation_expires_at` con base en `system_settings`.
- **6. ¿Es idempotente?:** NO. Un reintento falla porque el boleto ya no está en `available` (anti-replay seguro).
- **7. ¿Es observable?:** PARCIAL. Se refleja en el estado del boleto pero no genera fila en `audit_logs` al ser estado efímero.
- **8. ¿Tiene rollback?:** SÍ. Si un boleto del grupo no está disponible, aborta sin mutar los demás.
- **9. ¿Tiene manejo de errores?:** SÍ. Retorna lista de números fallidos `failed_numbers` con `success: false`.
- **10. ¿Tiene auditoría?:** NO directa en `audit_logs` (optimización intencional contra sobrecarga de logs volátiles).

---

### Flujo 5: Crear Orden

- **1. ¿Existe?:** SÍ. Backend: `create_order_secure`; Frontend: `CheckoutModal.tsx` y `ticketService.createOrderSecure()`.
- **2. ¿Está conectado?:** SÍ. El formulario de checkout recopila datos del comprador y dispara la RPC.
- **3. ¿Está protegido?:** SÍ. `SECURITY DEFINER`, sanitiza teléfono, cédula y correo; valida que la rifa esté activa y boletos disponibles.
- **4. ¿Es atómico?:** SÍ. Bloquea rifa, bloquea boletos en orden ascendente (`ORDER BY number ASC FOR UPDATE`), upsert de comprador, creación de orden, asignación de boletos y registro de auditoría en la misma transacción.
- **5. ¿Es consistente?:** SÍ. Invariante matemática: la suma de boletos y el cálculo del total (`precio * cantidad`) se realiza forzosamente en el servidor.
- **6. ¿Es idempotente?:** NO. Si se repite el payload, los boletos ya están reservados y falla limpiamente.
- **7. ¿Es observable?:** SÍ. Registra evento `ORDER_CREATED_SECURE` en `audit_logs` con desglose completo.
- **8. ¿Tiene rollback?:** SÍ. Cualquier fallo de BD o falta de un solo boleto revierte la transacción íntegra.
- **9. ¿Tiene manejo de errores?:** SÍ. Retorna JSON estructurado `{"success": false, "error": "...", "failed_numbers": [...]}`.
- **10. ¿Tiene auditoría?:** SÍ. Registro completo en `audit_logs` con referencia única de orden (`MV-XXXXXXXX`).

---

### Flujo 6: Pagar (Pasarela / Transferencia Manual)

- **1. ¿Existe?:** SÍ. Frontend: `PaymentInstructionsModal.tsx`, pasarelas Wompi/Bold/MercadoPago y cuentas manuales.
- **2. ¿Está conectado?:** SÍ. Conecta con `paymentAccountService.getActiveAccounts()` y genera datos de transferencia o QR.
- **3. ¿Está protegido?:** SÍ. Las cuentas de recaudo son consultadas mediante RLS pública de solo lectura.
- **4. ¿Es atómico?:** SÍ. La generación de instrucciones no muta estado; la orden permanece en `pending` esperando comprobante.
- **5. ¿Es consistente?:** SÍ. Muestra exactamente los números de cuenta oficiales configurados por el administrador.
- **6. ¿Es idempotente?:** SÍ. Visualización idempotente.
- **7. ¿Es observable?:** SÍ. Telemetría de selección de método en cliente.
- **8. ¿Tiene rollback?:** NO APLICA.
- **9. ¿Tiene manejo de errores?:** SÍ. Si falla la carga de cuentas, muestra alerta y opciones de contacto de soporte.
- **10. ¿Tiene auditoría?:** Las mutaciones de cuentas bancarias tienen trigger de auditoría (`trg_audit_payment_accounts`).

---

### Flujo 7: Subir Comprobante

- **1. ¿Existe?:** SÍ. Backend: bucket `payment-proofs` + RPC `submit_payment_proof`; Frontend: `paymentService.uploadPaymentProof()`.
- **2. ¿Está conectado?:** SÍ. `uploadPaymentProof` sube el archivo a Supabase Storage y luego invoca `submit_payment_proof`.
- **3. ¿Está protegido?:** SÍ. RLS en Storage valida que el path coincida con una orden en `pending`. RPC valida estado.
- **4. ¿Es atómico?:** SÍ en base de datos. Inserta en `payment_proofs`, actualiza orden a `pending_verification`, extiende tiempo y audita.
- **5. ¿Es consistente?:** SÍ. Pasa la orden a `pending_verification`. Trigger valida transición legal.
- **6. ¿Es idempotente?:** PARCIAL / FAIL (REP-03). Permite reenvío de comprobantes múltiples para la misma orden sin límite superior.
- **7. ¿Es observable?:** SÍ. Registra `PAYMENT_PROOF_SUBMITTED` en `audit_logs`.
- **8. ¿Tiene rollback?:** SÍ. Si la RPC falla, revierte la actualización de la orden.
- **9. ¿Tiene manejo de errores?:** SÍ. Retorna JSON con `success: false` si la orden no existe o ya no está pendiente.
- **10. ¿Tiene auditoría?:** SÍ. Inserta evento en `audit_logs` con tamaño, MIME y archivo.

---

### Flujo 8: Revisar Comprobante (Panel de Administración)

- **1. ¿Existe?:** SÍ. Frontend: `AdminOrderReviewModal.tsx`, `OrdersView.tsx`; Backend: signed URL en `payment-proofs`.
- **2. ¿Está conectado?:** SÍ. El modal administrativo solicita URL firmada temporal mediante `paymentService.getSignedPaymentProofUrl()`.
- **3. ¿Está protegido?:** SÍ. El bucket `payment-proofs` es privado (`public: false`) y la política RLS exige `is_admin()`.
- **4. ¿Es atómico?:** SÍ (Lectura y generación de token temporal HMAC de Storage).
- **5. ¿Es consistente?:** SÍ. El administrador visualiza la imagen original sin alteración.
- **6. ¿Es idempotente?:** SÍ. Consulta pura de verificación.
- **7. ¿Es observable?:** SÍ. Registro de acceso en logs de Supabase Storage.
- **8. ¿Tiene rollback?:** NO APLICA.
- **9. ¿Tiene manejo de errores?:** SÍ. Maneja fallback a bucket legacy si el archivo fuera antiguo.
- **10. ¿Tiene auditoría?:** Trazabilidad en logs de acceso de administración.

---

### Flujo 9: Aprobar Orden

- **1. ¿Existe?:** SÍ. Backend: `approve_order_payment`; Frontend: `AdminConfirmPaymentModal.tsx`, `AdminOrderReviewModal.tsx`.
- **2. ¿Está conectado?:** SÍ. Botón "Confirmar Pago" invoca `paymentService.approveOrderPayment(orderId)`.
- **3. ¿Está protegido?:** SÍ. `SECURITY DEFINER`, valida `is_admin(auth.uid())`. Revocado para `anon` y `PUBLIC`.
- **4. ¿Es atómico?:** SÍ. Bloquea la orden con `FOR UPDATE`, pasa orden a `paid`, boletos a `sold`, asigna `paid_at` y `verified_by`.
- **5. ¿Es consistente?:** SÍ. El trigger `fn_validate_order_status_transition` y `fn_validate_ticket_status_transition` exigen orden pagada para vender boletos.
- **6. ¿Es idempotente?:** NO. Segunda ejecución falla con excepción (protege contra doble aprobación).
- **7. ¿Es observable?:** SÍ. Trigger inserta evento `ORDER_STATUS_PAID` en `audit_logs` con datos financieros.
- **8. ¿Tiene rollback?:** SÍ. Si falla el update de boletos o trigger, la orden no se aprueba.
- **9. ¿Tiene manejo de errores?:** USA RAISE EXCEPTION (HTTP 400). El frontend debe capturarlo en bloque `catch` (MED-01).
- **10. ¿Tiene auditoría?:** SÍ mediante el trigger de transición de estado de orden.

---

### Flujo 10: Rechazar Orden

- **1. ¿Existe?:** SÍ. Backend: `reject_order_payment`; Frontend: modal administrativo de rechazo con motivo.
- **2. ¿Está conectado?:** SÍ. Formulario administrativo solicita motivo y envía a `paymentService.rejectOrderPayment()`.
- **3. ¿Está protegido?:** SÍ. `SECURITY DEFINER`, valida `is_admin(auth.uid())`.
- **4. ¿Es atómico?:** SÍ. Pasa orden a `rejected`, limpia y libera todos los boletos asociados poniéndolos en `available`.
- **5. ¿Es consistente?:** SÍ. Los boletos regresan inmediatamente al stock general de la rifa.
- **6. ¿Es idempotente?:** NO. Segunda ejecución falla de forma segura.
- **7. ¿Es observable?:** SÍ. Trigger inserta `ORDER_STATUS_REJECTED` en `audit_logs` con el motivo de rechazo.
- **8. ¿Tiene rollback?:** SÍ. Rollback completo ante fallo.
- **9. ¿Tiene manejo de errores?:** USA RAISE EXCEPTION (HTTP 400). Capturado en frontend.
- **10. ¿Tiene auditoría?:** SÍ. El motivo de rechazo queda persistido en `orders.rejection_reason` y en `audit_logs`.

---

### Flujo 11: Expirar Reservas

- **1. ¿Existe?:** SÍ. Backend: `release_expired_reservations` y tarea `pg_cron` (`job 4`).
- **2. ¿Está conectado?:** SÍ. Ejecutado automáticamente cada 5 minutos por el motor PostgreSQL (`*/5 * * * *`).
- **3. ¿Está protegido?:** SÍ. Ejecutado bajo el usuario del sistema `postgres`. Revocado para `anon`.
- **4. ¿Es atómico?:** SÍ. Sentencia `UPDATE public.tickets` masiva con cláusula `WHERE status = 'reserved' AND reservation_expires_at < NOW()`.
- **5. ¿Es consistente?:** SÍ. Cancela órdenes huérfanas expiradas y sanea los boletos dejándolos en `available`.
- **6. ¿Es idempotente?:** SÍ. Totalmente idempotente: si no hay boletos expirados, actualiza 0 filas y retorna 0.
- **7. ¿Es observable?:** SÍ. Telemetría completa registrada en la tabla de sistema `cron.job_run_details`.
- **8. ¿Tiene rollback?:** SÍ. Rollback atómico estándar de PostgreSQL.
- **9. ¿Tiene manejo de errores?:** SÍ. Si falla, el error se registra en `cron.job_run_details.return_message`.
- **10. ¿Tiene auditoría?:** Trazabilidad operativa en telemetría de `pg_cron`.

---

### Flujo 12: Liberar Boletos (Desbloqueo Administrativo)

- **1. ¿Existe?:** SÍ. Backend: `admin_unblock_ticket`; Frontend: `TicketsView.tsx` y `adminTicketService.ts`.
- **2. ¿Está conectado?:** SÍ. Botón "Desbloquear" en panel de boletos invoca la RPC.
- **3. ¿Está protegido?:** SÍ. `SECURITY DEFINER`, valida `is_admin(auth.uid())`.
- **4. ¿Es atómico?:** SÍ. Actualiza boleto de `blocked` a `available` y registra auditoría en una transacción.
- **5. ¿Es consistente?:** SÍ. Valida que el boleto esté efectivamente bloqueado antes de liberarlo.
- **6. ¿Es idempotente?:** NO. Segunda llamada falla porque el boleto ya no está bloqueado.
- **7. ¿Es observable?:** SÍ. Inserta evento `TICKET_UNBLOCKED_BY_ADMIN` en `audit_logs`.
- **8. ¿Tiene rollback?:** SÍ. Rollback total ante error.
- **9. ¿Tiene manejo de errores?:** SÍ. Retorna `{"success": false, "error": "..."}`.
- **10. ¿Tiene auditoría?:** SÍ. Auditoría con motivo y administrador ejecutor.

---

### Flujo 13: Verificar Orden (Consulta Pública)

- **1. ¿Existe?:** SÍ. Backend: `verify_public_order_or_tickets`; Frontend: `VerifyOrderModal.tsx` y `ticketService.ts`.
- **2. ¿Está conectado?:** SÍ. Formulario público "Consultar mis boletos" envía teléfono, cédula o referencia.
- **3. ¿Está protegido?:** SÍ. `SECURITY DEFINER`, abierto a `anon`, pero enmascara teléfonos en los resultados para proteger privacidad.
- **4. ¿Es atómico?:** SÍ (Lectura pura MVCC).
- **5. ¿Es consistente?:** SÍ. Coincidencia exacta estricta sin soporte de comodines masivos (% o *).
- **6. ¿Es idempotente?:** SÍ. Consulta pura.
- **7. ¿Es observable?:** NO (Consulta frecuente de usuarios sin saturación de logs).
- **8. ¿Tiene rollback?:** NO APLICA.
- **9. ¿Tiene manejo de errores?:** SÍ. Retorna `{"success": false, "error": "El término de búsqueda no puede estar vacío."}`.
- **10. ¿Tiene auditoría?:** NO requerida para consultas públicas.

---

### Flujo 14: Registrar Ganador

- **1. ¿Existe?:** SÍ. Backend: `register_winner`; Frontend: modal administrativo de registro de sorteo.
- **2. ¿Está conectado?:** SÍ. Formulario de sorteo envía número ganador, lotería, fecha, acta y fotos.
- **3. ¿Está protegido?:** SÍ. `SECURITY DEFINER`, valida `is_admin(auth.uid())`. Exige que el boleto esté estrictamente en `sold`.
- **4. ¿Es atómico?:** SÍ. Bloquea boleto, valida comprador, inserta en `winners`, cambia rifa a `finished` y audita.
- **5. ¿Es consistente?:** SÍ. Prohíbe registrar como ganador un boleto no vendido. Rifa pasa a estado terminal.
- **6. ¿Es idempotente?:** NO. Segunda ejecución falla por constraint única de ganador en `winners`.
- **7. ¿Es observable?:** SÍ. Inserta evento `WINNER_REGISTERED` en `audit_logs` con evidencia notarial.
- **8. ¿Tiene rollback?:** SÍ. Rollback total ante fallo.
- **9. ¿Tiene manejo de errores?:** SÍ. Retorna JSON estructurado con error si el boleto no existe o no fue vendido.
- **10. ¿Tiene auditoría?:** SÍ. Auditoría exhaustiva en `audit_logs`.

---

### Flujo 15: Anunciar Ganador (Página Pública)

- **1. ¿Existe?:** SÍ. Frontend: `WinnersSection.tsx`, `winnerService.ts`; Backend: tabla `winners` con RLS pública.
- **2. ¿Está conectado?:** SÍ. La página de inicio y modal de ganadores consultan `public.winners` mediante SELECT.
- **3. ¿Está protegido?:** SÍ. RLS permite lectura pública de registros confirmados.
- **4. ¿Es atómico?:** SÍ (Lectura).
- **5. ¿Es consistente?:** SÍ. Muestra ganador legítimo asociado a la rifa finalizada.
- **6. ¿Es idempotente?:** SÍ.
- **7. ¿Es observable?:** SÍ. Telemetría estándar.
- **8. ¿Tiene rollback?:** NO APLICA.
- **9. ¿Tiene manejo de errores?:** SÍ. Si no hay ganadores, oculta la sección limpiamente.
- **10. ¿Tiene auditoría?:** NO aplicable a lectura.

---

### Flujo 16: Administrar Premios (Experiencias y Premio Mayor)

- **1. ¿Existe?:** SÍ. Backend: tablas `prize_settings`, `prize_experiences`; Frontend: `prizeService.ts`, `PrizesView.tsx`.
- **2. ¿Está conectado?:** SÍ. Vistas administrativas de configuración de premios conectadas con Supabase client.
- **3. ¿Está protegido?:** SÍ. RLS exige `is_admin()` para INSERT/UPDATE/DELETE; SELECT abierto a público.
- **4. ¿Es atómico?:** SÍ. Sentencias DML atómicas por fila.
- **5. ¿Es consistente?:** SÍ. Triggers `fn_prize_updated_at` mantienen marcas de tiempo consistentes.
- **6. ¿Es idempotente?:** SÍ en actualizaciones.
- **7. ¿Es observable?:** SÍ en logs de PostgreSQL.
- **8. ¿Tiene rollback?:** SÍ.
- **9. ¿Tiene manejo de errores?:** SÍ. Servicios capturan y formatean errores.
- **10. ¿Tiene auditoría?:** Triggers de timestamp en tabla.

---

### Flujo 17: Administrar Aliados (Patrocinadores Comerciales)

- **1. ¿Existe?:** SÍ. Backend: tabla `partners`; Frontend: `partnerService.ts`, `PartnersView.tsx`.
- **2. ¿Está conectado?:** SÍ. Panel de aliados conectado con subida de logos vía Cloudinary / Storage.
- **3. ¿Está protegido?:** SÍ. RLS restringe mutaciones a administradores activos.
- **4. ¿Es atómico?:** SÍ.
- **5. ¿Es consistente?:** SÍ. Valida campos obligatorios y URL de logo.
- **6. ¿Es idempotente?:** SÍ en actualizaciones.
- **7. ¿Es observable?:** SÍ.
- **8. ¿Tiene rollback?:** SÍ.
- **9. ¿Tiene manejo de errores?:** SÍ.
- **10. ¿Tiene auditoría?:** Trigger `fn_partners_updated_at`.

---

### Flujo 18: Administrar FAQ (Preguntas Frecuentes)

- **1. ¿Existe?:** SÍ. Backend: tabla `faq_items`; Frontend: `faqService.ts`, `FaqView.tsx`.
- **2. ¿Está conectado?:** SÍ. Panel conectado a Supabase con fallback local de contingencia en `faqService.ts`.
- **3. ¿Está protegido?:** SÍ. RLS restringe mutaciones a admin; lectura pública.
- **4. ¿Es atómico?:** SÍ.
- **5. ¿Es consistente?:** SÍ en BD. NOTA: El fallback local introduce riesgo de divergencia (MED-04).
- **6. ¿Es idempotente?:** SÍ.
- **7. ¿Es observable?:** SÍ.
- **8. ¿Tiene rollback?:** SÍ.
- **9. ¿Tiene manejo de errores?:** SÍ. Captura errores y cae silenciosamente al respaldo local.
- **10. ¿Tiene auditoría?:** Trigger `fn_faq_items_updated_at`.

---

### Flujo 19: Administrar Galería (Fotografías y Categorías)

- **1. ¿Existe?:** SÍ. Backend: tablas `gallery_items`, `gallery_categories`, bucket `gallery-images`; Frontend: `galleryService.ts`, `GalleryView.tsx`.
- **2. ¿Está conectado?:** SÍ. Subida física de fotos a Supabase Storage y persistencia en tabla.
- **3. ¿Está protegido?:** SÍ. Subida a Storage restringida a admin; tabla protegida por RLS.
- **4. ¿Es atómico?:** SÍ.
- **5. ¿Es consistente?:** SÍ en BD. Cuenta con caché local de respaldo.
- **6. ¿Es idempotente?:** SÍ.
- **7. ¿Es observable?:** SÍ.
- **8. ¿Tiene rollback?:** SÍ. Si falla el insert en BD, el servicio intenta eliminar el archivo de Storage.
- **9. ¿Tiene manejo de errores?:** SÍ. Formateo y captura exhaustiva de errores.
- **10. ¿Tiene auditoría?:** Auditoría en Storage y marcas de tiempo en BD.

---

### Flujo 20: Administrar Settings (Parámetros Globales del Sistema)

- **1. ¿Existe?:** SÍ. Backend: tabla `system_settings` + RPC `admin_update_system_settings`; Frontend: `SettingsView.tsx`, `SystemSettingsContext.tsx`.
- **2. ¿Está conectado?:** SÍ. Panel de ajustes conectado mediante contexto reactivo global.
- **3. ¿Está protegido?:** SÍ. `SECURITY DEFINER`, valida `is_admin(auth.uid())`. Fila única fija con `id = 1`.
- **4. ¿Es atómico?:** SÍ. Sentencia `UPDATE public.system_settings ... WHERE id = 1` con lock pesimista.
- **5. ¿Es consistente?:** SÍ. Valida rangos: duración entre 1 y 1440 min, boletos máx > 0.
- **6. ¿Es idempotente?:** SÍ. Asignar los mismos parámetros es completamente idempotente.
- **7. ¿Es observable?:** SÍ. Registra evento `SYSTEM_SETTINGS_UPDATED` en `audit_logs`.
- **8. ¿Tiene rollback?:** SÍ. Rollback completo ante fallo.
- **9. ¿Tiene manejo de errores?:** SÍ. Retorna `{"success": false, "error": "..."}`.
- **10. ¿Tiene auditoría?:** SÍ. Trazabilidad completa en `audit_logs` con los nuevos parámetros.

---

## 7. SECCIÓN 6: DICTAMEN FINAL Y CONCLUSIÓN DE LA AUDITORÍA MAESTRA

### Dictamen Técnico Consolidado:
El sistema **RifaManaure** presenta un núcleo de base de datos y transaccionalidad **excepcionalmente sólido y resistente**:
- La integridad de compra y prevención de sobreventa está garantizada a nivel matemático y físico por PostgreSQL mediante bloqueos ordenados pesimistas (`LockRows` con `ORDER BY number ASC FOR UPDATE`).
- Los triggers de estado impiden rigurosamente transiciones ilegales (ej. vender boletos sin orden pagada o alterar órdenes cerradas).
- En las pruebas de penetración y fuzzing (Auditoría 06), el sistema resistió con éxito el 98% de los vectores de ataque (49 de 50 pruebas en `PASS`).

### Principales Tareas Requeridas para Fase de Remediación:
1. **Infraestructura de Eventos:** Resolver el dilema de Realtime (activar selectivamente mediante vistas sanitizadas sin exponer `buyer_id`).
2. **Almacenamiento Seguro:** Privatizar el bucket `receipts` (`public = false`) y limitar a un máximo de 3 comprobantes por orden en `submit_payment_proof`.
3. **Consistencia de Código:** Estandarizar el contrato de retorno en RPCs administrativas y fijar `search_path` en procedimientos `SECURITY DEFINER`.

La auditoría global queda formalmente **CONCLUIDA, INTEGRADA Y CERTIFICADA AL 100%**.
