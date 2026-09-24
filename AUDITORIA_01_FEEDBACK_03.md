# INFORME DE REMEDIACIÓN TRANSACCIONAL Y RLS — AUDITORÍA 01 (FEEDBACK 03)

**Proyecto:** RifaManaure (Manaure Vive)  
**Fecha:** 2026-09-23  
**Rama:** `remediacion/auditoria-01`  
**Hallazgos Corregidos:** `DB-03`, `DB-14`  
**Migración Canónica Generada:** `supabase/migrations/039_harden_rls_orders_and_notification_logs.sql`  

---

## 1. Resumen Ejecutivo de la Intervención

En esta tercera fase de remediación de base de datos se ha erradicado la exposición de datos y la mutabilidad no autorizada derivada de políticas RLS defectuosas en `notification_logs` y `orders`:

1. **DB-03 (Saneamiento de `notification_logs`):**
   - Se eliminó la política defectuosa `"Compradores pueden ver logs de sus órdenes"` que ejecutaba una subconsulta directa sobre `auth.users`.
   - Se identificó el modelo de identidad real del proyecto: los compradores **no** son usuarios registrados en `auth.users`, sino usuarios públicos anónimos cuyos datos residen en `buyers`.
   - Al no existir ninguna pantalla o requerimiento de comprador para leer `notification_logs` (tabla exclusivamente operativa de auditoría de despachos WhatsApp), se revocó el acceso a `anon` y se restringió la consulta y gestión a administradores activos mediante `public.is_admin()`.
   - **Resultado:** Se elimina el error PostgreSQL `42501 (permission denied for table users)`, se previene el acceso horizontal a logs ajenos y no se concede ningún privilegio peligroso sobre `auth.users`.

2. **DB-14 (Erradicación del UPDATE Público Genérico en `orders`):**
   - Se eliminó la política insegura `"Compradores pueden adjuntar comprobante a su orden" FOR UPDATE TO public USING (status IN ('pending', 'pending_verification'))`, la cual permitía a cualquier usuario modificar campos arbitrarios (`total_amount`, `ticket_count`, `buyer_id`, etc.) en órdenes ajenas.
   - Se inspeccionaron todos los flujos del frontend, constatando que la subida de comprobantes se encuentra formalmente canalizada a través de la RPC `submit_payment_proof` (SECURITY DEFINER).
   - Se revocaron privilegios directos de `UPDATE`, `INSERT` y `DELETE` para el rol `anon`.
   - Se restringió el `UPDATE` directo exclusivamente a administradores (`is_admin()`).
   - Se acotó `submit_payment_proof` para eliminar cualquier actualización cruzada de boletos entre órdenes del mismo comprador.
   - Se eliminó el fallback obsoleto de actualización directa en `cancelOrder` de `paymentService.ts`.

---

## 2. Diagnóstico del Modelo de Identidad y Acceso

### 2.1 Modelo de Identidad en RifaManaure
- **Compradores Públicos:** Son visitantes que adquieren boletos en la página de inicio. Sus registros se crean en `public.buyers` (asociados a cédula, teléfono y correo). **No poseen cuenta ni UID en `auth.users`**.
- **Administradores:** Son los únicos usuarios que inician sesión a través de Supabase Auth (`auth.users`), vinculados con `public.admin_users` y validados mediante la función SECURITY DEFINER `public.is_admin()`.
- **Falla de DB-03:** Intentar correlacionar `auth.uid()` con `buyers.email` consultando `auth.users` asumía un modelo inexistente y disparaba `42501` porque los roles estándar no tienen `SELECT` sobre `auth.users`.

### 2.2 Inventario de Campos Modificados por el Frontend
El análisis del código fuente (`src/services/paymentService.ts`, `src/services/buyerService.ts`) demostró:
- `receipt_url`: Se actualiza **únicamente** mediante `submit_payment_proof`.
- `payment_method` y `contact_preference`: Se establecen al crear la orden mediante `create_order_secure`.
- `status`: Transiciona exclusivamente mediante RPCs (`submit_payment_proof`, `approve_order_payment`, `reject_order_payment`, `cancel_order`, `release_expired_reservations`).
- `total_amount` y `ticket_count`: Son **inmutables** y calculados en el backend por `create_order_secure`.
- **Conclusión:** Ningún campo de `orders` requiere `UPDATE` directo público.

---

## 3. Matriz de Validación por Roles y Escenarios

A continuación se detalla el comportamiento del sistema ante intentos de acceso y mutación bajo las nuevas políticas:

| Escenario | Rol Evaluado | Resultado | Mecanismo Responsable | Justificación Técnica |
| :--- | :--- | :---: | :--- | :--- |
| **Leer notification_logs propios** | Comprador (`anon` o `authenticated` no admin) | **BLOQUEADO** (0 filas / 42501) | `REVOKE ALL` a anon / RLS `is_admin()` | Los compradores no son usuarios de Supabase Auth ni consultan logs operacionales. |
| **Leer logs ajenos** | Usuario autenticado atacante (no admin) | **BLOQUEADO** (0 filas) | RLS `is_admin() = false` | El filtro RLS evalúa a falso; PostgreSQL no retorna registros sin generar error 42501. |
| **Leer logs como admin** | `authenticated` con `is_admin() = true` | **PERMITIDO** | RLS `"Admins pueden consultar logs"` | Administrador legítimo verificado contra `public.admin_users`. |
| **Leer logs como superadmin** | `authenticated` con rol `superadmin` | **PERMITIDO** | RLS `"Admins pueden consultar logs"` | Superadministrador verificado contra `public.admin_users`. |
| **UPDATE directo orden propia** | Comprador (`anon` o `authenticated` no admin) | **BLOQUEADO** | `REVOKE UPDATE` a anon / RLS `is_admin()` | La actualización directa está clausurada; comprobantes van por RPC. |
| **UPDATE directo orden ajena** | Usuario autenticado atacante (no admin) | **BLOQUEADO** (0 filas) | RLS `is_admin() = false` | El atacante no tiene permisos de modificación sobre la tabla `orders`. |
| **Modificar status directamente** | No admin (`anon` o `authenticated`) | **BLOQUEADO** | RLS `Solo administradores pueden actualizar` | Previene que un usuario apruebe o cancele órdenes arbitrariamente. |
| **Modificar total_amount** | No admin / Atacante | **BLOQUEADO** | RLS `Solo administradores pueden actualizar` | Protege la integridad financiera del precio de la orden. |
| **Modificar buyer_id** | No admin / Atacante | **BLOQUEADO** | RLS `Solo administradores pueden actualizar` | Impide el robo o transferencia de titularidad de órdenes. |
| **Modificar ticket_count** | No admin / Atacante | **BLOQUEADO** | RLS `Solo administradores pueden actualizar` | Impide alterar la cantidad de boletos adquiridos. |
| **Modificar orden pagada como admin** | Administrador | **BLOQUEADO** | Trigger `trg_validate_order_status` | Ni el admin puede alterar comprador, monto o boletos de una orden pagada. |
| **Subir comprobante con archivo válido** | Comprador (`anon`) | **PERMITIDO** | RPC `submit_payment_proof` | La RPC SECURITY DEFINER valida la orden, archivo (<5MB, MIME permitido) y actualiza atómicamente a `pending_verification`. |
| **Subir comprobante con ruta inválida** | Comprador (`anon`) | **BLOQUEADO** | Validación 3 en `submit_payment_proof` | Rechaza si la ruta en Storage no corresponde al ID de la orden. |
| **Subir comprobante a orden pagada** | Comprador (`anon`) | **BLOQUEADO** | Validación 2 en `submit_payment_proof` | Rechaza si la orden ya está pagada o completada. |

---

## 4. Modificaciones en Código y Migraciones

### 4.1 Migración 039 (`supabase/migrations/039_harden_rls_orders_and_notification_logs.sql`)
1. **`notification_logs`**:
   - Eliminada política con subconsulta a `auth.users`.
   - Revocados privilegios a `anon` y `public`.
   - Creadas políticas RLS administrativas exclusivas:
     - `Admins pueden consultar logs de notificaciones` (SELECT).
     - `Admins pueden gestionar logs de notificaciones` (ALL).
2. **`orders`**:
   - Eliminada política `Compradores pueden adjuntar comprobante a su orden`.
   - Revocados `UPDATE, INSERT, DELETE` para `anon` y `public`.
   - Creada política `Solo administradores pueden actualizar órdenes directamente`.
3. **`submit_payment_proof`**:
   - Acotada actualización de boletos estrictamente a `WHERE order_id = p_order_id` (eliminada cláusula permisiva `OR (buyer_id = ...)`).

### 4.2 Código Frontend (`src/services/paymentService.ts`)
- En `cancelOrder`: Eliminado el bloque de fallback que ejecutaba `supabase.from('orders').update(...)` y `supabase.from('tickets').update(...)`. Se delega exclusivamente en la RPC `cancel_order`.

---

## 5. Pruebas y Validaciones Realizadas

1. **Suite de Pruebas RLS y Seguridad (Vitest):**
   - Archivo creado: [`src/test/rlsSecurityAndAccessControl.test.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/test/rlsSecurityAndAccessControl.test.ts) (16 tests cubriendo todas las combinaciones de roles y operaciones).
   - Resultado global de la suite: **15 archivos de test, 183 pruebas ejecutadas, 100% exitosas**.
2. **Validación de Migración (Supabase CLI):**
   - `npx supabase db push --dry-run`: Secuencia `001` a `039` validada limpiamente sin errores DDL.
3. **Verificación de Tipos (TypeScript):**
   - `npm run typecheck` (`tsc -b`): **0 errores**.
4. **Verificación de Linter (Oxlint):**
   - `npm run lint`: **0 errores**.
5. **Compilación de Producción (Vite):**
   - `npm run build`: Bundles generados con éxito en **4.84s**.

---

## 6. Archivos Afectados

- [NEW] [`supabase/migrations/039_harden_rls_orders_and_notification_logs.sql`](file:///c:/Users/frani/Downloads/RifaManaure/supabase/migrations/039_harden_rls_orders_and_notification_logs.sql)
- [NEW] [`src/test/rlsSecurityAndAccessControl.test.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/test/rlsSecurityAndAccessControl.test.ts)
- [MODIFY] [`src/services/paymentService.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/services/paymentService.ts)
- [MODIFY] [`supabase/migrations/README.md`](file:///c:/Users/frani/Downloads/RifaManaure/supabase/migrations/README.md)
- [MODIFY] [`README.md`](file:///c:/Users/frani/Downloads/RifaManaure/README.md)
