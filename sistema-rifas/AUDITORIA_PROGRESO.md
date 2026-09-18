# AUDITORÍA PROGRESO — Manaure Vive (Sistema de Rifas)
> Última actualización: 2026-09-17 | Estado: AUDITORÍA 100% COMPLETADA (173/173 archivos auditados — Fases 1, 2 y 3 concluidas)

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
| 33 | `src/services/authService.ts` | `[x]` |
| 34 | `src/services/settingsService.ts` | `[x]` |
| 35 | `src/services/raffleService.ts` | `[x]` |
| 36 | `src/services/ticketService.ts` | `[x]` |
| 37 | `src/services/buyerService.ts` | `[x]` |
| 38 | `src/services/adminUserService.ts` | `[x]` |
| 39 | `src/services/partnerService.ts` | `[x]` |

---

## LOTE 5 — Servicios (parte 2 de 2)

| # | Archivo | Auditado |
|---|---------|----------|
| 40 | `src/services/paymentService.ts` | `[x]` |
| 41 | `src/services/emailService.ts` | `[x]` |
| 42 | `src/services/notificationService.ts` | `[x]` |
| 43 | `src/services/whatsappService.ts` | `[x]` |
| 44 | `src/services/winnerService.ts` | `[x]` |
| 45 | `src/services/receiptGeneratorService.ts` | `[x]` |

---

## LOTE 6 — Edge Functions de Supabase

| # | Archivo | Auditado |
|---|---------|----------|
| 46 | `supabase/functions/send-transactional-email/index.ts` | `[x]` |
| 47 | `supabase/functions/resend-webhook/index.ts` | `[x]` |
| 48 | `supabase/functions/cron-release-expired-reservations/index.ts` | `[x]` |
| 49 | `scripts/verify_db.mjs` | `[x]` |

---

## LOTE 7 — Migraciones SQL (parte 1: 001–014)

| # | Archivo | Auditado |
|---|---------|----------|
| 50 | `supabase/migrations/001_initial_schema.sql` | `[x]` |
| 51 | `supabase/migrations/002_admin_auth.sql` | `[x]` |
| 52 | `supabase/migrations/003_manual_payment_flow.sql` | `[x]` |
| 53 | `supabase/migrations/004_normalize_order_ticket_state_machine.sql` | `[x]` |
| 54 | `supabase/migrations/005_payment_accounts_management.sql` | `[x]` |
| 55 | `supabase/migrations/006_payment_proofs_storage_flow.sql` | `[x]` |
| 56 | `supabase/migrations/007_transactional_notification_logs.sql` | `[x]` |
| 57 | `supabase/migrations/008_order_contact_preference.sql` | `[x]` |
| 58 | `supabase/migrations/009_notification_traceability.sql` | `[x]` |
| 59 | `supabase/migrations/010_admin_ticket_management.sql` | `[x]` |
| 60 | `supabase/migrations/011_cron_release_expired_reservations.sql` | `[x]` |
| 61 | `supabase/migrations/012_create_order_secure.sql` | `[x]` |
| 62 | `supabase/migrations/013_restrict_orders_select_and_public_verification_rpc.sql` | `[x]` |
| 63 | `supabase/migrations/014_harden_admin_payment_rpcs.sql` | `[x]` |

---

## LOTE 8 — Migraciones SQL (parte 2: 015–027 + monolito)

| # | Archivo | Auditado |
|---|---------|----------|
| 64 | `supabase/migrations/015_harden_payment_proofs_storage.sql` | `[x]` |
| 65 | `supabase/migrations/016_preserve_buyer_data_on_order_creation.sql` | `[x]` |
| 66 | `supabase/migrations/017_fix_admin_users_rls_recursion.sql` | `[x]` |
| 67 | `supabase/migrations/018_enable_supabase_realtime.sql` | `[x]` |
| 68 | `supabase/migrations/019_admin_buyer_management.sql` | `[x]` |
| 69 | `supabase/migrations/020_admin_raffle_management.sql` | `[x]` |
| 70 | `supabase/migrations/021_winners_management.sql` | `[x]` |
| 71 | `supabase/migrations/022_system_settings_management.sql` | `[x]` |
| 72 | `supabase/migrations/023_security_hardening_linter_fixes.sql` | `[x]` |
| 73 | `supabase/migrations/024_admin_users_management.sql` | `[x]` |
| 74 | `supabase/migrations/025_partners_management.sql` | `[x]` |
| 75 | `supabase/migrations/026_dashboard_kpis_rpc.sql` | `[x]` |
| 76 | `supabase/migrations/027_dashboard_kpis_robust_filter.sql` | `[x]` |
| 77 | `supabase/migrations/EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql` | `[x]` |

---

## LOTE 9 — Componentes comunes y layout público

| # | Archivo | Auditado |
|---|---------|----------|
| 78 | `src/components/common/ErrorBoundary.tsx` | `[x]` |
| 79 | `src/components/common/FloatingWhatsAppBtn.tsx` | `[x]` |
| 80 | `src/components/common/FloatingWhatsAppBtn.module.css` | `[x]` |
| 81 | `src/components/common/PageLoadingFallback.tsx` | `[x]` |
| 82 | `src/components/common/ScrollToHashElement.tsx` | `[x]` |
| 83 | `src/components/common/ToastNotification.tsx` | `[x]` |
| 84 | `src/components/common/ToastNotification.module.css` | `[x]` |
| 85 | `src/components/layout/Footer.tsx` | `[x]` |
| 86 | `src/components/layout/Footer.module.css` | `[x]` |
| 87 | `src/components/layout/Navbar.tsx` | `[x]` |
| 88 | `src/components/layout/Navbar.module.css` | `[x]` |
| 89 | `src/components/auth/ProtectedRoute.tsx` | `[x]` |
| 90 | `src/components/auth/ProtectedRoute.module.css` | `[x]` |
| 91 | `src/styles/globals.css` | `[x]` |
| 92 | `src/styles/variables.css` | `[x]` |

---

## LOTE 10 — Páginas públicas

| # | Archivo | Auditado |
|---|---------|----------|
| 93 | `src/pages/HomePage.tsx` | `[x]` |
| 94 | `src/pages/AdminLoginPage.tsx` | `[x]` |
| 95 | `src/pages/AdminLoginPage.module.css` | `[x]` |
| 96 | `src/pages/TerminosPage.tsx` | `[x]` |
| 97 | `src/pages/TerminosPage.module.css` | `[x]` |
| 98 | `src/pages/VerificarPage.tsx` | `[x]` |
| 99 | `src/pages/VerificarPage.module.css` | `[x]` |

---

## LOTE 11 — Componentes landing (página principal pública)

| # | Archivo | Auditado |
|---|---------|----------|
| 100 | `src/components/landing/HeroRifa.tsx` | `[x]` |
| 101 | `src/components/landing/HeroRifa.module.css` | `[x]` |
| 102 | `src/components/landing/DetallePremio.tsx` | `[x]` |
| 103 | `src/components/landing/DetallePremio.module.css` | `[x]` |
| 104 | `src/components/landing/GaleriaPremio.tsx` | `[x]` |
| 105 | `src/components/landing/GaleriaPremio.module.css` | `[x]` |
| 106 | `src/components/landing/FilaAliados.tsx` | `[x]` |
| 107 | `src/components/landing/FilaAliados.module.css` | `[x]` |
| 108 | `src/components/landing/PreguntasFrecuentes.tsx` | `[x]` |
| 109 | `src/components/landing/PreguntasFrecuentes.module.css` | `[x]` |

---

## LOTE 12 — Componentes ticketing y checkout

| # | Archivo | Auditado |
|---|---------|----------|
| 110 | `src/components/ticketing/SelectorBoletos.tsx` | `[x]` |
| 111 | `src/components/ticketing/SelectorBoletos.module.css` | `[x]` |
| 112 | `src/components/ticketing/GanadorShowcase.tsx` | `[x]` |
| 113 | `src/components/ticketing/GanadorShowcase.module.css` | `[x]` |
| 114 | `src/components/checkout/ModalCheckout.tsx` | `[x]` |
| 115 | `src/components/checkout/ModalCheckout.module.css` | `[x]` |
| 116 | `src/components/receipt/DigitalReceiptModal.tsx` | `[x]` |
| 117 | `src/components/receipt/DigitalReceiptModal.module.css` | `[x]` |

---

## LOTE 13 — Panel admin: layout y componentes comunes

| # | Archivo | Auditado |
|---|---------|----------|
| 118 | `src/components/admin/layout/AdminLayout.tsx` | `[x]` |
| 119 | `src/components/admin/layout/AdminLayout.module.css` | `[x]` |
| 120 | `src/components/admin/layout/AdminHeader.tsx` | `[x]` |
| 121 | `src/components/admin/layout/AdminHeader.module.css` | `[x]` |
| 122 | `src/components/admin/layout/AdminSidebar.tsx` | `[x]` |
| 123 | `src/components/admin/layout/AdminSidebar.module.css` | `[x]` |
| 124 | `src/components/admin/layout/AdminBreadcrumbs.tsx` | `[x]` |
| 125 | `src/components/admin/layout/AdminBreadcrumbs.module.css` | `[x]` |
| 126 | `src/components/admin/common/AdminEmptyState.tsx` | `[x]` |
| 127 | `src/components/admin/common/AdminEmptyState.module.css` | `[x]` |
| 128 | `src/components/admin/common/AdminErrorState.tsx` | `[x]` |
| 129 | `src/components/admin/common/AdminErrorState.module.css` | `[x]` |
| 130 | `src/components/admin/common/AdminLoadingState.tsx` | `[x]` |
| 131 | `src/components/admin/common/AdminLoadingState.module.css` | `[x]` |
| 132 | `src/components/admin/common/AdminPageHeader.tsx` | `[x]` |
| 133 | `src/components/admin/common/AdminPageHeader.module.css` | `[x]` |

---

## LOTE 14 — Panel admin: vistas (parte 1)

| # | Archivo | Auditado |
|---|---------|----------|
| 134 | `src/pages/admin/views/AdminViews.module.css` | `[x]` |
| 135 | `src/pages/admin/views/DashboardView.tsx` | `[x]` |
| 136 | `src/pages/admin/views/OrdersView.tsx` | `[x]` |
| 137 | `src/pages/admin/views/TicketsView.tsx` | `[x]` |
| 138 | `src/pages/admin/views/BuyersView.tsx` | `[x]` |
| 139 | `src/pages/admin/views/BuyersView.module.css` | `[x]` |

---

## LOTE 15 — Panel admin: vistas (parte 2)

| # | Archivo | Auditado |
|---|---------|----------|
| 140 | `src/pages/admin/views/RafflesView.tsx` | `[x]` |
| 141 | `src/pages/admin/views/RafflesView.module.css` | `[x]` |
| 142 | `src/pages/admin/views/WinnersView.tsx` | `[x]` |
| 143 | `src/pages/admin/views/WinnersView.module.css` | `[x]` |
| 144 | `src/pages/admin/views/SettingsView.tsx` | `[x]` |
| 145 | `src/pages/admin/views/SettingsView.module.css` | `[x]` |
| 146 | `src/pages/admin/views/PaymentAccountsView.tsx` | `[x]` |
| 147 | `src/pages/admin/views/PartnersView.tsx` | `[x]` |
| 148 | `src/pages/admin/views/PartnersView.module.css` | `[x]` |
| 149 | `src/pages/admin/views/ReceiptsView.tsx` | `[x]` |
| 150 | `src/pages/admin/views/AuditView.tsx` | `[x]` |
| 151 | `src/pages/admin/views/AuditView.module.css` | `[x]` |

---

## LOTE 16 — Panel admin: modales y componentes específicos

| # | Archivo | Auditado |
|---|---------|----------|
| 152 | `src/components/admin/orders/AdminOrderReviewModal.tsx` | `[x]` |
| 153 | `src/components/admin/orders/AdminOrderReviewModal.module.css` | `[x]` |
| 154 | `src/components/admin/orders/AdminConfirmPaymentModal.tsx` | `[x]` |
| 155 | `src/components/admin/orders/AdminConfirmPaymentModal.module.css` | `[x]` |
| 156 | `src/components/admin/buyers/AdminBuyerOrdersModal.tsx` | `[x]` |
| 157 | `src/components/admin/buyers/AdminBuyerOrdersModal.module.css` | `[x]` |
| 158 | `src/components/admin/buyers/AdminEditBuyerModal.tsx` | `[x]` |
| 159 | `src/components/admin/buyers/AdminEditBuyerModal.module.css` | `[x]` |
| 160 | `src/components/admin/raffles/AdminCreateRaffleModal.tsx` | `[x]` |
| 161 | `src/components/admin/raffles/AdminEditRaffleModal.tsx` | `[x]` |
| 162 | `src/components/admin/raffles/AdminEditRaffleModal.module.css` | `[x]` |
| 163 | `src/components/admin/settings/AdminInviteUserModal.tsx` | `[x]` |
| 164 | `src/components/admin/settings/AdminInviteUserModal.module.css` | `[x]` |
| 165 | `src/components/admin/winners/AdminRegisterWinnerModal.tsx` | `[x]` |
| 166 | `src/components/admin/winners/AdminRegisterWinnerModal.module.css` | `[x]` |

---

## LOTE 17 — Assets y documentación

| # | Archivo | Auditado |
|---|---------|----------|
| 167 | `src/assets/assets.ts` | `[x]` |
| 168 | `src/assets/LEEME.md` | `[x]` |
| 169 | `public/og-image.jpg` | `[x]` |
| 170 | `public/og-image.png` | `[x]` |
| 171 | `public/favicon.png` / `favicon-16x16.png` / `favicon-32x32.png` / `apple-touch-icon.png` | `[x]` |
| 172 | `src/assets/imagenes/*` (90 archivos de imagen en 5 variantes) | `[x]` |
| 173 | `src/assets/logos/*` (48 archivos de logo en 4 variantes) | `[x]` |

---

## FASE 2 — Auditoría transversal (después de todos los lotes)
- `[x]` Arquitectura general
- `[x]` Consistencia entre capas (tipos ↔ SQL)
- `[x]` Dependencias (package.json)
- `[x]` Configuración global
- `[x]` Pruebas y resiliencia
- `[x]` Documentación
- `[x]` Coherencia panel ↔ sitio público

## FASE 3 — Resumen final
- `[x]` `docs/auditoria/RESUMEN_GENERAL.md`

---

## Leyenda de estados (para reportes)
- `[ ]` — pendiente
- `[/]` — en progreso
- `[x]` — auditado
- `[OK]` — sin hallazgos relevantes
- `[⚠]` — mejorable
- `[🐛]` — bugs encontrados
- `[💀]` — código muerto candidato a eliminar

