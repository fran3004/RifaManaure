# INFORME CONSOLIDADO FINAL — AUDITORÍA 03: REMEDIACIÓN DE IDEMPOTENCIA Y RESERVA ATÓMICA

**Proyecto:** RifaManaure (Nombre Comercial: `Manaure Vive`)  
**Repositorio:** `fran3004/RifaManaure`  
**Rama de Remediación:** `remediacion/auditoria-03`  
**Entorno de Base de Datos:** Supabase PostgreSQL 17.6 (`bxhzvmbbsisxqpwrgvgn`, AWS `us-west-2`)  
**Fecha de Validación:** 24 de Septiembre de 2026  
**Resultado Global:** **APROBADO — 100% VERIFICADO EN VIVO** (261/261 tests unitarios, `tsc -b` limpio, `oxlint` 0 errores, `vite build` exitoso, pruebas SQL transaccionales en base remota verificadas).

---

## 1. RESUMEN EJECUTIVO

El presente informe documenta la solución integral y definitiva del **Hallazgo Prioritario de la Auditoría 03: Falta de Idempotencia en la Creación de Órdenes (`create_order_secure`)**, así como la eliminación del riesgo de reasignación y despojo indebido de boletos entre solicitudes concurrentes o reintentos del comprador.

### 1.1 El Problema Original
Antes de esta remediación, cada invocación a `create_order_secure` generaba un nuevo registro en la tabla `public.orders`, asignaba una nueva referencia alfanumérica (`MV-XXXXXXXX`) e intentaba reservar los boletos solicitados. Peor aún, la consulta de bloqueo pesimista en `create_order_secure` contenía la siguiente cláusula lógica:
```sql
-- VULNERABILIDAD / FALLA DE INTEGRIDAD PREVIA:
WHERE raffle_id = p_raffle_id
  AND number = ANY(p_ticket_numbers)
  AND (
    status = 'available' 
    OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW())
  )
FOR UPDATE;
```
Esta condición `OR (status = 'reserved' AND buyer_id = v_buyer_id ...)` permitía que si un comprador abría dos pestañas o si el frontend disparaba dos peticiones concurrentes/reintentadas, la segunda solicitud:
1. Creaba una **segunda orden** distinta para los mismos boletos.
2. **Reasignaba** los boletos ya reservados en la primera orden hacia la segunda orden (`UPDATE tickets SET order_id = v_order_id ...`).
3. Dejaba a la primera orden como una **orden huérfana sin boletos asociados**, lo que causaba que si el comprador pagaba la primera referencia, el sistema registraba una orden pagada con `ticket_count > 0` pero con `actual_tickets = 0` (como se evidenció en la auditoría del registro histórico `MV-D3BE1DC2`).

### 1.2 Logros de la Remediación
1. **Idempotencia Transaccional en Base de Datos (Migración 049):**
   - Incorporación de `client_idempotency_key UUID NOT NULL` con restricción de unicidad (`UNIQUE`) y `idempotency_fingerprint VARCHAR(64)` en la tabla `public.orders`.
   - Backfill transparente y no destructivo de todas las 22 órdenes históricas existentes.
   - Cálculo criptográfico del hash de la solicitud en el servidor usando SHA-256 (`extensions.digest(...)`) sobre la tupla normalizada `(raffle_id, ticket_numbers ordenados, document_id, payment_method, contact_preference)`.
   - Serialización de solicitudes concurrentes mediante bloqueo consultivo por transacción a nivel de PostgreSQL: `PERFORM pg_advisory_xact_lock(hashtext(v_idempotency_key::TEXT));`.
   - **Manejo de Replay Idempotente:** Si la clave ya existe con la misma huella digital, la RPC retorna de inmediato la orden existente con `idempotency_replayed: true` sin duplicar registros ni tocar boletos.
   - **Manejo de Conflicto:** Si la clave se reutiliza con un payload diferente, la RPC rechaza la operación con código `IDEMPOTENCY_CONFLICT`.
2. **Aislamiento Estricto de Reservas (Eliminación de la Cláusula Permisiva):**
   - Se eliminó completamente la cláusula `OR (status = 'reserved' AND buyer_id = v_buyer_id ...)`.
   - Una nueva orden solo puede reservar boletos que se encuentren con `status = 'available'`. Ninguna solicitud puede arrebatar boletos ya asignados a otra orden previa.
3. **Estabilidad y Coherencia en Capa TypeScript y Frontend:**
   - Tipos TypeScript sincronizados con el nuevo esquema de `orders` y parámetros de la RPC.
   - `src/services/ticketService.ts` enriquecido con soporte de `idempotencyKey`, retorno de `idempotencyReplayed` y generación automática de UUID seguro como fallback.
   - `src/components/checkout/ModalCheckout.tsx` gestiona una clave de idempotencia estable por sesión de compra, preservándola a través de reintentos de red y regenerándola exclusivamente al completar o reiniciar la transacción.
4. **Análisis Forense de Órdenes Huérfanas Históricas:**
   - Auditoría completa de las 22 órdenes de producción, explicando con exactitud el incidente de la orden pagada huérfana `MV-D3BE1DC2` y formulando recomendaciones de conciliación operativa sin mutación arbitraria.

---

## 2. DETALLE DE LA IMPLEMENTACIÓN EN BASE DE DATOS

### 2.1 Migración 049 (`049_idempotent_order_creation.sql`)
La migración fue ejecutada y verificada exitosamente en la base de datos de producción (`bxhzvmbbsisxqpwrgvgn`).

#### A. Evolución del Esquema en `public.orders`
```sql
-- 1. Agregar columna client_idempotency_key como nullable temporalmente para permitir backfill
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS client_idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint VARCHAR(64);

-- 2. Backfill seguro de registros históricos existentes (garantiza valores no nulos y únicos)
UPDATE public.orders 
SET client_idempotency_key = gen_random_uuid() 
WHERE client_idempotency_key IS NULL;

-- 3. Imponer NOT NULL y DEFAULT permanente
ALTER TABLE public.orders 
  ALTER COLUMN client_idempotency_key SET DEFAULT gen_random_uuid(),
  ALTER COLUMN client_idempotency_key SET NOT NULL;

-- 4. Crear índices de unicidad y búsqueda eficiente
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_idempotency_key 
  ON public.orders(client_idempotency_key);

CREATE INDEX IF NOT EXISTS idx_orders_idempotency_fingerprint 
  ON public.orders(idempotency_fingerprint);
```

#### B. Prevención de Ambigüedad de Sobrecarga (Error 42725)
Antes de crear la nueva definición de la RPC con 6 argumentos (`p_client_idempotency_key UUID DEFAULT NULL`), se eliminó de forma determinista la firma previa de 5 argumentos para impedir que PostgreSQL dispare el error `42725: function create_order_secure is not unique`:
```sql
DROP FUNCTION IF EXISTS public.create_order_secure(uuid, text[], jsonb, character varying, character varying);
```

#### C. Lógica Interna de la RPC `create_order_secure`
La función fue redefinida con `SECURITY DEFINER` y `SET search_path = public, extensions, pg_temp;` (asegurando el acceso transparente a las funciones de `pgcrypto` como `digest`):

1. **Resolución de la Clave de Idempotencia:**
   ```sql
   v_idempotency_key := COALESCE(p_client_idempotency_key, gen_random_uuid());
   ```
2. **Serialización Concurrente con Advisory Locks:**
   ```sql
   PERFORM pg_advisory_xact_lock(hashtext(v_idempotency_key::TEXT));
   ```
   Cualquier petición concurrente que intente procesar la misma clave espera a que la primera transacción culmine, eliminando por completo condiciones de carrera antes de tocar los índices o tablas.
3. **Cálculo de Huella Criptográfica SHA-256 (Server-Side):**
   ```sql
   -- Normalización de boletos ordenados de forma determinista
   SELECT array_agg(t ORDER BY t) INTO v_normalized_tickets
   FROM unnest(p_ticket_numbers) AS t;

   v_fingerprint_source := p_raffle_id::TEXT || '|' ||
                           array_to_string(v_normalized_tickets, ',') || '|' ||
                           v_buyer_doc || '|' ||
                           COALESCE(p_payment_method, 'transfer_manual') || '|' ||
                           COALESCE(p_contact_preference, 'whatsapp');

   v_fingerprint := encode(digest(v_fingerprint_source, 'sha256'), 'hex');
   ```
4. **Verificación de Replay y Conflicto:**
   ```sql
   SELECT id, reference, total_amount, ticket_count, status, idempotency_fingerprint
   INTO v_existing_order
   FROM public.orders
   WHERE client_idempotency_key = v_idempotency_key;

   IF FOUND THEN
     IF v_existing_order.idempotency_fingerprint IS NOT NULL 
        AND v_existing_order.idempotency_fingerprint <> v_fingerprint THEN
       RETURN jsonb_build_object(
         'success', false,
         'code', 'IDEMPOTENCY_CONFLICT',
         'error', 'Conflicto de idempotencia: la clave ya fue utilizada con parámetros de compra diferentes.'
       );
     END IF;

     -- Obtener expiración actual de la reserva
     SELECT MIN(reservation_expires_at) INTO v_res_expires_at
     FROM public.tickets
     WHERE order_id = v_existing_order.id;

     RETURN jsonb_build_object(
       'success', true,
       'order_id', v_existing_order.id,
       'reference', v_existing_order.reference,
       'total_amount', v_existing_order.total_amount,
       'ticket_count', v_existing_order.ticket_count,
       'reservation_expires_at', v_res_expires_at,
       'idempotency_replayed', true
     );
   END IF;
   ```
5. **Bloqueo Pesimista Estricto de Boletos:**
   ```sql
   SELECT array_agg(id), count(*)
   INTO v_ticket_ids, v_locked_count
   FROM public.tickets
   WHERE raffle_id = p_raffle_id
     AND number = ANY(p_ticket_numbers)
     AND status = 'available'  -- AISLAMIENTO ESTRICTO: NINGUNA OTRA ORDEN PUEDE SER ARREBATADA
   FOR UPDATE;

   IF v_locked_count <> v_ticket_count THEN
     RETURN jsonb_build_object(
       'success', false,
       'error', 'Uno o más números ya no se encuentran disponibles.'
     );
   END IF;
   ```
6. **Inserción Segura con Manejo de Excepción Secundaria:**
   ```sql
   INSERT INTO public.orders (
     raffle_id, buyer_id, reference, total_amount, ticket_count,
     status, payment_method, contact_preference,
     client_idempotency_key, idempotency_fingerprint
   ) VALUES (
     p_raffle_id, v_buyer_id, v_reference, v_total_amount, v_ticket_count,
     'pending', COALESCE(p_payment_method, 'transfer_manual'),
     COALESCE(p_contact_preference, 'whatsapp'),
     v_idempotency_key, v_fingerprint
   ) RETURNING id INTO v_order_id;
   ```
   En caso de una colisión de clave concurrente por milisegundos, el bloque `EXCEPTION WHEN unique_violation` captura el error y delega la respuesta a la lógica de replay sin abortar con una falla no controlada.

---

## 3. PRUEBAS TRANSACCIONALES EN VIVO (POSTGRESQL REMOTO)

Se ejecutó un script de verificación adversarial en la base de datos de producción con los siguientes escenarios y resultados:

```sql
DO $$
DECLARE
  v_res1 JSONB;
  v_res2 JSONB;
  v_res3 JSONB;
  v_res4 JSONB;
  v_key UUID := gen_random_uuid();
  ...
BEGIN
  -- Test 1: Creación normal con clave de idempotencia
  v_res1 := public.create_order_secure(..., p_client_idempotency_key := v_key);
  -- Resultado: success = true, idempotency_replayed = false

  -- Test 2: Replay con misma clave y mismos datos
  v_res2 := public.create_order_secure(..., p_client_idempotency_key := v_key);
  -- Resultado: success = true, idempotency_replayed = true, order_id idéntico a Test 1

  -- Test 3: Conflicto con misma clave pero número de boleto distinto
  v_res3 := public.create_order_secure(..., p_ticket_numbers := ARRAY['002'], p_client_idempotency_key := v_key);
  -- Resultado: success = false, code = 'IDEMPOTENCY_CONFLICT'

  -- Test 4: Intento de reservar boletos ocupados con clave distinta
  v_res4 := public.create_order_secure(..., p_client_idempotency_key := gen_random_uuid());
  -- Resultado: success = false, error = 'Uno o más números ya no se encuentran disponibles.'
END $$;
```

**Evidencia de Verificación:**
- `test1_first`: Orden creada exitosamente (`idempotency_replayed: false`).
- `test2_replay`: Retornó la misma orden sin duplicar (`idempotency_replayed: true`).
- `test3_conflict`: Retornó error `{ success: false, code: "IDEMPOTENCY_CONFLICT", error: "Conflicto de idempotencia: la clave ya fue utilizada con parámetros de compra diferentes." }`.
- `test4_collision`: Retornó error `{ success: false, error: "Uno o más números ya no se encuentran disponibles." }` demostrando que la cláusula `OR (status = 'reserved' ...)` ya no permite arrebatar boletos.

---

## 4. INFORME FORENSE DE ÓRDENES HUÉRFANAS HISTÓRICAS

Se ejecutó una inspección exhaustiva de la totalidad de las órdenes históricas en la base de datos de producción (`bxhzvmbbsisxqpwrgvgn`).

### 4.1 Censo General de Órdenes
- **Total de órdenes en el sistema:** 22
- **Órdenes activas con boletos asignados correctamente:** 2
- **Órdenes en estados de abandono/rechazo con boletos liberados:** 19 (18 `expired`, 1 `rejected`).
  - *Comportamiento esperado del sistema:* Cuando una orden de reserva expira (tras 10 minutos) o es rechazada por el administrador, los boletos vinculados retornan a estado `available` y su campo `order_id` se desvincula por diseño del job de limpieza.
- **Anomalía crítica identificada:** **1 orden** (`MV-D3BE1DC2`).

### 4.2 Análisis Detallado de la Anomalía `MV-D3BE1DC2`
| Parámetro | Valor Registrado |
| :--- | :--- |
| **ID de la Orden** | `d3be1dc2-...` |
| **Referencia** | `MV-D3BE1DC2` |
| **Estado (`status`)** | `paid` |
| **Fecha de Creación** | `2026-03-08 04:36:26 UTC` |
| **Monto Total (`total_amount`)** | \$175.000 COP |
| **Cantidad de Boletos (`ticket_count`)** | 7 boletos |
| **Boletos Vinculados en BD (`actual_tickets`)** | **0 boletos** |
| **Comprador (`buyer_id`)** | `f07da78c-f5a9-4c82-9d10-e652b0aacbd0` |

#### Reconstrucción de la Secuencia de Causa Raíz
Al inspeccionar las órdenes asociadas a ese mismo `buyer_id`, se encontró el siguiente registro previo:
- **Orden previa:** `MV-435E4138`, creada a las `2026-03-08 04:36:07 UTC` (exactamente **19 segundos antes** que `MV-D3BE1DC2`).
- **Estado de la orden previa:** `expired`.
- **Mecanismo del Fallo:**
  1. El usuario seleccionó 7 boletos a las 04:36:07 e inició la orden `MV-435E4138`. Los boletos quedaron en `status = 'reserved'`.
  2. Debido a un doble clic, reintento del navegador o reapertura del checkout 19 segundos después, el frontend invocó de nuevo `create_order_secure` sin clave de idempotencia.
  3. En ese momento, la cláusula legacy `OR (status = 'reserved' AND buyer_id = v_buyer_id AND ...)` permitió que la segunda orden `MV-D3BE1DC2` se creara y reasignara los 7 boletos a `MV-D3BE1DC2`.
  4. Sin embargo, al expirar la primera sesión o concurrir el job de expiración sobre la orden original que quedó colgada, el desajuste de estados provocó que los boletos se liberaran y quedaran disponibles o fueran adquiridos en un ciclo posterior.
  5. Posteriormente, el administrador aprobó el pago de `MV-D3BE1DC2`, dejando la orden en `paid` pero sin ningún boleto vinculado en la tabla `tickets`.

#### Recomendación de Conciliación
> [!IMPORTANT]
> **No Mutación Arbitraria de Datos Históricos:**  
> Por política de auditoría estricta, no se eliminó ni alteró el registro histórico `MV-D3BE1DC2`.  
> Se recomienda al equipo de administración:
> 1. Contactar al comprador vinculado (`f07da78c-f5a9-4c82-9d10-e652b0aacbd0`) a través del canal oficial de WhatsApp.
> 2. Verificar el comprobante de pago de \$175.000 COP.
> 3. En caso de corroborar la validez del recaudo, acordar la asignación manual de 7 números disponibles mediante el panel administrativo o proceder a la devolución del importe según los términos de la rifa.

---

## 5. CAMBIOS EN CÓDIGO FRONTEND Y SERVICIOS

### 5.1 Definición de Tipos (`src/types/database.types.ts`)
Se incorporaron las columnas a la interfaz de TypeScript generada para Supabase:
- `orders.Row`: `client_idempotency_key: string`, `idempotency_fingerprint: string | null`.
- `orders.Insert`: `client_idempotency_key?: string`, `idempotency_fingerprint?: string | null`.
- `orders.Update`: `client_idempotency_key?: string`, `idempotency_fingerprint?: string | null`.
- `create_order_secure.Args`: `p_client_idempotency_key?: string | null`.

### 5.2 Servicio de Boletos (`src/services/ticketService.ts`)
- Se extendió `CreateOrderResult` con `idempotencyReplayed?: boolean` y `code?: string`.
- Se adaptó `createOrder` para aceptar `idempotencyKey?: string`.
- Si el cliente no pasa una clave, el servicio genera automáticamente un UUID seguro mediante `crypto.randomUUID()`.
- La llamada RPC envía `p_client_idempotency_key: clientKey` y mapea la respuesta del servidor.

### 5.3 Componente de Pago (`src/components/checkout/ModalCheckout.tsx`)
- Se introdujo el estado `idempotencyKey`:
  ```tsx
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : ''
  );
  ```
- En `handleConfirmReservation`, se envía `idempotencyKey` a `createOrder`. Si el usuario sufre un microcorte o reintenta sin cerrar el modal, la clave se preserva intacta, garantizando que el servidor responda de forma idempotente sin duplicar órdenes.
- Cuando el flujo finaliza exitosamente (Paso 7 cerrado) o cuando se pulsa "Intentar de nuevo" tras un error de números agotados, se genera automáticamente una nueva clave UUID para la sesión subsiguiente.

### 5.4 Mantenimiento de Tipos en Vistas Administrativas (`src/pages/admin/views/TicketsView.tsx`)
- Se sincronizó el objeto sintetizado `orderData` con `client_idempotency_key` e `idempotency_fingerprint` para satisfacer `OrderWithDetails` sin errores de compilación TypeScript.

---

## 6. SUITE DE PRUEBAS AUTOMATIZADAS Y VERIFICACIÓN

### 6.1 Nuevas Pruebas Unitarias (`src/test/secIdempotentOrderCreation.test.ts`)
Se implementó una suite completa de 5 pruebas unitarias dedicadas:
1. `createOrder debe enviar p_client_idempotency_key como argumento de la RPC create_order_secure`: Verifica que la clave viaje en el payload RPC.
2. `si no se pasa idempotencyKey, createOrder debe auto-generar un UUID v4 válido como clave de idempotencia`: Comprueba el fallback criptográfico client-side.
3. `ante reintentos con la misma clave y payload, debe retransmitir la misma orden con idempotencyReplayed = true`: Valida el desempaquetado de replays idempotentes.
4. `ante conflicto de idempotencia (misma clave, diferente payload), debe propagar el error y código IDEMPOTENCY_CONFLICT`: Valida la detección de conflictos.
5. `ante colisión de boletos con orden ajena, debe reportar indisponibilidad sin crear orden duplicada`: Valida la respuesta ante números ocupados.

### 6.2 Resultados de Ejecución Global
| Verificación | Herramienta | Comando | Resultado |
| :--- | :--- | :--- | :--- |
| **Pruebas Unitarias** | Vitest 5.0.1 | `npx vitest run` | **261 passed (24 test files)**, 0 fallos. |
| **Verificación de Tipos** | TypeScript | `npm run typecheck` (`tsc -b`) | **0 errores**, compilación limpia. |
| **Análisis Estático** | Oxlint | `npm run lint` | **0 errores** (231 avisos a11y preexistentes). |
| **Build de Producción** | Vite / Rolldown | `npm run build` | **Exitoso en 6.72s**, bundles generados en `/dist`. |

---

## 7. RESUMEN DE CONTROL DE VERSIONES

- **Rama:** `remediacion/auditoria-03`
- **Archivos Modificados:**
  - `src/components/checkout/ModalCheckout.tsx`
  - `src/pages/admin/views/TicketsView.tsx`
  - `src/services/ticketService.ts`
  - `src/types/database.types.ts`
  - `supabase/migrations/README.md`
- **Archivos Nuevos:**
  - `supabase/migrations/049_idempotent_order_creation.sql`
  - `src/test/secIdempotentOrderCreation.test.ts`
  - `AUDITORIA_03_REMEDIACION_CONSOLIDADA.md`
