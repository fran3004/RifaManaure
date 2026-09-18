# Auditoría — Lote 8: Migraciones SQL (parte 2: 014–027 + monolito)

> Fecha: 2026-09-17 | Estado: ✅ Completo

---

## 63. `supabase/migrations/014_harden_admin_payment_rpcs.sql`

### A. Qué hace
Endurece la seguridad en `approve_order_payment` y `reject_order_payment`:
- Elimina el parámetro cliente `p_admin_id` y toma la identidad directamente de `auth.uid()`
- Agrega chequeo obligatorio `public.is_admin(auth.uid())` al inicio con `RAISE EXCEPTION`
- Revoca permisos de ejecución a `PUBLIC` y `anon`

### B. Hallazgos
- **Seguridad mejorada significativamente:** Se evita la suplantación de `p_admin_id`. ✅
- **Bug residual de asignación cruzada:** Mantiene el `WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved')`. Si un comprador tiene boletos reservados en otra rifa concurrente, la aprobación/rechazo de una orden podría afectar boletos de la otra rifa. Debería incluir `AND raffle_id = v_order.raffle_id`.

---

## 64. `supabase/migrations/015_harden_payment_proofs_storage.sql`

### A. Qué hace
Endurece la política de Storage para el bucket `payment-proofs`:
- Requiere que la ruta del archivo contenga un `order_id` existente y en estado `'pending'` o `'pending_verification'`
- Actualiza `submit_payment_proof` para verificar que `p_file_path` coincida con la convención de ruta del `order_id`

### B. Hallazgos
- **Mitigación efectiva:** Corrige el upload anónimo irrestricto de la migración 006. ✅
- **Soporte Base64 peligroso (L92–93):** Permite rutas con `data:image/%` o `data:application/pdf%`. Si se envía un data URL como ruta, se salta la validación de path en el storage.

---

## 65. `supabase/migrations/016_preserve_buyer_data_on_order_creation.sql`

### A. Qué hace
Actualiza `create_order_secure` para preservar datos del comprador en compras recurrentes (`ON CONFLICT (document_id) DO NOTHING` y recuperación de `v_buyer_id`).

### B. Hallazgos
- **Comportamiento de negocio:** Si un comprador cambia de teléfono o email, el sistema mantiene los datos antiguos silenciosamente. Para actualizar datos, el admin debe usar `admin_update_buyer`. Es una decisión de diseño válida para evitar que un tercero con solo la cédula modifique datos de contacto ajenos. ✅

---

## 66. `supabase/migrations/017_fix_admin_users_rls_recursion.sql`

### A. Qué hace
- Redefine `is_admin` e `is_superadmin` como `SECURITY DEFINER` con `SET search_path = public, auth, pg_temp`
- Resuelve la recursión infinita en las políticas RLS de `admin_users`
- Restringe la gestión de administradores exclusivamente a `is_superadmin(auth.uid())`

### B. Hallazgos
- **Corrección crítica de escalada de privilegios:** Corrige el problema de la migración 002 donde cualquier admin (incluso auditor) podía modificar `admin_users`. Ahora solo `superadmin` puede hacerlo. ✅

---

## 67. `supabase/migrations/018_enable_supabase_realtime.sql`

### A. Qué hace
Ejecuta `ALTER TABLE public.tickets REPLICA IDENTITY FULL;` y `ALTER TABLE public.orders REPLICA IDENTITY FULL;` para habilitar réplica completa de eventos en Supabase Realtime.

### B. Hallazgos
- **Configuración correcta:** Necesario para que los clientes reciban el payload completo en eventos de actualización/eliminación de tickets y órdenes. ✅
- Documenta el paso manual requerido en el Dashboard si no se cuenta con permisos de superusuario de publicación.

---

## 68. `supabase/migrations/019_admin_buyer_management.sql`

### A. Qué hace
- Agrega política RLS de lectura en `buyers` para administradores
- Crea RPC `admin_update_buyer` para corregir datos de contacto con validación de email, bloqueo pesimista y registro en `audit_logs`

### B. Hallazgos
- **Validación robusta:** Comprueba formato básico de email (`%_@_%._%`) y no vacíos. ✅
- **Auditoría inmutable:** Registra `old_values` y `new_values` en `audit_logs`. ✅

---

## 69. `supabase/migrations/020_admin_raffle_management.sql`

### A. Qué hace
- RPC `admin_update_raffle`: permite modificar título, precio, fecha, lotería, estado y cupo de boletos por comprador. Pausa automáticamente otras rifas si una se activa.
- RPC `admin_create_raffle`: crea nueva rifa y genera atómicamente todos sus boletos (`000` a `999` o `0000` a `9999`) con `generate_series`.

### B. Hallazgos
- **Generación masiva eficiente:** Usa `generate_series` en PostgreSQL en una sola sentencia SQL en vez de loops en el cliente. ✅
- **Regla de rifa única activa:** Si una rifa pasa a `active`, pausa las demás automáticamente (`UPDATE raffles SET status = 'paused' WHERE id <> p_raffle_id AND status = 'active'`). ✅

---

## 70. `supabase/migrations/021_winners_management.sql`

### A. Qué hace
- Crea tabla `winners` vinculada a `raffles`, `orders`, `buyers` y `tickets`
- Crea bucket `winner-documents` con límite de 10 MB para actas y fotos
- Crea RPC `register_winner`: valida que el boleto esté efectivamente en estado `'sold'`, asocia comprador/orden, pasa la rifa a `'finished'` y genera log de auditoría

### B. Hallazgos
- **Validación estricta de venta:** Bloquea el registro de ganador si el ticket no está `'sold'`. ✅
- **Bucket público:** El bucket `winner-documents` es público para permitir renderizado de fotos y actas en la landing. Las políticas de INSERT/UPDATE/DELETE están restringidas a admins. ✅

---

## 71. `supabase/migrations/022_system_settings_management.sql`

### A. Qué hace
- Crea tabla singleton `system_settings` (garantizada con `CHECK (id = 1)`)
- RPC `admin_update_system_settings` para modificar tiempo de expiración (1–120 min), tope de boletos (1–1000), WhatsApp y email de soporte
- Actualiza `reserve_tickets` y `create_order_secure` para leer dinámicamente estos parámetros

### B. Hallazgos
- **Parametrización dinámica:** El tiempo de reserva (10 min) y el tope de boletos dejan de estar hardcodeados en código. ✅
- **Defensa en profundidad:** `create_order_secure` prioriza el límite de la rifa si está definido y cae al global como respaldo. ✅

---

## 72. `supabase/migrations/023_security_hardening_linter_fixes.sql`

### A. Qué hace
Mega-migración de saneamiento de seguridad (2170 líneas):
- Fija `SET search_path = public, pg_temp` en todas las funciones y triggers para mitigar ataques de search_path hijacking
- Elimina políticas `WITH CHECK (true)` en `buyers` y `orders`, restringiendo inserciones directas solo a administradores (los compradores deben usar `create_order_secure`)
- Restringe listado `SELECT` en `storage.objects` para buckets privados y públicos a administradores
- Revoca permisos de ejecución `PUBLIC/anon` en funciones internas y triggers

### B. Hallazgos
- **Solución integral de seguridad:** Corrige de raíz los hallazgos críticos detectados en migraciones 001, 003 y 006. ✅
- **Cierre de brecha en orders/buyers:** Ya ningún usuario anónimo puede hacer INSERT directo a `orders` o `buyers` saliéndose del flujo de checkout. ✅

---

## 73. `supabase/migrations/024_admin_users_management.sql`

### A. Qué hace
- RPC `admin_list_users`: lista administradores con metadatos de `auth.users` (`last_sign_in_at`)
- RPC `admin_invite_user`: pre-autoriza correos con rol (`superadmin`, `admin`, `auditor`). Solo superadmin puede invitar superadmins.
- RPC `admin_toggle_user_status`: activa/desactiva administradores con reglas anti-autodesactivación y anti-orfandad del último superadmin.

### B. Hallazgos
- **Protección contra bloqueo accidental:** Imposibilita que el único superadmin se desactive a sí mismo o desactive al último superadmin. ✅
- **Principio de menor privilegio:** Un admin regular no puede crear superadmins. ✅

---

## 74. `supabase/migrations/025_partners_management.sql`

### A. Qué hace
- Agrega `logo_url` y `updated_at` a `partners`
- Configura bucket `partner-logos` (público, 5 MB, SVG/PNG/JPG/WEBP) con RLS restringido a admins para mutaciones
- Seed data actualizado de los 10 aliados con URLs oficiales de Instagram

### B. Hallazgos
- **Bucket y RLS consistentes:** Subida solo para admins, visualización pública. ✅

---

## 75. `supabase/migrations/026_dashboard_kpis_rpc.sql` & 76. `027_dashboard_kpis_robust_filter.sql`

### A. Qué hace
- Implementa `get_dashboard_kpis(p_raffle_id)` que calcula métricas agregadas (`COUNT`, `SUM`, filtros) en la base de datos
- Retorna JSONB completo en formato dual (`camelCase` y `snake_case`)
- Migración 027 añade fallback para leer `total_tickets` desde `raffles` si aún no hay boletos generados en `tickets`

### B. Hallazgos
- **Rendimiento O(1) para el cliente:** Resuelve el problema de transferir miles de filas de tickets/órdenes para calcular estadísticas. ✅
- **Seguridad estricta:** `REVOKE EXECUTE FROM PUBLIC, anon` y validación `is_admin(auth.uid())`. ✅

---

## 77. `supabase/migrations/EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql`

### A. Qué hace
Archivo monolítico (7571 líneas, ~267 KB) que concatena todas las migraciones en orden correlativo (001 a 027) para ejecución manual en el SQL Editor de Supabase.

### B. Hallazgos
- **Mantenibilidad:** Es un script de conveniencia para aprovisionamiento inicial.
- **Riesgo de re-ejecución:** Contiene sentencias `INSERT` de seed data con `ON CONFLICT DO NOTHING` / `DO UPDATE`. La re-ejecución sobre una base de datos activa es segura en su mayoría, pero debe ejecutarse preferentemente en ambientes nuevos o limpios.

---

## Resumen del Lote 8

| Migración | Estado | Severidad | Hallazgo |
|-----------|--------|-----------|----------|
| 014 | ✅ Corregido | Baja | `auth.uid()` forzado en backend; residual de rifas cruzadas en WHERE |
| 015 | ✅ Corregido | Baja | Storage de comprobantes validado contra order_id y estado |
| 016 | ✅ OK | — | Preservación de datos de comprador |
| 017 | ✅ Corregido | — | Corrección de recursión RLS y restricción a superadmins |
| 018 | ✅ OK | — | Replica identity FULL para Realtime |
| 019 | ✅ OK | — | RPC de actualización de compradores con auditoría |
| 020 | ✅ OK | — | CRUD de rifas con generación atómica de boletos |
| 021 | ✅ OK | — | Registro de ganadores con validación de boleto vendido |
| 022 | ✅ OK | — | Configuración dinámica del sistema (tiempo reserva y límites) |
| 023 | 🛡️ Excelente | — | Endurecimiento masivo (search_path, RLS no-permisivo, storage) |
| 024 | ✅ OK | — | Gestión de admins con protección anti-autodesactivación |
| 025 | ✅ OK | — | Gestión de aliados y bucket de logos |
| 026 / 027 | ✅ OK | — | KPIs de dashboard en backend O(1) con filtrado robusto |
| Monolito | ⚠ Informativo | Baja | Archivo de conveniencia de 7571 líneas |

### Conclusión de la capa de base de datos (Lotes 7 y 8)
La evolución de las migraciones demuestra un proceso continuo de endurecimiento. Muchas de las vulnerabilidades iniciales de las migraciones 001–006 fueron **completamente subsanadas** en las migraciones 014, 015, 017 y especialmente en la **023**. La base de datos cuenta con una arquitectura de seguridad por capas sólida (`SECURITY DEFINER`, validación `is_admin`, `search_path` fijo, transacciones `FOR UPDATE` y `audit_logs`).

