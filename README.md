# Manaure Vive — Sistema Oficial de Rifas Ecoturísticas

Plataforma web de alta concurrencia para la promoción ecoturística del municipio de **Manaure Balcón del Cesar (Serranía del Perijá)** y la gestión integral de sorteos y venta de boletos en línea, con liquidación bancaria, verificación en tiempo real y panel de auditoría administrativa.

---

## 1. Stack Tecnológico

- **Frontend:** [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
- **Empaquetador & Servidor de Desarrollo:** [Vite 8](https://vite.dev/)
- **Enrutamiento:** [React Router 7](https://reactrouter.com/) con code splitting (`React.lazy` y `Suspense`)
- **Estilos:** CSS Modules puros con variables CSS de diseño atómico (sin dependencias externas de CSS)
- **Base de Datos & Backend:** [Supabase](https://supabase.com/) (PostgreSQL 15, Row Level Security, Storage privado y Auth)
- **Lógica Transaccional:** Funciones RPC atómicas con `pg_advisory_xact_lock` (`create_order_secure`, `approve_order_payment`, `reject_order_payment`, `register_winner`)
- **Edge Functions (Deno):** Firma segura de medios (`cloudinary-sign`) y cron de liberación de reservas expiradas (`cron-release-expired-reservations`)
- **Gestión de Medios:** [Cloudinary](https://cloudinary.com/) (Almacenamiento seguro, transformación y entrega optimizada con `f_auto,q_auto` para premios, aliados y actas)
- **Notificaciones Transaccionales:** WhatsApp Business (vía Evolution API) y trazabilidad completa en auditoría
- **Infraestructura de Despliegue:** [Vercel](https://vercel.com/) (SPA con enrutamiento dinámico rewrites, cabeceras CSP y caché en `vercel.json`)
- **Calidad y Herramientas:** [Vitest 5](https://vitest.dev/), [Oxlint](https://oxc.rs/) (con plugins React, a11y, import y promise), [Prettier 3](https://prettier.io/)

---

## 2. Requisitos Previos

- **Node.js:** Versión `>= 20.18.0` (o LTS recomendada)
- **npm:** Versión `>= 10.0.0`
- **Proyecto Supabase:** Instancia activa con las migraciones SQL aplicadas (`supabase/migrations/`)
- **Supabase CLI:** (Opcional, recomendado para gestión de Edge Functions y secrets locales)

---

## 3. Instalación

Clonar el repositorio y ejecutar la instalación de dependencias:

```bash
git clone <URL_DEL_REPOSITORIO>
cd RifaManaure
npm install
```

---

## 4. Configuración de Variables de Entorno

El proyecto distingue estrictamente entre variables públicas del navegador y secretos privados de servidor:

### A. Variables Públicas de Frontend (`.env`)

Copiar el archivo de plantilla `.env.example` a `.env`:

```bash
cp .env.example .env
```

| Variable                       | Descripción                                 | Ámbito         | Ejemplo                          |
| ------------------------------ | ------------------------------------------- | -------------- | -------------------------------- |
| `VITE_SUPABASE_URL`            | Endpoint HTTPS de la API de Supabase        | Público (Vite) | `https://xyzcompany.supabase.co` |
| `VITE_SUPABASE_ANON_KEY`       | Llave anónima pública con restricciones RLS | Público (Vite) | `eyJhbGciOi...`                  |
| `VITE_CLOUDINARY_CLOUD_NAME`   | Cloud name configurado en Cloudinary        | Público (Vite) | `ky01b0vz`                       |
| `VITE_SITE_URL`                | URL base canónica del portal web            | Público (Vite) | `http://localhost:5173`          |
| `VITE_WHATSAPP_SUPPORT_NUMBER` | Teléfono de soporte alternativo (fallback)  | Público (Vite) | `+573001234567`                  |

> [!IMPORTANT]
> **Seguridad Git:** El archivo `.env` está expresamente excluido del control de versiones mediante `.gitignore`. Nunca hagas commit de credenciales reales.

### B. Secretos Privados de Backend (Supabase Edge Functions)

Los secretos del servidor **NO** van en el archivo `.env` del frontend. Se configuran de manera cifrada en la infraestructura de Supabase:

```bash
# Configuración mediante Supabase CLI
supabase secrets set CRON_SECRET="tu_clave_secreta_para_cron"
supabase secrets set CLOUDINARY_CLOUD_NAME="tu_cloud_name"
supabase secrets set CLOUDINARY_API_KEY="tu_api_key"
supabase secrets set CLOUDINARY_API_SECRET="tu_api_secret"
supabase secrets set PUBLIC_APP_URL="https://tudominio.com"
supabase secrets set EVOLUTION_API_ENDPOINT="https://tu-instancia.com"
supabase secrets set EVOLUTION_API_KEY="tu_clave_evolution"
supabase secrets set WOMPI_EVENTS_SECRET="tu_secreto_wompi"
```

---

## 5. Scripts Disponibles

| Comando                | Acción                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Inicia el servidor de desarrollo local con Hot Module Replacement (HMR).                                         |
| `npm run typecheck`    | Ejecuta la comprobación exhaustiva de tipos de TypeScript en modo estricto (`tsc -b`).                           |
| `npm run lint`         | Ejecuta el linter ultrarrápido Oxlint con reglas de React, TypeScript y Accesibilidad JSX.                       |
| `npm run format`       | Aplica el formateo automático con Prettier sobre los archivos de código fuente.                                  |
| `npm run format:check` | Verifica que todos los archivos cumplan con las reglas de estilo de Prettier.                                    |
| `npm run test`         | Ejecuta la suite de pruebas unitarias y de integración con Vitest.                                               |
| `npm run test:watch`   | Ejecuta las pruebas en modo interactivo/observador durante el desarrollo.                                        |
| `npm run build`        | Compila la aplicación para producción (generando bundles optimizados, chunks bajo demanda y sourcemaps ocultos). |
| `npm run preview`      | Previsualiza localmente el build de producción generado en la carpeta `dist/`.                                   |

---

## 6. Arquitectura del Proyecto

```
RifaManaure/
├── public/                     # Activos estáticos públicos (PWA manifest, favicons, OG image)
│   ├── site.webmanifest        # Manifiesto PWA con iconos 192x192 y 512x512
│   ├── favicon.svg             # Favicon vectorial oficial de Manaure Vive
│   └── og-image.jpg            # Imagen OpenGraph estandarizada (1200x630)
│
├── src/
│   ├── assets/                 # Inventario de medios optimizados (WebP + JPG dual)
│   │   ├── imagenes/           # Fotos responsive en 5 variantes de resolución
│   │   ├── logos/              # Logotipos de aliados y marca en 4 densidades (@2x)
│   │   └── assets.ts           # Módulo tipado de importación dinámica Vite glob
│   ├── components/
│   │   ├── admin/              # Componentes, tablas y modales del Panel Administrativo
│   │   ├── auth/               # Rutas protegidas y guardas de autenticación
│   │   ├── checkout/           # Modal de checkout, selección de pago y carga de comprobantes
│   │   ├── common/             # ErrorBoundary, ToastNotification, PageLoadingFallback
│   │   ├── landing/            # Secciones informativas públicas (Hero, Galería, Aliados, FAQ)
│   │   ├── layout/             # Navbar y Footer públicos
│   │   ├── receipt/            # Generación y visualización de comprobante digital
│   │   └── ticketing/          # Grilla de selección de boletos y showcase de ganador
│   ├── context/                # Contextos globales de React (Auth, Carrito, Configuración, Rifas)
│   ├── hooks/                  # Custom hooks reutilizables (useDocumentTitle, useAuth, etc.)
│   ├── lib/                    # Clientes de servicios externos (supabase.ts) y utilidades (utils.ts)
│   ├── pages/                  # Vistas principales (HomePage, AdminLoginPage, VerificarPage, etc.)
│   │   └── admin/views/        # Sub-vistas lazy loaded del panel administrativo
│   ├── services/               # Servicios de lógica de negocio (orders, tickets, raffles, buyers, etc.)
│   ├── styles/                 # Estilos globales y tokens de diseño (variables.css, globals.css)
│   ├── test/                   # Suite de pruebas unitarias (Vitest)
│   ├── types/                  # Definiciones de tipos TypeScript y modelos de base de datos
│   ├── App.tsx                 # Enrutador principal con Suspense y rutas protegidas
│   └── main.tsx                # Punto de entrada de React 19
│
├── supabase/
│   ├── functions/              # Edge Functions en Deno (firma de medios y cron de reservas)
│   └── migrations/             # Migraciones SQL estructuradas (001 a 039) con políticas RLS
│
├── .gitignore                  # Reglas de exclusión de Git (protección estricta de .env)
├── .oxlintrc.json              # Configuración de Oxlint con plugins y reglas a11y
├── .prettierrc                 # Configuración de formateo Prettier
├── tsconfig.app.json           # Configuración TypeScript estricta del cliente ("strict": true)
├── vercel.json                 # Configuración de Vercel (rewrites SPA, cabeceras CSP y caché)
└── vite.config.ts              # Configuración de compilación Vite, alias @ y Vitest
```

---

## 7. Base de Datos y Seguridad (Supabase)

1. **Row Level Security (RLS):** Todas las tablas cuentan con RLS activo. El usuario público solo puede leer información no sensible de rifas y números de boletos libres.
2. **Prevención de Condiciones de Carrera (Doble Venta):** Las funciones de ordenamiento y reserva adquieren bloqueo pesimista transaccional (`pg_advisory_xact_lock`) por ID de rifa para serializar solicitudes de compra concurrentes.
3. **Liberación Automática de Boletos Expirados:** Las reservas temporales caducan a los 10 minutos (configurables vía `system_settings`) si no se registra comprobante, reactivando los números automáticamente.
4. **Almacenamiento de Comprobantes:** Los soportes de pago se guardan en el bucket privado `payment-proofs` y solo se visualizan mediante URLs firmadas con vencimiento de 15 minutos (`createSignedUrl`).
5. **Regeneración de Tipos de Base de Datos:**
   Para sincronizar los tipos TypeScript cuando se apliquen nuevas migraciones SQL en Supabase:
   ```bash
   supabase gen types typescript --project-id <TU_PROYECTO_ID> > src/types/database.types.ts
   ```
6. **Fuente Canónica de Verdad de Migraciones:**
   La carpeta `supabase/migrations/` (archivos `001_initial_schema.sql` a `039_harden_rls_orders_and_notification_logs.sql`) constituye la **única fuente de verdad histórica y evolutiva**.
   - **Trazabilidad de prefijo 028:** Existen dos archivos con prefijo 028 conservados de manera no destructiva por historial de producción (`028_fix_public_payment_accounts_and_is_admin_grant.sql` y `028_flexible_raffle_emission.sql`), ejecutados en estricto orden lexicográfico y cronológico sin colisión de DDL.
   - **Script consolidado deprecado:** El archivo `EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` está formalmente **deprecado** y no debe ejecutarse en entornos limpios (omite migraciones 028a, 028b, 029, 030 y 031).
   - Para mayor detalle sobre el inventario y reglas de despliegue, consultar [`supabase/migrations/README.md`](supabase/migrations/README.md).

---

## 8. Despliegue en Vercel

La aplicación está completamente optimizada para su despliegue continuo en **Vercel** mediante integración con GitHub:

1. **Preset de Framework:** `Vite` (autodetectado por Vercel).
2. **Build Command:** `npm run build` (`tsc -b && vite build`).
3. **Output Directory:** `dist`.
4. **Node.js Version:** `20.x` (LTS).
5. **Configuración Nativa (`vercel.json`):**
   - **Enrutamiento SPA:** Regla de reescritura `/(.*) -> /index.html` para soportar navegación del lado del cliente (`react-router-dom`) sin errores 404 en refresco o acceso directo.
   - **Cabeceras de Seguridad:** Inyección de directivas Content Security Policy (CSP estricta para Supabase y WSS), protección contra clickjacking (`X-Frame-Options: SAMEORIGIN`), prevención de sniffing MIME (`X-Content-Type-Options: nosniff`) y `Permissions-Policy`.
   - **Caché Inmutable:** Cabecera `Cache-Control: public, max-age=31536000, immutable` para todos los activos estáticos versionados bajo `/assets/*`.
6. **Variables de Entorno en Vercel Dashboard (Production & Preview):**
   - `VITE_SUPABASE_URL`: URL del proyecto de producción Supabase (`https://<id>.supabase.co`).
   - `VITE_SUPABASE_ANON_KEY`: Llave anónima pública de Supabase.
   - `VITE_SITE_URL`: Dominio oficial de producción (ej. `https://manaurevive.vercel.app` o dominio propio `https://manaurevive.com`).
   - `VITE_WHATSAPP_SUPPORT_NUMBER`: Número oficial de atención y soporte (+57...).

---

## 9. Licencia y Derechos

Desarrollado para la iniciativa ecoturística **Manaure Vive** (Manaure Balcón del Cesar, Colombia). Todos los derechos reservados.
