# INFORME DE REMEDIACIÓN — AUDITORÍA 01 (FEEDBACK 05)
## Resolución de Hallazgos Secundarios de Integridad y Almacenamiento (DB-12, DB-15, DB-16)

**Proyecto:** RifaManaure  
**Rama de Trabajo:** `remediacion/auditoria-01`  
**Hallazgos Abordados:**
- **DB-12 (Media):** Buckets de Storage Huérfanos en Migraciones SQL vs Flujo Cloudinary
- **DB-15 (Baja):** Falta de Constraint Único para Evitar Registro Múltiple del Mismo Ganador
- **DB-16 (Baja):** Claridad Semántica y Anti-Suplantación en Firma de `is_admin(p_user_id UUID)`

---

### 1. DB-12 (STORAGE): Auditoría, Clasificación y Purgado de Políticas Huérfanas

#### A. Clasificación Exhaustiva de Buckets

| Bucket | Estado Arquitectural | Proveedor de Almacenamiento | Objetos en DB | Políticas RLS | Acción Realizada |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`payment-proofs`** | **Activo** | Supabase Storage (Privado) | 11 objetos | 2 activas | **Conservado íntegro**. Soporta la subida y visualización firmada de comprobantes. |
| **`gallery-images`** | **Activo** | Supabase Storage (Público) | 0 objetos | 4 activas | **Conservado íntegro**. Operado por `galleryService.ts` para galería comunitaria. |
| **`receipts`** | **Legado** | Supabase Storage (Público) | 0 objetos | 2 activas | **Conservado íntegro**. Mantenido como fallback de resolución para URLs históricas. |
| **`partner-logos`** | **Migrado a Cloudinary** | Cloudinary (`manaure-vive/aliados`) | Inexistente en DB | 4 huérfanas | **Políticas RLS purgadas**. Subidas gestionadas vía `partnerService.ts` y Edge Function `cloudinary-sign`. |
| **`prize-images`** | **Migrado a Cloudinary** | Cloudinary (`manaure-vive/premios`) | Inexistente en DB | 4 huérfanas | **Políticas RLS purgadas**. Subidas gestionadas vía `prizeService.ts` y Edge Function `cloudinary-sign`. |
| **`winner-documents`** | **Migrado a Cloudinary** | Cloudinary (`manaure-vive/actas-ganadores`) | Inexistente en DB | 5 huérfanas | **Políticas RLS purgadas**. Subidas gestionadas vía `winnerService.ts` y Edge Function `cloudinary-sign`. |

#### B. Políticas RLS Huérfanas Eliminadas en Migración 041
Se eliminaron 13 políticas que evaluaban buckets inexistentes en `storage.objects`:
1. `"Lectura pública de logos de aliados"`
2. `"Solo administradores pueden subir logos de aliados"`
3. `"Solo administradores pueden actualizar logos de aliados"`
4. `"Solo administradores pueden eliminar logos de aliados"`
5. `"Lectura pública de imágenes de premios"`
6. `"Solo administradores suben imágenes de premios"`
7. `"Solo administradores actualizan imágenes de premios"`
8. `"Solo administradores eliminan imágenes de premios"`
9. `"Lectura pública de documentos de ganadores"`
10. `"Administradores pueden listar y leer documentos de ganadores"`
11. `"Solo administradores pueden subir documentos de ganadores"`
12. `"Solo administradores pueden actualizar documentos de ganadores"`
13. `"Solo administradores pueden eliminar documentos de ganadores"`

**Garantía:** No se borró ningún archivo físico ni datos reales. Los 11 comprobantes reales en `payment-proofs` y las fotos de `gallery-images` permanecen 100% operativos.

---

### 2. DB-15 (WINNERS): Integridad, Idempotencia y Mitigación de Concurrencia

#### A. Verificación Previa de Datos Existentes
Se inspeccionó la tabla `public.winners` en la base de datos de producción:
- Total de registros existentes: **2 ganadores históricos** (`004` y `047`).
- Duplicados encontrados: **0 duplicados** (`COUNT(*) > 1` retornó `[]`).
- La tabla no contenía ningún constraint o índice único que previniera duplicados ante doble clic o llamadas concurrentes a la RPC.

#### B. Solución Implementada en Migración 041
1. **Restricción UNIQUE e Índice:**
   ```sql
   ALTER TABLE public.winners ADD CONSTRAINT uq_winners_raffle_ticket UNIQUE (raffle_id, ticket_number);
   CREATE INDEX IF NOT EXISTS idx_winners_raffle_ticket ON public.winners(raffle_id, ticket_number);
   ```
2. **Idempotencia Temprana y Manejo Concurrente en `register_winner`:**
   - **Verificación Temprana:** Si el boleto ya está registrado en `winners`, retorna inmediatamente:
     `{"success": false, "error": "El boleto \"XXX\" ya ha sido registrado como ganador para esta rifa."}`
   - **Captura de Excepción en Bloque:** La inserción está encapsulada en:
     ```sql
     BEGIN
       INSERT INTO public.winners (...) VALUES (...) RETURNING * INTO v_winner;
     EXCEPTION
       WHEN unique_violation THEN
         RETURN jsonb_build_object(
           'success', false,
           'error', 'Conflicto de concurrencia: el boleto "' || v_clean_ticket_number || '" ya fue registrado como ganador por otro proceso concurrente.'
         );
     END;
     ```
   - El frontend (`AdminRegisterWinnerModal.tsx` y `winnerService.ts`) recibe y despliega limpiamente el mensaje de error sin provocar excepciones no controladas.

---

### 3. DB-16 (IS_ADMIN): Claridad Semántica y Protección Anti-Suplantación

#### A. Diagnóstico de Dependencias
- Se identificó que **38 políticas RLS** en PostgreSQL invocan activamente `is_admin(auth.uid())` o `is_admin((SELECT auth.uid()))`.
- Eliminar el parámetro `p_user_id` de la función obligaría a un `DROP FUNCTION public.is_admin(uuid) CASCADE`, lo que eliminaría en cascada las 38 políticas de seguridad del sistema, acarreando un riesgo operativo crítico en producción.

#### B. Solución Implementada
Siguiendo la directriz del proyecto de priorizar la estabilidad de autorizaciones sobre cambios puramente cosméticos, se endureció la función manteniendo su compatibilidad total:
```sql
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Endurecimiento DB-16: Rechazo inmediato si se suministra un UUID ajeno
  IF p_user_id IS NOT NULL AND p_user_id <> v_uid THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = v_uid OR LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = v_uid))
      AND is_active = true
  );
END;
$$;
```
- **Llamada sin argumentos `is_admin()`:** Toma por defecto `auth.uid()`, evalúa la sesión real del usuario.
- **Llamada desde políticas RLS `is_admin(auth.uid())`:** `p_user_id == v_uid`, evalúa la sesión real sin romper compatibilidad.
- **Intento de suplantación o prueba `is_admin('uuid-de-otro')`:** `p_user_id <> v_uid`, retorna `false` de inmediato, eliminando cualquier ambigüedad de que la función pudiera chequear a otro usuario.
- Se aplicó idéntica lógica a `public.is_superadmin(p_user_id UUID DEFAULT auth.uid())`.

---

### 4. Batería de Validación Automatizada

Se implementó la suite [`src/test/secondaryIntegrityHardenings.test.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/test/secondaryIntegrityHardenings.test.ts) (13 tests):
1. **Pruebas de Storage:**
   - Preservación de buckets legítimos (`payment-proofs`, `gallery-images`, `receipts`).
   - Identificación de módulos gestionados en Cloudinary (`partner-logos`, `prize-images`, `winner-documents`).
   - Control de las 13 políticas purgadas.
2. **Pruebas de Concurrencia de Ganadores:**
   - Registro exitoso de boleto `sold`.
   - Rechazo de boletos no vendidos.
   - Bloqueo de duplicados por idempotencia temprana.
   - Mitigación de condición de carrera concurrente mediante captura de `unique_violation`.
   - Permisividad de boletos con mismo número en rifas distintas.
3. **Pruebas de `is_admin`:**
   - Autorización de llamada sin argumentos `is_admin()`.
   - Autorización de llamada con `auth.uid()` propio.
   - Rechazo estricto (`false`) ante UUID ajeno.
   - Rechazo estricto ante sesión anónima.

**Resultados del Pipeline:**
```text
✓ Vitest:    17 suites pasadas (205 tests totales, 100% éxito)
✓ Typecheck: PASSED (0 errores en tsc -b)
✓ Lint:      PASSED (0 errores en oxlint)
✓ Build:     PASSED (Vite producción en 7.37s)
✓ Dry-Run:   PASSED (Supabase db push dry-run código 0)
```

---

### 5. Estado de Producción y Verificación en Supabase

> [!IMPORTANT]
> **ESTADO DE PRODUCCIÓN: REQUIERE VERIFICACIÓN EN SUPABASE TRAS EJECUTAR MIGRACIÓN 041**

Para verificar la aplicación de las correcciones en el SQL Editor de Supabase:

1. **Verificar que no existen políticas huérfanas en storage:**
   ```sql
   SELECT policyname, cmd 
   FROM pg_policies 
   WHERE schemaname = 'storage' 
     AND tablename = 'objects' 
     AND (qual ILIKE '%partner-logos%' OR qual ILIKE '%prize-images%' OR qual ILIKE '%winner-documents%'
          OR with_check ILIKE '%partner-logos%' OR with_check ILIKE '%prize-images%' OR with_check ILIKE '%winner-documents%');
   ```
   *Resultado esperado:* `0 filas`.

2. **Verificar el constraint único de ganadores:**
   ```sql
   SELECT conname, contype, pg_get_constraintdef(oid) 
   FROM pg_constraint 
   WHERE conname = 'uq_winners_raffle_ticket';
   ```
   *Resultado esperado:* `UNIQUE (raffle_id, ticket_number)`.

3. **Verificar el hardening anti-suplantación en `is_admin`:**
   ```sql
   -- Debe retornar false si se prueba con un UUID arbitrario
   SELECT public.is_admin('00000000-0000-0000-0000-000000000000'::uuid);
   ```
   *Resultado esperado:* `false`.

---

### 6. Archivos Afectados

- [NEW] [`supabase/migrations/041_storage_cleanup_and_integrity_hardenings.sql`](file:///c:/Users/frani/Downloads/RifaManaure/supabase/migrations/041_storage_cleanup_and_integrity_hardenings.sql)
- [NEW] [`src/test/secondaryIntegrityHardenings.test.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/test/secondaryIntegrityHardenings.test.ts)
- [MODIFY] [`supabase/migrations/README.md`](file:///c:/Users/frani/Downloads/RifaManaure/supabase/migrations/README.md)
- [MODIFY] [`README.md`](file:///c:/Users/frani/Downloads/RifaManaure/README.md)
- [NEW] [`AUDITORIA_01_FEEDBACK_05.md`](file:///c:/Users/frani/Downloads/RifaManaure/AUDITORIA_01_FEEDBACK_05.md)
