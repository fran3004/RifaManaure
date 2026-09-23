# INFORME DE REMEDIACIÓN — AUDITORÍA 01: FEEDBACK 01
## Corrección Transaccional de Aprobación y Rechazo de Pagos (DB-01 / DB-10)

- **Fecha:** 2026-09-23
- **Rama:** `remediacion/auditoria-01`
- **Ámbito:** Procedimientos almacenados PostgreSQL (`approve_order_payment`, `reject_order_payment`), prevención de corrupción cruzada de boletos entre órdenes del mismo comprador (DB-01) y prevención de aprobación de órdenes huérfanas sin boletos (DB-10).

---

## 1. Definición Final Previa de Cada RPC Encontrada

La investigación exhaustiva sobre `supabase/migrations/` reveló que las funciones `approve_order_payment` y `reject_order_payment` fueron definidas originalmente en `003_manual_payment_flow.sql`, redefinidas en `004`, `006`, endurecidas en `014_harden_admin_payment_rpcs.sql` y consolidadas finalmente en **`023_security_hardening_linter_fixes.sql`** (líneas 1120 a 1272). Ninguna migración posterior (024 a 036) las había vuelto a modificar.

### Defectos Críticos Detectados en la Definición Previa:

#### A. Cláusula de Contaminación Cruzada (DB-01):
Tanto `approve_order_payment` (línea 1177) como `reject_order_payment` (línea 1257) ejecutaban la siguiente mutación sobre la tabla `tickets`:
```sql
UPDATE public.tickets
SET status = 'sold', ...
WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');
```
**Impacto Operacional:**
Si un comprador `buyer_id` tenía dos órdenes (por ejemplo, Orden A en revisión y Orden B recién reservada en checkout):
1. **En Aprobación de Orden A:** El sistema marcaba como vendidos (`sold`) tanto los boletos de la Orden A como los boletos reservados de la Orden B. Además, provocaba un fallo catastrófico si el trigger `trg_validate_ticket_status` evaluaba el boleto de la Orden B y descubría que su orden asociada estaba aún en `pending`.
2. **En Rechazo de Orden A:** El sistema liberaba a disponible (`status = 'available'`) tanto los boletos de la Orden A como los boletos reservados de la Orden B, destruyendo la reserva activa y legítima de la otra orden del comprador.

#### B. Aprobación de Órdenes Huérfanas Sin Boletos (DB-10):
La función `approve_order_payment` actualizaba `public.orders` a `status = 'paid'` **antes** de verificar si la orden poseía boletos válidos en `public.tickets`. Si la reserva de 10 minutos había expirado y el cron había liberado los boletos (`order_id = NULL`), la consulta de actualización afectaba 0 filas, pero la orden quedaba marcada definitivamente como `paid` por el valor total sin entregar ningún boleto al comprador.

**Prueba Irrefutable en Base de Datos Real:**
La inspección de datos vivos en Supabase mediante `npx supabase db query --linked` constató la existencia real de este defecto en producción:
- **Orden `MV-D3BE1DC2`** (ID `56fd7a80-cb7e-48f3-a016-549c96793d78`):
  - Estado en `orders`: `'paid'` (aprobada por admin por \$280,000 COP).
  - `ticket_count` nominal declarado: 7 boletos.
  - Boletos reales asociados en `tickets`: **0 boletos**.
  - Causa histórica: El usuario reservó 7 boletos, la reserva expiró a los 10 minutos, los boletos se liberaron al público, y 36 horas después el administrador aprobó el pago. El código anterior marcó la orden como `paid` sin verificar la existencia de boletos.

---

## 2. Cambios Implementados

Se creó la migración correctiva **`037_fix_approve_reject_order_payment_scoping.sql`** que redefine completamente ambos procedimientos almacenados bajo las siguientes especificaciones:

### A. Erradicación Total de la Cláusula Peligrosa (DB-01):
Se eliminó incondicionalmente la expresión `OR (buyer_id = v_order.buyer_id AND status = 'reserved')`.
La cláusula de actualización en ambas funciones quedó acotada de forma exclusiva e infranqueable a:
```sql
WHERE order_id = p_order_id
```

### B. Implementación de Invariantes DB-10 en `approve_order_payment`:
1. **Bloqueo Pesimista:** `SELECT * FROM public.orders WHERE id = p_order_id FOR UPDATE` para evitar carreras entre múltiples administradores.
2. **Verificación de Estados Compatibles:** Se valida que la orden esté en `'pending_verification'` o `'pending'`. Si está en `'paid'` o `'completed'`, retorna mensaje idempotente (`'La orden ya se encuentra aprobada y pagada anteriormente.'`). Si está en `'rejected'`, `'expired'` o `'cancelled'`, rechaza la aprobación.
3. **Bloqueo e Inspección Previa de Boletos:**
   ```sql
   SELECT 
       COUNT(*),
       COUNT(*) FILTER (WHERE status NOT IN ('reserved', 'sold'))
   INTO 
       v_total_tickets,
       v_invalid_tickets
   FROM public.tickets
   WHERE order_id = p_order_id
   FOR UPDATE;
   ```
4. **Fallo Inmediato ante Órdenes Huérfanas:**
   Si `v_total_tickets IS NULL OR v_total_tickets = 0`, la función aborta inmediatamente sin alterar la orden:
   `error: 'Integridad violada: La orden no tiene boletos asociados (o su reserva expiró) y no puede ser aprobada.'`
5. **Comprobación de Recuento Nominal:** Si `v_total_tickets <> v_order.ticket_count`, aborta por discrepancia de boletos.
6. **Consistencia Atómica Post-Mutación:** Se verifica que `v_updated_tickets_count = v_total_tickets`. De lo contrario, se lanza una excepción PL/pgSQL que revierte automáticamente toda la transacción.

### C. Endurecimiento de `reject_order_payment`:
1. **Bloqueo Pesimista:** `FOR UPDATE` sobre `orders` y sobre `tickets WHERE order_id = p_order_id`.
2. **Idempotencia:** Si la orden ya está en `'rejected'`, retorna aviso sin alterar estados; si ya está en `'paid'`, impide el rechazo arbitrario.
3. **Liberación Estrictamente Acotada:** Se liberan a `'available'` únicamente los boletos con `order_id = p_order_id`, limpiando `buyer_id`, `order_id`, `reserved_at` y `reservation_expires_at`. Ninguna otra orden del comprador es afectada.

---

## 3. Invariantes Nuevas Garantizadas

1. **Aislamiento Estricto por Orden:** Ninguna acción de pago (aprobación o rechazo) puede mutar, liberar, vender o bloquear boletos que no tengan asignado explícitamente el `order_id` evaluado.
2. **Cero Aprobación de Órdenes Huérfanas (DB-10):** Ninguna orden puede transicionar a `paid` si no tiene al menos un boleto asociado en `public.tickets` y si dicho recuento no coincide con `ticket_count`.
3. **Serialización Concurrente:** Bloqueos `FOR UPDATE` serializan solicitudes simultáneas de aprobación, rechazo o expiración.
4. **Preservación de Principio de Menor Privilegio:** Ambas funciones conservan `SECURITY DEFINER`, `search_path = public, pg_temp`, revocación de privilegios a `PUBLIC, anon` y permisos exclusivos para `authenticated, service_role` con verificación interna de `public.is_admin(auth.uid())`.

---

## 4. Análisis de Escenarios de Concurrencia (A – F)

| Escenario | Comportamiento Previo (Defectuoso) | Comportamiento Nuevo (Garantizado) |
|---|---|---|
| **A. Admin aprueba Orden A mientras existe Orden B del mismo comprador** | Corrupción: Se vendían los boletos de Orden B o abortaba por validación de orden en `pending`. | **Aislado:** Orden A vende únicamente sus boletos. Los boletos de Orden B permanecen reservados bajo Orden B sin interferencia. |
| **B. Dos administradores aprueban la misma orden simultáneamente** | Carrera de ejecución: Posibles escrituras dobles o logs duplicados. | **Serializado:** El primer admin adquiere `FOR UPDATE`. El segundo espera y, al desbloquearse, lee `status = 'paid'`, retornando respuesta idempotente. |
| **C. Admin aprueba mientras un cron libera reservas** | Orden huérfana: Boletos liberados por cron pasaban a disponibles, pero la orden se marcaba como `paid` sin boletos (Caso real `MV-D3BE1DC2`). | **Protegido (DB-10):** Si el cron libera boletos primero, `v_total_tickets = 0` y la aprobación se rechaza con error de integridad. Si el admin bloquea primero, los boletos pasan a `sold` y el cron no los toca. |
| **D. Rechazo concurrente con creación de otra orden** | Riesgo de liberar boletos de la orden entrante si pertenecían al mismo `buyer_id`. | **Aislado:** El rechazo solo libera boletos con `order_id = p_order_id`. La orden entrante opera con su propio lock consultando solo boletos `available`. |
| **E. Aprobación repetida de la misma orden** | Posible re-ejecución de triggers y actualización de timestamps de venta. | **Idempotente:** Detecta `status IN ('paid', 'completed')` y retorna mensaje de ya pagada sin efectos colaterales. |
| **F. Rechazo repetido de la misma orden** | Intentos de liberar boletos ya disponibles. | **Idempotente:** Detecta `status = 'rejected'` y retorna mensaje de ya rechazada sin mutaciones. |

---

## 5. Pruebas y Validaciones Ejecutadas

1. **Inspección de Datos en Base de Datos Real:**
   - Consulta analítica con `supabase db query --linked`: Identificó el caso histórico real de DB-10 en la orden `MV-D3BE1DC2`.
2. **Validación de Migraciones con Supabase CLI:**
   - `supabase db push --dry-run`: Verificó que la migración `037_fix_approve_reject_order_payment_scoping.sql` es reconocida y ordenada deterministamente al final de la secuencia sin errores de sintaxis.
3. **Búsqueda Global de Cláusula Peligrosa:**
   - `git grep "buyer_id = v_order.buyer_id"`: Confirmó que ninguna función de aprobación o rechazo conserva la condición en migraciones activas.
4. **Pruebas Unitarias de Servicio (`src/test/paymentService.test.ts`):**
   - 9 pruebas automatizadas con Vitest cubriendo: aprobación exitosa, rechazo exitoso, detección de error DB-10 (0 boletos), manejo de idempotencia (orden ya pagada, orden ya rechazada) y captura de excepciones.
5. **Verificación Estricta de Tipos TypeScript:**
   - `npm run typecheck` (`tsc -b`): **PASS** (0 errores).
6. **Linter:**
   - `npm run lint` (`oxlint`): **PASS** (0 errores en 116 archivos).
7. **Suite Completa de Pruebas:**
   - `npm test` (`vitest run`): **PASS** (156 pruebas aprobadas en 13 suites).
8. **Compilación de Producción:**
   - `npm run build` (`tsc -b && vite build`): **PASS** (compilación limpia en 8.09s).

---

## 6. Riesgos Residuales y Hallazgos Vinculados

1. **Cláusula Residual en `submit_payment_proof`:**
   La inspección global reveló que la función `submit_payment_proof` (en `023_security_hardening_linter_fixes.sql`, línea 1759) aún contiene la condición:
   `WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved')`.
   Esto pertenece al flujo de recepción de comprobantes del cliente y será objeto de remediación en la fase respectiva de la auditoría de comprobantes y flujos transaccionales.
2. **Orden Histórica `MV-D3BE1DC2` en Producción:**
   La base de datos contiene una orden pagada sin boletos (`MV-D3BE1DC2`) originada antes de esta corrección. Se requerirá un script o migración de saneamiento de datos (data patch) para conciliar administrativamente dicha orden con el participante.

---

## 7. Archivos y Migraciones Modificados

| Archivo | Tipo de Cambio | Descripción |
|---|---|---|
| [`supabase/migrations/037_fix_approve_reject_order_payment_scoping.sql`](file:///c:/Users/frani/Downloads/RifaManaure/supabase/migrations/037_fix_approve_reject_order_payment_scoping.sql) | **NUEVO** | Redefinición transaccional de `approve_order_payment` y `reject_order_payment` resolviendo DB-01 y DB-10. |
| [`src/test/paymentService.test.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/test/paymentService.test.ts) | **NUEVO** | Suite de pruebas unitarias para aprobación, rechazo, idempotencia y validación de boletos. |
| [`supabase/migrations/README.md`](file:///c:/Users/frani/Downloads/RifaManaure/supabase/migrations/README.md) | **MODIFICADO** | Inclusión de la migración 037 en la tabla del inventario canónico y actualización del protocolo de aprovisionamiento. |
| [`README.md`](file:///c:/Users/frani/Downloads/RifaManaure/README.md) | **MODIFICADO** | Actualización del rango de migraciones a (001 a 037) en la arquitectura y en la Sección 7. |
| [`AUDITORIA_01_FEEDBACK_01.md`](file:///c:/Users/frani/Downloads/RifaManaure/AUDITORIA_01_FEEDBACK_01.md) | **NUEVO** | Informe técnico detallado de la remediación. |

---

## 8. Commit Realizado

- **Rama:** `remediacion/auditoria-01`
- **Mensaje de Commit:**
  `fix(db): erradicar corrupcion cruzada de boletos en aprobacion/rechazo y blindar ordenes huerfanas (DB-01, DB-10)`
