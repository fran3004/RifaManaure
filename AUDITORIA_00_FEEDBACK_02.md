# AUDITORIA_00_FEEDBACK_02.md
## Informe de Corrección de Contradicciones de Documentación y Contratos Frontend

**Repositorio:** `fran3004/RifaManaure`  
**Rama de trabajo:** `remediacion/auditoria-00`  
**Fecha de ejecución:** 2026-09-23  
**Alcance:** Resolución integral de inconsistencias en tiempos de reserva (10 vs 15 minutos), sincronización del esquema y barril de tipos de base de datos, depuración de RPCs eliminadas en el contrato TypeScript (`confirm_order_payment`, `submit_order_receipt`), unificación canónica de eventos de notificación (`notification_logs.event_type`), desacoplamiento de mensajes de error con nombres de migraciones SQL y corrección documental en `README.md`.

---

### 1. Contradicciones Corregidas y Fuente de Verdad Elegida

| Contradicción Identificada | Estado Previo | Fuente de Verdad Elegida | Corrección Aplicada |
| :--- | :--- | :--- | :--- |
| **Tiempo de Expiración de Reservas** | `README.md` indicaba 15 min, mientras PostgreSQL y frontend implementaban 10 min. | **PostgreSQL / Backend (`system_settings` + `create_order_secure`).** | Se actualizó `README.md` (línea 154) para reflejar exactamente los 10 minutos por defecto (configurables vía `system_settings`), coincidiendo con la RPC `create_order_secure`, `ModalCheckout.tsx` (600s), `AdminOrderReviewModal.tsx` y `VerificarPage.tsx`. |
| **Vigencia de URLs Firmadas de Comprobantes** | Coexistencia de menciones de 15 minutos en almacenamiento y 10 minutos en reservas. | **`paymentService.ts:getSignedProofUrl(..., 900)` y bucket privado `payment-proofs`.** | Se aclaró que los 15 minutos (900 s) aplican única y legítimamente a las URLs firmadas de comprobantes temporales en Storage, sin confundirse con el tiempo de reserva de boletos. |
| **Cabecera de Sincronización en `src/database.types.ts`** | Docstring indicaba sincronización histórica "001 a 027", a pesar de que el proyecto cuenta con 36 migraciones estructuradas. | **Directorio `supabase/migrations/` (migraciones 001 a 036).** | Se actualizó el docstring en `src/database.types.ts` y el árbol de arquitectura en `README.md` a "001 a 036". |
| **RPCs Eliminadas pero Tipadas** | `confirm_order_payment` y `submit_order_receipt` eliminadas en migración 023 de Postgres pero conservadas en `src/types/database.types.ts`. | **Catálogo de funciones activas en PostgreSQL (`pg_proc` en Supabase).** | Se eliminaron formalmente las firmas de `confirm_order_payment` y `submit_order_receipt` de `src/types/database.types.ts` y se agregó `is_superadmin` que sí existe en backend. |
| **Divergencia de Mayúsculas/Minúsculas en `event_type`** | Modal y tests pasaban `'PAYMENT_APPROVED'`, mientras que `notificationService` y DB normalizaban a minúsculas. | **`notificationService.ts` (`normalizeEventType`) y constraint CHECK de Postgres (migración 009).** | Se creó el mapa de constantes `NOTIFICATION_EVENT_TYPES` en `notificationService.ts`, se tipó canónicamente a minúsculas (`'payment_received' \| 'payment_approved' \| 'payment_rejected'`), se adaptó `AdminOrderReviewModal.tsx` para usar las constantes y se mantuvo soporte transparente de aliases mayúsculas en el input. |
| **Mensajes de Error con Nombres de Migraciones SQL** | 4 servicios devolvían al usuario final cadenas técnicas como *"Ejecuta la migración 020..."* o *"Ejecuta EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql"*. | **Buenas prácticas de UX y arquitectura de seguridad (Information Disclosure).** | Se desacoplaron totalmente los nombres internos de archivos `.sql` de los mensajes de usuario en `raffleService.ts`, `settingsService.ts`, `faqService.ts` y `galleryService.ts`, preservando el detalle técnico en logs `console.warn` de desarrollo. |
| **Funciones Edge y Proveedores en README** | `README.md` mencionaba Edge functions de "emails, webhooks", inexistentes en el repositorio. | **Directorio `supabase/functions/` (`cloudinary-sign` y `cron-release-expired-reservations`).** | Se ajustó la descripción del stack y del árbol de arquitectura para declarar con fidelidad únicamente las 2 Edge Functions implementadas y activas. |

---

### 2. Archivos Modificados

1. **[`README.md`](file:///c:/Users/frani/Downloads/RifaManaure/README.md):**
   - Actualizada lista de RPCs transaccionales (removido `confirm_order_payment`, agregada `create_order_secure`).
   - Declaradas las Edge Functions reales (`cloudinary-sign`, `cron-release-expired-reservations`).
   - Actualizado rango de migraciones estructuradas a `(001 a 036)`.
   - Corregido tiempo de expiración de reservas a 10 minutos (vía `system_settings`).
   - Corregida ruta canónica de regeneración a `src/types/database.types.ts`.
2. **[`src/database.types.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/database.types.ts):**
   - Actualizado docstring de re-exportación para reflejar las migraciones 001 a 036.
3. **[`src/types/database.types.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/types/database.types.ts):**
   - Eliminada la entrada `submit_order_receipt` (RPC droppeada en migración 023).
   - Eliminada la entrada `confirm_order_payment` (RPC droppeada en migración 023).
   - Incorporada la RPC `is_superadmin` (presente y activa en el esquema de Supabase).
4. **[`src/services/notificationService.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/services/notificationService.ts):**
   - Creada y exportada la constante centralizada `NOTIFICATION_EVENT_TYPES`.
   - Estandarizado `NotificationEventType` como unión derivada de las constantes.
   - Definido `NotificationEventInputType` con compatibilidad para aliases mayúsculas.
5. **[`src/components/admin/orders/AdminOrderReviewModal.tsx`](file:///c:/Users/frani/Downloads/RifaManaure/src/components/admin/orders/AdminOrderReviewModal.tsx):**
   - Importada y utilizada `NOTIFICATION_EVENT_TYPES.PAYMENT_APPROVED` y `NOTIFICATION_EVENT_TYPES.PAYMENT_REJECTED`.
6. **[`src/test/notificationService.test.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/test/notificationService.test.ts):**
   - Añadidas pruebas unitarias específicas para verificar la consistencia de `NOTIFICATION_EVENT_TYPES`.
7. **[`src/services/raffleService.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/services/raffleService.ts):**
   - Reemplazado mensaje de migración 020 por advertencia técnica en consola y mensaje funcional para el usuario.
8. **[`src/services/settingsService.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/services/settingsService.ts):**
   - Reemplazado mensaje de migración 022 por advertencia técnica en consola y mensaje funcional para el usuario.
9. **[`src/services/faqService.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/services/faqService.ts):**
   - Reemplazados mensajes de migraciones 032 y 034 por advertencias técnicas en consola y mensajes funcionales.
10. **[`src/services/galleryService.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/services/galleryService.ts):**
    - Reemplazados mensajes de migraciones 035 y 036 por advertencias técnicas en consola y mensajes funcionales.

---

### 3. Tipos Regenerados vs. Corrección Quirúrgica

- **Evaluación de regeneración automática:**
  - Se probó la regeneración con `supabase gen types typescript --project-id bxhzvmbbsisxqpwrgvgn`.
  - La herramienta generó el esquema, pero PostgREST infiere tipos `string | null` para columnas con valores por defecto o no nulos lógicos, lo cual colisionaba con 28 invariantes estrictos del frontend (como `created_at: string`, `status: OrderStatus`, `role: 'superadmin' | 'admin' | 'auditor'`).
- **Determinación técnica:**
  - Conforme a la regla del prompt (*"Si no puede regenerarse [sin romper], realiza únicamente la corrección mínima necesaria y documenta que la regeneración oficial quedó pendiente"*), se mantuvo la base contractual estricta de `src/types/database.types.ts`, aplicando la depuración quirúrgica exacta de las funciones inexistentes (`confirm_order_payment`, `submit_order_receipt`) y la incorporación de `is_superadmin`.
  - Queda documentado que una regeneración completa automatizada requerirá previamente la anotación estricta de `NOT NULL` en todas las columnas de la base de datos remota para evitar discrepancias de nulabilidad en TypeScript.

---

### 4. Funciones Obsoletas Eliminadas del Contrato

- **`submit_order_receipt`:** Eliminada de `src/types/database.types.ts`. Reemplazada funcionalmente en la arquitectura por `submit_payment_proof`. Cero usos en frontend.
- **`confirm_order_payment`:** Eliminada de `src/types/database.types.ts`. Reemplazada funcionalmente en la arquitectura por `approve_order_payment`. Cero usos en frontend.

---

### 5. Mensajes de Error Actualizados

Se eliminaron las 8 cadenas que exponían nombres de migraciones SQL internas:

1. `raffleService.ts`: `"La función 'admin_...' no está instalada... Recuerda ejecutar la migración 020..."`  
   → Ahora: `console.warn(...)` técnico + `"El servicio de administración de rifas no está disponible en este momento. Por favor contacta al soporte técnico."`
2. `settingsService.ts`: `"La función 'admin_update_system_settings' no está instalada... Recuerda ejecutar la migración 022..."`  
   → Ahora: `console.warn(...)` técnico + `"No fue posible actualizar la configuración del sistema. El servicio no está disponible temporalmente."`
3. `faqService.ts` (tabla): `"La tabla 'public.faq_items' no existe... Ejecuta la migración 032..."`  
   → Ahora: `console.warn(...)` técnico + `"No fue posible acceder al servicio de preguntas frecuentes. Por favor intenta más tarde."`
4. `faqService.ts` (RLS): `"Permisos denegados por seguridad (RLS): debes ejecutar la migración 034..."`  
   → Ahora: `console.warn(...)` técnico + `"Permisos denegados: tu cuenta no cuenta con privilegios de administrador autorizados para modificar preguntas frecuentes."`
5. `galleryService.ts` (tabla items): `"La tabla 'public.gallery_items' no existe... Ejecuta la migración 035..."`  
   → Ahora: `console.warn(...)` técnico + `"No fue posible acceder a los elementos de la galería. El servicio no está disponible temporalmente."`
6. `galleryService.ts` (RLS): `"Permisos denegados por seguridad (RLS): debes ejecutar la migración 035..."`  
   → Ahora: `console.warn(...)` técnico + `"Permisos denegados: tu cuenta no cuenta con privilegios de administrador autorizados para gestionar la galería."`
7. `galleryService.ts` (categorías): `"La tabla 'public.gallery_categories' no existe... Ejecuta la migración 036..."`  
   → Ahora: `console.warn(...)` técnico + `"No fue posible cargar las categorías de la galería. Por favor intenta más tarde."`
8. `galleryService.ts` (storage): `"El bucket 'gallery-images' no existe... Ejecuta la migración 035..."`  
   → Ahora: `console.warn(...)` técnico + `"El almacenamiento de imágenes de la galería no se encuentra disponible temporalmente."`

---

### 6. Búsquedas Globales de Verificación

1. **`confirm_order_payment`:** 0 ocurrencias en código de aplicación o tipos (únicamente preservada en migraciones SQL históricas 001 y 023-DROP).
2. **`submit_order_receipt`:** 0 ocurrencias en código de aplicación o tipos (únicamente preservada en migraciones SQL históricas 003, 004 y 023-DROP).
3. **`15 minutos` / `15 min`:** 0 referencias falsas sobre reservas de boletos. Las únicas 6 referencias activas corresponden legítimamente al vencimiento de 900 s (`createSignedUrl`) para previsualización de comprobantes bancarios en Storage.
4. **`notification event types`:** Unificados bajo `NOTIFICATION_EVENT_TYPES` en minúsculas canónicas (`payment_received`, `payment_approved`, `payment_rejected`).
5. **Referencias a nombres de migraciones en `src/`:** 0 ocurrencias.

---

### 7. Pruebas y Resultados de Validación

- **Typecheck (`npm run typecheck` / `tsc -b`):** Código de salida `0` (0 errores de compilación).
- **Build de Producción (`npm run build` / `vite build`):** Código de salida `0` (2.063 módulos transformados, compilado exitoso en 9.85s).
- **Suite de Pruebas (`npm test` / `vitest run`):** Código de salida `0` (**12/12 archivos aprobados, 147/147 pruebas pasadas**).
- **Linter Estático (`npm run lint` / `oxlint`):** Código de salida `0` (0 errores).

---

### 8. Elementos que NO se Modificaron (Posteriores Auditorías)

1. **Arquitectura transaccional de PostgreSQL:** No se alteraron triggers, bloqueos pesimistas (`pg_advisory_xact_lock`), ni la lógica de la RPC `create_order_secure` ni `reserve_tickets`.
2. **Constraint CHECK de base de datos:** El constraint `CHECK (event_type IN (...))` en `notification_logs` continúa aceptando mayúsculas y minúsculas para proteger registros históricos.
3. **Reglas RLS y Security Definer:** Se mantienen intactas para evaluación en la Auditoría 02.

---

### 9. Riesgos Pendientes

- Ningún riesgo bloqueante detectado en frontend o contratos TypeScript.
- Se recomienda que en la Auditoría de Base de Datos se formalice la unificación de columnas nullable para que en el futuro `supabase gen types` pueda ejecutarse sin sobreescrituras manuales.

---

### 10. Commit Realizado

- **Rama:** `remediacion/auditoria-00`
- **Mensaje:** `fix(contracts): corregir contradicciones de documentacion, rpcs obsoletas y mensajes tecnicos`
