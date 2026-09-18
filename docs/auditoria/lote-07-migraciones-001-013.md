# Auditoría — Lote 7: Migraciones SQL 001–013

> Fecha: 2026-09-17 | Estado: ✅ Completo

---

## Contexto general

Las migraciones SQL son el núcleo de seguridad real del sistema. Todo lo que el frontend o un atacante no pueda saltarse depende de que estas funciones PL/pgSQL, triggers y políticas RLS estén correctamente escritas. Se auditan con criterio de **seguridad primero**.

Las migraciones siguen un patrón de reescritura iterativa: la misma función (ej. `release_expired_reservations`, `approve_order_payment`) se redefine en `003`, `004`, `006` y `011`. Cada versión posterior es más robusta. **La versión activa en producción es siempre la última que se ejecutó** — el orden de migración importa críticamentente.

---

## 50. `supabase/migrations/001_initial_schema.sql`

### A. Qué hace
Crea el esquema inicial: tablas `raffles`, `buyers`, `orders`, `tickets`, `partners`; índices de rendimiento; funciones `reserve_tickets`, `release_expired_reservations`, `confirm_order_payment`; políticas RLS; y seed data (aliados + rifa inicial + 1000 boletos).

### B. Hallazgos

**1. Política de boletos con `USING (true)` — lectura pública sin restricción (L254–255):**
```sql
CREATE POLICY "Lectura pública de boletos" ON public.tickets
    FOR SELECT USING (true);
```
Cualquier usuario anónimo puede leer todos los campos de todos los tickets de todas las rifas. Esto incluye `buyer_id`, `order_id`, `reserved_at`, y `reservation_expires_at`. El `buyer_id` es un UUID que enlaza directamente a la tabla `buyers`. Esta política nunca se restringió posteriormente. **Dato sensible expuesto públicamente.**

**2. Política de órdenes con `USING (true)` — lectura pública total en versión inicial (L269–270):**
```sql
CREATE POLICY "Consulta de orden por referencia" ON public.orders
    FOR SELECT USING (true);
```
Toda la tabla `orders` era pública en la versión 001. Migración 013 la reemplaza por acceso solo-admin. ✅ Corregida en 013.

**3. Política de compradores `INSERT WITH CHECK (true)` — sin validación del lado de BD (L262–263):**
```sql
CREATE POLICY "Creación pública de compradores" ON public.buyers
    FOR INSERT WITH CHECK (true);
```
Cualquier usuario anónimo puede insertar en `buyers` con cualquier dato. El único freno es el `UNIQUE (document_id)` que previene duplicados por cédula. No hay validación de formato de email, teléfono ni longitud mínima del nombre en la BD. La validación está sólo en el frontend y en `create_order_secure`. Si alguien llama directamente a `supabase.from('buyers').insert(...)` con datos falsos, pasa sin restricción.

**4. `reserve_tickets` libera reservas expiradas pero no protege órdenes en `pending_verification` (versión inicial):**
```sql
PERFORM public.release_expired_reservations();
```
La versión de `release_expired_reservations` en 001 libera todos los tickets cuya `reservation_expires_at < NOW()` sin verificar el estado de la orden. Esto fue corregido en 003 y 004. ✅ Corregido en versiones posteriores.

**5. Seed data tiene precio hardcodeado `25000.00` y fecha de sorteo `NOW() + 30 days` — datos de prueba en producción:**
```sql
INSERT INTO public.raffles (..., ticket_price, ..., draw_date, ..., status)
VALUES (..., 25000.00, ..., NOW() + INTERVAL '30 days', ..., 'active')
ON CONFLICT (slug) DO NOTHING;
```
La rifa de producción fue insertada con una fecha de sorteo relativa calculada al momento de ejecutar la migración. Si la migración se re-ejecuta (en un nuevo proyecto), la fecha de sorteo quedará 30 días desde ese momento, no la fecha real planificada. El `ON CONFLICT DO NOTHING` protege de duplicación pero no de sobrescritura de la fecha si el conflicto no existe.

**6. `confirm_order_payment` nunca se llama en las versiones modernas del código:**
Esta función existe en 001 para pagos de pasarela (Wompi/Bold). El flujo actual usa `approve_order_payment`. `confirm_order_payment` es código legado que puede eliminarse.

### C. Calidad de código
- `FOR UPDATE` en `reserve_tickets` para bloqueo atómico de filas — correcto. ✅
- `SECURITY DEFINER` en todas las funciones — correcto, permite que funcionen con privilegios elevados sin exponer la service role key. ✅
- Índices en `(raffle_id, status)`, `order_id`, `buyer_id`, `document_id`, `reference` — cubiertos correctamente. ✅
- La extensión `pgcrypto` se instala pero `uuid-ossp` es redundante con `gen_random_uuid()` ya disponible en PostgreSQL 13+. Menor.

---

## 51. `supabase/migrations/002_admin_auth.sql`

### A. Qué hace
Crea `admin_users`, la función `is_admin()`, un trigger para sincronizar `user_id` cuando un admin hace login por primera vez, y las políticas RLS de admin_users.

### B. Hallazgos

**1. `is_admin()` hace una subquery a `auth.users` dentro de una función `STABLE` que se llama en cada evaluación de política RLS:**
```sql
WHERE (user_id = p_user_id OR email = (SELECT email FROM auth.users WHERE id = p_user_id))
```
Esta subquery se ejecuta en cada fila evaluada por RLS. Si una tabla tiene 1000 filas y la política usa `is_admin()`, PostgreSQL ejecuta la subquery hasta 1000 veces por query. La migración 017 resuelve la recursión, pero el problema de rendimiento de la subquery anidada sigue latente. En tablas pequeñas no es crítico, pero es un patrón a monitorear.

**2. La política "Superadmins pueden gestionar administradores" permite que cualquier admin (no solo superadmins) gestione la tabla `admin_users`:**
```sql
CREATE POLICY "Superadmins pueden gestionar administradores" ON public.admin_users
    FOR ALL TO authenticated
    USING (public.is_admin(auth.uid()));
```
El nombre dice "superadmins" pero la condición es `is_admin()` (no `role = 'superadmin'`). Cualquier admin activo, incluyendo los de rol `'auditor'`, puede eliminar o desactivar otros admins. La restricción por rol no está implementada en la RLS. Esto es un **error de naming + lógica**: un `'auditor'` podría convertirse en `'superadmin'` modificando su propio registro.

**3. El trigger `sync_admin_user_id` se activa en `INSERT OR UPDATE OF email ON auth.users`:**
```sql
CREATE TRIGGER on_auth_user_created_sync_admin
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_admin_user_id();
```
Cualquier usuario de Supabase Auth que cambie su email a uno que coincida con un `admin_users.email` quedaría automáticamente vinculado como administrador. Si una cuenta de usuario normal cambia su email a `admin@manaurevive.com` (que ya existe en `admin_users`), el trigger la vinculará como admin. Este vector de ataque depende de que los emails sean controlados por Supabase Auth, donde el email es verificado — el riesgo real es bajo. Pero la lógica debería ser la inversa: que el admin sea el que verifique, no un trigger automático.

**4. La función `is_admin` acepta un parámetro `p_user_id` con default `auth.uid()` — cualquier admin puede verificar si otro UUID es admin:**
```sql
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
```
`is_admin('uuid-cualquiera')` puede ser llamada por cualquier usuario anón para determinar si un UUID específico tiene privilegios de admin. No hay restricción de quién puede llamar esta función. Esto es un **information disclosure** menor — revela si un UUID es o no admin.

### C. Calidad de código
- La separación de `admin_users` de `auth.users` (vinculados por email/user_id) es una arquitectura correcta — los admins son una lista curada, no cualquier usuario que se registre. ✅
- `UNIQUE (user_id)` y `UNIQUE (email)` en `admin_users` — correctos para evitar duplicación. ✅

---

## 52. `supabase/migrations/003_manual_payment_flow.sql`

### A. Qué hace
Introduce el flujo de pago manual: tabla `payment_accounts`, columnas `rejection_reason`/`verified_at`/`verified_by` en órdenes, nuevos estados de orden, `audit_logs`, y las funciones `submit_order_receipt`, `approve_order_payment`, `reject_order_payment`. Redefine `release_expired_reservations` para proteger órdenes en `pending_verification`.

### B. Hallazgos

**1. La política de UPDATE sobre órdenes para subir comprobante es demasiado amplia (L48–50):**
```sql
CREATE POLICY "Compradores pueden adjuntar comprobante a su orden" ON public.orders
    FOR UPDATE USING (status IN ('pending', 'pending_verification'));
```
Cualquier usuario anónimo puede hacer UPDATE a **cualquier orden** que esté en `pending` o `pending_verification`. No hay verificación de que el usuario que hace el UPDATE sea el comprador de esa orden. Un atacante podría sobrescribir el `receipt_url` de la orden de otro comprador con un comprobante falso. Esta política fue eventualmente reemplazada por el uso de RPC `submit_payment_proof` con `SECURITY DEFINER`, pero la política permisiva sigue activa en la BD si no fue eliminada por una migración posterior.

**2. `submit_order_receipt` actualiza también los tickets sin verificar que sean del mismo raffle (L116–118):**
```sql
UPDATE public.tickets
SET order_id = p_order_id, updated_at = NOW()
WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');
```
El segundo caso (`buyer_id = v_order.buyer_id AND status = 'reserved'`) podría asignar tickets de una rifa diferente a esta orden si el mismo comprador tiene reservas activas en más de una rifa simultáneamente. Debería filtrarse por `raffle_id = v_order.raffle_id`.

**3. `approve_order_payment` en 003 no tiene audit log (vs. sí en 004):**
La versión de 003 de `approve_order_payment` sí inserta en `audit_logs` (L183–194). Sin embargo, el trigger `trg_validate_order_status` creado en 004 también insertará en `audit_logs`. Cuando ambas migraciones están aplicadas, la aprobación genera **dos entradas de auditoría** para el mismo evento: una desde la función y otra desde el trigger. Redundancia de logs.

**4. Datos de cuentas de pago reales en seed data (L338–343):**
```sql
INSERT INTO public.payment_accounts (bank_name, ..., account_number, account_holder, ...)
VALUES
    ('Nequi', ..., '314 832 9494', 'Manaure Vive Ecoturismo', '901.845.123-1', ...),
    ...
```
Números de teléfono/cuenta bancaria reales (`314 832 9494`) y NIT real (`901.845.123-1`) están en el código fuente del repositorio. Si el repositorio fuera público o se filtrara, estos datos quedarían expuestos. Debería estar en seed data separado no versionado, o ser datos de ejemplo ficticios.

**5. `release_expired_reservations` en esta versión todavía puede dejar órdenes `pending` huérfanas:**
La nueva versión protege correctamente las órdenes en `pending_verification`, pero el `UPDATE orders SET status = 'expired'` (L321–328) sólo marca órdenes `pending` que no tienen tickets `reserved`. Si una orden tiene tickets bloqueados (no reservados) podría quedar indefinidamente en estado `pending`. ✅ Corregido en 004 con lógica más robusta.

### C. Calidad de código
- `FOR UPDATE` en `approve_order_payment` y `reject_order_payment` — correcto para concurrencia. ✅
- La tabla `payment_accounts` con `display_order` para ordenamiento en frontend — bien pensado. ✅

---

## 53. `supabase/migrations/004_normalize_order_ticket_state_machine.sql`

### A. Qué hace
La migración más importante de seguridad en la máquina de estados. Implementa dos triggers críticos: `trg_validate_order_status` y `trg_validate_ticket_status`. Redefine todas las funciones de estado con lógica más robusta.

### B. Hallazgos

**1. El trigger de tickets `fn_validate_ticket_status_transition` tiene una carrera potencial en la verificación del estado de la orden (L135–141):**
```sql
SELECT status INTO v_order_status
FROM public.orders
WHERE id = NEW.order_id;
```
Esta query dentro del trigger no usa `FOR UPDATE`. Si dos transacciones concurrentes intentan marcar el mismo ticket como `sold` simultáneamente (improbable pero posible en cargas altas), ambas podrían pasar la verificación de estado antes de que alguna confirme. El `FOR UPDATE` en el bloqueo del ticket en la función llamante (`approve_order_payment`) mitigaría esto en la mayoría de los casos, pero el trigger en sí no es hermético.

**2. Trigger registra en `audit_logs` pero las funciones también insertan en `audit_logs` — doble log en aprobación/rechazo:**
Como se mencionó en 003, `approve_order_payment` (004 versión) y el trigger `trg_validate_order_status` ambos insertan en `audit_logs` cuando la orden cambia estado. El resultado: cada aprobación genera 2 filas en `audit_logs` (una con `action = 'ORDER_APPROVED'` desde la función, y otra con `action = 'ORDER_STATUS_PAID'` desde el trigger). No es un bug de integridad pero infla la tabla de auditoría y puede confundir reporting.

**3. `fn_validate_order_status_transition` no protege transición `cancelled → rejected`:**
Las reglas definidas:
- `pending → paid/completed` sin comprobante: ❌ bloqueado ✅
- `paid/completed → pending/pending_verification/expired/rejected`: ❌ bloqueado ✅
- `expired/rejected/cancelled → paid/completed`: ❌ bloqueado ✅

Pero `rejected → cancelled` o `cancelled → rejected` son transiciones permitidas implícitamente. Si un admin rechaza una orden y luego la cancela, o viceversa, no hay restricción. No es un escenario probable de abuso pero sí una inconsistencia en el modelo de estados.

**4. En `cancel_order`, la auditoría no registra quién canceló (no pasa `p_admin_id` a audit_logs):**
```sql
-- La función cancel_order no llama a audit_logs
```
`approve_order_payment` y `reject_order_payment` registran `performed_by`. `cancel_order` no lo hace explícitamente — el trigger registrará el cambio de estado pero `performed_by` será `NULL` (ya que `verified_by` no se actualiza en la cancelación). Las cancelaciones quedan sin trazabilidad del actor que las realizó.

**5. `release_expired_reservations` (versión 004) cuenta mal las filas liberadas:**
```sql
GET DIAGNOSTICS v_released_count = ROW_COUNT;
RETURN v_released_count;
```
`GET DIAGNOSTICS ROW_COUNT` después del primer UPDATE (de tickets) captura correctamente el conteo de tickets liberados. Pero luego hay un segundo UPDATE (órdenes a `expired`) cuyo `ROW_COUNT` no se captura. La función retorna el número de tickets liberados, no el de órdenes expiradas. Confusión menor en el log de la Edge Function que dice `"tickets_released": N`.

### C. Calidad de código
- El patrón `IF OLD.status = NEW.status THEN RETURN NEW; END IF;` en ambos triggers — excelente optimización que evita lógica innecesaria en updates que no cambian el estado. ✅
- `RAISE EXCEPTION` en transiciones inválidas en vez de retornar silenciosamente — correcto, hace que la transacción entera falle y ningún cambio parcial quede en BD. ✅
- Trigger `BEFORE UPDATE OF status` (no `BEFORE UPDATE`) — sólo se dispara cuando `status` cambia, no en cualquier UPDATE. Excelente optimización. ✅
- El auto-limpiado de campos en tickets al pasar a `available` dentro del trigger (L146–151) — elegante y seguro. ✅

---

## 54. `supabase/migrations/005_payment_accounts_management.sql`

### A. Qué hace
Refuerza la tabla `payment_accounts`, agrega trigger de `updated_at`, y agrega trigger de auditoría `fn_audit_payment_accounts` que registra creación/actualización/eliminación de cuentas.

### B. Hallazgos

**1. La política `FOR ALL` de admins coexiste con la política `FOR SELECT` de lectura pública — pueden generar conflicto:**
```sql
-- Política A (pública):
FOR SELECT USING (is_active = true OR public.is_admin())
-- Política B (admin):
FOR ALL TO authenticated USING (public.is_admin())
```
En Supabase/PostgreSQL, para operaciones `SELECT`, ambas políticas aplican con `OR`. Esto significa un admin puede ver cuentas inactivas (correcto) y un usuario público sólo ve activas (correcto). Sin embargo, la política `FOR ALL` a un admin también incluye SELECT, por lo que hay dos políticas SELECT para admins: la pública (que también les permite ver inactivas) y la `FOR ALL`. Redundancia, pero no genera conflicto funcional.

**2. `fn_audit_payment_accounts` registra el `account_number` en texto plano en `audit_logs` (L87):**
```sql
'account_number', NEW.account_number,
```
Los números de cuenta bancaria quedan en `audit_logs.details` JSONB en texto plano. La tabla `audit_logs` solo tiene RLS de `SELECT` para admins, lo que es correcto. Pero si `audit_logs` se usa en reporting externo o se exporta, los números de cuenta quedan expuestos. Debería enmascararse el número de cuenta (ej. `****9494`) en el log.

### C. Calidad de código
- Trigger de auditoría con `TG_OP` para distinguir INSERT/UPDATE/DELETE — correcta implementación del patrón. ✅
- `auth.uid()` como `performed_by` en el trigger de auditoría — correcto, registra qué admin hizo el cambio. ✅
- `BEFORE UPDATE` para `updated_at` automático — patrón estándar y correcto. ✅

---

## 55. `supabase/migrations/006_payment_proofs_storage_flow.sql`

### A. Qué hace
Crea el bucket privado `payment-proofs`, políticas de Storage, tabla `payment_proofs`, y redefine `submit_payment_proof`, `approve_order_payment`, `reject_order_payment` para incluir sincronización con `payment_proofs`.

### B. Hallazgos

**1. Política de Storage para subida a `payment-proofs` sin autenticación ni restricción de path (L22–26):**
```sql
CREATE POLICY "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'payment-proofs');
```
**Cualquier usuario anónimo puede subir cualquier archivo al bucket `payment-proofs`.** No hay restricción de:
- Autenticación (ni siquiera anon key necesita estar autenticado)
- Prefijo de ruta (podría subirse a cualquier path)
- Verificación de que el `orderId` en el path existe y pertenece al usuario

Esto permite spam de archivos ilimitado al bucket privado. La única limitación es el `file_size_limit: 5242880` y los `allowed_mime_types` configurados en el bucket (que sí limitan a 5MB e imágenes/PDF). **Riesgo de abuso de almacenamiento.** Migración 015 endurece esto.

**2. `approve_order_payment` en 006 actualiza tickets con una condición adicional peligrosa (L269–273):**
```sql
UPDATE public.tickets
SET status = 'sold', ...
WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');
```
El `OR buyer_id = v_order.buyer_id AND status = 'reserved'` puede marcar como `sold` tickets de **otras rifas** donde el mismo comprador tenga reservas activas. Si el comprador está comprando simultáneamente en dos rifas, la aprobación de una orden podría "robarle" los tickets de la otra. **Bug de integridad real.** (Mismo patrón que 003.)

**3. `submit_payment_proof` tiene la misma condición peligrosa en el UPDATE de tickets (L184–187):**
```sql
UPDATE public.tickets
SET order_id = p_order_id, ...
WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');
```
Mismo bug: puede reasignar tickets de otras rifas del mismo comprador. La condición correcta sería filtrar también por `raffle_id = v_order.raffle_id`.

### C. Calidad de código
- La tabla `payment_proofs` con `status` propio (`pending/approved/rejected`) desacoplado del status de la orden — buen diseño para auditoría detallada de comprobantes. ✅
- La validación de MIME type y tamaño en `submit_payment_proof` duplica la lógica del bucket — buena defensa en profundidad. ✅
- `ON CONFLICT (id) DO UPDATE` en la inserción del bucket — correcto para idempotencia de migración. ✅

---

## 56. `supabase/migrations/007_transactional_notification_logs.sql`

### A. Qué hace
Crea `notification_logs` con `CHECK` de `event_type` en MAYÚSCULAS, `channel`, y `status`. Agrega políticas RLS de admin y de comprador (por coincidencia de email en `auth.users`).

### B. Hallazgos

**1. El `CHECK` de `event_type` sólo admite mayúsculas pero `notificationService.ts` usa minúsculas — la migración 009 lo corrige pero ambos CHECKs coexisten:**
```sql
-- 007:
CHECK (event_type IN ('PAYMENT_RECEIVED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED'))
-- 009 reemplaza con:
CHECK (event_type IN ('payment_received', 'payment_approved', 'payment_rejected', 'PAYMENT_RECEIVED', ...))
```
La migración 009 extiende el CHECK para admitir ambos formatos. Si 007 se ejecutó antes que 009, el CHECK original bloqueaba inserciones con minúsculas. Este fue un bug de producción real que 009 corrió a corregir.

**2. La política "Compradores pueden ver logs de sus órdenes" requiere que el comprador tenga cuenta en `auth.users`:**
```sql
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.buyers b ON b.id = o.buyer_id
    WHERE o.id = notification_logs.order_id
      AND LOWER(b.email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
  )
)
```
Los compradores en este sistema no tienen cuenta de Supabase Auth (el checkout es anónimo). Esta política es funcionalmente **inutilizable** — ningún comprador tiene `auth.uid()` correspondiente a su email en `buyers`. La política existe como buena intención pero nunca se activa en la práctica.

### C. Calidad de código
- Índices en `order_id`, `idempotency_key`, `resend_email_id`, `status` — cubrimiento correcto para las queries más frecuentes. ✅
- `idempotency_key UNIQUE` a nivel de BD — garantía fuerte contra duplicados aunque el cliente llame múltiples veces. ✅

---

## 57. `supabase/migrations/008_order_contact_preference.sql`

### A. Qué hace
Agrega la columna `contact_preference VARCHAR(20) DEFAULT 'both'` a `orders` con CHECK `('whatsapp', 'email', 'both')`.

### B. Hallazgos
- **Sin bugs.** Migración simple y correcta. ✅
- El índice `idx_orders_contact_preference` tiene utilidad marginal para filtrar por canal de notificación en el admin. No causa problemas.
- El comentario de columna con `COMMENT ON COLUMN` — buena práctica de documentación en BD. ✅

---

## 58. `supabase/migrations/009_notification_traceability.sql`

### A. Qué hace
Normaliza `notification_logs`: extiende el CHECK de `event_type` para aceptar tanto minúsculas como mayúsculas, agrega índices adicionales, y crea políticas con `IF NOT EXISTS` para evitar errores de re-ejecución.

### B. Hallazgos

**1. El CHECK de `event_type` acepta ambos formatos (MAYÚSCULAS y minúsculas) en lugar de normalizar a uno solo:**
```sql
CHECK (event_type IN ('payment_received', 'payment_approved', 'payment_rejected',
                      'PAYMENT_RECEIVED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED'))
```
La solución correcta sería que el código siempre envíe el mismo formato y el CHECK sólo acepte ese. Tener ambos formatos en el CHECK es una cicatriz del bug anterior (006→007→009) que indica que el formato de los eventos no está estabilizado. Hay registros en producción con ambos formatos — las queries que filtran por `event_type` deben usar `ILIKE` o `LOWER()` para ser correctas.

**2. `IF NOT EXISTS` en la creación de políticas — buen patrón de idempotencia:**
```sql
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notification_logs' AND policyname = '...')
THEN CREATE POLICY ...
```
Correcto. Permite re-ejecutar la migración sin error. ✅ Debería aplicarse en todas las migraciones.

### C. Calidad de código
- Índice en `created_at DESC` — correcto para ordenamiento descendente frecuente en el panel de logs. ✅

---

## 59. `supabase/migrations/010_admin_ticket_management.sql`

### A. Qué hace
Implementa `admin_block_ticket` y `admin_unblock_ticket` como funciones PL/pgSQL con verificación de permiso `is_admin()`, bloqueo FOR UPDATE, y auditoría.

### B. Hallazgos

**1. `admin_block_ticket` bloquea y limpia `buyer_id` y `order_id` sin notificar al comprador (L79–87):**
```sql
UPDATE public.tickets SET
    status = 'blocked',
    buyer_id = NULL,
    order_id = NULL, ...
WHERE id = p_ticket_id;
```
Si el ticket tiene una reserva activa de un comprador que está en proceso de pago, bloquear el ticket destruye silenciosamente esa reserva. El comprador no recibe notificación. Su orden queda en estado `pending` con tickets asociados que ya no existen como `reserved`. El flujo de pago del comprador fallará de forma confusa.

**2. La verificación de que el ticket vendido (`status = 'sold'`) no tenga orden pagada es buena, pero tiene un edge case (L51–68):**
```sql
IF v_ticket.status = 'sold' THEN
    IF v_ticket.order_id IS NOT NULL THEN
        SELECT * INTO v_order FROM public.orders WHERE id = v_ticket.order_id;
        IF v_order.status IN ('paid', 'completed') THEN
            RETURN ...; -- bloqueado
        END IF;
    ELSE
        RETURN ...; -- bloqueado (sold sin orden)
    END IF;
END IF;
```
Si `v_ticket.status = 'sold'` y la orden existe pero su status es `'pending_verification'` (caso donde el comprobante fue recibido pero no aprobado, y el ticket quedó en `sold` por algún bug previo), la función permite bloquear ese ticket — lo que rompería la trazabilidad de la orden del comprador.

### C. Calidad de código
- Validación de `p_reason` no vacío antes de proceder — buena práctica. ✅
- `v_admin_uid := auth.uid()` capturado al inicio para consistencia a lo largo de la función. ✅
- Registro de `previous_order_id` y `previous_buyer_id` en audit log — excelente trazabilidad. ✅

---

## 60. `supabase/migrations/011_cron_release_expired_reservations.sql`

### A. Qué hace
Define la versión definitiva y más robusta de `release_expired_reservations` con pg_cron. Registra en `audit_logs` automáticamente. Programa el cron cada 5 minutos.

### B. Hallazgos

**1. El cron de pg_cron y la Edge Function de cron son redundantes — dos mecanismos hacen lo mismo:**
`011` configura `pg_cron` para ejecutar `release_expired_reservations()` cada 5 minutos internamente en PostgreSQL. La Edge Function `cron-release-expired-reservations` en Lote 6 hace exactamente lo mismo. Si ambos están activos, la función se ejecuta hasta 24 veces por hora en lugar de 12 — sin consecuencias graves (es idempotente), pero duplica trabajo innecesariamente y genera entradas dobles en `audit_logs`.

**2. La condición `o.receipt_url IS NULL` en el paso 1 asume que receipt_url es siempre NULL para órdenes sin comprobante:**
```sql
WHERE o.status = 'pending'
  AND t.status = 'reserved'
  AND t.reservation_expires_at < NOW()
  AND o.receipt_url IS NULL;
```
Si por algún bug `receipt_url` queda con un valor pero `status` sigue en `pending` (sin pasar a `pending_verification`), el cron no identificará esa orden como expirada y sus tickets no serán liberados. Tickets bloqueados indefinidamente.

**3. El `EXCEPTION WHEN OTHERS` en el bloque DO (L142–144) silencia errores de registro de pg_cron:**
```sql
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Aviso al registrar cron en pg_cron...';
```
Si pg_cron no está habilitado en el proyecto Supabase, la migración pasa silenciosamente (NOTICE, no ERROR) y el cron nunca se programa. Sin verificación posterior, las reservas nunca expirarán automáticamente. El `RAISE NOTICE` no genera alertas ni logs en producción por defecto.

### C. Calidad de código
- La lógica en dos pasos (primero identificar órdenes expiradas con `ARRAY_AGG`, luego liberar tickets) es más robusta que versiones anteriores. ✅
- Doble candado de seguridad con `AND NOT EXISTS (... pending_verification/paid/completed)` — excelente protección. ✅
- Audit log separado para tickets huérfanos (`AUTO_EXPIRE_ORPHAN_RESERVATIONS_CRON`) — buena observabilidad. ✅
- `PERFORM cron.unschedule(...)` antes de registrar — evita duplicación del cron si la migración se re-ejecuta. ✅

---

## 61. `supabase/migrations/012_create_order_secure.sql`

### A. Qué hace
Implementa `create_order_secure` — la función más crítica del sistema desde el punto de vista de negocio. Calcula `total_amount` en el servidor, bloquea boletos atómicamente, registra/reutiliza compradores, crea la orden y la audita, todo en una sola transacción.

### B. Hallazgos

**1. La referencia de orden se genera con `MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT)` — débil entropía (L128):**
```sql
v_reference := 'MV-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));
```
MD5 de una entrada `random + timestamp` produce 8 caracteres hexadecimales (32 bits de espacio). Con 10.000 órdenes, la probabilidad de colisión es ~1.16%. La columna `reference UNIQUE` en `orders` protege de duplicados (la inserción fallaría), pero no hay manejo del error de colisión — la función fallará con un error de constraint sin mensaje amigable. Se recomienda `gen_random_uuid()` con prefijo, o reintentos con manejo de `UNIQUE VIOLATION`.

**2. `ON CONFLICT (document_id) DO NOTHING` no actualiza datos del comprador (L81–83):**
```sql
INSERT INTO public.buyers (full_name, document_id, phone, email, city, updated_at)
VALUES (...) ON CONFLICT (document_id) DO NOTHING
```
Si un comprador que ya existe cambia su nombre o teléfono, los datos nuevos se descartan. Su próxima compra usará los datos originales. La política correcta para un sistema de rifas sería `DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, email = EXCLUDED.email` para mantener datos actualizados. Migración 016 corrige esto.

**3. El GRANT en L198 da acceso a `anon` para ejecutar `create_order_secure`:**
```sql
GRANT EXECUTE ON FUNCTION public.create_order_secure(...) TO anon, authenticated, service_role;
```
Esto es intencional — el checkout es anónimo. Pero significa que cualquier usuario sin sesión puede llamar esta función. Las validaciones internas (rifa activa, boletos disponibles, datos de comprador completos) son el único freno. No hay rate limiting a nivel de BD. Un bot podría hacer miles de llamadas para reservar y dejar expirar boletos, impidiendo que compradores legítimos los adquieran (ataque de denegación de servicio de boletos).

### C. Calidad de código
- Cálculo de `total_amount` en PostgreSQL desde `raffles.ticket_price` — **el cambio más importante de seguridad del sistema**. El frontend no puede manipular el precio. ✅
- `FOR UPDATE` en la selección de tickets disponibles — bloqueo atómico correcto para prevenir race conditions. ✅
- Aceptación de tickets previamente reservados por el mismo comprador con `reservation_expires_at >= NOW()` — permite que el comprador recargue el checkout sin perder su selección. ✅
- Validación de `v_raffle.status NOT IN ('active')` — correcto, bloquea compras en rifas no activas. ✅

---

## 62. `supabase/migrations/013_restrict_orders_select_and_public_verification_rpc.sql`

### A. Qué hace
Restringe el SELECT de `orders` solo a admins autenticados. Implementa `verify_public_order_or_tickets` — la RPC de verificación pública de boletos con enmascaramiento de datos personales.

### B. Hallazgos

**1. La lógica SQL de enmascaramiento de nombre está triplicada (L46–52, L100–106, L153–159):**
Las tres ramas de `IF/ELSIF/ELSE` comparten exactamente la misma expresión CASE para `maskedBuyerName` y `maskedDocumentId`. Si el formato de enmascaramiento necesita cambiar, hay que actualizarlo en 3 lugares. Debería ser una función auxiliar `mask_buyer_name(text)`.

**2. El tercer branch `ELSE` (fallback, L141–193) es funcionalmente idéntico al primero (búsqueda por referencia, L34–86):**
Ambos hacen `WHERE o.reference ILIKE '%' || v_clean_term || '%'`. El ELSE nunca se alcanza con entradas que no sean ni alfanuméricas ni puramente numéricas, pero si se alcanza, devuelve el mismo resultado que el primer branch. Código muerto/duplicado.

**3. `verify_public_order_or_tickets` acepta búsqueda por documento de identidad sin rate limiting:**
```sql
WHERE b.document_id = v_clean_term LIMIT 10;
```
Un atacante puede iterar documentos de identidad numéricos para descubrir qué cédulas tienen órdenes registradas. La respuesta es enmascarada, pero confirma existencia de compradores. Este es un *enumeration attack* menor — la función retorna `"success": true` tanto si hay resultados como si no, por lo que el atacante sólo sabe si ese documento tiene órdenes, no los datos completos.

**4. La restricción de `orders SELECT` sólo para admins rompe la compatibilidad con `submitOrderReceipt` del frontend:**
```sql
CREATE POLICY "Solo administradores pueden consultar órdenes directamente"
    FOR SELECT TO authenticated USING (public.is_admin());
```
Si el frontend intenta leer el estado de una orden via `supabase.from('orders').select(...).eq('id', orderId)`, esto fallará para compradores anónimos. La consulta pública debe hacerse via `verify_public_order_or_tickets`. A verificar en las vistas de checkout que no hagan select directo a `orders`.

### C. Calidad de código
- `SECURITY DEFINER` en `verify_public_order_or_tickets` — correcto, ejecuta con permisos de superusuario para poder hacer JOIN con `buyers` que tiene RLS. ✅
- `GRANT EXECUTE TO anon` — correcto para la consulta pública. ✅
- `LIMIT 5` en búsquedas por referencia y `LIMIT 10` en búsqueda por documento — limita el impacto de scraping. ✅
- El `DROP POLICY IF EXISTS` antes de crear las nuevas — correcto para migración idempotente. ✅

---

## Resumen del Lote 7

| Migración | Severidad máx. | Hallazgo principal |
|-----------|----------------|-------------------|
| 001 | 🟠 Media | Tickets completamente públicos (`buyer_id`, `order_id`, etc.); datos reales en seed data |
| 002 | 🟠 Media | `is_admin()` es callable por anon (info disclosure); política de admin mal nombrada — cualquier rol puede gestionar admins |
| 003 | 🔴 Alta | Política de UPDATE de órdenes demasiado amplia (cualquier anon puede sobrescribir receipt_url de otra orden); datos bancarios reales en código fuente |
| 004 | 🟡 Baja | Double audit log en aprobación; `cancel_order` no registra actor; carrera teórica en trigger de tickets |
| 005 | 🟡 Baja | Número de cuenta bancaria en texto plano en audit_logs |
| 006 | 🔴 Alta | Storage sin auth ni restricción de path (spam ilimitado); condición OR en UPDATE de tickets puede afectar rifas cruzadas |
| 007 | 🟡 Baja | Política de compradores en notification_logs inoperante (compradores sin cuenta Auth) |
| 008 | ✅ OK | Sin hallazgos |
| 009 | 🟡 Baja | event_type acepta dos formatos — datos inconsistentes en producción |
| 010 | 🟠 Media | Bloqueo de ticket con reserva activa no notifica al comprador; edge case de ticket `sold` con orden no pagada |
| 011 | 🟠 Media | Doble mecanismo de cron (pg_cron + Edge Function); error de pg_cron silenciado con NOTICE |
| 012 | 🟠 Media | Referencia de orden con colisión ~1% sin manejo de error; `DO NOTHING` descarta actualización de datos del comprador; acceso anon sin rate limit (DoS de boletos posible) |
| 013 | 🟡 Baja | Lógica de enmascaramiento triplicada; tercer branch ELSE idéntico al primero (código muerto) |

### Top hallazgos del Lote 7 (BD)

1. **🔴 ALTO — 003: cualquier usuario anón puede sobrescribir el `receipt_url` de CUALQUIER orden** vía UPDATE directo sin verificar que sea su propia orden. (Verificar si la política fue reemplazada en migración posterior sin DROP.)

2. **🔴 ALTO — 006: Storage abierto a uploads anónimos sin restricción de path** — spam de archivos al bucket `payment-proofs`. (Verificar si 015 lo corrige efectivamente.)

3. **🔴 ALTO — 006 y 003: condición `OR buyer_id = v_order.buyer_id AND status = 'reserved'`** en `approve_order_payment` y `submit_payment_proof` puede vender/reasignar tickets de OTRAS rifas del mismo comprador.

4. **🟠 MEDIO — 001: todos los campos de todos los tickets son públicos** (incluye `buyer_id`, `order_id`, timestamps de reserva) — información suficiente para análisis de patrones de compra.

5. **🟠 MEDIO — 002: cualquier admin (incluido `auditor`) puede gestionar la tabla `admin_users`** — podría escalar privilegios modificando su propio rol.

6. **🟠 MEDIO — 012: colisión de referencia de orden ~1% sin manejo** — puede generar errores en producción cuando hay ~5000+ órdenes.

7. **🟠 MEDIO — 011: doble cron (pg_cron + Edge Function)** — doble trabajo y doble log de auditoría cada 5 minutos.

