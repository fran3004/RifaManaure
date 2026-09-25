import React, { useState } from 'react';
import { UserCheck, X, AlertCircle, Loader2, Save } from 'lucide-react';
import { updateBuyerAdmin, type BuyerItem } from '@/services/buyerService';
import styles from './AdminEditBuyerModal.module.css';

interface AdminEditBuyerModalProps {
  buyer: BuyerItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedBuyer: BuyerItem) => void;
}

interface AdminEditBuyerFormProps {
  buyer: BuyerItem;
  onClose: () => void;
  onSuccess: (updatedBuyer: BuyerItem) => void;
}

const AdminEditBuyerForm: React.FC<AdminEditBuyerFormProps> = ({ buyer, onClose, onSuccess }) => {
  const [fullName, setFullName] = useState<string>(buyer.full_name || '');
  const [phone, setPhone] = useState<string>(buyer.phone || '');
  const [email, setEmail] = useState<string>(buyer.email || '');
  const [city, setCity] = useState<string>(buyer.city || '');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = fullName.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanCity = city.trim();

    if (cleanName.length < 3) {
      setErrorMessage('El nombre debe tener al menos 3 caracteres.');
      return;
    }

    if (cleanPhone.length < 7) {
      setErrorMessage('Por favor ingrese un número de teléfono válido.');
      return;
    }

    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setErrorMessage('Por favor ingrese un correo electrónico válido.');
      return;
    }

    if (cleanCity.length < 2) {
      setErrorMessage('El municipio o ciudad es obligatorio.');
      return;
    }

    setIsSaving(true);

    const result = await updateBuyerAdmin(buyer.id, {
      fullName: cleanName,
      phone: cleanPhone,
      email: cleanEmail,
      city: cleanCity,
    });

    setIsSaving(false);

    if (result.success && result.buyer) {
      onSuccess(result.buyer);
      onClose();
    } else {
      setErrorMessage(result.error || 'No fue posible actualizar los datos del comprador.');
    }
  };

  return (
    <div className={styles.backdrop} onClick={() => !isSaving && onClose()}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Encabezado */}
        <div className={styles.modalHeader}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.headerIcon}>
              <UserCheck size={20} />
            </div>
            <div>
              <h3 className={styles.headerTitle}>Editar Datos del Comprador</h3>
              <span className={styles.headerSubtitle}>
                C.C. {buyer.document_id} • Actualización de contacto
              </span>
            </div>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={isSaving}
            title="Cerrar ventana"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {errorMessage && (
              <div className={styles.errorBanner}>
                <AlertCircle size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Documento (Solo lectura) */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Cédula / Documento de Identidad</label>
              <input
                type="text"
                className={`${styles.input} ${styles.inputDisabled}`}
                value={buyer.document_id}
                disabled
                readOnly
              />
              <span className={styles.helpText}>
                El documento es el identificador fiscal único del comprador y no es editable
                directamente.
              </span>
            </div>

            {/* Nombre Completo */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Nombre Completo *</label>
              <input
                type="text"
                className={styles.input}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej. Juan Pérez"
                required
                disabled={isSaving}
              />
            </div>

            {/* Teléfono / WhatsApp */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Teléfono / WhatsApp *</label>
              <input
                type="tel"
                className={styles.input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. 3001234567"
                required
                disabled={isSaving}
              />
              <span className={styles.helpText}>
                Utilizado para el contacto y envío manual de comprobantes y notificaciones por WhatsApp.
              </span>
            </div>

            {/* Correo Electrónico */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Correo Electrónico *</label>
              <input
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ej. juan@ejemplo.com"
                required
                disabled={isSaving}
              />
            </div>

            {/* Ciudad / Municipio */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Ciudad / Municipio *</label>
              <input
                type="text"
                className={styles.input}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ej. Manaure, La Guajira"
                required
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Botones de Acción */}
          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={onClose}
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.btnSubmit} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Guardar Cambios</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AdminEditBuyerModal: React.FC<AdminEditBuyerModalProps> = ({
  buyer,
  isOpen,
  onClose,
  onSuccess,
}) => {
  if (!isOpen || !buyer) return null;

  return (
    <AdminEditBuyerForm key={buyer.id} buyer={buyer} onClose={onClose} onSuccess={onSuccess} />
  );
};
