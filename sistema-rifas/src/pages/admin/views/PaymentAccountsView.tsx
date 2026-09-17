import React, { useState, useEffect, useTransition } from 'react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
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
} from 'lucide-react';
import styles from './AdminViews.module.css';

const BANK_PRESETS = [
  { name: 'Nequi', defaultType: 'digital_wallet' },
  { name: 'Daviplata', defaultType: 'digital_wallet' },
  { name: 'Bancolombia', defaultType: 'savings' },
  { name: 'Banco de Bogotá', defaultType: 'savings' },
  { name: 'Davivienda', defaultType: 'savings' },
  { name: 'Dale!', defaultType: 'digital_wallet' },
  { name: 'Movii', defaultType: 'digital_wallet' },
  { name: 'Transfiya', defaultType: 'transfiya' },
];

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'digital_wallet', label: 'Billetera Digital / Móvil' },
  { value: 'savings', label: 'Cuenta de Ahorros' },
  { value: 'current', label: 'Cuenta Corriente' },
  { value: 'transfiya', label: 'Llave Transfiya' },
  { value: 'other', label: 'Otro Método Manual' },
];

function formatAccountTypeLabel(type?: string | null): string {
  if (!type) return 'Cuenta Bancaria';
  const found = ACCOUNT_TYPE_OPTIONS.find((opt) => opt.value === type.toLowerCase());
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
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadAccounts = () => {
    setLoading(true);
    setError(null);
    void getAllPaymentAccountsAdmin()
      .then((data) => {
        setAccounts(data);
      })
      .catch((err: unknown) => {
        console.error('Error al cargar cuentas de pago:', err);
        setError(err instanceof Error ? err.message : 'Error al cargar las cuentas de pago');
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
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          console.error('Error al cargar cuentas de pago:', err);
          setError(err instanceof Error ? err.message : 'Error al cargar las cuentas de pago');
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
        `Cuenta ${acc.bank_name} (${acc.account_number}) ${newStatus ? 'activada y visible en checkout' : 'desactivada y oculta al público'}.`
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
    setFormData((prev) => ({
      ...prev,
      bank_name: preset.name,
      account_type: preset.defaultType,
    }));
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
          <button type="button" className={styles.submitBtn} onClick={handleOpenCreate}>
            <Plus size={18} /> Nueva Cuenta de Pago
          </button>
        }
      />

      {/* Banner de Feedback */}
      {feedback && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.85rem 1.25rem',
            borderRadius: 'var(--radius-md, 10px)',
            backgroundColor:
              feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${
              feedback.type === 'success' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'
            }`,
            color: feedback.type === 'success' ? '#34d399' : '#f87171',
            fontSize: '0.9rem',
          }}
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
            <div className={styles.metricIcon} style={{ color: '#34d399' }}>
              <Eye size={18} />
            </div>
          </div>
          <span className={styles.metricValue} style={{ color: '#34d399' }}>
            {activeCount}
          </span>
          <span className={styles.metricHint}>Visibles actualmente para compradores en Checkout</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Cuentas Inactivas</span>
            <div className={styles.metricIcon} style={{ color: '#94a3b8' }}>
              <EyeOff size={18} />
            </div>
          </div>
          <span className={styles.metricValue} style={{ color: '#94a3b8' }}>
            {inactiveCount}
          </span>
          <span className={styles.metricHint}>Ocultas del público (pausadas o contingencia)</span>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className={styles.filterBar}>
        <div className={styles.searchGroup}>
          <CreditCard size={18} color="var(--text-muted, #5e7a6f)" />
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.9rem 1.25rem',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: 'var(--radius-lg, 16px)',
          color: '#e2f0ea',
          fontSize: '0.85rem',
        }}
      >
        <ShieldCheck size={20} color="#34d399" style={{ flexShrink: 0 }} />
        <span>
          <strong>Regla de visualización:</strong> Los compradores que ingresan al checkout únicamente
          podrán ver y copiar las cuentas marcadas como <strong>Activas</strong>. Si desactivas una cuenta,
          dejará de mostrarse inmediatamente sin afectar el historial de pagos anteriores.
        </span>
      </div>

      {/* Listado de Cuentas */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9cb5ab' }}>
          <div className={styles.spinner} style={{ margin: '0 auto 1rem' }} />
          <span>Cargando cuentas oficiales de pago...</span>
        </div>
      ) : error ? (
        <div className={styles.cardSection}>
          <AdminErrorState
            title="Error al cargar cuentas de pago"
            message={error}
            onRetry={loadAccounts}
          />
        </div>
      ) : accounts.length === 0 ? (
        /* Estado Vacío Cuando No Hay Cuentas en la BD */
        <div className={styles.emptyStateCard}>
          <div className={styles.emptyStateIconWrapper}>
            <CreditCard size={32} />
          </div>
          <h3 className={styles.emptyStateTitle}>No hay cuentas de pago configuradas</h3>
          <p className={styles.emptyStateDescription}>
            Aún no has registrado ninguna cuenta bancaria o billetera digital oficial. Agrega las
            cuentas donde los compradores realizarán sus transferencias para que aparezcan en el checkout.
          </p>
          <button type="button" className={styles.submitBtn} onClick={handleOpenCreate}>
            <Plus size={18} /> Agregar Primera Cuenta Oficial
          </button>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9cb5ab' }}>
          <p>No se encontraron cuentas que coincidan con los filtros aplicados.</p>
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
                  {acc.account_type === 'digital_wallet' ? (
                    <Smartphone size={20} color="var(--color-brand-accent, #f59e0b)" />
                  ) : (
                    <Landmark size={20} color="var(--color-brand-accent, #f59e0b)" />
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted, #5e7a6f)',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Tipo de Método / Cuenta:
                </span>
                <span style={{ fontSize: '0.9rem', color: '#e2f0ea', fontWeight: 600 }}>
                  {formatAccountTypeLabel(acc.account_type)}
                </span>
              </div>

              {/* Número de Cuenta y Copiado */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted, #5e7a6f)',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Número de Cuenta / Teléfono Móvil:
                </span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'var(--bg-main, #0a1410)',
                    padding: '0.6rem 0.85rem',
                    borderRadius: 'var(--radius-md, 10px)',
                    border: '1px solid rgba(156, 181, 171, 0.15)',
                  }}
                >
                  <strong
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '1.15rem',
                      color: 'var(--color-brand-accent, #f59e0b)',
                    }}
                  >
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
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary, #9cb5ab)',
                }}
              >
                <div>
                  Titular: <strong style={{ color: '#f3f7f5' }}>{acc.account_holder}</strong>
                </div>
                {acc.holder_document_id && (
                  <div>
                    Documento / NIT:{' '}
                    <strong style={{ color: '#f3f7f5' }}>{acc.holder_document_id}</strong>
                  </div>
                )}
                {acc.instructions && (
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: '#cbd5e1',
                      marginTop: '0.35rem',
                      padding: '0.45rem 0.65rem',
                      borderRadius: 'var(--radius-sm, 6px)',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      borderLeft: '2px solid var(--color-brand-accent, #f59e0b)',
                    }}
                  >
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
            className={styles.adminModalCard}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '680px' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(156, 181, 171, 0.15)',
                paddingBottom: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <CreditCard size={22} color="var(--color-brand-accent, #f59e0b)" />
                <h3 style={{ margin: 0, color: '#f3f7f5', fontSize: '1.2rem' }}>
                  {editingAccount ? 'Editar Cuenta de Pago' : 'Nueva Cuenta Oficial de Pago'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9cb5ab',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Presets Rápidos */}
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #5e7a6f)', fontWeight: 600 }}>
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

            <form onSubmit={handleSaveAccount} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                    <span style={{ color: '#f87171', fontSize: '0.75rem' }}>{formErrors.bank_name}</span>
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
                    <span style={{ color: '#f87171', fontSize: '0.75rem' }}>{formErrors.account_number}</span>
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
                    <span style={{ color: '#f87171', fontSize: '0.75rem' }}>{formErrors.account_holder}</span>
                  )}
                </div>

                {/* 6. Documento del Titular */}
                <div className={styles.formModalGroup}>
                  <label className={styles.formModalLabel}>Cédula o NIT del Titular (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Número de documento de identidad o NIT (opcional)"
                    value={formData.holder_document_id}
                    onChange={(e) => setFormData({ ...formData, holder_document_id: e.target.value })}
                    className={styles.formModalInput}
                  />
                </div>

                {/* 7. Instrucciones */}
                <div className={`${styles.formModalGroup} ${styles.formModalFull}`}>
                  <label className={styles.formModalLabel}>Instrucciones de Transferencia para el Comprador</label>
                  <textarea
                    placeholder="Ej: Realiza la transferencia directa o por Transfiya y adjunta la captura donde se aprecie claramente el código de aprobación."
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
                      <strong>Cuenta Activa</strong> (Marcar para que los compradores puedan verla y seleccionarla en el checkout)
                    </span>
                  </label>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  marginTop: '0.5rem',
                  borderTop: '1px solid rgba(156, 181, 171, 0.15)',
                  paddingTop: '1rem',
                }}
              >
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setIsFormModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                  {isSubmitting ? (
                    'Guardando...'
                  ) : editingAccount ? (
                    'Actualizar Cuenta'
                  ) : (
                    'Crear Cuenta de Pago'
                  )}
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
            className={styles.adminModalCard}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#f87171' }}>
              <AlertCircle size={24} />
              <h3 style={{ margin: 0, color: '#f3f7f5', fontSize: '1.15rem' }}>
                ¿Eliminar Cuenta de Pago?
              </h3>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
              Estás a punto de eliminar la cuenta de <strong>{deletingAccount.bank_name}</strong> (
              <span style={{ fontFamily: 'monospace' }}>{deletingAccount.account_number}</span>) a nombre
              de <strong>{deletingAccount.account_holder}</strong>.
            </p>
            <p style={{ color: 'var(--text-muted, #5e7a6f)', fontSize: '0.8rem', margin: 0 }}>
              Esta acción no puede deshacerse. Si solo deseas que no aparezca en el checkout, puedes
              marcarla como inactiva en su lugar.
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '0.5rem',
              }}
            >
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnActionDelete}
                style={{ padding: '0.65rem 1.25rem' }}
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Eliminando...' : 'Sí, Eliminar Cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
