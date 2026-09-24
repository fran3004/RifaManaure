# AUDITORÍA 2 — SEGURIDAD POSTGRESQL / SUPABASE / RLS / RPC
**PROYECTO:** RifaManaure (`manaure-vive`)
**FECHA DE AUDITORÍA:** 23 de Septiembre de 2026
**ALCANCE:** Base de Datos PostgreSQL, Supabase Auth, Row-Level Security (RLS), Stored Procedures (RPC / Functions), Triggers, Storage y Modelo de Acceso de Producción.
**ESTADO DE EJECUCIÓN:** Auditoría Exhaustiva de Solo Lectura — CERO Modificaciones al Código.

---

## RESUMEN EJECUTIVO Y ESTADO DE LA POSTURA DE SEGURIDAD

Esta auditoría técnica evalúa a profundidad la postura de seguridad de la infraestructura backend y de base de datos de **RifaManaure**, operando sobre **Supabase (PostgreSQL 17.6)**.

### Principales Fortalezas Encontradas
1. **Aislamiento Estricto de PII:** La información personal identificable (PII) de los compradores en la tabla `buyers` (cédulas, números de teléfono, correos electrónicos) se encuentra estrictamente protegida por RLS. No existe política SELECT pública para `buyers`; las consultas ciudadanas operan mediante la RPC `verify_public_order_or_tickets`, la cual aplica enmascaramiento SQL nativo (`Carlos M.`, `1065***40`).
2. **Inmutabilidad y Blindaje Financiero en la Creación de Órdenes:** La función `create_order_secure` calcula los montos monetarios directamente dentro del motor SQL (`ticket_price * ticket_count`) bajo bloqueos pesimistas `FOR UPDATE`, impidiendo que usuarios anónimos o clientes maliciosos adulteren los precios.
3. **Row Level Security (RLS) Activo en Todas las Tablas:** Las 17 tablas del esquema público tienen `relrowsecurity = true`.
4. **Blindaje de la Función `is_admin()` (Migración 029):** La función `is_admin()` ignora parámetros proporcionados por el cliente y evalúa de forma forzosa `v_uid := auth.uid()`, impidiendo la suplantación de identidad por argumentos en RPCs que la invocan.
5. **Configuración de `search_path` en Funciones `SECURITY DEFINER`:** Las 30 rutinas del esquema público tienen fijado explícitamente su parámetro `search_path` (`public, pg_temp` o `public, auth, pg_temp`), mitigando ataques de inyección de esquemas basados en rutas de búsqueda de objetos.

### Principales Vulnerabilidades Críticas y Hallazgos Severos
A pesar de las fortalezas anteriores, se han detectado brechas de seguridad severas que amenazan la integridad de la rifa y la confidencialidad del sistema si no son remediadas:

| ID | Vulnerabilidad | Severidad | Objeto / Vector | Impacto |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **Contaminación Cruzada y Desvinculación Masiva de Boletos en Órdenes Múltiples** | **CRÍTICA** | RPC `approve_order_payment`, `reject_order_payment`, `submit_payment_proof` | La cláusula `OR (buyer_id = v_order.buyer_id AND status = 'reserved')` hace que aprobar, rechazar o subir comprobante para una orden afecte a **todas las demás órdenes reservadas** del mismo comprador. |
| **SEC-02** | **Denegación de Servicio / Agotamiento Indefinido de Boletos (Ticket Starvation)** | **ALTA** | RPC `reserve_tickets` | Función legacy `SECURITY DEFINER` concedida a `PUBLIC/anon` sin validación de límite superior en `p_duration_minutes` ni límite de boletos, permitiendo bloquear toda la rifa por décadas. |
| **SEC-03** | **Cancelación Arbitraria de Órdenes Ajenas sin Verificación de Rol ni Autoría (IDOR)** | **ALTA** | RPC `cancel_order` | Cualquier usuario `authenticated` puede invocar `cancel_order(p_order_id)` sobre cualquier orden pendiente o en verificación sin comprobar si es administrador ni dueño de la orden. |
| **SEC-04** | **Escalamiento Vertical de Privilegios en `admin_users` vía PostgREST Directo** | **ALTA** | Tabla `admin_users` / Policy `"Superadmins pueden gestionar administradores"` | La política utiliza `USING (is_admin())` en lugar de `is_superadmin()`, permitiendo que cualquier administrador o auditor muta roles o promueva a superadmin a través del API REST. |
| **SEC-05** | **Bucket `receipts` Público con Subida Irrestricta y sin Límite de Tamaño ni Mime Type** | **ALTA** | Supabase Storage (`receipts`) / Policy `"Subida pública de comprobantes"` | Bucket marcado como `public: true`, sin límite de cuota ni filtro MIME, con policy que permite subir archivos arbitrarios a cualquier persona anónima. |
| **SEC-06** | **Manipulación Arbitraria de Atributos en Órdenes Pendientes (Mass Assignment)** | **MEDIA** | Tabla `orders` / Policy `"Compradores pueden adjuntar comprobante a su orden"` | Permite `UPDATE` a `public` en órdenes pendientes sin cláusula `WITH CHECK` restrictiva ni control de columnas, posibilitando mutar `buyer_id`, `raffle_id` o `ticket_count`. |
| **SEC-07** | **Denegación de Servicio (DoS 42501) en `notification_logs` por RLS Recursivo a `auth.users`** | **MEDIA** | Tabla `notification_logs` / Policy `"Compradores pueden ver logs de sus órdenes"` | La política ejecuta `SELECT email FROM auth.users`, arrojando un error fatal de PostgreSQL (`42501 Permission Denied`) a cualquier comprador autenticado que consulte la tabla. |
| **SEC-08** | **Inyección de Identidad de Administrador ante Cuentas de Correo no Verificadas** | **MEDIA** | Trigger `sync_admin_user_id` en `auth.users` | Si la confirmación de correo electrónico en Supabase Auth está inactiva, un atacante que registre una cuenta con el correo pre-invitado de un administrador asume privilegios inmediatos. |
| **SEC-09** | **Enumeración Pública de Cédulas y Estado de Participación Ciudadana** | **BAJA** | RPC `verify_public_order_or_tickets` | Permite búsquedas directas por cédula sin límite de tasa (`rate limiting`), revelando si un documento ha comprado boletos en el sistema. |
| **SEC-10** | **Discrepancia entre Buckets Configurados en Storage y Referenciados en RLS** | **INFORMATIVA** | Storage Buckets | Existen políticas RLS para buckets inexistentes (`prize-images`, `partner-logos`, `winner-documents`), generando riesgo de configuración inconsistente. |

---

## SECCIÓN 1: MODELO DE AMENAZAS (ACTORES A - K)

Para evaluar la resistencia del sistema, se modelaron y auditaron 11 perfiles de atacantes y actores interactuando contra Supabase:

### A. Usuario Anónimo (Anon)
- **Capacidades:** Dispone únicamente de un navegador, la `anon key` pública de Supabase y acceso a los endpoints REST (`/rest/v1/*`), GraphQL y Storage públicos.
- **Superficie de Ataque:** Tablas con RLS que admitan rol `anon` o `public`, RPCs con `GRANT EXECUTE TO anon / public`, y buckets de Storage públicos.
- **Hallazgo:** Puede consultar rifas, boletos disponibles/ocupados, configuración pública, aliados, FAQs, y crear órdenes legítimas mediante `create_order_secure`. Sin embargo, puede explotar la RPC legacy `reserve_tickets` para acaparar boletos indefinidamente y puede subir archivos ilimitados al bucket `receipts`.

### B. Usuario Autenticado Normal (Comprador)
- **Capacidades:** Posee un JWT válido emitido por Supabase Auth (`role: authenticated`) con su propio `sub` (UUID).
- **Superficie de Ataque:** Endpoints con políticas para `authenticated`, RPCs con `GRANT EXECUTE TO authenticated`.
- **Hallazgo:** Puede explotar la RPC `cancel_order` para anular órdenes ajenas de otros compradores. Si intenta leer `notification_logs`, el motor de base de datos se bloquea con error 42501 debido a una subconsulta no autorizada a `auth.users`.

### C. Usuario Autenticado Manipulado
- **Capacidades:** Intenta falsificar o adulterar los claims dentro de su token JWT (e.g. inyectar `"role": "admin"` o cambiar `sub`).
- **Evaluación:** **RESISTENTE.** Supabase valida la firma criptográfica HMAC/RSA de los tokens JWT en el API Gateway (Kong/PostgREST). Si la firma no coincide con el secreto de Supabase, la petición es rechazada de inmediato.

### D. Administrador Legítimo (Admin)
- **Capacidades:** Usuario autenticado con registro activo en `public.admin_users` (`role: admin`). Accede al panel administrativo `/admin`.
- **Superficie de Ataque:** Gestión de compradores, aprobación y rechazo de órdenes, bloqueo/desbloqueo de boletos, parametrización de rifas.
- **Evaluación:** Opera bajo el marco de auditoría `audit_logs` en casi todas sus operaciones. No obstante, por una brecha en la política RLS de `admin_users`, puede auto-promoverse a superadmin directamente mediante PostgREST.

### E. Administrador Malicioso / Comprometido
- **Capacidades:** Credenciales de administrador sustraídas o un operador deshonesto.
- **Superficie de Ataque:** Adjudicación indebida de ganadores, borrado de registros, manipulación de cuentas bancarias.
- **Hallazgo:** Aunque la RPC `register_winner` exige que el boleto esté en estado `sold` y vinculado a una orden pagada, un administrador malicioso con acceso a PostgREST podría intentar un `INSERT` directo en la tabla `winners` saltándose las validaciones de la RPC.

### F. Atacante con Conocimiento Total del Esquema
- **Capacidades:** Ha analizado el repositorio de código abierto en GitHub, conoce los nombres de tablas, columnas, constraints, RPCs y políticas.
- **Evaluación:** El diseño de seguridad en RifaManaure no depende de la oscuridad. La protección descansa en RLS y validaciones procedurales. Sin embargo, este conocimiento le permite identificar inmediatamente que la tabla `orders` permite `UPDATE` al rol `public` y que la función `reserve_tickets` sigue activa.

### G. Atacante que Manipula Requests HTTP/REST (PostgREST Directo)
- **Capacidades:** No utiliza la interfaz web; emite comandos directos con `curl`, Postman o scripts Python contra `/rest/v1/*`.
- **Hallazgo:** Se descubrió que `orders` acepta peticiones `PATCH /rest/v1/orders?id=eq.<id>` si el estado es `pending` o `pending_verification`, debido a que la política carece de `WITH CHECK` y valida únicamente `USING (status IN ('pending', 'pending_verification'))`.

### H. Atacante que Invoca RPCs Directamente
- **Capacidades:** Llama a endpoints `/rest/v1/rpc/<function_name>` enviando payloads JSON arbitrarios.
- **Hallazgo:** La invocación de `reserve_tickets` con duraciones de reserva hipertrofiadas (e.g. 500,000 minutos) es completamente funcional y no está bloqueada ni restringida a administradores.

### I. Atacante que Modifica Payloads / Parameter Tampering
- **Capacidades:** Intenta enviar parámetros extraños o manipulados (e.g. `total_amount = 0`, `ticket_price = 0`, `p_user_id` falsos).
- **Evaluación:** **RESISTENTE en compras.** `create_order_secure` ignora precios enviados por el cliente y recalcula el monto en el servidor. `is_admin` ignora `p_user_id` y extrae la identidad exclusivamente de `auth.uid()`.

### J. Atacante con Replay Attacks (Reenvío de Peticiones)
- **Capacidades:** Captura y retransmite requests legítimos (e.g. comprobante de pago o aprobación de orden).
- **Evaluación:** Las órdenes aprobadas transitan a `paid`. El trigger `fn_validate_order_status_transition` impide que una orden `paid` regrese a cualquier estado anterior (`RAISE EXCEPTION 'Una orden pagada no puede retroceder...'`). Además, `approve_order_payment` valida `IF v_order.status IN ('paid', 'completed') THEN RETURN error`. Replay attacks de aprobación son inocuos.

### K. Atacante con Peticiones Concurrentes Masivas (Race Conditions)
- **Capacidades:** Dispara cientos de solicitudes paralelas (burst de hilos) intentando comprar el mismo boleto o registrar múltiples comprobantes simultáneos.
- **Evaluación:** **RESISTENTE.** La cláusula `FOR UPDATE` en `create_order_secure` y `approve_order_payment` serializa a nivel de fila en PostgreSQL los boletos y las órdenes involucradas. Solo una transacción adquiere el lock; las demás fallan de forma controlada.

---

## SECCIÓN 2: AUDITORÍA EXHAUSTIVA DE ROW LEVEL SECURITY (RLS)

Todas las 17 tablas del esquema público fueron auditadas contra el catálogo en vivo de PostgreSQL (`pg_class.relrowsecurity`, `pg_policy`, `information_schema.role_table_grants`).

> [!IMPORTANT]
> En Supabase, por diseño predeterminado del motor, se concede `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated`. Por consiguiente, la seguridad del sistema descansa **100% sobre Row-Level Security (RLS)**. Si una tabla tiene una política mal calibrada o carece de ella, PostgREST procesará las peticiones sin restricción.

### Tabla `admin_users`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 2

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Admins pueden consultar su propio perfil** | `SELECT` | `{authenticated}` | `((user_id = ( SELECT auth.uid() AS uid)) OR (lower((email)::text) = lower(COALESCE(( SELECT (auth.jwt() ->> 'email'::text)), ''::text))))` | *Ninguna* |
| **Superadmins pueden gestionar administradores** | `ALL` | `{authenticated}` | `( SELECT is_admin(( SELECT auth.uid() AS uid)) AS is_admin)` | `( SELECT is_admin(( SELECT auth.uid() AS uid)) AS is_admin)` |

**Análisis de Acceso por Perfil:**
- **Anon:** Cero acceso (SELECT, INSERT, UPDATE, DELETE bloqueados por RLS).
- **Authenticated (Comprador):** Puede hacer SELECT de su propia fila únicamente si su correo o su `auth.uid()` coincide con una fila en `admin_users`.
- **Admin:** La política `"Superadmins pueden gestionar administradores"` permite `ALL` a cualquier usuario para el cual `is_admin()` sea verdadero. **Vulnerabilidad detectada:** Permite que administradores regulares o auditores muten filas de administradores y se auto-promuevan a `superadmin`.

### Tabla `audit_logs`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 1

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Solo administradores pueden consultar bit├ícora de auditor├¡a** | `SELECT` | `{authenticated}` | `is_admin()` | *Ninguna* |

**Análisis de Acceso por Perfil:**
- **Anon:** Cero acceso.
- **Authenticated (Comprador):** Cero acceso.
- **Admin:** SELECT permitido bajo `is_admin()`. INSERT/UPDATE/DELETE denegados directamente por PostgREST; las inserciones solo proceden mediante triggers y RPCs `SECURITY DEFINER`.

### Tabla `buyers`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 2

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Lectura de compradores para administradores** | `SELECT` | `{authenticated}` | `is_admin(auth.uid())` | *Ninguna* |
| **Solo administradores pueden insertar compradores directamente** | `INSERT` | `{authenticated}` | *Ninguna* | `is_admin(auth.uid())` |

**Análisis de Acceso por Perfil:**
- **Anon:** Cero acceso directo. La creación se realiza exclusivamente vía `create_order_secure`.
- **Authenticated (Comprador):** Cero acceso directo.
- **Admin:** SELECT e INSERT permitidos si `is_admin(auth.uid())`. UPDATE y DELETE no están definidos en las políticas (denegados por defecto).

### Tabla `faq_items`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 2

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Administradores gestionan faq_items** | `ALL` | `{authenticated}` | `is_admin(auth.uid())` | `is_admin(auth.uid())` |
| **faq_items_public_read** | `SELECT` | `{anon,authenticated}` | `((is_published = true) OR ((auth.role() = 'authenticated'::text) AND is_admin(auth.uid())))` | *Ninguna* |

**Análisis de Acceso por Perfil:**
- **Anon:** SELECT permitido si `is_published = true`.
- **Authenticated:** SELECT permitido si `is_published = true` o si es admin.
- **Admin:** Gestión total (`ALL`) mediante `is_admin(auth.uid())`.

### Tabla `gallery_categories`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 2

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **gallery_categories_admin_manage** | `ALL` | `{authenticated}` | `is_admin(auth.uid())` | `is_admin(auth.uid())` |
| **gallery_categories_public_read** | `SELECT` | `{public}` | `((is_active = true) OR ((auth.role() = 'authenticated'::text) AND is_admin(auth.uid())))` | *Ninguna* |

**Análisis de Acceso por Perfil:**
- **Anon:** SELECT permitido si `is_active = true`.
- **Authenticated:** SELECT permitido si `is_active = true` o si es admin.
- **Admin:** Gestión total (`ALL`) mediante `is_admin(auth.uid())`.

### Tabla `gallery_items`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 2

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **gallery_items_admin_manage** | `ALL` | `{authenticated}` | `is_admin(auth.uid())` | `is_admin(auth.uid())` |
| **gallery_items_public_read** | `SELECT` | `{public}` | `((is_active = true) OR ((auth.role() = 'authenticated'::text) AND is_admin(auth.uid())))` | *Ninguna* |

**Análisis de Acceso por Perfil:**
- **Anon:** SELECT permitido si `is_active = true`.
- **Authenticated:** SELECT permitido si `is_active = true` o si es admin.
- **Admin:** Gestión total (`ALL`) mediante `is_admin(auth.uid())`.

### Tabla `notification_logs`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 3

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Admins pueden gestionar todos los logs de notificaciones** | `ALL` | `{authenticated}` | `is_admin()` | `is_admin()` |
| **Admins pueden ver todos los logs de notificaciones** | `SELECT` | `{authenticated}` | `is_admin()` | *Ninguna* |
| **Compradores pueden ver logs de sus ├│rdenes** | `SELECT` | `{authenticated}` | `(EXISTS ( SELECT 1    FROM (orders o      JOIN buyers b ON ((b.id = o.buyer_id)))   WHERE ((o.id = notification_logs.order_id) AND (lower((b.email)::text) = lower((( SELECT users.email            FROM auth.users           WHERE (users.id = auth.uid())))::text)))))` | *Ninguna* |

**Análisis de Acceso por Perfil:**
- **Anon:** Cero acceso.
- **Authenticated:** Política con subconsulta directa a `auth.users` causa error de permisos `42501`.
- **Admin:** Acceso total (`ALL`) y lectura (`SELECT`) permitidos bajo `is_admin()`.

### Tabla `orders`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 3

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Compradores pueden adjuntar comprobante a su orden** | `UPDATE` | `{public}` | `((status)::text = ANY ((ARRAY['pending'::character varying, 'pending_verification'::character varying])::text[]))` | *Ninguna* |
| **Solo administradores pueden consultar ├│rdenes directamente** | `SELECT` | `{authenticated}` | `is_admin()` | *Ninguna* |
| **Solo administradores pueden insertar ├│rdenes directamente** | `INSERT` | `{authenticated}` | *Ninguna* | `is_admin(auth.uid())` |

**Análisis de Acceso por Perfil:**
- **Anon:** Cero SELECT directo (protección PII). Puede hacer UPDATE sobre órdenes en estado `pending` o `pending_verification` debido a la política de adjuntar comprobante. Inserciones directas bloqueadas.
- **Authenticated:** SELECT permitido solo para administradores. Puede hacer UPDATE idéntico a Anon.
- **Admin:** SELECT e INSERT permitidos bajo `is_admin()`.

### Tabla `partners`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 2

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Administradores pueden gestionar aliados** | `ALL` | `{authenticated}` | `is_admin(auth.uid())` | `is_admin(auth.uid())` |
| **Lectura p├║blica de aliados** | `SELECT` | `{public}` | `(is_active = true)` | *Ninguna* |

**Análisis de Acceso por Perfil:**
- **Anon:** SELECT permitido si `is_active = true`.
- **Authenticated:** SELECT permitido si `is_active = true`.
- **Admin:** Gestión total (`ALL`) mediante `is_admin(auth.uid())`.

### Tabla `payment_accounts`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 2

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Administradores pueden gestionar cuentas de pago** | `ALL` | `{authenticated}` | `is_admin(( SELECT auth.uid() AS uid))` | `is_admin(( SELECT auth.uid() AS uid))` |
| **Lectura p├║blica de cuentas de pago activas** | `SELECT` | `{anon,authenticated}` | `(is_active = true)` | *Ninguna* |

**Análisis de Acceso por Perfil:**
- **Anon:** SELECT permitido si `is_active = true`. Datos sensibles (número de cuenta, banco, tipo) son públicos por necesidad de recaudación.
- **Authenticated:** SELECT permitido si `is_active = true`.
- **Admin:** Gestión total (`ALL`) mediante `is_admin(auth.uid())`.

### Tabla `payment_proofs`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 2

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Administradores tienen acceso total a payment_proofs** | `ALL` | `{authenticated}` | `is_admin()` | *Ninguna* |
| **Compradores pueden registrar comprobante para su orden** | `INSERT` | `{public}` | *Ninguna* | `(EXISTS ( SELECT 1    FROM orders   WHERE ((orders.id = payment_proofs.order_id) AND ((orders.status)::text = ANY ((ARRAY['pending'::character varying, 'pending_verification'::character varying])::text[])))))` |

**Análisis de Acceso por Perfil:**
- **Anon:** INSERT permitido mediante `WITH CHECK` verificando que la orden exista y esté en `pending` o `pending_verification`. SELECT bloqueado.
- **Authenticated:** Mismo comportamiento que Anon para compradores comunes.
- **Admin:** Gestión total (`ALL`) bajo `is_admin()`.

### Tabla `prize_experiences`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 2

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Administradores gestionan prize_experiences** | `ALL` | `{authenticated}` | `is_admin(auth.uid())` | `is_admin(auth.uid())` |
| **Lectura p├║blica de experiencias activas** | `SELECT` | `{public}` | `((is_active = true) OR ((auth.role() = 'authenticated'::text) AND is_admin(auth.uid())))` | *Ninguna* |

**Análisis de Acceso por Perfil:**
- **Anon:** SELECT permitido (`qual: true` o `is_active = true`).
- **Authenticated:** SELECT permitido.
- **Admin:** Gestión total (`ALL`) bajo `is_admin(auth.uid())`.

### Tabla `prize_settings`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 2

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Administradores gestionan prize_settings** | `ALL` | `{authenticated}` | `is_admin(auth.uid())` | `is_admin(auth.uid())` |
| **Lectura p├║blica de prize_settings** | `SELECT` | `{public}` | `true` | *Ninguna* |

**Análisis de Acceso por Perfil:**
- **Anon:** SELECT permitido (`qual: true` o `is_active = true`).
- **Authenticated:** SELECT permitido.
- **Admin:** Gestión total (`ALL`) bajo `is_admin(auth.uid())`.

### Tabla `raffles`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 1

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Lectura p├║blica de rifas** | `SELECT` | `{public}` | `((status)::text = ANY ((ARRAY['active'::character varying, 'paused'::character varying, 'closed'::character varying, 'finished'::character varying])::text[]))` | *Ninguna* |

**Análisis de Acceso por Perfil:**
- **Anon:** SELECT permitido si estado está en `active`, `paused`, `closed`, `finished`.
- **Authenticated:** Mismo SELECT.
- **Admin:** SELECT permitido. Las modificaciones se gestionan mediante las RPCs `admin_create_raffle` y `admin_update_raffle` (las políticas no tienen `ALL` directo).

### Tabla `system_settings`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 2

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Administradores pueden gestionar configuraciones operativas** | `ALL` | `{authenticated}` | `is_admin(auth.uid())` | `is_admin(auth.uid())` |
| **Lectura p├║blica de configuraciones operativas** | `SELECT` | `{public}` | `true` | *Ninguna* |

**Análisis de Acceso por Perfil:**
- **Anon:** SELECT permitido (`qual: true`).
- **Authenticated:** SELECT permitido.
- **Admin:** Gestión total (`ALL`) bajo `is_admin(auth.uid())`.

### Tabla `tickets`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 1

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Lectura p├║blica de boletos** | `SELECT` | `{public}` | `true` | *Ninguna* |

**Análisis de Acceso por Perfil:**
- **Anon:** SELECT público irrestricto (`qual: true`). No hay políticas de INSERT, UPDATE o DELETE (bloqueadas por defecto para clientes directos).
- **Authenticated:** Mismo comportamiento.
- **Admin:** Mismo comportamiento a nivel PostgREST; la administración se efectúa mediante RPCs `SECURITY DEFINER`.

### Tabla `winners`
- **RLS Activo:** SÍ (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Total de Políticas:** 2

| Nombre de Política | Comando | Roles Destino | Expresión USING (qual) | Expresión WITH CHECK |
| :--- | :--- | :--- | :--- | :--- |
| **Administradores pueden gestionar ganadores** | `ALL` | `{authenticated}` | `is_admin(auth.uid())` | `is_admin(auth.uid())` |
| **Lectura p├║blica de ganadores** | `SELECT` | `{public}` | `true` | *Ninguna* |

**Análisis de Acceso por Perfil:**
- **Anon:** SELECT público irrestricto (`qual: true`).
- **Authenticated:** Mismo SELECT.
- **Admin:** Gestión total (`ALL`) bajo `is_admin(auth.uid())`.

---

## SECCIÓN 3: ANÁLISIS CRÍTICO DE POLICIES Y REGLAS DE ACCESO

### 1. Políticas Demasiado Permisivas y con `USING (true)`
- **`tickets` (`Lectura pública de boletos`):** `qual: true`. Permite a cualquier persona ver el universo de boletos, su estado, y las columnas `buyer_id` y `order_id`. Aunque `buyers` está protegido, la exposición del `buyer_id` (UUID) y `order_id` en la tabla `tickets` facilita correlaciones de actividad.
- **`system_settings` (`Lectura pública de configuraciones operativas`):** `qual: true`. Expone parámetros del sistema (duración de reservas, límites de compra por persona). Esto no es intrínsecamente vulnerable, pero proporciona inteligencia al atacante sobre los umbrales de expiración.
- **`prize_settings` y `winners`:** `qual: true`. Adecuado y necesario para la transparencia de la rifa.

### 2. Políticas Redundantes y Contradictorias
- En la tabla `notification_logs` existen dos políticas para administradores creadas en diferentes migraciones:
  1. `Admins pueden gestionar todos los logs de notificaciones` (`cmd: ALL`, `roles: {authenticated}`, `qual: is_admin()`, `with_check: is_admin()`).
  2. `Admins pueden ver todos los logs de notificaciones` (`cmd: SELECT`, `roles: {authenticated}`, `qual: is_admin()`).
  *Diagnóstico:* La política 2 es redundante e innecesaria dado que la política 1 cubre el comando `ALL` (que incluye `SELECT`).

### 3. Falla de Recursión y Denegación de Permisos (DoS 42501)
En la tabla `notification_logs`:
```sql
Policy: "Compradores pueden ver logs de sus órdenes"
qual: (EXISTS ( SELECT 1 FROM (orders o JOIN buyers b ON ((b.id = o.buyer_id)))
       WHERE ((o.id = notification_logs.order_id)
         AND (lower((b.email)::text) = lower((( SELECT users.email FROM auth.users WHERE (users.id = auth.uid())))::text)))))
```
- **Problema Crítico:** El rol `authenticated` de Supabase **no tiene permisos SELECT sobre el esquema `auth` ni sobre la tabla `auth.users`**.
- **Consecuencia:** Cuando cualquier usuario no superusuario autenticado intenta consultar sus notificaciones, PostgreSQL aborta la consulta completa con el error: `ERROR: 42501: permission denied for table users`.
- **Solución Recomendada:** Reemplazar `(SELECT users.email FROM auth.users WHERE users.id = auth.uid())` por `LOWER(COALESCE(auth.jwt()->>'email', ''))` que se obtiene de forma segura desde los claims del JWT.

### 4. Vulnerabilidad de Actualización no Controlada en `orders`
```sql
Policy: "Compradores pueden adjuntar comprobante a su orden"
cmd: UPDATE
roles: {public}
qual: ((status)::text = ANY ((ARRAY['pending'::character varying, 'pending_verification'::character varying])::text[]))
with_check: null
```
- **Problema Crítico:** Al no tener `WITH CHECK`, PostgreSQL utiliza la expresión `USING` como `WITH CHECK`. Si bien esto evita que el usuario cambie el estado directamente a `paid`, permite que un atacante envíe una mutación `PATCH /rest/v1/orders?id=eq.<id>` y modifique columnas como `total_amount`, `ticket_count`, `buyer_id`, `raffle_id` o `expires_at` mientras la orden esté en `pending`.

---

## SECCIÓN 4: AUDITORÍA DE FUNCIONES `SECURITY DEFINER`

El esquema contiene 25 funciones marcadas como `SECURITY DEFINER`, ejecutándose bajo los privilegios del superusuario `postgres`.

### Matriz de Funciones `SECURITY DEFINER`

| Función | Owner | Search Path | Invocable por Anon | Invocable por Auth | Requiere `is_admin()` | Lock (`FOR UPDATE`) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `admin_block_ticket` | `postgres` | `public, pg_temp` | ❌ NO | ✅ SÍ | 🔒 SÍ | 🔒 SÍ |
| `admin_create_raffle` | `postgres` | `public, pg_temp` | ❌ NO | ✅ SÍ | 🔒 SÍ | — |
| `admin_invite_user` | `postgres` | `public, auth, pg_temp` | ❌ NO | ✅ SÍ | 🔒 SÍ | — |
| `admin_list_users` | `postgres` | `public, auth, pg_temp` | ❌ NO | ✅ SÍ | 🔒 SÍ | — |
| `admin_toggle_user_status` | `postgres` | `public, auth, pg_temp` | ❌ NO | ✅ SÍ | 🔒 SÍ | 🔒 SÍ |
| `admin_unblock_ticket` | `postgres` | `public, pg_temp` | ❌ NO | ✅ SÍ | 🔒 SÍ | 🔒 SÍ |
| `admin_update_buyer` | `postgres` | `public, pg_temp` | ❌ NO | ✅ SÍ | 🔒 SÍ | 🔒 SÍ |
| `admin_update_raffle` | `postgres` | `public, pg_temp` | ❌ NO | ✅ SÍ | 🔒 SÍ | 🔒 SÍ |
| `admin_update_system_settings` | `postgres` | `public, pg_temp` | ❌ NO | ✅ SÍ | 🔒 SÍ | — |
| `approve_order_payment` | `postgres` | `public, pg_temp` | ❌ NO | ✅ SÍ | 🔒 SÍ | 🔒 SÍ |
| `cancel_order` | `postgres` | `public, pg_temp` | ❌ NO | ✅ SÍ | 🔓 NO | 🔒 SÍ |
| `create_order_secure` | `postgres` | `public, pg_temp` | ✅ SÍ | ✅ SÍ | 🔓 NO | 🔒 SÍ |
| `fn_audit_payment_accounts` | `postgres` | `public, pg_temp` | ❌ NO | ❌ NO | 🔓 NO | — |
| `fn_validate_order_status_transition` | `postgres` | `public, pg_temp` | ❌ NO | ❌ NO | 🔓 NO | — |
| `fn_validate_ticket_status_transition` | `postgres` | `public, pg_temp` | ❌ NO | ❌ NO | 🔓 NO | — |
| `get_dashboard_kpis` | `postgres` | `public, pg_catalog, pg_temp` | ❌ NO | ✅ SÍ | 🔒 SÍ | — |
| `is_admin` | `postgres` | `public, auth, pg_temp` | ✅ SÍ | ✅ SÍ | 🔓 NO | — |
| `is_superadmin` | `postgres` | `public, auth, pg_temp` | ✅ SÍ | ✅ SÍ | 🔓 NO | — |
| `register_winner` | `postgres` | `public, pg_temp` | ❌ NO | ✅ SÍ | 🔒 SÍ | 🔒 SÍ |
| `reject_order_payment` | `postgres` | `public, pg_temp` | ❌ NO | ✅ SÍ | 🔒 SÍ | 🔒 SÍ |
| `release_expired_reservations` | `postgres` | `public, pg_temp` | ❌ NO | ✅ SÍ | 🔓 NO | — |
| `reserve_tickets` | `postgres` | `public, pg_temp` | ✅ SÍ | ✅ SÍ | 🔓 NO | 🔒 SÍ |
| `submit_payment_proof` | `postgres` | `public, pg_temp` | ✅ SÍ | ✅ SÍ | 🔓 NO | — |
| `sync_admin_user_id` | `postgres` | `public, auth, pg_temp` | ❌ NO | ❌ NO | 🔓 NO | — |
| `verify_public_order_or_tickets` | `postgres` | `public, pg_temp` | ✅ SÍ | ✅ SÍ | 🔓 NO | — |

### Análisis Específico de `is_admin()` y `is_superadmin()`
```sql
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT NULL::uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = v_uid OR LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = v_uid))
      AND is_active = true
  );
END; $$;
```
- **Fortaleza:** Sobrescribe cualquier parámetro de entrada con `auth.uid()`. Un cliente que llame `is_admin('uuid-de-admin')` desde un contexto anónimo o no privilegiado recibe invariablemente `false`.
- **Manejo de Inactividad:** Si `is_active = false`, la función retorna `false` inmediatamente.
- **Verificación por Email:** Hace match secundario por email si `user_id` aún no ha sido sincronizado en `admin_users`.

---

## SECCIÓN 5: AUDITORÍA INTEGRAL DE RPCS (STORED PROCEDURES)

Se analizaron las 30 funciones del esquema. De ellas, las siguientes corresponden a RPCs públicas o administrativas invocables por API:

### 1. RPC `reserve_tickets` (VULNERABILIDAD CRÍTICA SEC-02)
- **Parámetros:** `p_raffle_id UUID, p_ticket_numbers TEXT[], p_buyer_id UUID, p_duration_minutes INTEGER DEFAULT NULL`
- **Modo:** `SECURITY DEFINER`, Owner: `postgres`
- **Grants:** `PUBLIC, anon, authenticated`
- **Falla de Diseño:** Acepta `p_duration_minutes` sin validación de rango ni límite superior. Permite pasar `p_duration_minutes = 5256000` (10 años).
- **Falla de Autorización:** Puede ser invocada de forma anónima con `p_buyer_id = NULL` o un UUID ficticio.
- **Falla de Integridad:** Deja los boletos en estado `reserved` con `order_id = NULL`.
- **Riesgo:** Un atacante con un solo script puede reservar el 100% de los boletos de una rifa por 10 años en menos de 5 segundos sin pagar ni registrar datos reales.

### 2. RPC `cancel_order` (VULNERABILIDAD ALTA SEC-03)
- **Parámetros:** `p_order_id UUID, p_reason TEXT`
- **Modo:** `SECURITY DEFINER`, Owner: `postgres`
- **Grants:** `authenticated, postgres, service_role`
- **Falla de Autorización:** **NO valida si el usuario es administrador (`is_admin`) NI verifica si el invocador es el comprador que realizó la orden (`buyer_id`).**
- **Riesgo:** Cualquier usuario que cree una cuenta normal en Supabase Auth (`authenticated`) puede enviar peticiones `rpc/cancel_order` con los UUIDs de órdenes de otros compradores (incluso aquellas en `pending_verification` con comprobantes ya subidos), provocando la cancelación de la orden y la liberación de los boletos.

### 3. RPC `create_order_secure` (ROBUSTA)
- **Parámetros:** `p_raffle_id UUID, p_ticket_numbers TEXT[], p_buyer_data JSONB, p_payment_method TEXT, p_contact_preference TEXT`
- **Modo:** `SECURITY DEFINER`, Owner: `postgres`
- **Grants:** `PUBLIC, anon, authenticated`
- **Validaciones:**
  * Rifa activa.
  * Límite de boletos por compra (`v_allowed_max_tickets`).
  * Cálculo de monto en servidor: `v_total_amount := v_raffle.ticket_price * v_ticket_count`.
  * Bloqueo transaccional de boletos con `FOR UPDATE`.
  * Validación estricta de campos obligatorios del comprador.
  * Registro completo en `audit_logs`.

### 4. RPCs `approve_order_payment` y `reject_order_payment` (BUG CRÍTICO SEC-01)
- **Parámetros:** `p_order_id UUID` (y `p_reason TEXT` en reject).
- **Modo:** `SECURITY DEFINER`, Owner: `postgres`
- **Grants:** `authenticated` (exige `public.is_admin(auth.uid())`).
- **Hallazgo Crítico:** La consulta de actualización de boletos contiene:
  ```sql
  UPDATE public.tickets
  SET status = 'sold', ...
  WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');
  ```
  Si un comprador tiene dos órdenes pendientes separadas (e.g. Orden A con 2 boletos y Orden B con 5 boletos), al aprobar la Orden A, **el sistema marcará como vendidos también los 5 boletos de la Orden B sin haber recibido el pago correspondiente**. Y si se rechaza la Orden A, liberará los boletos de ambas órdenes.

### 5. RPC `register_winner` (ROBUSTA)
- **Parámetros:** `p_raffle_id UUID, p_ticket_number TEXT, p_lottery_draw_number TEXT, p_draw_date TIMESTAMPTZ, p_official_act_url TEXT, p_delivery_photos TEXT[], p_notes TEXT`
- **Modo:** `SECURITY DEFINER`, Owner: `postgres`
- **Grants:** `authenticated` (exige `public.is_admin(auth.uid())`).
- **Validaciones:**
  * Exige que el boleto exista y su estado sea estrictamente `sold`.
  * Verifica que la orden esté pagada (`paid/completed`).
  * Bloquea el boleto con `FOR UPDATE`.
  * Transiciona la rifa a estado `finished`.
  * Registra auditoría completa con datos del ganador y admin actuante.

---

## SECCIÓN 6: MASS ASSIGNMENT Y ASIGNACIÓN MASIVA

### ¿Qué sucede si un cliente intenta inyectar campos arbitrarios?

1. **Inyección en `create_order_secure`:** Inmune. La RPC recibe `p_buyer_data` en JSONB pero extrae explícitamente solo los campos necesarios (`documentId`, `fullName`, `phone`, `email`, `city`). Campos inyectados como `role`, `is_admin`, `status` o `total_amount` son ignorados.
2. **Inyección directa vía PostgREST en `orders`:** **VULNERABLE.** La política RLS `"Compradores pueden adjuntar comprobante a su orden"` permite `UPDATE` a `public` en filas con `status IN ('pending', 'pending_verification')`. Un atacante puede enviar un payload HTTP `PATCH /rest/v1/orders?id=eq.<id>` con:
   ```json
   {
     "total_amount": 1.00,
     "ticket_count": 1,
     "contact_preference": "hacked"
   }
   ```
   PostgreSQL ejecutará la actualización porque no existen triggers que validen la inmutabilidad de `total_amount` o `ticket_count` durante una actualización regular.
3. **Inyección directa en `admin_users`:** **VULNERABLE.** Si un usuario autenticado con rol `admin` realiza `PATCH /rest/v1/admin_users?id=eq.<mi_id>` con `{ "role": "superadmin" }`, la política `is_admin()` lo autoriza y el motor no bloquea la mutación.

---

## SECCIÓN 7: INSECURE DIRECT OBJECT REFERENCES (IDOR)

### 1. IDOR en Visualización de Compradores y Órdenes
- **Estado:** **PROTEGIDO.** Un usuario anónimo o autenticado no puede consultar `SELECT * FROM buyers WHERE id = <uuid>` ni `SELECT * FROM orders WHERE id = <uuid>`. RLS bloquea la lectura.
- **Consulta Ciudadana:** Se realiza mediante `verify_public_order_or_tickets(p_search_term)`. La función enmascara el nombre (`Carlos M.`) y la cédula (`1065***40`), y no retorna correos electrónicos ni teléfonos.

### 2. IDOR en Mutación y Cancelación de Órdenes
- **`cancel_order(p_order_id)`:** **VULNERABLE A IDOR.** No hay validación de pertenencia. Cualquier atacante autenticado con el UUID de una orden puede forzar su cancelación.
- **`submit_payment_proof(p_order_id)`:** **VULNERABLE A IDOR CONDICIONAL.** Un atacante que conozca el UUID de una orden ajena en estado `pending` puede invocar esta RPC y adjuntar un comprobante falso o erróneo a la orden de otra persona, alterando su estado a `pending_verification`.

---

## SECCIÓN 8: AUDITORÍA DE SUPABASE STORAGE

### Inventario de Buckets

| Bucket ID | Público | Límite Tamaño | MIME Types Permitidos | Estado en BD |
| :--- | :---: | :---: | :--- | :--- |
| `receipts` | **SÍ (Público)** | **Ilimitado (NULL)** | **Cualquiera (NULL)** | Creado en `storage.buckets` |
| `payment-proofs` | **NO (Privado)** | 5 MB (5,242,880 B) | JPEG, PNG, WEBP, PDF | Creado en `storage.buckets` |
| `gallery-images` | **SÍ (Público)** | 10 MB (10,485,760 B) | JPEG, PNG, WEBP, AVIF, SVG | Creado en `storage.buckets` |
| `prize-images` | — | — | — | **No creado en buckets** (solo en RLS) |
| `partner-logos` | — | — | — | **No creado en buckets** (solo en RLS) |
| `winner-documents` | — | — | — | **No creado en buckets** (solo en RLS) |

### Análisis de Políticas de Storage (`storage.objects`)

1. **Falla Crítica en Bucket `receipts` (SEC-05):**
   ```sql
   Policy: "Subida pública de comprobantes"
   cmd: INSERT | roles: {public}
   with_check: (bucket_id = 'receipts'::text)
   ```
   Cualquier persona del mundo con la `anon key` puede subir cualquier archivo binario ejecutable (`.exe`, `.sh`, `.php`, `.html`), de cualquier tamaño (incluso decenas de gigabytes), con nombres arbitrarios. Esto genera un riesgo inminente de:
   - Saturación de la cuota de almacenamiento de Supabase (Denial of Wallet / Service).
   - Hospedaje de malware o contenido ilícito utilizando el dominio de Supabase del proyecto.
   - Phishing o defacement.

2. **Bucket `payment-proofs` (Diseño Seguro):**
   - Es privado (`public: false`).
   - La lectura (`SELECT`) está restringida exclusivamente a administradores (`is_admin()`).
   - La subida (`INSERT`) exige que el path contenga el ID de una orden válida en estado `pending` o `pending_verification`.
   - Tamaño acotado a 5 MB y tipos MIME de imágenes y PDF.

3. **Riesgo en Tipos SVG en `gallery-images` (Cross-Site Scripting / Stored XSS):**
   - El bucket `gallery-images` permite `image/svg+xml`.
   - Si un administrador sube un archivo SVG que contenga `<script>alert(1)</script>`, y ese SVG es renderizado directamente por el navegador de los visitantes o de otros administradores sin sanitización (`DOMPurify`), puede ejecutarse JavaScript en el contexto del dominio de la aplicación.

---

## SECCIÓN 9: ESCALAMIENTO DE PRIVILEGIOS

### Vector 1: De Usuario Autenticado / Admin a Superadmin (SEC-04)
- **Mecanismo:** La política RLS `"Superadmins pueden gestionar administradores"` en la tabla `admin_users` está definida con:
  `qual: (SELECT is_admin(auth.uid()))`.
- **Explotación:**
  Un usuario con rol `admin` o `auditor` se autentica en la aplicación. Luego, utilizando su token JWT, envía directamente a PostgREST:
  ```http
  PATCH /rest/v1/admin_users?id=eq.<mi_admin_user_id> HTTP/1.1
  Authorization: Bearer <jwt_del_admin>
  apikey: <anon_key>
  Content-Type: application/json

  { "role": "superadmin" }
  ```
- **Resultado:** PostgreSQL evalúa `is_admin(auth.uid())`. Como el usuario ya es admin activo, la política evalúa a `TRUE`. Al no haber triggers que impidan la auto-promoción, el usuario pasa a ser `superadmin`.

### Vector 2: Suplantación de Administrador Pre-Invitado (SEC-08)
- **Mecanismo:** El trigger `sync_admin_user_id` en `auth.users` vincula automáticamente una cuenta recién creada con una fila en `admin_users` si `LOWER(auth.users.email) = LOWER(admin_users.email)`.
- **Precondición:** Que la confirmación de correo electrónico en Supabase Auth esté deshabilitada o que el atacante pueda crear la cuenta antes de que el usuario legítimo lo haga.
- **Resultado:** El atacante se autentica como el correo invitado y el sistema le asigna los privilegios de administrador inmediatamente.

---

## SECCIÓN 10: CONCURRENCIA Y CONDICIONES DE CARRERA

### 1. Reserva y Compra Concurrente del Mismo Boleto
- **Evaluación:** **RESISTENTE.** La RPC `create_order_secure` ejecuta:
  ```sql
  WITH locked_tickets AS (
      SELECT id, number FROM public.tickets
      WHERE raffle_id = p_raffle_id
        AND number = ANY(p_ticket_numbers)
        AND (status = 'available' OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW()))
      FOR UPDATE
  )
  ```
  El bloqueo pesimista `FOR UPDATE` fuerza la serialización estricta de las transacciones concurrentes a nivel de fila. Si dos compradores intentan comprar el mismo boleto en el mismo milisegundo, la primera transacción adquiere el bloqueo exclusivo; la segunda transacción espera y, al liberarse el lock, detecta que `status` ya no es `available`, retornando:
  `{"success": false, "error": "Uno o más números ya no se encuentran disponibles."}`.

### 2. Aprobación y Rechazo Concurrente de Pagos
- **Evaluación:** **RESISTENTE.** Tanto `approve_order_payment` como `reject_order_payment` ejecutan `SELECT * FROM public.orders WHERE id = p_order_id FOR UPDATE`. Si dos administradores intentan aprobar o rechazar simultáneamente la misma orden, uno adquiere el lock y cambia el estado. El segundo encuentra la orden con `status = 'paid'` y la transacción se detiene.

### 3. Expiración de Reservas vs Confirmación de Pago
- **Evaluación:** **RESISTENTE.** La función `release_expired_reservations` explícitamente protege las órdenes en verificación o pagadas:
  ```sql
  AND NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = t.order_id AND o.status IN ('pending_verification', 'paid', 'completed')
  )
  ```
  Si un comprador subió el comprobante (pasando a `pending_verification`), sus boletos quedan blindados contra el cron de expiración.

---

## SECCIÓN 11: INTEGRIDAD DE NEGOCIO Y MODELO ECONÓMICO

### 1. ¿Se puede alterar el precio de un boleto o de una orden?
- **Al crear la orden:** NO. `create_order_secure` calcula el monto leyendo `ticket_price` de la tabla `raffles`. El cliente no tiene control sobre el precio.
- **Una vez creada la orden (en estado pending):** SÍ, parcialmente, si un atacante explota el `UPDATE` directo de la tabla `orders` vía PostgREST antes de la aprobación (Vulnerabilidad SEC-06).

### 2. ¿Se pueden marcar boletos como vendidos sin pago verificado?
- **Vía RPC:** Solo los administradores pueden invocar `approve_order_payment`.
- **Trigger de Protección:** El trigger `trg_validate_order_status` rechaza transiciones directas a `paid` si no existe comprobante o referencia:
  ```sql
  IF OLD.status = 'pending' AND NEW.status IN ('paid', 'completed') THEN
      IF NEW.receipt_url IS NULL AND NEW.payment_gateway_id IS NULL THEN
          RAISE EXCEPTION 'Transición inválida: No se puede aprobar una orden pendiente sin comprobante...';
      END IF;
  END IF;
  ```

### 3. ¿Se puede registrar un boleto no vendido como ganador?
- **Evaluación:** **IMPOSIBLE vía RPC.** La función `register_winner` verifica:
  ```sql
  IF v_ticket.ticket_status <> 'sold' THEN
      RETURN jsonb_build_object('success', false, 'error', 'El boleto no puede registrarse como ganador porque no está vendido...');
  END IF;
  ```
  Solo boletos con pago confirmado y orden en `paid/completed` pueden ser asignados como ganadores.

### 4. ¿Se pueden reabrir rifas finalizadas?
- **Evaluación:** En la tabla `raffles`, las políticas RLS no permiten `UPDATE` directo a clientes ni admins; las actualizaciones se efectúan mediante `admin_update_raffle`.
- En `register_winner`, la rifa pasa a `status = 'finished'`. En `admin_update_raffle`, no hay restricción explícita que impida a un admin cambiar el estado de `finished` a `active`, lo cual representa un riesgo de gobernanza operativa que debe restringirse.

---

## SECCIÓN 12: MATRIZ EXHAUSTIVA DE ACCESO (ACTOR × RECURSO × OPERACIÓN × RESULTADO)

Esta matriz consolida el resultado de la interacción entre cada actor, cada recurso del sistema y las operaciones posibles:

| Recurso / Entidad | Operación | Actor Anónimo (Anon) | Comprador Autenticado | Administrador (Admin) | Superadministrador | Veredicto |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `admin_users` | `SELECT` | ❌ Denegado | ⚠️ Solo su fila | ✅ Permitido | ✅ Permitido | Adecuado |
| `admin_users` | `INSERT` | ❌ Denegado | ❌ Denegado | 🚨 Vulnerable | ✅ Permitido | Falla SEC-04 |
| `admin_users` | `UPDATE` | ❌ Denegado | ❌ Denegado | 🚨 Vulnerable | ✅ Permitido | Falla SEC-04 |
| `admin_users` | `DELETE` | ❌ Denegado | ❌ Denegado | 🚨 Vulnerable | ✅ Permitido | Falla SEC-04 |
| `audit_logs` | `SELECT` | ❌ Denegado | ❌ Denegado | ✅ Permitido | ✅ Permitido | Blindado |
| `audit_logs` | `INSERT/MUT` | ❌ Denegado | ❌ Denegado | ❌ Denegado | ❌ Denegado | Solo Triggers |
| `buyers` | `SELECT` | ❌ Denegado | ❌ Denegado | ✅ Permitido | ✅ Permitido | PII Blindada |
| `buyers` | `INSERT/MUT` | ❌ Denegado | ❌ Denegado | ⚠️ Solo RPC | ⚠️ Solo RPC | Blindado |
| `orders` | `SELECT` | ❌ Denegado | ❌ Denegado | ✅ Permitido | ✅ Permitido | Blindado |
| `orders` | `INSERT` | ❌ Denegado | ❌ Denegado | ✅ Permitido | ✅ Permitido | Vía create_order |
| `orders` | `UPDATE` | 🚨 Permite (Pending) | 🚨 Permite (Pending) | ✅ Permitido | ✅ Permitido | Falla SEC-06 |
| `orders` | `DELETE` | ❌ Denegado | ❌ Denegado | ❌ Denegado | ❌ Denegado | Inmutable |
| `tickets` | `SELECT` | ✅ Permitido (Público) | ✅ Permitido | ✅ Permitido | ✅ Permitido | Transparente |
| `tickets` | `MUTATION` | ❌ Denegado | ❌ Denegado | ⚠️ Solo RPC | ⚠️ Solo RPC | Blindado |
| `payment_proofs` | `INSERT` | ✅ Solo si orden pending | ✅ Solo si orden pending | ✅ Permitido | ✅ Permitido | Validado |
| `payment_proofs` | `SELECT` | ❌ Denegado | ❌ Denegado | ✅ Permitido | ✅ Permitido | Blindado |
| `notification_logs` | `SELECT` | ❌ Denegado | 💥 Error 42501 | ✅ Permitido | ✅ Permitido | Falla SEC-07 |
| `Storage: receipts` | `UPLOAD` | 🚨 Irrestricto | 🚨 Irrestricto | ✅ Permitido | ✅ Permitido | Falla SEC-05 |
| `Storage: payment-proofs` | `UPLOAD` | ✅ Validado por orden | ✅ Validado por orden | ✅ Permitido | ✅ Permitido | Seguro |
| `Storage: payment-proofs` | `DOWNLOAD` | ❌ Denegado | ❌ Denegado | ✅ Vía Signed URL | ✅ Vía Signed URL | Seguro |
| `RPC: create_order_secure` | `EXECUTE` | ✅ Permitido | ✅ Permitido | ✅ Permitido | ✅ Permitido | Robusto |
| `RPC: reserve_tickets` | `EXECUTE` | 🚨 Explotable DoS | 🚨 Explotable DoS | ✅ Permitido | ✅ Permitido | Falla SEC-02 |
| `RPC: cancel_order` | `EXECUTE` | ❌ Denegado | 🚨 IDOR Arbitrario | ✅ Permitido | ✅ Permitido | Falla SEC-03 |
| `RPC: approve_order_payment` | `EXECUTE` | ❌ Denegado | ❌ Denegado | ⚠️ Riesgo Boletos | ⚠️ Riesgo Boletos | Falla SEC-01 |
| `RPC: register_winner` | `EXECUTE` | ❌ Denegado | ❌ Denegado | ✅ Permitido | ✅ Permitido | Robusto |

---

## SECCIÓN 13: CATÁLOGO FORMAL DE VULNERABILIDADES

### [SEC-01] Contaminación Cruzada y Desvinculación Masiva de Boletos en Órdenes Múltiples
- **Severidad:** **CRÍTICA** (8.5 (CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:N/I:H/A:H))
- **Vector:** Lógica Defectuosa en Stored Procedures SQL
- **Precondiciones:** Que un mismo comprador reserve boletos en dos o más órdenes distintas.
- **Objeto Afectado:** `RPCs `approve_order_payment`, `reject_order_payment` y `submit_payment_proof``
- **Evidencia en Código:**
```sql
UPDATE public.tickets
SET status = 'sold', reservation_expires_at = NULL, updated_at = NOW()
WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');
```
- **Impacto:** Al aprobar la Orden 1 de un comprador, los boletos reservados de su Orden 2 (aún no pagada) son marcados como vendidos definitivamente sin pago. Si se rechaza la Orden 1, se liberan y desvinculan los boletos de ambas órdenes.
- **Explotabilidad:** Alta en operación normal diaria sin requerir intencionalidad maliciosa.
- **Corrección Propuesta:**
```sql
Eliminar la cláusula OR y filtrar estrictamente por order_id:
UPDATE public.tickets
SET status = 'sold', reservation_expires_at = NULL, updated_at = NOW()
WHERE order_id = p_order_id;
```

### [SEC-02] Denegación de Servicio y Bloqueo Indefinido de Boletos (Ticket Starvation)
- **Severidad:** **ALTA** (7.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H))
- **Vector:** RPC Legacy `reserve_tickets` expuesta sin control de parámetros
- **Precondiciones:** Conexión a internet y `anon key` pública.
- **Objeto Afectado:** `RPC `reserve_tickets``
- **Evidencia en Código:**
```sql
v_effective_duration := COALESCE(p_duration_minutes, v_sys_duration, 10);
v_expires_at := v_now + (v_effective_duration || ' minutes')::INTERVAL;
... UPDATE public.tickets SET status = 'reserved', reservation_expires_at = v_expires_at...
```
- **Impacto:** Un atacante puede invocar la función con `p_duration_minutes = 5256000` y bloquear la venta completa de la rifa por 10 años, destruyendo la operatividad comercial.
- **Explotabilidad:** Extremadamente alta (un comando curl/fetch).
- **Corrección Propuesta:**
```sql
Revocar inmediatamente la ejecución a anon y authenticated:
REVOKE EXECUTE ON FUNCTION public.reserve_tickets FROM PUBLIC, anon, authenticated;
O eliminar la función por completo al haber sido reemplazada por create_order_secure.
```

### [SEC-03] Cancelación Arbitraria de Órdenes Ajenas por Falta de Autorización (IDOR)
- **Severidad:** **ALTA** (7.1 (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:L))
- **Vector:** Insecure Direct Object Reference (IDOR) en RPC `cancel_order`
- **Precondiciones:** Tener una cuenta autenticada cualquiera en Supabase y conocer el UUID de una orden.
- **Objeto Afectado:** `RPC `cancel_order``
- **Evidencia en Código:**
```sql
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN ...
  IF v_order.status IN ('paid', 'completed') THEN ...
  UPDATE public.orders SET status = 'cancelled' ...
```
- **Impacto:** Un usuario malicioso autenticado puede cancelar órdenes de otros clientes que se encuentren en verificación de pago, liberando sus boletos para volver a comprarlos o sabotear la rifa.
- **Explotabilidad:** Alta.
- **Corrección Propuesta:**
```sql
Exigir rol de administrador o verificar que el auth.uid() coincida con el usuario vinculado a la orden:
IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores pueden cancelar órdenes.';
END IF;
```

### [SEC-04] Escalamiento Vertical de Privilegios a Superadministrador en `admin_users`
- **Severidad:** **ALTA** (7.2 (CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H))
- **Vector:** Row Level Security Policy Mal Calibrada
- **Precondiciones:** Ser un usuario con rol `admin` o `auditor`.
- **Objeto Afectado:** `Tabla `admin_users` / Policy `"Superadmins pueden gestionar administradores"``
- **Evidencia en Código:**
```sql
CREATE POLICY "Superadmins pueden gestionar administradores" ON admin_users FOR ALL TO authenticated
USING ((SELECT is_admin(auth.uid())))
WITH CHECK ((SELECT is_admin(auth.uid())));
```
- **Impacto:** Cualquier administrador o auditor puede invocar directamente PostgREST y actualizar su rol a `superadmin`, eliminar a otros administradores o saltarse las restricciones de `admin_toggle_user_status`.
- **Explotabilidad:** Media-Alta (requiere token de admin/auditor).
- **Corrección Propuesta:**
```sql
Modificar la política para exigir estrictamente is_superadmin(auth.uid()):
ALTER POLICY "Superadmins pueden gestionar administradores" ON admin_users
USING ((SELECT public.is_superadmin(auth.uid())))
WITH CHECK ((SELECT public.is_superadmin(auth.uid())));
```

### [SEC-05] Bucket `receipts` Público con Subida Irrestricta y sin Control de Archivos
- **Severidad:** **ALTA** (7.3 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:L))
- **Vector:** Configuración Insegura de Supabase Storage
- **Precondiciones:** Ninguna (acceso anónimo público).
- **Objeto Afectado:** `Bucket `receipts` y Policy `"Subida pública de comprobantes"``
- **Evidencia en Código:**
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true);
CREATE POLICY "Subida pública de comprobantes" ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'receipts');
```
- **Impacto:** Subida indiscriminada de archivos maliciosos, binarios ejecutables, HTML con phishing, y saturación de la cuota de almacenamiento.
- **Explotabilidad:** Extremadamente alta.
- **Corrección Propuesta:**
```sql
Eliminar el bucket receipts y utilizar exclusivamente payment-proofs (que es privado y valida órdenes), o aplicar DROP POLICY "Subida pública de comprobantes" ON storage.objects y configurar bucket_id como privado con límites MIME estrictos.
```

### [SEC-06] Manipulación Arbitraria de Órdenes Pendientes por Falta de Restricción Columnar
- **Severidad:** **MEDIA** (5.3 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N))
- **Vector:** Mass Assignment en Policy UPDATE de `orders`
- **Precondiciones:** Conocer el ID de una orden pendiente.
- **Objeto Afectado:** `Tabla `orders` / Policy `"Compradores pueden adjuntar comprobante a su orden"``
- **Evidencia en Código:**
```sql
CREATE POLICY "Compradores pueden adjuntar comprobante a su orden" ON orders FOR UPDATE TO public
USING (status IN ('pending', 'pending_verification'));
```
- **Impacto:** Un usuario puede modificar campos sensibles de la orden (`total_amount`, `buyer_id`, `ticket_count`, `expires_at`).
- **Explotabilidad:** Media.
- **Corrección Propuesta:**
```sql
Restringir la política de UPDATE o limitar los permisos columnarios:
REVOKE UPDATE ON public.orders FROM public, anon, authenticated;
GRANT UPDATE (receipt_url, payment_gateway_id, status) ON public.orders TO anon, authenticated;
```

### [SEC-07] Falla DoS en `notification_logs` por Acceso no Autorizado a `auth.users`
- **Severidad:** **MEDIA** (4.3 (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:L))
- **Vector:** Policy RLS con Referencia Cruzada a Tabla Restringida
- **Precondiciones:** Usuario autenticado consultando sus notificaciones.
- **Objeto Afectado:** `Tabla `notification_logs` / Policy `"Compradores pueden ver logs de sus órdenes"``
- **Evidencia en Código:**
```sql
AND (lower(b.email) = lower((SELECT users.email FROM auth.users WHERE users.id = auth.uid())))
```
- **Impacto:** Inoperatividad total de las consultas de notificaciones para usuarios autenticados debido al error 42501 de PostgreSQL.
- **Explotabilidad:** Inmediata al consultar la tabla.
- **Corrección Propuesta:**
```sql
Reemplazar la subconsulta por claims JWT:
AND (lower(b.email) = lower(COALESCE(auth.jwt()->>'email', '')))
```

### [SEC-08] Adopción de Privilegios Administrativos ante Correos no Verificados
- **Severidad:** **MEDIA** (6.8 (CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N))
- **Vector:** Trigger de sincronización automática en registro de Auth
- **Precondiciones:** Confirmación de email deshabilitada en Supabase Auth y correo de admin pre-invitado conocido.
- **Objeto Afectado:** `Trigger `sync_admin_user_id` en `auth.users``
- **Evidencia en Código:**
```sql
UPDATE public.admin_users SET user_id = NEW.id WHERE LOWER(email) = LOWER(NEW.email)...
```
- **Impacto:** Un atacante que registre una cuenta con el correo de un administrador adquiere inmediatamente permisos administrativos.
- **Explotabilidad:** Baja si la confirmación de email está activa; Alta si está inactiva.
- **Corrección Propuesta:**
```sql
Exigir que NEW.email_confirmed_at IS NOT NULL en el trigger antes de sincronizar el user_id.
```

### [SEC-09] Enumeración Pública de Cédulas y Participantes de la Rifa
- **Severidad:** **BAJA** (3.1 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N))
- **Vector:** Búsqueda pública por documento en RPC `verify_public_order_or_tickets`
- **Precondiciones:** Ninguna.
- **Objeto Afectado:** `RPC `verify_public_order_or_tickets``
- **Evidencia en Código:**
```sql
ELSIF v_is_numeric THEN SELECT ... WHERE b.document_id = v_clean_term LIMIT 10;
```
- **Impacto:** Permite confirmar si un número de cédula específico ha participado en la rifa y obtener las referencias de sus órdenes.
- **Explotabilidad:** Alta mediante fuerza bruta sin rate limiting.
- **Corrección Propuesta:**
```sql
Implementar limitación de tasa (rate limiting) en el API Gateway o exigir tanto cédula como referencia para la consulta.
```

### [SEC-10] Políticas RLS Huérfanas para Buckets de Storage Inexistentes
- **Severidad:** **INFORMATIVA** (N/A)
- **Vector:** Inconsistencia de configuración
- **Precondiciones:** N/A
- **Objeto Afectado:** `Políticas en `storage.objects` (`prize-images`, `partner-logos`, `winner-documents`)`
- **Evidencia en Código:**
```sql
Existen 10 políticas para estos buckets, pero los buckets no existen en storage.buckets.
```
- **Impacto:** Ruido en auditorías y riesgo de configuración errónea si los buckets se crean en el futuro sin revisar las políticas.
- **Explotabilidad:** Nula actualmente.
- **Corrección Propuesta:**
```sql
Crear formalmente los buckets con sus cuotas y tipos MIME o eliminar las políticas huérfanas.
```

---

## SECCIÓN 14: EVALUACIÓN GLOBAL Y VEREDICTO DE SEGURIDAD

### Calificación Ponderada de Seguridad Backend: **68 / 100**

#### Desglose de Puntuación:
- **Protección de Datos Personales (PII):** 95/100 (Excelente: RLS activo, enmascaramiento SQL nativo).
- **Consistencia Financiera y Creación de Órdenes:** 90/100 (Muy Bueno: Precios forzados en servidor, locks `FOR UPDATE`).
- **Control de Acceso Administrativo (RPCs):** 75/100 (Bueno: `is_admin()` forzado a `auth.uid()`, pero bypass en `admin_users` directo).
- **Gestión y Almacenamiento de Archivos (Storage):** 40/100 (Deficiente: Bucket `receipts` público y sin cuotas).
- **Lógica de Integridad de Órdenes Cruzadas:** 40/100 (Crítico: Riesgo de afectación masiva de boletos en órdenes del mismo comprador).

### Veredicto de Seguridad

> [!CAUTION]
> **ESTADO: NO APTO PARA PRODUCCIÓN MASIVA HASTA RESOLVER SEC-01, SEC-02, SEC-04 Y SEC-05.**
>
> Si bien el sistema presenta defensas de alto nivel contra ataques clásicos de inyección SQL, robo masivo de PII y alteración de precios, contiene **defectos lógicos severos en procedimientos almacenados legacy y políticas de almacenamiento** que exponen a la plataforma a:
> 1. Corrupción contable de boletos ante compradores con órdenes múltiples (`SEC-01`).
> 2. Bloqueo malicioso de la venta total de la rifa por usuarios anónimos (`SEC-02`).
> 3. Compromiso de cuota o abuso de hospedaje en Supabase Storage (`SEC-05`).
> 4. Auto-promoción no autorizada a superadministrador (`SEC-04`).

### Plan de Remediación Inmediata (Orden de Prioridad)

1. **Fase 1: Remediación Crítica (Día 1):**
   - Modificar `approve_order_payment`, `reject_order_payment` y `submit_payment_proof` para eliminar el filtro `OR (buyer_id = ... AND status = 'reserved')` y acotar la mutación exclusivamente a `order_id = p_order_id`.
   - Revocar permisos o eliminar la función `reserve_tickets` (`REVOKE EXECUTE ON FUNCTION public.reserve_tickets FROM PUBLIC, anon, authenticated`).
   - Modificar la política RLS de `admin_users` para que exija `is_superadmin(auth.uid())` en lugar de `is_admin()`.
   - Cerrar o restringir el bucket `receipts` en Storage, forzando el uso exclusivo del bucket privado `payment-proofs`.
   - Blindar `cancel_order` exigiendo verificación de `is_admin(auth.uid())`.

2. **Fase 2: Estabilización Operativa (Semana 1):**
   - Corregir la política de `notification_logs` eliminando la referencia a `auth.users` y empleando `auth.jwt()->>'email'`.
   - Restringir la política de `UPDATE` en `orders` para permitir únicamente la modificación de columnas seguras (`receipt_url`, `payment_gateway_id`, `status`).
   - Añadir validación de `email_confirmed_at IS NOT NULL` en el trigger `sync_admin_user_id`.

3. **Fase 3: Hardening y Auditoría Continua:**
   - Implementar rate limiting en el API Gateway sobre `verify_public_order_or_tickets`.
   - Crear formalmente los buckets faltantes (`prize-images`, `partner-logos`, `winner-documents`) con restricciones de extensión y tamaño.
   - Configurar alertas automáticas en Supabase ante llamadas fallidas de privilegios.

---
*Fin del Informe de Auditoría 2 — Seguridad PostgreSQL / Supabase / RLS / RPC.*
