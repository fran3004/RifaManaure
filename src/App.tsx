import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { SystemSettingsProvider } from '@/context/SystemSettingsContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { HomePage } from '@/pages/HomePage';
import { PageLoadingFallback } from '@/components/common/PageLoadingFallback';
import { ScrollToHashElement } from '@/components/common/ScrollToHashElement';

// Carga perezosa (Code Splitting) de rutas públicas secundarias
const VerificarPage = lazy(() =>
  import('@/pages/VerificarPage').then((m) => ({ default: m.VerificarPage }))
);
const TerminosPage = lazy(() =>
  import('@/pages/TerminosPage').then((m) => ({ default: m.TerminosPage }))
);

// Carga perezosa de autenticación y módulo administrativo
const AdminRouteRoot = lazy(() =>
  import('@/components/admin/layout/AdminRouteRoot').then((m) => ({ default: m.AdminRouteRoot }))
);
const AdminLoginPage = lazy(() =>
  import('@/pages/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage }))
);
const AdminLayout = lazy(() =>
  import('@/components/admin/layout/AdminLayout').then((m) => ({ default: m.AdminLayout }))
);

// Carga perezosa de sub-vistas del Panel Administrativo
const DashboardView = lazy(() =>
  import('@/pages/admin/views/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const OrdersView = lazy(() =>
  import('@/pages/admin/views/OrdersView').then((m) => ({ default: m.OrdersView }))
);
const ReceiptsView = lazy(() =>
  import('@/pages/admin/views/ReceiptsView').then((m) => ({ default: m.ReceiptsView }))
);
const TicketsView = lazy(() =>
  import('@/pages/admin/views/TicketsView').then((m) => ({ default: m.TicketsView }))
);
const RafflesView = lazy(() =>
  import('@/pages/admin/views/RafflesView').then((m) => ({ default: m.RafflesView }))
);
const PaymentAccountsView = lazy(() =>
  import('@/pages/admin/views/PaymentAccountsView').then((m) => ({
    default: m.PaymentAccountsView,
  }))
);
const PrizeView = lazy(() =>
  import('@/pages/admin/views/PrizeView').then((m) => ({ default: m.PrizeView }))
);
const GalleryView = lazy(() =>
  import('@/pages/admin/views/GalleryView').then((m) => ({ default: m.GalleryView }))
);
const PartnersView = lazy(() =>
  import('@/pages/admin/views/PartnersView').then((m) => ({ default: m.PartnersView }))
);
const WinnersView = lazy(() =>
  import('@/pages/admin/views/WinnersView').then((m) => ({ default: m.WinnersView }))
);
const AuditView = lazy(() =>
  import('@/pages/admin/views/AuditView').then((m) => ({ default: m.AuditView }))
);
const BuyersView = lazy(() =>
  import('@/pages/admin/views/BuyersView').then((m) => ({ default: m.BuyersView }))
);
const SettingsView = lazy(() =>
  import('@/pages/admin/views/SettingsView').then((m) => ({ default: m.SettingsView }))
);

import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export const App: React.FC = () => {
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
                    <Route path="cuentas" element={<PaymentAccountsView />} />
                    <Route path="aliados" element={<PartnersView />} />
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
