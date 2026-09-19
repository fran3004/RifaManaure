import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/context/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowLeft } from 'lucide-react';
import styles from './AdminLoginPage.module.css';

export const AdminLoginPage: React.FC = () => {
  useDocumentTitle('Acceso Administrativo Seguro');
  const { user, isAdmin, isLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Determinar ruta de redirección posterior al login
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/admin';

  // Si ya está autenticado y es admin activo, redirigir de inmediato al panel
  useEffect(() => {
    if (!isLoading && user && isAdmin) {
      navigate(from, { replace: true });
    }
  }, [user, isAdmin, isLoading, navigate, from]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Por favor ingresa tu correo y contraseña.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await signIn(email.trim(), password);

      if (!result.success) {
        setErrorMessage(result.error || 'No se pudo iniciar sesión.');
        setIsSubmitting(false);
        return;
      }

      // Redirigir al panel administrativo
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al intentar ingresar.';
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.loginCard}>
        <div className={styles.brandHeader}>
          <img
            src="/favicon.svg"
            alt="Logo oficial Manaure Vive"
            width={64}
            height={64}
            className={styles.logoBadgeImg}
          />
          <h1 className={styles.title}>Panel Administrativo</h1>
          <p className={styles.subtitle}>Manaure Vive • Acceso Restringido</p>
        </div>

        {errorMessage && (
          <div className={styles.errorAlert} role="alert">
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.formGroup}>
            <label htmlFor="admin-email" className={styles.label}>
              Correo Electrónico
            </label>
            <div className={styles.inputWrapper}>
              <Mail size={18} className={styles.inputIcon} />
              <input
                id="admin-email"
                type="email"
                className={styles.input}
                placeholder="admin@manaurevive.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="admin-password" className={styles.label}>
              Contraseña
            </label>
            <div className={styles.inputWrapper}>
              <Lock size={18} className={styles.inputIcon} />
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                className={`${styles.input} ${styles.inputWithToggle}`}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isSubmitting}
              />
              <button
                type="button"
                className={styles.togglePasswordBtn}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={isSubmitting || isLoading}>
            {isSubmitting ? (
              <>
                <div className={styles.spinnerSmall} />
                <span>Validando credenciales...</span>
              </>
            ) : (
              <span>Ingresar al Panel</span>
            )}
          </button>
        </form>

        <div className={styles.footerActions}>
          <Link to="/" className={styles.backLink}>
            <ArrowLeft size={16} />
            <span>Volver a la plataforma pública</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
