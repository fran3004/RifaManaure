# AUDITORÍA PROGRESO — Manaure Vive (Sistema de Rifas)
> Última actualización: 2026-09-17 | Estado: FASE 0 — Inventario completo

---

## LOTE 1 — Configuración y entorno

| # | Archivo | Auditado |
|---|---------|----------|
| 1 | `package.json` | `[x]` |
| 2 | `vite.config.ts` | `[x]` |
| 3 | `tsconfig.json` | `[x]` |
| 4 | `tsconfig.app.json` | `[x]` |
| 5 | `tsconfig.node.json` | `[x]` |
| 6 | `.oxlintrc.json` | `[x]` |
| 7 | `.env.example` | `[x]` |
| 8 | `.gitignore` | `[x]` |
| 9 | `index.html` | `[x]` |
| 10 | `README.md` | `[x]` |
| 11 | `public/site.webmanifest` | `[x]` |
| 12 | `public/favicon.svg` | `[x]` |
| 13 | `public/icons.svg` | `[x]` |

---

## LOTE 2 — Entrypoint, rutas y contextos globales

| # | Archivo | Auditado |
|---|---------|----------|
| 14 | `src/main.tsx` | `[x]` |
| 15 | `src/App.tsx` | `[x]` |
| 16 | `src/App.css` | `[x]` |
| 17 | `src/index.css` | `[x]` |
| 18 | `src/lib/supabase.ts` | `[x]` |
| 19 | `src/lib/utils.ts` | `[x]` |
| 20 | `src/database.types.ts` | `[x]` |
| 21 | `src/context/AuthContext.tsx` | `[x]` |
| 22 | `src/context/AuthContextDefinition.ts` | `[x]` |
| 23 | `src/context/useAuth.ts` | `[x]` |
| 24 | `src/context/SystemSettingsContext.tsx` | `[x]` |
| 25 | `src/context/AdminRaffleContext.tsx` | `[x]` |
| 26 | `src/context/TicketCartContext.tsx` | `[x]` |
| 27 | `src/context/TicketCartContextDefinition.ts` | `[x]` |
| 28 | `src/context/useTicketCart.ts` | `[x]` |
| 29 | `src/hooks/useDocumentTitle.ts` | `[x]` |
| 30 | `src/hooks/useSystemSettings.ts` | `[x]` |

---

## LOTE 3 — Tipos TypeScript

| # | Archivo | Auditado |
|---|---------|----------|
| 31 | `src/types/database.types.ts` | `[x]` |
| 32 | `src/types/raffle.types.ts` | `[x]` |

---

## LOTE 4 — Servicios (parte 1 de 2)

| # | Archivo | Auditado |
|---|---------|----------|
| 33 | `src/services/authService.ts` | `[ ]` |
| 34 | `src/services/settingsService.ts` | `[ ]` |
| 35 | `src/services/raffleService.ts` | `[ ]` |
| 36 | `src/services/ticketService.ts` | `[ ]` |
| 37 | `src/services/buyerService.ts` | `[ ]` |
| 38 | `src/services/adminUserService.ts` | `[ ]` |
| 39 | `src/services/partnerService.ts` | `[ ]` |

---

## LOTE 5 — Servicios (parte 2 de 2)

| # | Archivo | Auditado |
|---|---------|----------|
| 40 | `src/services/paymentService.ts` | `[ ]` |
| 41 | `src/services/emailService.ts` | `[ ]` |
| 42 | `src/services/notificationService.ts` | `[ ]` |
| 43 | `src/services/whatsappService.ts` | `[ ]` |
| 44 | `src/services/winnerService.ts` | `[ ]` |
| 45 | `src/services/receiptGeneratorService.ts` | `[ ]` |

---

## LOTE 6 — Edge Functions de Supabase

| # | Archivo | Auditado |
|---|---------|----------|
| 46 | `supabase/functions/cron-release-expired-reservations/index.ts` | `[ ]` |
| 47 | `supabase/functions/resend-webhook/index.ts` | `[ ]` |
| 48 | `supabase/functions/send-transactional-email/index.ts` | `[ ]` |
| 49 | `scripts/verify_db.mjs` | `[ ]` |

---

## LOTE 7 — Migraciones SQL (parte 1: 001–014)

| # | Archivo | Auditado |
|---|---------|----------|
| 50 | `supabase/migrations/001_initial_schema.sql` | `[ ]` |
| 51 | `supabase/migrations/002_admin_auth.sql` | `[ ]` |
| 52 | `supabase/migrations/003_manual_payment_flow.sql` | `[ ]` |
| 53 | `supabase/migrations/004_normalize_order_ticket_state_machine.sql` | `[ ]` |
| 54 | `supabase/migrations/005_payment_accounts_management.sql` | `[ ]` |
| 55 | `supabase/migrations/006_payment_proofs_storage_flow.sql` | `[ ]` |
| 56 | `supabase/migrations/007_transactional_notification_logs.sql` | `[ ]` |
| 57 | `supabase/migrations/008_order_contact_preference.sql` | `[ ]` |
| 58 | `supabase/migrations/009_notification_traceability.sql` | `[ ]` |
| 59 | `supabase/migrations/010_admin_ticket_management.sql` | `[ ]` |
| 60 | `supabase/migrations/011_cron_release_expired_reservations.sql` | `[ ]` |
| 61 | `supabase/migrations/012_create_order_secure.sql` | `[ ]` |
| 62 | `supabase/migrations/013_restrict_orders_select_and_public_verification_rpc.sql` | `[ ]` |
| 63 | `supabase/migrations/014_harden_admin_payment_rpcs.sql` | `[ ]` |

---

## LOTE 8 — Migraciones SQL (parte 2: 015–027 + monolito)

| # | Archivo | Auditado |
|---|---------|----------|
| 64 | `supabase/migrations/015_harden_payment_proofs_storage.sql` | `[ ]` |
| 65 | `supabase/migrations/016_preserve_buyer_data_on_order_creation.sql` | `[ ]` |
| 66 | `supabase/migrations/017_fix_admin_users_rls_recursion.sql` | `[ ]` |
| 67 | `supabase/migrations/018_enable_supabase_realtime.sql` | `[ ]` |
| 68 | `supabase/migrations/019_admin_buyer_management.sql` | `[ ]` |
| 69 | `supabase/migrations/020_admin_raffle_management.sql` | `[ ]` |
| 70 | `supabase/migrations/021_winners_management.sql` | `[ ]` |
| 71 | `supabase/migrations/022_system_settings_management.sql` | `[ ]` |
| 72 | `supabase/migrations/023_security_hardening_linter_fixes.sql` | `[ ]` |
| 73 | `supabase/migrations/024_admin_users_management.sql` | `[ ]` |
| 74 | `supabase/migrations/025_partners_management.sql` | `[ ]` |
| 75 | `supabase/migrations/026_dashboard_kpis_rpc.sql` | `[ ]` |
| 76 | `supabase/migrations/027_dashboard_kpis_robust_filter.sql` | `[ ]` |
| 77 | `supabase/migrations/EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` | `[ ]` |

---

## LOTE 9 — Componentes comunes y layout público

| # | Archivo | Auditado |
|---|---------|----------|
| 78 | `src/components/common/ErrorBoundary.tsx` | `[ ]` |
| 79 | `src/components/common/FloatingWhatsAppBtn.tsx` | `[ ]` |
| 80 | `src/components/common/FloatingWhatsAppBtn.module.css` | `[ ]` |
| 81 | `src/components/common/PageLoadingFallback.tsx` | `[ ]` |
| 82 | `src/components/common/ScrollToHashElement.tsx` | `[ ]` |
| 83 | `src/components/common/ToastNotification.tsx` | `[ ]` |
| 84 | `src/components/common/ToastNotification.module.css` | `[ ]` |
| 85 | `src/components/layout/Footer.tsx` | `[ ]` |
| 86 | `src/components/layout/Footer.module.css` | `[ ]` |
| 87 | `src/components/layout/Navbar.tsx` | `[ ]` |
| 88 | `src/components/layout/Navbar.module.css` | `[ ]` |
| 89 | `src/components/auth/ProtectedRoute.tsx` | `[ ]` |
| 90 | `src/components/auth/ProtectedRoute.module.css` | `[ ]` |
| 91 | `src/styles/globals.css` | `[ ]` |
| 92 | `src/styles/variables.css` | `[ ]` |

---

## LOTE 10 — Páginas públicas

| # | Archivo | Auditado |
|---|---------|----------|
| 93 | `src/pages/HomePage.tsx` | `[ ]` |
| 94 | `src/pages/AdminLoginPage.tsx` | `[ ]` |
| 95 | `src/pages/AdminLoginPage.module.css` | `[ ]` |
| 96 | `src/pages/TerminosPage.tsx` | `[ ]` |
| 97 | `src/pages/TerminosPage.module.css` | `[ ]` |
| 98 | `src/pages/VerificarPage.tsx` | `[ ]` |
| 99 | `src/pages/VerificarPage.module.css` | `[ ]` |

---

## LOTE 11 — Componentes landing (página principal pública)

| # | Archivo | Auditado |
|---|---------|----------|
| 100 | `src/components/landing/HeroRifa.tsx` | `[ ]` |
| 101 | `src/components/landing/HeroRifa.module.css` | `[ ]` |
| 102 | `src/components/landing/DetallePremio.tsx` | `[ ]` |
| 103 | `src/components/landing/DetallePremio.module.css` | `[ ]` |
| 104 | `src/components/landing/GaleriaPremio.tsx` | `[ ]` |
| 105 | `src/components/landing/GaleriaPremio.module.css` | `[ ]` |
| 106 | `src/components/landing/FilaAliados.tsx` | `[ ]` |
| 107 | `src/components/landing/FilaAliados.module.css` | `[ ]` |
| 108 | `src/components/landing/PreguntasFrecuentes.tsx` | `[ ]` |
| 109 | `src/components/landing/PreguntasFrecuentes.module.css` | `[ ]` |

---

## LOTE 12 — Componentes ticketing y checkout

| # | Archivo | Auditado |
|---|---------|----------|
| 110 | `src/components/ticketing/SelectorBoletos.tsx` | `[ ]` |
| 111 | `src/components/ticketing/SelectorBoletos.module.css` | `[ ]` |
| 112 | `src/components/ticketing/GanadorShowcase.tsx` | `[ ]` |
| 113 | `src/components/ticketing/GanadorShowcase.module.css` | `[ ]` |
| 114 | `src/components/checkout/ModalCheckout.tsx` | `[ ]` |
| 115 | `src/components/checkout/ModalCheckout.module.css` | `[ ]` |
| 116 | `src/components/receipt/DigitalReceiptModal.tsx` | `[ ]` |
| 117 | `src/components/receipt/DigitalReceiptModal.module.css` | `[ ]` |

---

## LOTE 13 — Panel admin: layout y componentes comunes

| # | Archivo | Auditado |
|---|---------|----------|
| 118 | `src/components/admin/layout/AdminLayout.tsx` | `[ ]` |
| 119 | `src/components/admin/layout/AdminLayout.module.css` | `[ ]` |
| 120 | `src/components/admin/layout/AdminHeader.tsx` | `[ ]` |
| 121 | `src/components/admin/layout/AdminHeader.module.css` | `[ ]` |
| 122 | `src/components/admin/layout/AdminSidebar.tsx` | `[ ]` |
| 123 | `src/components/admin/layout/AdminSidebar.module.css` | `[ ]` |
| 124 | `src/components/admin/layout/AdminBreadcrumbs.tsx` | `[ ]` |
| 125 | `src/components/admin/layout/AdminBreadcrumbs.module.css` | `[ ]` |
| 126 | `src/components/admin/common/AdminEmptyState.tsx` | `[ ]` |
| 127 | `src/components/admin/common/AdminEmptyState.module.css` | `[ ]` |
| 128 | `src/components/admin/common/AdminErrorState.tsx` | `[ ]` |
| 129 | `src/components/admin/common/AdminErrorState.module.css` | `[ ]` |
| 130 | `src/components/admin/common/AdminLoadingState.tsx` | `[ ]` |
| 131 | `src/components/admin/common/AdminLoadingState.module.css` | `[ ]` |
| 132 | `src/components/admin/common/AdminPageHeader.tsx` | `[ ]` |
| 133 | `src/components/admin/common/AdminPageHeader.module.css` | `[ ]` |

---

## LOTE 14 — Panel admin: vistas (parte 1)

| # | Archivo | Auditado |
|---|---------|----------|
| 134 | `src/pages/admin/views/AdminViews.module.css` | `[ ]` |
| 135 | `src/pages/admin/views/DashboardView.tsx` | `[ ]` |
| 136 | `src/pages/admin/views/OrdersView.tsx` | `[ ]` |
| 137 | `src/pages/admin/views/TicketsView.tsx` | `[ ]` |
| 138 | `src/pages/admin/views/BuyersView.tsx` | `[ ]` |
| 139 | `src/pages/admin/views/BuyersView.module.css` | `[ ]` |

---

## LOTE 15 — Panel admin: vistas (parte 2)

| # | Archivo | Auditado |
|---|---------|----------|
| 140 | `src/pages/admin/views/RafflesView.tsx` | `[ ]` |
| 141 | `src/pages/admin/views/RafflesView.module.css` | `[ ]` |
| 142 | `src/pages/admin/views/WinnersView.tsx` | `[ ]` |
| 143 | `src/pages/admin/views/WinnersView.module.css` | `[ ]` |
| 144 | `src/pages/admin/views/SettingsView.tsx` | `[ ]` |
| 145 | `src/pages/admin/views/SettingsView.module.css` | `[ ]` |
| 146 | `src/pages/admin/views/PaymentAccountsView.tsx` | `[ ]` |
| 147 | `src/pages/admin/views/PartnersView.tsx` | `[ ]` |
| 148 | `src/pages/admin/views/PartnersView.module.css` | `[ ]` |
| 149 | `src/pages/admin/views/ReceiptsView.tsx` | `[ ]` |
| 150 | `src/pages/admin/views/AuditView.tsx` | `[ ]` |
| 151 | `src/pages/admin/views/AuditView.module.css` | `[ ]` |

---

## LOTE 16 — Panel admin: modales y componentes específicos

| # | Archivo | Auditado |
|---|---------|----------|
| 152 | `src/components/admin/orders/AdminOrderReviewModal.tsx` | `[ ]` |
| 153 | `src/components/admin/orders/AdminOrderReviewModal.module.css` | `[ ]` |
| 154 | `src/components/admin/orders/AdminConfirmPaymentModal.tsx` | `[ ]` |
| 155 | `src/components/admin/orders/AdminConfirmPaymentModal.module.css` | `[ ]` |
| 156 | `src/components/admin/buyers/AdminBuyerOrdersModal.tsx` | `[ ]` |
| 157 | `src/components/admin/buyers/AdminBuyerOrdersModal.module.css` | `[ ]` |
| 158 | `src/components/admin/buyers/AdminEditBuyerModal.tsx` | `[ ]` |
| 159 | `src/components/admin/buyers/AdminEditBuyerModal.module.css` | `[ ]` |
| 160 | `src/components/admin/raffles/AdminCreateRaffleModal.tsx` | `[ ]` |
| 161 | `src/components/admin/raffles/AdminEditRaffleModal.tsx` | `[ ]` |
| 162 | `src/components/admin/raffles/AdminEditRaffleModal.module.css` | `[ ]` |
| 163 | `src/components/admin/settings/AdminInviteUserModal.tsx` | `[ ]` |
| 164 | `src/components/admin/settings/AdminInviteUserModal.module.css` | `[ ]` |
| 165 | `src/components/admin/winners/AdminRegisterWinnerModal.tsx` | `[ ]` |
| 166 | `src/components/admin/winners/AdminRegisterWinnerModal.module.css` | `[ ]` |

---

## LOTE 17 — Assets y documentación

| # | Archivo | Auditado |
|---|---------|----------|
| 167 | `src/assets/assets.ts` | `[ ]` |
| 168 | `src/assets/LEEME.md` | `[ ]` |
| 169 | `public/og-image.jpg` | `[ ]` |
| 170 | `public/og-image.png` | `[ ]` |
| 171 | `public/favicon.png` / `favicon-16x16.png` / `favicon-32x32.png` / `apple-touch-icon.png` | `[ ]` |
| 172 | `src/assets/imagenes/*` (90 archivos de imagen en 5 variantes) | `[ ]` |
| 173 | `src/assets/logos/*` (48 archivos de logo en 4 variantes) | `[ ]` |

---

## FASE 2 — Auditoría transversal (después de todos los lotes)
- `[ ]` Arquitectura general
- `[ ]` Consistencia entre capas (tipos ↔ SQL)
- `[ ]` Dependencias (package.json)
- `[ ]` Configuración global
- `[ ]` Pruebas
- `[ ]` Documentación
- `[ ]` Coherencia panel ↔ sitio público

## FASE 3 — Resumen final
- `[ ]` `docs/auditoria/RESUMEN_GENERAL.md`

---

## Leyenda de estados (para reportes)
- `[ ]` — pendiente
- `[/]` — en progreso
- `[x]` — auditado
- `[OK]` — sin hallazgos relevantes
- `[⚠]` — mejorable
- `[🐛]` — bugs encontrados
- `[💀]` — código muerto candidato a eliminar

