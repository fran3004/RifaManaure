# Auditoría — Lote 1: Configuración y entorno

> Fecha: 2026-09-17 | Estado: ✅ Completo

---

## 1. `package.json`

### A. Qué hace
Define las dependencias, devDependencias y scripts del proyecto.
Lo usa Node/npm para instalar el entorno y ejecutar los scripts `dev`, `build`, `lint`, `preview`.

### B. Errores y bugs reales
- **Ninguno crítico.** El stack declarado (React 19 + Vite 8 + TypeScript 6 + Supabase JS 2) es coherente internamente.

### C. Calidad de código
- **`version: "0.0.0"`** — Nunca se actualizó desde el scaffolding. No impacta en producción pero es descuido de mantenimiento.
- **`name: "sistema-rifas"`** — Nombre interno genérico; el proyecto se llama "Manaure Vive". Menor, pero inconsistente con la marca.
- **Prettier instalado como devDependency** pero no hay script `format` en `scripts`, ni archivo `.prettierrc`/`.prettierignore` en el repositorio. Prettier está declarado pero aparentemente inactivo o usado sólo manualmente.
- **Sin script de type-check standalone.** El build (`tsc -b && vite build`) sí comprueba tipos, pero no hay `"typecheck": "tsc -b"` para ejecutarlo sin construir. Útil en CI.
- **Sin script de test.** El proyecto no declara ningún runner de pruebas (Vitest, Jest, etc.). Riesgo para la fase de tests.
- **`lucide-react ^1.46.0`** — Es una versión mayor muy alta para esta librería (la versión estable pública a mediados de 2025 era ~0.4xx; esto puede indicar una versión ficticia o un fork interno). ⚠️ Verificar si esta versión existe en el registro npm o si es un alias privado.
- **`@vitejs/plugin-react ^6.1.1` y `vite ^8.3.0`** — Versiones de desarrollo futuras a la fecha de entrenamiento. No es un error, pero si el proyecto tiene que onboardear a un colaborador nuevo, estas versiones pueden no estar disponibles en registros públicos. Documentar el entorno exacto.

### D. Rendimiento
- Bundle splitting delegado a `vite.config.ts` (correcto; ver más abajo).

### E. UI/UX
- No aplica.

### F. Seguridad
- **No hay dependencias de seguridad conocida en este snapshot.** Sin embargo, dado que las versiones declaradas son muy recientes (posiblemente pre-release), conviene correr `npm audit` y documentar el resultado.

---

## 2. `vite.config.ts`

### A. Qué hace
Configura el bundler Vite: plugin React, alias `@` → `./src`, y splitting manual de chunks por vendor.
Lo usa Vite internamente en `dev` y `build`.

### B. Errores y bugs reales
- **`chunkSizeWarningLimit: 600`** — Se subió el límite de advertencia de 500 KB (default) a 600 KB en vez de atacar el problema de raíz. Esto silencia una advertencia legítima. **Bug de configuración:** los chunks grandes siguen existiendo; sólo se oculta el aviso.

### C. Calidad de código
- La estrategia de `manualChunks` es correcta y bien estructurada. Separa React, Supabase e íconos Lucide en vendors distintos.
- Sin embargo, no hay chunk separado para las vistas de admin, que probablemente son grandes y sólo las usan usuarios autenticados. Un `import()` dinámico en el router + chunk `admin` reduciría notablemente el bundle inicial.
- No hay configuración de `sourcemap` para producción. En un proyecto con Cloudflare Pages sería útil activar `sourcemap: 'hidden'` para diagnóstico de errores de producción sin exponer el código fuente.
- No hay configuración de `base` — si alguna vez se despliega en un subdirectorio, romperá los assets. Para Cloudflare Pages en raíz está bien.

### D. Rendimiento
- **Oportunidad real:** las vistas del admin (≥ 8 archivos × varios KB cada uno más sus dependencias) se cargan en el bundle principal. Code splitting con `React.lazy` + `Suspense` en `App.tsx` para la ruta `/admin/*` ahorraría al usuario público cargar todo ese código.

### E. UI/UX
- No aplica.

### F. Seguridad
- Sin hallazgos.

---

## 3. `tsconfig.json`

### A. Qué hace
Raíz del proyecto TypeScript. Actúa sólo como orquestador de referencias compuestas (`tsconfig.app.json` y `tsconfig.node.json`). Tiene `"files": []` para no compilar nada directamente.

### B–F.
- **Todo correcto.** Patrón estándar de Vite para proyectos composites. Sin hallazgos.

---

## 4. `tsconfig.app.json`

### A. Qué hace
Configuración TS para el código de la aplicación (`src/`). Activa las opciones de lint de TypeScript y los paths `@/*`.

### B. Errores y bugs reales
- **`"skipLibCheck": true`** — Estándar en proyectos Vite, pero significa que los errores de tipos en librerías de terceros (incluido el propio `database.types.ts` generado) no se verifican. Aceptable como tradeoff de velocidad.

### C. Calidad de código
- **`"strict": true` ausente** — El config no activa el modo estricto de TypeScript. Sí activa `noUnusedLocals` y `noUnusedParameters`, pero faltan: `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `noImplicitAny`, etc. Esto permite que pasen desapercibidos castings incorrectos y posibles `null`/`undefined` sin manejar, que serán un tema recurrente al auditar los servicios y componentes.
- **`"target": "es2023"`** — Bien para navegadores modernos; consistente con Cloudflare Pages.
- **`"lib": ["ES2023", "DOM"]`** — Correcto. Sin `DOM.Iterable` (puede aparecer como error en código que itera sobre `NodeList` o `FormData`, aunque Vite lo maneja vía polyfill).
- **`"allowArbitraryExtensions": true`** — Habilitado para permitir `import ... from '*.css'`; necesario para CSS Modules. Correcto.
- **`"erasableSyntaxOnly": true`** — Opción de TypeScript 5.5+; requiere TS ≥ 5.5. Dado que el proyecto usa TS ~6.0, esto es válido.

### D–F.
- Sin hallazgos adicionales.

---

## 5. `tsconfig.node.json`

### A. Qué hace
Configuración TS sólo para `vite.config.ts` (herramientas de Node). Usa `module: "nodenext"`.

### B–F.
- **Sin hallazgos.** Configuración mínima y correcta para el entorno de build.

---

## 6. `.oxlintrc.json`

### A. Qué hace
Configuración del linter Oxlint. Activa plugins de React, TypeScript y Oxc con dos reglas explícitas: `rules-of-hooks` (error) y `only-export-components` (warn).

### B. Errores y bugs reales
- **Ninguno.**

### C. Calidad de código
- **Cobertura muy reducida.** Sólo 2 reglas activadas explícitamente además del plugin base. El README del propio proyecto (líneas 14-29) recomienda habilitar `typeAware: true` para una auditoría más profunda. No se ha hecho.
- **Reglas de accesibilidad (`jsx-a11y`) ausentes.** Los plugins de oxlint incluyen soporte para accesibilidad pero no se activó. Dado que hay issues de a11y en el sitio público (a auditar en lotes posteriores), esto es una oportunidad perdida.
- **Sin reglas para imports** (`no-unused-imports`, `import/order`). El orden y la limpieza de imports se hace manualmente o no se hace.
- **Sin `unicorn` ni `sonarjs`** — No obligatorio, pero menciono que el linter es bastante permisivo.
- **No hay configuración de `ignore` para archivos generados** (p.ej. `database.types.ts`). Si se lint ese archivo, producirá falsos positivos.

### D–F.
- Sin hallazgos.

---

## 7. `.env.example`

### A. Qué hace
Plantilla de variables de entorno para el desarrollador que clona el repositorio. Documenta las 4 variables de Vite y explica que las claves de Resend van como secrets de Edge Functions.

### B. Errores y bugs reales
- **`VITE_WHATSAPP_SUPPORT_NUMBER`** está declarada aquí, pero el código usa directamente el número de WhatsApp cargado desde `system_settings` en base de datos (vía `settingsService`). Hay que confirmar si esta variable ENV se usa en algún lugar del código además de `settingsService`. Si no se usa, es documentación falsa. *(A verificar en Lote 2/4.)*
- **`RESEND_WEBHOOK_SECRET`** aparece comentada y documentada como secret de Edge Function, pero no hay instrucción `supabase secrets set RESEND_WEBHOOK_SECRET=...` en la lista de comandos del ejemplo. Es un olvido menor en la documentación.

### C. Calidad de código
- **Bien estructurado** con secciones comentadas claras que separan variables cliente vs. servidor.
- La advertencia de seguridad sobre no meter `RESEND_API_KEY` en el cliente es explícita y correcta. ✅
- `VITE_SITE_URL` apunta a `localhost:5173` — el ejemplo debería señalar que en producción debe cambiarse a la URL real. Está implícito pero podría ser explícito.

### F. Seguridad
- Sin problemas. Las claves sensibles de Resend están correctamente excluidas del cliente y documentadas como Edge Secrets.

---

## 8. `.gitignore`

### A. Qué hace
Excluye del control de versiones: logs, `node_modules`, `dist`, `dist-ssr`, archivos `.local`, directorios de editores.

### B. Errores y bugs reales
- **`.env` NO está en el `.gitignore`.** `*.local` sí captura `.env.local`, pero **`.env` a secas no está excluido**. El archivo `.env` existe en el repositorio (se vio en el listado del directorio raíz, tamaño 378 bytes). Si contiene la URL y `ANON_KEY` real de Supabase, **estas credenciales están siendo rastreadas por Git** y podrían quedar expuestas en el historial.

  > ⚠️ **CRÍTICO DE SEGURIDAD:** Verificar si `.env` está committed con valores reales. Si es así, las credenciales deben rotarse (regenerar `ANON_KEY` en Supabase) y el archivo debe añadirse al `.gitignore` y purgarse del historial con `git filter-repo` o BFG Repo-Cleaner.

- **`docs/`** no está ignorado — probablemente intencional, si los reportes de auditoría quieren versionarse.

### C. Calidad de código
- Falta excluir explícitamente: `.env`, `.env.production`, `.env.staging`.

---

## 9. `index.html`

### A. Qué hace
Punto de entrada HTML de la SPA. Contiene todo el SEO, Open Graph, favicons, manifest y el script de entrada de Vite.

### B. Errores y bugs reales
- **`og:image` y `twitter:image` apuntan a `/og-image.jpg`** con rutas relativas. Funcionan en producción con dominio propio, pero en previews de redes sociales (que hacen fetch absoluto) necesitan la URL completa. El estándar de OG requiere URL absoluta: `https://manaurevive.com/og-image.jpg`. **Las previews de WhatsApp y Facebook probablemente no cargan la imagen correctamente al compartir el enlace.**
- **`og:image:width="1200"` y `og:image:height="630"`** — el archivo `og-image.jpg` en `/public` tiene un peso de 248 KB y `og-image.png` tiene 551 KB. El JPG probablemente tenga las dimensiones correctas para OG (1200×630), pero habría que verificar. PNG de 551 KB es pesado para un asset de metadatos.

### C. Calidad de código
- **SEO bien trabajado.** Keywords relevantes, descripciones diferenciadas entre OG y Twitter. ✅
- **`lang="es-CO"` + `dir="ltr"`** — Correcto y con alta especificidad regional. ✅
- **`apple-mobile-web-app-capable: yes`** — Meta deprecada en iOS 13+; no causa daño pero es código muerto.
- **`X-UA-Compatible: IE=edge`** — Meta obsoleta (IE fue descontinuado). Código muerto; no hace daño pero es ruido.
- **No hay `<link rel="canonical">`** — Para evitar contenido duplicado en SEO si la página se indexa desde múltiples URLs.
- **No hay preload de fuentes ni de la imagen hero crítica.** Considerando que hay un hero con imagen de fondo, un `<link rel="preload" as="image">` mejoraría el LCP.

### D. Rendimiento
- **Imagen OG en PNG (551 KB) y JPG (248 KB) coexisten** en `/public`. Sólo se usa el JPG en los meta tags, por lo que el PNG es redundante y ocupa espacio en el deploy.

### E. UI/UX
- No aplica directamente (es HTML shell).

### F. Seguridad
- **No hay Content Security Policy (CSP).** Para una SPA en Cloudflare Pages se puede (y debería) configurar como header de respuesta en `_headers`, pero tampoco existe ese archivo. Sin CSP, ataques XSS tendrían campo libre si algún input del usuario llegara a renderizarse sin sanitizar.

---

## 10. `README.md`

### A. Qué hace
Documentación del repositorio.

### B–F.
- **Es el README genérico del template de Vite.** No tiene ninguna referencia al proyecto real: ni el nombre "Manaure Vive", ni cómo configurar Supabase, ni cómo correr migraciones, ni variables de entorno, ni arquitectura, ni nada específico del sistema de rifas.
- **Código muerto de documentación:** Todo el contenido es falso respecto al proyecto.
- Se auditará en profundidad en la Fase 2 (sección de Documentación).

---

## 11. `public/site.webmanifest`

### A. Qué hace
Manifiesto de aplicación web progresiva (PWA). Define nombre, descripción, colores, iconos y modo de display.

### B. Errores y bugs reales
- **Sin ícono de 192×192 ni de 512×512 px** — Los estándares PWA y Android requieren al menos un ícono de 192 px para "Añadir a pantalla de inicio" y 512 px para la splash screen. El manifest sólo declara el SVG (`any`), el PNG de 32×32 y el apple-touch-icon de 180×180. **Android no mostrará el ícono correctamente al instalar la PWA.**
- **Sin `scope`** — Debería declararse `"scope": "/"` para limitar el ámbito de la PWA.
- **Sin `orientation`** — Menor, pero puede fijarse a `portrait` para una mejor experiencia móvil.
- **`display: "standalone"`** — Correcto para una app que no quiere mostrar la barra del navegador.

### C. Calidad de código
- El nombre y la descripción son específicos del proyecto. ✅
- Los colores coinciden con el tema oscuro del proyecto (`#0a1410`). ✅

---

## 12. `public/favicon.svg`

### A. Qué hace
Favicon SVG del sitio. Dibuja un logo estilizado con montañas (Serranía del Perijá), sol/colibrí dorado y línea base.

### B–D.
- **Sin errores funcionales.** El SVG está bien estructurado, con `defs` para gradientes, `viewBox` correcto y elementos semánticos comentados.
- **Tamaño: 1.3 KB** — Excelente para un favicon.

### E. UI/UX
- El diseño es coherente con la paleta del proyecto (verde oscuro, dorado).
- A 16×16 px (el favicon más pequeño), los detalles del colibrí y las montañas probablemente se pierdan. Es un problema inherente a los favicons complejos; aceptable.

### F. Seguridad
- Sin hallazgos.

---

## 13. `public/icons.svg`

### A. Qué hace
Sprite SVG con 6 íconos: Bluesky, Discord, Documentation, GitHub, Social (usuario+estrella), X (Twitter).

### B. Errores y bugs reales
- **Íconos de redes sociales (`bluesky`, `discord`, `x`, `github`) con colores fijos `fill="#08060d"`** — Son casi negros. Si el sitio tiene fondo oscuro y estos íconos se usan sin modificación de color, podrían ser invisibles. La forma correcta en un sprite es usar `currentColor` para que el CSS controle el color.
- **Íconos `documentation-icon` y `social-icon` con colores hardcodeados `stroke="#aa3bff"`** (púrpura) — ¿Ese color pertenece a la paleta del proyecto? Los colores del proyecto son verde/dorado/oscuro. Este púrpura no aparece en `variables.css`. Posible **copy-paste de una plantilla genérica** que no coincide con la identidad visual.

### C. Calidad de código
- No hay `aria-hidden="true"` ni `role="img"` con `<title>` en los símbolos. Si se usan inline, la accesibilidad dependerá del uso en cada componente.
- El sprite no tiene `xmlns:xlink` — correcto para SVG moderno.
- Los íconos están identificados con IDs descriptivos. ✅

### D. Rendimiento
- **5 KB para un sprite SVG** — Ligero. ✅
- Si los íconos se usan vía `<use href="/icons.svg#bluesky-icon">` desde el HTML, se hace una petición HTTP extra al inicio. Si se importan inline, no hay coste.

### F. Seguridad
- Sin hallazgos.

---

## Resumen del Lote 1

| Archivo | Estado | Severidad máx. | Nota |
|---------|--------|----------------|------|
| `package.json` | ⚠ mejorable | Baja | Falta script test/typecheck; Prettier inactivo; versión `0.0.0` |
| `vite.config.ts` | ⚠ mejorable | Media | `chunkSizeWarningLimit` silencia una advertencia real; sin code splitting admin |
| `tsconfig.json` | ✅ OK | — | Configuración estándar correcta |
| `tsconfig.app.json` | ⚠ mejorable | Media | Sin `"strict": true` — permite que escapen null/undefined sin detectar |
| `tsconfig.node.json` | ✅ OK | — | Sin hallazgos |
| `.oxlintrc.json` | ⚠ mejorable | Baja | Cobertura mínima; sin a11y, sin typeAware, sin import-order |
| `.env.example` | ⚠ mejorable | Baja | `RESEND_WEBHOOK_SECRET` sin su comando `set`; `VITE_WHATSAPP_SUPPORT_NUMBER` a verificar |
| `.gitignore` | 🐛 **BUG CRÍTICO** | **ALTA** | `.env` no está ignorado — credenciales posiblemente committed |
| `index.html` | ⚠ mejorable | Media | OG image URL relativa (no funciona en previews); falta CSP; meta obsoletas |
| `README.md` | 💀 código muerto | Baja | README genérico de Vite; no documenta el proyecto real |
| `public/site.webmanifest` | ⚠ mejorable | Baja | Sin iconos 192/512 px para PWA Android |
| `public/favicon.svg` | ✅ OK | — | Bien hecho; detalles complejos para 16px es aceptable |
| `public/icons.svg` | ⚠ mejorable | Baja | Colores hardcodeados en lugar de `currentColor`; púrpura `#aa3bff` no pertenece a la paleta |

### Top hallazgos de este lote
1. **🔴 CRÍTICO:** `.env` probablemente rastreado por Git con credenciales reales de Supabase.
2. **🟠 ALTO:** Sin `"strict": true` en TS → errores de null/undefined escapan en tiempo de compilación.
3. **🟠 ALTO:** `og:image` con URL relativa → previews de WhatsApp/Facebook probablemente rotas.
4. **🟡 MEDIO:** Sin code splitting para rutas de admin → bundle inicial del usuario público carga código innecesario.
5. **🟡 MEDIO:** Sin Content Security Policy.
6. **🟡 MEDIO:** `vite.config.ts` sube el límite de warning de chunk en vez de reducir el chunk.
7. **🟢 BAJO:** README genérico de Vite sin documentación del proyecto.
8. **🟢 BAJO:** PWA sin iconos Android de 192/512 px.

