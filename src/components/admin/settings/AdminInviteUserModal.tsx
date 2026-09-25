import React, { useState } from 'react';
import {
  UserPlus,
  X,
  Mail,
  User,
  Shield,
  ShieldAlert,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { inviteAdminUser, type AdminUserItem } from '@/services/adminUserService';
import styles from './AdminInviteUserModal.module.css';

interface AdminInviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserInvited: (user: AdminUserItem) => void;
  currentUserRole?: 'superadmin' | 'admin' | 'auditor';
}

export const AdminInviteUserModal: React.FC<AdminInviteUserModalProps> = ({
  isOpen,
  onClose,
  onUserInvited,
  currentUserRole = 'admin',
}) => {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'superadmin' | 'admin' | 'auditor'>('admin');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Success state
  const [createdUser, setCreatedUser] = useState<AdminUserItem | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [userAlreadyExists, setUserAlreadyExists] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const isSuperadmin = currentUserRole === 'superadmin';

  const handleResetAndClose = () => {
    setEmail('');
    setFullName('');
    setRole('admin');
    setErrorMsg(null);
    setCreatedUser(null);
    setEmailSent(false);
    setUserAlreadyExists(false);
    setWarningMsg(null);
    setCopied(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('El correo electrónico es obligatorio.');
      return;
    }

    if (!isSuperadmin) {
      setErrorMsg('Acceso denegado: solo los superadministradores pueden invitar a nuevos administradores al sistema.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const targetRedirect = `${window.location.origin}/admin/set-password`;

    const res = await inviteAdminUser({
      email: email.trim(),
      role,
      fullName: fullName.trim() || undefined,
      redirectTo: targetRedirect,
    });

    setIsSubmitting(false);

    if (!res.success || !res.user) {
      setErrorMsg(res.error || 'No fue posible autorizar al nuevo administrador.');
      return;
    }

    setCreatedUser(res.user);
    setEmailSent(Boolean(res.emailSent));
    setUserAlreadyExists(Boolean(res.userAlreadyExists));
    setWarningMsg(res.warning || null);
    onUserInvited(res.user);
  };

  const loginUrl = `${window.location.origin}/admin/login`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      className={styles.modalOverlay}
      onClick={handleResetAndClose}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerTitleWrapper}>
            <div className={styles.headerIcon}>
              <UserPlus size={20} />
            </div>
            <div>
              <h3 className={styles.modalTitle}>
                {createdUser ? '¡Autorización Exitosa!' : 'Autorizar Nuevo Administrador'}
              </h3>
              <p className={styles.modalSubtitle}>
                {createdUser
                  ? emailSent
                    ? 'Se ha enviado un correo oficial de invitación con el enlace para crear la contraseña.'
                    : 'El usuario ha sido registrado en la lista oficial de administradores.'
                  : 'Pre-autoriza un correo oficial con su respectivo rol de acceso y privilegios.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleResetAndClose}
            title="Cerrar ventana"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        {createdUser ? (
          <div className={styles.modalBody}>
            <div className={styles.successCard}>
              <div className={styles.successIconBadge}>
                {emailSent ? <Mail size={32} /> : <CheckCircle2 size={32} />}
              </div>
              <h4 className={styles.successTitle}>
                {emailSent
                  ? '¡Invitación Enviada por Correo!'
                  : userAlreadyExists
                  ? 'Usuario con Cuenta Existente'
                  : 'Usuario Pre-autorizado'}
              </h4>
              <p className={styles.successMessage}>
                <strong>{createdUser.email}</strong> quedó registrado con rol{' '}
                <span className={styles.createdUserRole}>
                  {createdUser.role}
                </span>
                .{' '}
                {emailSent
                  ? 'Le enviamos un correo electrónico oficial con un enlace seguro para que confirme su correo y cree su propia contraseña de acceso.'
                  : userAlreadyExists
                  ? 'Este correo ya tiene una cuenta en el sistema. Ha sido habilitado con privilegios administrativos y puede ingresar con su contraseña actual.'
                  : 'Cuando inicie sesión con este correo en el portal administrativo, su cuenta se enlazará automáticamente.'}
              </p>

              {warningMsg && (
                <div className={styles.errorBanner} style={{ marginBottom: '1rem' }} role="alert">
                  <AlertCircle size={16} className={styles.errorBannerIcon} />
                  <span>{warningMsg}</span>
                </div>
              )}

              <div className={styles.accessLinkBox}>
                <span className={styles.accessLinkLabel}>
                  <ExternalLink size={12} className={styles.accessLinkIcon} />
                  Enlace de Ingreso para el Administrador
                </span>
                <div className={styles.linkRow}>
                  <input type="text" readOnly value={loginUrl} className={styles.linkInput} />
                  <button type="button" className={styles.copyBtn} onClick={handleCopyLink}>
                    {copied ? (
                      <>
                        <Check size={14} /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> Copiar Enlace
                      </>
                    )}
                  </button>
                </div>
                <p className={styles.successHint}>
                  {emailSent
                    ? 'El usuario podrá ingresar desde este enlace una vez active su contraseña desde el correo.'
                    : 'Comparte este enlace con el usuario para que configure o acceda con sus credenciales.'}
                </p>
              </div>
            </div>

            <div className={`${styles.modalFooter} ${styles.successModalFooter}`}>
              <button type="button" className={styles.btnSubmit} onClick={handleResetAndClose}>
                Entendido y Cerrar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className={styles.modalBody}>
              {errorMsg && (
                <div className={styles.errorBanner} role="alert">
                  <AlertCircle size={18} className={styles.errorBannerIcon} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Correo Electrónico */}
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="inviteEmail">
                  <Mail size={14} />
                  Correo Electrónico Oficial <span className={styles.requiredAsterisk}>*</span>
                </label>
                <input
                  id="inviteEmail"
                  type="email"
                  required
                  placeholder="ejemplo@manaurevive.com"
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>

              {/* Nombre Completo */}
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="inviteFullName">
                  <User size={14} />
                  Nombre Completo (Opcional)
                </label>
                <input
                  id="inviteFullName"
                  type="text"
                  placeholder="Ej: Laura Gómez"
                  className={styles.input}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              {/* Selector de Rol */}
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <Shield size={14} />
                  Rol y Nivel de Privilegios <span className={styles.requiredAsterisk}>*</span>
                </label>
                <div className={styles.roleSelector}>
                  {/* Auditor */}
                  <div
                    className={`${styles.roleOption} ${role === 'auditor' ? styles.roleOptionSelected : ''}`}
                    onClick={() => setRole('auditor')}
                    tabIndex={0}
                    role="button"
                  >
                    <Shield
                      size={18}
                      className={`${styles.roleIcon} ${role === 'auditor' ? styles.roleIconActive : ''}`}
                    />
                    <span className={styles.roleName}>Auditor</span>
                    <span className={styles.roleDesc}>Solo lectura para reportes y órdenes</span>
                  </div>

                  {/* Admin */}
                  <div
                    className={`${styles.roleOption} ${role === 'admin' ? styles.roleOptionSelected : ''}`}
                    onClick={() => setRole('admin')}
                    tabIndex={0}
                    role="button"
                  >
                    <Shield
                      size={18}
                      className={`${styles.roleIcon} ${role === 'admin' ? styles.roleIconActive : ''}`}
                    />
                    <span className={styles.roleName}>Admin</span>
                    <span className={styles.roleDesc}>Gestión de rifas, órdenes y pagos</span>
                  </div>

                  {/* Superadmin */}
                  <div
                    className={`${styles.roleOption} ${
                      role === 'superadmin' ? styles.roleOptionSelected : ''
                    } ${!isSuperadmin ? styles.roleOptionDisabled : ''}`}
                    onClick={() => {
                      if (isSuperadmin) {
                        setRole('superadmin');
                      }
                    }}
                    tabIndex={isSuperadmin ? 0 : -1}
                    role="button"
                    title={
                      !isSuperadmin
                        ? 'Solo un Superadministrador puede otorgar este rol'
                        : 'Acceso total y configuración'
                    }
                  >
                    <ShieldAlert
                      size={18}
                      className={`${styles.roleIcon} ${
                        role === 'superadmin' ? styles.roleIconSuperadminActive : ''
                      }`}
                    />
                    <span className={styles.roleName}>Superadmin</span>
                    <span className={styles.roleDesc}>
                      {isSuperadmin ? 'Control total y roles' : 'Requiere Superadmin'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={handleResetAndClose}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={styles.btnSubmit}
                disabled={isSubmitting || !email.trim()}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Autorizando...
                  </>
                ) : (
                  <>
                    <UserPlus size={16} />
                    Autorizar Acceso
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
