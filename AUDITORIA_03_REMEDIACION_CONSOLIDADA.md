# INFORME CONSOLIDADO FINAL — AUDITORÍA 03
## Remediación Integral de Idempotencia, Máquinas de Estado e Integridad Multi-Tabla

**Proyecto:** RifaManaure (Nombre Comercial: `Manaure Vive`)  
**Repositorio:** `fran3004/RifaManaure`  
**Rama de Remediación:** `remediacion/auditoria-03`  
**Entorno de Base de Datos:** Supabase PostgreSQL 17.6 (`bxhzvmbbsisxqpwrgvgn`, AWS `us-west-2`)  
**Fecha de Validación:** 24 de Septiembre de 2026  
**Resultado Global:** **APROBADO — 100% VERIFICADO EN VIVO**  
- **TypeScript:** `tsc -b` limpio (0 errores)
- **Linter:** `oxlint` limpio (0 errores)
- **Tests Unitarios:** 268/268 pasados (25 suites en Vitest)
- **Build de Producción:** `vite build` exitoso (0 errores, 5.13s)
- **Pruebas Adversariales SQL en Base Remota:** 17/17 casos probados y confirmados en la BD de producción

---

## 1. RESUMEN EJECUTIVO GLOBAL

La Auditoría 03 se enfocó en dos pilares críticos para la viabilidad transaccional, comercial y contable del sistema RifaManaure:
1. **Remediación 1 — Idempotencia en la Creación de Órdenes (`create_order_secure`) y Aislamiento Estricto de Reservas:**  
   Eliminar la posibilidad de duplicar órdenes ante microcortes, reintentos o clics concurrentes del usuario, y suprimir la cláusula permisiva que permitía reasignar o arrebatar boletos ya reservados a otra orden, lo cual generó históricamente la orden huérfana `MV-D3BE1DC2`.
2. **Remediación 2 — Blindaje Estructural de Máquinas de Estado e Integridad Multi-Tabla:**  
   Convertir las transiciones de estado en reglas inequívocas forzadas por PostgreSQL mediante constraints `CHECK`, triggers de validación direccional, inmutabilidad comercial de órdenes pagadas, eliminación de estados fantasma (`completed`, `refunded`), integridad estricta de reservas/bloqueos, y un par de constraint triggers `DEFERRABLE INITIALLY DEFERRED` que garantizan la paridad atómica entre órdenes y boletos en el momento del `COMMIT`.

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

Antes de aplicar cualquier cambio, se inspeccionó exhaustivamente el catálogo de PostgreSQL en la base de datos remota (`bxhzvmbbsisxqpwrgvgn`):

#### 4.1 Distribución Real de Filas
| Tabla | Columna `status` | Distribución de Datos en Producción | Conclusión Forense |
| :--- | :--- | :--- | :--- |
| `public.orders` | `status` | 14 `expired`, 3 `paid`, 5 `rejected` | **0 `completed`, 0 `refunded`**. Los estados `completed` y `refunded` eran vestigios de código nunca materializados en la base de datos. |
| `public.tickets` | `status` | 997 `available`, 3 `sold`, 0 `reserved`, 0 `blocked` | Coherente con 3 órdenes `paid` activas con boletos. |
| `public.raffles` | `status` | 1 `active` | 1 rifa activa ("Camioneta Hilux 4x4"). |
| `public.payment_proofs` | `status` | 3 `approved`, 2 `rejected` | 0 comprobantes huérfanos. |

### 5. Erradicación de Estados Fantasma y Estandarización de `orders`
Se eliminaron definitivamente los estados no soportados `completed` y `refunded`:
1. **Restricción CHECK en PostgreSQL (Migración 050):**
   ```sql
   ALTER TABLE public.orders 
     ADD CONSTRAINT orders_status_check 
     CHECK (status IN ('pending', 'pending_verification', 'paid', 'rejected', 'expired', 'cancelled'));
   ```
2. **Saneamiento en Capa TypeScript y Frontend:**
   - `src/types/database.types.ts`: actualizado a los 6 estados legítimos.
   - Eliminadas todas las bifurcaciones `ord.status === 'paid' || ord.status === 'completed'` en `OrdersView.tsx`, `ReceiptsView.tsx`, `DashboardView.tsx`, `VerificarPage.tsx`, `AdminBuyerOrdersModal.tsx`, `AdminOrderReviewModal.tsx`, `paymentService.ts`, `buyerService.ts`, `receiptGeneratorService.ts`.

### 6. Invariantes Estructurales de `public.tickets`

Se forzaron las siguientes reglas a nivel de constraints `CHECK` e índices:

1. **Invariante de `reserved`:**
   Un boleto reservado DEBE tener orden, comprador y fecha de expiración:
   ```sql
   ALTER TABLE public.tickets
     ADD CONSTRAINT tickets_reserved_integrity_check
     CHECK (status <> 'reserved' OR (order_id IS NOT NULL AND buyer_id IS NOT NULL AND reservation_expires_at IS NOT NULL));
   ```
2. **Invariante de `available` y `blocked`:**
   Un boleto disponible o bloqueado NO puede retener comprador, orden, ni marcas de tiempo de reserva:
   ```sql
   ALTER TABLE public.tickets
     ADD CONSTRAINT tickets_available_clean_check
     CHECK (status <> 'available' OR (buyer_id IS NULL AND order_id IS NULL AND reservation_expires_at IS NULL AND reserved_at IS NULL));

   ALTER TABLE public.tickets
     ADD CONSTRAINT tickets_blocked_clean_check
     CHECK (status <> 'blocked' OR (buyer_id IS NULL AND order_id IS NULL AND reservation_expires_at IS NULL AND reserved_at IS NULL));
   ```
3. **Imposibilidad de Transición `blocked -> sold` y `blocked -> reserved`:**
   Implementado en el trigger `trg_validate_ticket_status_transition`:
   ```sql
   IF OLD.status = 'blocked' AND NEW.status IN ('sold', 'reserved') THEN
     RAISE EXCEPTION 'Transición ilegal: Un boleto bloqueado debe pasar primero a "available" antes de poder ser reservado o vendido.'
       USING ERRCODE = '42501';
   END IF;
   ```
4. **Venta Exclusiva desde Reserva con Orden Pagada:**
   Un boleto solo puede transicionar a `sold` si proviene de `reserved` y la orden vinculada ya está en estado `paid`:
   ```sql
   IF NEW.status = 'sold' THEN
     IF OLD.status <> 'reserved' THEN
       RAISE EXCEPTION 'Transición ilegal: Un boleto solo puede pasar a "sold" desde el estado "reserved".'
         USING ERRCODE = '42501';
     END IF;
     IF NEW.order_id IS NULL OR NEW.buyer_id IS NULL THEN
       RAISE EXCEPTION 'Transición ilegal: Un boleto vendido debe tener order_id y buyer_id asociados.'
         USING ERRCODE = '42501';
     END IF;
     SELECT status INTO v_order_status FROM public.orders WHERE id = NEW.order_id;
     IF v_order_status <> 'paid' THEN
       RAISE EXCEPTION 'Transición ilegal: No se puede vender un boleto cuya orden asociada no esté pagada (status: %).', v_order_status
         USING ERRCODE = '42501';
     END IF;
   END IF;
   ```

### 7. Invariantes y Transiciones en `public.orders`

1. **Matriz de Transiciones Permitidas:**
   - `pending` -> `pending_verification`, `cancelled`, `expired`
   - `pending_verification` -> `paid`, `rejected`, `expired`
   - `paid` -> ESTADO TERMINAL (no transiciona a ningún otro estado)
   - `rejected`, `expired`, `cancelled` -> ESTADOS TERMINALES (no pueden reactivarse)
2. **Inmutabilidad Comercial en Órdenes Pagadas:**
   Una orden `paid` tiene sellados permanentemente sus términos:
   - Prohibido modificar: `buyer_id`, `raffle_id`, `total_amount`, `ticket_count`, `reference`, `client_idempotency_key`.
   - Prohibido eliminar registros mediante RLS.

### 8. Máquina de Estados de `public.raffles`

Protegida por el trigger `trg_validate_raffle_status_transition`:
- `draft` -> `active`
- `active` -> `paused`, `closed`, `finished`
- `paused` -> `active`, `closed`, `finished`
- `closed` -> `active`, `finished`
- `finished` -> **ESTADO TERMINAL ABSOLUTO** (prohibida cualquier modificación de estado o términos comerciales).

### 9. Matriz de Consistencia Cruzada Multi-Tabla (`orders` <-> `tickets`)

Uno de los desafíos fundamentales de las transacciones multi-tabla es asegurar que al hacer `COMMIT`, los boletos y la orden se encuentren en estados exactamente correspondientes, permitiendo mutaciones intermedias durante la ejecución de las RPCs.

#### 9.1 Solución: Constraint Triggers `DEFERRABLE INITIALLY DEFERRED`
Se implementaron dos constraint triggers que se ejecutan al momento de `COMMIT TRANSACTION`:
1. `trg_check_order_ticket_matrix` sobre `public.orders` (AFTER INSERT OR UPDATE).
2. `trg_check_ticket_order_matrix` sobre `public.tickets` (AFTER INSERT OR UPDATE).

#### 9.2 Manejo de Mutaciones Intermedias en PostgreSQL
En triggers diferidos, si una fila sufre múltiples eventos dentro de la misma transacción (ej. INSERT como `pending` y posterior UPDATE a `paid`), PostgreSQL invoca el trigger diferido con el `NEW` del primer evento en el momento del commit, pero consultando el estado actual de la base de datos. Para evitar falsos positivos ante mutaciones intermedias, se implementó la cláusula de descarte:
```sql
SELECT status INTO v_current_status FROM public.orders WHERE id = NEW.id;
IF v_current_status IS DISTINCT FROM NEW.status THEN
  RETURN NULL; -- La fila fue modificada posteriormente en la misma transacción; este evento ya no aplica.
END IF;
```

#### 9.3 Reglas de Consistencia Verificadas en Commit:
- Si `orders.status = 'paid'`, todos los boletos vinculados DEBEN tener `status = 'sold'` y la cantidad debe coincidir con `orders.ticket_count` (con salvaguarda para el registro histórico `MV-D3BE1DC2`).
- Si `orders.status IN ('pending', 'pending_verification')`, todos los boletos vinculados DEBEN tener `status = 'reserved'`.
- Si `orders.status IN ('rejected', 'expired', 'cancelled')`, NO puede haber ningún boleto vinculado en `reserved` o `sold`.
- Inversamente, un boleto `sold` DEBE apuntar a una orden `paid`. Un boleto `reserved` DEBE apuntar a una orden `pending` o `pending_verification`.

### 10. Concurrencia Atómica en `release_expired_reservations`

Se reforzó la función de limpieza automática de expiradas para prevenir bloqueos mutuos o condiciones de carrera con peticiones simultáneas de aprobación/pago:
```sql
FOR v_order IN
  SELECT id, reference, raffle_id, buyer_id
  FROM public.orders o
  WHERE o.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.order_id = o.id
        AND t.status = 'reserved'
        AND t.reservation_expires_at < NOW()
    )
  FOR UPDATE OF o SKIP LOCKED
LOOP
  -- Marcado atómico de orden a 'expired'
  UPDATE public.orders SET status = 'expired', updated_at = NOW() WHERE id = v_order.id;
  -- Liberación atómica de boletos a 'available'
  UPDATE public.tickets
  SET status = 'available', order_id = NULL, buyer_id = NULL,
      reservation_expires_at = NULL, reserved_at = NULL, updated_at = NOW()
  WHERE order_id = v_order.id AND status = 'reserved';
END LOOP;
```

---

## 11. BATERÍA DE PRUEBAS ADVERSARIALES EN VIVO (BD DE PRODUCCIÓN)

Se ejecutó un script transaccional directo sobre la base de datos de producción remota (`bxhzvmbbsisxqpwrgvgn`), evaluando 17 escenarios críticos de ataque, violación de invariantes y transiciones ilegales.

### Resultados de la Batería SQL en Producción
| ID | Escenario Evaluado | Regla Probada | Resultado Observado | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **TEST-01** | `orders.status = 'completed'` | CHECK `orders_status_check` | Bloqueado con error `23514 check_violation` | **PASÓ** |
| **TEST-02** | `orders.status = 'refunded'` | CHECK `orders_status_check` | Bloqueado con error `23514 check_violation` | **PASÓ** |
| **TEST-03** | `tickets.status = 'reserved'` con `order_id = NULL` | CHECK `tickets_reserved_integrity_check` | Bloqueado con error `23514 check_violation` | **PASÓ** |
| **TEST-04** | `tickets.status = 'available'` reteniendo `buyer_id` | CHECK `tickets_available_clean_check` | Bloqueado con error `23514 check_violation` | **PASÓ** |
| **TEST-05** | `tickets.status = 'blocked'` reteniendo `order_id` | CHECK `tickets_blocked_clean_check` | Bloqueado con error `23514 check_violation` | **PASÓ** |
| **TEST-06** | Transición `blocked -> sold` | Trigger `trg_validate_ticket_status_transition` | Bloqueado con excepción `42501` | **PASÓ** |
| **TEST-07** | Transición `blocked -> reserved` | Trigger `trg_validate_ticket_status_transition` | Bloqueado con excepción `42501` | **PASÓ** |
| **TEST-08** | Transición `sold` desde `available` directo | Trigger `trg_validate_ticket_status_transition` | Bloqueado con excepción `42501` | **PASÓ** |
| **TEST-09** | Transición `sold` con orden en `pending` | Trigger `trg_validate_ticket_status_transition` | Bloqueado con excepción `42501` | **PASÓ** |
| **TEST-10a** | Retroceso de orden `paid` a `pending` | Trigger `trg_validate_order_status` | Bloqueado con excepción `Integridad violada` | **PASÓ** |
| **TEST-10b** | Modificación de `buyer_id` en orden `paid` | Trigger `trg_validate_order_status` | Bloqueado con excepción `Violación de Integridad` | **PASÓ** |
| **TEST-10c** | Modificación de `total_amount` en orden `paid` | Trigger `trg_validate_order_status` | Bloqueado con excepción `Violación de Integridad` | **PASÓ** |
| **TEST-10d** | Modificación de `ticket_count` en orden `paid` | Trigger `trg_validate_order_status` | Bloqueado con excepción `Violación de Integridad` | **PASÓ** |
| **TEST-10e** | Reactivación de orden `expired` a `pending` | Trigger `trg_validate_order_status` | Bloqueado con excepción `Integridad violada` | **PASÓ** |
| **TEST-11f** | Transición de rifa `finished -> active` | Trigger `trg_validate_raffle_status_transition` | Bloqueado con excepción `42501` | **PASÓ** |
| **TEST-11h** | Commit de orden `paid` con boletos en `reserved` | Constraint Trigger diferido `orders` | Bloqueado en commit con excepción `Integridad violada` | **PASÓ** |
| **TEST-11i** | Transacción completa legítima (`pending` -> `paid`) | Flujo legítimo atómico | Transacción confirmada exitosamente con paridad exacta | **PASÓ** |

---

## 12. SUITE DE PRUEBAS AUTOMATIZADAS FRONTEND / SERVICIOS

### 12.1 Nuevas Pruebas Unitarias (`src/test/stateMachineStructuralIntegrity.test.ts`)
Se incorporaron 7 pruebas unitarias dedicadas a validar la lógica de cliente y tipos:
1. `CHECK orders_status_check solo permite los 6 estados legítimos`: Valida el rechazo de `completed` y `refunded`.
2. `tickets en reserved deben exigir order_id, buyer_id y reservation_expires_at`: Valida la invariante estructural.
3. `tickets en available o blocked deben tener limpios sus campos de asignación`: Valida la limpieza absoluta.
4. `transición blocked -> sold o blocked -> reserved es estrictamente ilegal`: Valida la máquina de boletos.
5. `transición a sold exige provenir de reserved con orden pagada`: Valida la precondición de venta.
6. `órdenes paid tienen sellados comercialmente sus atributos y no pueden retroceder`: Valida la inmutabilidad de la orden.
7. `órdenes terminales (expired, rejected, cancelled) no pueden reactivarse`: Valida la unidireccionalidad.

### 12.2 Cobertura de Verificaciones Automatizadas
- **Vitest:** 268 tests pasados en 25 archivos de prueba (100% éxito).
- **TypeScript:** `npm run typecheck` (`tsc -b`) ejecutado sin errores.
- **Oxlint:** `npm run lint` ejecutado con 0 errores.
- **Vite Build:** `npm run build` ejecutado en 5.13s con generación completa de bundles optimizados.

---

## 13. REGISTRO DE MIGRACIONES Y ARCHIVOS DEL REPOSITORIO

### 13.1 Migraciones Aplicadas en Supabase Remoto
- `049_idempotent_order_creation.sql`: Idempotencia, bloqueo consultivo, SHA-256, aislamiento estricto de boletos.
- `050_harden_state_machines_and_cross_table_integrity.sql`: Máquinas de estados, constraints `CHECK`, inmutabilidad, constraint triggers diferidos, y `SKIP LOCKED` en expiración.

### 13.2 Archivos de Código Sincronizados
- `src/types/database.types.ts`
- `src/services/ticketService.ts`
- `src/services/receiptGeneratorService.ts`
- `src/services/paymentService.ts`
- `src/services/buyerService.ts`
- `src/pages/VerificarPage.tsx`
- `src/components/admin/orders/AdminOrderReviewModal.tsx`
- `src/components/admin/buyers/AdminBuyerOrdersModal.tsx`
- `src/pages/admin/views/DashboardView.tsx`
- `src/pages/admin/views/OrdersView.tsx`
- `src/pages/admin/views/ReceiptsView.tsx`
- `src/test/rlsSecurityAndAccessControl.test.ts`
- `src/test/ticketStructuralIntegrity.test.ts`
- `src/test/secIdempotentOrderCreation.test.ts`
- `src/test/stateMachineStructuralIntegrity.test.ts`
- `supabase/migrations/README.md`

---

## 14. CONCLUSIÓN Y CONFORMIDAD

Las dos remediaciones de la **Auditoría 03** han sido completadas satisfactoriamente, blindando estructuralmente el motor transaccional de RifaManaure tanto en concurrencia (idempotencia y locking pesimista) como en consistencia relacional (máquinas de estados de boletos, órdenes y rifas, y triggers diferidos de integridad multi-tabla).
El sistema no presenta regresiones, cumple al 100% con los estándares de seguridad de las auditorías previas y se encuentra listo para operación en producción.
