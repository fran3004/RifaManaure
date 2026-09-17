# Auditoría — Lote 3: Tipos TypeScript

> Fecha: 2026-09-17 | Estado: ✅ Completo

---

## 31. `src/types/database.types.ts`

### A. Qué hace
Archivo central de tipos TypeScript generado (o mantenido manualmente) que describe el esquema completo de la base de datos Supabase: tablas, operaciones Insert/Update/Row, relaciones y funciones RPC.
Es importado por `lib/supabase.ts` (para tipar el cliente) y re-exportado por `src/database.types.ts` (bridge). Prácticamente todo el proyecto lo consume indirectamente a través de `raffle.types.ts`.

### B. Errores y bugs reales

**1. Tipos de RPCs con `Returns: Json` — pérdida de seguridad de tipos (issue sistémico)**
La mayoría de las funciones RPC devuelven `Json` en lugar de un tipo estructurado:
```ts
reserve_tickets: { Returns: Json }
create_order_secure: { Returns: Json }
approve_order_payment: { Returns: Json }
reject_order_payment: { Returns: Json }
cancel_order: { Returns: Json }
submit_payment_proof: { Returns: Json }
admin_block_ticket: { Returns: Json }
admin_unblock_ticket: { Returns: Json }
register_winner: { Returns: Json }
admin_update_system_settings: { Returns: Json }
admin_list_users: { Returns: Json }
admin_invite_user: { Returns: Json }
admin_toggle_user_status: { Returns: Json }
get_dashboard_kpis: { Returns: Json }
```
Esto significa que el resultado de todas estas RPCs llega al frontend como `Json` (= `string | number | boolean | null | object | array`) y el código que las consume tiene que hacer castings manuales o confiar en la estructura sin verificación. **Todo error de respuesta de la BD pasará silenciosamente si el código no verifica el shape correcto.** Es la fuente del patrón `as unknown as XType` que probablemente veremos en los servicios.

**2. `notification_logs.event_type` tiene valores duplicados en mayúsculas y minúsculas:**
```ts
event_type: 'payment_received' | 'payment_approved' | 'payment_rejected'
          | 'PAYMENT_RECEIVED' | 'PAYMENT_APPROVED' | 'PAYMENT_REJECTED';
```
El enum en la BD debería tener un solo casing. Esta duplicidad indica que hubo una migración que cambió el casing y la definición de tipos no se limpió — o que los valores antiguos en mayúsculas conviven con los nuevos en minúsculas. Si hay registros con ambos casings en producción, cualquier comparación `event_type === 'payment_received'` fallará silenciosamente para los registros con el casing antiguo. **Bug real de consistencia de datos.**

**3. `partners.Row.updated_at` es `string | undefined` (opcional) pero en todas las demás tablas es `string` (requerido):**
```ts
partners: {
  Row: {
    updated_at?: string;  // <-- opcional con ?
  }
}
// vs. todas las demás tablas:
updated_at: string;       // <-- requerido
```
Si la columna `updated_at` es `NOT NULL` en la BD (como lo es en las demás tablas con `DEFAULT now()`), este tipo es incorrecto — el campo siempre vendrá con valor. Si el tipo dice `string | undefined`, el código que accede a `partner.updated_at` necesita un guard innecesario, o peor, asume que es `string` y omite el guard. **Inconsistencia entre el tipo y el esquema real.**

**4. `winners.Relationships: []` — sin relaciones declaradas**
La tabla `winners` tiene llaves foráneas a `raffles`, `orders`, `buyers` y `tickets`, pero el tipo las declara con `Relationships: []`. No causa bugs funcionales (el cliente Supabase no usa esto para joins automáticos en TS), pero es documentación incorrecta que confunde.

**5. Ausencia de Views tipadas**
```ts
Views: {
  [_ in never]: never;
};
```
Si existen vistas SQL en la BD que el código consulta directamente (a verificar en migraciones), no están tipadas aquí. El código que las use necesitará castings manuales.

**6. `confirm_order_payment` devuelve `boolean` (único caso distinto de `Json`)**
```ts
confirm_order_payment: { Returns: boolean }
```
Esta función devuelve `boolean` directamente. Inconsistente con el resto que devuelven `Json`. Si la función SQL en realidad devuelve un objeto con `{success, error}`, el tipo es incorrecto.

### C. Calidad de código

- La estructura del archivo sigue el formato estándar del generador de Supabase CLI (`supabase gen types typescript`). Bien estructurado. ✅
- Las relaciones entre `tickets → raffles`, `tickets → buyers`, `tickets → orders`, `orders → raffles`, `orders → buyers`, y `notification_logs → orders` están correctamente declaradas.  ✅
- Los tipos de estado (`status`) están como union literals, no como enums de TypeScript — correcto para compatibilidad con Supabase. ✅
- **No está auto-generado:** El archivo ha sido mantenido manualmente (se ve en el comentario de cabecera y en las inconsistencias encontradas). Lo ideal sería generarlo con `supabase gen types typescript` y añadir los tipos de RPC manualmente encima, pero sabemos que en la práctica esto se gestiona a mano. La inconsistencia de `partners.updated_at` y los `event_type` duplicados son evidencia de mantenimiento manual.
- **Las RPCs de dashboard y gestión de usuarios están correctamente declaradas**, incluyendo sus parámetros con tipos específicos (no `Json` en los Args). ✅

### D. Rendimiento
- No aplica directamente (es un archivo de tipos, no runtime).

### E–F.
- Sin hallazgos de UI/UX ni seguridad en este archivo.

---

## 32. `src/types/raffle.types.ts`

### A. Qué hace
Aliases de tipo convenientes derivados de `database.types.ts`, más interfaces adicionales específicas del dominio de negocio (carrito, formulario de comprador, ganadores con detalle, experiencias de premio, etc.).
Importado extensamente por componentes, contextos y servicios.

### B. Errores y bugs reales

**1. `WinnerWithDetails` extiende `WinnerRow` con propiedades opcionales de joins:**
```ts
export interface WinnerWithDetails extends WinnerRow {
  raffle?: { id: string; title: string; lottery_reference: string; ticket_price: number };
  buyer?: { id: string; full_name: string; document_id: string; phone: string; email: string; city: string };
  order?: { id: string; reference: string; created_at: string; total_amount: number };
}
```
Las tres propiedades son opcionales (`?`). Si el código que consume `WinnerWithDetails` accede a `winner.buyer.full_name` sin verificar `winner.buyer`, obtendrá un `TypeError` en runtime. Este patrón es correcto si efectivamente los joins pueden estar ausentes, pero con el `strict: true` desactivado (visto en Lote 1) TypeScript no alertará de estos accesos sin guard. **El riesgo es real para el componente `GanadorShowcase` y el servicio `winnerService`** — a verificar en lotes posteriores.

**2. `PrizeExperience` tiene un campo `category` con valores hardcodeados:**
```ts
category: 'cuatrimoto' | 'parapente' | 'glamping' | 'gastronomia' | 'ecoturismo';
```
Esta interfaz no tiene correspondencia en `database.types.ts` — no existe tabla de experiencias en la BD. Las experiencias de premio están hardcodeadas en el frontend. **Si se añade una nueva categoría, hay que modificar este tipo y el código que lo usa.** Gestionable mientras los premios sean fijos, pero es inflexible.

**3. `CartState` tiene `raffleId` como `string` (requerido) pero `TicketCartContext` no lo expone directamente:**
`CartState` define la forma del carrito pero no parece ser usada por `TicketCartContext` (que gestiona el carrito de forma más completa). **Potencial tipo huérfano** — verificar si `CartState` se usa en algún componente.

**4. `TicketItem` tiene `formattedNumber: string` pero `TicketRow` tiene `number: string`:**
`TicketItem` es un tipo enriquecido para presentación (con `formattedNumber`). La conversión de `TicketRow` → `TicketItem` requiere llamar a `formatTicketNumber()`. Si este mapeo no ocurre consistentemente, habrá lugares mostrando el número sin formato (sin padding de ceros). **A verificar en componentes de ticketing (Lote 12).**

### C. Calidad de código
- Alias de tipos directamente de la BD vía `Database['public']['Tables'][...]['Row']` — patrón correcto que asegura que cambios en `database.types.ts` se propaguen automáticamente. ✅
- `ContactPreference` como tipo independiente (`'whatsapp' | 'email' | 'both'`) — bien, coincide con el tipo del campo `orders.contact_preference`. ✅
- `BuyerFormData` incluye `acceptTerms: boolean` — campo de UI que no existe en la BD. Correcto separar formulario de entidad. ✅
- `SystemSettingsRow` y `UpdateSystemSettingsParams` / `SystemSettingsResponse` forman un conjunto consistente. ✅
- `TicketStatus`, `PaymentStatus`, `PaymentMethod` como aliases de tipos derivados — buena práctica para evitar repetir las unions. ✅

### D–F.
- Sin hallazgos adicionales de rendimiento, UI/UX o seguridad en estos archivos de tipos.

---

## Resumen del Lote 3

| Archivo | Estado | Severidad máx. | Nota |
|---------|--------|----------------|------|
| `types/database.types.ts` | ⚠ mejorable | **Alta** | 14 RPCs con `Returns: Json` (sin tipos reales); `event_type` duplicado en mayúsculas/minúsculas; `partners.updated_at` incorrecto como opcional; mantenido manualmente con inconsistencias |
| `types/raffle.types.ts` | ⚠ mejorable | Media | `WinnerWithDetails` con propiedades opcionales sin guards garantizados; `CartState` posible tipo huérfano; `PrizeExperience` hardcodeada sin BD |

### Top hallazgos de este lote

1. **🔴 ALTO (sistémico):** `Returns: Json` en 14 RPCs elimina la seguridad de tipos en toda la capa de servicios. Todos los accesos a datos de RPCs son castings ciegos (`as`). Causa directa de bugs silenciosos en los servicios (a confirmar en Lotes 4 y 5).

2. **🟠 MEDIO:** `notification_logs.event_type` con duplicación de casings mayúsculas/minúsculas — indica datos inconsistentes en producción o esquema evolutivo sin limpiar. Cualquier filtro o comparación podría fallar para los registros con casing antiguo.

3. **🟠 MEDIO:** `partners.updated_at` declarado como opcional cuando la columna en BD es `NOT NULL`. Tipo incorrecto que introduce un guard innecesario o ausente.

4. **🟡 BAJO:** `WinnerWithDetails` con joins opcionales y sin `strict: true` en TS — accesos sin guard a `winner.buyer.full_name` etc. pueden explotar en runtime.

5. **🟡 BAJO:** `CartState` posiblemente tipo huérfano — verificar si se usa.

---

### Nota transversal importante
El patrón de `Returns: Json` en las RPCs es una decisión de diseño comprensible (el generador de Supabase CLI tampoco puede inferir el shape de un `RETURNS SETOF json` arbitrario), pero su consecuencia es que **toda la capa de servicios (Lotes 4 y 5) trabaja con castings manuales**. Cuando auditemos los servicios, buscaremos específicamente:
- `as unknown as SomeType` después de llamadas RPC
- Accesos a campos sin verificar el shape del `Json`
- Manejo de errores vs. éxito cuando la RPC devuelve un objeto `{success: bool, error: string}`

