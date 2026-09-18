# Manaure Vive — Sistema Oficial de Rifas Ecoturísticas

Plataforma web de alta concurrencia para la promoción ecoturística del municipio de **Manaure Balcón del Cesar (Serranía del Perijá)** y la gestión integral de sorteos y venta de boletos en línea, con liquidación bancaria, verificación en tiempo real y panel de auditoría administrativa.

---

## 1. Stack Tecnológico

- **Frontend:** [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
- **Empaquetador & Servidor de Desarrollo:** [Vite 8](https://vite.dev/)
- **Enrutamiento:** [React Router 7](https://reactrouter.com/) con code splitting (`React.lazy` y `Suspense`)
- **Estilos:** CSS Modules puros con variables CSS de diseño atómico (sin dependencias externas de CSS)
- **Base de Datos & Backend:** [Supabase](https://supabase.com/) (PostgreSQL 15, Row Level Security, Storage privado y Auth)
- **Lógica Transaccional:** Funciones RPC atómicas con `pg_advisory_xact_lock` (`reserve_tickets`, `confirm_order_payment`, `reject_order_payment`, `register_winner`)
- **Edge Functions (Deno):** Manejo de webhooks, despacho transaccional y cron de liberación de boletos expirados
- **Servicio de Email Transaccional:** [Resend](https://resend.com/)
- **Infraestructura de Despliegue:** [Cloudflare Pages](https://pages.cloudflare.com/) (SPA con cabeceras de seguridad CSP en `_headers`)
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
cd sistema-rifas
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
| `VITE_SITE_URL`                | URL base canónica del portal web            | Público (Vite) | `http://localhost:5173`          |
| `VITE_WHATSAPP_SUPPORT_NUMBER` | Teléfono de soporte alternativo (fallback)  | Público (Vite) | `+573001234567`                  |

> [!IMPORTANT]
> **Seguridad Git:** El archivo `.env` está expresamente excluido del control de versiones mediante `.gitignore`. Nunca hagas commit de credenciales reales.

### B. Secretos Privados de Backend (Supabase Edge Functions)

Los secretos del servidor **NO** van en el archivo `.env` del frontend. Se configuran de manera cifrada en la infraestructura de Supabase:

```bash
# Configuración mediante Supabase CLI
supabase secrets set RESEND_API_KEY="re_tu_api_key"
supabase secrets set RESEND_FROM_EMAIL="Manaure Vive <notificaciones@tudominio.com>"
supabase secrets set RESEND_WEBHOOK_SECRET="whsec_tu_secreto"
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
sistema-rifas/
├── public/                     # Activos estáticos públicos (PWA manifest, favicons, _headers CSP)
│   ├── _headers                # Reglas de seguridad HTTP y CSP para Cloudflare Pages
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
│   ├── functions/              # Edge Functions en Deno (emails, webhooks, cron de reservas)
│   └── migrations/             # Migraciones SQL estructuradas (001 a 027) con políticas RLS
│
├── .gitignore                  # Reglas de exclusión de Git (protección estricta de .env)
├── .oxlintrc.json              # Configuración de Oxlint con plugins y reglas a11y
├── .prettierrc                 # Configuración de formateo Prettier
├── tsconfig.app.json           # Configuración TypeScript estricta del cliente ("strict": true)
└── vite.config.ts              # Configuración de compilación Vite, alias @ y Vitest
```

---

## 7. Base de Datos y Seguridad (Supabase)

1. **Row Level Security (RLS):** Todas las tablas cuentan con RLS activo. El usuario público solo puede leer información no sensible de rifas y números de boletos libres.
2. **Prevención de Condiciones de Carrera (Doble Venta):** La función `reserve_tickets` adquiere un bloqueo pesimista transaccional (`pg_advisory_xact_lock`) por ID de rifa para serializar solicitudes de compra concurrentes.
3. **Liberación Automática de Boletos Expirados:** Las reservas temporales caducan a los 15 minutos si no se registra comprobante, reactivando los números automáticamente.
4. **Almacenamiento de Comprobantes:** Los soportes de pago se guardan en el bucket privado `payment-proofs` y solo se visualizan mediante URLs firmadas con vencimiento de 15 minutos (`createSignedUrl`).
5. **Regeneración de Tipos de Base de Datos:**
   Para sincronizar los tipos TypeScript cuando se apliquen nuevas migraciones SQL en Supabase:
   ```bash
   supabase gen types typescript --project-id <TU_PROYECTO_ID> > src/database.types.ts
   ```

---

## 8. Despliegue en Cloudflare Pages

1. **Build Command:** `npm run build`
2. **Build Output Directory:** `dist`
3. **Variables de Entorno en Cloudflare Pages:**
   - `VITE_SUPABASE_URL`: URL del proyecto de producción
   - `VITE_SUPABASE_ANON_KEY`: Llave anónima pública de producción
   - `VITE_SITE_URL`: Dominio público de producción (ej. `https://manaurevive.pages.dev` o dominio propio)
   - `VITE_WHATSAPP_SUPPORT_NUMBER`: Número oficial de soporte (+57...)
4. **Enrutamiento SPA:** Cloudflare Pages redirige automáticamente las sub-rutas a `index.html`.
5. **Cabeceras de Seguridad:** El archivo `public/_headers` se copia automáticamente a la raíz de `dist/` en el build, aplicando directivas CSP, prevención de clickjacking (`X-Frame-Options: SAMEORIGIN`) y política de tipos MIME (`X-Content-Type-Options: nosniff`).

---

## 9. Licencia y Derechos

Desarrollado para la iniciativa ecoturística **Manaure Vive** (Manaure Balcón del Cesar, Colombia). Todos los derechos reservados.
