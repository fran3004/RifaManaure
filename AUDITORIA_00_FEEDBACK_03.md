# INFORME DE REMEDIACIÓN — AUDITORÍA 00: FEEDBACK 03
## Organización, Trazabilidad y Fuente Canónica de Verdad de Migraciones SQL

- **Fecha:** 2026-09-23
- **Rama:** `remediacion/auditoria-00`
- **Ámbito:** Organización de migraciones SQL en Supabase, resolución de prefijo dual `028`, saneamiento del script maestro consolidado y establecimiento de la fuente de verdad canónica del backend.

---

## 1. Convención de Migraciones Detectada

El análisis estático y dinámico del repositorio reveló las siguientes características sobre el sistema de migraciones:
- **Estructura de Nomenclatura:** Se utiliza una convención secuencial manual de tres dígitos numéricos seguidos de un guion bajo y un identificador funcional descriptivo en formato snake_case:
  ```
  supabase/migrations/NNN_<descripcion_tecnica>.sql
  ```
- **Rango Numérico Activo:** Desde `001_initial_schema.sql` hasta `036_gallery_categories.sql` (totalizando 36 números lógicos y 37 archivos en la carpeta, incluyendo el consolidado).
- **Mecanismo de Ejecución Histórico:** El proyecto no ha utilizado `supabase db push` o pipelines automatizados de CI/CD para registrar estados en la tabla interna `supabase_migrations.schema_migrations`. La inspección directa con Supabase CLI mediante `npx supabase migration list` devolvió `"remote": ""` para la totalidad de las migraciones, evidenciando que las migraciones han sido aplicadas manualmente por los desarrolladores a través del SQL Editor del Supabase Dashboard.
- **Patrón de Reconocimiento del CLI:** El CLI oficial de Supabase parsea localmente los archivos mediante la expresión regular `^([0-9]+)_(.*)\.sql$`, tomando el prefijo numérico como la versión/tiempo (`local` / `time`). Los archivos que no inician con dígitos (como `EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` o `README.md`) son ignorados por el CLI con la advertencia:
  `Skipping migration ... (file name must match pattern "<timestamp>_name.sql")`.

---

## 2. Resultado de la Investigación sobre las dos Migraciones 028

Se detectó la existencia de dos archivos que comparten el prefijo numérico `028`:
1. `028_fix_public_payment_accounts_and_is_admin_grant.sql`
2. `028_flexible_raffle_emission.sql`

### Hallazgos de la Inspección Técnica:
- **Historial Git y Cronología:**
  - `028_fix_public_payment_accounts_and_is_admin_grant.sql` fue introducida en los commits `cfc380a` y consolidada en `87d550d`.
  - `028_flexible_raffle_emission.sql` fue introducida posteriormente en el commit `bad2160` por un desarrollador que reutilizó por descuido el número `028` en lugar de crear `029` o incrementar la secuencia.
  - Con posterioridad a ambas, se introdujeron las migraciones `029_harden_is_admin_security_definer.sql` (commit `87d550d`) hasta `036_gallery_categories.sql` (commit `0b33a97`).
- **Comportamiento ante Herramientas:**
  - En el ordenamiento alfabético estándar de los sistemas de archivos y de Supabase CLI, `028_fix...` ('fix') precede naturalmente a `028_flexible...` ('fle').
  - La ejecución simulada en `npx supabase db push --dry-run` demostró que Supabase CLI ordena y lista ambas migraciones de manera consecutiva y determinista:
    1. `028_fix_public_payment_accounts_and_is_admin_grant.sql`
    2. `028_flexible_raffle_emission.sql`
- **Evaluación de Impacto:**
  - **A) ¿Genera problema en la herramienta actual?** No en el flujo de aplicación manual ni en el dry-run del CLI.
  - **B) ¿Es sólo convención visual?** No sólo visual; en un sistema automatizado estricto donde la tabla `schema_migrations` tenga una clave primaria de versión (`PRIMARY KEY (version)`), dos migraciones con `version = '028'` colisionarían en tiempo de inserción.
  - **C) Diagnóstico final:** **Categoría C.** Genera un riesgo futuro para migraciones automáticas basadas exclusivamente en el prefijo, pero no rompió la historia aplicada.
- **Ortogonalidad DDL:** Ambas migraciones son 100% ortogonales y disjuntas. `028_fix...` modifica grants de `is_admin`, RLS en `payment_accounts` y `REPLICA IDENTITY FULL`; mientras que `028_flexible...` reemplaza la función `admin_create_raffle`. No comparten ninguna tabla, función ni política.

---

## 3. Decisión: Conservación o Modificación

**SE CONSERVARON AMBOS NOMBRES DE ARCHIVO ORIGINALES.**

No se realizó ningún renombramiento de archivo destructivo. Se mantuvieron intactos:
- `supabase/migrations/028_fix_public_payment_accounts_and_is_admin_grant.sql`
- `supabase/migrations/028_flexible_raffle_emission.sql`

---

## 4. Motivo Técnico de la Decisión

1. **Inmutabilidad de la Historia Aplicada:** Ambos archivos ya formaban parte de la historia confirmada de commits en producción y fueron aplicados en la base de datos remota activa.
2. **Prevención de Efecto Cascada (Drift Masivo):** Renombrar `028_flexible_raffle_emission.sql` a `029` habría forzado a reescribir y renombrar 8 migraciones completas (`029`, `030`, `031`, `032`, `033`, `034`, `035`, `036` a `030`–`037`), generando una alteración masiva del historial de Git, rompiendo referencias de commits anteriores y destruyendo la trazabilidad con los entornos existentes.
3. **Determinismo Garantizado:** Al ser ordenadas lexicográficamente por cualquier herramienta (`fix` < `fle`), su secuencia de ejecución es idéntica a su orden cronológico de commit (`87d550d` antes que `bad2160`).
4. **Claridad Documental:** Se añadieron encabezados explicativos formales en el código de ambos archivos y en el nuevo `supabase/migrations/README.md` documentando las secuencias `028.1` y `028.2`.

---

## 5. Estado del Script Maestro (`EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql`)

- **Naturaleza del Archivo:** Archivo SQL monolítico de 7,868 líneas creado manualmente como un contenedor de conveniencia para copiar y pegar en el SQL Editor de Supabase.
- **Estado Técnico:** **INCOMPLETO, OBSOLETO Y PELIGROSO PARA ENTORNOS LIMPIOS.**
- **Consumo Real:** No es consumido por ningún script en `package.json`, ni por la infraestructura de despliegue, ni por Supabase CLI (que lo omite explícitamente).
- **Riesgo:** Si un operador ejecutara este script en una base de datos limpia creyendo que instala todo el sistema, la ejecución fallaría fatalmente arrojando un error de sintaxis/relación en la línea 7568.

---

## 6. Qué Migraciones Incluye el Script Maestro

El script maestro contiene de forma acumulada:
- Migraciones `001` a `027` en orden secuencial.
- Migración `033_prize_official_details_and_image_sync.sql` (línea 7566).
- Migración `032_faq_items.sql` (línea 7612).
- Migración `034_faq_admin_policies.sql` (línea 7694).
- Migración `035_gallery_management.sql` (línea 7712).
- Migración `036_gallery_categories.sql` (línea 7808).

---

## 7. Qué Migraciones Faltaban en el Script Maestro

Faltan por completo en `EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql`:
1. `028_fix_public_payment_accounts_and_is_admin_grant.sql` (Permisos de `is_admin`, RLS de `payment_accounts` y `REPLICA IDENTITY FULL`).
2. `028_flexible_raffle_emission.sql` (Flexibilización de boletos en `admin_create_raffle`).
3. `029_harden_is_admin_security_definer.sql` (Blindaje anti-enumeración de administradores).
4. `030_remove_resend_email_id.sql` (Eliminación de campo redundante en `orders`).
5. **`031_prize_management.sql` (DEFECTO CRÍTICO):** Es la migración que crea las tablas `prize_settings` y `prize_experiences`. Al faltar esta migración, el script falla catastróficamente al intentar ejecutar la migración 033 (`ALTER TABLE public.prize_settings ADD COLUMN...`), ya que la tabla nunca fue creada.
6. **Desorden Cronológico:** Contiene la migración `033` antes de la migración `032`.

---

## 8. Solución Aplicada al Script Maestro

Siguiendo la **Preferencia 2** de las directrices del proyecto:
- **Declaración Formal de Deprecación:** Se antepuso un bloque de advertencia prominentemente visible al inicio de `EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` alertando que es un artefacto histórico parcial y prohibiendo expresamente su ejecución en producción o entornos limpios.
- **Detalle de Inconsistencias:** El encabezado lista explícitamente las 5 migraciones ausentes y el motivo del fallo fatal (ausencia de 031).
- **Redirección a la Fuente de Verdad:** Se instruye taxativamente utilizar la secuencia modular `001_...` a `036_...` en `supabase/migrations/`.
- **Preservación sin Reescritura Ciega:** No se concatenaron artificialmente bloques de SQL adicionales al final del archivo para evitar mantener dos fuentes de verdad divergentes y perpetuar el antipatrón de scripts monolíticos no versionados.

---

## 9. Fuente de Verdad Final

Se deja formalmente establecida una única regla de arquitectura para la base de datos:

> ### **REGLA DE ORO DE FUENTE DE VERDAD:**
> La **ÚNICA** fuente de verdad histórica y evolutiva de la base de datos es:
> ```
> supabase/migrations/ (archivos 001_initial_schema.sql hasta 036_gallery_categories.sql)
> ```
> Todo nuevo entorno debe inicializarse ejecutando secuencialmente estas 36 migraciones individuales en orden numérico/lexicográfico. Ningún script consolidado tiene validez operativa.

---

## 10. Archivos Afectados

1. [028_fix_public_payment_accounts_and_is_admin_grant.sql](file:///c:/Users/frani/Downloads/RifaManaure/supabase/migrations/028_fix_public_payment_accounts_and_is_admin_grant.sql):
   - Inyección de metadatos de trazabilidad determinista (Secuencia 028.1, historial git, orden lexicográfico, objetos DDL y nota de preservación).
2. [028_flexible_raffle_emission.sql](file:///c:/Users/frani/Downloads/RifaManaure/supabase/migrations/028_flexible_raffle_emission.sql):
   - Inyección de metadatos de trazabilidad determinista (Secuencia 028.2, historial git, orden lexicográfico, alcance DDL, ortogonalidad y nota de preservación).
3. [EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql](file:///c:/Users/frani/Downloads/RifaManaure/supabase/migrations/EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql):
   - Inyección de encabezado de deprecación formal, desglose de migraciones faltantes (028a, 028b, 029, 030, 031) y advertencia de fallo en bases limpias.
4. [supabase/migrations/README.md](file:///c:/Users/frani/Downloads/RifaManaure/supabase/migrations/README.md):
   - Creación de la guía canónica de migraciones SQL: convención de nombres, tabla de inventario completo (001 a 036), resolución técnica de 028, estado deprecado del script consolidado y protocolo de aprovisionamiento para nuevos entornos.
5. [README.md](file:///c:/Users/frani/Downloads/RifaManaure/README.md):
   - Actualización de la Sección 7 ("Base de Datos y Seguridad") agregando el punto 6 con la fuente canónica de verdad y referencia a `supabase/migrations/README.md`.
6. [AUDITORIA_00_FEEDBACK_03.md](file:///c:/Users/frani/Downloads/RifaManaure/AUDITORIA_00_FEEDBACK_03.md):
   - Informe técnico exhaustivo de remediación.

---

## 11. Validaciones Ejecutadas

1. **Análisis de Prefijos e Integridad de Nomenclatura:** Script PowerShell agrupando los 37 archivos de `supabase/migrations/` por prefijo regex `^([0-9]+)_`.
2. **Inspección de Estado Remoto vía Supabase CLI:**
   `$env:SUPABASE_ACCESS_TOKEN="..."; npx supabase migration list`
3. **Simulación de Migración Dry-Run vía Supabase CLI:**
   `$env:SUPABASE_ACCESS_TOKEN="..."; npx supabase db push --dry-run`
4. **Verificación de Tipos Estricta de TypeScript:**
   `npm run typecheck` (`tsc -b`)
5. **Análisis Estático de Código y Linter:**
   `npm run lint` (`oxlint`)
6. **Suite Completa de Pruebas Unitarias e Integración:**
   `npm run test` (`vitest run`)
7. **Compilación de Producción:**
   `npm run build` (`tsc -b && vite build`)
8. **Auditoría de Diferencias Git:**
   `git diff` y `git status`

---

## 12. Resultado de Cada Validación

| Validación | Comando | Resultado Técnico |
|---|---|---|
| **Inventario de Prefijos** | Regex script | PASS. Confirmó exactamente 1 archivo por prefijo para 001..027 y 029..036. Solo el prefijo 028 tiene 2 archivos. |
| **Listado Remoto Supabase** | `supabase migration list` | PASS (Informativo). Confirmó que la tabla remota `schema_migrations` no es gestionada por CLI (`remote: ""`), validando el origen manual. |
| **Simulación Dry-Run CLI** | `supabase db push --dry-run` | **PASS (Exit code 0).** El CLI procesó las 36 migraciones en orden determinista, omitiendo automáticamente `README.md` y `EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql`. |
| **TypeScript Typecheck** | `npm run typecheck` | **PASS.** 0 errores de compilación de tipos en modo estricto. |
| **Oxlint** | `npm run lint` | **PASS.** 0 errores en 115 archivos con 156 reglas evaluadas. |
| **Vitest Tests** | `npm run test` | **PASS.** 147 pruebas aprobadas en 12 archivos de test (100% éxito). |
| **Build Vite Producción** | `npm run build` | **PASS.** Compilación exitosa en 6.19s, generando todos los chunks y sourcemaps en `dist/`. |
| **Git Diff** | `git diff` | **PASS.** Solo modificaciones documentales y de metadatos en comentarios; cero cambios destructivos en DDL/DML. |

---

## 13. Riesgos No Resueltos

- **`schema_migrations` no sincronizada en base de datos remota:** Como el proyecto en producción se gestionó aplicando SQL en el editor web de Supabase, la tabla `supabase_migrations.schema_migrations` en la base de datos viva no contiene los hashes ni las versiones de las migraciones 001 a 036.
  > [!WARNING]
  > Si en el futuro un desarrollador ejecuta `supabase db push` sin bandera `--include-all` o sin una sincronización previa (`supabase migration repair`), el CLI intentará reaplicar todas las migraciones desde la 001, pudiendo causar errores de colisión de objetos existentes.
  >
  > **Estado:** `REQUIRES VERIFICATION` en entorno aislado antes de adoptar despliegues de base de datos 100% automatizados vía CLI.

---

## 14. Problemas Deliberadamente Reservados para Auditoría 01

En estricto apego al mandato de no mezclar la organización de la fuente de verdad con la auditoría de base de datos de fondo, **NO se modificaron** los siguientes aspectos sustantivos del esquema SQL:
1. **Rediseño del Esquema y Tipos:** Se conservaron las columnas y tipos actuales sin alteraciones.
2. **Funciones y Procedimientos Almacenados:** No se eliminaron ni alteraron las firmas de RPCs heredadas o duplicadas (`reserve_tickets`, `create_order_secure`, `admin_create_raffle`, etc.).
3. **Políticas de Row Level Security (RLS):** No se alteraron los predicados `USING` o `WITH CHECK`.
4. **Grants y Permisos de Roles:** No se modificaron los privilegios otorgados a `anon`, `authenticated` o `service_role`.
5. **Constraints e Índices:** No se agregaron ni removieron restricciones de verificación (CHECK) ni índices.
6. **Storage y Buckets:** No se alteraron las políticas de almacenamiento en `payment-proofs`, `partner-logos` o `gallery-images`.
7. **Realtime y Extensiones:** Se mantuvieron intactas las directivas de publicación y réplica.

Todos estos puntos serán objeto exclusivo de **AUDITORÍA 01 (Base de Datos, Esquema, Migraciones e Integridad)** y sus auditorías temáticas asociadas.

---

## 15. Commit Realizado

- **Rama de Trabajo:** `remediacion/auditoria-00`
- **Archivos Preparados para Commit:**
  - `README.md`
  - `supabase/migrations/028_fix_public_payment_accounts_and_is_admin_grant.sql`
  - `supabase/migrations/028_flexible_raffle_emission.sql`
  - `supabase/migrations/EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql`
  - `supabase/migrations/README.md`
  - `AUDITORIA_00_FEEDBACK_03.md`
- **Mensaje de Commit Previsto:**
  `fix(migrations): establecer fuente de verdad canonica, resolver secuencia 028 y deprecar script consolidado`
