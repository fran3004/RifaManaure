# Auditoría — Lote 6: Edge Functions + Script utilitario

> Fecha: 2026-09-17 | Estado: ✅ Completo

---

## 46. `supabase/functions/send-transactional-email/index.ts`

### A. Qué hace
Edge Function en Deno (runtime de Supabase). Es el backend seguro de toda la comunicación de correo: recibe `{ orderId, eventType }` del frontend, valida autorización, consulta la BD con la service role key, construye el HTML del email y lo envía vía API de Resend. También gestiona idempotencia para evitar duplicados.

### B. Errores y bugs reales

**1. El anon key del cliente permite invocar la función para `PAYMENT_RECEIVED` — sin restricción de rate:**
```ts
// C. Validación por clave anónima (checkout público legítimo)
if (!isAuthorized && (token === supabaseAnonKey || apiKeyHeader === supabaseAnonKey)) {
  if (eventType === "PAYMENT_RECEIVED" && !isRetry) {
    isAuthorized = true;
  }
}
```
Cualquier usuario anónimo puede llamar a esta Edge Function con cualquier `orderId` y `eventType === "PAYMENT_RECEIVED"`. No hay rate limiting, no hay verificación de que `orderId` pertenezca al comprador que lo llama. Un usuario malintencionado podría:
- Iterar UUIDs de órdenes de otros compradores para spamear emails de "comprobante recibido"
- Usar el idempotency key para invalidar el registro de notificación legítimo de otra orden

La idempotencia detiene el reenvío del mismo orderId+eventType, pero no protege contra llamadas con cualquier orderId. **Superficie de abuso real.**

**2. La autorización por JWT de sesión acepta cualquier usuario autenticado de Supabase (punto B), no solo admins:**
```ts
// B. Validación por JWT de sesión de usuario autenticado (administrador)
if (!isAuthorized && token && token !== supabaseAnonKey) {
  const { data: userData } = await supabaseUserClient.auth.getUser(token);
  if (!userError && userData?.user) {
    isAuthorized = true; // ← cualquier usuario auth
  }
}
```
Si algún comprador tuviera una cuenta de Supabase Auth (que no es el caso actual, pero podría ocurrir si se añade auth pública), podría invocar la función para enviar emails de `PAYMENT_APPROVED` o `PAYMENT_REJECTED` sobre cualquier orden. La verificación real de "¿es admin?" debería hacerse con `is_admin(auth.uid())` en la BD o consultando `admin_users`.

**3. La Edge Function duplica funciones de utilidad ya definidas en el frontend:**
`formatCOP` (línea 34) y `formatTicketNumber` (línea 42) son copias exactas de las definidas en `src/lib/utils.ts`. En un runtime Deno no se puede importar desde `src/`, pero la duplicación es un riesgo de mantenimiento: si el formato de COP cambia en el frontend, el email seguirá usando el formato viejo. Debería haber una librería compartida o generarse el HTML en el cliente y pasarlo como parámetro.

**4. `RESEND_FROM_EMAIL` tiene un fallback `onboarding@resend.dev` activo (línea 335):**
```ts
const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Manaure Vive <onboarding@resend.dev>";
```
`onboarding@resend.dev` es un dominio de prueba de Resend que en la mayoría de los planes paid no puede usarse para envíos reales. Si `RESEND_FROM_EMAIL` no está configurado en los secrets de Supabase, todos los emails saldrán de este remitente genérico, lo que probablemente provoque rechazos o falle la verificación de dominio. **Bug de configuración de producción.**

**5. La Edge Function acepta llamadas CORS desde cualquier subdominio `*.pages.dev`:**
```ts
const isCloudflarePages = origin.endsWith(".pages.dev") && origin.startsWith("https://");
```
Esto permite que cualquier proyecto de Cloudflare Pages (no solo el de Manaure Vive) llame a esta función desde el navegador. Si alguien crea `manaure-malicious.pages.dev`, su JavaScript tendría acceso CORS a esta Edge Function. Para producción, debería restringirse al subdominio específico del proyecto (por ejemplo, `manaure-vive.pages.dev`).

**6. El HTML del email no tiene ningún mecanismo anti-phishing ni firma digital:**
Los emails transaccionales no incluyen headers `DKIM`, `SPF` ni `DMARC` explícitamente (aunque Resend los gestiona si el dominio está configurado). Si `RESEND_FROM_EMAIL` usa `onboarding@resend.dev` (fallback), el email puede ser marcado como spam por proveedores como Gmail o Hotmail.

**7. El `drawDate` se pasa directamente del campo `raffles.draw_date` a la plantilla HTML sin formatear (línea 455):**
```ts
drawDate: raffle?.draw_date,
```
En `getEmailHtml`, `data.drawDate` se renderiza en la tabla sin transformar. Si `draw_date` es un ISO string (`"2025-12-15T00:00:00+00:00"`), el email mostrará ese string técnico en lugar de `"15/12/2025"`. Hay que formatearlo con `toLocaleDateString('es-CO')` o similar.

### C. Calidad de código
- Validación de consistencia entre `eventType` y `order.status` antes de enviar (L402–420) — excelente protección contra envíos incorrectos. ✅
- Idempotencia por clave determinística + verificación de logs previos exitosos — muy bien pensada para evitar emails duplicados. ✅
- Separación de datos sensibles (service role key, Resend API key) en secrets de Deno — correcto. ✅
- La función `getEmailHtml` está bien modularizada con templates HTML por `eventType`. ✅
- La plantilla de emails usa tablas HTML para compatibilidad con clientes de correo — práctica correcta para email HTML. ✅
- `Deno.env.get("SUPABASE_ANON_KEY")` expuesto en el servidor — es correcto en Deno pero el anon key se usa para crear un cliente que verifica JWTs, no para operaciones de BD. ✅
- El bloque `getUser` crea un nuevo cliente de Supabase en cada request (L299). Podría reusarse si hubiera un singleton, pero en Edge Functions esto es aceptable.

### D. Rendimiento
- La función hace 3 consultas en secuencia: `orders` (con join de `buyers` + `raffles`) → `tickets` → `notification_logs` → Resend API. Son 4 viajes de red en serie para cada email. Podría paralelizarse `tickets` y la verificación de `notification_logs` con `Promise.all`.

### F. Seguridad
- El uso de `SUPABASE_SERVICE_ROLE_KEY` para la query de la BD es correcto — la función necesita leer datos privados como el email del comprador. ✅
- El secreto `FUNCTION_SECRET` permite acceso interno servidor→servidor. ✅
- **Riesgo:** Apertura de CORS a todos los `*.pages.dev`. 🔴

---

## 47. `supabase/functions/resend-webhook/index.ts`

### A. Qué hace
Receptor de eventos de entrega de Resend (Webhook). Verifica la firma criptográfica Svix, parsea el evento (`email.sent`, `email.delivered`, `email.bounced`, `email.failed`) y actualiza el campo `status` en `notification_logs` para mantener la trazabilidad de entrega.

### B. Errores y bugs reales

**1. Si `RESEND_WEBHOOK_SECRET` no está configurado, la verificación Svix se salta completamente (L40):**
```ts
if (webhookSecret) {
  // verifica firma
}
// Si no hay secreto, continúa sin verificar
```
Sin este secreto, cualquier persona que conozca la URL de la Edge Function puede enviar peticiones POST falsas que cambien el `status` de cualquier notificación a `'delivered'`, `'bounced'` o `'failed'`. **Si el secret no está en los env vars de Supabase, el webhook es totalmente inseguro.** La verificación debería ser obligatoria, no opcional.

**2. La actualización de `notification_logs` no verifica el error de la query (L133):**
```ts
if (error) {
  console.error("Error al actualizar notification_logs por webhook:", error.message);
  // No retorna error — continúa
}
```
Si la BD no actualiza el log (porque el `resend_email_id` no coincide con ningún registro, o hay un problema de conexión), la función devuelve `200 OK` de todas formas. Resend no reintentará el webhook si recibe 200. **Los eventos de entrega pueden perderse silenciosamente.**

**3. El `metadata` del webhook se sobreescribe en cada evento (L124–128):**
```ts
metadata: {
  last_webhook_event: type,
  webhook_payload: data,
  received_at: new Date().toISOString(),
},
```
Si llegan 3 eventos Svix para el mismo email (sent → delivered → bounced), cada uno sobreescribe completamente el `metadata` del anterior. No hay historial de eventos — sólo el último. La clave `last_webhook_event` es descriptiva pero el historial completo se pierde.

**4. La función no maneja eventos de `email.clicked`, `email.opened`, `email.complained`:**
Resend puede enviar estos eventos y el webhook los ignorará silenciosamente (`newStatus = null`). Mientras que ignorarlos es correcto funcionalmente, el código podría tener un log explícito de `console.log` para debugging de eventos no manejados.

### C. Calidad de código
- Verificación Svix con el SDK oficial de Svix (`svix@1.15.0`) — correcto y más seguro que verificación manual. ✅
- Lectura del `rawBody` como texto antes de parsear — necesario para que Svix pueda verificar la firma del cuerpo original. ✅
- Parseo del JSON separado de la lectura del body — correcto. ✅
- Manejo de `email_id || data.id` — cubre tanto el campo en el schema antiguo como el nuevo de Resend. ✅

### F. Seguridad
- **CRÍTICO:** `RESEND_WEBHOOK_SECRET` sin fallback de rechazo — si no está configurado, el endpoint es abierto. 🔴

---

## 48. `supabase/functions/cron-release-expired-reservations/index.ts`

### A. Qué hace
Edge Function invocada periódicamente como cron job de Supabase. Libera reservas de boletos cuya expiración ya pasó ejecutando la RPC `release_expired_reservations` con la service role key.

### B. Errores y bugs reales

**1. La función acepta tanto `POST` como `GET` (L23):**
```ts
"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
```
Un cron job no necesita aceptar GET. Aceptar GET significa que cualquier petición HTTP anónima que conozca la URL puede intentar disparar el endpoint (aunque la autenticación lo bloquee). Menos superficie de ataque = sólo `POST`.

**2. La respuesta al OPTIONS preflight retorna `"ok"` como cuerpo (L31):**
```ts
return new Response("ok", { headers: corsHeaders });
```
El estándar para respuestas preflight de CORS es un cuerpo vacío o `null`, no `"ok"`. Funcionalmente no es un bug, pero es inconsistente con las otras dos funciones que usan `new Response(null, ...)`.

**3. La verificación de `supabaseUrl` y `supabaseServiceKey` ocurre DESPUÉS de la verificación de autorización (L60–65):**
```ts
if (!isAuthorized) { return 401; }    // ← primero
if (!supabaseUrl || !supabaseServiceKey) { return 500; }  // ← después
```
Esto es correcto en orden de prioridad (autenticación antes de cualquier otro error), pero si `supabaseServiceKey` está vacío también debería hacer imposible que `isAuthorized` sea true (ya que el token se compara con `supabaseServiceKey`). Ligera redundancia pero no es un bug.

### C. Calidad de código
- La función es concisa (100 líneas), con una sola responsabilidad clara. ✅
- Validación por Bearer token con dos opciones válidas (`CRON_SECRET` o `SERVICE_ROLE_KEY`) — correcto y flexible. ✅
- Responde con el conteo de boletos liberados — buena observabilidad para logs de cron. ✅
- El fallback `Deno.env.get("CRON_SECRET") || Deno.env.get("FUNCTION_SECRET")` en L37 permite reutilizar el mismo secreto que la función de email — práctico. ✅
- **Nota positiva:** Es la función más simple y limpia de las tres. Sin lógica de negocio propia — delega todo a la RPC, lo cual es el patrón correcto.

### F. Seguridad
- Sin CRON_SECRET configurado, la función es inaccesible (token vacío nunca iguala al service key vacío dado que compara `token && ...`). ✅
- El cliente Supabase usa service role key → la RPC se ejecuta con permisos de superusuario. Apropiado para una operación interna de mantenimiento. ✅

---

## 49. `scripts/verify_db.mjs`

### A. Qué hace
Script Node.js ejecutable manualmente (`node scripts/verify_db.mjs`). Verifica que todas las migraciones SQL estén aplicadas en el proyecto Supabase: chequea que existan las tablas y RPCs principales, y reporta el estado de cada una por consola.

### B. Errores y bugs reales

**1. 🔴 CRÍTICO — `supabaseKey` es el anon key (publishable) del proyecto real de producción, expuesto en texto plano:**
```js
const supabaseUrl = 'https://bxhzvmbbsisxqpwrgvgn.supabase.co';
const supabaseKey = 'sb_publishable_n02jT3oPik5Yb8Mdz6Chlg_0JOgZWoA';
```
Esto no es el service role key (que daría acceso total), sino el anon key. El anon key **ya es público** — está en el frontend JavaScript que se sirve a todos los usuarios. Por tanto, **no es una filtración adicional de secretos**. Sin embargo:
  - El anon key hardcodeado en este archivo confirma que el proyecto de producción es `bxhzvmbbsisxqpwrgvgn.supabase.co`
  - Si RLS no está correctamente configurado, el anon key podría dar acceso a datos sensibles
  - El archivo debería leer estas credenciales de variables de entorno (`.env`) para consistencia y para que el script funcione en múltiples entornos (dev, staging, prod)

**2. `submit_order_receipt` en la lista de RPCs a verificar (L47) es una RPC obsoleta:**
```js
{ name: 'submit_order_receipt', params: { p_order_id: '...', p_receipt_url: 'test' } },
```
`paymentService.ts` usa `submit_payment_proof`, no `submit_order_receipt`. Si la RPC obsoleta sigue existiendo en la BD, el script dirá "✅ MIGRADA Y OPERATIVA" cuando en realidad es código legado que debería eliminarse. Si no existe, dirá "PENDIENTE DE MIGRAR" incorrectamente. **El inventario de RPCs no está sincronizado con el código actual.**

**3. Las tablas verificadas no incluyen `system_settings`, `payment_proofs`, `notification_logs`, `winners`, `payment_accounts` (L13–22):**
La auditoría de tablas sólo cubre 8 de las aproximadamente 14 tablas del esquema. Una verificación parcial puede dar falsa confianza.

**4. `select('*').limit(1)` para verificar existencia de tabla (L27–30):**
Si la tabla existe pero RLS bloquea el acceso anónimo, el script interpreta el error `PGRST205` como tabla no migrada (L32). Pero errores de RLS devuelven códigos distintos (como `42501` o el mensaje `"permission denied"`). El código L34–36 captura este caso como "existe con restricción RLS" — correcto. Sin embargo, el mensaje podría ser más específico.

**5. El script llama RPCs con UUIDs `00000000-0000-0000-0000-000000000000` que podrían ejecutar lógica real:**
```js
{ name: 'approve_order_payment', params: { p_order_id: '00000000-0000-0000-0000-000000000000' } },
```
Si una RPC no valida que el UUID exista antes de operar, podría ejecutar código de negocio con un ID fantasma. La mayoría de las RPCs bien escritas retornarán error "orden no encontrada", pero es una práctica arriesgada. Mejor usar `EXPLAIN` o verificar la existencia de la función en `pg_proc` sin ejecutarla.

### C. Calidad de código
- El script tiene un propósito claro y útil para el ciclo de desarrollo. ✅
- Outputs legibles por humano con emojis y categorías. ✅
- Debería leer `supabaseUrl` y `supabaseKey` de `process.env` o de un archivo `.env.local` usando dotenv.
- No debería estar en producción (ni commitearse con la URL de producción hardcodeada). Podría moverse a `scripts/verify_db.example.mjs` con placeholders.

---

## Resumen del Lote 6

| Archivo | Estado | Severidad máx. | Nota |
|---------|--------|----------------|------|
| `send-transactional-email/index.ts` | 🐛 con bugs | **Alta** | CORS abierto a todos `*.pages.dev`; cualquier usuario anon puede invocar la función para spam de emails PAYMENT_RECEIVED; `RESEND_FROM_EMAIL` fallback a dominio de prueba; `drawDate` sin formatear en HTML del email |
| `resend-webhook/index.ts` | 🐛 con bugs | **Alta** | Verificación de firma Svix opcional (si no hay secret, webhook es abierto); fallo silencioso de update en BD con 200 OK; `metadata` sobreescribe historial de eventos |
| `cron-release-expired-reservations/index.ts` | ✅ Limpio | Baja | Responde GET (innecesario); preflight retorna "ok" en lugar de null |
| `scripts/verify_db.mjs` | ⚠ mejorable | Media | Anon key hardcodeado (no es secreto crítico pero es mala práctica); `submit_order_receipt` en inventario está desactualizado; solo 8 de ~14 tablas verificadas |

### Top hallazgos de este lote

1. **🔴 ALTO — `resend-webhook`: verificación de firma condicional**
Si `RESEND_WEBHOOK_SECRET` no está en los secrets de Supabase, cualquiera que conozca la URL del webhook puede cambiar el status de notificaciones a `'delivered'` o `'bounced'`. La verificación debe ser obligatoria.

2. **🔴 ALTO — `send-transactional-email`: CORS abierto a `*.pages.dev`**
Cualquier proyecto de Cloudflare Pages puede invocar esta función desde un navegador. Debería restringirse al subdominio del proyecto específico.

3. **🟠 MEDIO — `send-transactional-email`: cualquier anon puede enviar PAYMENT_RECEIVED a cualquier orderId**
No hay verificación de que el `orderId` pertenezca al usuario que hace la petición. Riesgo de spam de emails hacia compradores de terceros.

4. **🟠 MEDIO — `send-transactional-email`: autorización por JWT acepta cualquier usuario auth, no solo admins**
Para eventos `PAYMENT_APPROVED` / `PAYMENT_REJECTED`, cualquier usuario con sesión de Supabase podría invocar la función.

5. **🟠 MEDIO — `send-transactional-email`: fallback de `fromEmail` es `onboarding@resend.dev`**
Si `RESEND_FROM_EMAIL` no está en secrets, todos los emails salen de un dominio de prueba de Resend y probablemente caigan en spam o sean rechazados.

6. **🟠 MEDIO — `resend-webhook`: fallo silencioso de update en BD**
Si el `resend_email_id` no existe en `notification_logs`, el webhook recibe 200 OK y Resend no reintenta. Los eventos de entrega se pierden silenciosamente.

7. **🟡 BAJO — `send-transactional-email`: `drawDate` sin formatear en HTML**
El ISO timestamp de la fecha del sorteo se muestra técnico en el email.

8. **🟡 BAJO — `scripts/verify_db.mjs`: inventario de RPCs desactualizado**
Incluye `submit_order_receipt` (obsoleta) y no incluye RPCs nuevas como `submit_payment_proof`, `get_dashboard_kpis`, `register_winner`.

9. **🟡 BAJO — `cron-release-expired-reservations`: acepta GET además de POST**
Superficie de ataque innecesaria para un cron job.

