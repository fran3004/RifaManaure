# Guía de Ejecución: Migración Segura de Supabase Storage a Cloudinary

Este script (`scripts/migrate-storage-to-cloudinary.mjs`) realiza la transferencia y sincronización controlada de activos existentes desde los buckets de **Supabase Storage** hacia **Cloudinary**, actualizando las referencias en la base de datos de manera transaccional e idempotente.

---

## 1. Módulos y Tablas Cubiertas

| Bucket Origen | Carpeta Destino Cloudinary | Tabla Afectada | Columna Actualizada |
|---|---|---|---|
| `prize-images` | `manaure-vive/premios` | `public.prize_experiences` | `image_url` |
| `partner-logos` | `manaure-vive/aliados` | `public.partners` | `logo_url` |
| `gallery-images` | `manaure-vive/galeria` | `public.gallery_items` | `image_url` |

*Nota: Los buckets `payment-proofs` y `winner-documents` quedan completamente excluidos de Cloudinary (se mantienen en Supabase Storage para visualización nativa de PDF y seguridad).*

---

## 2. Variables de Entorno Requeridas

El script valida de manera estricta que existan las credenciales administrativas necesarias antes de iniciar cualquier operación. Pueden suministrarse en variables de entorno o mediante un archivo `.env` local:

```env
# Conexión Supabase
SUPABASE_URL="https://tu-proyecto.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="ey..." # Clave secreta administrativa (service_role)

# Conexión Cloudinary
CLOUDINARY_CLOUD_NAME="tu_cloud_name"
CLOUDINARY_API_KEY="tu_api_key"
CLOUDINARY_API_SECRET="tu_api_secret"
```

> [!CAUTION]
> **Seguridad Crítica:** Nunca comitees ni compartas la variable `SUPABASE_SERVICE_ROLE_KEY` ni `CLOUDINARY_API_SECRET` en el repositorio público. Estas credenciales deben permanecer exclusivamente en entornos locales seguros o en el almacén de secretos del servidor.

---

## 3. Instrucciones de Uso

### Paso 1: Ejecución en Modo Simulación (`--dry-run`)
Antes de modificar cualquier dato, ejecuta el script en modo de lectura previa:

```bash
node scripts/migrate-storage-to-cloudinary.mjs --dry-run
```

O suministrando las variables en línea:
```bash
SUPABASE_SERVICE_ROLE_KEY="..." CLOUDINARY_API_SECRET="..." node scripts/migrate-storage-to-cloudinary.mjs --dry-run
```

**Comportamiento en `--dry-run`:**
- Inspecciona los 4 buckets y las 4 tablas de la base de datos.
- Identifica qué registros ya fueron migrados (idempotencia).
- Identifica qué registros necesitan migrarse y qué archivos corresponden.
- **No sube ningún archivo** y **no realiza modificaciones** en la base de datos.
- Imprime un resumen detallado en consola.

---

### Paso 2: Ejecución Real de Migración
Una vez validada la simulación, ejecuta la migración definitiva:

```bash
node scripts/migrate-storage-to-cloudinary.mjs [--only-matched]
```

**Banderas y Modos:**
- `--dry-run`: Simulación sin escrituras en base de datos ni subidas a Cloudinary.
- `--only-matched`: Si se detectan discrepancias (archivos huérfanos en Storage sin registro asociado en base de datos), esta opción autoriza proceder exclusivamente con los registros que poseen coincidencia inequívoca 1:1, protegiendo la integridad de la base de datos y manteniendo los archivos físicos en Storage intactos.

**Comportamiento en Ejecución Real:**
1. Descarga cada archivo desde Supabase Storage hacia memoria (Buffer).
2. Sube el archivo directamente a Cloudinary mediante firma criptográfica SHA-1.
3. Actualiza de forma segura la columna correspondiente en la base de datos (`image_url`, `logo_url`, `official_act_url`).
4. Genera automáticamente un archivo de respaldo lógico en `scripts/migration-backups/backup-<timestamp>.json` con los valores previos.
5. Registra el evento en la tabla `public.audit_logs`.
6. Si ocurre cualquier error de actualización en la base de datos, el script se detiene de inmediato para evitar estados inconsistentes.
7. Si existen discrepancias entre Storage y la Base de Datos, el script activa una detención de seguridad para proteger la integridad del sistema a menos que se indique `--only-matched`.

---

## 4. Garantías de Seguridad

- **No Destructivo:** El script **NUNCA** ejecuta `delete()` ni `remove()` sobre los archivos de Supabase Storage. Los archivos originales permanecen intactos como respaldo físico.
- **Idempotencia:** Si un registro ya posee una URL de Cloudinary (`res.cloudinary.com`), se omite automáticamente (`OMITIDO_YA_MIGRADO`).
- **Aislamiento del Frontend:** El script reside en la carpeta `scripts/` (fuera de `src/`) y **NO** se incluye en los bundles generados por `npm run build`.


