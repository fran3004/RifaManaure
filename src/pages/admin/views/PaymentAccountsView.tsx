import React, { useState, useEffect, useTransition } from 'react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminEmptyState } from '@/components/admin/common/AdminEmptyState';
import { AdminLoadingState } from '@/components/admin/common/AdminLoadingState';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import {
  getAllPaymentAccountsAdmin,
  createPaymentAccount,
  updatePaymentAccount,
  togglePaymentAccountActive,
  deletePaymentAccount,
  type PaymentAccountInsert,
} from '@/services/paymentService';
import type { PaymentAccountRow } from '@/types/raffle.types';
import { normalizeAppError, logAppError } from '@/lib/errorHandling';
import {
  CreditCard,
  Plus,
  Copy,
  Check,
  Edit2,
  Trash2,
  ShieldCheck,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  X,
  Smartphone,
  Landmark,
  Zap,
} from 'lucide-react';
import styles from './AdminViews.module.css';

const BANK_PRESETS = [
  { name: 'Nequi', defaultType: 'digital_wallet' },
  { name: 'Daviplata', defaultType: 'digital_wallet' },
  { name: 'Bancolombia', defaultType: 'savings' },
  { name: 'Bre-B', defaultType: 'bre_b' },
  { name: 'Banco de Bogotá', defaultType: 'savings' },
  { name: 'Davivienda', defaultType: 'savings' },
  { name: 'BBVA Colombia', defaultType: 'savings' },
  { name: 'Nu Colombia', defaultType: 'savings' },
];

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'digital_wallet', label: 'Billetera Digital / Móvil' },
  { value: 'savings', label: 'Cuenta de Ahorros' },
  { value: 'current', label: 'Cuenta Corriente' },
  { value: 'bre_b', label: 'Llave Bre-B (Interoperable)' },
  { value: 'transfiya', label: 'Llave Transfiya (Legado)' },
  { value: 'other', label: 'Otro Método Manual' },
];

function formatAccountTypeLabel(type?: string | null): string {
  if (!type) return 'Cuenta Bancaria';
  const clean = type.toLowerCase();
  if (clean === 'bre_b' || clean === 'breb') return 'Llave Bre-B (Interoperable)';
  if (clean === 'transfiya') return 'Llave Transfiya (Legado)';
  const found = ACCOUNT_TYPE_OPTIONS.find((opt) => opt.value === clean);
  return found ? found.label : type;
}

export const PaymentAccountsView: React.FC = () => {
  const [accounts, setAccounts] = useState<PaymentAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filtros
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modales
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PaymentAccountRow | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<PaymentAccountRow | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    bank_name: string;
    account_type: string;
    account_number: string;
    account_holder: string;
    holder_document_id: string;
    instructions: string;
    is_active: boolean;
    display_order: number;
  }>({
    bank_name: '',
    account_type: 'digital_wallet',
    account_number: '',
    account_holder: '',
    holder_document_id: '',
    instructions: '',
    is_active: true,
    display_order: 0,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForbidden, setIsForbidden] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const loadAccounts = () => {
    setLoading(true);
    setError(null);
    void getAllPaymentAccountsAdmin()
      .then((data) => {
        setAccounts(data);
        setIsForbidden(false);
      })
      .catch((err: unknown) => {
        const normalized = normalizeAppError(err, 'Error al cargar las cuentas de pago');
        logAppError('PaymentAccountsView.loadAccounts', normalized);
        setError(normalized.userMessage);
        setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    let isMounted = true;
    void getAllPaymentAccountsAdmin()
      .then((data) => {
        if (isMounted) {
          setAccounts(data);
          setIsForbidden(false);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const normalized = normalizeAppError(err, 'Error al cargar las cuentas de pago');
          logAppError('PaymentAccountsView.init', normalized);
          setError(normalized.userMessage);
          setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const copyNumber = (num: string, id: string) => {
    void navigator.clipboard.writeText(num.replace(/\s+/g, ''));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenCreate = () => {
    setEditingAccount(null);
    setFormData({
      bank_name: '',
      account_type: 'digital_wallet',
      account_number: '',
      account_holder: '',
      holder_document_id: '',
      instructions: '',
      is_active: true,
      display_order: accounts.length + 1,
    });
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (acc: PaymentAccountRow) => {
    setEditingAccount(acc);
    setFormData({
      bank_name: acc.bank_name,
      account_type: acc.account_type || 'savings',
      account_number: acc.account_number,
      account_holder: acc.account_holder,
      holder_document_id: acc.holder_document_id || '',
      instructions: acc.instructions || '',
      is_active: acc.is_active,
      display_order: acc.display_order,
    });
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  const handleToggleActive = async (acc: PaymentAccountRow) => {
    const newStatus = !acc.is_active;
    // Optimistic UI update
    setAccounts((prev) =>
      prev.map((item) => (item.id === acc.id ? { ...item, is_active: newStatus } : item))
    );

    const res = await togglePaymentAccountActive(acc.id, newStatus);
    if (res.success) {
      showFeedback(
        'success',
        `Cuenta ${acc.bank_name} (${acc.account_number}) ${newStatus ? 'activada y visible durante la compra' : 'desactivada y oculta a los compradores'}.`
      );
    } else {
      // Revert on failure
      setAccounts((prev) =>
        prev.map((item) => (item.id === acc.id ? { ...item, is_active: acc.is_active } : item))
      );
      showFeedback('error', `Error al cambiar estado: ${res.error || 'Intenta nuevamente'}`);
    }
  };

  const handlePresetSelect = (preset: { name: string; defaultType: string }) => {
    setFormData((prev) => {
      let suggestedInstructions = prev.instructions;
      if (!suggestedInstructions) {
        if (preset.name === 'Bre-B') {
          suggestedInstructions =
            'Realiza tu pago usando llave Bre-B desde cualquier entidad bancaria o billetera móvil y adjunta el comprobante con el código de aprobación.';
        } else if (preset.defaultType === 'digital_wallet') {
          suggestedInstructions = `Transfiere directamente desde tu aplicación ${preset.name} al número indicado y adjunta la captura donde se aprecie claramente el número de comprobante.`;
        }
      }

      return {
        ...prev,
        bank_name: preset.name,
        account_type: preset.defaultType,
        instructions: suggestedInstructions,
      };
    });
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.bank_name.trim()) {
      errors.bank_name = 'Indica el nombre de la entidad o plataforma.';
    }
    if (!formData.account_number.trim()) {
      errors.account_number = 'Ingresa el número de cuenta o número de teléfono.';
    }
    if (!formData.account_holder.trim()) {
      errors.account_holder = 'Ingresa el nombre completo del titular de la cuenta.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      if (editingAccount) {
        // Actualizar cuenta existente
        const res = await updatePaymentAccount(editingAccount.id, {
          bank_name: formData.bank_name.trim(),
          account_type: formData.account_type,
          account_number: formData.account_number.trim(),
          account_holder: formData.account_holder.trim(),
          holder_document_id: formData.holder_document_id.trim() || null,
          instructions: formData.instructions.trim() || null,
          is_active: formData.is_active,
          display_order: Number(formData.display_order) || 0,
        });

        if (res.success) {
          showFeedback('success', 'Cuenta de pago actualizada correctamente.');
          setIsFormModalOpen(false);
          loadAccounts();
        } else {
          showFeedback('error', res.error || 'No se pudo actualizar la cuenta.');
        }
      } else {
        // Crear nueva cuenta oficial
        const payload: PaymentAccountInsert = {
          bank_name: formData.bank_name.trim(),
          account_type: formData.account_type,
          account_number: formData.account_number.trim(),
          account_holder: formData.account_holder.trim(),
          holder_document_id: formData.holder_document_id.trim() || null,
          instructions: formData.instructions.trim() || null,
          is_active: formData.is_active,
          display_order: Number(formData.display_order) || 0,
        };

        const res = await createPaymentAccount(payload);
        if (res.success) {
          showFeedback('success', 'Nueva cuenta oficial de pago creada con éxito.');
          setIsFormModalOpen(false);
          loadAccounts();
        } else {
          showFeedback('error', res.error || 'No se pudo crear la cuenta.');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingAccount) return;
    setIsSubmitting(true);
    try {
      const res = await deletePaymentAccount(deletingAccount.id);
      if (res.success) {
        showFeedback('success', `Cuenta ${deletingAccount.bank_name} eliminada con éxito.`);
        setIsDeleteModalOpen(false);
        setDeletingAccount(null);
        loadAccounts();
      } else {
        showFeedback('error', res.error || 'Error al eliminar la cuenta de pago.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtrado
  const filteredAccounts = accounts.filter((acc) => {
    if (filterStatus === 'active' && !acc.is_active) return false;
    if (filterStatus === 'inactive' && acc.is_active) return false;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchBank = acc.bank_name.toLowerCase().includes(term);
      const matchHolder = acc.account_holder.toLowerCase().includes(term);
      const matchNum = acc.account_number.includes(term);
      return matchBank || matchHolder || matchNum;
    }
    return true;
  });

  const activeCount = accounts.filter((a) => a.is_active).length;
  const inactiveCount = accounts.filter((a) => !a.is_active).length;

  return (
    <div className={styles.viewContainer}>
      <AdminPageHeader
        title="Cuentas de Pago"
        description="Administración de cuentas bancarias y billeteras digitales autorizadas para la recepción de transferencias manuales."
        badge={`${accounts.length} Cuentas`}
        actions={
          <button type="button" className={styles.btnPrimary} onClick={handleOpenCreate}>
            <Plus size={18} /> Nueva Cuenta de Pago
          </button>
        }
      />

      {/* Banner de Feedback */}
      {feedback && (
        <div
          className={`${styles.accountFeedbackBanner} ${
            feedback.type === 'success'
              ? styles.accountFeedbackSuccess
              : styles.accountFeedbackError
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Tarjetas de Métricas Rápidas */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Total Cuentas Registradas</span>
            <div className={styles.metricIcon}>
              <CreditCard size={18} />
            </div>
          </div>
          <span className={styles.metricValue}>{accounts.length}</span>
          <span className={styles.metricHint}>Entidades y billeteras configuradas</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Cuentas Activas</span>
            <div className={`${styles.metricIcon} ${styles.metricSuccess}`}>
              <Eye size={18} />
            </div>
          </div>
          <span className={`${styles.metricValue} ${styles.metricSuccess}`}>
            {activeCount}
          </span>
          <span className={styles.metricHint}>
            Visibles actualmente para los compradores
          </span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Cuentas Inactivas</span>
            <div className={`${styles.metricIcon} ${styles.metricNeutral}`}>
              <EyeOff size={18} />
            </div>
          </div>
          <span className={`${styles.metricValue} ${styles.metricNeutral}`}>
            {inactiveCount}
          </span>
          <span className={styles.metricHint}>Ocultas del público (pausadas o contingencia)</span>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className={styles.filterBar}>
        <div className={styles.searchGroup}>
          <CreditCard size={18} color="var(--text-muted, #7e9c90)" />
          <input
            type="text"
            placeholder="Buscar por banco, titular o número de cuenta..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterControls}>
          <select
            value={filterStatus}
            onChange={(e) =>
              startTransition(() => {
                setFilterStatus(e.target.value as 'all' | 'active' | 'inactive');
              })
            }
            className={styles.filterSelect}
          >
            <option value="all">Todas las Cuentas ({accounts.length})</option>
            <option value="active">Solo Activas ({activeCount})</option>
            <option value="inactive">Solo Inactivas ({inactiveCount})</option>
          </select>
        </div>
      </div>

      {/* Nota Informativa */}
      <div className={styles.accountInfoNotice}>
        <ShieldCheck size={20} className={styles.accountInfoNoticeIcon} />
        <span>
          <strong>Regla de visualización:</strong> Los compradores que inician su compra
          únicamente podrán ver y copiar las cuentas marcadas como <strong>Activas</strong>. Si
          desactivas una cuenta, dejará de mostrarse inmediatamente sin afectar el historial de
          pagos anteriores.
        </span>
      </div>

      {/* Listado de Cuentas */}
      {loading ? (
        <AdminLoadingState message="Cargando cuentas oficiales de pago..." />
      ) : error ? (
        <div className={styles.cardSection}>
          <AdminErrorState
            title={isForbidden ? 'Acceso Restringido' : 'Error al cargar cuentas de pago'}
            message={error}
            isForbidden={isForbidden}
            onRetry={loadAccounts}
          />
        </div>
      ) : accounts.length === 0 ? (
        /* Estado Vacío Cuando No Hay Cuentas en la BD */
        <div className={styles.cardSection}>
          <AdminEmptyState
            icon={<CreditCard size={36} color="var(--color-brand-accent, var(--brand-accent))" />}
            title="No hay cuentas de pago configuradas"
            description="Aún no has registrado ninguna cuenta bancaria o billetera digital oficial. Agrega las cuentas donde los compradores realizarán sus transferencias."
            actionLabel="Agregar Primera Cuenta Oficial"
            onAction={handleOpenCreate}
          />
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className={styles.cardSection}>
          <AdminEmptyState
            icon={<CreditCard size={36} color="var(--color-brand-accent, var(--brand-accent))" />}
            title="No se encontraron cuentas"
            description="No hay cuentas registradas que coincidan con los filtros o término de búsqueda aplicado."
            actionLabel="Restablecer Filtros"
            onAction={() => {
              setSearchTerm('');
              setFilterStatus('all');
            }}
          />
        </div>
      ) : (
        <div className={styles.receiptGrid}>
          {filteredAccounts.map((acc) => (
            <div
              key={acc.id}
              className={`${styles.accountCardContainer} ${
                !acc.is_active ? styles.accountCardInactive : ''
              }`}
            >
              {/* Encabezado de la Tarjeta */}
              <div className={styles.accountHeaderRow}>
                <div className={styles.accountTitleGroup}>
                  {acc.account_type === 'bre_b' ? (
                    <Zap size={20} color="var(--color-success)" />
                  ) : acc.account_type === 'digital_wallet' ? (
                    <Smartphone size={20} color="var(--color-brand-accent, var(--brand-accent))" />
                  ) : (
                    <Landmark size={20} color="var(--color-brand-accent, var(--brand-accent))" />
                  )}
                  <h4 className={styles.accountEntityTitle}>{acc.bank_name}</h4>
                  <span className={styles.orderBadge}>Orden #{acc.display_order}</span>
                </div>

                {/* Botón de Toggle Activo/Inactivo */}
                <button
                  type="button"
                  onClick={() => handleToggleActive(acc)}
                  className={`${styles.statusToggleBtn} ${
                    acc.is_active ? styles.statusToggleActive : styles.statusToggleInactive
                  }`}
                  title={acc.is_active ? 'Clic para desactivar' : 'Clic para activar'}
                >
                  {acc.is_active ? <Check size={13} /> : <EyeOff size={13} />}
                  <span>{acc.is_active ? 'Activa' : 'Inactiva'}</span>
                </button>
              </div>

              {/* Tipo de Cuenta */}
              <div className={styles.accountFieldGroup}>
                <span className={styles.accountFieldLabel}>
                  Tipo de Método / Cuenta:
                </span>
                <span className={styles.accountFieldValue}>
                  {formatAccountTypeLabel(acc.account_type)}
                </span>
              </div>

              {/* Número de Cuenta y Copiado */}
              <div className={styles.accountNumberGroup}>
                <span className={styles.accountFieldLabel}>
                  Número de Cuenta / Teléfono Móvil:
                </span>
                <div className={styles.accountNumberBox}>
                  <strong className={styles.accountNumberText}>
                    {acc.account_number}
                  </strong>
                  <button
                    type="button"
                    className={styles.copyMiniBtn}
                    onClick={() => copyNumber(acc.account_number, acc.id)}
                    title="Copiar número"
                  >
                    {copiedId === acc.id ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedId === acc.id ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              {/* Datos de Titularidad */}
              <div className={styles.accountHolderDetails}>
                <div>
                  Titular: <strong className={styles.accountHolderHighlight}>{acc.account_holder}</strong>
                </div>
                {acc.holder_document_id && (
                  <div>
                    Documento / NIT:{' '}
                    <strong className={styles.accountHolderHighlight}>{acc.holder_document_id}</strong>
                  </div>
                )}
                {acc.instructions && (
                  <div className={styles.accountInstructionsBox}>
                    <strong>Instrucciones:</strong> {acc.instructions}
                  </div>
                )}
              </div>

              {/* Acciones Inferiores */}
              <div className={styles.accountCardFooterActions}>
                <button
                  type="button"
                  className={styles.btnActionEdit}
                  onClick={() => handleOpenEdit(acc)}
                  title="Modificar datos de la cuenta"
                >
                  <Edit2 size={14} /> Editar
                </button>
                <button
                  type="button"
                  className={styles.btnActionDelete}
                  onClick={() => {
                    setDeletingAccount(acc);
                    setIsDeleteModalOpen(true);
                  }}
                  title="Eliminar esta cuenta"
                >
                  <Trash2 size={14} /> Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Crear / Editar Cuenta de Pago Oficial                              */}
      {/* ========================================================================= */}
      {isFormModalOpen && (
        <div className={styles.adminModalBackdrop} onClick={() => setIsFormModalOpen(false)}>
          <div
            className={`${styles.adminModalCard} ${styles.accountModalCard}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.accountModalHeader}>
              <div className={styles.accountModalTitleGroup}>
                <CreditCard size={22} color="var(--color-brand-accent, var(--brand-accent))" />
                <h3 className={styles.accountModalTitle}>
                  {editingAccount ? 'Editar Cuenta de Pago' : 'Nueva Cuenta Oficial de Pago'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className={styles.accountModalCloseBtn}
              >
                <X size={20} />
              </button>
            </div>

            {/* Presets Rápidos */}
            <div>
              <span className={styles.accountPresetsLabel}>
                Sugerencias de Entidades / Billeteras Rápidas:
              </span>
              <div className={styles.presetChipsRow}>
                {BANK_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    className={`${styles.presetChip} ${
                      formData.bank_name === preset.name ? styles.presetChipSelected : ''
                    }`}
                    onClick={() => handlePresetSelect(preset)}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleSaveAccount}
              className={styles.accountForm}
            >
              <div className={styles.formModalGrid}>
                {/* 1. Banco / Plataforma */}
                <div className={styles.formModalGroup}>
                  <label className={styles.formModalLabel}>Banco / Plataforma *</label>
                  <input
                    type="text"
                    placeholder="Ej: Nequi, Daviplata, Bancolombia..."
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    className={styles.formModalInput}
                    required
                  />
                  {formErrors.bank_name && (
                    <span className={styles.accountFieldError}>
                      {formErrors.bank_name}
                    </span>
                  )}
                </div>

                {/* 2. Tipo de Cuenta */}
                <div className={styles.formModalGroup}>
                  <label className={styles.formModalLabel}>Tipo de Cuenta *</label>
                  <select
                    value={formData.account_type}
                    onChange={(e) => setFormData({ ...formData, account_type: e.target.value })}
                    className={styles.formModalSelect}
                  >
                    {ACCOUNT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Número de Cuenta */}
                <div className={styles.formModalGroup}>
                  <label className={styles.formModalLabel}>Número de Cuenta / Teléfono *</label>
                  <input
                    type="text"
                    placeholder="Número de cuenta o celular (ej. 3000000000)"
                    value={formData.account_number}
                    onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                    className={styles.formModalInput}
                    required
                  />
                  {formErrors.account_number && (
                    <span className={styles.accountFieldError}>
                      {formErrors.account_number}
                    </span>
                  )}
                </div>

                {/* 4. Orden de Visualización */}
                <div className={styles.formModalGroup}>
                  <label className={styles.formModalLabel}>Orden de Visualización</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.display_order}
                    onChange={(e) =>
                      setFormData({ ...formData, display_order: parseInt(e.target.value, 10) || 0 })
                    }
                    className={styles.formModalInput}
                  />
                </div>

                {/* 5. Titular */}
                <div className={styles.formModalGroup}>
                  <label className={styles.formModalLabel}>Nombre del Titular *</label>
                  <input
                    type="text"
                    placeholder="Nombre completo o razón social del titular"
                    value={formData.account_holder}
                    onChange={(e) => setFormData({ ...formData, account_holder: e.target.value })}
                    className={styles.formModalInput}
                    required
                  />
                  {formErrors.account_holder && (
                    <span className={styles.accountFieldError}>
                      {formErrors.account_holder}
                    </span>
                  )}
                </div>

                {/* 6. Documento del Titular */}
                <div className={styles.formModalGroup}>
                  <label className={styles.formModalLabel}>
                    Cédula o NIT del Titular (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Número de documento de identidad o NIT (opcional)"
                    value={formData.holder_document_id}
                    onChange={(e) =>
                      setFormData({ ...formData, holder_document_id: e.target.value })
                    }
                    className={styles.formModalInput}
                  />
                </div>

                {/* 7. Instrucciones */}
                <div className={`${styles.formModalGroup} ${styles.formModalFull}`}>
                  <label className={styles.formModalLabel}>
                    Instrucciones de Transferencia para el Comprador
                  </label>
                  <textarea
                    placeholder="Ej: Realiza la transferencia directa o por Bre-B y adjunta la captura donde se aprecie claramente el código de aprobación."
                    value={formData.instructions}
                    onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                    className={styles.formModalTextarea}
                  />
                </div>

                {/* 8. Estado Activo */}
                <div className={`${styles.formModalGroup} ${styles.formModalFull}`}>
                  <label className={styles.formModalCheckboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className={styles.formModalCheckbox}
                    />
                    <span>
                      <strong>Cuenta Activa</strong> (Marcar para que los compradores puedan verla y
                      seleccionarla durante la compra)
                    </span>
                  </label>
                </div>
              </div>

              <div className={styles.accountModalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setIsFormModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={isSubmitting}>
                  {isSubmitting
                    ? 'Guardando...'
                    : editingAccount
                      ? 'Actualizar Cuenta'
                      : 'Crear Cuenta de Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Confirmar Eliminación de Cuenta                                   */}
      {/* ========================================================================= */}
      {isDeleteModalOpen && deletingAccount && (
        <div className={styles.adminModalBackdrop} onClick={() => setIsDeleteModalOpen(false)}>
          <div
            className={`${styles.adminModalCard} ${styles.accountDeleteModalCard}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.accountDeleteModalHeader}>
              <AlertCircle size={24} />
              <h3 className={styles.accountDeleteModalTitle}>
                ¿Eliminar Cuenta de Pago?
              </h3>
            </div>

            <p className={styles.accountDeleteModalText}>
              Estás a punto de eliminar la cuenta de <strong>{deletingAccount.bank_name}</strong> (
              <span className={styles.accountDeleteNumberMono}>{deletingAccount.account_number}</span>) a
              nombre de <strong>{deletingAccount.account_holder}</strong>.
            </p>
            <p className={styles.accountDeleteModalNotice}>
              Esta acción no puede deshacerse. Si solo deseas ocultarla a los compradores, puedes
              marcarla como inactiva en su lugar.
            </p>

            <div className={styles.accountDeleteModalActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
              >
                <Trash2 size={15} />
                <span>{isSubmitting ? 'Eliminando...' : 'Sí, Eliminar Cuenta'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
