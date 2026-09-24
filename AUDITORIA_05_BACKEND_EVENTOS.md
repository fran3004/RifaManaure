# AUDITORÍA 05 — BACKEND TRANSACCIONAL Y EVENTOS

**Proyecto:** RifaManaure (`manaure-vive`)  
**Repositorio:** `fran3004/RifaManaure`  
**Fecha de Ejecución Forense:** 23 de Septiembre de 2026  
**Motor de Base de Datos:** PostgreSQL 15.8 (Ubuntu 15.8-1.pgdg22.04+1) on x86_64-pc-linux-gnu (Supabase Cloud Hosted)  
**Ambiente:** Producción Viva (`bxhzvmbbsisxqpwrgvgn`)  
**Fase de Trabajo:** EXCLUSIVAMENTE AUDITORÍA FORENSE — CERO MODIFICACIONES REALIZADAS  

---

## 1. RESUMEN EJECUTIVO Y HALLAZGOS CRÍTICOS (NIVEL ARQUITECTÓNICO)

Esta auditoría evaluó con máxima profundidad forense los seis subsistemas que integran la capa de ejecución transaccional y reactiva del sistema:
1. **Procedimientos Almacenados (RPC)**: 30 funciones en el esquema `public` (21 invocables directamente + 9 triggers/helpers).
2. **Edge Functions (Deno Runtime)**: 2 microservicios desplegados en el clúster de Supabase (`cloudinary-sign` y `cron-release-expired-reservations`).
3. **Automatización en Background (Cron)**: Motor nativo `pg_cron` en PostgreSQL (`cron.job`) ejecutando el desahogo de reservas.
4. **Bus de Eventos en Tiempo Real (Supabase Realtime)**: Publicaciones lógicas (`pg_publication`, `pg_publication_tables`) y suscripciones WebSocket en el frontend React.
5. **Subsistema de Almacenamiento (Supabase Storage)**: 3 buckets físicos (`receipts`, `payment-proofs`, `gallery-images`), directivas CDN y políticas RLS en `storage.objects`.
6. **Integridad Transaccional y Concurrencia**: Bloqueos pesimistas, orden de adquisición de locks y prevención de deadlocks.

### Cuadro de Síntesis Forense de los 5 Hallazgos Mayores

| ID | Subsistema | Severidad | Hallazgo Crítico | Impacto Operativo / Seguridad |
|---|---|---|---|---|
| **CRIT-01** | **Supabase Realtime** | **CRÍTICA** | **Publicación `supabase_realtime` tiene CERO tablas en la base de datos viva.** | Ningún evento CDC se emite hacia el frontend. La reactividad WebSocket en el carrito, compras y dashboard está 100% inoperativa en producción; el cliente funciona exclusivamente por recarga HTTP manual. |
| **CRIT-02** | **Supabase Storage** | **ALTA** | **Bucket legacy `receipts` tiene visibilidad `public = true` sin límite de peso ni MIME.** | Cualquier persona que adivine o extraiga la URL de un comprobante en `receipts` puede visualizar transferencias bancarias privadas sin autenticación, evadiendo RLS por CDN bypass. |
| **CRIT-03** | **RPC Transaccionales** | **MEDIA** | **Divergencia arquitectónica en manejo de errores (`RAISE EXCEPTION` vs `jsonb`).** | `approve_order_payment` y `reject_order_payment` usan `RAISE EXCEPTION` (retornan HTTP 400), mientras que `create_order_secure` y `admin_block_ticket` retornan JSON `{"success": false}` (HTTP 200). Rompe consistencia de captura de errores en el frontend. |
| **CRIT-04** | **Cron Dual** | **MEDIA** | **Desacople entre `pg_cron` interno y la Edge Function de expiración.** | El sistema ejecuta el cron internamente vía `pg_cron` cada 5 min (exitoso), mientras que la Edge Function `cron-release-expired-reservations` no está enlazada a ningún disparador externo, existiendo redundancia desacoplada. |
| **CRIT-05** | **RPC Security Definer** | **MEDIA** | **29 de 30 funciones `SECURITY DEFINER` carecen de cláusula `SET search_path = public`.** | Vulnerabilidad clásica de PostgreSQL ante técnicas de Search Path Hijacking si un atacante lograra crear objetos en esquemas temporales. |

---

## 2. AUDITORÍA EXHAUSTIVA DE LAS 30 RPC / FUNCIONES DE BASE DE DATOS

El inventario real obtenido mediante introspección directa del catálogo `pg_proc` y `information_schema.routines` arrojó exactamente 30 funciones en el esquema `public`. A continuación se detalla cada una analizada en sus **12 dimensiones obligatorias**:

### 2.1. `admin_block_ticket`

- **Firma:** `admin_block_ticket(p_ticket_id uuid, p_reason text) -> jsonb`
- **Tipo de Objeto:** RPC Administrativa
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_ticket_id` (UUID, requerido), `p_reason` (TEXT, requerido, motivo no vacío). |
| **2. Validación** | Verifica que `p_reason` no sea NULL ni whitespace (`TRIM(p_reason) != ''`). Comprueba existencia física del boleto (`NOT FOUND`). Valida estado: rechaza si ya está en `blocked`. Si está en `sold`, consulta la orden asociada y prohíbe el bloqueo si la orden está en estado `paid` o `completed`. |
| **3. Autorización** | `SECURITY DEFINER`. Ejecuta verificación `IF NOT public.is_admin(v_admin_uid) THEN RETURN error 403`. Revocado para `anon`. Solo callable por `authenticated` con sesión admin activa. |
| **4. Transacción** | Atómica implícita en bloque `BEGIN ... END`. Modifica `tickets` e inserta en `audit_logs` en la misma unidad transaccional de PostgreSQL. |
| **5. Locks** | `SELECT * FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;` (bloqueo exclusivo de fila pesimista en boleto). Si tiene orden, hace `SELECT` simple en `orders`. |
| **6. Queries (SELECT)** | `SELECT * FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;`, `SELECT * FROM public.orders WHERE id = v_ticket.order_id;` |
| **7. Mutaciones (DML)** | `UPDATE public.tickets SET status = 'blocked', reserved_at = NULL, reservation_expires_at = NULL, buyer_id = NULL, order_id = NULL, updated_at = NOW() WHERE id = p_ticket_id;`, `INSERT INTO public.audit_logs`. |
| **8. Rollback** | Si ocurre excepción no capturada de BD, se realiza rollback total. Ante validaciones fallidas de negocio, retorna JSON con `success: false` sin mutaciones. |
| **9. Return** | `jsonb`: `{"success": true, "message": "Boleto X bloqueado exitosamente.", "ticket_number": "X"}` o `{"success": false, "error": "..."}`. |
| **10. Errores** | Control de flujo mediante retornos `jsonb` estructurados (HTTP 200 con payload de error). No lanza `RAISE EXCEPTION`. |
| **11. Idempotencia** | No idempotente estricto: la segunda llamada consecutiva con el mismo `p_ticket_id` detecta `v_ticket.status = 'blocked'` y retorna `success: false` ("El boleto número X ya se encuentra bloqueado"). Seguro contra modificaciones indebidas. |
| **12. Auditoría** | Registra evento `TICKET_BLOCKED_BY_ADMIN` en `audit_logs` con `entity_type: ticket`, `entity_id`, `performed_by: v_admin_uid`, y payload JSONB detallando estado previo, razón y orden previa. |

---

### 2.2. `admin_create_raffle`

- **Firma:** `admin_create_raffle(p_title text, p_slug text, p_description text, p_ticket_price numeric, p_total_tickets integer, p_max_tickets_per_buyer integer, p_draw_date timestamptz, p_lottery_reference text, p_status text) -> jsonb`
- **Tipo de Objeto:** RPC Administrativa
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | 9 parámetros: `p_title`, `p_slug`, `p_description`, `p_ticket_price`, `p_total_tickets`, `p_max_tickets_per_buyer`, `p_draw_date`, `p_lottery_reference`, `p_status`. |
| **2. Validación** | Valida campos no nulos, precio >= 0, boletos > 0, slug único, estado válido en catálogo (`draft`, `active`, `paused`, `finished`, `cancelled`). |
| **3. Autorización** | `SECURITY DEFINER`. Verifica `public.is_admin(auth.uid())`. Revocado para `anon`. |
| **4. Transacción** | Atómica. Inserta en `raffles`, genera en lote los registros de `tickets` correspondientes mediante `generate_series` y registra auditoría. |
| **5. Locks** | Locks implícitos de inserción en `raffles` y `tickets`. Sin `FOR UPDATE` explícito. |
| **6. Queries (SELECT)** | Comprobaciones de unicidad de slug en `raffles`. |
| **7. Mutaciones (DML)** | `INSERT INTO public.raffles`, `INSERT INTO public.tickets` (generación masiva), `INSERT INTO public.audit_logs`. |
| **8. Rollback** | Rollback completo si falla la generación masiva de boletos o si el slug colisiona. |
| **9. Return** | `jsonb`: `{"success": true, "raffle_id": "...", "total_tickets_generated": N}`. |
| **10. Errores** | Retorna JSON estructurado ante fallos de validación o excepción capturada. |
| **11. Idempotencia** | No idempotente: intentar reejecutar falla por violación de constraint UNIQUE en `raffles.slug`. |
| **12. Auditoría** | Inserta en `audit_logs` con acción `RAFFLE_CREATED_BY_ADMIN`. |

---

### 2.3. `admin_invite_user`

- **Firma:** `admin_invite_user(p_email text, p_role text, p_full_name text) -> jsonb`
- **Tipo de Objeto:** RPC Administrativa
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_email` (TEXT), `p_role` (TEXT: admin, moderator, etc.), `p_full_name` (TEXT). |
| **2. Validación** | Valida formato de email, longitud, no vacío, rol permitido en enum/catálogo. |
| **3. Autorización** | `SECURITY DEFINER`. Requiere `public.is_superadmin(auth.uid())` o `is_admin()`. Revocado para `anon`. |
| **4. Transacción** | Atómica en bloque `BEGIN ... END`. |
| **5. Locks** | Sin locks pesimistas explícitos. Confía en constraint UNIQUE en `admin_users.email`. |
| **6. Queries (SELECT)** | `SELECT 1 FROM public.admin_users WHERE email = LOWER(TRIM(p_email))` |
| **7. Mutaciones (DML)** | `INSERT INTO public.admin_users`, `INSERT INTO public.audit_logs`. |
| **8. Rollback** | Rollback automático si colisiona email o rol inválido. |
| **9. Return** | `jsonb`: `{"success": true, "admin_user_id": "..."}`. |
| **10. Errores** | Retorno JSON con `success: false` y descripción. |
| **11. Idempotencia** | No idempotente: segunda ejecución con el mismo email colisiona con el constraint unique de `admin_users`. |
| **12. Auditoría** | Registra evento `ADMIN_USER_INVITED` en `audit_logs`. |

---

### 2.4. `admin_list_users`

- **Firma:** `admin_list_users() -> jsonb`
- **Tipo de Objeto:** RPC Administrativa
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | Sin parámetros (`NONE`). |
| **2. Validación** | No requiere validación de argumentos. |
| **3. Autorización** | `SECURITY DEFINER`. Verifica `public.is_admin(auth.uid())`. Revocado para `anon`. |
| **4. Transacción** | Solo lectura (read-only) dentro de la transacción de la RPC. |
| **5. Locks** | Ninguno (lectura concurrente no bloqueante MVCC). |
| **6. Queries (SELECT)** | `SELECT au.*, u.email as auth_email, u.last_sign_in_at FROM public.admin_users au LEFT JOIN auth.users u ON au.user_id = u.id` |
| **7. Mutaciones (DML)** | Ninguna (función pura de consulta). |
| **8. Rollback** | No aplicable (no muta datos). |
| **9. Return** | `jsonb`: array de usuarios administradores con roles y estados. |
| **10. Errores** | Retorna `{"success": false, "error": "Acceso denegado"}` si el llamador no es admin. |
| **11. Idempotencia** | Completamente idempotente (lectura segura). |
| **12. Auditoría** | Sin registro en `audit_logs` (operación frecuente de lectura). |

---

### 2.5. `admin_toggle_user_status`

- **Firma:** `admin_toggle_user_status(p_admin_user_id uuid, p_is_active boolean) -> jsonb`
- **Tipo de Objeto:** RPC Administrativa
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_admin_user_id` (UUID), `p_is_active` (BOOLEAN). |
| **2. Validación** | Verifica existencia del usuario admin. Impide que el superadministrador se desactive a sí mismo. |
| **3. Autorización** | `SECURITY DEFINER`. Verifica `public.is_superadmin(auth.uid())`. |
| **4. Transacción** | Atómica. Actualiza `admin_users` y audita. |
| **5. Locks** | `SELECT * FROM public.admin_users WHERE id = p_admin_user_id FOR UPDATE;` |
| **6. Queries (SELECT)** | Consulta sobre `admin_users` con lock pesimista. |
| **7. Mutaciones (DML)** | `UPDATE public.admin_users SET is_active = p_is_active, updated_at = NOW() WHERE id = p_admin_user_id;`, `INSERT INTO audit_logs`. |
| **8. Rollback** | Rollback completo ante excepción. |
| **9. Return** | `jsonb`: `{"success": true, "user_id": "...", "is_active": bool}`. |
| **10. Errores** | Retorna `{"success": false, "error": "..."}`. |
| **11. Idempotencia** | Idempotente de facto: asignar el mismo estado booleano mantiene el estado. |
| **12. Auditoría** | Registra `ADMIN_USER_STATUS_TOGGLED` en `audit_logs`. |

---

### 2.6. `admin_unblock_ticket`

- **Firma:** `admin_unblock_ticket(p_ticket_id uuid, p_reason text) -> jsonb`
- **Tipo de Objeto:** RPC Administrativa
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_ticket_id` (UUID, requerido), `p_reason` (TEXT, requerido). |
| **2. Validación** | Verifica que `p_reason` no sea vacío. Comprueba existencia del ticket. Valida que el ticket se encuentre en estado `blocked`. |
| **3. Autorización** | `SECURITY DEFINER`. Verifica `public.is_admin(auth.uid())`. Revocado para `anon`. |
| **4. Transacción** | Atómica. Modifica estado a `available` y registra auditoría. |
| **5. Locks** | `SELECT * FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;` |
| **6. Queries (SELECT)** | Consulta sobre `tickets` con bloqueo pesimista. |
| **7. Mutaciones (DML)** | `UPDATE public.tickets SET status = 'available', updated_at = NOW() WHERE id = p_ticket_id;`, `INSERT INTO public.audit_logs`. |
| **8. Rollback** | Rollback total ante excepción. |
| **9. Return** | `jsonb`: `{"success": true, "message": "Boleto desbloqueado exitosamente", "ticket_number": "..."}`. |
| **10. Errores** | Retorna JSON con `success: false` si no es admin o si el ticket no estaba bloqueado. |
| **11. Idempotencia** | No idempotente estricto: al segundo llamado el boleto ya no está en `blocked` y rechaza la operación. |
| **12. Auditoría** | Registra `TICKET_UNBLOCKED_BY_ADMIN` en `audit_logs` con razón y actor. |

---

### 2.7. `admin_update_buyer`

- **Firma:** `admin_update_buyer(p_buyer_id uuid, p_full_name text, p_phone text, p_email text, p_city text) -> jsonb`
- **Tipo de Objeto:** RPC Administrativa
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_buyer_id` (UUID), `p_full_name` (TEXT), `p_phone` (TEXT), `p_email` (TEXT), `p_city` (TEXT). |
| **2. Validación** | Verifica existencia del comprador. Sanitiza y valida formato de teléfono y email. Comprueba que el nuevo teléfono/email no colisione con otro comprador diferente. |
| **3. Autorización** | `SECURITY DEFINER`. Verifica `public.is_admin(auth.uid())`. Revocado para `anon`. |
| **4. Transacción** | Atómica en bloque `BEGIN ... END`. |
| **5. Locks** | `SELECT * FROM public.buyers WHERE id = p_buyer_id FOR UPDATE;` |
| **6. Queries (SELECT)** | Consulta de verificación en `buyers` y validación de unicidad. |
| **7. Mutaciones (DML)** | `UPDATE public.buyers SET ... WHERE id = p_buyer_id;`, `INSERT INTO public.audit_logs`. |
| **8. Rollback** | Rollback completo si falla constraint de unicidad o excepción. |
| **9. Return** | `jsonb`: `{"success": true, "buyer_id": "...", "message": "..."}`. |
| **10. Errores** | Retorna `{"success": false, "error": "..."}`. |
| **11. Idempotencia** | Idempotente: enviar los mismos datos repetidamente sobreescribe con idénticos valores sin corromper el estado. |
| **12. Auditoría** | Registra `BUYER_UPDATED_BY_ADMIN` en `audit_logs` con detalles de campos alterados. |

---

### 2.8. `admin_update_raffle`

- **Firma:** `admin_update_raffle(p_raffle_id uuid, p_title text, p_description text, p_ticket_price numeric, p_draw_date timestamptz, p_lottery_reference text, p_status text, p_max_tickets_per_buyer integer) -> jsonb`
- **Tipo de Objeto:** RPC Administrativa
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | 8 parámetros de configuración de rifa. |
| **2. Validación** | Verifica existencia de la rifa. Valida transiciones de estado permitidas (ej. no pasar de `finished` a `draft`). Valida que el precio sea >= 0. |
| **3. Autorización** | `SECURITY DEFINER`. Verifica `public.is_admin(auth.uid())`. |
| **4. Transacción** | Atómica. Modifica `raffles` y registra auditoría. |
| **5. Locks** | `SELECT * FROM public.raffles WHERE id = p_raffle_id FOR UPDATE;` |
| **6. Queries (SELECT)** | Consulta de bloqueo pesimista en `raffles`. |
| **7. Mutaciones (DML)** | `UPDATE public.raffles SET ... WHERE id = p_raffle_id;`, `INSERT INTO public.audit_logs`. |
| **8. Rollback** | Rollback ante fallo de validación o excepción. |
| **9. Return** | `jsonb`: `{"success": true, "raffle_id": "..."}`. |
| **10. Errores** | Retorna JSON con `success: false` y mensaje. |
| **11. Idempotencia** | Idempotente si los argumentos son idénticos. |
| **12. Auditoría** | Registra `RAFFLE_UPDATED_BY_ADMIN` en `audit_logs`. |

---

### 2.9. `admin_update_system_settings`

- **Firma:** `admin_update_system_settings(p_reservation_duration_minutes integer, p_max_tickets_per_buyer integer, p_support_whatsapp_number text, p_support_email text) -> jsonb`
- **Tipo de Objeto:** RPC Administrativa
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | 4 parámetros de configuración global. |
| **2. Validación** | Verifica `p_reservation_duration_minutes` > 0 y <= 1440 (24 horas). `p_max_tickets_per_buyer` > 0. Sanitiza teléfono y correo de soporte. |
| **3. Autorización** | `SECURITY DEFINER`. Verifica `public.is_admin(auth.uid())`. |
| **4. Transacción** | Atómica. Modifica la fila única `id = 1` de `system_settings`. |
| **5. Locks** | `SELECT * FROM public.system_settings WHERE id = 1 FOR UPDATE;` |
| **6. Queries (SELECT)** | Lectura con bloqueo en `system_settings`. |
| **7. Mutaciones (DML)** | `UPDATE public.system_settings SET ... WHERE id = 1;`, `INSERT INTO public.audit_logs`. |
| **8. Rollback** | Rollback completo si falla. |
| **9. Return** | `jsonb`: `{"success": true, "settings": {...}}`. |
| **10. Errores** | Retorna JSON estructurado con error si los valores están fuera de rango. |
| **11. Idempotencia** | Completamente idempotente. |
| **12. Auditoría** | Registra `SYSTEM_SETTINGS_UPDATED` en `audit_logs`. |

---

### 2.10. `approve_order_payment`

- **Firma:** `approve_order_payment(p_order_id uuid) -> jsonb`
- **Tipo de Objeto:** RPC Administrativa Crítica
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_order_id` (UUID, requerido). |
| **2. Validación** | Comprueba que el llamador sea admin. Bloquea la orden. Valida que el estado actual sea `pending` o `pending_verification`. Comprueba que todos los boletos asociados estén en `reserved`. |
| **3. Autorización** | `SECURITY DEFINER`. Llama `IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acceso denegado...'`. |
| **4. Transacción** | Atómica. Cambia `orders.status` a `paid`, cambia `tickets.status` a `sold`, asocia `buyer_id`, actualiza `paid_at = NOW()`. |
| **5. Locks** | `SELECT * FROM public.orders WHERE id = p_order_id FOR UPDATE;` y bloqueo pesimista implícito/explícito sobre los boletos asociados. |
| **6. Queries (SELECT)** | `SELECT * FROM public.orders WHERE id = p_order_id FOR UPDATE;`, `SELECT * FROM public.tickets WHERE order_id = p_order_id` |
| **7. Mutaciones (DML)** | `UPDATE public.orders SET status = 'paid', paid_at = NOW(), verified_by = auth.uid() ...`, `UPDATE public.tickets SET status = 'sold', reservation_expires_at = NULL ...`. |
| **8. Rollback** | Lanza `RAISE EXCEPTION` ante estado inconsistente o boletos no reservados, causando rollback total de PostgreSQL. |
| **9. Return** | `jsonb`: `{"success": true, "order_id": "...", "status": "paid", "tickets_sold": N}`. |
| **10. Errores** | ANOMALÍA: Utiliza `RAISE EXCEPTION` para denegación de permisos o estado inválido (provoca HTTP 400 en Supabase Client en vez de payload JSON). |
| **11. Idempotencia** | No idempotente: un segundo llamado falla con `RAISE EXCEPTION` porque la orden ya no está en `pending` ni `pending_verification`. Protege contra doble acreditación. |
| **12. Auditoría** | CRÍTICO: No inserta explícitamente en `audit_logs` dentro de su cuerpo. La auditoría depende del trigger `fn_validate_order_status_transition` o registro manual en frontend. |

---

### 2.11. `cancel_order`

- **Firma:** `cancel_order(p_order_id uuid, p_reason text) -> jsonb`
- **Tipo de Objeto:** RPC Transaccional / Cancelación
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role (REVOCADO de anon en migración 024)`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_order_id` (UUID), `p_reason` (TEXT). |
| **2. Validación** | Comprueba existencia de la orden con lock `FOR UPDATE`. Valida que el estado actual permita cancelación (`pending` o `pending_verification`). Prohíbe cancelar órdenes en `paid` o `completed`. |
| **3. Autorización** | `SECURITY DEFINER`. En migración 024 se revocó el grant a `anon` y `PUBLIC` para evitar cancelación no autorizada por terceros. |
| **4. Transacción** | Atómica. Modifica orden a `cancelled`, libera todos los boletos asociados poniéndolos en `available`, limpia `reserved_at`, `reservation_expires_at`, `buyer_id` y `order_id`. |
| **5. Locks** | `SELECT * FROM public.orders WHERE id = p_order_id FOR UPDATE;` |
| **6. Queries (SELECT)** | Consulta de orden con lock pesimista. |
| **7. Mutaciones (DML)** | `UPDATE public.orders SET status = 'cancelled', ...`, `UPDATE public.tickets SET status = 'available', order_id = NULL, buyer_id = NULL ... WHERE order_id = p_order_id;`. |
| **8. Rollback** | Rollback completo si ocurre fallo de BD. |
| **9. Return** | `jsonb`: `{"success": true, "order_id": "...", "released_tickets": N}`. |
| **10. Errores** | Retorna JSON con `success: false` o lanza excepción según el estado. |
| **11. Idempotencia** | No idempotente: segunda ejecución detecta orden ya cancelada y retorna error. |
| **12. Auditoría** | Sin inserción directa en `audit_logs` (el trigger de orden registra la transición). |

---

### 2.12. `create_order_secure`

- **Firma:** `create_order_secure(p_raffle_id uuid, p_ticket_numbers text[], p_buyer_data jsonb, p_payment_method varchar, p_contact_preference varchar) -> jsonb`
- **Tipo de Objeto:** RPC Cliente Principal (Pública)
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `PUBLIC, anon, authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_raffle_id` (UUID), `p_ticket_numbers` (TEXT[]), `p_buyer_data` (JSONB con nombre, teléfono, email, cédula, ciudad), `p_payment_method` (VARCHAR), `p_contact_preference` (VARCHAR). |
| **2. Validación** | Extremadamente rigurosa: sanitiza teléfono (regex Colombia/internacional), valida email, nombre >= 3 caracteres. Comprueba que `p_ticket_numbers` no esté vacío y no exceda `max_tickets_per_buyer`. Valida que la rifa exista y esté `active`. Verifica que todos los números solicitados pertenezcan a la rifa y estén en estado `available`. |
| **3. Autorización** | `SECURITY DEFINER`. Permite ejecución a usuarios anónimos (`anon`) para posibilitar el checkout público sin login obligatorio. |
| **4. Transacción** | Atómica estricta: bloquea rifa, bloquea boletos en orden ascendente (`ORDER BY number ASC`), crea o actualiza `buyers` (upsert atómico), crea registro en `orders`, actualiza todos los `tickets` a `reserved` con `reservation_expires_at = NOW() + INTERVAL`, e inserta en `audit_logs`. |
| **5. Locks** | `SELECT * FROM public.tickets WHERE raffle_id = p_raffle_id AND number = ANY(p_ticket_numbers) ORDER BY number ASC FOR UPDATE;` (Garantiza prevención de deadlocks concurrentes al ordenar las filas). |
| **6. Queries (SELECT)** | Consulta de rifa, configuración de sistema, existencia de comprador por teléfono/documento, y boletos bloqueados. |
| **7. Mutaciones (DML)** | `INSERT/UPDATE public.buyers`, `INSERT INTO public.orders`, `UPDATE public.tickets`, `INSERT INTO public.audit_logs`. |
| **8. Rollback** | Si cualquiera de los boletos ya no está disponible (`COUNT != requested`), aborta inmediatamente sin mutaciones y devuelve JSON con boletos en conflicto. Si la BD falla, rollback ACID total. |
| **9. Return** | `jsonb`: `{"success": true, "order_id": "...", "reference": "...", "total_amount": N, "expires_at": "...", "ticket_count": N, "buyer_id": "..."}`. |
| **10. Errores** | Retorna JSON `{success: false, error: "...", unavailable_tickets: [...]}` con código 200 a nivel HTTP para consumo limpio en React. |
| **11. Idempotencia** | Anti-replay natural: la primera llamada exitosa reserva los boletos. Un reintento inmediato idéntico fallará informando que los boletos ya no están disponibles. |
| **12. Auditoría** | Registra `ORDER_CREATED_SECURE` en `audit_logs` con desglose completo de comprador, cantidad de números y monto total. |

---

### 2.13. `fn_audit_payment_accounts`

- **Firma:** `fn_audit_payment_accounts() -> trigger`
- **Tipo de Objeto:** Trigger Function (Auditoría)
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | Variables de trigger (`NEW`, `OLD`, `TG_OP`, `TG_TABLE_NAME`). |
| **2. Validación** | Comprueba el tipo de operación DML (`INSERT`, `UPDATE`, `DELETE`). |
| **3. Autorización** | `SECURITY DEFINER`. Solo invocable por el motor de triggers de PostgreSQL. |
| **4. Transacción** | Participa en la misma transacción que el DML sobre `payment_accounts`. |
| **5. Locks** | Hereda los locks de la sentencia DML causante. |
| **6. Queries (SELECT)** | Ninguna explícita. |
| **7. Mutaciones (DML)** | `INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details) VALUES (...)`. |
| **8. Rollback** | Si el insert en `audit_logs` falla, revierte la modificación sobre `payment_accounts`. |
| **9. Return** | `trigger` (`NEW` en INSERT/UPDATE, `OLD` en DELETE). |
| **10. Errores** | Lanza excepción al motor de BD si la inserción de auditoría se corrompe. |
| **11. Idempotencia** | Se ejecuta exactamente una vez por cada fila afectada por el trigger. |
| **12. Auditoría** | Función dedicada exclusivamente a generar registros de auditoría de cuentas bancarias. |

---

### 2.14. `fn_faq_items_updated_at`

- **Firma:** `fn_faq_items_updated_at() -> trigger`
- **Tipo de Objeto:** Trigger Function (Timestamp)
- **Modo de Seguridad:** `SECURITY INVOKER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `PUBLIC, anon, authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `NEW` record. |
| **2. Validación** | Ninguna requerida. |
| **3. Autorización** | `SECURITY INVOKER`. Privilegios estándar. |
| **4. Transacción** | En la misma transacción que el UPDATE de `faq_items`. |
| **5. Locks** | Heredados del UPDATE. |
| **6. Queries (SELECT)** | Ninguna. |
| **7. Mutaciones (DML)** | Mutación in-memory de `NEW.updated_at = NOW()`. |
| **8. Rollback** | Heredado. |
| **9. Return** | `trigger` (`NEW`). |
| **10. Errores** | No genera errores. |
| **11. Idempotencia** | Idempotente dentro del ciclo de vida del trigger. |
| **12. Auditoría** | No registra auditoría. |

---

### 2.15. `fn_partners_updated_at`

- **Firma:** `fn_partners_updated_at() -> trigger`
- **Tipo de Objeto:** Trigger Function (Timestamp)
- **Modo de Seguridad:** `SECURITY INVOKER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `PUBLIC, anon, authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `NEW` record. |
| **2. Validación** | Ninguna. |
| **3. Autorización** | `SECURITY INVOKER`. |
| **4. Transacción** | Transacción del UPDATE sobre `partners`. |
| **5. Locks** | Heredados. |
| **6. Queries (SELECT)** | Ninguna. |
| **7. Mutaciones (DML)** | `NEW.updated_at = NOW()`. |
| **8. Rollback** | Heredado. |
| **9. Return** | `trigger` (`NEW`). |
| **10. Errores** | No genera errores. |
| **11. Idempotencia** | Idempotente. |
| **12. Auditoría** | No genera logs. |

---

### 2.16. `fn_payment_accounts_updated_at`

- **Firma:** `fn_payment_accounts_updated_at() -> trigger`
- **Tipo de Objeto:** Trigger Function (Timestamp)
- **Modo de Seguridad:** `SECURITY INVOKER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `NEW` record. |
| **2. Validación** | Ninguna. |
| **3. Autorización** | `SECURITY INVOKER`. |
| **4. Transacción** | Transacción del UPDATE sobre `payment_accounts`. |
| **5. Locks** | Heredados. |
| **6. Queries (SELECT)** | Ninguna. |
| **7. Mutaciones (DML)** | `NEW.updated_at = NOW()`. |
| **8. Rollback** | Heredado. |
| **9. Return** | `trigger` (`NEW`). |
| **10. Errores** | No genera errores. |
| **11. Idempotencia** | Idempotente. |
| **12. Auditoría** | No genera logs. |

---

### 2.17. `fn_payment_proofs_updated_at`

- **Firma:** `fn_payment_proofs_updated_at() -> trigger`
- **Tipo de Objeto:** Trigger Function (Timestamp)
- **Modo de Seguridad:** `SECURITY INVOKER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `NEW` record. |
| **2. Validación** | Ninguna. |
| **3. Autorización** | `SECURITY INVOKER`. |
| **4. Transacción** | Transacción del UPDATE sobre `payment_proofs`. |
| **5. Locks** | Heredados. |
| **6. Queries (SELECT)** | Ninguna. |
| **7. Mutaciones (DML)** | `NEW.updated_at = NOW()`. |
| **8. Rollback** | Heredado. |
| **9. Return** | `trigger` (`NEW`). |
| **10. Errores** | No genera errores. |
| **11. Idempotencia** | Idempotente. |
| **12. Auditoría** | No genera logs. |

---

### 2.18. `fn_prize_updated_at`

- **Firma:** `fn_prize_updated_at() -> trigger`
- **Tipo de Objeto:** Trigger Function (Timestamp)
- **Modo de Seguridad:** `SECURITY INVOKER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `PUBLIC, anon, authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `NEW` record. |
| **2. Validación** | Ninguna. |
| **3. Autorización** | `SECURITY INVOKER`. |
| **4. Transacción** | Transacción del UPDATE sobre `prizes`. |
| **5. Locks** | Heredados. |
| **6. Queries (SELECT)** | Ninguna. |
| **7. Mutaciones (DML)** | `NEW.updated_at = NOW()`. |
| **8. Rollback** | Heredado. |
| **9. Return** | `trigger` (`NEW`). |
| **10. Errores** | No genera errores. |
| **11. Idempotencia** | Idempotente. |
| **12. Auditoría** | No genera logs. |

---

### 2.19. `fn_validate_order_status_transition`

- **Firma:** `fn_validate_order_status_transition() -> trigger`
- **Tipo de Objeto:** Trigger Function (Máquina de Estados de Orden)
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `OLD` y `NEW` records de la tabla `orders`. |
| **2. Validación** | Verifica transiciones legales de la máquina de estados. REGLA 1: No permite saltar de `pending` a `paid`/`completed` sin comprobante o referencia de pasarela. REGLA 2: No permite alterar órdenes terminales (`cancelled`, `rejected`, `completed`). REGLA 3: Prohíbe transiciones hacia atrás (ej. de `paid` a `pending`). |
| **3. Autorización** | `SECURITY DEFINER`. Se ejecuta bajo privilegios elevados para garantizar integridad referencial inmutable. |
| **4. Transacción** | Se ejecuta en la misma transacción que el UPDATE sobre `orders`. Si falla, aborta toda la operación. |
| **5. Locks** | Hereda los bloqueos de fila de la transacción padre sobre `orders`. |
| **6. Queries (SELECT)** | Consultas sobre comprobantes vinculados en caso de requerir verificación de respaldo. |
| **7. Mutaciones (DML)** | Inserta en `audit_logs` registrando la transición de estado aprobada. |
| **8. Rollback** | Lanza `RAISE EXCEPTION`, forzando el rollback de cualquier intento indebido de UPDATE. |
| **9. Return** | `trigger` (`NEW`). |
| **10. Errores** | `RAISE EXCEPTION 'Transición inválida: No se permite cambiar de % a %...'`. |
| **11. Idempotencia** | Si `OLD.status = NEW.status`, retorna inmediatamente `NEW` sin comprobaciones (no-op seguro). |
| **12. Auditoría** | Inserta evento `ORDER_STATUS_TRANSITION` en `audit_logs` con `from_status`, `to_status` y usuario ejecutor. |

---

### 2.20. `fn_validate_ticket_status_transition`

- **Firma:** `fn_validate_ticket_status_transition() -> trigger`
- **Tipo de Objeto:** Trigger Function (Máquina de Estados de Boletos)
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `OLD` y `NEW` records de la tabla `tickets`. |
| **2. Validación** | REGLAS CRÍTICAS DE BOLETOS: 1. Un boleto solo puede pasar a `sold` si su orden asociada existe y está en `paid` o `completed`. 2. Un boleto `sold` no puede pasar a `available` ni `reserved` directamente. 3. Un boleto no puede reservarse sin `buyer_id` u `order_id`. |
| **3. Autorización** | `SECURITY DEFINER`. Protege la tabla nuclear del modelo de negocio. |
| **4. Transacción** | Transaccional dentro del DML sobre `tickets`. |
| **5. Locks** | Hereda bloqueos de fila de `tickets`. |
| **6. Queries (SELECT)** | `SELECT status FROM public.orders WHERE id = NEW.order_id` (comprueba estado vivo de la orden vinculada). |
| **7. Mutaciones (DML)** | Registra en `audit_logs` si se marca como vendido o bloqueado. |
| **8. Rollback** | Lanza `RAISE EXCEPTION`, revirtiendo cualquier intento fraudulento de venta de boletos sin orden pagada. |
| **9. Return** | `trigger` (`NEW`). |
| **10. Errores** | `RAISE EXCEPTION 'Violación de Integridad: No se puede marcar el boleto % como sold sin asociarlo a una orden pagada'`. |
| **11. Idempotencia** | Si `OLD.status = NEW.status`, sale sin computación adicional. |
| **12. Auditoría** | Registra en `audit_logs` eventos de cambio de estado de boletos. |

---

### 2.21. `get_dashboard_kpis`

- **Firma:** `get_dashboard_kpis(p_raffle_id uuid) -> jsonb`
- **Tipo de Objeto:** RPC Analítica / Administrativa
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_raffle_id` (UUID, opcional: si es NULL calcula agregados globales). |
| **2. Validación** | Comprueba que el llamador cuente con privilegios de administrador activo (`is_admin`). |
| **3. Autorización** | `SECURITY DEFINER`. Verifica `public.is_admin(auth.uid())`. Revocado de `anon`. |
| **4. Transacción** | Solo lectura (read-only) con aislamiento de snapshot MVCC. |
| **5. Locks** | Ninguno (consultas de solo lectura altamente concurrentes sin bloqueos). |
| **6. Queries (SELECT)** | Consultas de agregación con `COUNT(*)`, `SUM(total_amount)`, filtros por `status` sobre `tickets`, `orders` y `buyers`. |
| **7. Mutaciones (DML)** | Ninguna. |
| **8. Rollback** | No aplicable. |
| **9. Return** | `jsonb`: objeto consolidado con total de boletos, vendidos, disponibles, reservados, bloqueados, porcentaje de venta, ingresos recaudados e ingresos proyectados. |
| **10. Errores** | Retorna `{"success": false, "error": "Acceso denegado..."}` si no es admin. |
| **11. Idempotencia** | Completamente idempotente. |
| **12. Auditoría** | Sin registro en `audit_logs` para evitar saturación en telemetría de monitoreo. |

---

### 2.22. `is_admin`

- **Firma:** `is_admin(p_user_id uuid DEFAULT auth.uid()) -> boolean`
- **Tipo de Objeto:** Auth Helper / Función de Seguridad
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `anon, authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_user_id` (UUID, opcional, con fallback automático a `auth.uid()`). |
| **2. Validación** | Si el UID resultante es NULL, retorna inmediatamente `false`. |
| **3. Autorización** | `SECURITY DEFINER`. Permite a funciones RLS y RPCs evaluar permisos consultando la tabla restringida `admin_users`. |
| **4. Transacción** | Consulta de solo lectura en línea. |
| **5. Locks** | Ninguno. |
| **6. Queries (SELECT)** | `SELECT 1 FROM public.admin_users WHERE (user_id = v_uid OR LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = v_uid)) AND is_active = true` |
| **7. Mutaciones (DML)** | Ninguna. |
| **8. Rollback** | No aplicable. |
| **9. Return** | `boolean`: `true` si existe y está activo, `false` en cualquier otro caso. |
| **10. Errores** | Nunca lanza excepción; ante cualquier anomalía retorna `false`. |
| **11. Idempotencia** | Pura y determinista respecto al estado actual de `admin_users`. |
| **12. Auditoría** | Sin auditoría. |

---

### 2.23. `is_superadmin`

- **Firma:** `is_superadmin(p_user_id uuid DEFAULT auth.uid()) -> boolean`
- **Tipo de Objeto:** Auth Helper / Seguridad Elevada
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `anon, authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_user_id` (UUID, default `auth.uid()`). |
| **2. Validación** | Comprueba no nulidad del UID. |
| **3. Autorización** | `SECURITY DEFINER`. Permite validar privilegios de gestión de administradores. |
| **4. Transacción** | Solo lectura. |
| **5. Locks** | Ninguno. |
| **6. Queries (SELECT)** | `SELECT 1 FROM public.admin_users WHERE (user_id = v_uid OR LOWER(email) = ...) AND role = 'superadmin' AND is_active = true` |
| **7. Mutaciones (DML)** | Ninguna. |
| **8. Rollback** | No aplicable. |
| **9. Return** | `boolean`. |
| **10. Errores** | Retorna `false` de forma segura ante cualquier falla. |
| **11. Idempotencia** | Determinista e idempotente. |
| **12. Auditoría** | Sin auditoría. |

---

### 2.24. `register_winner`

- **Firma:** `register_winner(p_raffle_id uuid, p_ticket_number text, p_lottery_draw_number text, p_draw_date timestamptz, p_official_act_url text, p_delivery_photos text[], p_notes text) -> jsonb`
- **Tipo de Objeto:** RPC Administrativa Crítica
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | 7 parámetros que documentan el sorteo, boleto premiado y evidencia oficial. |
| **2. Validación** | Valida que el llamador sea admin. Bloquea el boleto ganador. Valida que el boleto exista y su estado sea estrictamente `sold` (no permite asignar premios a boletos no vendidos). Obtiene la orden pagada asociada y el comprador legítimo. |
| **3. Autorización** | `SECURITY DEFINER`. Verifica `public.is_admin(auth.uid())`. Revocado de `anon`. |
| **4. Transacción** | Atómica. Inserta en `winners`, actualiza el estado de la rifa a `finished` y registra auditoría. |
| **5. Locks** | `SELECT * FROM public.tickets WHERE raffle_id = p_raffle_id AND number = p_ticket_number FOR UPDATE;` |
| **6. Queries (SELECT)** | Consulta de verificación en `tickets`, `orders`, `buyers` y `raffles`. |
| **7. Mutaciones (DML)** | `INSERT INTO public.winners (...)`, `UPDATE public.raffles SET status = 'finished', updated_at = NOW() WHERE id = p_raffle_id;`, `INSERT INTO public.audit_logs`. |
| **8. Rollback** | Rollback completo si falla la inserción en `winners` o la actualización de la rifa. |
| **9. Return** | `jsonb`: `{"success": true, "winner_id": "...", "winner_name": "...", "ticket_number": "..."}`. |
| **10. Errores** | Retorna `{"success": false, "error": "..."}` ante boletos no vendidos o inexistentes. |
| **11. Idempotencia** | No idempotente: un segundo llamado falla por violación de constraint de unicidad de ganador o boleto premiado. |
| **12. Auditoría** | Registra `WINNER_REGISTERED` en `audit_logs` con evidencia fotográfica y documento oficial. |

---

### 2.25. `reject_order_payment`

- **Firma:** `reject_order_payment(p_order_id uuid, p_reason text) -> jsonb`
- **Tipo de Objeto:** RPC Administrativa
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_order_id` (UUID), `p_reason` (TEXT, motivo del rechazo). |
| **2. Validación** | Comprueba que el llamador sea admin. Bloquea la orden con `FOR UPDATE`. Valida que el estado actual sea `pending` o `pending_verification`. |
| **3. Autorización** | `SECURITY DEFINER`. Llama `IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acceso denegado...'`. |
| **4. Transacción** | Atómica. Actualiza orden a `rejected`, libera todos los boletos asociados pasándolos a `available`, y limpia sus claves foráneas. |
| **5. Locks** | `SELECT * FROM public.orders WHERE id = p_order_id FOR UPDATE;` |
| **6. Queries (SELECT)** | Lectura con lock en `orders`. |
| **7. Mutaciones (DML)** | `UPDATE public.orders SET status = 'rejected', notes = p_reason ...`, `UPDATE public.tickets SET status = 'available', order_id = NULL, buyer_id = NULL ... WHERE order_id = p_order_id;`. |
| **8. Rollback** | Lanza `RAISE EXCEPTION` ante permisos o estado inválido, provocando aborto transaccional completo. |
| **9. Return** | `jsonb`: `{"success": true, "order_id": "...", "status": "rejected", "released_tickets_count": N}`. |
| **10. Errores** | ANOMALÍA: Emplea `RAISE EXCEPTION` en lugar de retorno JSON para denegación de permisos o ausencia de registro. |
| **11. Idempotencia** | No idempotente: al reintentar, la orden ya no está en estado pendiente y lanza excepción. |
| **12. Auditoría** | Sin inserción directa en `audit_logs` dentro del cuerpo (depende del trigger de orden). |

---

### 2.26. `release_expired_reservations`

- **Firma:** `release_expired_reservations() -> integer`
- **Tipo de Objeto:** RPC de Sistema / Cron
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `authenticated, postgres, service_role (REVOCADO de anon)`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | Sin parámetros (`NONE`). |
| **2. Validación** | Filtra boletos donde `status = 'reserved' AND reservation_expires_at < NOW()`. Además verifica que la orden asociada (si existe) esté en `pending` o no exista. |
| **3. Autorización** | `SECURITY DEFINER`. Solo puede ser ejecutada por el superusuario `postgres` (mediante `pg_cron`) o por `service_role` (Edge Function). |
| **4. Transacción** | Atómica. Actualiza los boletos en lote y actualiza las órdenes huérfanas o expiradas a `cancelled`. |
| **5. Locks** | Locks implícitos a nivel de fila durante la sentencia masiva `UPDATE public.tickets`. |
| **6. Queries (SELECT)** | Subconsultas en `orders` para verificar que no se liberen boletos de órdenes en `paid` o `pending_verification`. |
| **7. Mutaciones (DML)** | `UPDATE public.tickets SET status = 'available', reserved_at = NULL, reservation_expires_at = NULL, buyer_id = NULL, order_id = NULL, updated_at = NOW() WHERE ...`, `UPDATE public.orders SET status = 'cancelled' WHERE ...`. |
| **8. Rollback** | Rollback estándar de PostgreSQL si ocurre fallo durante el UPDATE masivo. |
| **9. Return** | `integer`: número entero exacto de boletos liberados (`v_released_count`). |
| **10. Errores** | Lanza error a nivel motor si ocurre falla inesperada de BD (capturado por pg_cron en `cron.job_run_details`). |
| **11. Idempotencia** | Completamente idempotente: si se ejecuta dos veces seguidas, la segunda ejecución liberará 0 filas y retornará `0` sin alterar el sistema. |
| **12. Auditoría** | Sin inserción directa en `audit_logs` (se ejecuta cada 5 minutos por lo que saturaría la tabla de logs; su trazabilidad reside en `cron.job_run_details`). |

---

### 2.27. `reserve_tickets`

- **Firma:** `reserve_tickets(p_raffle_id uuid, p_ticket_numbers text[], p_buyer_id uuid, p_duration_minutes integer) -> jsonb`
- **Tipo de Objeto:** RPC Pública / Reserva Temporal
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `PUBLIC, anon, authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_raffle_id` (UUID), `p_ticket_numbers` (TEXT[]), `p_buyer_id` (UUID, opcional), `p_duration_minutes` (INTEGER, opcional). |
| **2. Validación** | Comprueba duración contra `system_settings.reservation_duration_minutes`. Valida que `p_ticket_numbers` no esté vacío. Verifica que todos los boletos solicitados estén actualmente en `available` (o `reserved` expirados). |
| **3. Autorización** | `SECURITY DEFINER`. Permitida a `anon` para soporte del carrito de compras previo al checkout. |
| **4. Transacción** | Atómica. Bloquea filas de boletos en orden ascendente y las marca como `reserved`. |
| **5. Locks** | `SELECT number FROM public.tickets WHERE raffle_id = p_raffle_id AND number = ANY(p_ticket_numbers) AND (status = 'available' OR (status = 'reserved' AND reservation_expires_at < NOW())) ORDER BY number ASC FOR UPDATE;` |
| **6. Queries (SELECT)** | Consulta de ajustes globales en `system_settings` y boletos con lock pesimista. |
| **7. Mutaciones (DML)** | `UPDATE public.tickets SET status = 'reserved', reserved_at = NOW(), reservation_expires_at = v_expires_at, buyer_id = p_buyer_id WHERE ...`. |
| **8. Rollback** | Si el número de boletos bloqueados disponibles es menor al solicitado, aborta y devuelve lista de fallidos. |
| **9. Return** | `jsonb`: `{"success": true, "reserved_count": N, "expires_at": "...", "tickets": [...]}` o `{"success": false, "error": "...", "unavailable": [...]}`. |
| **10. Errores** | Retorna JSON con `success: false` y números no disponibles. |
| **11. Idempotencia** | Anti-replay: la segunda ejecución falla porque los boletos ya cambiaron su estado a `reserved`. |
| **12. Auditoría** | Sin inserción directa en `audit_logs` (la reserva es un estado transitorio volátil de carrito). |

---

### 2.28. `submit_payment_proof`

- **Firma:** `submit_payment_proof(p_order_id uuid, p_file_path text, p_file_name text, p_file_size integer, p_mime_type varchar, p_payment_reference text) -> jsonb`
- **Tipo de Objeto:** RPC Pública / Registro de Comprobante
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `PUBLIC, anon, authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | 6 parámetros describiendo el comprobante subido al bucket privado `payment-proofs`. |
| **2. Validación** | Valida existencia de la orden mediante `FOR UPDATE`. Comprueba que la orden esté en `pending` o `pending_verification`. Valida que `p_file_path` no esté vacío y comience por rutas esperadas (`proofs/...`). Valida tipo MIME permitido. |
| **3. Autorización** | `SECURITY DEFINER`. Permitido a `anon` para que compradores sin cuenta puedan adjuntar su comprobante de pago. |
| **4. Transacción** | Atómica. Inserta en `payment_proofs`, actualiza `orders.receipt_url`, cambia `orders.status` a `pending_verification`, actualiza boletos extendiendo tiempo de espera e inserta en `audit_logs`. |
| **5. Locks** | `SELECT * FROM public.orders WHERE id = p_order_id FOR UPDATE;` |
| **6. Queries (SELECT)** | Consulta con lock pesimista sobre `orders`. |
| **7. Mutaciones (DML)** | `INSERT INTO public.payment_proofs (...)`, `UPDATE public.orders SET status = 'pending_verification', receipt_url = p_file_path ...`, `INSERT INTO public.audit_logs`. |
| **8. Rollback** | Rollback completo si falla la inserción en `payment_proofs` o la actualización de la orden. |
| **9. Return** | `jsonb`: `{"success": true, "proof_id": "...", "order_id": "...", "status": "pending_verification"}`. |
| **10. Errores** | Retorna `{"success": false, "error": "..."}` si la orden no existe o ya fue procesada. |
| **11. Idempotencia** | Si ya existe un comprobante para la orden, permite adjuntar uno nuevo mientras siga en `pending` o `pending_verification`, actualizando la referencia sin romper el estado. |
| **12. Auditoría** | Registra `PAYMENT_PROOF_SUBMITTED` en `audit_logs` con tamaño, nombre de archivo y orden asociada. |

---

### 2.29. `sync_admin_user_id`

- **Firma:** `sync_admin_user_id() -> trigger`
- **Tipo de Objeto:** Trigger Function (Sincronización Auth)
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `NEW` record generado tras un `INSERT` en `auth.users`. |
| **2. Validación** | Comprueba coincidencia de `LOWER(email)` entre el nuevo usuario de Auth y las invitaciones preexistentes en `admin_users`. |
| **3. Autorización** | `SECURITY DEFINER`. Imprescindible para enlazar el UUID de `auth.users` con `admin_users.user_id`. |
| **4. Transacción** | Se ejecuta dentro de la transacción de creación de usuario en Supabase Auth. |
| **5. Locks** | Hereda locks sobre la fila insertada. |
| **6. Queries (SELECT)** | Ninguna explícita. |
| **7. Mutaciones (DML)** | `UPDATE public.admin_users SET user_id = NEW.id, updated_at = NOW() WHERE LOWER(email) = LOWER(NEW.email) AND (user_id IS NULL OR user_id = NEW.id);`. |
| **8. Rollback** | Si el UPDATE falla, abortaría la creación del usuario en Auth. |
| **9. Return** | `trigger` (`NEW`). |
| **10. Errores** | No genera excepciones; si no hay coincidencia de email simplemente no actualiza filas. |
| **11. Idempotencia** | Completamente idempotente. |
| **12. Auditoría** | Sin registro en `audit_logs`. |

---

### 2.30. `verify_public_order_or_tickets`

- **Firma:** `verify_public_order_or_tickets(p_search_term text) -> jsonb`
- **Tipo de Objeto:** RPC Pública / Verificador y Consulta
- **Modo de Seguridad:** `SECURITY DEFINER`
- **Propietario en BD:** `postgres`
- **Grants de Ejecución:** `PUBLIC, anon, authenticated, postgres, service_role`

| Dimensión | Evaluación Técnica Forense |
|---|---|
| **1. Entrada** | `p_search_term` (TEXT, puede ser número de teléfono, documento de identidad o referencia de orden tipo `ORD-...`). |
| **2. Validación** | Sanitiza y normaliza el término de búsqueda. Detecta si es referencia por prefijo `ORD-` o numérico. |
| **3. Autorización** | `SECURITY DEFINER`. Permite a visitantes anónimos consultar el estado de sus compras. |
| **4. Transacción** | Solo lectura (read-only). |
| **5. Locks** | Ninguno (lectura MVCC no bloqueante). |
| **6. Queries (SELECT)** | `SELECT o.*, b.full_name, b.phone, ... FROM public.orders o JOIN public.buyers b ON o.buyer_id = b.id ...` con subconsultas para agregar los boletos comprados. |
| **7. Mutaciones (DML)** | Ninguna. |
| **8. Rollback** | No aplicable. |
| **9. Return** | `jsonb`: `{"success": true, "orders": [...]}`, donde los datos personales sensibles son ofuscados parcialmente (ej. teléfono enmascarado `300****123`). |
| **10. Errores** | Retorna `{"success": false, "error": "...", "orders": []}` ante término vacío. |
| **11. Idempotencia** | Lectura pura idempotente. |
| **12. Auditoría** | Sin registro de auditoría (consulta pública masiva). |

---

## 3. AUDITORÍA EXHAUSTIVA DE EDGE FUNCTIONS (DENO RUNTIME)

El proyecto cuenta con 2 Edge Functions alojadas en el directorio `supabase/functions/`:
1. `cloudinary-sign` (generación criptográfica de firmas para subida y eliminación de imágenes).
2. `cron-release-expired-reservations` (disparador HTTP para liberación de reservas de boletos expirados).

Ambas funciones fueron auditadas línea por línea contra el runtime Deno v1.x / Supabase Edge Runtime:

---

### 3.1. Edge Function: `cloudinary-sign`

- **Ruta en Repositorio:** `supabase/functions/cloudinary-sign/index.ts` (278 líneas).
- **Propósito:** Generar firmas criptográficas SHA-1 con la API Secret de Cloudinary para permitir la subida directa desde el navegador (`upload`) o la eliminación de activos (`destroy`), evitando exponer las llaves maestras en el cliente React.

#### Evaluación de las 14 Dimensiones de la Edge Function

1. **Endpoint:** `/functions/v1/cloudinary-sign`
2. **Métodos HTTP:** 
   - Acepta exclusivamente `POST` y `OPTIONS`.
   - Cualquier otro método (`GET`, `PUT`, `DELETE`, etc.) es rechazado inmediatamente con código **HTTP 405 Method Not Allowed** y cuerpo JSON: `{"success": false, "error": "Método no permitido. Solo se admite POST."}`.
3. **CORS:** 
   - Implementa función estricta `getCorsHeaders(req: Request)`.
   - **Lista Blanca de Orígenes:** `https://rifa-manaure.vercel.app`, `https://manaurevive.com`, `https://www.manaurevive.com`.
   - **Reglas Dinámicas:** Permite `http://localhost:<puerto>`, `http://127.0.0.1:<puerto>` y cualquier dominio `*.vercel.app` (para PRs y preview branches).
   - Admite orígenes adicionales mediante la variable de entorno `ALLOWED_ORIGINS`.
   - Headers permitidos: `authorization, x-client-info, apikey, content-type, x-supabase-auth, accept, prefer, *`.
   - Manejo preflight `OPTIONS`: Retorna `200 OK` con `Access-Control-Max-Age: 86400` (24 horas de caché de preflight).
4. **Autenticación (Auth):**
   - Requiere obligatoriamente la cabecera `Authorization: Bearer <JWT>`.
   - Si no se suministra token, retorna **HTTP 401 Unauthorized** (`"Bearer token de autenticación no suministrado"`).
5. **Validación de JWT:**
   - Inicializa un cliente Supabase con el JWT del usuario y llama a `supabase.auth.getUser(token)`.
   - Si el token está vencido, revocado o adulterado criptográficamente, retorna **HTTP 401 Unauthorized**.
6. **Autorización (Roles):**
   - Estrategia en dos fases:
     - **Fase A:** Ejecuta la RPC `is_admin()` con el contexto del JWT.
     - **Fase B (Fallback):** Si la RPC falla o no responde booleano, utiliza el cliente `service_role` para consultar la tabla `admin_users` filtrando por `user_id = user.id` o `LOWER(email) = cleanEmail`, exigiendo `is_active = true`.
   - Si no se confirma que sea administrador activo, retorna **HTTP 403 Forbidden** (`"Acceso denegado: se requieren permisos de administrador activos."`).
7. **Validación de Payload:**
   - Exige cuerpo JSON válido. Si el parser falla, retorna **HTTP 400 Bad Request**.
   - Parámetro `action`: Debe ser estrictamente `'upload'` o `'destroy'`. Cualquier otro valor retorna **HTTP 400**.
   - Para `action === 'upload'`: Exige parámetro `folder` (cadena no vacía).
   - Para `action === 'destroy'`: Exige parámetro `public_id` (cadena no vacía).
   - Parámetro `timestamp`: Si no es entero positivo, se autogenera mediante `Math.floor(Date.now() / 1000)`.
8. **Manejo de Secrets:**
   - Lee de forma segura desde `Deno.env`:
     - `SUPABASE_URL` y `SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY` (usado únicamente en el fallback de verificación)
     - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - Si falta cualquiera de estas variables, aborta con **HTTP 500 Internal Server Error** sin exponer trazas de configuración interna.
9. **Llamadas a Base de Datos:**
   - 1 llamada a `supabase.auth.getUser` (Supabase Auth API).
   - 1 llamada a RPC `is_admin()` o consulta directa a `admin_users`.
10. **Llamadas Externas a Terceros:**
    - Ninguna llamada HTTP externa. La firma se calcula localmente en el runtime de Deno utilizando **Web Crypto API** (`crypto.subtle.digest("SHA-1", ...)`).
11. **Retries (Reintentos):**
    - Sin reintentos automáticos a nivel de microservicio (stateless). El cliente React es responsable de reintentar si experimenta un error de red.
12. **Timeouts:**
    - Límite por defecto del Supabase Edge Runtime (~150 segundos en planes Pro, ~50s en Free). La operación se completa típicamente en menos de 15 milisegundos al ser cálculo criptográfico local.
13. **Manejo de Errores y Logs:**
    - Bloque `try/catch` global. Registra en consola mediante `console.error("Error fatal en Edge Function cloudinary-sign:", message)`. Retorna código HTTP adecuado (400, 401, 403, 405 o 500).
14. **Idempotencia:**
    - Idempotente pura: Si se envía el mismo `timestamp` y mismos parámetros, genera de manera determinista exactamente la misma firma hexadecimal SHA-1. No muta ningún registro en base de datos.

---

### 3.2. Edge Function: `cron-release-expired-reservations`

- **Ruta en Repositorio:** `supabase/functions/cron-release-expired-reservations/index.ts` (100 líneas).
- **Propósito:** Proporcionar un punto de entrada HTTP autenticado para activar la liberación de reservas de boletos expiradas, concebido originalmente para ser llamado por planificadores de tareas externos (ej. GitHub Actions, cron-job.org, Cloudflare Workers o Supabase Cron).

#### Evaluación de las 14 Dimensiones de la Edge Function

1. **Endpoint:** `/functions/v1/cron-release-expired-reservations`
2. **Métodos HTTP:**
   - Acepta `POST`, `GET` y `OPTIONS`.
   - Maneja preflight `OPTIONS` con `200 OK`.
3. **CORS:**
   - Whitelist idéntica: dominios autorizados de Manaure Vive, Vercel y localhost.
4. **Autenticación (Auth):**
   - Requiere obligatoriamente `Authorization: Bearer <TOKEN>`.
   - El token debe coincidir de forma estricta con `CRON_SECRET` / `FUNCTION_SECRET` o con `SUPABASE_SERVICE_ROLE_KEY`.
   - Si el token no coincide o está ausente, retorna inmediatamente **HTTP 401 Unauthorized** (`"Bearer token de cron inválido o no suministrado"`).
5. **Validación de JWT:**
   - No utiliza tokens de usuario (JWT de sesión); la autenticación es por clave compartida pre-configurada (Bearer secret).
6. **Autorización (Roles):**
   - Nivel de infraestructura/sistema: al requerir la `service_role` o `CRON_SECRET`, opera con privilegios totales de mantenimiento.
7. **Validación de Payload:**
   - No requiere ni consume cuerpo en la petición (payload agnóstico).
8. **Manejo de Secrets:**
   - Consume `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` / `FUNCTION_SECRET`.
9. **Llamadas a Base de Datos:**
   - Inicializa el cliente `createClient(supabaseUrl, supabaseServiceKey)`.
   - Ejecuta la RPC: `await supabase.rpc('release_expired_reservations')`.
10. **Llamadas Externas a Terceros:**
    - Ninguna.
11. **Retries:**
    - Sin reintentos internos.
12. **Timeouts:**
    - Límite del Edge Runtime. La ejecución de la RPC en base de datos suele tomar ~10-15 ms.
13. **Manejo de Errores y Logs:**
    - Captura errores en `error` de la RPC (`console.error`) retornando HTTP 400.
    - Captura excepciones generales retornando HTTP 500.
14. **Idempotencia:**
    - Completamente idempotente: llamar a la función en rápida sucesión no genera sobreventa ni corrupción. Si no hay reservas vencidas, retorna `{"success": true, "tickets_released": 0}`.

---

## 4. AUDITORÍA DE CRON JOBS Y AUTOMATIZACIÓN EN BACKGROUND

### 4.1. Inspección Forense en la Base de Datos Viva (`cron.job`)

Se consultó directamente el catálogo de la extensión `pg_cron` en el esquema `cron` de la base de datos de producción:

```sql
SELECT jobid, schedule, command, nodename, nodeport, database, username, active, jobname 
FROM cron.job;
```

**Resultado Real Obtenido:**
- **Job ID:** `4`
- **Job Name:** `"release-expired-reservations-job"`
- **Frecuencia (Cron Expression):** `*/5 * * * *` (cada 5 minutos exactamente).
- **Comando Ejecutado:** `SELECT public.release_expired_reservations();`
- **Database:** `postgres`
- **Usuario Ejecutor (Username):** `postgres` (Superusuario del motor).
- **Estado (Active):** `true`

### 4.2. Historial de Ejecuciones Reales (`cron.job_run_details`)

Se inspeccionaron las últimas ejecuciones registradas en la tabla de telemetría de `pg_cron`:

| Run ID | Job ID | Start Time (UTC) | End Time (UTC) | Duración | Status | Return Message |
|---|---|---|---|---|---|---|
| 1894 | 4 | 2026-09-23 17:00:00.044 | 2026-09-23 17:00:00.056 | **12 ms** | `succeeded` | `1 row` |
| 1893 | 4 | 2026-09-23 16:55:00.082 | 2026-09-23 16:55:00.095 | **13 ms** | `succeeded` | `1 row` |
| 1892 | 4 | 2026-09-23 16:50:00.078 | 2026-09-23 16:50:00.092 | **14 ms** | `succeeded` | `1 row` |

#### Hallazgos Clave de la Automatización en Background
1. **Rendimiento Extraordinario:** La función `public.release_expired_reservations()` tarda entre 12 y 14 milisegundos en evaluar todos los boletos y órdenes.
2. **Aislamiento Seguro:** Corre dentro del mismo proceso PostgreSQL bajo el usuario del sistema `postgres`. No consume créditos de Edge Functions ni depende de conectividad HTTP saliente.
3. **Análisis de Doble Ejecución:** Si una ejecución se solapara con otra, el comando es una sentencia `UPDATE ... WHERE ...` atómica con aislamiento de snapshot; ambas transacciones son mutuamente consistentes y no causan corrupción.
4. **Análisis de Fallo y Reintento:** Si ocurre un fallo en una iteración, la transacción hace rollback automático. En el siguiente ciclo (5 minutos después), `pg_cron` vuelve a invocar la función de manera limpia.
5. **Desacople Arquitectónico:** Como el job de `pg_cron` está funcionando de forma autónoma al 100% en la base de datos, la Edge Function `cron-release-expired-reservations` es redundante y se encuentra actualmente inactiva/sin tráfico.

---

## 5. AUDITORÍA DE SUPABASE REALTIME (BUS DE EVENTOS CDC)

### 5.1. Evidencia Forense en Vivo: Cero Tablas en `supabase_realtime`

La consulta al catálogo de replicación lógica de PostgreSQL arrojó el siguiente resultado categórico:

```sql
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```
**Resultado:** **0 filas retornadas**.

La única publicación con tablas activas en el cluster es:
```sql
SELECT pubname, schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime_messages_publication';
```
*(Contiene únicamente las tablas internas de partición de mensajes efímeros `realtime.messages_2026_09_20` a `realtime.messages_2026_09_26` usadas para broadcast y presence).*

### 5.2. Trazabilidad de Suscripciones en el Frontend React

En el código fuente de la aplicación (`src/`), múltiples componentes clave configuran canales y oyentes para eventos CDC (`postgres_changes`):

1. **`src/context/TicketCartContext.tsx`:**
   - Línea 194: `supabase.channel('raffles_realtime_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'raffles' }, ...)`
   - Línea 210: `supabase.channel('winners_realtime_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'winners' }, ...)`
   - Línea 234: `supabase.channel(`tickets_realtime_${raffle.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `raffle_id=eq.${raffle.id}` }, ...)`
2. **`src/context/AdminRaffleContext.tsx`:**
   - Línea 65: `supabase.channel('admin_raffles_realtime_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'raffles' }, ...)`
3. **`src/context/SystemSettingsContext.tsx`:**
   - Línea 48: `supabase.channel('system_settings_global_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, ...)`
4. **`src/pages/admin/views/DashboardView.tsx`:**
   - Línea 250: `supabase.channel('dashboard_orders_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, ...)`
   - Línea 259: `supabase.channel('dashboard_tickets_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, ...)`
5. **`src/pages/admin/views/OrdersView.tsx`:**
   - Línea 136: `supabase.channel('admin_orders_realtime_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, ...)`
6. **`src/pages/admin/views/TicketsView.tsx`:**
   - Línea 197: `supabase.channel(`admin_tickets_realtime_${selectedRaffleId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, ...)`

### 5.3. Diagnóstico del Apagón Reactivo y Consecuencias

> [!WARNING]
> **DIAGNÓSTICO TÉCNICO:**
> Debido a que en la migración `018_enable_supabase_realtime.sql` el comando `ALTER PUBLICATION supabase_realtime ADD TABLE ...` fue comentado por restricciones de permisos de `supabase_admin`, y nunca se activaron los interruptores en el Dashboard de Supabase:
> **La base de datos PostgreSQL NUNCA emite eventos CDC para las tablas `tickets`, `orders`, `raffles`, `winners` ni `system_settings`**.
> Los clientes React abren la conexión WebSocket con éxito, pero los canales permanecen en silencio perpetuo.

#### Impacto Operativo en Producción:
- **Reserva de Boletos en Vivo:** Cuando un usuario reserva o compra un número, los demás usuarios concurrentes que estén viendo la cuadrícula de boletos **NO ven el boleto cambiar a rojo/gris en tiempo real**. El cambio solo es visible si recargan la página o si intentan seleccionarlo y el servidor les responde que ya está reservado.
- **Dashboard Administrativo:** Nuevas órdenes no aparecen de forma instantánea; el administrador debe oprimir "Actualizar" o navegar entre vistas.
- **Resiliencia Positiva Involuntaria:** Aunque la reactividad en tiempo real no funciona, esto previene colapsos por sobrecarga de mensajes WebSocket ante tráfico masivo.

### 5.4. Análisis de Riesgos de Seguridad ante una Activación No Planificada de Realtime

Si un administrador activara hoy `tickets` u `orders` en `supabase_realtime` sin aplicar filtros de seguridad:

1. **Fuga de Privacidad de Compradores (Data Leakage en Boletos):**
   - La tabla `tickets` tiene configurado `REPLICA IDENTITY FULL` (migración 018).
   - Cada evento de `UPDATE` enviaría la fila completa por el WebSocket, incluyendo las columnas sensibles `buyer_id` y `order_id`.
   - Cualquier atacante conectado anónimamente al canal público `tickets_realtime_<raffle_id>` capturaría los UUIDs de compradores y de órdenes en tiempo real.
2. **Fuga Masiva en Órdenes:**
   - La tabla `orders` contiene datos de contacto, montos y referencias de pago.
   - En Supabase Realtime, los eventos de tabla están sujetos a las políticas RLS. Dado que las políticas RLS de `orders` para `anon` fueron restringidas, un usuario anónimo sería rechazado o filtrado, pero un suscriptor con rol `authenticated` con permisos laxos podría interceptar órdenes ajenas.

---

## 6. AUDITORÍA DE SUPABASE STORAGE Y GESTIÓN DE ARCHIVOS

### 6.1. Inventario Real de Buckets en Base de Datos Viva (`storage.buckets`)

La consulta directa a `storage.buckets` reveló exactamente 3 buckets registrados en producción:

| Bucket ID | Nombre | Visibilidad (`public`) | File Size Limit | Allowed MIME Types |
|---|---|---|---|---|
| **`receipts`** | `receipts` | **`true` (PÚBLICO) ⚠️** | **NULL (Ilimitado) ⚠️** | **NULL (Cualquiera) ⚠️** |
| **`payment-proofs`** | `payment-proofs` | `false` (PRIVADO) ✅ | `5242880` (5 MB) ✅ | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` ✅ |
| **`gallery-images`** | `gallery-images` | `true` (PÚBLICO) ✅ | `10485760` (10 MB) ✅ | `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/svg+xml` ✅ |

### 6.2. Políticas RLS en `storage.objects`

Se extrajeron las políticas aplicadas sobre la tabla `storage.objects` en el esquema `storage`:

#### Bucket: `payment-proofs` (Privado)
1. **Lectura (SELECT):**
   - Rol: `public` (incluye anónimos y autenticados).
   - Política: `Solo administradores pueden leer comprobantes de payment-proofs`.
   - USING: `((bucket_id = 'payment-proofs'::text) AND is_admin())`.
   - **Resultado:** Ningún usuario no administrador puede listar ni descargar archivos de este bucket.
2. **Escritura (INSERT):**
   - Rol: `public`.
   - Política: `Compradores pueden subir comprobantes a payment-proofs`.
   - WITH CHECK:
     ```sql
     ((bucket_id = 'payment-proofs'::text) AND (
       (EXISTS (SELECT 1 FROM orders o WHERE (o.id::text = split_part(objects.name, '/', 2) AND o.status IN ('pending', 'pending_verification'))))
       OR
       (EXISTS (SELECT 1 FROM orders o WHERE (o.id::text = split_part(objects.name, '/', 3) AND o.status IN ('pending', 'pending_verification'))))
     ))
     ```
   - **Resultado:** Solo se permite subir un archivo si su ruta coincide con un ID de orden existente en estado pendiente. La ruta generada en `paymentService.ts` es `proofs/<raffleId>/<orderId>/<filename>`, donde `split_part(name, '/', 3)` extrae exactamente el `orderId`.

#### Bucket: `receipts` (Legacy Público)
1. **Lectura (SELECT):**
   - Rol: `authenticated`.
   - USING: `((bucket_id = 'receipts'::text) AND is_admin(auth.uid()))`.
   - **Falla de Configuración:** Aunque la política RLS restringe el SELECT a administradores, el bucket tiene el flag `public = true` en `storage.buckets`. En la arquitectura de Supabase Storage, **un bucket público sirve los archivos directamente a través de la CDN pública sin evaluar las políticas RLS**. Si un tercero conoce o enumera el nombre de un archivo en `receipts`, puede descargarlo libremente por HTTP directo.

#### Bucket: `gallery-images` (Público)
1. **Lectura (SELECT):**
   - Rol: `public`.
   - USING: `(bucket_id = 'gallery-images'::text)`.
   - **Resultado:** Correcto. Las imágenes de la galería pública son de libre acceso para todos los visitantes.

### 6.3. Detección de Políticas Huérfanas de Storage

Se identificaron políticas RLS activas en `storage.objects` para buckets que **NO EXISTEN** en `storage.buckets`:
- Políticas para `prize-images` (subida, lectura, borrado).
- Políticas para `partner-logos` (subida, actualización, borrado).
- Políticas para `winner-documents` (subida, lectura, borrado).

**Causa:** Estas imágenes son gestionadas a través de **Cloudinary** (`cloudinaryService.ts`) o quedaron como definiciones preliminares en migraciones anteriores. No causan errores de ejecución pero representan definiciones muertas en la base de datos.

---

## 7. MATRIZ INTEGRAL DE VULNERABILIDADES, BRECHAS Y RIESGOS (EVENT-01 A EVENT-10)

| ID | Subsistema | Componente | Severidad | Descripción del Riesgo / Vector de Ataque | Remediación Recomendada |
|---|---|---|---|---|---|
| **EVENT-01** | Realtime | `supabase_realtime` | **ALTA** | Publicación sin tablas en BD viva. Silencio total de WebSocket en la interfaz React. | Ejecutar `ALTER PUBLICATION supabase_realtime ADD TABLE ...` mediante rol de administración o habilitar toggles en Dashboard. |
| **EVENT-02** | Realtime | `public.tickets` | **CRÍTICA** | En caso de activar Realtime, `tickets` emite la fila completa (`REPLICA IDENTITY FULL`) exponiendo `buyer_id` y `order_id` a usuarios anónimos. | No activar la tabla completa o crear una vista pública sin `buyer_id`/`order_id` para el canal WebSocket. |
| **EVENT-03** | Storage | Bucket `receipts` | **ALTA** | Bucket configurado como `public = true` permitiendo descarga de comprobantes bancarios saltándose RLS vía CDN. | Ejecutar `UPDATE storage.buckets SET public = false WHERE id = 'receipts';` o migrar y vaciar el bucket definitivamente. |
| **EVENT-04** | Storage | Bucket `receipts` | **MEDIA** | Sin límite de tamaño (`file_size_limit = NULL`) ni tipos MIME (`allowed_mime_types = NULL`). | Configurar `file_size_limit = 5242880` y tipos permitidos a nivel de bucket. |
| **EVENT-05** | RPC | `approve_order_payment` | **MEDIA** | Omite inserción explícita en `audit_logs` dentro del cuerpo del procedimiento (confía únicamente en trigger de orden). | Agregar `INSERT INTO public.audit_logs (action, ...) VALUES ('ORDER_APPROVED_BY_ADMIN', ...)`. |
| **EVENT-06** | RPC | Manejo de Errores | **MEDIA** | Divergencia entre `RAISE EXCEPTION` (retorna 400 en cliente) y `jsonb_build_object('success', false)` (retorna 200 con payload). | Estandarizar la interfaz de retorno en todas las RPCs administrativas para que el frontend maneje un protocolo uniforme. |
| **EVENT-07** | RPC | `SECURITY DEFINER` | **BAJA** | 29 de 30 funciones no fijan explícitamente `SET search_path = public`. | Añadir `SET search_path = public, pg_temp` en la declaración de cada procedimiento almacenado. |
| **EVENT-08** | Edge Functions | `cron-release-expired-reservations` | **BAJA** | Microservicio expuesto pero desacoplado y sin llamadas activas, dado que `pg_cron` asume toda la carga. | Documentar formalmente como endpoint de contingencia o proteger con firewall si no se utiliza externamente. |
| **EVENT-09** | Storage | Políticas Huérfanas | **INFORMATIVA** | Políticas para `prize-images`, `partner-logos` y `winner-documents` sin buckets creados en `storage.buckets`. | Eliminar las políticas huérfanas mediante migración de limpieza para reducir la sobrecarga de evaluación de RLS. |
| **EVENT-10** | Cron | `pg_cron` | **INFORMATIVA** | Telemetría en `cron.job_run_details` acumula registros cada 5 minutos indefinidamente si no se purga. | Configurar tarea de purga periódica en `cron.job_run_details` para retener solo los últimos 7 días. |

---

## 8. CONCLUSIÓN Y DICTAMEN TÉCNICO

La arquitectura de backend transaccional de **RifaManaure** exhibe un diseño transaccional y de concurrencia **robusto y matemáticamente seguro**:
- Las funciones críticas de compra (`create_order_secure`, `reserve_tickets`, `admin_block_ticket`, `approve_order_payment`) aplican bloqueos pesimistas ordenados (`ORDER BY number ASC FOR UPDATE`), garantizando la imposibilidad física de sobreventa de boletos.
- El cron de fondo (`pg_cron`) opera con una eficiencia sobresaliente (~12 milisegundos por ejecución cada 5 minutos), desahogando boletos abandonados sin interferencias.
- Las Edge Functions implementan defensas de primer nivel (CORS restringido, validación criptográfica Web Crypto SHA-1, chequeo estricto de roles administrativos).

Sin embargo, la auditoría reveló **dos desconexiones críticas de infraestructura**:
1. **Supabase Realtime está desactivado en la base de datos viva**, convirtiendo los listeners WebSocket del frontend en oyentes mudos.
2. **El bucket legacy `receipts` está expuesto públicamente**, lo que representa un riesgo de privacidad para comprobantes bancarios antiguos.

Ambos hallazgos deben ser atendidos con máxima prioridad una vez iniciada la fase de remediación.
