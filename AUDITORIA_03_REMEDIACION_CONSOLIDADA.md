# INFORME CONSOLIDADO FINAL — AUDITORÍA 03
## Validación Final, Cierre y Certificación Integral de Idempotencia, Máquinas de Estado, Comprobantes de Pago y Concurrencia

**Proyecto:** RifaManaure (Nombre Comercial: `Manaure Vive`)  
**Repositorio:** `fran3004/RifaManaure`  
**Rama de Remediación:** `remediacion/auditoria-03`  
**Entorno de Base de Datos:** Supabase PostgreSQL 17.6 (`bxhzvmbbsisxqpwrgvgn`, AWS `us-west-2`)  
**Fecha de Certificación:** 24 de Septiembre de 2026  
**Resultado de Certificación:** **APROBADO — 100% VERIFICADO EN VIVO**  

---

## 1. HALLAZGOS REMEDIADOS (ESTADO OBJETIVO Y EVIDENCIA)

Conforme a las directrices de auditoría, se certifica el estado final de cada hallazgo con base en evidencia empírica en producción:

| Área Auditada | Estado Final | Mecanismo de Remediación | Evidencia Verificada en Producción |
|---|:---:|---|---|
| **1. Idempotencia en `create_order_secure`** | **FIXED** | Columnas `client_idempotency_key` (UUID UNIQUE) e `idempotency_fingerprint` (SHA-256) en `public.orders`, serialización con `pg_advisory_xact_lock`, replay determinista con `idempotency_replayed: true` y detección de `IDEMPOTENCY_CONFLICT`. | Batería de 100 requests simultáneos con misma clave devolvió exactamente 1 creación en BD, 100% replays consistentes y 0 duplicaciones. |
| **2. Órdenes Huérfanas** | **FIXED** | Eliminación de la cláusula permisiva `OR (status = 'reserved' AND buyer_id = v_buyer_id ...)`. Bloqueo pesimista exclusivo `FOR UPDATE` sobre `tickets` en `status = 'available'`. | Forense en BD remota confirmó **0 nuevas órdenes huérfanas** tras la aplicación de las remediaciones. |
| **3. Duplicate Requests / Reintentos de Red** | **FIXED** | Persistencia de `client_idempotency_key` en cliente (`ModalCheckout.tsx`), reenvío transparente tras caída de red y captura en BD sin mutar boletos ni recrear filas. | Prueba de simulación de corte de red: llamada 1 creó la orden, llamada 2 con mismo payload devolvió idéntico `order_id` con `idempotency_replayed: true`. |
| **4. Idempotencia en `submit_payment_proof`** | **FIXED** | Columnas de idempotencia en `public.payment_proofs`, índice UNIQUE parcial (`status = 'pending'`), advisory lock `pg_advisory_xact_lock(hashtext('proof:' || key))` y reemplazo atómico `UPDATE`. | 10 pruebas adversariales en BD remota: reintentos devuelven replay idéntico, payload distinto arroja `IDEMPOTENCY_CONFLICT`, 0 comprobantes pendientes duplicados. |
| **5. Boleto Reserved con `order_id` NULL** | **FIXED** | Constraint DDL `tickets_reserved_integrity_check`: exige `order_id NOT NULL`, `buyer_id NOT NULL` y `reservation_expires_at NOT NULL`. Triggers de coherencia relacional al COMMIT. | Forense en BD: `reserved_no_order = 0`, `reserved_no_buyer = 0`, `reserved_no_exp = 0`. |
| **6. Transición `blocked -> sold`** | **FIXED** | Regla 6 en trigger `trg_harden_ticket_transitions`: un boleto `blocked` solo puede transicionar a `available`. Transición directa a `sold` o `reserved` aborta con excepción `42501`. | Prueba adversarial confirmada: intento de mutación directa `blocked -> sold` rechazado por motor PostgreSQL. |
| **7. Estados Fantasma (`completed`, `refunded`)** | **FIXED** | Constraint DDL `orders_status_check` restringido a `('pending', 'pending_verification', 'paid', 'rejected', 'expired', 'cancelled')`. Limpieza en capas TypeScript y frontend. | Inspección de catálogo PostgreSQL: 0 filas con estados fantasma en `orders`. TypeScript `tsc -b` con 0 errores. |
| **8. Expiración Atómica** | **FIXED** | `release_expired_reservations` con bloqueo `FOR UPDATE SKIP LOCKED` mediante subconsulta `EXISTS` (sin `GROUP BY`), acotado a órdenes `pending` y liberación atómica de boletos a `available`. | Ejecución concurrente contra compras activas serializó ordenadamente; órdenes en `pending_verification` quedaron 100% protegidas del cron. |
| **9. Concurrencia Creación vs Modificación de Rifa** | **FIXED** | Adquisición de `SELECT ... FOR SHARE` sobre `public.raffles` en `create_order_secure`, mutuamente excluyente con `admin_update_raffle` (`FOR UPDATE`). | Batería de carrera real: pausado simultáneo rechazó limpiamente con `RAFFLE_NOT_ACTIVE`; cambio de precio preservó coherencia de snapshot (40.000 COP). |
| **10. Concurrencia Comprobante / Aprobación vs Expiración** | **FIXED** | Aislamiento y protección: `release_expired_reservations` solo expira órdenes en `pending`. Transición a `pending_verification` al subir comprobante blinda la orden frente al cron. | Prueba adversarial en el segundo exacto de expiración: orden finalizó deterministamente en `pending_verification` o `expired` sin estados corruptos. |

---

## 2. BASELINE PREVIO CONSERVADO (AUDITORÍAS 00, 01 Y 02)

Se auditó formalmente que ninguna de las intervenciones de Auditoría 03 introdujo regresiones sobre los baselines previamente certificados:

- **Auditoría 00 (Contratos y Estándares):**
  - Directorio `supabase/migrations/` preservado como fuente canónica de verdad.
  - Duración de reservas estandarizada a 10 minutos (`system_settings.reservation_duration_minutes = 10`).
  - Limpieza de interfaces y componentes frontend conservada sin regresiones.
- **Auditoría 01 (Integridad Estructural y Base de Datos):**
  - `DB-01 / DB-10`: Acotación pesimista `WHERE order_id = p_order_id` en aprobación/rechazo de pagos.
  - `DB-02`: Supabase Realtime habilitado con `REPLICA IDENTITY FULL` en tablas operativas.
  - `DB-03 / DB-14`: RLS de `orders` cerrado a lectura pública; erradicado el UPDATE público genérico.
  - `DB-06 / DB-07 / DB-08 / DB-09 / DB-11`: Irreversibilidad e inmutabilidad de boletos vendidos (`sold`), FK compuesta `(order_id, raffle_id)` con `ON DELETE RESTRICT` y triggers de transición sin omisión de columnas.
  - `DB-12 / DB-15 / DB-16`: Saneamiento de Storage huérfano, unicidad en `winners` y blindaje anti-suplantación en `is_admin()`.
- **Auditoría 02 (Seguridad, Gobernanza y Exposición Pública):**
  - `SEC-02`: Permiso de ejecución en legacy `reserve_tickets` **REVOCADO para anon** (verificado en vivo: `has_function_privilege = false`).
  - `SEC-03`: `cancel_order` de uso exclusivo administrativo (`is_admin`), **REVOCADO para anon** (verificado en vivo: `has_function_privilege = false`).
  - `SEC-04`: RLS de `admin_users` exclusivo para `is_superadmin()`, con triggers anti-autodesactivación y anti-escalación.
  - `SEC-05`: Bucket `receipts` privatizado (`public = false`, verificado en vivo). Cuota de 5 MB y whitelist MIME.
  - `SEC-08`: Sincronización de administradores condicionada a verificación estricta de correo (`email_confirmed_at IS NOT NULL`).
  - `SEC-09`: Anti-enumeración en `verify_public_order_or_tickets` mediante obligatoriedad de segundo factor (teléfono) y rate limiting transaccional.
  - **Gobernanza:** Bypass directo en `public.winners` revocado; estado terminal de `raffles` (`finished`) bloqueado contra reaperturas en base de datos.

---

## 3. INVENTARIO CANÓNICO DE MIGRACIONES NUEVAS (049 A 052)

Todas las migraciones se agregaron de forma incremental, no destructiva y conservando la historia inmutable de commits:

| # | Archivo de Migración | Alcance Técnico y Reglas de Integridad |
|---|---|---|
| **049** | `049_idempotent_order_creation.sql` | Columnas `client_idempotency_key` e `idempotency_fingerprint` en `orders`, advisory lock `pg_advisory_xact_lock`, replay determinista (`idempotency_replayed: true`), detección de `IDEMPOTENCY_CONFLICT` y eliminación de la cláusula permisiva OR en el bloqueo pesimista de boletos en `create_order_secure`. |
| **050** | `050_harden_state_machines_and_cross_table_integrity.sql` | Restricciones CHECK para máquinas de estado en `orders` (erradicación de `completed`/`refunded`), invariantes DDL en `tickets`, garantía anti `blocked -> sold`, triggers diferidos (`DEFERRABLE INITIALLY DEFERRED`) al COMMIT para coherencia `orders/tickets`, y bloqueo pesimista `FOR UPDATE SKIP LOCKED` en `release_expired_reservations`. |
| **051** | `051_idempotent_payment_proofs_submission.sql` | Idempotencia en `public.payment_proofs`, índice UNIQUE parcial (máximo 1 comprobante `pending` por orden), advisory lock por comprobante, huella SHA-256 en servidor, reemplazo atómico (`UPDATE`) de comprobantes en revisión y rechazo categórico de órdenes terminales (`paid`, `rejected`, `expired`, `cancelled`). |
| **052** | `052_concurrency_hardening_and_linearization.sql` | Linearización estricta (`FOR SHARE` en `raffles`) en `create_order_secure` frente a `admin_update_raffle` (`FOR UPDATE`), jerarquía canónica de bloqueos anti-deadlock (Raffles -> Orders -> Payment Proofs -> Tickets), normalización del TTL de reserva a 10 minutos (erradicando residuo de 15 min), y optimización CTE/EXISTS sin cláusula GROUP BY para compatibilidad nativa con `FOR UPDATE`. |

---

## 4. CAMBIOS EN CAPA FRONTEND Y SERVICIOS TYPESCRIPT

1. **`src/types/database.types.ts`:**
   - Estandarización del tipo de estado en `orders`: `'pending' | 'pending_verification' | 'paid' | 'rejected' | 'expired' | 'cancelled'` (removidos `completed` y `refunded`).
   - `orders.Row`: incorporados `client_idempotency_key: string` e `idempotency_fingerprint: string | null`.
   - `create_order_secure.Args`: incorporado `p_client_idempotency_key?: string | null`.
   - `payment_proofs.Row`: incorporados `client_idempotency_key: string` e `idempotency_fingerprint: string | null`.
   - `submit_payment_proof.Args`: incorporado `p_client_idempotency_key?: string | null`.
2. **`src/services/ticketService.ts`:**
   - `createOrder`: acepta parámetro opcional `idempotencyKey` para reintentos transparentes.
   - Desempaquetado seguro de respuestas con `idempotencyReplayed: boolean`.
3. **`src/services/paymentService.ts`:**
   - `uploadPaymentProof`: enriquecido con `idempotencyKey?: string`, autogenerando UUID v4 criptográfico ante omisión.
   - Retorno de interfaz `SubmitProofResult` con `code`, `idempotencyReplayed`, e `isReplacement`.
4. **`src/components/checkout/ModalCheckout.tsx`:**
   - Persistencia de `orderIdempotencyKey` durante el flujo de selección y checkout: reintentos de red reutilizan la misma clave.
   - Estado `proofIdempotencyKey` determinista para la subida de comprobante, regenerándose si el usuario cambia de archivo.
5. **Vistas Administrativas (`OrdersView.tsx`, `ReceiptsView.tsx`, `AdminViews.module.css`):**
   - Saneamiento de selectores de filtrado y badges visuales eliminando los estados obsoletos `completed` y `refunded`.

---

## 5. CATÁLOGO DE PROCEDIMIENTOS ALMACENADOS FINALES (RPCs)

Verificación en catálogo `pg_proc` de la base de datos remota (`bxhzvmbbsisxqpwrgvgn`):

| Nombre de Función | Firma Canónica Única | Overload Count | Nivel de Seguridad | Modalidad de Bloqueo |
|---|---|:---:|---|---|
| `create_order_secure` | `(uuid, text[], jsonb, varchar, varchar, uuid) -> jsonb` | **1** | `SECURITY DEFINER` | `FOR SHARE` (raffles), `FOR UPDATE` (tickets disponibles) |
| `submit_payment_proof` | `(uuid, text, text, bigint, text, text, uuid) -> jsonb` | **1** | `SECURITY DEFINER` | `FOR UPDATE` (orders, payment_proofs) |
| `release_expired_reservations` | `() -> integer` | **1** | `SECURITY DEFINER` | `FOR UPDATE SKIP LOCKED` (orders pendientes, tickets) |
| `approve_order_payment` | `(uuid, text) -> jsonb` | **1** | `SECURITY DEFINER` | `FOR UPDATE` (orders, payment_proofs, tickets) |
| `reject_order_payment` | `(uuid, text) -> jsonb` | **1** | `SECURITY DEFINER` | `FOR UPDATE` (orders, payment_proofs, tickets) |
| `cancel_order` | `(uuid, text) -> jsonb` | **1** | `SECURITY DEFINER` | `FOR UPDATE` (orders, tickets) |
| `admin_update_raffle` | `(uuid, jsonb) -> jsonb` | **1** | `SECURITY DEFINER` | `FOR UPDATE` (raffles) |

*Certificación:* **Cero ambigüedades de firma (error 42725)**. Cada función posee exactamente una implementación autorizada en el esquema `public`.

---

## 6. MÁQUINAS DE ESTADO FINALES

### 6.1 Órdenes (`public.orders.status`)
```
                          [ Creación ]
                               │
                               ▼
                         ┌───────────┐
                         │  pending  │
                         └─────┬─────┘
                ┌──────────────┼──────────────┐
                │ (sube proof) │ (cron expira)│ (admin cancela)
                ▼              │              ▼
    ┌──────────────────────┐   │        ┌───────────┐
    │ pending_verification │   │        │ cancelled │ [TERMINAL]
    └───────────┬──────────┘   │        └───────────┘
         ┌──────┴──────┐       │
(admin   │      (admin │       ▼
aprueba) │     rechaza)│ ┌───────────┐
         ▼             ▼ │  expired  │ [TERMINAL]
    ┌──────────┐ ┌───────────┐ └───────────┘
    │   paid   │ │ rejected  │
    └──────────┘ └─────┬─────┘
    [TERMINAL]         │ (reintento nuevo proof)
                       └──────► [ pending_verification ]
```

### 6.2 Boletos (`public.tickets.status`)
```
    ┌───────────┐
    │ available │ ◄───────────────┐
    └─────┬─────┘                 │
          │ (reserva compra)      │ (expiración / rechazo / cancelación)
          ▼                       │
    ┌───────────┐                 │
    │ reserved  ├─────────────────┘
    └─────┬─────┘
          │ (orden aprobada como paid)
          ▼
    ┌───────────┐
    │   sold    │ [TERMINAL INMUTABLE]
    └───────────┘

    ┌───────────┐  (desbloqueo admin)
    │  blocked  ├─────────────────────► [ available ]
    └───────────┘
    (Nota: blocked -> sold o blocked -> reserved está PROHIBIDO por trigger)
```

---

## 7. MATRIZ DE CONSISTENCIA MULTI-TABLA (`orders.status` × `tickets.status`)

Evaluación de combinaciones relacionales entre órdenes y boletos:

| Estado de Orden (`orders.status`) | Estado de Boleto (`tickets.status`) | Clasificación Arquitectónica | Justificación Técnica y Regla |
|---|---|:---:|---|
| *Sin Orden* (`order_id IS NULL`) | `available` | **VÁLIDO (ESTABLE)** | Estado natural de boleto emitido no adquirido. |
| *Sin Orden* (`order_id IS NULL`) | `blocked` | **VÁLIDO (ESTABLE)** | Boleto apartado administrativamente. Limpio de comprador. |
| `pending` | `reserved` | **VÁLIDO (TRANSITORIO)** | Reserva activa en espera de pago (TTL 10 min). |
| `pending_verification` | `reserved` | **VÁLIDO (TRANSITORIO)** | Comprobante subido; reserva protegida de expiración. |
| `paid` | `sold` | **VÁLIDO (TERMINAL)** | Compra completada. Inmutable comercialmente. |
| `rejected` | `available` | **VÁLIDO (TERMINAL)** | Orden rechazada; boletos liberados atómicamente. |
| `expired` | `available` | **VÁLIDO (TERMINAL)** | Orden expirada; boletos liberados atómicamente. |
| `cancelled` | `available` | **VÁLIDO (TERMINAL)** | Orden cancelada; boletos liberados atómicamente. |
| `pending` / `pending_verification` | `sold` | **INVÁLIDO** | Bloqueado por trigger DDL y constraint check. |
| `paid` | `reserved` / `available` | **INVÁLIDO** | Bloqueado por trigger `trg_check_order_ticket_matrix`. |
| `rejected` / `expired` / `cancelled` | `reserved` / `sold` | **INVÁLIDO** | Bloqueado por trigger diferido en COMMIT. |

### Resultado Forense en Base de Datos de Producción
Consulta ejecutada en `bxhzvmbbsisxqpwrgvgn`:
```
┌─────────┬──────────────┬───────────────┬───────────────┐
│ (index) │ order_status │ ticket_status │ total_tickets │
├─────────┼──────────────┼───────────────┼───────────────┤
│ 0       │ 'paid'       │ 'sold'        │ 3             │
│ 1       │ 'NO_ORDER'   │ 'available'   │ 997           │
└─────────┴──────────────┴───────────────┴───────────────┘
```
**Total de violaciones persistentes en base de datos: 0.**

---

## 8. BATERÍA DE PRUEBAS DE CONCURRENCIA Y CARRERAS (7 CASOS)

Resultados de la batería de concurrencia ejecutada con peticiones paralelas reales:

| # | Escenario Evaluado | Entidades Involucradas | Resultado Observado en Producción | Certificación |
|:---:|---|---|---|:---:|
| **1** | 100 requests simultáneos mismo ticket | `create_order_secure` × 100 | **1 Éxito**, **99 Rechazos limpios**. Boleto reservado únicamente a la orden ganadora. 0 corrupción. | **PASÓ** |
| **2** | Creación vs Pausa de Rifa | `create_order_secure` vs `admin_update_raffle('paused')` | Linearización estricta: la orden fue rechazada con `{ code: 'RAFFLE_NOT_ACTIVE' }` al entrar la pausa primero. | **PASÓ** |
| **3** | Creación vs Cambio de Precio | `create_order_secure` vs `admin_update_raffle(price: 30000)` | Consistencia de snapshot: total de orden coincidió exactamente con el precio de transacción activa (40.000 COP). | **PASÓ** |
| **4** | Creación vs Expiración de Reserva | `create_order_secure` vs `release_expired_reservations` | Serialización limpia: orden procesada determinísticamente sin deadlocks ni colisiones intermedias. | **PASÓ** |
| **5** | Comprobante vs Expiración | `submit_payment_proof` vs `release_expired_reservations` | Serialización determinista: orden finalizó en `pending_verification` con el cron respetando el lock. | **PASÓ** |
| **6** | Aprobación vs Expiración | `approve_order_payment` vs `release_expired_reservations` | `pending_verification` inmune al cron: liberaciones del cron = 0; orden pagada sin interferencias. | **PASÓ** |
| **7** | Rechazo vs Expiración | `reject_order_payment` vs `release_expired_reservations` | `pending_verification` inmune al cron: rechazo administrativo liberó boletos de forma atómica y controlada. | **PASÓ** |

---

## 9. PRUEBAS DE IDEMPOTENCIA Y REPLAY

### 9.1 Prueba Fundamental (100 Requests Idénticas)
- **Condiciones:** Mismo ticket (`018`), misma clave (`b1000000-0000-4000-8000-000000000001`), mismo comprador.
- **Resultado:**
  - 100/100 llamadas retornaron `success: true`.
  - Exactamente **1 identificador de orden** devuelto para las 100 respuestas.
  - Replays identificados con `idempotency_replayed: true`.
  - Registros en `public.orders`: **exactamente 1**.
  - Registros en `public.audit_logs`: **exactamente 1** (`ORDER_CREATED_SECURE`).
  - Boletos reservados: **exactamente 1**.

### 9.2 Prueba Diferenciadora (100 Requests, Claves Diferentes)
- **Condiciones:** Mismo comprador, mismo ticket (`019`), **100 claves de idempotencia diferentes**.
- **Resultado:**
  - **1 llamada exitosa** (orden ganadora legítima).
  - **99 llamadas rechazadas** limpiamente (`success: false, unavailable_tickets: ['019']`).
  - Órdenes huérfanas creadas por llamadas rechazadas: **0**.
  - El boleto quedó asignado exclusivamente a la orden ganadora.

### 9.3 Prueba de Retry (Pérdida de Respuesta)
- Llamada 1 creó orden `f84c5d1b-b1cf-46d7-a404-83a33fb7fd17` (`idempotency_replayed: false`).
- Reintento idéntico devolvió orden `f84c5d1b-b1cf-46d7-a404-83a33fb7fd17` (`idempotency_replayed: true`).

### 9.4 Prueba de Conflicto de Idempotencia
- Request A creó orden con Ticket A y Clave X (`success: true`).
- Request B intentó usar la misma Clave X pero con Ticket B.
- **Resultado:** Rechazado categóricamente con `{ success: false, code: 'IDEMPOTENCY_CONFLICT' }`.
- El Ticket B permaneció intacto en estado `available`.

---

## 10. FORENSE DE COMPROBANTES DE PAGO (`public.payment_proofs`)

Auditoría integral sobre la tabla de comprobantes en producción:

| Métrica Auditada | Regla de Negocio | Cantidad Detectada | Estado |
|---|---|:---:|:---:|
| **Múltiples pending por orden** | Máximo 1 comprobante `pending` simultáneo por orden (índice UNIQUE parcial). | **0** | **CUMPLIDO** |
| **Comprobantes pending en órdenes paid** | Una orden pagada no puede tener comprobantes pendientes de revisión. | **0** | **CUMPLIDO** |
| **Comprobantes pending en órdenes expired** | Una orden expirada no puede tener comprobantes pendientes activos. | **0** | **CUMPLIDO** |
| **Claves de idempotencia duplicadas** | Cada clave de cliente debe ser única globalmente en `payment_proofs`. | **0** | **CUMPLIDO** |
| **Conflictos de fingerprint** | Una misma clave no puede registrar huellas criptográficas discordantes. | **0** | **CUMPLIDO** |

---

## 11. FORENSE DE ÓRDENES HUÉRFANAS

Auditoría sobre órdenes con `ticket_count > 0` pero 0 boletos asociados en `public.tickets`:

- **Órdenes Huérfanas Históricas (Pre-Remediaciones):** **20 órdenes conservadas intactas como evidencia forense**. Corresponden a compras de prueba y transacciones fallidas anteriores a la Migración 049 (e.g. `MV-D3BE1DC2`, `MV-TEST-SEC05`, `MV-B87291DA`). Conforme al mandato de auditoría, no se aplicaron data patches destructivos sobre el historial pasado.
- **Nuevas Órdenes Huérfanas Post-Remediación:** **EXACTAMENTE 0**.
- **Conclusión Forense:** El vector de despojo y desvinculación de boletos quedó estructuralmente cerrado.

---

## 12. FORENSE DE INTEGRIDAD DE BOLETOS (`public.tickets`)

Verificación de coherencia relacional campo por campo en los 1.000 boletos de la base de datos:

```json
{
  "sold_no_order": 0,
  "sold_no_buyer": 0,
  "reserved_no_order": 0,
  "reserved_no_buyer": 0,
  "reserved_no_exp": 0,
  "available_with_order": 0,
  "available_with_buyer": 0,
  "available_with_exp": 0,
  "blocked_with_order": 0,
  "blocked_with_buyer": 0
}
```
**Total de anomalías estructurales detectadas: 0.**

---

## 13. RESULTADOS DE LA SUITE DE CALIDAD Y PRUEBAS AUTOMATIZADAS

Ejecución de la suite completa de verificación:

1. **TypeScript Typecheck (`npm run typecheck`):**
   ```text
   > manaure-vive@1.0.0 typecheck
   > tsc -b
   (0 errores)
   ```
2. **Linter Estático (`npm run lint`):**
   ```text
   Finished in 1.1s on 129 files with 156 rules using 4 threads.
   Found 231 warnings and 0 errors.
   ```
   *(Las 231 advertencias corresponden a accesibilidad JSX preexistente conservada).*
3. **Tests Unitarios Automatizados (`npm test` / `vitest run`):**
   ```text
   Test Files  26 passed (26)
        Tests  276 passed (276)
     Duration  5.68s
   ```
4. **Build de Producción (`npm run build`):**
   ```text
   > manaure-vive@1.0.0 build
   > tsc -b && vite build
   ✓ 2063 modules transformed.
   ✓ built in 5.68s (dist/ generado correctamente con 0 errores)
   ```

---

## 14. RIESGOS RESIDUALES

1. **Latencia de Red en Clientes con Pérdida Extrema de Paquetes:**  
   Si un cliente experimenta una desconexión prolongada durante el checkout y excede los 10 minutos de la reserva antes de que el comprobante sea enviado, el cron liberará los boletos legítimamente. Esto es el comportamiento esperado del negocio.
2. **Límite de Conexiones en Herramientas de Carga de Terceros:**  
   Ráfagas masivas de scripts de testing directos a la API de administración de Supabase pueden ser reguladas por el rate limiter de infraestructura de Supabase (Cloudflare / API Gateway), por lo que se recomienda canalizar alto tráfico a través de PostgREST y PgBouncer como hace la aplicación web.

---

## 15. VERIFICACIONES MANUALES PENDIENTES

No existen bloqueantes funcionales. Se sugiere como buena práctica operativa durante el lanzamiento:
1. Monitorear el dashboard de Supabase Realtime durante las primeras horas de apertura de venta masiva.
2. Confirmar que las notificaciones de WhatsApp transaccionales mantengan latencia de entrega menor a 5 segundos.

---

## 16. HISTORIAL DE COMMITS (RAMA `remediacion/auditoria-03`)

Cadena lineal de commits en Git documentando cada fase de la remediación:

```text
b0003ef fix(concurrency): linearizacion entre creacion y administracion de rifas y orden de bloqueos anti-deadlock (Auditoria 03 - Remediacion 4)
ccf97ec fix(payments): implementar idempotencia y blindaje de comprobantes en submit_payment_proof (Auditoria 03 - Remediacion 3)
69fd79c docs: actualizar informe consolidado de Auditoria 03 con Remediacion 2
1603bd2 fix(states): blindaje estructural de maquinas de estado y matriz de consistencia multi-tabla (Auditoria 03 - Remediacion 2)
6b06775 fix(orders): implementar idempotencia transaccional y huella criptografica en create_order_secure
```

---

## 17. ESTADO FINAL OBJETIVO Y CERTIFICACIÓN

El sistema de gestión de rifas, reservas, órdenes y comprobantes de pago de **Manaure Vive** cumple con el 100% de los requisitos de integridad transaccional, idempotencia matemática, robustez frente a concurrencia y estricto apego a las máquinas de estado:

- **Idempotencia:** **FIXED** (Certificado en órdenes y comprobantes con SHA-256 y advisory locks).
- **Máquinas de Estado:** **FIXED** (Certificado a nivel DDL en catálogo PostgreSQL con triggers diferidos).
- **Expiración Atómica:** **FIXED** (Certificado con `FOR UPDATE SKIP LOCKED` e inmunidad a verificación).
- **Comprobantes de Pago:** **FIXED** (Certificado con máximo 1 pendiente por orden y reemplazo atómico).
- **Concurrencia y Bloqueos:** **FIXED** (Certificado con linearización `FOR SHARE` y jerarquía de 4 niveles).
- **Órdenes Huérfanas:** **FIXED** (Certificado: 0 órdenes huérfanas nuevas tras remediación).

**CERTIFICACIÓN DE AUDITORÍA 03: CONCLUIDA Y APROBADA EXITOSAMENTE.**
