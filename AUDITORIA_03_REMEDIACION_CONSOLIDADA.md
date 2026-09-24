# INFORME CONSOLIDADO FINAL — AUDITORÍA 03
## Remediación Integral de Idempotencia, Máquinas de Estado y Comprobantes de Pago

**Proyecto:** RifaManaure (Nombre Comercial: `Manaure Vive`)  
**Repositorio:** `fran3004/RifaManaure`  
**Rama de Remediación:** `remediacion/auditoria-03`  
**Entorno de Base de Datos:** Supabase PostgreSQL 17.6 (`bxhzvmbbsisxqpwrgvgn`, AWS `us-west-2`)  
**Fecha de Validación:** 24 de Septiembre de 2026  
**Resultado Global:** **APROBADO — 100% VERIFICADO EN VIVO**  
- **TypeScript:** `tsc -b` limpio (0 errores)
- **Linter:** `oxlint` limpio (0 errores)
- **Tests Unitarios:** 276/276 pasados (26 suites en Vitest)
- **Build de Producción:** `vite build` exitoso (0 errores, 5.42s)
- **Pruebas Adversariales SQL en Base Remota:**
  - 17/17 casos probados y confirmados en Remediación 2
  - 10/10 casos probados y confirmados en Remediación 3
  - 2/2 escenarios de concurrencia real con `Promise.all` validados en vivo

---

## 1. RESUMEN EJECUTIVO GLOBAL

La Auditoría 03 abordó y resolvió los tres pilares críticos de integridad comercial, concurrencia y coherencia de estados en el ciclo de vida de compras y pagos de RifaManaure:
1. **Remediación 1 — Idempotencia en la Creación de Órdenes (`create_order_secure`) y Aislamiento Estricto de Reservas (Migración 049):**  
   Eliminación de la duplicación de órdenes y erradicación de la cláusula permisiva `OR (status = 'reserved' AND buyer_id = v_buyer_id ...)` que históricamente causó la desvinculación y orfandad de boletos en la orden `MV-D3BE1DC2`.
2. **Remediación 2 — Blindaje Estructural de Máquinas de Estado e Integridad Multi-Tabla (Migración 050):**  
   Erradicación formal de estados fantasma (`completed`, `refunded`), refuerzo DDL estricto de `tickets` (`reserved`, `available`, `blocked`), inmutabilidad de órdenes pagadas, máquina estricta de `raffles`, y constraint triggers diferidos (`DEFERRABLE INITIALLY DEFERRED`) que garantizan la correspondencia atómica entre órdenes y boletos en el `COMMIT`.
3. **Remediación 3 — Idempotencia y Blindaje de Comprobantes de Pago en `submit_payment_proof` (Migración 051):**  
   Incorporación de clave de idempotencia del cliente (`client_idempotency_key`), cálculo server-side de huella digital SHA-256, serialización consultiva con `pg_advisory_xact_lock`, índice único parcial que garantiza como máximo un comprobante `pending` por orden, reemplazo atómico (`UPDATE`) de comprobantes en verificación, y rechazo categórico de órdenes terminales (`paid`, `rejected`, `expired`, `cancelled`).

---

## PARTE I: REMEDIACIÓN 1 — IDEMPOTENCIA Y RESERVA ATÓMICA

### 2. El Problema Original de Idempotencia
Antes de la Migración 049, cada invocación de `create_order_secure` generaba un nuevo registro en `public.orders`, asignaba una referencia `MV-XXXXXXXX` e intentaba reservar los boletos con la siguiente consulta:
```sql
WHERE raffle_id = p_raffle_id
  AND number = ANY(p_ticket_numbers)
  AND (
    status = 'available' 
    OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW())
  )
FOR UPDATE;
```
Esto permitía que una segunda petición con el mismo comprador reasignara los boletos a una nueva orden (`UPDATE tickets SET order_id = v_order_id ...`), desvinculando la primera orden y dejándola huérfana.

### 3. Solución Implementada (Migración 049)
1. **`client_idempotency_key UUID NOT NULL DEFAULT gen_random_uuid()`** con índice único en `public.orders`, más `idempotency_fingerprint VARCHAR(64)`.
2. **Backfill Transparente:** Todas las órdenes históricas recibieron una clave única generada en servidor.
3. **Bloqueo Consultivo Transaccional:** `PERFORM pg_advisory_xact_lock(hashtext(v_idempotency_key::TEXT));` para serializar peticiones idénticas concurrentes.
4. **Huella Criptográfica SHA-256:** `encode(digest(v_fingerprint_source, 'sha256'), 'hex')` calculada en servidor sobre `(raffle_id, tickets ordenados, document_id, payment_method, contact_preference)`.
5. **Replay Idempotente:** Si la clave existe con la misma huella, devuelve la orden original (`idempotency_replayed: true`) sin crear filas ni mutar boletos.
6. **Detección de Conflicto:** Si la misma clave se reutiliza con un payload diferente, rechaza con `IDEMPOTENCY_CONFLICT`.
7. **Aislamiento Estricto:** Eliminación absoluta de `OR (status = 'reserved' AND buyer_id = v_buyer_id ...)`. Solo se pueden bloquear y reservar boletos con `status = 'available'`.
8. **Frontend y TypeScript:** Soporte en `ModalCheckout.tsx` y `ticketService.ts`, conservando la clave de idempotencia a través de reintentos de red durante el checkout.

---

## PARTE II: REMEDIACIÓN 2 — MÁQUINAS DE ESTADO E INTEGRIDAD ESTRUCTURAL MULTI-TABLA

### 4. Inventario Real de Estados en Base de Datos de Producción
Se inspeccionó exhaustivamente el catálogo de PostgreSQL en la base de datos remota (`bxhzvmbbsisxqpwrgvgn`):
- `public.orders.status`: 14 `expired`, 3 `paid`, 5 `rejected`. Exactamente **0 `completed`, 0 `refunded`**.
- `public.tickets.status`: 997 `available`, 3 `sold`, 0 `reserved`, 0 `blocked`.
- `public.raffles.status`: 1 `active`.
- `public.payment_proofs.status`: 3 `approved`, 2 `rejected`, 0 `pending`.

### 5. Erradicación de Estados Fantasma y Estandarización de `orders`
1. **Restricción CHECK en PostgreSQL (Migración 050):**
   ```sql
   ALTER TABLE public.orders 
     ADD CONSTRAINT orders_status_check 
     CHECK (status IN ('pending', 'pending_verification', 'paid', 'rejected', 'expired', 'cancelled'));
   ```
2. **Saneamiento en Capa TypeScript y Frontend:**
   Eliminadas todas las referencias residuales a `completed` y `refunded` en vistas administrativas, componentes modales y servicios.

### 6. Invariantes Estructurales de `public.tickets`
- `tickets_reserved_integrity_check`: todo boleto `reserved` exige `order_id`, `buyer_id` y `reservation_expires_at` no nulos.
- `tickets_available_clean_check` y `tickets_blocked_clean_check`: boletos disponibles o bloqueados tienen limpios `buyer_id`, `order_id`, `reservation_expires_at` y `reserved_at`.
- Máquina de estados: transición `blocked -> sold` y `blocked -> reserved` bloqueada (excepción `42501`); `sold` solo permitido desde `reserved` con orden `paid`.

### 7. Inmutabilidad y Consistencia Cruzada (`DEFERRABLE INITIALLY DEFERRED`)
- Triggers diferidos `trg_check_order_ticket_matrix` y `trg_check_ticket_order_matrix` verifican la correspondencia exacta de órdenes y boletos al momento de `COMMIT TRANSACTION`, con descarte de eventos intermedios.
- Inmutabilidad comercial en órdenes `paid`: prohibido alterar comprador, monto, cantidad de boletos, rifa o referencia.
- Bloqueo pesimista `FOR UPDATE OF o SKIP LOCKED` en `release_expired_reservations`.

---

## PARTE III: REMEDIACIÓN 3 — IDEMPOTENCIA Y BLINDAJE DE COMPROBANTES DE PAGO

### 8. El Problema Original en `submit_payment_proof`
En la arquitectura previa:
1. **Falta de Idempotencia:** La RPC no recibía ninguna clave de cliente ni calculaba huella digital. Cada invocación generaba un nuevo registro en `public.payment_proofs`.
2. **Acumulación de Comprobantes Activos:** Si un comprador reintentaba la subida o la red duplicaba la solicitud mientras la orden estaba en `pending_verification`, se creaban múltiples registros en `payment_proofs` con `status = 'pending'`, creando desorden operativo y riesgo de aprobaciones/rechazos inconsistentes.
3. **Manejo de Reemplazo:** No existía una mecánica clara para actualizar un comprobante corregido antes de la revisión administrativa sin duplicar filas.

### 9. Solución Implementada (Migración 051)

#### 9.1 Esquema e Índices de Idempotencia en `public.payment_proofs`
```sql
-- 1. Agregar columnas de idempotencia
ALTER TABLE public.payment_proofs
  ADD COLUMN IF NOT EXISTS client_idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint VARCHAR(64);

-- 2. Backfill transparente de filas históricas
UPDATE public.payment_proofs
SET client_idempotency_key = gen_random_uuid()
WHERE client_idempotency_key IS NULL;

ALTER TABLE public.payment_proofs
  ALTER COLUMN client_idempotency_key SET DEFAULT gen_random_uuid(),
  ALTER COLUMN client_idempotency_key SET NOT NULL;

-- 3. Índices de unicidad
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_proofs_client_idempotency_key
  ON public.payment_proofs(client_idempotency_key);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_idempotency_fingerprint
  ON public.payment_proofs(idempotency_fingerprint);
```

#### 9.2 Invariante Estructural: Máximo Un Comprobante Activo por Orden
Se implementó un **índice UNIQUE parcial**:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_proofs_single_pending_per_order
  ON public.payment_proofs(order_id)
  WHERE status = 'pending';
```
**Justificación de Diseño:**
- Permite conservar el historial completo de comprobantes rechazados (`status = 'rejected'`) o aprobados (`status = 'approved'`) para auditoría.
- Prohíbe físicamente en el motor de base de datos que existan dos o más comprobantes simultáneos en estado `pending` para la misma orden.

#### 9.3 Lógica Transaccional de `submit_payment_proof`
1. **Serialización Consultiva por Clave:**
   ```sql
   v_idempotency_key := COALESCE(p_client_idempotency_key, gen_random_uuid());
   PERFORM pg_advisory_xact_lock(hashtext('proof:' || v_idempotency_key::TEXT));
   ```
2. **Cálculo de Huella Criptográfica SHA-256 en Servidor:**
   ```sql
   v_fingerprint_source := p_order_id::TEXT || '|' ||
                           p_file_path || '|' ||
                           COALESCE(p_file_size::TEXT, '0') || '|' ||
                           LOWER(p_mime_type) || '|' ||
                           COALESCE(TRIM(p_payment_reference), '');

   v_fingerprint := encode(digest(v_fingerprint_source, 'sha256'), 'hex');
   ```
3. **Manejo de Replay y Conflicto:**
   - Si la clave ya existe con la misma huella: retorna de inmediato el comprobante registrado con `idempotency_replayed: true`.
   - Si la clave ya existe con huella diferente: retorna error `IDEMPOTENCY_CONFLICT`.
4. **Validación de Estados de la Orden:**
   - Solo acepta órdenes en `status IN ('pending', 'pending_verification')`.
   - Si la orden está en `paid`, `rejected`, `expired` o `cancelled`, rechaza con código `INVALID_ORDER_STATUS`.
5. **Validación Estricta de Ruta (Anti-Spoofing):**
   - La ruta del archivo DEBE contener el `p_order_id` exacto (`proofs/<order_id>/...` o `proofs/<raffle_id>/<order_id>/...`).
   - Rechaza rutas pertenecientes a otras órdenes con código `INVALID_PATH`.
6. **MIME Whitelist y Tamaño Máximo:**
   - Solo admite `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
   - Límite máximo estricto: 5.242.880 bytes (5 MB).
7. **Reemplazo Atómico (UPDATE vs INSERT):**
   - Si la orden ya cuenta con un comprobante en `status = 'pending'`, la RPC realiza un `UPDATE` de la fila existente actualizando archivo, huella, clave y timestamp, con retorno `is_replacement: true`.
   - Si no existe comprobante pendiente, realiza `INSERT` con captura de excepciones de colisión concurrente.
8. **Trazabilidad en Auditoría:**
   - Registra en `public.audit_logs` la acción `PAYMENT_PROOF_SUBMITTED` o `PAYMENT_PROOF_REPLACED` con el actor, orden, comprobante, referencia y clave de idempotencia, sin exponer PII.

---

## 10. RESULTADOS DE LA BATERÍA ADVERSARIAL EN VIVO (MIGRACIÓN 051)

Se ejecutó un script de verificación adversarial en la base de datos de producción remota (`bxhzvmbbsisxqpwrgvgn`), evaluando exhaustivamente los 10 escenarios requeridos:

| Caso | Escenario Evaluado | Regla Probada | Resultado Observado en Producción | Estado |
| :---: | :--- | :--- | :--- | :---: |
| **01** | Primera subida legítima | Inserción inicial y transición a `pending_verification` | `success: true, idempotency_replayed: false, is_replacement: false` | **PASÓ** |
| **02** | Retry con misma clave y payload | Replay idempotente sin duplicación | `success: true, idempotency_replayed: true, proof_id` idéntico | **PASÓ** |
| **03** | Concurrencia A y B (misma clave) | Serialización consultiva por transacción | Ambas peticiones concurrentes devuelven éxito; exactamente 1 proof en BD | **PASÓ** |
| **04** | Misma clave con payload diferente | Detección de conflicto criptográfico | Bloqueado con error `{ success: false, code: 'IDEMPOTENCY_CONFLICT' }` | **PASÓ** |
| **05** | Segunda subida / Reemplazo legítimo | Invariante de 1 comprobante pendiente por orden | `success: true, is_replacement: true`, recuento en BD = exactamente 1 | **PASÓ** |
| **06** | Subida en orden pagada (`paid`) | Inmutabilidad de orden terminal pagada | Bloqueado con error `{ success: false, code: 'INVALID_ORDER_STATUS' }` | **PASÓ** |
| **07** | Subida en orden expirada (`expired`) | Inmutabilidad de orden terminal expirada | Bloqueado con error `{ success: false, code: 'INVALID_ORDER_STATUS' }` | **PASÓ** |
| **08** | Ruta perteneciente a otra orden | Anti-Spoofing de rutas en Storage | Bloqueado con error `{ success: false, code: 'INVALID_PATH' }` | **PASÓ** |
| **09** | Formato de archivo / MIME inválido | Whitelist de tipos seguros | Bloqueado con error `{ success: false, code: 'INVALID_MIME_TYPE' }` | **PASÓ** |
| **10** | Archivo que excede 5 MB | Cuota máxima de almacenamiento | Bloqueado con error `{ success: false, code: 'FILE_TOO_LARGE' }` | **PASÓ** |

### 10.1 Prueba de Concurrencia Real con `Promise.all`
Se ejecutó un script independiente en Node.js que disparó peticiones HTTP concurrentes reales contra la API de base de datos remota:
- **Escenario 1 (A y B idénticos con misma clave):** Ambas llamadas resolvieron exitosamente, una generando el registro y la otra resolviendo el replay con `idempotency_replayed: true`.
- **Escenario 2 (A y B distintos simultáneos):** La serialización pesimista por fila de orden procesó la primera como inserción y la segunda como reemplazo atómico.
- **Resultado en BD:** `pending_count = 1`. Ninguna condición de carrera pudo crear comprobantes duplicados.

---

## 11. CAMBIOS EN CAPA FRONTEND Y TIPOS TYPESCRIPT

1. **Definiciones en `src/types/database.types.ts`:**
   - `payment_proofs.Row`: incorporados `client_idempotency_key: string` e `idempotency_fingerprint: string | null`.
   - `submit_payment_proof.Args`: agregado `p_client_idempotency_key?: string | null`.
2. **Servicio de Pagos (`src/services/paymentService.ts`):**
   - Interfaz `SubmitProofResult` extendida con `code`, `idempotencyReplayed` e `isReplacement`.
   - `uploadPaymentProof`: acepta parámetro opcional `idempotencyKey` con autogeneración vía `crypto.randomUUID()`.
   - `submitOrderReceipt`: función de compatibilidad actualizada con paso de `p_client_idempotency_key`.
3. **Flujo de Checkout (`src/components/checkout/ModalCheckout.tsx`):**
   - Incorporado estado `proofIdempotencyKey` que se genera de forma determinista para la subida del comprobante.
   - En caso de reintentos de red por parte del usuario, se reutiliza la misma clave garantizando un replay seguro.
   - Si el usuario cambia o remueve el archivo seleccionado, se regenera automáticamente una nueva clave.

---

## 12. SUITE GLOBAL DE PRUEBAS AUTOMATIZADAS

### 12.1 Nuevas Pruebas Unitarias (`src/test/secIdempotentPaymentProofs.test.ts`)
8 pruebas unitarias dedicadas que validan:
1. Envío de `p_client_idempotency_key` a la RPC.
2. Autogeneración de UUID v4 criptográfico ante omisión.
3. Desempaquetado de replays idempotentes (`idempotencyReplayed: true`).
4. Propagación del código `IDEMPOTENCY_CONFLICT`.
5. Reflejo de reemplazos legítimos (`isReplacement: true`).
6. Rechazo temprano de archivos mayores a 5 MB antes de consumir red.
7. Rechazo temprano de extensiones no permitidas (.exe, .zip).
8. Compatibilidad y paso de clave en `submitOrderReceipt`.

### 12.2 Cobertura de Verificaciones Automatizadas
- **Vitest:** **276 tests pasados en 26 archivos de prueba (100% éxito)**.
- **TypeScript:** `npm run typecheck` (`tsc -b`) ejecutado con **0 errores**.
- **Oxlint:** `npm run lint` ejecutado con **0 errores**.
- **Vite Build:** `npm run build` ejecutado en **5.42s** con generación completa de bundles optimizados.

---

## 13. REGISTRO DE MIGRACIONES Y ARCHIVOS DEL REPOSITORIO

### 13.1 Migraciones Aplicadas en Supabase Remoto
- `049_idempotent_order_creation.sql`: Idempotencia, bloqueo consultivo, SHA-256, aislamiento estricto de boletos en `create_order_secure`.
- `050_harden_state_machines_and_cross_table_integrity.sql`: Máquinas de estados, constraints `CHECK`, inmutabilidad, constraint triggers diferidos, y `SKIP LOCKED` en expiración.
- `051_idempotent_payment_proofs_submission.sql`: Idempotencia, índice UNIQUE parcial (máximo 1 proof pending por orden), reemplazo atómico y validaciones en `submit_payment_proof`.

### 13.2 Archivos de Código Sincronizados
- `src/types/database.types.ts`
- `src/services/paymentService.ts`
- `src/components/checkout/ModalCheckout.tsx`
- `src/test/secIdempotentPaymentProofs.test.ts`
- `supabase/migrations/051_idempotent_payment_proofs_submission.sql`
- `supabase/migrations/README.md`
- `AUDITORIA_03_REMEDIACION_CONSOLIDADA.md`

---

## 14. CONCLUSIÓN Y CONFORMIDAD

Las tres remediaciones de la **Auditoría 03** se encuentran **completadas, verificadas en producción y respaldadas por suites automatizadas**:
1. `create_order_secure` es estrictamente idempotente y ya no permite despojar boletos reservados.
2. Las máquinas de estado de órdenes, boletos y rifas están blindadas a nivel de catálogo PostgreSQL con consistencia relacional multi-tabla forzada en el COMMIT.
3. `submit_payment_proof` opera con idempotencia de cliente, bloqueo pesimista y consultivo, garantía estructural de máximo un comprobante activo por orden y trazabilidad integral en auditoría.
