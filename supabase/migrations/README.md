# Guía y Fuente Canónica de Migraciones SQL — Supabase

Este directorio (`supabase/migrations/`) constituye la **única fuente de verdad histórica y evolutiva** del esquema de base de datos PostgreSQL, procedimientos almacenados (RPC), políticas de seguridad por fila (RLS), disparadores (triggers), almacenamiento (Storage) y réplica en tiempo real (Realtime) para la plataforma **Manaure Vive**.

---

## 1. Convención de Nomenclatura y Trazabilidad

1. **Formato Estándar:** Cada migración utiliza un prefijo numérico secuencial de tres dígitos seguido de una descripción concisa en minúsculas separada por guiones bajos:
   ```
   NNN_<descripcion_tecnica>.sql
   ```
2. **Determinismo:** El motor de ordenamiento lexicográfico procesa los archivos en estricto orden alfanumérico (`001`, `002`, ..., `037`).
3. **Nuevas Migraciones:** Cualquier migración subsiguiente debe continuar la serie iniciando en `038_<descripcion_funcional>.sql`.

---

## 2. Inventario Canónico de Migraciones (001 a 037)

| # | Archivo | Alcance Técnico y Objetos de Negocio |
|---|---|---|
| **001** | `001_initial_schema.sql` | Esquema base DDL: tablas `raffles`, `buyers`, `orders`, `tickets`, estados, constraints iniciales y RPCs transaccionales primitivas. |
| **002** | `002_admin_auth.sql` | Infraestructura de administradores: tabla `admin_users`, roles `admin`/`superadmin`, políticas RLS y RPC `is_admin`. |
| **003** | `003_manual_payment_flow.sql` | Flujo de transferencias bancarias manuales: cuentas de recaudo, comprobantes y RPCs transaccionales de pago. |
| **004** | `004_normalize_order_ticket_state_machine.sql` | Normalización formal de máquinas de estado para `orders` (`pending`, `pending_verification`, `paid`, `completed`, `rejected`, `expired`, `cancelled`) y `tickets` (`available`, `reserved`, `sold`, `blocked`). |
| **005** | `005_payment_accounts_management.sql` | Tabla `payment_accounts`, tipologías financieras, RLS y gestión administrativa de cuentas de pago. |
| **006** | `006_payment_proofs_storage_flow.sql` | Bucket de Storage privado `payment-proofs`, políticas de subida pública controlada y lectura restringida. |
| **007** | `007_transactional_notification_logs.sql` | Tabla `notification_logs` para auditoría y trazabilidad transaccional de mensajería (WhatsApp/Email). |
| **008** | `008_order_contact_preference.sql` | Adición del campo `contact_preference` en `orders` para soporte multicanal al comprador. |
| **009** | `009_notification_traceability.sql` | Índices optimizados y metadatos de auditoría sobre `notification_logs`. |
| **010** | `010_admin_ticket_management.sql` | RPCs y políticas para bloqueo manual, liberación y gestión administrativa de boletos individuales. |
| **011** | `011_cron_release_expired_reservations.sql` | Procedimiento y configuración de pg_cron / Edge Function para liberación automática de reservas expiradas. |
| **012** | `012_create_order_secure.sql` | RPC segura `create_order_secure` con bloqueo pesimista `pg_advisory_xact_lock` anti-concurrencia y expiración configurable. |
| **013** | `013_restrict_orders_select_and_public_verification_rpc.sql` | Cierre estricto de lectura RLS en `orders` y provisión de RPC segura de consulta pública por cédula / referencia. |
| **014** | `014_harden_admin_payment_rpcs.sql` | Endurecimiento transaccional de RPCs de aprobación y rechazo de comprobantes con verificación de privilegios. |
| **015** | `015_harden_payment_proofs_storage.sql` | Blindaje de políticas en bucket `payment-proofs` restringiendo descarga y eliminación a administradores. |
| **016** | `016_preserve_buyer_data_on_order_creation.sql` | Preservación idempotente y actualización controlada de datos personales en `buyers` al crear órdenes. |
| **017** | `017_fix_admin_users_rls_recursion.sql` | Corrección de recursión infinita en políticas RLS sobre `admin_users` mediante función desacoplada. |
| **018** | `018_enable_supabase_realtime.sql` | Habilitación de réplica Supabase Realtime sobre tablas operativas (`tickets`, `orders`, `raffles`). |
| **019** | `019_admin_buyer_management.sql` | Vistas administrativas y endpoints de consulta paginada de compradores y su historial. |
| **020** | `020_admin_raffle_management.sql` | RPCs completas para creación, edición, pausa, cierre y emisión masiva de boletos de rifas. |
| **021** | `021_winners_management.sql` | Tabla `winners`, registro oficial de ganadores, publicación transparente y auditoría de sorteos. |
| **022** | `022_system_settings_management.sql` | Tabla `system_settings` clave-valor (TTL de reservas, soporte, URLs) y RPCs de configuración. |
| **023** | `023_security_hardening_linter_fixes.sql` | Saneamiento masivo de linter Supabase: inyección explícita de `search_path`, mitigación de riesgos SECURITY DEFINER. |
| **024** | `024_admin_users_management.sql` | Panel de gestión y aprovisionamiento de administradores por superadministradores. |
| **025** | `025_partners_management.sql` | Tabla `partners`, bucket público `partner-logos` y catálogo de aliados comerciales del Perijá. |
| **026** | `026_dashboard_kpis_rpc.sql` | RPC `get_dashboard_kpis` para agregación nativa PostgreSQL en tiempo constante O(1). |
| **027** | `027_dashboard_kpis_robust_filter.sql` | Mejora de filtros por `raffle_id` y resiliencia en métricas operativas del panel administrativo. |
| **028a** | `028_fix_public_payment_accounts_and_is_admin_grant.sql` | **(Secuencia 028.1)** Grants de ejecución en `is_admin`, RLS en `payment_accounts` y `REPLICA IDENTITY FULL`. |
| **028b** | `028_flexible_raffle_emission.sql` | **(Secuencia 028.2)** Flexibilización de emisión total de boletos y cálculo dinámico de relleno LPAD en `admin_create_raffle`. |
| **029** | `029_harden_is_admin_security_definer.sql` | Endurecimiento anti-enumeración de usuarios privilegiados en `is_admin` vinculando a `auth.uid()`. |
| **030** | `030_remove_resend_email_id.sql` | Eliminación estructural de columna redundante `resend_email_id` en tabla `orders`. |
| **031** | `031_prize_management.sql` | Tablas base `prize_settings` y `prize_experiences` para la administración dinámica del plan de premios. |
| **032** | `032_faq_items.sql` | Tabla `faq_items`, índices de ordenamiento, RLS de lectura pública y semillas de contenido iniciales. |
| **033** | `033_prize_official_details_and_image_sync.sql` | Adición de campos para premio mayor oficial (banner, características JSONB) y sincronización de imágenes. |
| **034** | `034_faq_admin_policies.sql` | Políticas RLS administrativas completas para creación, edición y borrado de preguntas frecuentes. |
| **035** | `035_gallery_management.sql` | Tabla `gallery_items`, bucket `gallery-images`, políticas RLS y semillas fotográficas de alta resolución. |
| **036** | `036_gallery_categories.sql` | Tabla `gallery_categories`, gestión dinámica de categorías de galería fotográfica con RLS y ordenamiento. |
| **037** | `037_fix_approve_reject_order_payment_scoping.sql` | **(DB-01 / DB-10)** Corrección transaccional de `approve_order_payment` y `reject_order_payment`: acotación estricta a `WHERE order_id = p_order_id`, bloqueo pesimista `FOR UPDATE`, validación de existencia de boletos y coherencia de recuento. |
| **038** | `038_harden_ticket_order_structural_integrity.sql` | **(DB-06 / DB-07 / DB-08 / DB-09 / DB-11)** Fortalecimiento de integridad estructural: irreversibilidad de boletos vendidos, inmutabilidad de titularidad en `sold`, FK compuesta `(order_id, raffle_id)` con `ON DELETE RESTRICT`, `status NOT NULL` en `tickets` y `orders`, restricciones CHECK de estados y triggers `BEFORE UPDATE` sin omisión de columnas. |
| **039** | `039_harden_rls_orders_and_notification_logs.sql` | **(DB-03 / DB-14)** Endurecimiento de RLS: eliminación de subconsulta a `auth.users` en `notification_logs` (anti-error 42501), erradicación del UPDATE público genérico en `orders`, políticas administrativas exclusivas vía `is_admin()` y canalización atómica de comprobantes por `submit_payment_proof`. |
| **040** | `040_enable_realtime_for_operational_tables.sql` | **(DB-02)** Habilitación defensiva e idempotente de Supabase Realtime para tablas operativas (`tickets`, `orders`, `raffles`, `winners`, `system_settings`) con control de excepciones y `REPLICA IDENTITY FULL`. |

---

## 3. Resolución Técnica de la Duplicidad de Prefijo 028

En el historial del repositorio existen dos archivos con el prefijo numérico `028`:
1. `028_fix_public_payment_accounts_and_is_admin_grant.sql` (incorporado en commits `cfc380a` / `87d550d`).
2. `028_flexible_raffle_emission.sql` (incorporado en commit `bad2160`).

### Decisión de Conservación (No Destructiva)
- **Causa Histórica:** Ambos archivos ya formaban parte de la historia inmutable de commits del repositorio y fueron aplicados en la base de datos de producción con antelación a las migraciones 029 a 036.
- **Evitación de Drift:** Renombrar `028_flexible_raffle_emission.sql` a un prefijo posterior habría requerido reescribir destructivamente los nombres de hasta 8 migraciones subsecuentes (`029` a `036`), generando incompatibilidad con despliegues existentes.
- **Determinismo:** El orden lexicográfico estándar (`fix` < `fle`) procesa siempre `028_fix...` en primer lugar y `028_flexible...` en segundo lugar, coincidiendo con el orden cronológico real de sus commits.
- **Ortogonalidad:** No existe colisión de objetos DDL entre ambas migraciones. `028_fix...` opera sobre permisos de `is_admin`, RLS de `payment_accounts` y réplicas de Realtime; mientras que `028_flexible...` reemplaza la función `admin_create_raffle`.

---

## 4. Estado de `EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` (DEPRECADO)

El archivo consolidado `EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` es un **artefacto histórico manual incompleto** y se declara formalmente **DEPRECADO**.

> [!WARNING]
> **NO EJECUTAR EN BASES DE DATOS NUEVAS NI EN PRODUCCIÓN:**
> 1. **Omite migraciones críticas:** No incluye `028_fix...`, `028_flexible...`, `029`, `030` ni `031`.
> 2. **Falla fatal en instalaciones limpias:** Al omitir la migración `031_prize_management.sql` (que crea las tablas `prize_settings` y `prize_experiences`), cualquier intento de ejecución limpia falla con error de relación inexistente al ejecutar la migración 033 (`ALTER TABLE public.prize_settings`).
> 3. **Desorden de dependencias:** Incluye la migración 033 antes de la migración 032.
>
> Este archivo se conserva exclusivamente como registro histórico de auditoría.

---

## 5. Protocolo de Aprovisionamiento para Nuevos Entornos

Para configurar una base de datos idéntica a la de producción en un entorno nuevo:
1. Conectar a la base de datos PostgreSQL de Supabase.
2. Ejecutar secuencialmente los 40 archivos numerados (`001_initial_schema.sql` a `040_enable_realtime_for_operational_tables.sql`) en orden alfanumérico.
3. Las herramientas CLI (`supabase db push` o scripts de CI/CD) deben alimentarse directamente de `supabase/migrations/` en orden lexicográfico.
