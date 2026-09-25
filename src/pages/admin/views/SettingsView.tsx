import React, { useState, useEffect, useCallback } from 'react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminLoadingState } from '@/components/admin/common/AdminLoadingState';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import { useAuth } from '@/context/useAuth';
import { normalizeAppError, logAppError } from '@/lib/errorHandling';
import {
  Clock,
  MessageSquare,
  Shield,
  Users,
  Save,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  RotateCcw,
  ExternalLink,
  Plus,
  Minus,
  Sliders,
  PhoneCall,
  UserPlus,
  RefreshCw,
  UserCheck,
  UserX,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import { getSystemSettings, updateSystemSettingsAdmin } from '@/services/settingsService';
import {
  fetchAdminUsers,
  toggleAdminUserStatus,
  type AdminUserItem,
} from '@/services/adminUserService';
import { AdminInviteUserModal } from '@/components/admin/settings/AdminInviteUserModal';
import { AdminFaqManager } from '@/components/admin/settings/AdminFaqManager';
import { createWhatsAppLink, formatPhoneNumber } from '@/lib/utils';
import adminStyles from './AdminViews.module.css';
import styles from './SettingsView.module.css';

const RESERVATION_PRESETS = [5, 10, 15, 30, 60];
const TICKET_LIMIT_PRESETS = [5, 10, 20, 50, 100];

export const SettingsView: React.FC = () => {
  const { user, adminProfile } = useAuth();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Form State
  const [reservationDurationMinutes, setReservationDurationMinutes] = useState<number>(10);
  const [maxTicketsPerBuyer, setMaxTicketsPerBuyer] = useState<number>(20);
  const [supportWhatsappNumber, setSupportWhatsappNumber] = useState<string>('573001234567');
  const [supportEmail, setSupportEmail] = useState<string>('soporte@manaurevive.com');

  // Baseline comparison for dirty state
  const [initialSettings, setInitialSettings] = useState<{
    reservationDurationMinutes: number;
    maxTicketsPerBuyer: number;
    supportWhatsappNumber: string;
    supportEmail: string;
  }>({
    reservationDurationMinutes: 10,
    maxTicketsPerBuyer: 20,
    supportWhatsappNumber: '573001234567',
    supportEmail: 'soporte@manaurevive.com',
  });

  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getSystemSettings();
      setReservationDurationMinutes(data.reservation_duration_minutes);
      setMaxTicketsPerBuyer(data.max_tickets_per_buyer);
      setSupportWhatsappNumber(data.support_whatsapp_number || '');
      setSupportEmail(data.support_email || '');
      setInitialSettings({
        reservationDurationMinutes: data.reservation_duration_minutes,
        maxTicketsPerBuyer: data.max_tickets_per_buyer,
        supportWhatsappNumber: data.support_whatsapp_number || '',
        supportEmail: data.support_email || '',
      });
      setIsForbidden(false);
    } catch (err: unknown) {
      const normalized = normalizeAppError(
        err,
        'No fue posible cargar los parámetros de configuración'
      );
      logAppError('SettingsView.loadSettings', normalized);
      setError(normalized.userMessage);
      setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getSystemSettings();
        if (ignore) return;
        setReservationDurationMinutes(data.reservation_duration_minutes);
        setMaxTicketsPerBuyer(data.max_tickets_per_buyer);
        setSupportWhatsappNumber(data.support_whatsapp_number || '');
        setSupportEmail(data.support_email || '');
        setInitialSettings({
          reservationDurationMinutes: data.reservation_duration_minutes,
          maxTicketsPerBuyer: data.max_tickets_per_buyer,
          supportWhatsappNumber: data.support_whatsapp_number || '',
          supportEmail: data.support_email || '',
        });
        setIsForbidden(false);
      } catch (err: unknown) {
        if (!ignore) {
          const normalized = normalizeAppError(
            err,
            'No fue posible cargar los parámetros de configuración'
          );
          logAppError('SettingsView.init', normalized);
          setError(normalized.userMessage);
          setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void init();
    return () => {
      ignore = true;
    };
  }, []);

  const hasUnsavedChanges =
    reservationDurationMinutes !== initialSettings.reservationDurationMinutes ||
    maxTicketsPerBuyer !== initialSettings.maxTicketsPerBuyer ||
    supportWhatsappNumber.trim() !== initialSettings.supportWhatsappNumber.trim() ||
    supportEmail.trim().toLowerCase() !== initialSettings.supportEmail.trim().toLowerCase();

  const handleSave = useCallback(async () => {
    setNotification(null);

    // Validaciones preventivas en cliente
    if (reservationDurationMinutes < 1 || reservationDurationMinutes > 120) {
      setNotification({
        type: 'error',
        message: 'El tiempo de reserva debe estar entre 1 y 120 minutos.',
      });
      return;
    }

    if (maxTicketsPerBuyer < 1 || maxTicketsPerBuyer > 1000) {
      setNotification({
        type: 'error',
        message: 'El límite de boletos por comprador debe estar entre 1 y 1.000 boletos.',
      });
      return;
    }

    if (supportEmail && !supportEmail.includes('@')) {
      setNotification({
        type: 'error',
        message: 'Ingresa una dirección de correo electrónico válida.',
      });
      return;
    }

    setIsSaving(true);
    const result = await updateSystemSettingsAdmin({
      reservationDurationMinutes,
      maxTicketsPerBuyer,
      supportWhatsappNumber: supportWhatsappNumber.trim(),
      supportEmail: supportEmail.trim(),
    });
    setIsSaving(false);

    if (result.success && result.settings) {
      setNotification({
        type: 'success',
        message:
          result.message || 'Parámetros del sistema guardados y sincronizados con toda la web.',
      });
      setInitialSettings({
        reservationDurationMinutes: result.settings.reservation_duration_minutes,
        maxTicketsPerBuyer: result.settings.max_tickets_per_buyer,
        supportWhatsappNumber: result.settings.support_whatsapp_number || '',
        supportEmail: result.settings.support_email || '',
      });
    } else {
      const normalized = normalizeAppError(
        { message: result.error },
        'Ocurrió un error al persistir los cambios.'
      );
      logAppError('SettingsView.handleSave', normalized);
      setNotification({
        type: 'error',
        message: normalized.userMessage,
      });
    }
  }, [reservationDurationMinutes, maxTicketsPerBuyer, supportWhatsappNumber, supportEmail]);

  // Atajo de teclado global Ctrl+S / Cmd+S para guardar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!isSaving && !isLoading) {
          void handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, isSaving, isLoading]);

  const handleDiscard = () => {
    setReservationDurationMinutes(initialSettings.reservationDurationMinutes);
    setMaxTicketsPerBuyer(initialSettings.maxTicketsPerBuyer);
    setSupportWhatsappNumber(initialSettings.supportWhatsappNumber);
    setSupportEmail(initialSettings.supportEmail);
    setNotification({
      type: 'info',
      message: 'Se han descartado las modificaciones no guardadas.',
    });
  };

  // --- Estado para Administradores Autorizados ---
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(true);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState<boolean>(false);
  const [confirmToggleUser, setConfirmToggleUser] = useState<{
    userItem: AdminUserItem;
    targetState: boolean;
  } | null>(null);

  const isSuperAdmin = adminProfile?.role === 'superadmin';

  const loadAdminUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const res = await fetchAdminUsers();
      if (res.success && res.users) {
        setAdminUsers(res.users);
      } else if (res.error) {
        console.warn('Advertencia al consultar usuarios administradores:', res.error);
      }
    } catch (err) {
      console.error('Error al consultar usuarios administradores:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function fetchInitialUsers() {
      try {
        const res = await fetchAdminUsers();
        if (ignore) return;
        if (res.success && res.users) {
          setAdminUsers(res.users);
        } else if (res.error) {
          console.warn('Advertencia al cargar usuarios iniciales:', res.error);
        }
      } catch (err) {
        if (!ignore) {
          console.error('Error al cargar usuarios iniciales:', err);
        }
      } finally {
        if (!ignore) {
          setIsLoadingUsers(false);
        }
      }
    }

    void fetchInitialUsers();
    return () => {
      ignore = true;
    };
  }, []);

  const handleOpenToggleModal = (userItem: AdminUserItem) => {
    // 1. REGLA ESTRICTA: Solo un superadministrador puede modificar estados
    if (!isSuperAdmin) {
      setNotification({
        type: 'error',
        message: 'Acceso denegado: solo un superadministrador activo puede modificar el estado de un administrador.',
      });
      return;
    }

    // 2. REGLA CRÍTICA: Impedir autodesactivación en frontend
    const isSelf =
      (Boolean(user?.id) && userItem.user_id === user?.id) ||
      (Boolean(user?.email) && userItem.email.toLowerCase() === user?.email?.toLowerCase());

    if (isSelf) {
      setNotification({
        type: 'error',
        message: 'Regla de seguridad: No puedes desactivar tu propia cuenta de administrador.',
      });
      return;
    }

    setConfirmToggleUser({
      userItem,
      targetState: !userItem.is_active,
    });
  };

  const handleExecuteToggleUserStatus = async () => {
    if (!confirmToggleUser) return;
    const { userItem, targetState } = confirmToggleUser;
    const actionLabel = targetState ? 'activar' : 'desactivar';

    setTogglingUserId(userItem.id);
    try {
      const res = await toggleAdminUserStatus(userItem.id, targetState);
      if (res.success) {
        setAdminUsers((prev) =>
          prev.map((u) => (u.id === userItem.id ? { ...u, is_active: targetState } : u))
        );
        setNotification({
          type: 'success',
          message:
            res.message ||
            `Acceso para ${userItem.email} ${targetState ? 'activado' : 'desactivado'} correctamente.`,
        });
        setConfirmToggleUser(null);
      } else {
        setNotification({
          type: 'error',
          message: res.error || `No fue posible ${actionLabel} al usuario.`,
        });
      }
    } catch (err) {
      setNotification({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Error de comunicación al actualizar estado del usuario.',
      });
    } finally {
      setTogglingUserId(null);
    }
  };

  const whatsappTestUrl = createWhatsAppLink(
    supportWhatsappNumber || '573001234567',
    'Hola Manaure Vive, esta es una prueba de conectividad de WhatsApp configurada desde el panel administrativo.'
  );

  return (
    <div className={adminStyles.viewContainer}>
      <AdminPageHeader
        title="Configuración del Sistema"
        description="Ajuste de parámetros operativos, límites de retención y canales oficiales de atención conectados en vivo con toda la plataforma."
        actions={
          <div className={styles.headerActions}>
            {hasUnsavedChanges && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleDiscard}
                disabled={isSaving || isLoading}
                title="Descartar cambios y volver a los valores guardados"
              >
                <RotateCcw size={15} />
                <span>Descartar</span>
              </button>
            )}

            <button
              type="button"
              className={adminStyles.btnPrimary}
              onClick={() => void handleSave()}
              disabled={isSaving || isLoading}
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Guardar Cambios</span>
                  <span className={styles.keyboardShortcutBadge}>Ctrl+S</span>
                </>
              )}
            </button>
          </div>
        }
      />

      <div className={styles.settingsContainer}>
        {/* Banner de Notificación */}
        {notification && (
          <div
            className={`${styles.alertBanner} ${
              notification.type === 'success'
                ? styles.alertSuccess
                : notification.type === 'error'
                  ? styles.alertError
                  : styles.alertInfo
            }`}
          >
            <div className={styles.alertContent}>
              {notification.type === 'success' ? (
                <CheckCircle2 size={18} />
              ) : notification.type === 'error' ? (
                <AlertCircle size={18} />
              ) : (
                <RotateCcw size={18} />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              type="button"
              className={styles.alertCloseBtn}
              onClick={() => setNotification(null)}
              aria-label="Cerrar notificación"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className={adminStyles.cardSection}>
            <AdminLoadingState message="Cargando configuración del sistema..." />
          </div>
        ) : error ? (
          <div className={adminStyles.cardSection}>
            <AdminErrorState
              title={isForbidden ? 'Acceso Restringido' : 'Error al cargar configuración'}
              message={error}
              isForbidden={isForbidden}
              onRetry={() => void loadSettings()}
            />
          </div>
        ) : (
          <>
            {/* ========================================================================= */}
            {/* SECCIÓN 1: PARÁMETROS OPERATIVOS DE VENTA Y RESERVA (2 COLUMNAS BALANCEADAS) */}
            {/* ========================================================================= */}
            <div className={styles.sectionBlock}>
              <div className={styles.sectionBlockHeader}>
                <h3 className={styles.sectionTitle}>
                  <Sliders size={18} className={styles.titleSuccessIcon} />
                  Parámetros Operativos de Venta y Reserva
                </h3>
                <p className={styles.sectionSubtitle}>
                  Controlan la dinámica de selección de boletos en la cuadrícula y el cronómetro de
                  proceso de compra.
                </p>
              </div>

              <div className={styles.twoColumnGrid}>
                {/* Card 1: Tiempo de Reserva */}
                <div className={styles.settingCard}>
                  <div className={styles.cardTop}>
                    <div className={styles.cardIconWrapper}>
                      <Clock size={20} />
                    </div>
                    <span className={styles.cardBadge}>Dinámico</span>
                  </div>

                  <div className={styles.cardContent}>
                    <h4 className={styles.cardLabel}>Tiempo de Reserva Temporal</h4>
                    <p className={styles.cardDescription}>
                      Plazo en minutos que tiene el comprador para realizar el pago y subir el
                      comprobante antes de liberar los boletos reservados.
                    </p>

                    <div className={styles.controlsArea}>
                      {/* Stepper + Input */}
                      <div className={styles.stepperWrapper}>
                        <button
                          type="button"
                          className={styles.stepperBtn}
                          onClick={() =>
                            setReservationDurationMinutes((prev) => Math.max(1, prev - 1))
                          }
                          disabled={isLoading || isSaving || reservationDurationMinutes <= 1}
                          title="Disminuir 1 minuto"
                        >
                          <Minus size={16} />
                        </button>

                        <div className={styles.inputWrapper}>
                          <input
                            id="inputReservationMinutes"
                            type="number"
                            min={1}
                            max={120}
                            className={`${styles.textInput} ${styles.textInputWithSuffix}`}
                            value={reservationDurationMinutes}
                            onChange={(e) =>
                              setReservationDurationMinutes(
                                Math.max(1, Math.min(120, Number(e.target.value) || 1))
                              )
                            }
                            disabled={isLoading || isSaving}
                          />
                          <span className={styles.inputSuffix}>Minutos</span>
                        </div>

                        <button
                          type="button"
                          className={styles.stepperBtn}
                          onClick={() =>
                            setReservationDurationMinutes((prev) => Math.min(120, prev + 1))
                          }
                          disabled={isLoading || isSaving || reservationDurationMinutes >= 120}
                          title="Aumentar 1 minuto"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      {/* Preset Quick Chips */}
                      <div className={styles.presetChipsRow}>
                        <span className={styles.presetChipLabel}>Atajos:</span>
                        {RESERVATION_PRESETS.map((minutes) => (
                          <button
                            key={minutes}
                            type="button"
                            className={`${styles.presetChip} ${
                              reservationDurationMinutes === minutes ? styles.presetChipActive : ''
                            }`}
                            onClick={() => setReservationDurationMinutes(minutes)}
                            disabled={isLoading || isSaving}
                          >
                            {minutes} min
                          </button>
                        ))}
                      </div>

                      <span className={styles.cardHint}>
                        ⚡ Equivale a <strong>{reservationDurationMinutes * 60} segundos</strong> en
                        el tiempo disponible para completar la compra.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 2: Límite por Comprador */}
                <div className={styles.settingCard}>
                  <div className={styles.cardTop}>
                    <div className={`${styles.cardIconWrapper} ${styles.cardIconInfo}`}>
                      <Users size={20} />
                    </div>
                    <span className={styles.cardBadge}>Control Anti-Acaparamiento</span>
                  </div>

                  <div className={styles.cardContent}>
                    <h4 className={styles.cardLabel}>Límite Máximo por Comprador</h4>
                    <p className={styles.cardDescription}>
                      Número máximo de boletos permitidos por orden y cédula de ciudadanía en la
                      cuadrícula de compra.
                    </p>

                    <div className={styles.controlsArea}>
                      {/* Stepper + Input */}
                      <div className={styles.stepperWrapper}>
                        <button
                          type="button"
                          className={styles.stepperBtn}
                          onClick={() => setMaxTicketsPerBuyer((prev) => Math.max(1, prev - 5))}
                          disabled={isLoading || isSaving || maxTicketsPerBuyer <= 1}
                          title="Disminuir 5 boletos"
                        >
                          <Minus size={16} />
                        </button>

                        <div className={styles.inputWrapper}>
                          <input
                            id="inputMaxTickets"
                            type="number"
                            min={1}
                            max={1000}
                            className={`${styles.textInput} ${styles.textInputWithSuffix}`}
                            value={maxTicketsPerBuyer}
                            onChange={(e) =>
                              setMaxTicketsPerBuyer(
                                Math.max(1, Math.min(1000, Number(e.target.value) || 1))
                              )
                            }
                            disabled={isLoading || isSaving}
                          />
                          <span className={styles.inputSuffix}>Boletos</span>
                        </div>

                        <button
                          type="button"
                          className={styles.stepperBtn}
                          onClick={() => setMaxTicketsPerBuyer((prev) => Math.min(1000, prev + 5))}
                          disabled={isLoading || isSaving || maxTicketsPerBuyer >= 1000}
                          title="Aumentar 5 boletos"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      {/* Preset Quick Chips */}
                      <div className={styles.presetChipsRow}>
                        <span className={styles.presetChipLabel}>Atajos:</span>
                        {TICKET_LIMIT_PRESETS.map((limit) => (
                          <button
                            key={limit}
                            type="button"
                            className={`${styles.presetChip} ${
                              maxTicketsPerBuyer === limit ? styles.presetChipActive : ''
                            }`}
                            onClick={() => setMaxTicketsPerBuyer(limit)}
                            disabled={isLoading || isSaving}
                          >
                            {limit} boletos
                          </button>
                        ))}
                      </div>

                      <span className={styles.cardHint}>
                        🛡️ Protege la rifa y garantiza equidad en la compra para todos los
                        participantes.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* SECCIÓN 2: CANALES OFICIALES DE ATENCIÓN Y CONTACTO (2 COLUMNAS BALANCEADAS) */}
            {/* ========================================================================= */}
            <div className={styles.sectionBlock}>
              <div className={styles.sectionBlockHeader}>
                <h3 className={styles.sectionTitle}>
                  <PhoneCall size={18} className={styles.titleSuccessIcon} />
                  Canales Oficiales de Atención al Comprador y Soporte
                </h3>
                <p className={styles.sectionSubtitle}>
                  Estos datos se actualizan en vivo en el botón flotante de WhatsApp, pie de página,
                  órdenes y recibos digitales.
                </p>
              </div>

              <div className={styles.twoColumnGrid}>
                {/* Card 3: WhatsApp Oficial */}
                <div className={styles.settingCard}>
                  <div className={styles.cardTop}>
                    <div className={styles.cardIconWrapper}>
                      <MessageSquare size={20} />
                    </div>
                    <span className={styles.cardBadge}>Línea Directa</span>
                  </div>

                  <div className={styles.cardContent}>
                    <h4 className={styles.cardLabel}>Línea WhatsApp Oficial</h4>
                    <p className={styles.cardDescription}>
                      Número de contacto con código de país (ej: 573001234567) para recepción de
                      comprobantes y consultas de participantes.
                    </p>

                    <div className={styles.controlsArea}>
                      <div className={styles.inputWrapper}>
                        <input
                          id="inputWhatsapp"
                          type="text"
                          placeholder="Ej: 573001234567"
                          className={styles.textInput}
                          value={supportWhatsappNumber}
                          onChange={(e) => setSupportWhatsappNumber(e.target.value)}
                          disabled={isLoading || isSaving}
                        />
                      </div>

                      {/* Vista Previa y Prueba Inmediata */}
                      <div className={styles.previewAndTestBox}>
                        <div className={styles.previewText}>
                          <span>Formato en web:</span>
                          <strong className={styles.previewStrong}>
                            {formatPhoneNumber(supportWhatsappNumber) || 'No configurado'}
                          </strong>
                        </div>

                        <a
                          href={whatsappTestUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.testLinkBtn}
                          title="Probar enlace de WhatsApp en una pestaña nueva"
                        >
                          <ExternalLink size={13} />
                          <span>Probar Enlace WhatsApp</span>
                        </a>
                      </div>

                      <span className={styles.cardHint}>
                        📱 Conectado directamente al botón flotante de la página principal y
                        consultas en /verificar.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 4: Correo Electrónico Institucional */}
                <div className={styles.settingCard}>
                  <div className={styles.cardTop}>
                    <div className={`${styles.cardIconWrapper} ${styles.cardIconWarning}`}>
                      <Mail size={20} />
                    </div>
                    <span className={styles.cardBadge}>Correo Institucional</span>
                  </div>

                  <div className={styles.cardContent}>
                    <h4 className={styles.cardLabel}>Correo Electrónico de Soporte</h4>
                    <p className={styles.cardDescription}>
                      Dirección oficial para soporte formal, notificaciones transaccionales y
                      requerimientos legales.
                    </p>

                    <div className={styles.controlsArea}>
                      <div className={styles.inputWrapper}>
                        <input
                          id="inputSupportEmail"
                          type="email"
                          placeholder="soporte@manaurevive.com"
                          className={styles.textInput}
                          value={supportEmail}
                          onChange={(e) => setSupportEmail(e.target.value)}
                          disabled={isLoading || isSaving}
                        />
                      </div>

                      {/* Vista Previa y Prueba Inmediata */}
                      <div className={styles.previewAndTestBox}>
                        <div className={styles.previewText}>
                          <span>Enlace mailto:</span>
                          <strong className={styles.previewStrong}>
                            {supportEmail || 'No configurado'}
                          </strong>
                        </div>

                        <a
                          href={`mailto:${supportEmail}?subject=${encodeURIComponent(
                            'Prueba de Conectividad - Soporte Manaure Vive'
                          )}`}
                          className={styles.testLinkBtn}
                          title="Abrir cliente de correo para probar el enlace"
                        >
                          <Mail size={13} />
                          <span>Probar Mailto</span>
                        </a>
                      </div>

                      <span className={styles.cardHint}>
                        ✉️ Visible en el pie de página de toda la plataforma y comprobantes
                        descargables.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* SECCIÓN 3: CONTROL DE ACCESOS Y GESTIÓN DE ADMINISTRADORES */}
            {/* ========================================================================= */}
            <div className={adminStyles.cardSection}>
              <div className={styles.adminsSectionHeader}>
                <div>
                  <h3 className={`${adminStyles.sectionTitle} ${styles.adminsSectionTitle}`}>
                    <Shield size={20} className={styles.titleSuccessIcon} />
                    Administradores Autorizados
                  </h3>
                  <p className={styles.adminsSectionSubtitle}>
                    Usuarios pre-autorizados con acceso al panel administrativo y control granular
                    de roles.
                  </p>
                </div>

                <div className={styles.usersHeaderGroup}>
                  <button
                    type="button"
                    className={styles.refreshUsersBtn}
                    onClick={() => void loadAdminUsers()}
                    disabled={isLoadingUsers}
                    title="Actualizar lista de administradores"
                    aria-label="Actualizar lista"
                  >
                    <RefreshCw size={15} className={isLoadingUsers ? 'animate-spin' : ''} />
                  </button>

                  {adminProfile?.role === 'superadmin' && (
                    <button
                      type="button"
                      className={styles.inviteUserBtn}
                      onClick={() => setIsInviteModalOpen(true)}
                    >
                      <UserPlus size={16} />
                      <span>Invitar Administrador</span>
                    </button>
                  )}
                </div>
              </div>

              <div className={adminStyles.tableWrapper}>
                <table className={adminStyles.table}>
                  <thead>
                    <tr>
                      <th>Administrador</th>
                      <th>Rol</th>
                      <th>Cuenta Auth</th>
                      <th>Estado Acceso</th>
                      <th>Fecha de Alta</th>
                      <th className={styles.thRight}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingUsers && adminUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className={styles.tableStatusCell}>
                          <Loader2
                            size={24}
                            className={`animate-spin ${styles.tableStatusSpinner}`}
                          />
                          <span className={styles.tableStatusText}>
                            Cargando administradores autorizados desde la base de datos...
                          </span>
                        </td>
                      </tr>
                    ) : adminUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className={styles.tableEmptyCell}>
                          No se encontraron administradores registrados en la base de datos.
                        </td>
                      </tr>
                    ) : (
                      adminUsers.map((item) => {
                        const isSelf =
                          (Boolean(user?.id) && item.user_id === user?.id) ||
                          (Boolean(user?.email) &&
                            item.email.toLowerCase() === user?.email?.toLowerCase());
                        const isToggling = togglingUserId === item.id;

                        return (
                          <tr key={item.id} className={isSelf ? styles.userRowSelf : undefined}>
                            {/* Nombre y Correo */}
                            <td>
                              <div className={styles.userNameCell}>
                                <div className={styles.userName}>
                                  <span>{item.full_name || 'Sin nombre registrado'}</span>
                                  {isSelf && <span className={styles.selfBadge}>Tú</span>}
                                </div>
                                <span className={styles.userEmail}>{item.email}</span>
                              </div>
                            </td>

                            {/* Rol */}
                            <td>
                              {item.role === 'superadmin' ? (
                                <span className={styles.roleBadgeSuperadmin}>Administrador principal</span>
                              ) : item.role === 'auditor' ? (
                                <span className={styles.roleBadgeAuditor}>Auditor</span>
                              ) : (
                                <span className={styles.roleBadgeAdmin}>Administrador</span>
                              )}
                            </td>

                            {/* Estado Vinculación Auth */}
                            <td>
                              {item.has_auth_account ? (
                                <span
                                  className={styles.authBadgeLinked}
                                  title="Cuenta vinculada con credenciales activas"
                                >
                                  <CheckCircle2 size={14} /> Vinculado
                                </span>
                              ) : (
                                <span
                                  className={styles.authBadgePending}
                                  title="El usuario aún no ha iniciado sesión con este correo"
                                >
                                  <Clock size={14} /> Pendiente
                                </span>
                              )}
                            </td>

                            {/* Estado Operativo */}
                            <td>
                              {item.is_active ? (
                                <span className={adminStyles.badgeSuccess}>Activo</span>
                              ) : (
                                <span className={adminStyles.badgeDanger}>Inactivo</span>
                              )}
                            </td>

                            {/* Fecha Alta */}
                            <td className={styles.dateCell}>
                              {item.created_at
                                ? new Date(item.created_at).toLocaleDateString('es-CO', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })
                                : '—'}
                            </td>

                            {/* Botón Switch Acción */}
                            <td className={styles.tdRight}>
                              {isSelf ? (
                                <button
                                  type="button"
                                  className={`${styles.statusToggleBtn} ${styles.statusToggleDisabled}`}
                                  disabled
                                  title="No puedes desactivar tu propia cuenta activa"
                                >
                                  <UserCheck size={13} />
                                  <span>Tu Cuenta</span>
                                </button>
                              ) : isSuperAdmin ? (
                                <button
                                  type="button"
                                  className={`${styles.statusToggleBtn} ${
                                    item.is_active
                                      ? styles.statusToggleActive
                                      : styles.statusToggleInactive
                                  }`}
                                  onClick={() => handleOpenToggleModal(item)}
                                  disabled={isToggling}
                                  title={
                                    item.is_active
                                      ? 'Clic para suspender acceso a este administrador'
                                      : 'Clic para habilitar acceso a este administrador'
                                  }
                                >
                                  {isToggling ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : item.is_active ? (
                                    <UserCheck size={13} />
                                  ) : (
                                    <UserX size={13} />
                                  )}
                                  <span>{item.is_active ? 'Desactivar' : 'Activar'}</span>
                                </button>
                              ) : (
                                <span
                                  className={styles.readonlyAction}
                                  title="Solo los superadministradores pueden modificar el estado de otros administradores"
                                >
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* SECCIÓN 4: PREGUNTAS FRECUENTES (FAQ) DEL PORTAL PÚBLICO */}
            {/* ========================================================================= */}
            <AdminFaqManager />
          </>
        )}

        {/* Modal de Invitación y Pre-autorización */}
        <AdminInviteUserModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          currentUserRole={adminProfile?.role}
          onUserInvited={(newUser) => {
            setAdminUsers((prev) => {
              const exists = prev.some((u) => u.id === newUser.id);
              if (exists) {
                return prev.map((u) => (u.id === newUser.id ? newUser : u));
              }
              return [newUser, ...prev];
            });
            setNotification({
              type: 'success',
              message: `Administrador "${newUser.email}" pre-autorizado exitosamente.`,
            });
          }}
        />

        {/* Modal de Confirmación para Suspender / Reactivar Acceso */}
        {confirmToggleUser && (
          <div
            className={adminStyles.adminModalBackdrop}
            onClick={() => !togglingUserId && setConfirmToggleUser(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className={`${adminStyles.adminModalCard} ${adminStyles.narrowModalCard}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={
                  confirmToggleUser.targetState
                    ? adminStyles.successModalHeader
                    : adminStyles.dangerModalHeader
                }
              >
                <div
                  className={
                    confirmToggleUser.targetState
                      ? adminStyles.successModalIcon
                      : adminStyles.dangerModalIcon
                  }
                >
                  {confirmToggleUser.targetState ? (
                    <UserCheck size={22} />
                  ) : (
                    <AlertTriangle size={22} />
                  )}
                </div>
                <div>
                  <h3 className={adminStyles.modalTitle} style={{ margin: 0 }}>
                    {confirmToggleUser.targetState
                      ? 'Reactivar Acceso Administrativo'
                      : 'Suspender Acceso Administrativo'}
                  </h3>
                  <span
                    className={
                      confirmToggleUser.targetState
                        ? adminStyles.successModalSubtitle
                        : adminStyles.dangerModalSubtitle
                    }
                  >
                    {confirmToggleUser.targetState
                      ? 'Habilitación inmediata de credenciales'
                      : 'Revocación inmediata de permisos'}
                  </span>
                </div>
              </div>

              <div className={styles.confirmUserCard}>
                <div className={styles.confirmUserName}>
                  <span>{confirmToggleUser.userItem.full_name || 'Sin nombre registrado'}</span>
                  <span
                    className={
                      confirmToggleUser.userItem.role === 'superadmin'
                        ? styles.roleBadgeSuperadmin
                        : confirmToggleUser.userItem.role === 'auditor'
                          ? styles.roleBadgeAuditor
                          : styles.roleBadgeAdmin
                    }
                  >
                    {confirmToggleUser.userItem.role === 'superadmin'
                      ? 'Administrador principal'
                      : confirmToggleUser.userItem.role === 'auditor'
                        ? 'Auditor'
                        : 'Administrador'}
                  </span>
                </div>
                <span className={styles.confirmUserEmail}>{confirmToggleUser.userItem.email}</span>
              </div>

              <p className={adminStyles.modalParagraph}>
                {confirmToggleUser.targetState ? (
                  <>
                    ¿Confirmas que deseas <strong>reactivar</strong> a este administrador?
                    Podrá volver a iniciar sesión en el panel y ejecutar operaciones según su rol.
                  </>
                ) : (
                  <>
                    ¿Confirmas que deseas <strong>suspender el acceso</strong> de este administrador?
                    Su sesión activa se cerrará de inmediato y no podrá ingresar al panel hasta que un
                    administrador principal reactive su acceso.
                  </>
                )}
              </p>

              {!confirmToggleUser.targetState &&
                confirmToggleUser.userItem.role === 'superadmin' && (
                  <div className={styles.superadminWarningNotice}>
                    <ShieldAlert size={18} />
                    <span>
                      Atención: Esta cuenta tiene permisos principales. Asegúrate de contar con
                      otra cuenta administradora activa antes de suspenderla.
                    </span>
                  </div>
                )}

              <div className={adminStyles.modalFooterActions} style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className={adminStyles.btnSecondary}
                  onClick={() => setConfirmToggleUser(null)}
                  disabled={Boolean(togglingUserId)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={
                    confirmToggleUser.targetState
                      ? adminStyles.btnPrimary
                      : adminStyles.btnDanger
                  }
                  onClick={() => void handleExecuteToggleUserStatus()}
                  disabled={Boolean(togglingUserId)}
                >
                  {togglingUserId ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Procesando...</span>
                    </>
                  ) : confirmToggleUser.targetState ? (
                    <>
                      <UserCheck size={16} />
                      <span>Sí, reactivar acceso</span>
                    </>
                  ) : (
                    <>
                      <UserX size={16} />
                      <span>Sí, suspender acceso</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
