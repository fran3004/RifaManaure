# Reporte de Auditoría — Lote 15: Panel Admin (Vistas Parte 2)

**Fecha:** 2026-09-17  
**Archivos auditados:** 12  
**Ruta base:** `src/pages/admin/views/`

---

## 1. Archivos Auditados

| # | Archivo | Líneas | Propósito Principal |
|---|---|---|---|
| 140 | `src/pages/admin/views/RafflesView.tsx` | 474 | Gestión integral de sorteos, precio unitario, fechas, lotería de referencia y conmutación de rifa activa |
| 141 | `src/pages/admin/views/RafflesView.module.css` | 378 | Estilos de tarjetas de sorteo, barra de progreso de recaudo y badges de estado |
| 142 | `src/pages/admin/views/WinnersView.tsx` | 345 | Registro y exhibición de ganadores oficiales con actas PDF y evidencias fotográficas |
| 143 | `src/pages/admin/views/WinnersView.module.css` | 311 | Estilos de tarjetas de ganadores, trofeos dorados y galería fotográfica |
| 144 | `src/pages/admin/views/SettingsView.tsx` | 1010 | Configuración global del sistema (cronómetros, límites, WhatsApp/Email) y CRM de administradores autorizados |
| 145 | `src/pages/admin/views/SettingsView.module.css` | 619 | Estilos de tarjetas de configuración, steppers, chips de atajos y tabla de administradores |
| 146 | `src/pages/admin/views/PaymentAccountsView.tsx` | 906 | CRUD de cuentas bancarias y billeteras digitales (Nequi, Daviplata, Bancolombia, etc.) con visibilidad en checkout |
| 147 | `src/pages/admin/views/PartnersView.tsx` | 1188 | Directorio y convenios con aliados turísticos y comerciales con carga de logos a Storage |
| 148 | `src/pages/admin/views/PartnersView.module.css` | 265 | Estilos de tarjetas de aliados, badges de categoría y enlaces a Instagram/Web |
| 149 | `src/pages/admin/views/ReceiptsView.tsx` | 668 | Bandeja dedicada de validación de comprobantes de pago con URLs firmadas (900s) e inspección en alta resolución |
| 150 | `src/pages/admin/views/AuditView.tsx` | 1084 | Bitácora inmutable de auditoría con modo dual (Línea de tiempo narrativa vs Tabla ejecutiva) |
| 151 | `src/pages/admin/views/AuditView.module.css` | 547 | Estilos de la espina temporal de auditoría, nodos de color y tabla densa |

---

## 2. Análisis Detallado por Módulo

### A. Gestión de Rifas y Ediciones (`RafflesView.tsx` / `RafflesView.module.css`)
- **Control de Sorteos Activos y Pasados:**
  - Destaca la rifa activa con una barra de progreso de recaudación porcentual (`sales_percentage`), conteo de boletos vendidos vs emisión total y recaudo en COP.
  - Permite conmutar la rifa activa gestionada en todo el panel de administración mediante `setSelectedRaffleId` en `AdminRaffleContext`.
  - Despliega el catálogo de ediciones anteriores o en borrador con sus respectivos estados (`active`, `paused`, `finished`, `closed`, `draft`).
  - Integrado con `AdminEditRaffleModal` (edición de parámetros) y `AdminCreateRaffleModal` (creación con generación de boletos).

### B. Registro Oficial de Ganadores (`WinnersView.tsx` / `WinnersView.module.css`)
- **Transparencia y Adjudicación:**
  - Muestra el número de boleto ganador en formato destacado `#XXX`, número del sorteo oficial de la lotería, comprador ganador, orden de compra y fecha de sorteo.
  - Enlace al acta oficial en PDF (`official_act_url`) y galería de fotografías de entrega del premio en territorio.
  - Búsqueda en tiempo real por boleto, lotería, cédula, nombre, teléfono o referencia de orden.
  - Integrado con `AdminRegisterWinnerModal`.

### C. Configuración Global y Administradores (`SettingsView.tsx` / `SettingsView.module.css`)
- **Parámetros Operativos del Sistema:**
  - `reservation_duration_minutes`: Duración de reserva con stepper y chips rápidos (`5`, `10`, `15`, `30`, `60` min).
  - `max_tickets_per_buyer`: Límite anti-acaparamiento con atajos (`5`, `10`, `20`, `50`, `100` boletos).
  - Canales de contacto: Línea oficial de WhatsApp y correo institucional con botones de prueba inmediata (`Probar Enlace WhatsApp`, `Probar Mailto`).
- **Seguridad y Accesos de Administradores:**
  - Tabla de administradores pre-autorizados con control de roles (`superadmin`, `admin`, `auditor`).
  - Detección del estado de vinculación en Supabase Auth (`Vinculado` vs `Pendiente`).
  - **Regla Crítica de Seguridad:** Bloquea explícitamente la autodesactivación de la cuenta propia del usuario en sesión.
  - Atajo global `Ctrl+S` / `Cmd+S`, detección de cambios pendientes (`hasUnsavedChanges`) y botón para descartar.

### D. Cuentas Oficiales de Pago (`PaymentAccountsView.tsx`)
- **Gestión de Cuentas para Checkout:**
  - Soporte para presets colombianos (Nequi, Daviplata, Bancolombia, Banco de Bogotá, Davivienda, Dale!, Movii, Transfiya).
  - Campos detallados: Entidad, Tipo de cuenta (`digital_wallet`, `savings`, `current`, `transfiya`), Número, Titular, Documento/NIT, Instrucciones específicas y Orden de visualización.
  - Conmutador de estado activo/inactivo con actualización optimista de UI (solo cuentas activas se exponen en checkout público).

### E. Directorio de Aliados (`PartnersView.tsx` / `PartnersView.module.css`)
- **Gestión de Convenios:**
  - Carga y actualización de aliados con categoría (`Aventura y Deportes Extremos`, `Hospedaje & Glamping`, `Gastronomía Típica`, etc.), descripción, prioridad y enlaces externos.
  - Soporte para subida de logos a Supabase Storage con validación de tipo de archivo (PNG, WebP, JPG, SVG) y límite de 5 MB, o uso de URL externa / assets locales.
  - Generación automática de slug a partir del nombre del aliado.

### F. Bandeja de Comprobantes (`ReceiptsView.tsx`)
- **Auditoría Visual de Pagos:**
  - Tarjetas de comprobantes con miniaturas protegidas mediante URLs firmadas con vencimiento de 15 minutos (`getSignedProofUrl`, 900s).
  - Soporte para visualización de imágenes y documentos PDF en modal de alta resolución.
  - Flujo directo de Aprobación/Rechazo con modales de confirmación y liberación inmediata de boletos al rechazar.

### G. Bitácora de Auditoría (`AuditView.tsx` / `AuditView.module.css`)
- **Trazabilidad Inmutable:**
  - Modo dual:
    1. **Línea de Tiempo (Stream):** Espina visual con nodos coloreados según el tipo de acción y generador de narrativas contextuales (`getNarrative()`) con chips de impacto financiero y boletos.
    2. **Tabla Ejecutiva:** Vista densa con desglose de evento, responsable (`Administrador`, `Comprador`, `Sistema`), tiempo relativo e impacto.
  - Filtro por categoría de evento (`PAID`, `PROOF`, `PENDING`, `TICKET`, `REJECTED`) y búsqueda libre.

---

## 3. Matriz de Hallazgos y Evaluación

| Criterio | Evaluación | Comentarios |
|---|---|---|
| **Bugs / Errores Funcionales** | 🟢 Ninguno | Manejo completo de errores, subida segura de archivos y feedback toast en todas las vistas. |
| **Calidad de Código / Tipado** | 🟢 Sobresaliente | Tipado TypeScript estricto; modularización limpia entre lógica y presentación. |
| **Rendimiento** | 🟢 Excelente | Generación de URLs firmadas temporales bajo demanda; paginación optimizada. |
| **UI / UX** | 🟢 Sobresaliente | Atajo `Ctrl+S`, steppers con presets rápidos, vista dual de auditoría, previsualización de WhatsApp. |
| **Seguridad y Roles** | 🟢 Muy Alto | Prohibición de autodesactivación admin; comprobantes en Storage privado con tokens temporales. |
| **Accesibilidad (a11y)** | 🟢 Alta | Contraste adecuado, etiquetas en inputs, roles modales y atajos con feedback. |

---

## 4. Conclusión del Lote
El conjunto de vistas avanzadas del panel administrativo (Rifas, Ganadores, Configuración, Cuentas de Pago, Aliados, Comprobantes y Auditoría) completa la suite de gestión empresarial del sistema con alta calidad, seguridad y usabilidad.

