import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { SystemSettingsProvider } from '@/context/SystemSettingsContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { HomePage } from '@/pages/HomePage';
import { PageLoadingFallback } from '@/components/common/PageLoadingFallback';
import { ScrollToHashElement } from '@/components/common/ScrollToHashElement';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

// Carga perezosa con reintento resiliente de rutas públicas secundarias
const VerificarPage = lazyWithRetry(
  () => import('@/pages/VerificarPage').then((m) => ({ default: m.VerificarPage })),
  'VerificarPage'
);
const TerminosPage = lazyWithRetry(
  () => import('@/pages/TerminosPage').then((m) => ({ default: m.TerminosPage })),
  'TerminosPage'
);

// Carga perezosa con reintento resiliente de autenticación y módulo administrativo
const AdminRouteRoot = lazyWithRetry(
  () => import('@/components/admin/layout/AdminRouteRoot').then((m) => ({ default: m.AdminRouteRoot })),
  'AdminRouteRoot'
);
const AdminLoginPage = lazyWithRetry(
  () => import('@/pages/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage })),
  'AdminLoginPage'
);
const AdminSetPasswordPage = lazyWithRetry(
  () => import('@/pages/AdminSetPasswordPage').then((m) => ({ default: m.AdminSetPasswordPage })),
  'AdminSetPasswordPage'
);
const AdminLayout = lazyWithRetry(
  () => import('@/components/admin/layout/AdminLayout').then((m) => ({ default: m.AdminLayout })),
  'AdminLayout'
);

// Carga perezosa con reintento resiliente de sub-vistas del Panel Administrativo
const DashboardView = lazyWithRetry(
  () => import('@/pages/admin/views/DashboardView').then((m) => ({ default: m.DashboardView })),
  'DashboardView'
);
const OrdersView = lazyWithRetry(
  () => import('@/pages/admin/views/OrdersView').then((m) => ({ default: m.OrdersView })),
  'OrdersView'
);
const ReceiptsView = lazyWithRetry(
  () => import('@/pages/admin/views/ReceiptsView').then((m) => ({ default: m.ReceiptsView })),
  'ReceiptsView'
);
const TicketsView = lazyWithRetry(
  () => import('@/pages/admin/views/TicketsView').then((m) => ({ default: m.TicketsView })),
  'TicketsView'
);
const RafflesView = lazyWithRetry(
  () => import('@/pages/admin/views/RafflesView').then((m) => ({ default: m.RafflesView })),
  'RafflesView'
);
const PaymentAccountsView = lazyWithRetry(
  () => import('@/pages/admin/views/PaymentAccountsView').then((m) => ({ default: m.PaymentAccountsView })),
  'PaymentAccountsView'
);
const PrizeView = lazyWithRetry(
  () => import('@/pages/admin/views/PrizeView').then((m) => ({ default: m.PrizeView })),
  'PrizeView'
);
const GalleryView = lazyWithRetry(
  () => import('@/pages/admin/views/GalleryView').then((m) => ({ default: m.GalleryView })),
  'GalleryView'
);
const PartnersView = lazyWithRetry(
  () => import('@/pages/admin/views/PartnersView').then((m) => ({ default: m.PartnersView })),
  'PartnersView'
);
const WinnersView = lazyWithRetry(
  () => import('@/pages/admin/views/WinnersView').then((m) => ({ default: m.WinnersView })),
  'WinnersView'
);
const AuditView = lazyWithRetry(
  () => import('@/pages/admin/views/AuditView').then((m) => ({ default: m.AuditView })),
  'AuditView'
);
const BuyersView = lazyWithRetry(
  () => import('@/pages/admin/views/BuyersView').then((m) => ({ default: m.BuyersView })),
  'BuyersView'
);
const SettingsView = lazyWithRetry(
  () => import('@/pages/admin/views/SettingsView').then((m) => ({ default: m.SettingsView })),
  'SettingsView'
);

import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export const App: React.FC = () => {
  // Limpiar contadores de recarga si la aplicación permanece estable por 5 segundos
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        sessionStorage.removeItem('manaure_chunk_retry_count');
        sessionStorage.removeItem('manaure_chunk_reload_ts');
      } catch {
        // Ignorar entornos con almacenamiento restringido
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <BrowserRouter>
      <AuthProvider>
        <SystemSettingsProvider>
          <ScrollToHashElement />
          <ErrorBoundary>
            <Suspense fallback={<PageLoadingFallback />}>
              <Routes>
                {/* Rutas Públicas */}
                <Route path="/" element={<HomePage />} />
                <Route path="/verificar" element={<VerificarPage />} />
                <Route path="/terminos" element={<TerminosPage />} />

                {/* Subárbol Administrativo con theme-admin.css centralizado */}
                <Route path="/admin" element={<AdminRouteRoot />}>
                  <Route path="login" element={<AdminLoginPage />} />
                  <Route path="set-password" element={<AdminSetPasswordPage />} />
                  <Route
                    element={
                      <ProtectedRoute>
                        <AdminLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<DashboardView />} />
                    <Route path="dashboard" element={<Navigate to="/admin" replace />} />
                    <Route path="ordenes" element={<OrdersView />} />
                    <Route path="comprobantes" element={<ReceiptsView />} />
                    <Route path="tickets" element={<TicketsView />} />
                    <Route path="compradores" element={<BuyersView />} />
                    <Route path="rifas" element={<RafflesView />} />
                    <Route path="premio" element={<PrizeView />} />
                    <Route path="galeria" element={<GalleryView />} />
                    <Route
                      path="cuentas"
                      element={
                        <ProtectedRoute requireSuperAdmin>
                          <PaymentAccountsView />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="aliados"
                      element={
                        <ProtectedRoute requireSuperAdmin>
                          <PartnersView />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="ganadores" element={<WinnersView />} />
                    <Route path="auditoria" element={<AuditView />} />
                    <Route path="configuracion" element={<SettingsView />} />
                  </Route>
                </Route>

                {/* Redirección por defecto */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </SystemSettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
