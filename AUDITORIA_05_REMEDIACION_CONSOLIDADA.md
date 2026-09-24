# AUDITORÍA 05 — REMEDIACIÓN CONSOLIDADA
**Plataforma "Manaure Vive"**  
**Fecha:** 24 de Septiembre de 2026  
**Rama de Trabajo:** `remediacion/auditoria-05`  
**Estado:** En Progreso (Remediaciones 1, 2, 3 y 4 completadas)

---

## ÍNDICE DE REMEDIACIONES AUDITORÍA 05
1. [Remediación 1: Reconciliación Forense del Baseline y Cierre de Regresiones (Prompt 05.1)](#remediación-1-reconciliación-forense-del-baseline-y-cierre-de-regresiones)
2. [Remediación 2: Realtime sin Fuga de PII — EVENT-02 / CRIT-01 (Prompt 05.2)](#remediación-2-realtime-sin-fuga-de-pii--event-02--crit-01)
3. [Remediación 3: Cierre Total del Bucket Legacy receipts y Saneamiento de Storage — EVENT-03 / EVENT-04 / EVENT-09 (Prompt 05.3)](#remediación-3-cierre-total-del-bucket-legacy-receipts-y-saneamiento-de-storage-event-03--event-04--event-09)
4. [Remediación 4: Hardening de SECURITY DEFINER, Protocolo de Errores y Auditoría Financiera — CRIT-03 / CRIT-05 / EVENT-05 / EVENT-06 / EVENT-07 (Prompt 05.4)](#remediación-4-hardening-de-security-definer-protocolo-de-errores-y-auditoría-financiera)
5. [Remediación 5: Consolidación y Trazabilidad de Cron Schedulers (Prompt 05.5 - Pendiente)](#remediación-5-consolidación-y-trazabilidad-de-cron-schedulers)

---

## REMEDIACIÓN 1: RECONCILIACIÓN FORENSE DEL BASELINE Y CIERRE DE REGRESIONES
- **Artefacto Principal:** [AUDITORIA_05_STATE_RECONCILIATION.md](file:///c:/Users/frani/Downloads/RifaManaure/AUDITORIA_05_STATE_RECONCILIATION.md)
- **Commit:** `767185e`
- **Resultados:**
  - 15 objetos obligatorios auditados y reconciliados contra Catálogo vivo y Baseline 00–04.
  - Verificación de que `reserve_tickets` se encuentra revocado formalmente a anon, authenticated y public (Migración 042).
  - Purgadas las 12 políticas huérfanas de almacenamiento para `partner-logos`, `prize-images` y `winner-documents` (Migración 041).
  - Comprobado el blindaje de concurrencia e idempotencia en `create_order_secure` y `submit_payment_proof` (Migraciones 049, 051, 052).
  - 326 tests pasando al 100% de partida.

---

## REMEDIACIÓN 2: REALTIME SIN FUGA DE PII (EVENT-02 / CRIT-01)

### 1. OBJETIVO Y CONTEXTO
Eliminar categóricamente cualquier vector de fuga de información personal identificable (PII) y metadatos sensibles de compras (`buyer_id`, `order_id`, teléfonos, correos o referencias de orden) en Supabase Realtime y en la grilla pública de boletos.

### 2. ARQUITECTURA ELEGIDA
Se implementó una arquitectura desacoplada de dos capas con sincronización transaccional estricta en el motor PostgreSQL:

1. **Capa Privada Completa (`public.tickets`):**
   - Conserva la integridad relacional de negocio: `id`, `raffle_id`, `number`, `status`, `reserved_at`, `reservation_expires_at`, `buyer_id`, `order_id`, timestamps.
   - **Acceso exclusivo para administradores autenticados** mediante función `public.is_admin(auth.uid())`.
   - **Removida** de la publicación de eventos `supabase_realtime` para evitar cualquier broadcast público de sus filas.

2. **Capa Pública Desidentificada (`public.ticket_public_state`):**
   - Proyección pública normalizada que contiene única y exclusivamente el estado mínimo requerido para la grilla y Realtime:
     - `id` (UUID PK, con clave foránea `REFERENCES public.tickets(id) ON DELETE CASCADE`)
     - `raffle_id` (UUID FK a `raffles(id) ON DELETE CASCADE`)
     - `number` (VARCHAR(10) NOT NULL)
     - `status` (VARCHAR(20) NOT NULL: `'available' | 'reserved' | 'paid' | 'blocked'`)
     - `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
   - **Cero PII:** Físicamente desprovista de columnas `buyer_id`, `order_id` o datos de compradores.
   - **Sincronización Atómica:** Trigger `AFTER INSERT OR UPDATE OR DELETE` (`trg_sync_ticket_public_state`) en la misma transacción ACID de cualquier mutación sobre `public.tickets`.
   - **Publicada en `supabase_realtime`:** Con `REPLICA IDENTITY FULL` para emisión determinista a clientes anónimos y registrados.

### 3. MATRIZ DE EXPOSICIÓN (ANTES VS DESPUÉS)

| Vector de Consulta / Evento | Estado Antes de Remediación 2 | Estado Después de Remediación 2 |
|---|---|---|
| `SELECT * FROM public.tickets` (anon) | **EXPUESTO** (retornaba `buyer_id`, `order_id` vía policy `USING (true)`) | **BLOQUEADO** (error 42501 / denegado por RLS) |
| `SELECT buyer_id FROM public.tickets` (anon) | **EXPUESTO** | **BLOQUEADO** (error 42501) |
| `SELECT * FROM public.tickets` (auth no-admin) | **EXPUESTO** (acceso amplio) | **BLOQUEADO** (0 filas devueltas por RLS `is_admin()`) |
| `SELECT * FROM public.tickets` (admin) | Permitido | **PERMITIDO** (acceso administrativo verificado) |
| `SELECT * FROM public.ticket_public_state` (anon) | Inexistente | **PERMITIDO** (únicamente `id`, `raffle_id`, `number`, `status`, `updated_at`) |
| Evento Realtime `UPDATE tickets` | **FUGA CRÍTICA** (difundía `buyer_id`, `order_id` a cualquier escucha anónimo) | **ERRADICADO** (`tickets` removida de `supabase_realtime`) |
| Evento Realtime `UPDATE ticket_public_state` | Inexistente | **SEGURO AL 100%** (carga útil sin campos de PII ni referencias a compradores/órdenes) |

### 4. POLÍTICAS RLS Y PERMISOS DDL (MIGRACIÓN 053)

```sql
-- En public.ticket_public_state:
ALTER TABLE public.ticket_public_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de estado de boletos" 
ON public.ticket_public_state FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.ticket_public_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ticket_public_state TO anon, authenticated, service_role;

-- En public.tickets:
DROP POLICY IF EXISTS "Lectura pública de boletos" ON public.tickets;
REVOKE ALL ON TABLE public.tickets FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.tickets TO authenticated, service_role;

CREATE POLICY "Administradores pueden gestionar boletos" 
ON public.tickets FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
```

### 5. SINCRONIZACIÓN Y MUTADORES TRANSACCIONALES
La función trigger `fn_sync_ticket_public_state()` se ejecuta con `SECURITY DEFINER` y `SET search_path = public, pg_temp;`. Garantiza consistencia atómica e inmediata ante los 6 mutadores operacionales del sistema:
1. `create_order_secure`: Transiciona boletos a `reserved`; la proyección pública pasa a `reserved` inmediatamente sin exponer la nueva orden ni el comprador.
2. `release_expired_reservations`: Restaura boletos expirados a `available`; la proyección pública vuelve a `available`.
3. `approve_order_payment`: Transiciona boletos a `paid`; la proyección pública pasa a `paid`.
4. `reject_order_payment`: Libera boletos a `available`; la proyección pública pasa a `available`.
5. `admin_block_ticket`: Bloquea boletos preventivamente a `blocked`; la proyección pública pasa a `blocked`.
6. `admin_unblock_ticket`: Desbloquea boletos a `available`; la proyección pública pasa a `available`.

### 6. CAMBIOS EN EL FRONTEND Y TIPOS TYPESCRIPT
- **`src/types/database.types.ts`:** Se incorporó la definición estructural completa de `ticket_public_state` con relaciones FK a `tickets` y `raffles`.
- **`src/types/raffle.types.ts`:** Se exportaron los tipos `TicketPublicStateRow` y `PublicTicketRow`.
- **`src/services/ticketService.ts`:**
  - `getTickets(raffleId)` actualizado para consultar exclusivamente `ticket_public_state` seleccionando columnas seguras (`id, raffle_id, number, status, updated_at`).
  - Retorna `Promise<TicketPublicStateRow[]>`.
- **`src/context/TicketCartContextDefinition.ts` & `TicketCartContext.tsx`:**
  - `tickets` tipado como `TicketPublicStateRow[]`.
  - Suscripción Realtime migrada al canal `ticket_public_state_realtime_${raffle.id}` escuchando la tabla `ticket_public_state`.
  - Manejo resiliente de eventos INSERT, UPDATE y DELETE.
- **`src/components/ticketing/SelectorBoletos.tsx`:**
  - Adaptado para soportar tanto estado comercial `'paid'` como `'sold'` con renderizado determinista sin advertencias de tipos.
- **Vistas Administrativas (`TicketsView.tsx`):**
  - Continúan consumiendo `fetchAdminTicketsPaginated()` sobre `public.tickets` bajo contexto administrativo autenticado con permisos plenos.

### 7. SUITE DE PRUEBAS ADVERSARIALES Y DE FLUJO
Se creó la suite [src/test/realtimePiiIsolation.test.ts](file:///c:/Users/frani/Downloads/RifaManaure/src/test/realtimePiiIsolation.test.ts) que valida:
1. Intento anónimo de `SELECT * FROM tickets` -> Bloqueado con error 42501.
2. Intento anónimo de `SELECT buyer_id` o `order_id` -> Bloqueado con error 42501.
3. Intento de usuario autenticado no-admin sobre `tickets` -> 0 filas devueltas (bloqueado por RLS).
4. Acceso de administrador autenticado sobre `tickets` -> Permitido con datos completos de comprador y orden.
5. Acceso anónimo sobre `ticket_public_state` -> Permitido, validando que `buyer_id`, `order_id`, teléfonos, etc. son `undefined`.
6. Exclusión de `tickets` de `supabase_realtime` e inclusión de `ticket_public_state`.
7. Captura de eventos Realtime de UPDATE en `ticket_public_state`: validación estricta de que el payload contiene única y exclusivamente columnas seguras.
8. Prueba de flujo multi-cliente: Cliente A reserva boleto 002 con sus datos privados -> Cliente B recibe evento Realtime seguro de estado 'reserved' sin recibir jamás la identidad ni la orden del Cliente A.
9. Persistencia de los 6 mutadores transaccionales: verificación de sincronización atómica.

### 8. VALIDACIONES TÉCNICAS COMPLETADAS
- **Vitest:** 344 pruebas pasando al 100% en 30 archivos de prueba (`344 passed`).
- **TypeScript:** `tsc -b` limpio con 0 errores de tipado.
- **Linter:** `oxlint` limpio con 0 errores de sintaxis o importación.
- **Vite Build:** Compilación limpia para producción sin advertencias de resolución.

### 9. RIESGOS RESIDUALES Y NOTAS DE DESPLIEGUE
- **Permisos de Infraestructura en Supabase:** En entornos gestionados Supabase Cloud donde el runner de migración no sea superusuario ni propietario de la publicación preexistente `supabase_realtime`, la migración 053 captura defensivamente la excepción `insufficient_privilege`. Si esto ocurre, la sincronización de la publicación se efectúa en 10 segundos desde el Dashboard de Supabase:
  1. *Database -> Publications -> supabase_realtime*.
  2. Desactivar el toggle de `tickets`.
  3. Activar el toggle de `ticket_public_state`.
- La seguridad a nivel de datos (RLS) en `public.tickets` es independiente de la publicación y queda blindada automáticamente por la migración SQL.

### 10. REMEDIACIÓN FORENSE: NORMALIZACIÓN DE ESTADOS LEGADOS (ERROR 23514)
- **Diagnóstico del Error:** Al ejecutar la versión inicial de la migración 053 en Supabase, la sentencia de backfill arrojó `ERROR: 23514: la nueva fila para la relación "ticket_public_state" viola la restricción de verificación "ticket_public_state_status_check"` debido a que la base de datos viva contenía filas históricas con el estado en español `'vendido'` (ej: fila `(5d2a48bd-5bb0-4a7c-86e7-9c5b88ad2825, a0000000-0000-0000-0000-000000000001, 004, vendido)`). Adicionalmente, el estado canónico `'sold'` no había sido incluido explícitamente en el `CHECK` inicial.
- **Corrección Aplicada:**
  1. **Saneamiento Defensivo:** Se incorporó un bloque `DO $$` previo que normaliza de forma segura estados históricos en español (`'vendido'` -> `'sold'`, `'disponible'` -> `'available'`, `'reservado'` -> `'reserved'`, `'bloqueado'` -> `'blocked'`) deshabilitando temporalmente el trigger de transiciones comerciales para evitar colisiones de validación durante el saneamiento.
  2. **Ampliación Defensiva del CHECK Constraint:** La restricción `ticket_public_state_status_check` se actualizó explícitamente mediante `ALTER TABLE DROP CONSTRAINT IF EXISTS / ADD CONSTRAINT` para admitir tanto los estados canónicos (`'available'`, `'reserved'`, `'sold'`, `'blocked'`) como los alias de compatibilidad (`'paid'`, `'vendido'`).
  3. **Normalización en Backfill y Trigger:** Tanto la consulta de backfill como la función trigger `fn_sync_ticket_public_state()` normalizan automáticamente mediante `CASE LOWER(TRIM(status))` cualquier valor legado a su contraparte canónica antes de escribir en la proyección pública.
  4. **Cobertura en Pruebas:** Se añadió la prueba unitaria *Mutador 7* en `realtimePiiIsolation.test.ts` verificando que un boleto con status `'vendido'` se sincroniza deterministamente como `'sold'` sin violar ninguna restricción de integridad.

---

## REMEDIACIÓN 3 (PROMPT 05.3): CIERRE TOTAL DEL BUCKET LEGACY 'receipts' Y SANEAMIENTO DE STORAGE

### 1. OBJETIVO Y HALLAZGOS ATENDIDOS
- **EVENT-03:** Riesgo de exposición de datos bancarios e información financiera sensible mediante acceso público directo en el bucket legacy `receipts`.
- **EVENT-04:** Necesidad de cerrar toda posibilidad de subida anónima o mutación no autorizada sobre el bucket legacy `receipts`.
- **EVENT-09:** Presencia de políticas RLS huérfanas en `storage.objects` asociadas a buckets que ya no existen (`partner-logos`, `prize-images`, `winner-documents`).

### 2. MATRIZ DE INVENTARIO ANTES Y DESPUÉS (storage.buckets)

| Bucket ID | Estado Previo | Configuración Remediada (Migración 054) | Propósito / Flujo |
|---|---|---|---|
| `receipts` | `public = true` (en entornos vivos no migrados) / `public = false` (en DDL 045) | `public = false`<br>Cuota: 5 MB (5.242.880 bytes)<br>MIME: `image/jpeg`, `image/png`, `image/webp`, `application/pdf` | **Bucket Legacy de Comprobantes:** Cerrado al 100% para escrituras y mutaciones. Cero descargas públicas directas por CDN. Preservación íntegra de objetos históricos mediante URLs firmadas exclusivas para administradores (`is_admin`). |
| `payment-proofs` | `public = false`<br>Cuota: 5 MB<br>MIME: JPEG, PNG, WebP, PDF | `public = false`<br>Cuota: 5 MB<br>MIME: JPEG, PNG, WebP, PDF | **Bucket Activo de Comprobantes:** Inserción condicionada a orden pendiente por `fn_is_order_pending_proof`. Lectura exclusiva para administradores autenticados. |
| `gallery-images` | `public = true`<br>Cuota: 10 MB<br>MIME: JPEG, PNG, WebP, AVIF | `public = true`<br>Cuota: 10 MB (10.485.760 bytes)<br>MIME: `image/jpeg`, `image/png`, `image/webp`, `image/avif` | **Galería Pública Comunitaria:** Formatos fotográficos comprimidos para web. **Exclusión taxativa y definitiva de `image/svg+xml`** (prevención de Stored XSS). Subida/edición exclusiva para administradores. |
| `partner-logos` | Inexistente en Storage (migrado a Cloudinary) | **No creado / Políticas huérfanas purgadas** | Aliados operan 100% sobre Cloudinary vía Edge Function `cloudinary-sign`. |
| `prize-images` | Inexistente en Storage (migrado a Cloudinary) | **No creado / Políticas huérfanas purgadas** | Premios operan 100% sobre Cloudinary vía Edge Function `cloudinary-sign`. |
| `winner-documents` | Inexistente en Storage (migrado a Cloudinary) | **No creado / Políticas huérfanas purgadas** | Actas y evidencias operan 100% sobre Cloudinary. |

### 3. MIGRACIÓN DEL FLUJO ACTIVO Y PRESERVACIÓN HISTÓRICA
1. **Flujo Activo Unificado:**
   - Se certificó que el 100% de los nuevos comprobantes de pago se cargan exclusivamente en `payment-proofs` a través de `paymentService.uploadPaymentProof()`.
   - Cero escrituras, subidas o modificaciones dirigidas a `receipts` en el frontend, Edge Functions o backend.
2. **Preservación Transparente de Objetos Históricos:**
   - **Ningún archivo fue eliminado:** Los comprobantes históricos existentes en `receipts` permanecen intactos.
   - En el frontend, `paymentService.getSignedProofUrl()` detecta si la ruta o URL histórica apunta a `receipts` y solicita una URL firmada temporal (`createSignedUrl`) con 15 minutos de vigencia contra el bucket `receipts`.
   - Como la política RLS exige `is_admin(auth.uid())`, solo los administradores autorizados pueden generar y acceder a los comprobantes históricos. Usuarios anónimos y compradores regulares quedan bloqueados.

### 4. REVOCACIÓN TOTAL DE ESCRITURA PÚBLICA EN 'receipts'
- Se eliminaron todas las políticas de mutación e inserción (`DROP POLICY IF EXISTS "Subida pública de comprobantes"`, etc.).
- No existe ninguna política `INSERT`, `UPDATE` ni `DELETE` sobre `receipts`. PostgreSQL aplica por defecto denegación total (*deny-all*).
- Descargas públicas directas (`/storage/v1/object/public/receipts/...`) son rechazadas automáticamente por Supabase Storage al estar marcado `public = false`.

### 5. ANÁLISIS FORENSE DE SVG EN 'gallery-images' (ANTI-STORED XSS)
1. **Inspección de Archivos y Renderizado:**
   - No existen archivos `.svg` almacenados en el catálogo de fotos ni en las semillas de la galería.
   - En la aplicación (`HeroRifa.tsx`, `GalleryView.tsx`), las imágenes se renderizan estrictamente mediante etiquetas `<img>` con lazy loading y fondos CSS. NUNCA se utiliza `dangerouslySetInnerHTML`, `object` ni `iframe` para desplegar contenido fotográfico.
2. **Evaluación del Vector de Riesgo:**
   - Si un archivo SVG fuera admitido en un bucket público y servido con cabecera `Content-Type: image/svg+xml`, al ser abierto directamente en una pestaña del navegador podría ejecutar código JavaScript arbitrario (`<script>` o atributos `onload`) bajo el origen del dominio de Supabase Storage.
3. **Decisión Arquitectónica:**
   - Al tratarse de una galería fotográfica turística, los gráficos vectoriales no tienen ninguna utilidad funcional.
   - Se ratifica la eliminación definitiva de `image/svg+xml` tanto en `storage.buckets.allowed_mime_types` como en la validación del frontend (`galleryService.uploadGalleryPhoto`).

### 6. PURGA INTEGRAL DE POLÍTICAS RLS HUÉRFANAS
En la migración 054 se ejecutaron sentencias `DROP POLICY IF EXISTS` para eliminar 18 variantes de políticas huérfanas que pudieron haber sido creadas por scripts manuales antiguos:
- `partner-logos`: políticas de lectura pública, subida, actualización y eliminación.
- `prize-images`: políticas de lectura pública, subida, actualización y eliminación.
- `winner-documents`: políticas de lectura pública, subida, actualización y eliminación.

### 7. SUITE DE PRUEBAS AUTOMATIZADAS (src/test/storageClosureAndOrphanPurge.test.ts)
Se implementó una nueva suite con 18 pruebas unitarias y de integración que validan:
1. `receipts.public === false` y límites de cuota/MIME.
2. Rechazo de peticiones GET públicas directas a `receipts`.
3. Ausencia absoluta de políticas de mutación (INSERT/UPDATE/DELETE) en `receipts`.
4. Denegación de subidas anónimas en `receipts`.
5. Bloqueo de descargas anónimas y de usuarios regulares en `receipts`.
6. Generación exitosa de Signed URLs en `receipts` para administradores.
7. Subida legítima en `payment-proofs` para órdenes pendientes mediante `fn_is_order_pending_proof`.
8. Rechazo de subidas con path arbitrario o sin UUID en `payment-proofs`.
9. Rechazo de subidas para órdenes en estados terminales (`paid`, `rejected`, `expired`).
10. Rechazo de archivos > 5 MB en `payment-proofs`.
11. Rechazo de archivos con MIME inválido (ejecutables, scripts, etc.).
12. Lectura de `payment-proofs` restringida exclusivamente a administradores.
13. Exclusión de `image/svg+xml` en `gallery-images`.
14. Rechazo taxativo de subida de SVG en `galleryService`.
15. Aceptación de formatos fotográficos válidos (WebP, JPEG, PNG, AVIF).
16. Inexistencia de políticas huérfanas en el catálogo activo.
17. Inexistencia de buckets huérfanos en `storage.buckets`.
18. Restricción estricta de políticas solo a buckets legítimos (`receipts`, `payment-proofs`, `gallery-images`).

### 8. VALIDACIONES TÉCNICAS GLOBALES
- **Vitest:** 362 pruebas pasando al 100% en 31 suites (`362 passed, 0 failed`).
- **TypeScript (`tsc -b`):** 0 errores de tipado.
- **Linter (`oxlint`):** 0 errores de sintaxis.
- **Vite Build:** Compilación limpia para producción en 5.51s sin errores.

---

## REMEDIACIÓN 4: HARDENING DE SECURITY DEFINER, PROTOCOLO DE ERRORES Y AUDITORÍA FINANCIERA (CRIT-03 / CRIT-05 / EVENT-05 / EVENT-06 / EVENT-07)

### 1. OBJETIVO Y HALLAZGOS ATENDIDOS
- **CRIT-03 / EVENT-06:** Divergencia arquitectónica en el manejo de errores en RPCs transaccionales (`RAISE EXCEPTION` arrojando HTTP 400 vs `jsonb` arrojando HTTP 200 con payload).
- **CRIT-05 / EVENT-07:** Riesgo de vulnerabilidad por *Search Path Hijacking* en funciones `SECURITY DEFINER` al carecer de una cláusula `SET search_path` explícita que anteponga el catálogo del sistema (`pg_catalog`).
- **EVENT-05:** Omisión de trazabilidad financiera explícita dentro de `approve_order_payment` y `reject_order_payment`.
- **Funciones Obsoletas:** Presencia residual en el catálogo de procedimientos arcaicos deprecados (`confirm_order_payment`, `submit_order_receipt`).

### 2. INVENTARIO EXHAUSTIVO DE FUNCIONES SECURITY DEFINER Y SEARCH_PATH (ANTES VS DESPUÉS)

Se auditó el 100% de los objetos con `prosecdef = true` en el catálogo `pg_proc` del esquema `public`. A continuación se detalla la matriz de hardening aplicada en la **Migración 055**:

| Nombre de la Función | Tipo | search_path Previo | search_path Remediado (055) | Grants Permitidos |
|---|---|---|---|---|
| `create_order_secure` | RPC Pública | `public, extensions, pg_temp` | `pg_catalog, public, extensions, pg_temp` | `anon, authenticated, service_role` |
| `submit_payment_proof` | RPC Pública | `public, extensions, pg_temp` | `pg_catalog, public, extensions, pg_temp` | `anon, authenticated, service_role` |
| `verify_public_order_or_tickets` | RPC Pública | `public, pg_temp` | `pg_catalog, public, pg_temp` | `anon, authenticated, service_role` |
| `is_admin` | Helper Auth | `public, auth, pg_temp` | `pg_catalog, public, auth, pg_temp` | `anon, authenticated, service_role` |
| `is_superadmin` | Helper Auth | `public, auth, pg_temp` | `pg_catalog, public, auth, pg_temp` | `anon, authenticated, service_role` |
| `approve_order_payment` | RPC Admin | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `reject_order_payment` | RPC Admin | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `cancel_order` | RPC Admin | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `register_winner` | RPC Admin | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `admin_block_ticket` | RPC Admin | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `admin_unblock_ticket` | RPC Admin | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `admin_update_raffle` | RPC Admin | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `admin_update_system_settings` | RPC Admin | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `admin_create_raffle` | RPC Admin | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `admin_invite_user` | RPC Admin | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `admin_list_users` | RPC Admin | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `admin_toggle_user_status` | RPC Admin | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `admin_update_buyer` | RPC Admin | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `get_dashboard_kpis` | RPC Admin | `public, pg_catalog, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `release_expired_reservations` | RPC Sistema | `public, pg_temp` | `pg_catalog, public, pg_temp` | `authenticated, service_role` (REVOCADO de anon) |
| `reserve_tickets` | RPC Sistema | `public, pg_temp` | `pg_catalog, public, pg_temp` | `service_role` (REVOCADO de anon y authenticated) |
| `fn_validate_order_status_transition` | Trigger | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` |
| `fn_validate_raffle_status_transition` | Trigger | `public, pg_temp` | `pg_catalog, public, pg_temp` | `authenticated, service_role` |
| `fn_validate_ticket_status_transition` | Trigger | `public, pg_temp` | `pg_catalog, public, pg_temp` | `authenticated, service_role` |
| `fn_sync_ticket_public_state` | Trigger | `public, pg_temp` | `pg_catalog, public, pg_temp` | `authenticated, service_role` |
| `fn_protect_admin_users` | Trigger | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` |
| `fn_audit_payment_accounts` | Trigger | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` |
| `fn_check_order_ticket_matrix` | Trigger | `public, pg_temp` | `pg_catalog, public, pg_temp` | `authenticated, service_role` |
| `fn_check_ticket_order_matrix` | Trigger | `public, pg_temp` | `pg_catalog, public, pg_temp` | `authenticated, service_role` |
| `sync_admin_user_id` | Trigger | `public, pg_temp` | `pg_catalog, public, auth, pg_temp` | `authenticated, service_role` |
| `fn_is_order_pending_proof` | Helper Storage | `public, pg_temp` | `pg_catalog, public, pg_temp` | `anon, authenticated, service_role` |
| `confirm_order_payment` | RPC Arcaica | Sin search_path en 001 | **PURGADA** (`DROP FUNCTION IF EXISTS`) | N/A (Eliminada) |
| `submit_order_receipt` | RPC Arcaica | Sin search_path en 004 | **PURGADA** (`DROP FUNCTION IF EXISTS`) | N/A (Eliminada) |

### 3. MECANISMO DE PREVENCIÓN DE SEARCH PATH HIJACKING
1. **Priorización Incondicional de `pg_catalog`:**
   - Al colocar `pg_catalog` en la primera posición de `search_path`, PostgreSQL busca funciones y operadores del sistema (`COALESCE`, `NOW`, `COUNT`, `TRIM`, `LOWER`, `UPPER`, `LPAD`, `=`, `<>`, etc.) exclusivamente en el catálogo protegido nativo.
   - Cualquier intento de un atacante o usuario no privilegiado de inyectar funciones homónimas en esquemas temporales (`pg_temp`) o en esquemas locales es ignorado de forma incondicional.
2. **Ubicación de `pg_temp` al Final:**
   - La directiva `pg_temp` se fija al final de la ruta de resolución.
   - Los objetos temporales de sesión solo se resuelven si no existen en `pg_catalog`, `public` ni `auth`.
3. **Inclusión Selectiva y de Mínimo Privilegio de `auth` y `extensions`:**
   - El esquema `auth` se incluye únicamente en aquellas funciones que interactúan con `auth.uid()` o `auth.users`.
   - El esquema `extensions` se incluye únicamente en `create_order_secure` y `submit_payment_proof` para las funciones criptográficas (`digest` SHA-256).

### 4. PROTOCOLO UNIFICADO DE ERRORES RPC (10 RPCS CRÍTICAS)

Se implementó el contrato final de segregación de errores en el motor PostgreSQL y su contraparte en el frontend (`src/lib/errorHandling.ts`):

1. **Errores de Validación y Lógica de Negocio Esperados:**
   - Retorno JSON estructurado: `{"success": false, "code": "<CODIGO_ESTABLE>", "error": "<MENSAJE_SANITIZADO>"}`.
   - HTTP observado por el cliente: 200 OK con payload de error controlado.
   - Sin excepción en base de datos; no contamina los logs de errores del motor de BD.
2. **Violaciones de Invariantes de Integridad / Estados Imposibles / Falla Atómica:**
   - Se ejecuta `RAISE EXCEPTION` para forzar el aborto inmediato de la transacción y provocar el ROLLBACK total de PostgreSQL.
3. **Autorización Administrativa Denegada:**
   - Se ejecuta `RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador' USING ERRCODE = '42501';`.
   - PostgREST traduce el código nativo `42501` (`insufficient_privilege`) a HTTP 403 Forbidden.

#### Matriz de Contrato de las 10 RPCs Críticas:

| # | RPC | Error / Escenario | Código Canónico | HTTP Observado | Comportamiento Transaccional | UI Resultante |
|---|---|---|---|---|---|---|
| **1** | `approve_order_payment` | Usuario no autenticado / no admin | `FORBIDDEN` (`42501`) | 403 Forbidden | Rollback (Excepción) | Banner de permiso denegado |
| | | Orden no encontrada | `NOT_FOUND` | 200 (JSON) | Sin mutación | "La orden de compra no existe." |
| | | Orden ya pagada | `INVALID_STATE` | 200 (JSON) | Sin mutación | "La orden ya se encuentra aprobada..." |
| | | Orden en estado no aprobable | `INVALID_STATE` | 200 (JSON) | Sin mutación | "No se puede aprobar la orden..." |
| | | Orden sin boletos / boletos incompatibles | `INTEGRITY_ERROR` | 200 (JSON) | Sin mutación | "Integridad violada: La orden no tiene boletos..." |
| | | Discrepancia en recuento de boletos | `INTEGRITY_ERROR` | 200 (JSON) | Sin mutación | "Discrepancia en cantidad de boletos..." |
| | | Carrera concurrente en recuento | `SERVER_ERROR` | 400 (Excepción) | Rollback (Excepción) | "Fallo de consistencia atómica..." |
| **2** | `reject_order_payment` | No admin | `FORBIDDEN` (`42501`) | 403 Forbidden | Rollback (Excepción) | Banner de permiso denegado |
| | | Orden no encontrada | `NOT_FOUND` | 200 (JSON) | Sin mutación | "La orden de compra no existe." |
| | | Orden ya pagada | `INVALID_STATE` | 200 (JSON) | Sin mutación | "Una orden que ya fue pagada no puede ser rechazada..." |
| | | Orden ya rechazada | `INVALID_STATE` | 200 (JSON) | Sin mutación | "La orden ya se encuentra rechazada..." |
| | | Orden expirada o cancelada | `INVALID_STATE` | 200 (JSON) | Sin mutación | "Una orden en estado finalizado no puede ser rechazada." |
| **3** | `cancel_order` | No admin | `FORBIDDEN` (`42501`) | 403 Forbidden | Rollback (Excepción) | Banner de permiso denegado |
| | | Orden no encontrada | `NOT_FOUND` | 200 (JSON) | Sin mutación | "La orden de compra no existe." |
| | | Orden ya cancelada | `success: true` (`already_cancelled`) | 200 (JSON) | Idempotente | "La orden ya se encontraba cancelada..." |
| | | Orden ya pagada / completada | `INVALID_STATE` | 200 (JSON) | Sin mutación | "No se puede cancelar una orden que ya fue pagada..." |
| | | Orden ya rechazada | `INVALID_STATE` | 200 (JSON) | Sin mutación | "No se puede cancelar una orden que ya fue rechazada." |
| **4** | `register_winner` | No admin | `FORBIDDEN` | 200 (JSON) | Sin mutación | "Acceso denegado: solo administradores..." |
| | | Parámetros obligatorios vacíos | `VALIDATION_ERROR` | 200 (JSON) | Sin mutación | "El ID de la rifa es obligatorio." / "El número de boleto es obligatorio." |
| | | Rifa o boleto inexistente | `NOT_FOUND` | 200 (JSON) | Sin mutación | "La rifa especificada no existe." |
| | | Boleto no vendido (`status <> 'sold'`) | `INVALID_STATE` | 200 (JSON) | Sin mutación | "El boleto no puede registrarse como ganador porque no está vendido." |
| | | Ganador ya registrado / Colisión | `CONFLICT` | 200 (JSON) | Sin mutación | "El boleto ya ha sido registrado como ganador para esta rifa." |
| **5** | `create_order_secure` | Boletos vacíos / datos inválidos | `VALIDATION_ERROR` | 200 (JSON) | Sin mutación | Mensaje de validación amigable |
| | | Rifa pausada o inexistente | `INVALID_STATE` / `NOT_FOUND` | 200 (JSON) | Sin mutación | "La rifa no se encuentra en estado activo..." |
| | | Boletos ya no disponibles (ocupados) | `CONFLICT` | 200 (JSON) | Sin mutación | "Uno o más números ya no se encuentran disponibles." |
| | | Discrepancia de huella de idempotencia | `CONFLICT` | 200 (JSON) | Sin mutación | "Conflicto de idempotencia..." |
| **6** | `submit_payment_proof` | Campos vacíos / archivo inválido | `VALIDATION_ERROR` | 200 (JSON) | Sin mutación | "El archivo del comprobante es obligatorio." |
| | | Orden inexistente | `NOT_FOUND` | 200 (JSON) | Sin mutación | "La orden no existe." |
| | | Orden terminal (paid, rejected, expired) | `INVALID_STATE` | 200 (JSON) | Sin mutación | "La orden se encuentra en estado X y no acepta nuevos comprobantes." |
| | | Parámetros discrepantes en reintento | `CONFLICT` | 200 (JSON) | Sin mutación | "Conflicto de idempotencia..." |
| **7** | `admin_update_raffle` | No admin | `FORBIDDEN` | 200 (JSON) | Sin mutación | "Acceso denegado: solo administradores..." |
| | | Campos obligatorios vacíos o negativos | `VALIDATION_ERROR` | 200 (JSON) | Sin mutación | Mensaje de validación de campos |
| | | Rifa no encontrada | `NOT_FOUND` | 200 (JSON) | Sin mutación | "La rifa especificada no existe." |
| | | Intento de reabrir rifa 'finished' | `INVALID_STATE` | 200 (JSON) | Sin mutación | "Operación rechazada: Una rifa en estado finished no puede ser reabierta." |
| **8** | `admin_update_system_settings` | No admin | `FORBIDDEN` | 200 (JSON) | Sin mutación | "Acceso denegado: solo administradores..." |
| | | Rango de reserva o boletos fuera de límites | `VALIDATION_ERROR` | 200 (JSON) | Sin mutación | "El tiempo de reserva debe estar comprendido entre 1 y 120 minutos." |
| **9** | `admin_block_ticket` | No admin | `FORBIDDEN` | 200 (JSON) | Sin mutación | "Acceso denegado: Se requieren privilegios..." |
| | | Motivo vacío | `VALIDATION_ERROR` | 200 (JSON) | Sin mutación | "Debe especificar un motivo claro..." |
| | | Boleto no existe | `NOT_FOUND` | 200 (JSON) | Sin mutación | "El boleto especificado no existe." |
| | | Boleto ya vendido con orden pagada | `INVALID_STATE` | 200 (JSON) | Sin mutación | "Acción bloqueada: No se puede modificar o bloquear un boleto ya vendido..." |
| | | Boleto ya bloqueado | `INVALID_STATE` | 200 (JSON) | Sin mutación | "El boleto ya se encuentra bloqueado." |
| **10** | `admin_unblock_ticket` | No admin | `FORBIDDEN` | 200 (JSON) | Sin mutación | "Acceso denegado: Se requieren privilegios..." |
| | | Boleto no existe | `NOT_FOUND` | 200 (JSON) | Sin mutación | "El boleto especificado no existe." |
| | | Boleto no está bloqueado | `INVALID_STATE` | 200 (JSON) | Sin mutación | "El boleto no está bloqueado..." |

### 5. AUDITORÍA FINANCIERA EXPLÍCITA (EVENT-05)

#### Arquitectura de Trazabilidad sin Duplicación:
En lugar de añadir inserciones manuales en `approve_order_payment` y `reject_order_payment` que compitieran o duplicaran eventos con los disparadores de órdenes, se centralizó la emisión formal dentro de la función trigger canónica `fn_validate_order_status_transition`:

```sql
v_audit_action := CASE NEW.status
    WHEN 'paid' THEN 'ORDER_PAYMENT_APPROVED'
    WHEN 'rejected' THEN 'ORDER_PAYMENT_REJECTED'
    WHEN 'cancelled' THEN 'ORDER_CANCELLED'
    ELSE 'ORDER_STATUS_' || UPPER(NEW.status)
END;
```

#### Estructura del Evento de Auditoría Financiera:
- **`action`:** `'ORDER_PAYMENT_APPROVED'`, `'ORDER_PAYMENT_REJECTED'`, `'ORDER_CANCELLED'`.
- **`entity_type`:** `'order'`.
- **`entity_id`:** UUID de la orden.
- **`performed_by`:** UUID del administrador que verificó (`NEW.verified_by`).
- **`details`:**
  - `order_id`: UUID de la orden.
  - `actor`: UUID del administrador (`auth.uid()`).
  - `timestamp`: Timestamp ISO del momento de la aprobación/rechazo.
  - `reference`: Referencia comercial de la orden (ej. `ORD-2026-0001`).
  - `previous_status`: Estado anterior (`pending` o `pending_verification`).
  - `new_status`: Estado resultante (`paid`, `rejected`, `cancelled`).
  - `total_amount`: Monto financiero recaudado.
  - `ticket_count`: Cantidad de boletos afectados.
  - `rejection_reason`: Motivo documentado del rechazo (NULL en aprobación).
- **Protección de Privacidad (Cero PII):** No se registran nombres, documentos, correos ni teléfonos de compradores en la tabla `audit_logs`.

#### Matriz de Eventos Transaccionales (Exactamente 1 Registro por Acción):
1. **Aprobar Pago (`approve_order_payment`):** Genera exactamente 1 registro con acción `ORDER_PAYMENT_APPROVED`.
2. **Rechazar Pago (`reject_order_payment`):** Genera exactamente 1 registro con acción `ORDER_PAYMENT_REJECTED`.
3. **Cancelar Orden (`cancel_order`):** Genera exactamente 1 registro con acción `ORDER_CANCELLED`.
4. **Subir Comprobante (`submit_payment_proof`):** Genera exactamente 1 registro con acción `PAYMENT_PROOF_SUBMITTED`.
5. **Registrar Ganador (`register_winner`):** Genera exactamente 1 registro con acción `WINNER_REGISTERED`.

### 6. SUITE DE PRUEBAS AUTOMATIZADAS (src/test/securityDefinerAndFinancialAudit.test.ts)

Se construyó una suite integral con 19 pruebas que validan exhaustivamente:
- **Parte A (7 tests):** Catálogo de funciones `SECURITY DEFINER`, presencia incondicional de `pg_catalog` en primera posición, exclusividad de `auth` y `extensions`, simulación de prevención de shadowing frente a inyecciones en `pg_temp`, verificación de purga de funciones deprecadas y comprobación estricta de permisos de ejecución (least privilege).
- **Parte B (8 tests):** Clasificación exacta de errores mediante `normalizeAppError` para `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `CONFLICT` e `INTEGRITY_ERROR`, sanitización de fugas técnicas PostgreSQL, y manejo resiliente en los servicios del frontend (`approveOrderPayment`, `rejectOrderPayment`).
- **Parte C (4 tests):** Generación de `ORDER_PAYMENT_APPROVED` con detalles financieros y cero PII, generación de `ORDER_PAYMENT_REJECTED` con motivo de rechazo, generación de `ORDER_CANCELLED`, y verificación de unicidad estricta (cero duplicados con `ORDER_STATUS_PAID`).

### 7. VERIFICACIÓN Y GATES DE CALIDAD
- **Vitest:** 381 pruebas pasando al 100% en 32 suites (`381 passed, 0 failed`).
- **TypeScript (`tsc -b`):** 0 errores de tipado.
- **Linter (`oxlint`):** 0 errores de sintaxis en 137 archivos.
- **Vite Build:** Compilación limpia para producción en 5.48s (`dist/` generado exitosamente).

### 8. RIESGOS RESIDUALES EVALUADOS
1. **Funciones SECURITY INVOKER:**
   - Las funciones de actualización de marcas de tiempo (`fn_*_updated_at`) operan en modo `SECURITY INVOKER`. No presentan riesgo de elevación de privilegios al ejecutarse bajo los permisos de la sesión invocante.
2. **Compatibilidad con Entornos Nuevos:**
   - La migración 055 fue diseñada de manera estrictamente idempotente (`CREATE OR REPLACE FUNCTION`, `ALTER FUNCTION`, `DROP FUNCTION IF EXISTS`), asegurando su aplicación limpia tanto en entornos existentes como en nuevas instancias de base de datos.


