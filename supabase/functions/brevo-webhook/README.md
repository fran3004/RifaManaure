# Brevo Transactional Webhook — Edge Function

Esta Supabase Edge Function recibe y procesa las notificaciones HTTP (Webhooks) de eventos transaccionales emitidas por **Brevo** (Sendinblue), actualizando el ciclo de vida de entrega en `public.notification_logs`.

---

## 🔒 Reglas Inquebrantables de Integridad

1. **Aislamiento Financiero Total:** Esta función **NUNCA** modifica la tabla `orders`, ni aprueba o rechaza pagos, ni altera montos o estados financieros.
2. **Exclusividad de Trazabilidad:** Solo actualiza las columnas de auditoría en `public.notification_logs`: `status`, `delivered_at`, `failed_at`, `error_message`, `metadata`, `updated_at`.
3. **Validación de Autenticidad Estricta:** Las peticiones deben incluir el secreto configurado (`BREVO_WEBHOOK_SECRET`) en cabeceras o token. De lo contrario, se rechazan con código HTTP `401 Unauthorized`.
4. **Anti-Regresión de Estados:** Un mensaje que ya alcanzó `delivered` nunca retrocede a `sent`, `failed` o `pending`.

---

## ⚙️ Configuración en Brevo (Paso a Paso)

Para activar el webhook transaccional en el panel de Brevo:

### 1. Obtener la URL de la Edge Function
La URL pública de la función sigue la estructura:
```text
https://<TU-PROJECT-REF>.supabase.co/functions/v1/brevo-webhook
```

### 2. Configurar el Secreto de Autenticación
Define el secreto en los secretos de Supabase:
```bash
npx supabase secrets set BREVO_WEBHOOK_SECRET="tu-clave-secreta-aleatoria"
```

### 3. Registrar el Webhook en el Panel de Brevo
1. Inicia sesión en **[Brevo (Sendinblue)](https://app.brevo.com/)**.
2. Dirígete a **Transaccional** (Transactional) > **Configuración** (Settings) > **Webhooks**.
3. Haz clic en **Añadir un nuevo webhook** (Add a new webhook).
4. Configura los siguientes campos:
   - **URL a la que llamar:**
     ```text
     https://<TU-PROJECT-REF>.supabase.co/functions/v1/brevo-webhook?secret=tu-clave-secreta-aleatoria
     ```
     *(O si usas una cabecera personalizada como `X-Webhook-Secret` o `Authorization: Bearer <token>`, indícala en las cabeceras HTTP si tu plan de Brevo lo permite).*
   - **Tipo de evento:** Transaccional (Transactional).
   - **Eventos a seleccionar:**
     - [x] **Entregado** (`delivered`)
     - [x] **Rebote duro** (`hard_bounce`)
     - [x] **Rebote suave** (`soft_bounce`)
     - [x] **Bloqueado** (`blocked`)
     - [x] **Diferido** (`deferred`)
     - [x] **Queja / Spam** (`complaint`)
     - [x] **Apertura** (`opened` / `unique_opened` — *opcional, registra engagement sin alterar estado*)
     - [x] **Clic** (`click` — *opcional*)
5. Guarda el webhook y ejecuta una prueba de ping si está disponible.

---

## 📊 Matriz de Normalización de Estados

| Evento Brevo | Estado Interno (`notification_logs.status`) | Categoría | Efecto en la Base de Datos |
|---|---|---|---|
| `delivered` | `delivered` | Entrega confirmada | Actualiza `delivered_at`, limpia `error_message` |
| `hard_bounce`, `soft_bounce`, `bounced` | `bounced` | Rebote de correo | Actualiza `failed_at`, registra motivo del rebote en `error_message` |
| `blocked`, `deferred`, `complaint`, `spam`, `invalid` | `failed` | Error de entrega | Actualiza `failed_at`, guarda motivo en `error_message` |
| `opened`, `unique_opened`, `click` | *(sin cambio)* | Engagement | Actualiza `metadata.last_engagement_event` y fecha sin mutar `status` |
| `sent`, `request` | `sent` | Aceptado / En tránsito | Mantiene o confirma estado `sent` si aún no ha finalizado |

---

## 🛡️ Matriz de Transiciones Permitidas (Anti-Regresión)

| Estado Actual en BD | Nuevo Evento | ¿Permitido? | Resultado |
|---|---|:---:|---|
| `pending` | `sent` / `delivered` / `bounced` / `failed` |  | Avanza al nuevo estado |
| `sent` | `delivered` / `bounced` / `failed` |  | Avanza al nuevo estado |
| `failed` | `delivered` / `bounced` |  | Se promueve o actualiza |
| `bounced` | `delivered` |  | Aceptado si se confirma entrega final |
| `bounced` | `sent` / `pending` | ❌ | **Rechazado:** No se permite retroceso |
| `delivered` | `sent` / `failed` / `pending` / `bounced` | ❌ | **Rechazado:** Estado terminal inmutable |

---

## 🔍 Identificación del Mensaje
Brevo envía el identificador en los campos `message-id`, `messageId` o `message_id`. La función busca de manera flexible:
1. `provider_message_id` exacto, despojado o envuelto entre corchetes angulares (`<...>`).
2. Fallback en `metadata->>'messageId'`.

Si no existe el identificador en la base de datos, la función retorna `200 OK` con `{ status: "not_found" }` para evitar que Brevo reintente indefinidamente el webhook ante mensajes externos o descartados.
