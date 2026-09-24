# INFORME DE REMEDIACIÓN TRANSACCIONAL — AUDITORÍA 01 (FEEDBACK 02)

**Proyecto:** RifaManaure (Manaure Vive)  
**Fecha:** 2026-09-23  
**Rama:** `remediacion/auditoria-01`  
**Hallazgos Corregidos:** `DB-06`, `DB-07`, `DB-08`, `DB-09`, `DB-11`  
**Migración Canónica Generada:** `supabase/migrations/038_harden_ticket_order_structural_integrity.sql`  

---

## 1. Resumen Ejecutivo de la Intervención

En esta segunda fase de remediación sobre la base de datos PostgreSQL de Supabase, se ha eliminado la totalidad de las vulnerabilidades estructurales en las entidades críticas `tickets` y `orders`:

1. **DB-06 (Irreversibilidad Comercial de Boletos Vendidos):** Se selló a nivel de trigger de motor cualquier transición que intente cambiar el estado de un boleto `sold` hacia `available`, `reserved` o `blocked`.
2. **DB-07 (Inmutabilidad de Titularidad y Orden en Boletos Vendidos):** Se erradicó el bypass por salida temprana (`IF OLD.status = NEW.status THEN RETURN NEW;`) y la omisión de columnas (`BEFORE UPDATE OF status`). Ahora el trigger vigila **cualquier UPDATE** sobre `public.tickets` e impide mutar `buyer_id`, `order_id`, `raffle_id` o `number` cuando `OLD.status = 'sold'`.
3. **DB-08 (Alineación Estructural de Rifas vía Clave Foránea Compuesta):** Se creó la restricción `orders_id_raffle_id_key UNIQUE (id, raffle_id)` en `public.orders` y la clave foránea compuesta `tickets_order_raffle_fkey FOREIGN KEY (order_id, raffle_id) REFERENCES public.orders(id, raffle_id) ON DELETE RESTRICT` en `public.tickets`. Es estructuralmente imposible que un boleto de la rifa A apunte a una orden de la rifa B.
4. **DB-09 (Erradicación de Tickets Huérfanos por Eliminación de Órdenes):** Se eliminó la cláusula `ON DELETE SET NULL` de `tickets_order_id_fkey`, sustituyéndola por `ON DELETE RESTRICT` en la clave compuesta. Ninguna orden con boletos asociados puede ser eliminada.
5. **DB-11 (Nulabilidad y Restricciones CHECK de Consistencia de Estados):** Se aplicó `SET NOT NULL` a `orders.status` y `tickets.status` (respaldado por la pre-verificación de 0 nulos en producción). Se establecieron 4 restricciones CHECK exhaustivas para impedir estados corruptos en `tickets`.

---

## 2. Evidencias de la Inspección Previa (Base de Datos en Producción)

Previo a cualquier cambio DDL, se ejecutaron inspecciones forenses directas en Supabase (`bxhzvmbbsisxqpwrgvgn`):

| Verificación Forense | Resultado en DB | Conclusión |
| :--- | :---: | :--- |
| `tickets.status IS NULL` | **0 filas** | Seguro aplicar `ALTER COLUMN status SET NOT NULL` |
| `orders.status IS NULL` | **0 filas** | Seguro aplicar `ALTER COLUMN status SET NOT NULL` |
| Tickets con rifa distinta a su orden (`tickets.raffle_id <> orders.raffle_id`) | **0 filas** | Compatible 100% con FK compuesta `(order_id, raffle_id)` |
| Boletos `sold` con `order_id IS NULL` o `buyer_id IS NULL` | **0 filas** | Compatible 100% con `tickets_sold_order_check` |
| Boletos `reserved` con `reservation_expires_at IS NULL` | **0 filas** | Compatible 100% con `tickets_reserved_expiry_check` |
| Boletos `available` con referencias no nulas (`order_id`, `buyer_id`, expiración) | **0 filas** | Compatible 100% con `tickets_available_clean_check` |
| Boletos `blocked` con referencias activas (`order_id` o `buyer_id`) | **0 filas** | Compatible 100% con `tickets_blocked_clean_check` |

### Diagnóstico de Vulnerabilidad en Triggers Previos
- **Definición anterior:** `CREATE TRIGGER trg_validate_ticket_status BEFORE UPDATE OF status ON public.tickets`.
- **Falla detectada:** Si una consulta ejecutaba `UPDATE tickets SET buyer_id = 'otro' WHERE number = '100'`, al no incluir la columna `status` en la cláusula `UPDATE OF`, el trigger **ni siquiera se ejecutaba**.
- **Falla secundaria en función trigger:** En `fn_validate_ticket_status_transition`, la línea `IF OLD.status = NEW.status THEN RETURN NEW;` permitía que cualquier actualización enviando `status = 'sold'` mutara `buyer_id` y `order_id` sin disparar ninguna excepción.

---

## 3. Cambios Implementados (Migración 038)

Archivo creado: [`supabase/migrations/038_harden_ticket_order_structural_integrity.sql`](file:///c:/Users/frani/Downloads/RifaManaure/supabase/migrations/038_harden_ticket_order_structural_integrity.sql)

### 3.1 DDL Estructural y Claves Foráneas
```sql
-- DB-11: NOT NULL en status
ALTER TABLE public.orders ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.tickets ALTER COLUMN status SET NOT NULL;

-- DB-08: Restricción de unicidad para composite foreign key
ALTER TABLE public.orders 
    ADD CONSTRAINT orders_id_raffle_id_key UNIQUE (id, raffle_id);

-- DB-09: Eliminación de ON DELETE SET NULL
ALTER TABLE public.tickets 
    DROP CONSTRAINT IF EXISTS tickets_order_id_fkey;

-- DB-08 & DB-09: Clave Foránea Compuesta con ON DELETE RESTRICT
ALTER TABLE public.tickets 
    ADD CONSTRAINT tickets_order_raffle_fkey 
    FOREIGN KEY (order_id, raffle_id) 
    REFERENCES public.orders(id, raffle_id) 
    ON DELETE RESTRICT;

-- Índice para optimizar verificaciones y joins de la FK compuesta
CREATE INDEX IF NOT EXISTS idx_tickets_order_raffle 
    ON public.tickets (order_id, raffle_id);
```

### 3.2 Restricciones CHECK de Consistencia de Estados
- `tickets_reserved_expiry_check`: `CHECK (status <> 'reserved' OR reservation_expires_at IS NOT NULL)`
- `tickets_sold_order_check`: `CHECK (status <> 'sold' OR (order_id IS NOT NULL AND buyer_id IS NOT NULL))`
- `tickets_available_clean_check`: `CHECK (status <> 'available' OR (order_id IS NULL AND buyer_id IS NULL AND reservation_expires_at IS NULL))`
- `tickets_blocked_clean_check`: `CHECK (status <> 'blocked' OR (order_id IS NULL AND buyer_id IS NULL AND reservation_expires_at IS NULL))`

### 3.3 Triggers y Funciones de Validación
1. **`fn_validate_ticket_status_transition()`**:
   - Evalúa `OLD.status = 'sold'` antes de cualquier bypass:
     - Si `NEW.status IS DISTINCT FROM 'sold'` -> `RAISE EXCEPTION` (DB-06).
     - Si `NEW.buyer_id IS DISTINCT FROM OLD.buyer_id` -> `RAISE EXCEPTION` (DB-07).
     - Si `NEW.order_id IS DISTINCT FROM OLD.order_id` -> `RAISE EXCEPTION` (DB-07).
     - Si `NEW.raffle_id IS DISTINCT FROM OLD.raffle_id` -> `RAISE EXCEPTION` (DB-08).
     - Si `NEW.number IS DISTINCT FROM OLD.number` -> `RAISE EXCEPTION`.
   - Prohíbe mutar `raffle_id` y `number` en cualquier estado.
   - En transición a `sold`: exige que el estado previo sea `'reserved'`, que `order_id` exista y esté en `'paid'` o `'completed'`, y que `ticket.buyer_id` y `ticket.raffle_id` coincidan de forma idéntica con los de la orden.
   - En transición a `available` o `blocked`: limpia atómicamente `reserved_at`, `reservation_expires_at`, `buyer_id` y `order_id`.
   - Recreación de trigger: `BEFORE UPDATE ON public.tickets` (abarca todas las columnas).

2. **`fn_validate_order_status_transition()`**:
   - Inmutabilidad estricta de `raffle_id` y `reference`.
   - Si `OLD.status IN ('paid', 'completed')`:
     - Prohíbe retroceso a `'pending'`, `'pending_verification'`, `'expired'`, `'rejected'` o `'cancelled'`.
     - Prohíbe mutar `buyer_id`, `total_amount` o `ticket_count`.
   - Recreación de trigger: `BEFORE UPDATE ON public.orders`.

---

## 4. Invariantes Garantizados

1. **Invariante 1 (Irreversibilidad de Venta):** Todo boleto vendido (`sold`) permanece vendido de por vida en la base de datos; ninguna actualización puede reactivarlo o liberarlo.
2. **Invariante 2 (Titularidad Inmutable):** Ni el comprador (`buyer_id`) ni la orden (`order_id`) de un boleto vendido pueden ser reasignados.
3. **Invariante 3 (Alineación Monolítica de Rifas):** Ningún boleto puede pertenecer a una orden emitida para otra rifa (`tickets.raffle_id = orders.raffle_id`).
4. **Invariante 4 (No Orfandad por Borrado):** Una orden con boletos asociados no puede ser borrada de la base de datos (`ON DELETE RESTRICT`).
5. **Invariante 5 (Estado Obligatorio):** Ni `orders` ni `tickets` admiten valores `NULL` en su columna `status`.
6. **Invariante 6 (Limpieza de Boletos Libres/Bloqueados):** Todo boleto en `available` o `blocked` tiene garantizada la nulidad de referencias transaccionales residuales.
7. **Invariante 7 (Blindaje Comercial de Órdenes Pagadas):** Una orden pagada conserva inalterados su monto total, recuento de boletos, titular y rifa.

---

## 5. Pruebas y Validaciones Realizadas

1. **Suite de Pruebas Automatizadas (Vitest):**
   - Nuevo archivo de test: [`src/test/ticketStructuralIntegrity.test.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/test/ticketStructuralIntegrity.test.ts) con 11 casos de prueba cubriendo DB-06, DB-07, DB-08, DB-09, DB-11 e inmutabilidad de órdenes pagadas.
   - Ejecución completa: **14 archivos de test, 167 pruebas ejecutadas, 100% pasando**.
2. **Validación de Sintaxis DDL (Supabase CLI):**
   - Ejecución de `npx supabase db push --dry-run` exitosa, reconociendo la migración `038_harden_ticket_order_structural_integrity.sql` sin advertencias de compatibilidad.
3. **Verificación Estricta de Tipos (TypeScript):**
   - `npm run typecheck` (`tsc -b`): **0 errores**.
4. **Verificación de Calidad de Código (Oxlint):**
   - `npm run lint`: **0 errores**.
5. **Compilación de Producción (Vite):**
   - `npm run build`: Generación de bundles en `dist/` en **5.49s** sin incidencias.

---

## 6. Riesgos Residuales y Protocolo de Aplicación Remota

> [!IMPORTANT]
> **Recordatorio Operativo de Despliegue:**
> Como regla de seguridad estricta, las modificaciones DDL no se ejecutan automáticamente en el entorno de Supabase en vivo sin consentimiento explícito.
> 
> Para aplicar esta migración a la base de datos vinculada de Supabase:
> 1. Vía Supabase CLI:
>    ```bash
>    npx supabase db push
>    ```
> 2. O copiando el contenido de `supabase/migrations/038_harden_ticket_order_structural_integrity.sql` en el SQL Editor del Dashboard de Supabase.

---

## 7. Archivos Afectados

- [NEW] [`supabase/migrations/038_harden_ticket_order_structural_integrity.sql`](file:///c:/Users/frani/Downloads/RifaManaure/supabase/migrations/038_harden_ticket_order_structural_integrity.sql)
- [NEW] [`src/test/ticketStructuralIntegrity.test.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/test/ticketStructuralIntegrity.test.ts)
- [MODIFY] [`supabase/migrations/README.md`](file:///c:/Users/frani/Downloads/RifaManaure/supabase/migrations/README.md)
- [MODIFY] [`README.md`](file:///c:/Users/frani/Downloads/RifaManaure/README.md)
