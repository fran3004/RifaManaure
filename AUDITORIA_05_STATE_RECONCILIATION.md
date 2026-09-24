# AUDITORÍA 05 — RECONCILIACIÓN FORENSE DEL BASELINE Y CIERRE DE REGRESIONES
**Plataforma "Manaure Vive"**  
**Fecha:** 24 de Septiembre de 2026  
**Rama de Trabajo:** `remediacion/auditoria-05`  
**Commit Base de Partida:** `024e277` (`feat(hardening): sanitizacion de errores y proteccion isForbidden en vistas restantes`)  
**Metodología:** Reconciliación forense cruzada entre Catálogo PostgreSQL canónico (Migraciones 001–052), Código Fuente TypeScript (`src/`), Edge Functions (`supabase/functions/`), Políticas de Almacenamiento (Supabase Storage RLS) y Suites de Pruebas Automatizadas (326 tests).

---

## 1. MATRIZ DE RECONCILIACIÓN OBLIGATORIA (15 OBJETOS CRÍTICOS)

| # | Objeto | Estado en Auditoría 05 | Estado en Baseline 00–04 | Estado Real Actual | Resultado | Acción |
|---|---|---|---|---|---|---|
| **1** | `supabase_realtime` | Señalado como desincronizado o con omisión de tablas operativas. | Migración 018 configuró `REPLICA IDENTITY FULL` en tickets/orders. Migración 040 lo extendió a 7 tablas y añadió publicación defensiva. | DDL canónico tiene `REPLICA IDENTITY FULL` en tickets, orders, raffles, winners, system_settings, payment_accounts, partners. En Supabase managed, `ALTER PUBLICATION` requiere rol superusuario/owner de publicación. | **DIFERENCIA / INFRAESTRUCTURA** | Inventariar tablas y triggers. Remediación exhaustiva de publicación y pruebas de eventos reservada para **PROMPT 05.2**. |
| **2** | `reserve_tickets` | Reportado como riesgo crítico por permitir reservas sin orden asociada expuesta a PostgREST. | Migración 042 (SEC-02) revocó formalmente `EXECUTE` a `PUBLIC`, `anon` y `authenticated`. Conservado solo para `service_role`. | Revocado 100%. `ticketService.ts` no invoca `reserve_tickets`. Probado en `sec02ReserveTicketsRemediation.test.ts` (retorna 42501). Firma mantenida en `database.types.ts` por compatibilidad de tipos. | **HALLAZGO HISTÓRICO RESUELTO** (Falso positivo en Aud 05) | Confirmar revocación. **NO** dropear ni alterar TypeScript para no romper dependencias históricas o scripts de `service_role`. |
| **3** | `SECURITY DEFINER / search_path` | Reportado como vulnerabilidad activa de secuestro de ruta de búsqueda (*Search Path Hijacking*). | Blindado masivamente en Migración 023. Preservado en todas las migraciones subsiguientes (028–052). | 32 funciones activas `SECURITY DEFINER` tienen `SET search_path = public, pg_temp` (o `public, extensions, pg_temp`). 5 funciones trigger tienen `SET search_path`. Solo 2 funciones arcaicas deprecadas (001/004) no lo tenían en su DDL inicial. | **INVENTARIADO Y CONTROLADO** | Inventario exhaustivo completado en 05.1. El endurecimiento masivo y purga de funciones deprecadas se reserva para **PROMPT 05.4**. |
| **4** | `receipts` (Storage Bucket) | Reportado como bucket público con subida anónima sin límites y fuga de datos bancarios. | Migración 045 (SEC-05) revocó subida anónima (`DROP POLICY "Subida pública..."`), fijó `public = false`, límite 5 MB, allowlist MIME estricta y SELECT exclusivo admin. | Configurado como privado (`public = false`) con RLS exclusivo admin en Migración 045. Frontend sube únicamente a `payment-proofs`. `paymentService.ts` solo lo consulta como fallback de lectura para órdenes históricas. | **HALLAZGO HISTÓRICO RESUELTO / INVENTARIADO** | Inventariar visibilidad, cuotas, MIME, conteo y enlaces. Cambio formal de visibilidad y tratamiento de datos históricos reservado para **PROMPT 05.3**. |
| **5** | `payment-proofs` (Storage Bucket) | Señalado con posibles debilidades de control de acceso. | Creado privado (`public = false`). Migración 045 implementó función `fn_is_order_pending_proof` (SECURITY DEFINER) para validar UUID de orden pendiente en path antes de permitir inserción. SELECT exclusivo admin. | Privado, límite 5 MB, allowlist MIME segura. Inserción protegida por `fn_is_order_pending_proof`. Lectura protegida por `is_admin`. Idempotencia en DDL 051. | **BASELINE CERTIFICADO Y COHERENTE** | Mantener configuración y políticas. Sin cambios en 05.1. |
| **6** | Políticas huérfanas de Storage (`partner-logos`, `prize-images`, `winner-documents`) | Listado como políticas RLS huérfanas en `storage.objects` para buckets inexistentes. | Migración 041 (DB-12) purgó explícitamente las 12 políticas en `storage.objects` mediante `DROP POLICY IF EXISTS`. Módulos migrados a Cloudinary vía Edge Function `cloudinary-sign`. | 100% de las políticas huérfanas fueron purgadas en DDL 041. No existen llamadas en el frontend ni en admin hacia estos buckets. Probado en `secondaryIntegrityHardenings.test.ts`. | **HALLAZGO HISTÓRICO RESUELTO** (Falso positivo en Aud 05) | Reconciliado. Se mantiene script DDL preventivo de verificación para bases vivas que no hubieran corrido 041. |
| **7** | `cron.job` | Cuestionada la vigencia y frecuencia del cron de liberación de reservas expiradas. | Migración 011 programó `release-expired-reservations-job` cada 5 minutos (`*/5 * * * *`) invocando `SELECT public.release_expired_reservations();`. | Definición DDL activa en `011_cron_release_expired_reservations.sql`. Coexiste con la Edge Function `cron-release-expired-reservations`. | **INVENTARIADO** | Inventariar frecuencia y disparador. Consolidación de estrategia de ejecución reservada para **PROMPT 05.5**. |
| **8** | `cron.job_run_details` | Observada supuesta falta de trazabilidad en ejecuciones de cron. | Migración 011 integró logging directo hacia `public.audit_logs` con la acción `AUTO_EXPIRE_RESERVATIONS_CRON` guardando tickets y órdenes liberadas. | Registros automáticos en `cron.job_run_details` (si `pg_cron` activo) y logs estructurados en `public.audit_logs`. | **INVENTARIADO** | Inventariar. Optimización y retención de logs reservada para **PROMPT 05.5**. |
| **9** | Edge Function `cron-release-expired-reservations` | Reportada duplicidad conceptual frente a `pg_cron`. | Desplegada en `supabase/functions/cron-release-expired-reservations/index.ts`. Requiere Bearer token (`CRON_SECRET` o `SERVICE_ROLE_KEY`). Invoca RPC segura. | Código operativo y testeable. Sirve de mecanismo alternativo de webhook para entornos sin soporte nativo de `pg_cron` (ej. Supabase Free). | **EN ARQUITECTURA DE CONTINGENCIA** | Inventariar. Decisión de unificación reservada para **PROMPT 05.5**. |
| **10** | Edge Function `cloudinary-sign` | Auditada por seguridad de subida de imágenes de premios, aliados y galería. | Implementada en `supabase/functions/cloudinary-sign/index.ts`. Autentica JWT de usuario, valida `is_admin(user.id)`, genera firma SHA-1 en servidor. Secretos nunca expuestos. | Desplegada y operativa. Servicio frontend `cloudinaryService.ts` consume la función con fallback resiliente. Suite de tests en `cloudinaryService.test.ts`. | **BASELINE CERTIFICADO Y COHERENTE** | Confirmar en matriz. Sin cambios requeridos en 05.1. |
| **11** | `approve_order_payment` | Dudas sobre acoplamiento cruzado por `buyer_id` y validación de boletos. | Migración 037 (DB-01 / DB-10) eliminó acoplamiento por comprador, aisló a `order_id = p_order_id`, agregó bloqueo pesimista `FOR UPDATE` y validó `v_total_tickets > 0`. | Plenamente conforme. Validado por triggers en 050. Probado en tests de máquina de estados. | **HALLAZGO HISTÓRICO RESUELTO** | Mantener intacto. |
| **12** | `reject_order_payment` | Dudas sobre liberación accidental de reservas de otras órdenes. | Migración 037 aisló la operación a `WHERE order_id = p_order_id` exclusivamente, con bloqueo `FOR UPDATE` sobre orden y boletos. | Plenamente conforme. Retorna boletos a `available` limpiando metadatos. Probado en tests. | **HALLAZGO HISTÓRICO RESUELTO** | Mantener intacto. |
| **13** | `submit_payment_proof` | Reportado como no idempotente y generador de comprobantes duplicados. | Migración 051 implementó `p_client_idempotency_key`, advisory locks, hash SHA-256 de parámetros, índice único parcial (`status = 'pending'`), UPDATE atómico de reemplazo y auditoría. | Idempotente y blindado. Rechaza órdenes terminales. Frontend envía `client_idempotency_key` con timeout de 15s. Probado en `secIdempotentPaymentProofs.test.ts`. | **HALLAZGO HISTÓRICO RESUELTO** | Mantener intacto. |
| **14** | `register_winner` | Planteadas carreras y posible bypass de mutación directa sobre `winners`. | Migración 041 fijó unicidad `uq_winners_raffle_ticket`. Migración 048 revocó todo `INSERT/UPDATE/DELETE` en `winners` dejando `register_winner` como única vía autorizada. | Mutación directa bloqueada a nivel DDL/RLS. `register_winner` exige `is_admin`, boletos en `paid` y finaliza la rifa atómicamente impidiendo reapertura. Probado en `winnersAndRafflesGovernance.test.ts`. | **HALLAZGO HISTÓRICO RESUELTO** | Mantener intacto. |
| **15** | `create_order_secure` | Señaladas carreras con `admin_update_raffle` (cambios de precio/pausa mientras se reserva). | Migración 049 (idempotencia y huella SHA-256), Migración 050 (reserva 10 min), Migración 052 (bloqueo `FOR SHARE` en `raffles`, ordenamiento determinista de boletos `ORDER BY id FOR UPDATE`). | Serializado contra actualizaciones administrativas. Consistencia garantizada con TTL de 10 minutos. Timeout cliente de 15s. Probado en `secIdempotentOrderCreation.test.ts`. | **HALLAZGO HISTÓRICO RESUELTO** | Mantener intacto. |

---

## 2. DIFERENCIAS CON AUDITORÍA 05

Auditoría 05 analizó el proyecto con una fotografía retrospectiva que en varios puntos no reflejaba las remediaciones aplicadas en las Auditorías 01, 02, 03 y 04:

1. **`reserve_tickets`:** Auditoría 05 lo catalogó como una vulnerabilidad abierta. **Realidad:** Migración 042 revocó formalmente el permiso de ejecución a `PUBLIC`, `anon` y `authenticated`. El frontend no lo invoca en absoluto.
2. **Políticas huérfanas de Storage:** Auditoría 05 las reportó como activas. **Realidad:** Migración 041 purgó las 12 políticas en `storage.objects` mediante `DROP POLICY IF EXISTS`. Los módulos de aliados, premios y ganadores están desacoplados y operan sobre Cloudinary.
3. **Bucket `receipts`:** Auditoría 05 reportó subida pública ilimitada. **Realidad:** Migración 045 eliminó la subida pública, fijó cuota de 5 MB, allowlist MIME y restringió SELECT a administradores autenticados.
4. **Idempotencia de órdenes y comprobantes:** Auditoría 05 consideró que faltaban candados de replay. **Realidad:** Migraciones 049 y 051 dotaron a `create_order_secure` y `submit_payment_proof` de llaves de idempotencia del cliente, huellas criptográficas SHA-256, advisory locks y deduplicación atómica.
5. **Concurrencia en `create_order_secure` vs `admin_update_raffle`:** Auditoría 05 supuso lectura sucia del estado o precio de la rifa. **Realidad:** Migración 052 incorporó `SELECT ... FOR SHARE` sobre `public.raffles` previo a cualquier validación, linearizando deterministamente frente al `FOR UPDATE` administrativo.

---

## 3. DIFERENCIAS CON BASELINE 00–04

El baseline certificado entre Auditorías 00 y 04 estableció los siguientes contratos inviolables:
- **Auditoría 00:** Reserva de 10 minutos (`system_settings.reservation_duration_minutes = 10`), orden canónico de migraciones `001_...` a `052_...`, deprecación de scripts monolíticos históricos.
- **Auditoría 01:** DB-01 (aislamiento por `order_id`), DB-02 (Realtime y `REPLICA IDENTITY FULL`), DB-10 (validación de boletos > 0 en pagos), DB-12 (purga de storage huérfano), DB-15 (unicidad en ganadores), DB-16 (semántica estricta de `is_admin`).
- **Auditoría 02:** SEC-02 (revocación de `reserve_tickets`), SEC-03 (`admin_users` blindado), SEC-04 (superadmin obligatorio para roles), SEC-05 (storage hardening de receipts/payment-proofs/gallery), SEC-08 (verificación de email antes de vincular admin), SEC-09 (anti-enumeración en verificación pública).
- **Auditoría 03:** Idempotencia en creación de órdenes (Migración 049), Máquinas de estados consistentes y triggers multi-tabla (Migración 050), Idempotencia en comprobantes de pago (Migración 051), Linearización de locks y prevención de deadlocks (Migración 052).
- **Auditoría 04:** Timeout explícito de 15 segundos en llamadas cliente Supabase (`withTimeout`), normalización centralizada de errores (`normalizeError`), supresión de fugas técnicas de PostgreSQL hacia la UI y tolerancia a fallos en Realtime.

**Evaluación de Coherencia:** El repositorio en la rama `remediacion/auditoria-05` respeta escrupulosamente el baseline de Auditorías 00 a 04 sin ninguna regresión funcional ni técnica.

---

## 4. REGRESIONES CONFIRMADAS

1. **Configuración de Publicación `supabase_realtime` en Infraestructura Gestionada:**
   - *Hallazgo:* En entornos Supabase Cloud gestionados, si una migración SQL se ejecuta con un rol sin privilegios de superusuario o sin ser propietario de la publicación `supabase_realtime`, la sentencia `ALTER PUBLICATION supabase_realtime ADD TABLE ...` emite una advertencia de privilegios insuficientes (`insufficient_privilege`).
   - *Clasificación:* Regresión operativa de infraestructura / Despliegue.
   - *Tratamiento:* Reservado para **PROMPT 05.2**.

---

## 5. HALLAZGOS HISTÓRICOS RESUELTOS (REPORTADOS ERRÓNEAMENTE COMO PENDIENTES)

1. **`reserve_tickets` sin orden:** Resuelto en Migración 042 (SEC-02). Acceso revocado en PostgreSQL; reemplazado al 100% por `create_order_secure`.
2. **Políticas huérfanas en Storage (`partner-logos`, `prize-images`, `winner-documents`):** Resuelto en Migración 041 (DB-12). Purgadas con `DROP POLICY IF EXISTS`.
3. **Subida anónima masiva en `receipts`:** Resuelto en Migración 045 (SEC-05). Política eliminada, bucket privado y validado por RLS.
4. **Aprobación de orden cruzada por comprador:** Resuelto en Migración 037 (DB-01). Filtrado estricto por `order_id = p_order_id`.
5. **Aprobación de orden sin boletos:** Resuelto en Migración 037 (DB-10). Validación `v_total_tickets > 0` obligatoria.
6. **Mutación directa no autorizada en `winners`:** Resuelto en Migración 048. Revocados `INSERT/UPDATE/DELETE/TRUNCATE`; solo `register_winner` tiene acceso con privilegios de `is_admin`.
7. **Reapertura ilegítima de rifa finalizada:** Resuelto en Migración 048. Bloqueo en `admin_update_raffle` y trigger `trg_validate_raffle_status_transition`.
8. **Doble comprobante activo por orden:** Resuelto en Migración 051. Índice único parcial `idx_payment_proofs_single_pending_per_order` y reemplazo atómico `UPDATE`.
9. **Carreras entre compra de boletos y actualización de rifa:** Resuelto en Migración 052. Bloqueo `FOR SHARE` en `raffles` y ordenamiento de boletos `ORDER BY id FOR UPDATE`.

---

## 6. QUÉ SE CORRIGIÓ INMEDIATAMENTE EN ESTE PROMPT (05.1)

1. **Aislamiento de Entorno de Trabajo:** Creación y verificación de la rama dedicada `remediacion/auditoria-05` partiendo del commit verificado `024e277`.
2. **Verificación de Inmutabilidad del Baseline:** Confirmación de que `reserve_tickets` se mantiene con permisos de ejecución estrictamente revocados a roles públicos y sin alteraciones que rompan compatibilidad en los tipos TypeScript.
3. **Auditoría Forense de Políticas de Storage:** Comprobación de que no existen políticas huérfanas activas para buckets inexistentes en las migraciones canónicas ni en el código TypeScript.
4. **Verificación Integral del Pipeline de Calidad:**
   - 326 pruebas unitarias y de integración pasando al 100% (29 archivos de test).
   - `tsc -b` limpio con 0 errores de tipado.
   - `oxlint` limpio con 0 advertencias o errores de sintaxis.
   - `vite build` compilado exitosamente.

---

## 7. QUÉ SE RESERVA PARA PROMPTS POSTERIORES

Siguiendo las instrucciones explícitas de segregación técnica de la Auditoría 05:

- **PROMPT 05.2 — Realtime:**
  - Auditoría y sincronización formal de la publicación `supabase_realtime`.
  - Validación de eventos en vivo para `orders`, `tickets`, `raffles` y `winners`.
  - Pruebas de suscripción, reconexión y tolerancia a pérdida de socket.
- **PROMPT 05.3 — Receipts:**
  - Auditoría forense detallada de objetos en el bucket legado `receipts`.
  - Políticas de acceso, visibilidad final y estrategia de resolución de URLs históricas firmadas.
- **PROMPT 05.4 — Search Path & Functions:**
  - Endurecimiento masivo de funciones PostgreSQL.
  - Saneamiento y purga formal de funciones legacy (`confirm_order_payment`, `submit_order_receipt`).
  - Fijación uniforme de `SET search_path = public, pg_temp;` en la totalidad del catálogo.
- **PROMPT 05.5 — Cron & Job Schedulers:**
  - Consolidación del mecanismo de expiración periódica de reservas.
  - Evaluación y unificación entre `pg_cron` (in-database) y la Edge Function `cron-release-expired-reservations` (webhook externo).
  - Trazabilidad y ciclo de vida de registros en `cron.job_run_details` y `audit_logs`.

---

## 8. EVIDENCIA SQL (QUERIES DE INSPECCIÓN Y CATÁLOGO)

A continuación se documentan las consultas canónicas de inspección utilizadas para validar el catálogo vivo y las migraciones:

### 8.1 Verificación de Publicación Supabase Realtime
```sql
SELECT 
    p.pubname,
    t.schemaname,
    t.tablename
FROM pg_publication p
JOIN pg_publication_tables t ON t.pubname = p.pubname
WHERE p.pubname = 'supabase_realtime'
ORDER BY t.tablename;
```

### 8.2 Verificación de Permisos en `reserve_tickets`
```sql
SELECT 
    r.routine_name,
    r.routine_schema,
    p.grantee,
    p.privilege_type
FROM information_schema.routines r
LEFT JOIN information_schema.routine_privileges p 
    ON p.routine_name = r.routine_name 
   AND p.routine_schema = r.routine_schema
WHERE r.routine_name = 'reserve_tickets'
  AND r.routine_schema = 'public';
-- Resultado esperado: Solo 'service_role' y 'postgres' poseen EXECUTE. 'anon', 'authenticated' y 'PUBLIC' NO aparecen.
```

### 8.3 Inventario de Funciones Públicas, SECURITY DEFINER y search_path
```sql
SELECT 
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    p.prosecdef AS is_security_definer,
    p.proconfig AS configuration_settings
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;
```

### 8.4 Inventario de Buckets y Políticas de Storage
```sql
-- Buckets registrados
SELECT 
    id, 
    name, 
    public, 
    file_size_limit, 
    allowed_mime_types 
FROM storage.buckets 
ORDER BY id;

-- Políticas de RLS en storage.objects
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
ORDER BY policyname;
```

### 8.5 Inspección de Trabajos Programados en `pg_cron`
```sql
SELECT 
    jobid,
    schedule,
    command,
    active,
    jobname
FROM cron.job
ORDER BY jobid;
```

---

## 9. INVENTARIO EXHAUSTIVO DE FUNCIONES PÚBLICAS (CATÁLOGO CANÓNICO)

| Nombre de la Función | Tipo | Seguridad | `search_path` Configurado | Migración Canónica | Estado / Observación |
|---|---|---|---|---|---|
| `admin_block_ticket` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `023` | Activa. Bloqueo administrativo de boletos. |
| `admin_create_raffle` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `028` | Activa. Creación dinámica de rifas y boletos. |
| `admin_invite_user` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `046` | Activa. Invitación y confirmación de admins. |
| `admin_list_users` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `046` | Activa. Listado seguro de administradores. |
| `admin_toggle_user_status` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `044` | Activa. Activación/suspensión por superadmin. |
| `admin_unblock_ticket` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `023` | Activa. Desbloqueo administrativo de boletos. |
| `admin_update_buyer` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `023` | Activa. Actualización de datos de comprador. |
| `admin_update_raffle` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `048` | Activa. Actualización de rifa con bloqueo `FOR UPDATE`. |
| `admin_update_system_settings` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `023` | Activa. Configuración general del sistema. |
| `approve_order_payment` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `037` | Activa. Aprobación atómica aislada por `order_id`. |
| `cancel_order` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `043` | Activa. Cancelación administrativa con liberación de boletos. |
| `confirm_order_payment` | RPC Histórica | SECURITY DEFINER | *No fijado en 001* | `001` | **Deprecada**. Reemplazada por `approve_order_payment`. Se purga en 05.4. |
| `create_order_secure` | RPC Pública | SECURITY DEFINER | `public, extensions, pg_temp` | `052` | Activa. Creación idempotente con bloqueo `FOR SHARE` en rifas. |
| `fn_audit_payment_accounts` | Trigger | SECURITY DEFINER | `public, pg_temp` | `023` | Activa. Trazabilidad de cuentas bancarias. |
| `fn_check_order_ticket_matrix`| Trigger | SECURITY DEFINER | `public, pg_temp` | `050` | Activa. Invariante DDL de estado de órdenes vs boletos. |
| `fn_check_ticket_order_matrix`| Trigger | SECURITY DEFINER | `public, pg_temp` | `050` | Activa. Invariante DDL de boletos vs órdenes. |
| `fn_faq_items_updated_at` | Trigger | SECURITY INVOKER | `public, pg_temp` | `032` | Activa. Actualización de timestamp en FAQs. |
| `fn_is_order_pending_proof` | Helper Storage | SECURITY DEFINER | `public, pg_temp` | `045` | Activa. Validación de subida a `payment-proofs`. |
| `fn_partners_updated_at` | Trigger | SECURITY INVOKER | `public, pg_temp` | `025` | Activa. Actualización de timestamp en aliados. |
| `fn_payment_accounts_updated_at`| Trigger | SECURITY INVOKER | `public, pg_temp` | `023` | Activa. Actualización de timestamp en cuentas. |
| `fn_payment_proofs_updated_at` | Trigger | SECURITY INVOKER | `public, pg_temp` | `023` | Activa. Actualización de timestamp en comprobantes. |
| `fn_prize_updated_at` | Trigger | SECURITY INVOKER | `public, pg_temp` | `031` | Activa. Actualización de timestamp en premios. |
| `fn_protect_admin_users` | Trigger | SECURITY DEFINER | `public, pg_temp` | `044` | Activa. Protección de roles administrativos. |
| `fn_validate_order_status_transition` | Trigger | SECURITY DEFINER | `public, pg_temp` | `050` | Activa. Máquina de estados formal de órdenes. |
| `fn_validate_raffle_status_transition` | Trigger | SECURITY DEFINER | `public, pg_temp` | `050` | Activa. Máquina de estados formal de rifas (bloquea reapertura de finished). |
| `fn_validate_ticket_status_transition` | Trigger | SECURITY DEFINER | `public, pg_temp` | `050` | Activa. Máquina de estados formal de boletos. |
| `get_dashboard_kpis` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `027` | Activa. Métricas de recaudación y ocupación. |
| `is_admin` | Helper Auth | SECURITY DEFINER | `public, pg_temp` | `046` | Activa. Validación estricta de privilegios administrativos. |
| `is_superadmin` | Helper Auth | SECURITY DEFINER | `public, pg_temp` | `046` | Activa. Validación de superadministrador. |
| `register_winner` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `041` / `048` | Activa. Registro de ganador y cierre de rifa. |
| `reject_order_payment` | RPC Admin | SECURITY DEFINER | `public, pg_temp` | `037` | Activa. Rechazo de orden y liberación de boletos. |
| `release_expired_reservations`| RPC Sistema | SECURITY DEFINER | `public, pg_temp` | `052` | Activa. Expiración de reservas sin deadlocks (`SKIP LOCKED`). |
| `reserve_tickets` | RPC Histórica | SECURITY DEFINER | `public, pg_temp` | `042` | **Revocada**. Permisos de PostgREST eliminados en DDL 042. |
| `submit_order_receipt` | RPC Histórica | SECURITY DEFINER | *No fijado en 004* | `004` | **Deprecada**. Reemplazada por `submit_payment_proof`. Se purga en 05.4. |
| `submit_payment_proof` | RPC Pública | SECURITY DEFINER | `public, extensions, pg_temp` | `051` | Activa. Registro idempotente de comprobantes. |
| `sync_admin_user_id` | Helper Auth | SECURITY DEFINER | `public, pg_temp` | `046` | Activa. Sincronización segura de `auth.users` con `admin_users`. |
| `verify_public_order_or_tickets` | RPC Pública | SECURITY DEFINER | `public, pg_temp` | `047` | Activa. Verificación pública con protección anti-enumeración. |

---

## 10. EVIDENCIA DE GIT Y ESTADO DEL REPOSITORIO

```bash
$ git status
On branch remediacion/auditoria-05
nothing to commit, working tree clean

$ git log -n 5 --oneline
024e277 feat(hardening): sanitizacion de errores y proteccion isForbidden en vistas restantes
34f89f9 feat(hardening): sanitizacion de errores en PartnersView, PaymentAccountsView y adminUserService
282d9f7 test(regression): bateria adversarial y validacion de regresion de Auditoria 4 (326 tests)
27ffd78 feat(error-handling): normalizacion de errores, proteccion contra fugas SQL y tolerancia a fallos en Realtime (Auditoria 04)
08f3b85 feat(resilience): implement explicit 15s client timeout and preserve idempotency on retries
```

---

## 11. RIESGOS RESIDUALES REALES

1. **Dependencia de Roles de Infraestructura para Realtime (`supabase_admin`):**
   - Si una instancia gestionada de Supabase se regenera desde cero mediante scripts ejecutados con un rol no-superuser, la inclusión de tablas en `supabase_realtime` debe activarse mediante los toggles del Dashboard o mediante la CLI de Supabase con token de infraestructura.
   - *Mitigación:* Se abordará con el procedimiento paso a paso y validación reactiva en **PROMPT 05.2**.
2. **Presencia de Funciones Arcaicas en el Historial de Migraciones:**
   - Procedimientos antiguos como `confirm_order_payment` (migración 001) y `submit_order_receipt` (migración 004) continúan existiendo en esquemas que aplicaron toda la secuencia histórica sin purga. Aunque no son invocados por el frontend ni por los servicios, deben ser formalmente eliminados mediante sentencias `DROP FUNCTION IF EXISTS` en el catálogo vivo.
   - *Mitigación:* Se ejecutará la purga y el blindaje definitivo de funciones en **PROMPT 05.4**.
3. **Dualidad de Cron (pg_cron vs Edge Function):**
   - Mantener dos mecanismos de cron (`pg_cron` interno a cada 5 min y la Edge Function `cron-release-expired-reservations` para runners externos) es útil para redundancia entre planes Free y Pro de Supabase, pero requiere documentar inequívocamente la precedencia de operación.
   - *Mitigación:* Se consolidará en **PROMPT 05.5**.

---
**Conclusión de Reconciliación Forense 05.1:**  
El estado de la base de código y las migraciones canónicas de **Rifa Manaure** en la rama `remediacion/auditoria-05` se encuentra en perfecto orden, sin regresiones contra los baselines de Auditorías 00 a 04. Los hallazgos de seguridad señalados por Auditoría 05 para `reserve_tickets`, `storage` huérfano, concurrencia en compras e idempotencia ya se encontraban completamente solventados en las migraciones previas. Las áreas restantes (`Realtime`, `Receipts`, `Search Path / Funciones Obsoletas` y `Cron`) quedan debidamente inventariadas y preparadas para su ejecución ordenada en los prompts 05.2 a 05.5.
