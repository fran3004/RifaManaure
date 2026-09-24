# AUDITORÍA 01 — BASE DE DATOS, ESQUEMA, MIGRACIONES E INTEGRIDAD

**PROYECTO:** RifaManaure (Nombre comercial: `Manaure Vive`)  
**REPOSITORIO:** `fran3004/RifaManaure`  
**INSTANCIA SUPABASE:** `bxhzvmbbsisxqpwrgvgn` (PostgreSQL 17.6.1.166 en AWS `us-west-2`)  
**FECHA DE AUDITORÍA:** 23 de Septiembre de 2026  
**FASE:** EXCLUSIVAMENTE AUDITORÍA TÉCNICA (CERO MODIFICACIONES DE CÓDIGO, CERO MIGRACIONES, CERO MUTACIONES EN BD)  

---

## CONVENCIONES DE CLASIFICACIÓN UTILIZADAS

* **`[VERIFICADO]`**: Confirmado de forma directa e inequívoca mediante inspección de archivos SQL locales o catálogo de PostgreSQL vía Supabase Management API.
* **`[INFERIDO]`**: Deducción lógica y técnica basada en patrones y referencias del código, pero sujeta a confirmación en tiempo de ejecución.
* **`[NO VERIFICABLE]`**: Elemento que depende de infraestructura externa o secretos en la nube a los cuales no se tiene acceso directo.
* **`[CONTRADICTORIO]`**: Discrepancia real entre dos o más fuentes de verdad del proyecto (ej. migraciones vs. tipos TypeScript, o README vs. código).
* **`[HUÉRFANO]`**: Archivo, función, columna o recurso definido en el proyecto que no es invocado, consumido ni referenciado por ningún flujo activo.
* **`[OBSOLETO]`**: Código, documentación o definición que perteneció a una arquitectura anterior y fue reemplazado, pero permanece en el repositorio.
* **`[RIESGO]`**: Vulnerabilidad potencial de seguridad, punto único de fallo, inconsistencia de integridad referencial o conflicto de concurrencia.

---

# 1. RESUMEN EJECUTIVO

Se ha ejecutado una auditoría forense integral de la base de datos de **RifaManaure**, examinando los 37 archivos de migración individuales (`001_...` a `036_...`), el script monolítico `EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql`, el catálogo real de PostgreSQL (`information_schema`, `pg_catalog`, `pg_policies`, `pg_proc`, `pg_extension`, `cron.job`) y su correlación con los servicios frontend en React.

### Principales Conclusiones:
1. **La base de datos viva contiene las migraciones 001 a 036 aplicadas manualmente**, acumulando 17 tablas, 53 políticas RLS, 13 triggers, 30 funciones/RPCs y 56 índices.
2. **Existe un defecto crítico en la lógica de aprobación y rechazo de pagos (`approve_order_payment` y `reject_order_payment`)**: la cláusula `WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved')` altera indiscriminadamente boletos de otras órdenes no relacionadas del mismo comprador.
3. **El canal Realtime de Supabase está desconectado en producción**: la publicación `supabase_realtime` no tiene agregadas las tablas `tickets` ni `orders`, anulando la sincronización por WebSocket entre compradores.
4. **Fallo bloqueante de permisos en `notification_logs`**: una política RLS intenta hacer `SELECT` directo sobre `auth.users`, arrojando un error `42501: permission denied for table users` que impide la lectura de trazas de notificación.
5. **El script monolítico de despliegue (`EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql`) está quebrado**: omite 5 migraciones (`025`, `028a`, `028b`, `029`, `030`, `031`) y coloca la `033` antes de la `032`, provocando un fallo sintáctico fatal en bases limpias por inexistencia de la tabla `prize_settings`.
6. **Colisión de prefijos en migraciones**: existen dos archivos con prefijo `028_`, lo que genera ordenamiento no determinista en runners automáticos de CI/CD.

---

# 2. RECONSTRUCCIÓN CRONOLÓGICA DE MIGRACIONES (001 A 036)

A continuación se detalla la evolución acumulativa del esquema, identificando exactamente qué introduce, modifica o elimina cada migración en orden estricto:

| # | Archivo | Tablas Creadas / Modificadas | Funciones / RPCs | Triggers | RLS & Policies | Storage / Cron / Ext |
|---|---|---|---|---|---|---|
| **001** | `001_initial_schema.sql` | Creadas: `raffles`, `buyers`, `orders`, `tickets`, `system_settings`, `audit_logs`. Semillas: Rifa principal, configuración inicial. | `generate_tickets_for_raffle`, `reserve_tickets`, `release_expired_reservations`, `confirm_order_payment`, `cancel_order` | `trg_system_settings_updated_at` | RLS activado en todas las tablas. Policies públicas para `tickets`, `raffles`, `system_settings`. | Ext: `uuid-ossp`, `pgcrypto`. |
| **002** | `002_admin_auth.sql` | Creada: `admin_users`. Semilla: admin inicial. | `is_admin(p_user_id)` | Ninguno | Policies RLS para administración y auto-lectura de perfil admin. | Ninguno. |
| **003** | `003_manual_payment_flow.sql` | Creada: `payment_accounts`. Semillas bancarias. | `submit_order_receipt`, `approve_order_payment`, `reject_order_payment` | Ninguno | Policies de lectura pública de cuentas de pago y gestión admin. | Ninguno. |
| **004** | `004_normalize_order_ticket_state_machine.sql` | Modificada: `orders` (nuevos estados: `pending_verification`, `cancelled`). | `fn_validate_order_status_transition`, `fn_validate_ticket_status_transition` | `trg_validate_order_status`, `trg_validate_ticket_status` | Ninguna policy nueva. | Triggers de máquina de estados y auditoría automática. |
| **005** | `005_payment_accounts_management.sql` | Modificada: `payment_accounts` (campos auditoría y display_order). | `fn_audit_payment_accounts`, `fn_payment_accounts_updated_at` | `trg_audit_payment_accounts`, `trg_payment_accounts_updated_at` | Hardening de policies RLS en `payment_accounts`. | Ninguno. |
| **006** | `006_payment_proofs_storage_flow.sql` | Creada: `payment_proofs`. | `submit_payment_proof`, `fn_payment_proofs_updated_at` | `trg_payment_proofs_updated_at` | Policies RLS de subida para compradores y lectura/gestión para admin. | Storage: Crea bucket privado `payment-proofs`. |
| **007** | `007_transactional_notification_logs.sql` | Creada: `notification_logs`. | Ninguna | Ninguno | Policies para admin y compradores. *(Introduce bug de auth.users).* | Ninguno. |
| **008** | `008_order_contact_preference.sql` | Modificada: `orders` (agrega columna `contact_preference`). | Ninguna | Ninguno | Ninguno | Ninguno. |
| **009** | `009_notification_traceability.sql` | Modificada: `notification_logs` (relaja constraint `event_type` para admitir minúsculas). | Ninguna | Ninguno | Actualiza policies de trazabilidad. | Ninguno. |
| **010** | `010_admin_ticket_management.sql` | Modificada: `tickets` (índices administrativos). | `admin_block_ticket`, `admin_unblock_ticket` | Ninguno | Ninguno | RPCs de bloqueo manual con auditoría. |
| **011** | `011_cron_release_expired_reservations.sql` | Ninguna | Ninguna | Ninguno | Ninguno | Ext: `pg_cron`. Cron Job: `release-expired-reservations-job` (cada 5 min). |
| **012** | `012_create_order_secure.sql` | Modificada: `orders`, `tickets`. | `create_order_secure` (con `FOR UPDATE` pesimista y cálculo de precio en servidor) | Ninguno | Ninguno | RPC transaccional que previene manipulación de precios. |
| **013** | `013_restrict_orders_select_and_public_verification_rpc.sql` | Modificada: `orders` (elimina SELECT público). | `verify_public_order_or_tickets` (con enmascaramiento SQL nativo) | Ninguno | Restringe `orders` SELECT exclusivamente a administradores. | Protección contra fugas masivas de PII. |
| **014** | `014_harden_admin_payment_rpcs.sql` | Ninguna | Reemplazadas: `approve_order_payment`, `reject_order_payment`. Eliminada: `confirm_order_payment`. | Ninguno | Grants restrictivos a `authenticated`. | Blindaje de RPCs con verificación de `is_admin()`. |
| **015** | `015_harden_payment_proofs_storage.sql` | Ninguna | Ninguna | Ninguno | Policies RLS estrictas en `storage.objects` para `payment-proofs`. | Storage: Control de acceso a comprobantes. |
| **016** | `016_preserve_buyer_data_on_order_creation.sql` | Modificada: `buyers`. | Actualizada: `create_order_secure` (`ON CONFLICT (document_id) DO NOTHING`). | Ninguno | Ninguno | Evita sobreescritura destructiva de datos de compradores. |
| **017** | `017_fix_admin_users_rls_recursion.sql` | Modificada: `admin_users`. | Ninguna | Ninguno | Reemplaza policies de `admin_users` para eliminar recursión infinita. | Resuelve bug RLS 42P17. |
| **018** | `018_enable_supabase_realtime.sql` | Modificada: `tickets`, `orders` (`REPLICA IDENTITY FULL`). | Ninguna | Ninguno | Ninguno | Realtime: Instrucción manual (no aplicada en BD). |
| **019** | `019_admin_buyer_management.sql` | Modificada: `buyers` (índices de búsqueda). | `admin_update_buyer` | Ninguno | Grants admin para edición de compradores con auditoría. | Ninguno. |
| **020** | `020_admin_raffle_management.sql` | Modificada: `raffles`. | `admin_update_raffle` | Ninguno | Grants admin para parametrización de sorteo con auditoría. | Ninguno. |
| **021** | `021_winners_management.sql` | Creada: `winners`. | `register_winner` | Ninguno | Policies RLS para lectura pública y registro exclusivo admin. | Storage: Crea bucket `winner-documents`. |
| **022** | `022_system_settings_management.sql` | Modificada: `system_settings`. | `admin_update_system_settings` | Ninguno | Grants admin para configuración global con auditoría. | Ninguno. |
| **023** | `023_security_hardening_linter_fixes.sql` | Modificadas todas las funciones de la BD. | Fija `SET search_path = public, pg_temp` en todas las funciones. Elimina formalmente `submit_order_receipt` y `confirm_order_payment`. | Ninguno | Hardening integral contra secuestro de search_path. | Corrige advertencias de seguridad del Linter de Supabase. |
| **024** | `024_admin_users_management.sql` | Modificada: `admin_users`. | `admin_list_users`, `admin_invite_user`, `admin_toggle_user_status` | Ninguno | Gestión delegada de administradores por superadmins. | Integración con `auth.users` mediante `SECURITY DEFINER`. |
| **025** | `025_partners_management.sql` | Creada: `partners`. | `fn_partners_updated_at` | `trg_partners_updated_at` | Policies RLS públicas y de gestión admin. | Storage: Crea bucket `partner-logos`. |
| **026** | `026_dashboard_kpis_rpc.sql` | Ninguna | `get_dashboard_kpis(p_raffle_id UUID)` | Ninguno | Grant a `authenticated` con chequeo `is_admin()`. | Agregación analítica nativa en PostgreSQL. |
| **027** | `027_dashboard_kpis_robust_filter.sql` | Ninguna | Actualizada: `get_dashboard_kpis` con robustez ante NULL. | Ninguno | Ninguno | Optimización de filtros analíticos. |
| **028a** | `028_fix_public_payment_accounts_and_is_admin_grant.sql` | Modificada: `payment_accounts`. | `is_admin` (re-grant a public/authenticated) | Ninguno | Ajusta policy pública de cuentas de pago activas. | Corrige visualización de cuentas en checkout. |
| **028b** | `028_flexible_raffle_emission.sql` | Modificada: `raffles` (check `total_tickets` 1.000..10.000). | `generate_tickets_for_raffle` (rango flexible con padding dinámico) | Ninguno | Ninguno | Permite emisión escalable de números. |
| **029** | `029_harden_is_admin_security_definer.sql` | Ninguna | Actualizada: `is_admin` (fuerza `v_uid := auth.uid()` ignorando argumento externo). | Ninguno | Ninguno | Previene vector de suplantación en comprobación de roles. |
| **030** | `030_remove_resend_email_id.sql` | Modificada: `notification_logs` (elimina columna `resend_email_id`). | Ninguna | Ninguno | Ninguno | Desacoplamiento de proveedor legado Resend. |
| **031** | `031_prize_management.sql` | Creadas: `prize_settings`, `prize_experiences`. | `fn_prize_updated_at` | `trg_prize_settings_updated_at`, `trg_prize_experiences_updated_at` | Policies públicas de lectura y admin para edición. | Storage: Crea bucket `prize-images`. |
| **032** | `032_faq_items.sql` | Creada: `faq_items`. Semillas de FAQ. | Ninguna | Ninguno | Policy de lectura pública. | Ninguno. |
| **033** | `033_prize_official_details_and_image_sync.sql` | Modificada: `prize_settings` (agrega columnas de tour oficial). | Ninguna | Ninguno | Ninguno | Sincronización de detalles de premio mayor. |
| **034** | `034_faq_admin_policies.sql` | Modificada: `faq_items`. | Ninguna | Ninguno | Agrega policies RLS ALL para administradores. | Habilita gestión CRUD de preguntas frecuentes. |
| **035** | `035_gallery_management.sql` | Creada: `gallery_items`. Semillas turísticas. | Ninguna | Ninguno | Policies RLS públicas y de administración. | Storage: Crea bucket público `gallery-images`. |
| **036** | `036_gallery_categories.sql` | Creada: `gallery_categories`. Semillas de categorías. | Ninguna | `trg_gallery_categories_updated_at` | Policies RLS públicas y de administración. | Gestión taxonómica dinámica de la galería. |

---

# 3. ANÁLISIS DE MIGRACIONES CONFLICTIVAS Y DIVERGENCIAS

### 3.1 Colisión Numérica de Migraciones 028
* **Archivos implicados:**
  1. `supabase/migrations/028_fix_public_payment_accounts_and_is_admin_grant.sql`
  2. `supabase/migrations/028_flexible_raffle_emission.sql`
* **Naturaleza del Conflicto:** Dos archivos comparten exactamente el mismo prefijo secular (`028_`). En herramientas estándar como Supabase CLI, los archivos se ordenan alfanuméricamente por nombre completo, ejecutándose primero `028_fix_...` y luego `028_flexible_...`. Sin embargo, si se renombran o se transfieren a sistemas con orden de creación o fecha de archivo, el orden se vuelve no determinista.

### 3.2 La Monstruosa Cláusula OR en Aprobación y Rechazo de Pagos
* **Archivos implicados:** `003_manual_payment_flow.sql`, `014_harden_admin_payment_rpcs.sql`, `023_security_hardening_linter_fixes.sql`
* **Código Afectado en `approve_order_payment`:**
  ```sql
  UPDATE public.tickets
  SET status = 'sold',
      reservation_expires_at = NULL,
      updated_at = NOW()
  WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');
  ```
* **Código Afectado en `reject_order_payment`:**
  ```sql
  UPDATE public.tickets
  SET status = 'available',
      buyer_id = NULL,
      order_id = NULL,
      reserved_at = NULL,
      reservation_expires_at = NULL,
      updated_at = NOW()
  WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');
  ```
* **Problema:** La condición `OR (buyer_id = v_order.buyer_id AND status = 'reserved')` era un remanente arcaico de la migración 003 previa a la existencia de `order_id` en `tickets`. Si un comprador tiene dos órdenes abiertas (Orden A y Orden B):
  * Al **aprobar** la Orden A, los boletos reservados de la Orden B se marcan como `sold` conservando el `order_id` de la Orden B (que aún está pendiente).
  * Al **rechazar** la Orden A, los boletos reservados de la Orden B se liberan a `available` y su `order_id` se fija en NULL, dejando la Orden B vacía y en estado inconsistente.
* **Contraste con `cancel_order`:** En `cancel_order` (migración 001/023) la cláusula está correctamente acotada: `WHERE order_id = p_order_id;`.

### 3.3 El Bug de Seguridad en RLS de `notification_logs`
* **Archivo implicado:** `007_transactional_notification_logs.sql` (Línea 45)
* **Código Defectuoso:**
  ```sql
  CREATE POLICY "Compradores pueden ver logs de sus órdenes" ON public.notification_logs
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.orders o
          JOIN public.buyers b ON b.id = o.buyer_id
          WHERE o.id = notification_logs.order_id
            AND LOWER(b.email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
        )
      );
  ```
* **Problema:** En PostgreSQL de Supabase, el rol de API `authenticated` **no tiene permisos de `SELECT` sobre la tabla de sistema `auth.users`**. Al evaluar la política, el motor lanza inmediatamente el error `42501 (permission denied for table users)`. Ningún usuario autenticado (ni siquiera el administrador) puede realizar un `SELECT` sobre `notification_logs` vía API REST sin que salte esta excepción, a menos que se use la `service_role` key que elude RLS.

### 3.4 Desincronización de Tipos TypeScript (`database.types.ts`)
* **Archivo:** `src/types/database.types.ts` (Líneas 774-802)
* **Problema:** La migración 023 ejecutó:
  ```sql
  DROP FUNCTION IF EXISTS public.confirm_order_payment(UUID, VARCHAR, JSONB);
  DROP FUNCTION IF EXISTS public.submit_order_receipt(UUID, TEXT, VARCHAR);
  ```
  Sin embargo, el contrato de TypeScript continúa tipando ambas funciones como disponibles en `Database['public']['Functions']`.

---

# 4. ANÁLISIS ESPECIAL: `EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql`

El repositorio incluye un archivo monolítico en `supabase/migrations/EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` con un peso de 297 KB y 7.868 líneas.

### 4.1 Contenido Real Detectado
Contrario a la suposición inicial de que se truncaba en la migración 025, el análisis línea a línea revela una estructura fragmentada y peligrosa:
* Contiene migraciones 001 a 024.
* **Omite completamente la Migración 025** (`025_partners_management.sql`).
* Contiene migraciones 026 y 027.
* **Omite ambas Migraciones 028** (`028_fix_public_payment_accounts...` y `028_flexible_raffle_emission`).
* **Omite la Migración 029** (`029_harden_is_admin_security_definer.sql`).
* **Omite la Migración 030** (`030_remove_resend_email_id.sql`).
* **Omite la Migración 031** (`031_prize_management.sql`).
* En la línea 7566 incluye la **Migración 033** (`033_prize_official_details_and_image_sync.sql`).
* En la línea 7612 incluye la **Migración 032** (`032_faq_items.sql`).
* Incluye las migraciones 034, 035 y 036.

### 4.2 Error Fatal de Ejecución en Base Limpia
Si este archivo se ejecuta en un proyecto nuevo de Supabase o una base de datos vacía, **la ejecución aborta con error SQL fatal en la línea 7566**:
```sql
ALTER TABLE public.prize_settings 
ADD COLUMN IF NOT EXISTS official_tour_badge VARCHAR(100) DEFAULT 'PREMIO MAYOR OFICIAL',
...
```
**Razón:** La tabla `prize_settings` se crea en la migración 031, la cual fue completamente omitida de este archivo monolítico. PostgreSQL arroja `ERROR: relation "public.prize_settings" does not exist`.

### 4.3 Divergencias que Genera
1. **Falta de tabla `partners`**: La entidad de aliados comerciales no existiría.
2. **Emisión fija a 1.000 boletos**: No se aplicaría la flexibilidad de hasta 10.000 boletos.
3. **`is_admin` desactualizado**: Mantendría la vulnerabilidad previa al hardening de la 029.
4. **Vulnerabilidad de orden de ejecución**: La migración 033 está físicamente antes de la 032.

> [!CAUTION]
> **Veredicto Técnico sobre el archivo:** `EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` **NUNCA DEBE SER EJECUTADO**. No representa un consolidado fidedigno del repositorio y contiene defectos de secuencia que romperían cualquier despliegue.

---

# 5. AUDITORÍA DE MIGRACIONES DESDE CERO (CLEAN INSTALL)

Si se realiza `git clone` en un entorno limpio y se ejecutan las migraciones ordenadas `001` a `036` mediante Supabase CLI, se presentarán los siguientes obstáculos y fallas:

1. **Fallo por Dependencia de Extensión `pg_cron` (Migración 011)**:
   * `CREATE EXTENSION IF NOT EXISTS pg_cron;` fallará en instancias locales o contenedores Docker donde PostgreSQL no fue iniciado con `shared_preload_libraries = 'pg_cron'`.
2. **Fallo de Permisos en `ALTER PUBLICATION` (Migración 018)**:
   * La publicación `supabase_realtime` pertenece al superusuario `supabase_admin`. El rol estándar `postgres` no tiene privilegios para ejecutar `ALTER PUBLICATION supabase_realtime ADD TABLE ...`. Por ello, la migración 018 comentó esta línea, provocando que en una instalación limpia el sistema quede sin Realtime a menos que se configure manualmente en la UI.
3. **No Determinismo en Prefijo Duplicado `028_`**:
   * Si la CLI de migraciones ordena por timestamp de archivo en lugar de orden alfabético estricto, `028_flexible_raffle_emission.sql` podría ejecutarse antes o después de `028_fix_public_payment_accounts...`.
4. **Fallo en `storage.buckets`**:
   * Las migraciones 006, 021, 025, 031 y 035 hacen `INSERT INTO storage.buckets (id, name, public) VALUES ('...', '...', ...)`. En versiones recientes de Supabase Storage API, las mutaciones directas a tablas de almacenamiento sin pasar por la API interna pueden dejar metadatos desincronizados.

---

# 6. AUDITORÍA DE CADA TABLA (17 TABLAS)

A continuación se auditan las 17 tablas activas del esquema de producción:

### 6.1 `raffles`
* **Propósito:** Catálogo principal de sorteos y rifas ecoturísticas.
* **Columnas:** `id` (UUID, PK), `title` (VARCHAR 255), `slug` (VARCHAR 100, UNIQUE), `description` (TEXT), `ticket_price` (NUMERIC 12,2), `total_tickets` (INT), `max_tickets_per_buyer` (INT), `draw_date` (TIMESTAMPTZ), `lottery_reference` (VARCHAR 150), `status` (VARCHAR 20, CHECK: draft, active, paused, closed, finished), `hero_image_url` (TEXT), `created_at`, `updated_at`.
* **Integridad:** CHECK `ticket_price > 0`, `total_tickets > 0` (relajado en 028 a 1000..10000), `max_tickets_per_buyer > 0`.
* **Triggers:** Ninguno nativo (actualización mediante RPC o directa).
* **RLS & Policies:** SELECT público (`USING (true)`); ALL restringido a administradores autenticados (`is_admin()`).
* **Exposición y Sensibilidad:** Datos públicos. Ningún dato sensible.

### 6.2 `buyers`
* **Propósito:** Registro central de compradores (Habeas Data, facturación y contacto).
* **Columnas:** `id` (UUID, PK), `full_name` (VARCHAR 200), `document_id` (VARCHAR 30, UNIQUE), `phone` (VARCHAR 30), `email` (VARCHAR 150), `city` (VARCHAR 100), `created_at`, `updated_at`.
* **Integridad:** `CONSTRAINT unique_buyer_doc UNIQUE (document_id)`. No admite documentos duplicados.
* **Triggers:** Ninguno.
* **RLS & Policies:** SELECT restringido a administradores; INSERT permitido solo a admin (el público inserta vía `create_order_secure` con `SECURITY DEFINER`).
* **Exposición y Sensibilidad:** **ALTA SENSIBILIDAD (PII)**. Contiene cédulas, celulares y correos reales. El acceso directo está completamente sellado por RLS. La verificación pública enmascara estos datos en PostgreSQL (`verify_public_order_or_tickets`).

### 6.3 `orders`
* **Propósito:** Registro transaccional de intenciones de compra y liquidación de pagos.
* **Columnas:** `id` (UUID, PK), `raffle_id` (UUID, FK `raffles.id` RESTRICT), `buyer_id` (UUID, FK `buyers.id` RESTRICT), `reference` (VARCHAR 50, UNIQUE), `total_amount` (NUMERIC 12,2), `ticket_count` (INT), `status` (VARCHAR 20), `payment_method` (VARCHAR 30), `payment_gateway_id` (VARCHAR 100), `payment_gateway_data` (JSONB), `receipt_url` (TEXT), `rejection_reason` (TEXT), `verified_at` (TIMESTAMPTZ), `verified_by` (UUID), `contact_preference` (VARCHAR 20), `created_at`, `updated_at`.
* **Integridad:** CHECK `ticket_count > 0`, `total_amount >= 0`, CHECK estados (8 valores).
* **Triggers:** `trg_validate_order_status` (BEFORE UPDATE -> `fn_validate_order_status_transition()`).
* **RLS & Policies:** SELECT solo admin; INSERT solo admin; UPDATE público si estado es `pending` o `pending_verification`.
* **Exposición:** Sellado para anon.

### 6.4 `tickets`
* **Propósito:** Inventario unitario de números disponibles, reservados y vendidos por rifa.
* **Columnas:** `id` (UUID, PK), `raffle_id` (UUID, FK `raffles.id` CASCADE), `number` (VARCHAR 10), `status` (VARCHAR 20, default 'available'), `reserved_at` (TIMESTAMPTZ), `reservation_expires_at` (TIMESTAMPTZ), `buyer_id` (UUID, FK `buyers.id` SET NULL), `order_id` (UUID, FK `orders.id` SET NULL), `created_at`, `updated_at`.
* **Integridad:** `CONSTRAINT unique_ticket_per_raffle UNIQUE (raffle_id, number)`.
* **Triggers:** `trg_validate_ticket_status` (BEFORE UPDATE -> `fn_validate_ticket_status_transition()`).
* **RLS & Policies:** SELECT público (`USING (true)`); UPDATE restringido a admin y RPCs.
* **Exposición:** Público.

### 6.5 `payment_accounts`
* **Propósito:** Cuentas bancarias oficiales para transferencias manuales.
* **Columnas:** `id` (UUID, PK), `bank_name`, `account_type`, `account_number`, `account_holder`, `holder_id`, `instructions`, `is_active` (BOOL), `display_order` (INT), `created_at`, `updated_at`, `created_by`, `updated_by`.
* **Triggers:** `trg_payment_accounts_updated_at`, `trg_audit_payment_accounts` (audita inserts, updates y deletes en `audit_logs`).
* **RLS & Policies:** SELECT público de cuentas con `is_active = true`; ALL para admin.

### 6.6 `payment_proofs`
* **Propósito:** Registro y metadatos de comprobantes de pago subidos por los compradores.
* **Columnas:** `id` (UUID, PK), `raffle_id` (FK CASCADE), `order_id` (FK CASCADE), `buyer_id` (FK CASCADE), `file_path`, `file_name`, `file_size`, `mime_type`, `status` (pending, approved, rejected), `payment_reference`, `rejection_reason`, `verified_by`, `verified_at`, `created_at`, `updated_at`.
* **Triggers:** `trg_payment_proofs_updated_at`.
* **RLS & Policies:** INSERT público verificado por existencia de la orden en pending; ALL para admin.

### 6.7 `notification_logs`
* **Propósito:** Auditoría y trazabilidad de mensajes transaccionales (WhatsApp y Email).
* **Columnas:** `id` (UUID, PK), `order_id` (FK CASCADE), `event_type` (VARCHAR 50), `channel` (email, whatsapp, sms), `recipient`, `status` (pending, sent, delivered, failed, bounced), `attempts`, `error_message`, `idempotency_key` (UNIQUE), `metadata` (JSONB), `created_at`, `updated_at`.
* **RLS & Policies:** Bloqueada actualmente por el bug de permisos sobre `auth.users`.

### 6.8 `admin_users`
* **Propósito:** Control de acceso basado en roles (superadmin, admin, auditor) para el panel de administración.
* **Columnas:** `id` (UUID, PK), `user_id` (UUID, FK `auth.users` CASCADE), `email` (UNIQUE), `full_name`, `role`, `is_active`, `created_at`, `updated_at`.
* **RLS & Policies:** Auto-lectura de perfil propio; ALL para superadmins; SELECT para administradores activos.

### 6.9 `system_settings`
* **Propósito:** Configuración dinámica de parámetros operativos del sistema (duración de reserva, soporte, WhatsApp).
* **Columnas:** `id` (INT, PK), `reservation_duration_minutes` (INT, default 10), `max_tickets_per_buyer` (INT, default 20), `support_whatsapp_number`, `support_email`, `updated_at`, `updated_by`.
* **RLS & Policies:** SELECT público; UPDATE restringido a admin.

### 6.10 `audit_logs`
* **Propósito:** Pista forense inmutable de acciones críticas (cambios de estado, bloqueos de boletos, sorteos).
* **Columnas:** `id` (UUID, PK), `action`, `entity_type`, `entity_id`, `performed_by` (UUID), `details` (JSONB), `ip_address`, `created_at`.
* **RLS & Policies:** Solo administradores pueden consultar; INSERT permitido a triggers y RPCs con `SECURITY DEFINER`.

### 6.11 `winners`
* **Propósito:** Registro oficial e inmutable del ganador del sorteo.
* **Columnas:** `id` (UUID, PK), `raffle_id` (FK CASCADE), `order_id` (FK CASCADE), `buyer_id` (FK CASCADE), `ticket_id` (FK SET NULL), `ticket_number`, `lottery_draw_number`, `draw_date`, `official_act_url`, `delivery_photos`, `notes`, `registered_by`, `created_at`, `updated_at`.
* **RLS & Policies:** SELECT público; ALL solo administradores autenticados.

### 6.12 `partners`
* **Propósito:** Directorio de aliados estratégicos y comercios turísticos locales.
* **Columnas:** `id` (UUID, PK), `name`, `slug` (UNIQUE), `category`, `description`, `logo_url`, `website_url`, `phone`, `address`, `display_order`, `is_active`, `created_at`, `updated_at`.
* **Triggers:** `trg_partners_updated_at`.
* **RLS & Policies:** SELECT público de activos; ALL para administradores.

### 6.13 `prize_settings`
* **Propósito:** Configuración central del paquete de premios y tour oficial de la rifa.
* **Columnas:** `id` (TEXT, PK, default 'main'), `title`, `subtitle`, `badge_text`, `official_tour_badge`, `official_tour_title`, `official_tour_subtitle`, `official_tour_features` (JSONB), `updated_at`.
* **Triggers:** `trg_prize_settings_updated_at`.
* **RLS & Policies:** SELECT público; ALL para admin.

### 6.14 `prize_experiences`
* **Propósito:** Tarjetas de experiencias detalladas que componen el paquete turístico (cuatrimotos, parapente, glamping, etc.).
* **Columnas:** `id` (UUID, PK), `prize_id` (TEXT, default 'main'), `title`, `description`, `image_url`, `badge_text`, `display_order`, `is_active`, `created_at`, `updated_at`.
* **Triggers:** `trg_prize_experiences_updated_at`.
* **RLS & Policies:** SELECT público; ALL para admin.

### 6.15 `faq_items`
* **Propósito:** Repositorio dinámico de preguntas y respuestas frecuentes.
* **Columnas:** `id` (UUID, PK), `question`, `answer`, `sort_order` (INT), `is_published` (BOOL), `created_at`, `updated_at`.
* **RLS & Policies:** SELECT público (`is_published = true`); ALL para admin.

### 6.16 `gallery_items`
* **Propósito:** Catálogo fotográfico del destino turístico Manaure Balcón del Cesar.
* **Columnas:** `id` (UUID, PK), `raffle_id` (FK SET NULL), `category` (TEXT), `title`, `description`, `image_url`, `thumbnail_url`, `display_order`, `is_active`, `created_at`, `updated_at`.
* **RLS & Policies:** SELECT público (`is_active = true`); ALL para admin.

### 6.17 `gallery_categories`
* **Propósito:** Taxonomía y ordenamiento dinámico de categorías para el filtrado de la galería.
* **Columnas:** `id` (UUID, PK), `slug` (TEXT, UNIQUE), `name` (TEXT), `display_order` (INT), `is_active` (BOOL), `created_at`, `updated_at`.
* **Triggers:** `trg_gallery_categories_updated_at`.
* **RLS & Policies:** SELECT público (`is_active = true`); ALL para admin.

---

# 7. MATRIZ DE INTEGRIDAD REFERENCIAL Y REGLAS ON DELETE

| Relación | Llave Foránea | Regla ON UPDATE | Regla ON DELETE | Evaluación de Riesgo |
|---|---|---|---|---|
| `orders` → `raffles` | `orders.raffle_id` → `raffles.id` | NO ACTION | **RESTRICT** | **SEGURO:** Impide borrar una rifa si tiene órdenes registradas. |
| `orders` → `buyers` | `orders.buyer_id` → `buyers.id` | NO ACTION | **RESTRICT** | **SEGURO:** Impide borrar un comprador si tiene órdenes de compra. |
| `tickets` → `raffles` | `tickets.raffle_id` → `raffles.id` | NO ACTION | **CASCADE** | **ACEPTABLE:** Si se elimina la rifa (sin órdenes), se purgan sus boletos. |
| `tickets` → `orders` | `tickets.order_id` → `orders.id` | NO ACTION | **SET NULL** | **RIESGO (DB-09):** Si una orden se eliminara, los boletos conservan su status (`sold` o `reserved`) pero pierden el vínculo a la orden. |
| `tickets` → `buyers` | `tickets.buyer_id` → `buyers.id` | NO ACTION | **SET NULL** | **ACEPTABLE:** Mantiene trazabilidad desacoplada. |
| `payment_proofs` → `orders` | `payment_proofs.order_id` → `orders.id` | NO ACTION | **CASCADE** | **SEGURO:** El comprobante depende existencialmente de la orden. |
| `payment_proofs` → `buyers` | `payment_proofs.buyer_id` → `buyers.id` | NO ACTION | **CASCADE** | **SEGURO:** |
| `winners` → `raffles` | `winners.raffle_id` → `raffles.id` | NO ACTION | **CASCADE** | **SEGURO:** |
| `winners` → `orders` | `winners.order_id` → `orders.id` | NO ACTION | **CASCADE** | **RIESGO:** Si una orden pagada fuese eliminada, se borraría el ganador histórico. (Protegido por RESTRICT en `orders.raffle_id`). |
| `winners` → `buyers` | `winners.buyer_id` → `buyers.id` | NO ACTION | **CASCADE** | **RIESGO:** El borrado de un comprador purgaría el registro de ganador. |
| `winners` → `tickets` | `winners.ticket_id` → `tickets.id` | NO ACTION | **SET NULL** | **SEGURO:** Si el registro físico del ticket sufriera mutación, el ganador conserva el campo denormalizado `ticket_number`. |
| `admin_users` → `auth.users` | `admin_users.user_id` → `auth.users.id` | NO ACTION | **CASCADE** | **SEGURO:** Eliminar el usuario de Supabase Auth revoca automáticamente el perfil admin. |

---

# 8. AUDITORÍA DE INVARIANTES DE NEGOCIO (18 REGLAS)

Evaluación exhaustiva de las 18 reglas de negocio contra los constraints, triggers y RPCs reales de PostgreSQL:

| Invariante de Negocio | ¿La BD lo impide físicamente? | Mecanismo de Control | Veredicto & Brecha Técnica |
|---|---|---|---|
| **1. Boleto duplicado dentro de una rifa** | **SÍ** | `CONSTRAINT unique_ticket_per_raffle UNIQUE (raffle_id, number)` | **CUMPLIDO:** Físicamente imposible duplicar números en la misma rifa. |
| **2. Boleto vendido dos veces** | **PARCIALMENTE** | Trigger `fn_validate_ticket_status_transition` | **BRECHA (DB-07):** Si un boleto ya está en `sold` y se ejecuta un UPDATE cambiando `order_id` o `buyer_id`, la regla `IF OLD.status = NEW.status THEN RETURN NEW;` permite la reasignación silenciosa sin validar nada. |
| **3. Boleto reservado para dos órdenes simultáneas** | **SÍ (vía RPC)** | Bloqueo pesimista `FOR UPDATE` en `create_order_secure` | **CUMPLIDO:** Dos transacciones concurrentes se serializan; la segunda detecta que el boleto ya no está en `available` y aborta. |
| **4. Orden sin rifa asociada** | **SÍ** | `orders.raffle_id UUID NOT NULL REFERENCES raffles(id)` | **CUMPLIDO:** Constraint NOT NULL y Foreign Key obligatoria. |
| **5. Orden sin comprador asociado** | **SÍ** | `orders.buyer_id UUID NOT NULL REFERENCES buyers(id)` | **CUMPLIDO:** Constraint NOT NULL y Foreign Key obligatoria. |
| **6. Orden con boletos de otra rifa** | **SÍ (vía RPC)** | Filtro estricto `WHERE raffle_id = p_raffle_id` en `create_order_secure` | **CUMPLIDO en RPC**, pero no impedido por constraint a nivel de esquema (falta composite FK). |
| **7. Boleto de otra rifa dentro de una orden** | **NO a nivel DDL** | Falta Foreign Key compuesta | **BRECHA (DB-08):** `tickets.order_id` referencia `orders.id` sin validar que `tickets.raffle_id = orders.raffle_id`. |
| **8. Total monetario de orden incorrecto** | **SÍ (vía RPC)** | Cálculo en servidor: `v_raffle.ticket_price * v_ticket_count` | **CUMPLIDO:** El cliente no puede inyectar el monto; se calcula leyendo directamente el precio de la rifa en la BD. |
| **9. Cantidad de boletos inconsistente** | **SÍ (vía RPC)** | Array length: `COALESCE(array_length(p_ticket_numbers, 1), 0)` | **CUMPLIDO en creación**. Sin embargo, la tabla no tiene un CHECK que fuerce `ticket_count = count(tickets de la orden)`. |
| **10. Número de boleto fuera de rango** | **NO a nivel DDL** | La generación la hace `generate_tickets_for_raffle` | **BRECHA:** No existe un CHECK en `tickets.number` que impida insertar manualmente un número fuera del rango de la rifa. |
| **11. Estado imposible en órdenes o boletos** | **PARCIALMENTE** | CHECK constraints `tickets_status_check` y `orders_status_check` | **BRECHA (DB-11):** Las columnas `status` en ambas tablas admiten valores `NULL` a nivel de DDL (`is_nullable = YES`). En PostgreSQL, `NULL = ANY(...)` evalúa a NULL y pasa el CHECK constraint. |
| **12. Boleto confirmado sin orden válida** | **SÍ** | Trigger `fn_validate_ticket_status_transition` | **CUMPLIDO:** Lanza excepción si `NEW.status = 'sold'` y `NEW.order_id IS NULL` o la orden no está en `paid` o `completed`. |
| **13. Orden aprobada sin boletos asociados** | **NO** | RPC `approve_order_payment` | **BRECHA (DB-10):** Si una orden en `pending` no tiene boletos asociados, `approve_order_payment` la aprueba igualmente pasando a `paid`. |
| **14. Orden rechazada manteniendo boletos confirmados** | **SÍ** | Trigger `fn_validate_order_status_transition` | **CUMPLIDO:** Bloquea la transición si la orden ya estaba en `paid`, y libera boletos si estaba pendiente. |
| **15. Boleto disponible con `reservation_expires_at` activo** | **SÍ** | Trigger `fn_validate_ticket_status_transition` | **CUMPLIDO:** Si `NEW.status = 'available'`, el trigger limpia forzosamente `reserved_at` y `reservation_expires_at` a `NULL`. |
| **16. Boleto reservado sin fecha de expiración** | **NO** | Trigger `fn_validate_ticket_status_transition` | **BRECHA:** El trigger no exige `NEW.reservation_expires_at IS NOT NULL` cuando `NEW.status = 'reserved'`. |
| **17. Boleto vendido que vuelve a `available`** | **NO** | Trigger `fn_validate_ticket_status_transition` | **BRECHA (DB-06):** No existe ninguna regla que prohíba la transición de `sold` a `available`. Si se ejecuta un UPDATE, el trigger limpia los campos y vuelve a poner el boleto a la venta. |
| **18. Ganador que no corresponde a un boleto elegible** | **SÍ** | RPC `register_winner` | **CUMPLIDO:** La RPC verifica que el boleto exista en la rifa, que su estado sea estrictamente `sold`, y que tenga orden y comprador válidos. |

---

# 9. AUDITORÍA DE TIPOS MONETARIOS Y CÁLCULOS

### 9.1 Almacenamiento en Base de Datos
* **`raffles.ticket_price`**: `NUMERIC(12, 2) NOT NULL CHECK (ticket_price > 0)`.
* **`orders.total_amount`**: `NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0)`.
* **Veredicto:** Excelente práctica. No se utilizan tipos de coma flotante (`FLOAT`, `DOUBLE PRECISION`, `REAL`), lo que elimina cualquier riesgo de errores de redondeo binario IEEE 754 en la base de datos. La precisión de 12 dígitos con 2 decimales permite gestionar hasta $9.999.999.999,99 COP.

### 9.2 Cálculo del Importe (Fuente de Verdad)
* En `create_order_secure`:
  ```sql
  v_total_amount := v_raffle.ticket_price * v_ticket_count;
  ```
* **Veredicto:** El total se calcula exclusivamente en el motor PostgreSQL utilizando el precio oficial de la rifa obtenido de la fila bloqueada. Es completamente imposible que un atacante manipule el total desde las herramientas de desarrollador del navegador.

### 9.3 Formateo en Frontend
* En `src/lib/utils.ts`:
  ```typescript
  export function formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(amount);
  }
  ```
* **Veredicto:** Adecuado para Colombia. El Peso Colombiano (COP) no utiliza centavos en el comercio minorista. El frontend oculta los decimales (`maximumFractionDigits: 0`), mientras que la base de datos conserva la precisión contable de dos decimales (`.00`).

---

# 10. CATÁLOGO COMPLETO DE HALLAZGOS Y VULNERABILIDADES

---

### [DB-01] [CRÍTICA] Corrupción de Boletos Reservados Ajenos en Aprobación y Rechazo de Pagos
* **Archivo:** `supabase/migrations/014_harden_admin_payment_rpcs.sql` (Líneas 63 y 117)
* **Funciones:** `public.approve_order_payment(p_order_id UUID)` y `public.reject_order_payment(p_order_id UUID, p_reason TEXT)`
* **Tabla/RPC:** `tickets`, `orders` / `approve_order_payment`, `reject_order_payment`
* **Problema:** La sentencia de actualización de boletos incluye la cláusula disyuntiva:
  `WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved')`
* **Evidencia:**
  ```sql
  -- En approve_order_payment:
  UPDATE public.tickets
  SET status = 'sold', reservation_expires_at = NULL, updated_at = NOW()
  WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

  -- En reject_order_payment:
  UPDATE public.tickets
  SET status = 'available', buyer_id = NULL, order_id = NULL, reserved_at = NULL, reservation_expires_at = NULL, updated_at = NOW()
  WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');
  ```
* **Impacto:** Si un comprador realiza una compra (Orden 1, boleto 10) y posteriormente inicia otra compra que queda pendiente (Orden 2, boleto 20):
  1. Si el admin aprueba la Orden 1, el boleto 20 se marca como `sold` sin que la Orden 2 haya sido pagada.
  2. Si el admin rechaza la Orden 1, el boleto 20 se libera a `available`, destruyendo la reserva legítima de la Orden 2.
* **Condición para Reproducirlo:**
  1. Comprador A crea Orden 1 con boleto '100'.
  2. Comprador A crea Orden 2 con boleto '200'.
  3. Admin ejecuta `SELECT approve_order_payment('id-orden-1');`.
  4. Consultar boleto '200': su estado cambió a `sold`.
* **Recomendación:** Eliminar la cláusula `OR` y limitar la condición estrictamente a la orden procesada:
  ```sql
  WHERE order_id = p_order_id;
  ```

---

### [DB-02] [CRÍTICA] Desconexión de Supabase Realtime para `tickets` y `orders` en Producción
* **Archivo:** `supabase/migrations/018_enable_supabase_realtime.sql`
* **Objeto:** `pg_publication_tables` / publicación `supabase_realtime`
* **Problema:** La publicación `supabase_realtime` no tiene agregadas las tablas `tickets` ni `orders` (`rows: []`).
* **Evidencia:**
  ```sql
  SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
  -- Resultado en la base de datos viva: 0 filas.
  ```
* **Impacto:** Los clientes web que escuchan cambios mediante `supabase.channel('public:tickets')` nunca reciben eventos de actualización en tiempo real cuando otro usuario compra o reserva un número. Los usuarios ven números desactualizados a menos que recarguen la página.
* **Condición para Reproducirlo:**
  1. Abrir la página principal en dos navegadores distintos.
  2. En el Navegador A, reservar un boleto.
  3. En el Navegador B, el boleto permanece como disponible sin cambiar a reservado.
* **Recomendación:** Activar el toggle de Realtime para `tickets` y `orders` en el Dashboard de Supabase (*Database > Publications > supabase_realtime*), o ejecutar con permisos de superusuario del proyecto:
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets, public.orders;
  ```

---

### [DB-03] [ALTA] Fallo de Permisos RLS Bloqueante en `notification_logs`
* **Archivo:** `supabase/migrations/007_transactional_notification_logs.sql` (Línea 45)
* **Tabla/Policy:** `notification_logs` / Política *"Compradores pueden ver logs de sus órdenes"*
* **Problema:** La política evalúa `LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))`. El rol `authenticated` no tiene privilegios de lectura sobre el esquema interno `auth.users`.
* **Evidencia:** Al ejecutar cualquier consulta sobre `notification_logs` con un token de usuario autenticado:
  ```json
  {"code":"42501","details":null,"hint":"Grant the required privileges to the current role with: GRANT SELECT ON auth.users TO authenticated;","message":"permission denied for table users"}
  ```
* **Impacto:** Cualquier consulta a través de PostgREST o la librería del cliente falla inmediatamente con error de base de datos 42501.
* **Condición para Reproducirlo:**
  1. Iniciar sesión en el frontend o generar JWT de usuario.
  2. Ejecutar `supabase.from('notification_logs').select('*')`.
* **Recomendación:** Reemplazar la subconsulta a `auth.users` por la lectura directa del JWT claims:
  ```sql
  DROP POLICY IF EXISTS "Compradores pueden ver logs de sus órdenes" ON public.notification_logs;
  CREATE POLICY "Compradores pueden ver logs de sus órdenes" ON public.notification_logs
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.orders o
          JOIN public.buyers b ON b.id = o.buyer_id
          WHERE o.id = notification_logs.order_id
            AND LOWER(b.email) = LOWER(auth.jwt() ->> 'email')
        )
      );
  ```

---

### [DB-04] [ALTA] Monolito de Despliegue Incompleto y con Fallo de Secuencia
* **Archivo:** `supabase/migrations/EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql`
* **Líneas:** 7277-7650
* **Problema:** Omite las migraciones 025, 028 (ambas), 029, 030 y 031. Además, concatena la migración 033 antes de la 032.
* **Evidencia:**
  * En la línea 7566 se ejecuta `ALTER TABLE public.prize_settings ...`.
  * La tabla `prize_settings` se crea en la migración 031, la cual fue omitida.
* **Impacto:** Si un desarrollador o proceso de CI/CD intenta aprovisionar una base de datos nueva utilizando este archivo, el proceso falla con error fatal y la base de datos queda a medio migrar.
* **Recomendación:** Archivar o eliminar este archivo monolítico del repositorio para evitar que sea ejecutado por error, y utilizar exclusivamente la secuencia estándar de Supabase CLI (`supabase db push` o `supabase migration up`).

---

### [DB-05] [MEDIA] Ambigüedad y No Determinismo por Prefijo Duplicado `028_`
* **Archivos:**
  * `supabase/migrations/028_fix_public_payment_accounts_and_is_admin_grant.sql`
  * `supabase/migrations/028_flexible_raffle_emission.sql`
* **Problema:** Dos archivos de migración independientes comparten exactamente el mismo número secuencial.
* **Impacto:** Dependiendo del sistema operativo, el locale y la herramienta de migración utilizada, el orden de aplicación puede invertirse de forma impredecible.
* **Recomendación:** Renombrar la segunda migración a un número único e inequívoco (ejemplo: `028_fix_...` y `029_flexible_raffle_emission.sql`, desplazando las subsecuentes).

---

### [DB-06] [MEDIA] Ausencia de Protección contra Reversión de Boletos Vendidos a Disponibles
* **Archivo:** `supabase/migrations/004_normalize_order_ticket_state_machine.sql` (Línea 80)
* **Trigger / Función:** `trg_validate_ticket_status` / `fn_validate_ticket_status_transition()`
* **Problema:** La función del trigger no contiene ninguna cláusula que impida la transición `sold` → `available`.
* **Evidencia:**
  ```sql
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status = 'sold' THEN ... END IF;
  IF NEW.status = 'available' THEN
      NEW.reserved_at := NULL;
      NEW.reservation_expires_at := NULL;
      NEW.buyer_id := NULL;
      NEW.order_id := NULL;
  END IF;
  ```
* **Impacto:** Si un administrador o un script ejecuta un `UPDATE tickets SET status = 'available' WHERE number = '...' `, la base de datos lo permite sin objeción, borrando al comprador y a la orden del boleto, pudiendo revender un número que ya había sido pagado.
* **Recomendación:** Agregar en `fn_validate_ticket_status_transition()`:
  ```sql
  IF OLD.status = 'sold' AND NEW.status <> 'sold' THEN
      RAISE EXCEPTION 'Violación de Integridad: Un boleto vendido definitivamente (número %) no puede cambiar de estado ni volver a estar disponible.', OLD.number;
  END IF;
  ```

---

### [DB-07] [MEDIA] Reasignación Silenciosa de Boletos Vendidos (`OLD.status = NEW.status`)
* **Archivo:** `supabase/migrations/004_normalize_order_ticket_state_machine.sql` (Línea 65)
* **Trigger / Función:** `trg_validate_ticket_status` / `fn_validate_ticket_status_transition()`
* **Problema:** La cláusula de escape rápido `IF OLD.status = NEW.status THEN RETURN NEW; END IF;` omite toda validación si el estado no cambia.
* **Impacto:** Si un boleto está en `sold` asignado al Comprador 1 y a la Orden 1, y se ejecuta:
  ```sql
  UPDATE tickets SET buyer_id = 'comprador-2', order_id = 'orden-2' WHERE id = '...';
  ```
  Como `OLD.status ('sold') = NEW.status ('sold')`, el trigger retorna `NEW` inmediatamente, permitiendo transferir el boleto vendido a otra persona u orden sin ninguna validación ni alerta.
* **Recomendación:** Verificar si el boleto ya está vendido e impedir cambios en `buyer_id` u `order_id`:
  ```sql
  IF OLD.status = 'sold' AND (OLD.buyer_id IS DISTINCT FROM NEW.buyer_id OR OLD.order_id IS DISTINCT FROM NEW.order_id) THEN
      RAISE EXCEPTION 'Violación de Integridad: No se puede reasignar el comprador ni la orden de un boleto vendido.';
  END IF;
  ```

---

### [DB-08] [MEDIA] Falta de Integridad Referencial Compuesta entre `tickets` y `orders`
* **Archivo:** `supabase/migrations/001_initial_schema.sql`
* **Tabla:** `tickets`
* **Problema:** `tickets.order_id` tiene una llave foránea simple hacia `orders.id`, pero no está vinculada a `raffle_id`.
* **Impacto:** Es técnicamente posible que un boleto de la Rifa A quede asociado al `id` de una orden perteneciente a la Rifa B si se manipula directamente mediante SQL o una función defectuosa.
* **Recomendación:** Agregar un constraint de clave única compuesta en `orders(id, raffle_id)` y definir la llave foránea en `tickets` como:
  ```sql
  ALTER TABLE public.orders ADD CONSTRAINT uq_orders_id_raffle UNIQUE (id, raffle_id);
  ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_order_raffle FOREIGN KEY (order_id, raffle_id) REFERENCES public.orders(id, raffle_id);
  ```

---

### [DB-09] [MEDIA] Regla `ON DELETE SET NULL` en `tickets.order_id` Deja Boletos Inconsistentes
* **Archivo:** `supabase/migrations/001_initial_schema.sql`
* **Tabla:** `tickets`
* **Problema:** La llave foránea `tickets_order_id_fkey` define `ON DELETE SET NULL`.
* **Impacto:** Si una orden fuese eliminada físicamente de la base de datos, los boletos que le pertenecían pasarán a tener `order_id = NULL`, pero su columna `status` mantendrá el valor `sold` o `reserved`. La tabla quedará con boletos vendidos sin orden asociada.
* **Recomendación:** Modificar la regla de la FK a `ON DELETE RESTRICT` para prohibir la eliminación de órdenes que tengan boletos vinculados:
  ```sql
  ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_order_id_fkey;
  ALTER TABLE public.tickets ADD CONSTRAINT tickets_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;
  ```

---

### [DB-10] [MEDIA] Aprobación de Órdenes Huérfanas (Sin Boletos Asociados)
* **Archivo:** `supabase/migrations/014_harden_admin_payment_rpcs.sql`
* **Función:** `public.approve_order_payment`
* **Problema:** La función no comprueba si la orden tiene al menos un boleto asociado antes de aprobarla.
* **Impacto:** Si una orden en estado `pending` pierde sus boletos (por ejemplo, debido a una cancelación o expiración previa defectuosa) y un administrador la aprueba, la orden pasa a estado `paid`, se registran ingresos contables en el dashboard, pero ningún boleto es emitido ni vendido al cliente.
* **Recomendación:** Validar la cantidad de boletos actualizados o asociados antes de confirmar la aprobación:
  ```sql
  IF v_updated_tickets_count = 0 THEN
      RAISE EXCEPTION 'No se puede aprobar una orden que no tiene boletos asociados.';
  END IF;
  ```

---

### [DB-11] [BAJA] Columnas `status` Nullables a Nivel DDL en `tickets` y `orders`
* **Archivos:** `001_initial_schema.sql`, `004_normalize_order_ticket_state_machine.sql`
* **Tablas:** `tickets.status`, `orders.status`
* **Problema:** Ambas columnas fueron creadas como `status VARCHAR(...) DEFAULT '...'` sin la restricción `NOT NULL`.
* **Impacto:** En el estándar SQL de PostgreSQL, una condición `CHECK (status IN ('...'))` evalúa a NULL si la columna es NULL, pasando la validación con éxito. Aunque las aplicaciones suelen confiar en los defaults, un insert explícito con `status = NULL` es aceptado por la base de datos, corrompiendo las máquinas de estado.
* **Recomendación:**
  ```sql
  ALTER TABLE public.tickets ALTER COLUMN status SET NOT NULL;
  ALTER TABLE public.orders ALTER COLUMN status SET NOT NULL;
  ```

---

### [DB-12] [MEDIA] Buckets de Storage Huérfanos en Migraciones SQL
* **Archivos:** `021_winners_management.sql`, `025_partners_management.sql`, `031_prize_management.sql`
* **Objetos:** Buckets `winner-documents`, `partner-logos`, `prize-images`
* **Problema:** Las migraciones aprovisionaron buckets en Supabase Storage, pero la arquitectura del frontend sube todos estos archivos directamente a Cloudinary mediante la Edge Function `cloudinary-sign`.
* **Evidencia:** En la base de datos viva, la tabla `storage.buckets` únicamente contiene `payment-proofs`, `gallery-images` y `receipts`. Los otros tres buckets nunca fueron creados o quedaron desiertos.
* **Recomendación:** Documentar formalmente la arquitectura híbrida en la guía del proyecto y purgar del código las políticas RLS huérfanas que apuntan a buckets no utilizados.

---

### [DB-13] [BAJA] Tipado TypeScript Expone RPCs Inexistentes
* **Archivo:** `src/types/database.types.ts` (Líneas 774-802)
* **Funciones Tipadas:** `confirm_order_payment`, `submit_order_receipt`
* **Problema:** Ambas funciones fueron eliminadas formalmente en la migración 023 mediante `DROP FUNCTION`.
* **Impacto:** Sugerencia engañosa en el autocompletado de TypeScript en el frontend. (Ningún servicio frontend las llama actualmente).
* **Recomendación:** Regenerar `database.types.ts` directamente desde el esquema vivo de Supabase usando `npx supabase gen types typescript --linked`.

---

### [DB-14] [MEDIA] Política de UPDATE en `orders` Permite Modificaciones a Usuarios Autenticados
* **Archivo:** `supabase/migrations/013_restrict_orders_select_and_public_verification_rpc.sql`
* **Tabla/Policy:** `orders` / `"Compradores pueden adjuntar comprobante a su orden"`
* **Problema:** La política define:
  ```sql
  FOR UPDATE TO public USING (status IN ('pending', 'pending_verification'))
  ```
* **Impacto:** Aunque `anon` no tiene el grant de UPDATE a nivel de tabla, cualquier usuario con una sesión válida (`authenticated`) podría teóricamente enviar un `UPDATE orders SET ...` sobre cualquier orden ajena que esté en `pending`, ya que no se valida propiedad por JWT ni clave de acceso.
* **Recomendación:** Restringir las mutaciones de comprobante exclusivamente a la RPC `submit_payment_proof` con `SECURITY DEFINER`, y eliminar el permiso directo de UPDATE a roles públicos sobre la tabla `orders`.

---

### [DB-15] [BAJA] Falta de Constraint Único para Evitar Registro Múltiple del Mismo Ganador
* **Archivo:** `supabase/migrations/021_winners_management.sql`
* **Tabla:** `winners`
* **Problema:** La tabla `winners` no tiene un índice o constraint `UNIQUE (raffle_id, ticket_number)`.
* **Impacto:** Si un administrador pulsa dos veces el botón de registro o se invoca la RPC en paralelo, se pueden insertar registros duplicados para el mismo boleto premiado.
* **Recomendación:**
  ```sql
  ALTER TABLE public.winners ADD CONSTRAINT uq_winners_raffle_ticket UNIQUE (raffle_id, ticket_number);
  ```

---

### [DB-16] [BAJA] Parámetro Cosmético en `is_admin(p_user_id UUID)`
* **Archivo:** `supabase/migrations/029_harden_is_admin_security_definer.sql`
* **Función:** `public.is_admin(p_user_id UUID DEFAULT auth.uid())`
* **Problema:** El cuerpo de la función declara:
  ```sql
  v_uid := auth.uid();
  ```
  Ignorando completamente el parámetro `p_user_id`.
* **Impacto:** Aunque se diseñó deliberadamente como medida de hardening contra enumeración de roles, conservar el parámetro en la firma genera confusión al programador, ya que invocar `is_admin('otro-uuid')` devolverá el rol del usuario que ejecuta la consulta, no el del UUID pasado.
* **Recomendación:** Crear una sobrecarga limpia `is_admin()` sin argumentos y marcar la función con argumentos como obsoleta.

---

# 11. MATRIZ RESUMEN DE HALLAZGOS Y ACCIONES RECOMENDADAS

| ID | Severidad | Objeto / Archivo | Resumen del Problema | Acción Recomendada |
|:---:|:---:|---|---|---|
| **DB-01** | 🔴 CRÍTICA | `approve_order_payment` / `reject_order_payment` | Cláusula `OR buyer_id = ...` altera boletos de otras órdenes del mismo comprador. | Corregir cláusula a `WHERE order_id = p_order_id;`. |
| **DB-02** | 🔴 CRÍTICA | Publicación `supabase_realtime` | Publicación vacía; `tickets` y `orders` no sincronizan en tiempo real por WebSocket. | Agregar tablas a la publicación de replicación en Supabase. |
| **DB-03** | 🟠 ALTA | `notification_logs` RLS Policy | Subconsulta a `auth.users` arroja error 42501 al rol `authenticated`. | Reemplazar por lectura de claims con `auth.jwt() ->> 'email'`. |
| **DB-04** | 🟠 ALTA | `EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` | Omite 5 migraciones e invierte 033 antes de 032; falla en bases limpias. | Archivar / no utilizar este archivo consolidado. |
| **DB-05** | 🟡 MEDIA | Migraciones `028_...` (Duplicadas) | Dos archivos comparten prefijo `028_`, generando orden no determinista. | Renombrar formalmente para fijar orden cronológico unívoco. |
| **DB-06** | 🟡 MEDIA | Trigger `fn_validate_ticket_status_transition` | Permite transición no autorizada de `sold` a `available`. | Bloquear en el trigger cualquier mutación desde `sold`. |
| **DB-07** | 🟡 MEDIA | Trigger `fn_validate_ticket_status_transition` | Permite cambiar `buyer_id` u `order_id` de un boleto vendido si el status no cambia. | Impedir cambios de comprador/orden si `OLD.status = 'sold'`. |
| **DB-08** | 🟡 MEDIA | Tabla `tickets` | Falta llave foránea compuesta `(order_id, raffle_id)`. | Crear composite FK para blindar consistencia de rifas. |
| **DB-09** | 🟡 MEDIA | `tickets_order_id_fkey` | Regla `ON DELETE SET NULL` deja boletos huérfanos con status `sold`. | Cambiar regla de eliminación a `ON DELETE RESTRICT`. |
| **DB-10** | 🟡 MEDIA | `approve_order_payment` | Permite aprobar órdenes huérfanas que no tienen boletos. | Exigir `v_updated_tickets_count > 0` antes de aprobar. |
| **DB-11** | 🟢 BAJA | `tickets.status` / `orders.status` | Columnas son nullables a nivel DDL (`is_nullable = YES`). | Agregar restricción explícita `NOT NULL`. |
| **DB-12** | 🟡 MEDIA | `storage.buckets` | Buckets declarados en SQL (`partner-logos`, etc.) huérfanos por uso de Cloudinary. | Documentar arquitectura y remover policies innecesarias. |
| **DB-13** | 🟢 BAJA | `database.types.ts` | Expone RPCs eliminadas en migración 023. | Regenerar tipos con Supabase CLI. |
| **DB-14** | 🟡 MEDIA | Policy UPDATE en `orders` | Permite UPDATE directo de comprobante a usuarios autenticados sin validar pertenencia. | Canalizar subidas exclusivamente por la RPC `submit_payment_proof`. |
| **DB-15** | 🟢 BAJA | Tabla `winners` | Falta constraint UNIQUE en `(raffle_id, ticket_number)`. | Agregar constraint UNIQUE para evitar ganadores duplicados. |
| **DB-16** | 🟢 BAJA | Función `is_admin` | Parámetro `p_user_id` es cosmético y se ignora internamente. | Crear firma sin argumentos `is_admin()`. |

---

*Fin del informe de Auditoría 1. Se ha respetado de forma estricta la restricción de CERO modificaciones de código, configuraciones, bases de datos o migraciones.*
