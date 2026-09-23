# AUDITORIA_00_FEEDBACK_01.md
## Informe de Remediación Técnica — Hallazgos de Auditoría 00

**Repositorio:** `fran3004/RifaManaure`  
**Rama de trabajo:** `remediacion/auditoria-00`  
**Fecha de ejecución:** 2026-09-23  
**Alcance:** Remediación selectiva y segura de hallazgos propios de AUDITORÍA 00 (scripts inexistentes, archivos estáticos huérfanos, wrappers frontend obsoletos, contratos heredados y verificación de variables de entorno).

---

### 1. Estado Inicial

- **Rama base:** `main` (a partir del commit `47da591` — `docs: agregar reporte de auditoria responsive completa`).
- **Rama de remediación creada:** `remediacion/auditoria-00` (siguiendo estrictamente la regla de no operar directamente sobre `main`).
- **Estado del árbol de trabajo:** Árbol limpio tras restaurar archivos no relacionados. Se detectaron 10 archivos de auditorías previas no rastreados (`AUDITORIA_*.md`), los cuales se mantuvieron intactos y fuera del staging.
- **Contexto técnico previo:**
  - En el commit `0f6a6eb` se introdujo un script de generación por lotes de imágenes (`scripts/build-images.mjs`) que generó 338 derivados WebP/JPG y los manifiestos en `public/images/rifa/` y `src/types/image-manifest.ts`.
  - En el commit `6fd45ba`, se procedió a la limpieza de scripts auxiliares temporales y se eliminó `scripts/build-images.mjs`, pero se dejó residualmente la entrada `"images:build": "node scripts/build-images.mjs"` en `package.json`.
  - Existía duplicidad de imágenes OpenGraph en `public/` (`og-image.jpg`, `og-image-v2.jpg`, `og-image-v2-branded.jpg`).
  - En `src/services/ticketService.ts` permanecía el wrapper `reserveTickets` y la interfaz `ReserveTicketsResult`, a pesar de que el flujo de compra real utiliza exclusivamente `createOrder` llamando a la RPC `create_order_secure`.
  - En TypeScript se mantenían definiciones manuales de pasarelas de pago (`wompi`, `bold`, `mercadopago`, `cash`) cuando la plataforma opera exclusivamente bajo `transfer_manual`.

---

### 2. Hallazgos Analizados

1. **Hallazgo 1 — Script inexistente (`images:build`):**
   - Entrada en `package.json`: `"images:build": "node scripts/build-images.mjs"`.
   - Comprobación en filesystem: `scripts/build-images.mjs` no existe.
   - Se evaluaron dos situaciones:
     - *Situación A:* El script debía existir y se borró accidentalmente.
     - *Situación B:* El script pertenece a una arquitectura antigua y ya no es necesario.
   - *Determinación:* **Situación B**. El script cumplió su ciclo de vida único de generación y compresión offline de derivados WebP/JPG. Sus productos finales (`public/images/rifa/` y `src/types/image-manifest.ts`) están congelados y consumidos en producción. No debe restaurarse un script innecesario ni mantenerse el comando roto en `package.json`.

2. **Hallazgo 2 — Imágenes OpenGraph huérfanas (`og-image-v2.jpg`, `og-image-v2-branded.jpg`):**
   - Se investigaron las referencias en `index.html`, `src/`, `public/_headers`, `README.md` y `image-manifest.json`.
   - *Hallazgo crítico sobre `og-image-v2.jpg`:* **NO es huérfano**. `index.html` (líneas 50, 51 y 71) lo utiliza expresamente en `<meta property="og:image" content="%VITE_SITE_URL%/og-image-v2.jpg" />`, `<meta property="og:image:secure_url" ... />` y `<meta name="twitter:image" ... />`. Además, `public/_headers` (línea 7) define reglas de caché específicas para `/og-image-v2*.jpg`.
   - *Hallazgo sobre `og-image-v2-branded.jpg`:* **Completamente huérfano**. Cero referencias en código, HTML, headers o documentación.
   - *Hallazgo sobre `og-image.jpg`:* Utilizado como identificador fuente en `image-manifest.json` y referenciado en `README.md`.

3. **Hallazgo 3 — Wrapper frontend obsoleto (`reserveTickets` en `ticketService.ts`):**
   - Se analizó la función `reserveTickets(raffleId, ticketNumbers, buyerId, durationMinutes)` y su tipo `ReserveTicketsResult`.
   - Búsqueda exhaustiva en todo el repositorio: ninguna vista, componente, hook o test del frontend consumía `reserveTickets`. Todo el proceso transaccional de reserva y compra lo gestiona `createOrder` vía la RPC `create_order_secure`.

4. **Hallazgo 4 — Pasarelas de pago no usadas (`wompi`, `bold`, `mercadopago`, `cash`):**
   - Se analizó el flujo de pagos. El frontend únicamente soporta transferencia manual (`transfer_manual`) con comprobante bancario.
   - Las pasarelas adicionales provienen del esquema inicial de base de datos (`orders.payment_method CHECK (...)`) y se reflejan en `database.types.ts`.
   - En `src/services/ticketService.ts`, `createOrder` tenía una declaración de unión de cadenas repetida manualmente en vez de tiparse contra los tipos canónicos.

5. **Regla Especial sobre `.env`:**
   - Se inspeccionó el contenido de `.env` en el entorno local sin exponer valores confidenciales.
   - Se comprobó `.gitignore` y el historial completo de git en búsqueda de fugas de secretos reales (`service_role`, `sbp_*`, tokens JWT privados, claves privadas de Cloudinary).

---

### 3. Hallazgos Corregidos

1. **Corrección de script inexistente:**
   - Se removió la línea `"images:build": "node scripts/build-images.mjs",` de `package.json`.
2. **Eliminación de activo estático huérfano:**
   - Se eliminó el archivo físico y se dio de baja en git de `public/og-image-v2-branded.jpg` (142 KB eliminados).
3. **Depuración de wrapper y tipos muertos en frontend:**
   - Se eliminó la interfaz `ReserveTicketsResult` de `src/services/ticketService.ts`.
   - Se eliminó la función `reserveTickets` de `src/services/ticketService.ts`.
   - Se estandarizó el parámetro `paymentMethod` de `createOrder` a tipo `PaymentMethod` importado desde `@/types/raffle.types`.
4. **Verificación de seguridad en `.env`:**
   - Se constató que `.env` está en `.gitignore` (línea 17) y nunca ha sido rastreado ni comiteado.
   - Se verificó que todas las variables en `.env` corresponden a variables públicas del cliente (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`, `VITE_WHATSAPP_SUPPORT_NUMBER`, `VITE_PAYMENT_GATEWAY_PROVIDER`, `VITE_CLOUDINARY_CLOUD_NAME`).
   - Se confirmó que no existen credenciales de `service_role` ni tokens privados en `.env` ni en el historial de commits.

---

### 4. Hallazgos Deliberadamente NO Modificados y Por Qué

1. **`public/og-image-v2.jpg`:**
   - **Razón:** Está activamente consumido por `index.html` (líneas 50, 51 y 71) para la visualización de previsualizaciones sociales (Open Graph / Twitter Cards) y en `public/_headers`. Eliminarlo causaría errores 404 en redes sociales (WhatsApp, Facebook, Twitter).
2. **`public/og-image.jpg`:**
   - **Razón:** Es la imagen base canónica de 1200x630 documentada en `README.md` y vinculada en `image-manifest.json` e `image-manifest.ts`.
3. **RPC SQL `public.reserve_tickets` en PostgreSQL y migraciones:**
   - **Razón:** Cumplimiento estricto del mandato del prompt: *"NO toques todavía la RPC de PostgreSQL. La eliminación de esa RPC pertenece a una decisión posterior de la arquitectura de reservas y debe evaluarse junto con AUDITORÍA 03"*. Se conservan intactas las definiciones en `001_initial_schema.sql`, `022_system_settings_management.sql`, `023_security_hardening_linter_fixes.sql` y `EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql`.
4. **Valores `wompi`, `bold`, `mercadopago`, `cash` en `database.types.ts` y migraciones SQL:**
   - **Razón:** Representan el contrato histórico y el constraint `CHECK (payment_method IN (...))` existente en la base de datos PostgreSQL. Modificar la base de datos o el tipo generado rompería la fidelidad con el esquema actual de Supabase. Su depuración profunda se posterga para la auditoría de pagos.
5. **Variables en `.env`:**
   - **Razón:** Son indispensables para la conectividad del frontend Vite con Supabase y Cloudinary. No constituyen riesgo de backend al ser variables `VITE_*` públicas por diseño.

---

### 5. Archivos Creados

1. `AUDITORIA_00_FEEDBACK_01.md`: Este documento de auditoría y reporte de remediación técnica.

---

### 6. Archivos Modificados

1. `package.json`:
   - Eliminada la propiedad `"images:build": "node scripts/build-images.mjs"`.
2. `src/services/ticketService.ts`:
   - Removida la interfaz `ReserveTicketsResult`.
   - Removida la función `reserveTickets`.
   - Importado `PaymentMethod` desde `@/types/raffle.types` y asignado como tipo del argumento `paymentMethod` en `createOrder`.

---

### 7. Archivos Eliminados

1. `public/og-image-v2-branded.jpg`:
   - Archivo estático binario JPEG de 142.488 bytes, sin referencias en todo el proyecto.

---

### 8. Referencias Huérfanas Eliminadas

- `"images:build": "node scripts/build-images.mjs"` en `package.json`.
- `export interface ReserveTicketsResult` en `src/services/ticketService.ts`.
- `export async function reserveTickets(...)` en `src/services/ticketService.ts`.
- Binario huérfano `public/og-image-v2-branded.jpg`.

---

### 9. Pruebas Ejecutadas

1. **Verificación de sintaxis y tipos TypeScript:** `npm run typecheck` (`tsc -b`).
2. **Empaquetado de producción:** `npm run build` (`tsc -b && vite build`).
3. **Ejecución de suite de pruebas unitarias e integración:** `npm test` (`vitest run`).
4. **Linter estático:** `npm run lint` (`oxlint`).
5. **Búsqueda global y clasificación de los 10 términos de control:** `git grep`.

---

### 10. Resultado de Build

- **Comando:** `npm run build`
- **Herramienta:** Vite v8.3.0 + TypeScript Compiler (`tsc -b && vite build`)
- **Módulos transformados:** 2.063 módulos
- **Tiempo de compilación:** 8.77s
- **Código de salida:** `0` (Exitoso)
- **Detalle de salida (resumen):**
  - Generación correcta de todos los chunks JS/CSS en `dist/`.
  - `dist/index.html`: 5.45 kB (gzip: 1.58 kB).
  - Cero errores de bundling o resolución de imports.

---

### 11. Resultado de Typecheck

- **Comando:** `npm run typecheck` (`tsc -b`)
- **Código de salida:** `0`
- **Errores encontrados:** 0 errores. La eliminación de `reserveTickets` y `ReserveTicketsResult` no produjo ninguna regresión de tipos en ningún archivo del proyecto.

---

### 12. Resultado de Tests

- **Comando:** `npm test` (`vitest run`)
- **Versión Vitest:** v5.0.1
- **Resultado:**
  - **Test Files:** 12 passed (12 de 12 archivos de test aprobados)
  - **Tests:** 146 passed (146 de 146 pruebas individuales aprobadas)
  - **Duración:** 5.96s
- **Suites evaluadas:**
  - `src/test/cloudinaryService.test.ts` (20 tests)
  - `src/test/notificationService.test.ts` (18 tests)
  - `src/test/utils.test.ts` (22 tests)
  - `src/test/useActiveRaffle.test.ts` (9 tests)
  - `src/test/modals.test.tsx` (7 tests)
  - `src/test/ticketSocialProof.test.ts` (5 tests)
  - `src/test/lazyWithRetry.test.ts` (3 tests)
  - `src/test/prizeAndPartnerUploads.test.ts` (15 tests)
  - `src/test/galleryService.test.ts` (24 tests)
  - `src/test/faqService.test.ts` (11 tests)
  - `src/test/prizeService.test.ts` (5 tests)
  - `src/test/assets.test.ts` (7 tests)

---

### 13. Resultado de Lint

- **Comando:** `npm run lint` (`oxlint`)
- **Resultado:** 0 errores, 231 advertencias.
- **Detalle:** Las 231 advertencias corresponden exclusivamente a reglas preexistentes de accesibilidad (atributos ARIA, controles sin etiqueta) y hooks de React no relacionados con la remediación. Cero errores sintácticos o bloqueantes.

---

### 14. Búsquedas de Referencias Restantes

A continuación se detalla la clasificación exhaustiva de cada una de las referencias encontradas para los 10 términos de control solicitados:

| Término | Ubicación / Archivo | Línea | Contexto | Clasificación |
| :--- | :--- | :--- | :--- | :--- |
| **`build-images`** | — | — | *Ninguna referencia restante en el repositorio.* | — |
| **`images:build`** | — | — | *Ninguna referencia restante en el repositorio.* | — |
| **`reserveTickets`** | — | — | *Ninguna referencia restante en el frontend.* | — |
| **`reserve_tickets`** | `README.md` | 14 | Mención documental de funciones RPC | `DOCUMENTATION_ONLY` |
| **`reserve_tickets`** | `README.md` | 153 | Explicación documental de locks transaccionales | `DOCUMENTATION_ONLY` |
| **`reserve_tickets`** | `src/types/database.types.ts` | 761 | Firma de RPC generada por Supabase | `DATABASE_HISTORICAL` |
| **`reserve_tickets`** | `supabase/migrations/001_initial_schema.sql` | 102 | Definición SQL original de la función RPC | `DATABASE_HISTORICAL` / `REQUIRES_FUTURE_AUDIT` |
| **`reserve_tickets`** | `supabase/migrations/022_system_settings_management.sql` | 8, 186, 187, 272 | Actualización y grants de la función RPC | `DATABASE_HISTORICAL` / `REQUIRES_FUTURE_AUDIT` |
| **`reserve_tickets`** | `supabase/migrations/023_security_hardening_linter_fixes.sql` | 1899, 1900, 1979 | Parches de search_path y seguridad | `DATABASE_HISTORICAL` / `REQUIRES_FUTURE_AUDIT` |
| **`reserve_tickets`** | `supabase/migrations/EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` | 105, 4144, 4322, 4323, 4408, 6513, 6514, 6593 | Consolidado SQL de migraciones | `DATABASE_HISTORICAL` / `REQUIRES_FUTURE_AUDIT` |
| **`og-image-v2`** | `index.html` | 50 | `<meta property="og:image" content="%VITE_SITE_URL%/og-image-v2.jpg" />` | `ACTIVE` |
| **`og-image-v2`** | `index.html` | 51 | `<meta property="og:image:secure_url" content="%VITE_SITE_URL%/og-image-v2.jpg" />` | `ACTIVE` |
| **`og-image-v2`** | `index.html` | 71 | `<meta name="twitter:image" content="%VITE_SITE_URL%/og-image-v2.jpg" />` | `ACTIVE` |
| **`og-image-v2`** | `public/_headers` | 7 | Regla de cabecera HTTP Cache-Control | `ACTIVE` |
| **`og-image-v2-branded`**| — | — | *Ninguna referencia restante (archivo eliminado).* | — |
| **`wompi`** | `README.md` | 80 | Ejemplo de configuración de webhook | `DOCUMENTATION_ONLY` |
| **`wompi`** | `src/types/database.types.ts` | 271, 290, 309 | Tipos de columnas Row/Insert/Update | `DATABASE_HISTORICAL` |
| **`wompi`** | `supabase/migrations/001_initial_schema.sql` | 49 | Constraint CHECK en tabla orders | `DATABASE_HISTORICAL` / `REQUIRES_FUTURE_AUDIT` |
| **`wompi`** | `supabase/migrations/EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` | 52 | Constraint CHECK en tabla orders | `DATABASE_HISTORICAL` / `REQUIRES_FUTURE_AUDIT` |
| **`bold`** | `src/services/receiptGeneratorService.ts` | Múltiples (82, 103, 124, 134, 162, 176, 192, 228, 235, 260, 274) | Propiedad `ctx.font = 'bold ...'` en Canvas 2D | `ACTIVE` |
| **`bold`** | `src/types/database.types.ts` | 271, 290, 309 | Tipos de columnas Row/Insert/Update | `DATABASE_HISTORICAL` |
| **`bold`** | `supabase/migrations/001_initial_schema.sql` | 49 | Constraint CHECK en tabla orders | `DATABASE_HISTORICAL` / `REQUIRES_FUTURE_AUDIT` |
| **`bold`** | `supabase/migrations/EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` | 52 | Constraint CHECK en tabla orders | `DATABASE_HISTORICAL` / `REQUIRES_FUTURE_AUDIT` |
| **`mercadopago`** | `src/types/database.types.ts` | 271, 290, 309 | Tipos de columnas Row/Insert/Update | `DATABASE_HISTORICAL` |
| **`mercadopago`** | `supabase/migrations/001_initial_schema.sql` | 49 | Constraint CHECK en tabla orders | `DATABASE_HISTORICAL` / `REQUIRES_FUTURE_AUDIT` |
| **`mercadopago`** | `supabase/migrations/EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` | 52 | Constraint CHECK en tabla orders | `DATABASE_HISTORICAL` / `REQUIRES_FUTURE_AUDIT` |
| **`cash`** | `src/types/database.types.ts` | 271, 290, 309 | Tipos de columnas Row/Insert/Update | `DATABASE_HISTORICAL` |
| **`cash`** | `supabase/migrations/001_initial_schema.sql` | 49 | Constraint CHECK en tabla orders | `DATABASE_HISTORICAL` / `REQUIRES_FUTURE_AUDIT` |
| **`cash`** | `supabase/migrations/EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` | 52 | Constraint CHECK en tabla orders | `DATABASE_HISTORICAL` / `REQUIRES_FUTURE_AUDIT` |

---

### 15. Riesgos Detectados Durante la Implementación

1. **Riesgo de falso positivo con `og-image-v2.jpg`:** Si se hubiese eliminado ciegamente siguiendo la presunción inicial de la auditoría, `index.html` hubiese quedado con metadatos Open Graph rotos, degradando el SEO y las tarjetas sociales de la plataforma. La verificación cruzada evitó este incidente.
2. **Riesgo de colisión de palabras clave (`bold`):** Al buscar `bold`, se identificó que el término se utiliza intensivamente para definir estilos tipográficos (`ctx.font = 'bold 38px sans-serif'`) en la generación en Canvas de comprobantes digitales de compra (`receiptGeneratorService.ts`). Se preservó intacto.
3. **Riesgo de romper la RPC en base de datos:** Se mantuvo total disciplina de no ejecutar `DROP FUNCTION` ni alterar las migraciones SQL existentes para `reserve_tickets`, evitando inconsistencias con bases de datos remotas en producción.

---

### 16. Elementos que Deben Permanecer para Auditorías Posteriores

1. **RPC `public.reserve_tickets` en PostgreSQL:** Debe ser auditada en **AUDITORÍA 03 (Reservas y Máquina de Estados)** para evaluar si debe ser deprecada formalmente o si debe permanecer como mecanismo alternativo de bloqueo por advisory locks.
2. **Constraint `payment_method` en PostgreSQL:** Debe ser evaluada en la auditoría transaccional de pagos (**AUDITORÍA 05**) para determinar si se simplifica a `'transfer_manual'` o si se prevé integración con pasarelas automáticas.
3. **Permisos y Security Definer en RPCs:** Corresponden a **AUDITORÍA 02 (Seguridad)** y no fueron alterados en este ciclo.

---

### 17. Registro y Hash del Commit Realizado

- **Rama:** `remediacion/auditoria-00`
- **Archivos incluidos en el commit:**
  - `package.json`
  - `public/og-image-v2-branded.jpg` (eliminado)
  - `src/services/ticketService.ts`
  - `AUDITORIA_00_FEEDBACK_01.md`
- **Mensaje de commit:** `fix(cleanup): remediacion selectiva de hallazgos auditoria 00`
- **Hash del commit:** Registrado tras la ejecución de `git commit` (ver trazabilidad en log git).
