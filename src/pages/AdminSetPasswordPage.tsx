import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  Shield,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Mail,
  Check,
} from 'lucide-react';
import styles from './AdminSetPasswordPage.module.css';

export const AdminSetPasswordPage: React.FC = () => {
  useDocumentTitle('Configurar Contraseña de Administrador');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // 1. Detectar sesión activa derivada del enlace de invitación de Supabase
  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (isMounted) {
          if (session?.user) {
            setUserEmail(session.user.email || null);
          }
          setIsLoadingSession(false);
        }
      } catch (err) {
        console.error('Error al verificar sesión de invitación:', err);
        if (isMounted) setIsLoadingSession(false);
      }
    };

    void checkSession();

    // Escuchar el evento de cambio de sesión (cuando Supabase procesa el hash del enlace de invitación)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        setUserEmail(session.user.email || null);
        setIsLoadingSession(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!password) {
      setErrorMessage('Por favor ingresa una contraseña.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('La contraseña debe tener al menos 8 caracteres para garantizar la seguridad.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden. Por favor verifícalas.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Actualizar la contraseña del usuario en Supabase Auth
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setErrorMessage(error.message || 'No fue posible actualizar la contraseña.');
        setIsSubmitting(false);
        return;
      }

      setIsSuccess(true);
      setIsSubmitting(false);

      // Redirigir al panel administrativo tras 2.5 segundos
      setTimeout(() => {
        navigate('/admin', { replace: true });
      }, 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al establecer la contraseña.';
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.pageContainer} data-theme="admin">
      <div className={styles.loginCard}>
        <div className={styles.brandHeader}>
          <div className={styles.logoBadge}>
            <Shield size={28} />
          </div>
          <h1 className={styles.title}>Activar Cuenta de Administrador</h1>
          <p className={styles.subtitle}>Crea tu contraseña oficial para acceder al panel</p>
          {userEmail && (
            <div className={styles.userEmailBadge}>
              <Mail size={13} />
              <span>{userEmail}</span>
            </div>
          )}
        </div>

        {isSuccess ? (
          <div className={styles.successCard}>
            <div className={styles.successIconBadge}>
              <CheckCircle2 size={36} />
            </div>
            <h2 className={styles.successTitle}>¡Contraseña Establecida!</h2>
            <p className={styles.successMessage}>
              Tu correo ha sido confirmado y tu cuenta de administrador se encuentra activa. Te
              estamos redirigiendo al panel administrativo...
            </p>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={() => navigate('/admin', { replace: true })}
            >
              <Check size={16} />
              <span>Ingresar al Panel Ahora</span>
            </button>
          </div>
        ) : (
          <>
            {errorMessage && (
              <div className={styles.errorAlert} role="alert">
                <AlertCircle size={18} />
                <span>{errorMessage}</span>
              </div>
            )}

            {!isLoadingSession && !userEmail && (
              <div className={styles.errorAlert} role="alert">
                <AlertCircle size={18} />
                <span>
                  No se detectó un enlace de invitación activo. Si ya creaste tu contraseña, por
                  favor inicia sesión en el portal administrativo.
                </span>
              </div>
            )}

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              <div className={styles.formGroup}>
                <label htmlFor="admin-new-password" className={styles.label}>
                  Nueva Contraseña
                </label>
                <div className={styles.inputWrapper}>
                  <Lock size={18} className={styles.inputIcon} />
                  <input
                    id="admin-new-password"
                    type={showPassword ? 'text' : 'password'}
                    className={`${styles.input} ${styles.inputWithToggle}`}
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    autoFocus
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
                <span className={styles.hint}>Usa al menos 8 caracteres combinando letras y números.</span>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="admin-confirm-password" className={styles.label}>
                  Confirmar Contraseña
                </label>
                <div className={styles.inputWrapper}>
                  <Lock size={18} className={styles.inputIcon} />
                  <input
                    id="admin-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    className={`${styles.input} ${styles.inputWithToggle}`}
                    placeholder="Repite la nueva contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={isSubmitting || (Boolean(!userEmail) && !password)}
              >
                {isSubmitting ? (
                  <>
                    <div className={styles.spinnerSmall} />
                    <span>Guardando contraseña...</span>
                  </>
                ) : (
                  <span>Guardar Contraseña y Acceder</span>
                )}
              </button>
            </form>
          </>
        )}

        <div className={styles.footerActions}>
          <Link to="/admin/login" className={styles.backLink}>
            <ArrowLeft size={16} />
            <span>Volver a iniciar sesión</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
