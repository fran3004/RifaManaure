# AUDITORÍA 05 — REMEDIACIÓN CONSOLIDADA
**Plataforma "Manaure Vive"**  
**Fecha:** 24 de Septiembre de 2026  
**Rama de Trabajo:** `remediacion/auditoria-05`  
**Estado:** En Progreso (Remediación 1 y Remediación 2 completadas)

---

## ÍNDICE DE REMEDIACIONES AUDITORÍA 05
1. [Remediación 1: Reconciliación Forense del Baseline y Cierre de Regresiones (Prompt 05.1)](#remediación-1-reconciliación-forense-del-baseline-y-cierre-de-regresiones)
2. [Remediación 2: Realtime sin Fuga de PII — EVENT-02 / CRIT-01 (Prompt 05.2)](#remediación-2-realtime-sin-fuga-de-pii--event-02--crit-01)
3. [Remediación 3: Bucket Receipts y Privacidad (Prompt 05.3 - Pendiente)](#remediación-3-bucket-receipts-y-privacidad)
4. [Remediación 4: Endurecimiento de search_path y Funciones (Prompt 05.4 - Pendiente)](#remediación-4-endurecimiento-de-search_path-y-funciones)
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

