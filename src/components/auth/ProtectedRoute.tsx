import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/context/useAuth';
import { ShieldAlert, LogOut } from 'lucide-react';
import styles from './ProtectedRoute.module.css';

interface ProtectedRouteProps {
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isAdmin, isLoading, signOut } = useAuth();
  const location = useLocation();

  // 1. Estado de carga de autenticación y verificación de rol
  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} role="status" aria-label="Cargando..."></div>
        <p className={styles.loadingText}>Verificando permisos administrativos...</p>
      </div>
    );
  }

  // 2. Si no hay usuario autenticado en Supabase Auth, redirigir al login administrativo
  if (!user) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  // 3. Usuario autenticado pero NO autorizado como administrador activo
  if (!isAdmin) {
    return (
      <div className={styles.deniedContainer}>
        <div className={styles.deniedCard}>
          <div className={styles.iconWrapper}>
            <ShieldAlert size={36} />
          </div>
          <h1 className={styles.title}>Acceso Denegado</h1>
          <p className={styles.message}>
            Tu cuenta se encuentra autenticada, pero no cuenta con privilegios de administrador
            activos en la plataforma de Manaure Vive.
          </p>

          <div className={styles.userInfo}>
            <span>{user.email || user.id}</span>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.logoutButton} onClick={() => void signOut()}>
              <LogOut size={18} />
              <span>Cerrar Sesión</span>
            </button>
            <Link to="/" className={styles.homeLink}>
              Volver al Inicio Público
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 4. Usuario autenticado y con rol de administrador activo
  return <>{children}</>;
};
