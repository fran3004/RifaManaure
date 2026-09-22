import React, { useState, useEffect, useCallback } from 'react';
import {
  HelpCircle,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import type { FaqItem } from '@/types/raffle.types';
import {
  getAdminFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  toggleFaqPublished,
  reorderFaqs,
} from '@/services/faqService';
import styles from './AdminFaqManager.module.css';

export const AdminFaqManager: React.FC = () => {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isReordering, setIsReordering] = useState<boolean>(false);

  // Notificación local
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Estados de Modal (Creación / Edición)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formQuestion, setFormQuestion] = useState<string>('');
  const [formAnswer, setFormAnswer] = useState<string>('');
  const [formSortOrder, setFormSortOrder] = useState<number>(10);
  const [formIsPublished, setFormIsPublished] = useState<boolean>(true);

  // Estado para modal de confirmación de eliminación
  const [deletingFaq, setDeletingFaq] = useState<FaqItem | null>(null);

  // Estado para previsualización interactiva en el modal
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(true);

  // Cargar preguntas desde la base de datos
  const loadFaqs = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await getAdminFaqs();
      setFaqs(items);
    } catch (err) {
      setNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al cargar preguntas frecuentes.',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFaqs();
  }, [loadFaqs]);

  // Abrir modal para nueva pregunta
  const handleOpenCreate = () => {
    const nextOrder =
      faqs.length > 0 ? Math.max(...faqs.map((f) => f.sort_order ?? 0)) + 10 : 10;
    setEditingId(null);
    setFormQuestion('');
    setFormAnswer('');
    setFormSortOrder(nextOrder);
    setFormIsPublished(true);
    setIsPreviewOpen(true);
    setIsModalOpen(true);
  };

  // Abrir modal para editar pregunta existente
  const handleOpenEdit = (item: FaqItem) => {
    setEditingId(item.id || null);
    setFormQuestion(item.question);
    setFormAnswer(item.answer);
    setFormSortOrder(item.sort_order ?? 10);
    setFormIsPublished(item.is_published ?? true);
    setIsPreviewOpen(true);
    setIsModalOpen(true);
  };

  // Cerrar modal
  const handleCloseModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingId(null);
  };

  // Guardar (Crear o Actualizar)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formQuestion.trim() || !formAnswer.trim()) {
      setNotification({
        type: 'error',
        message: 'Tanto la pregunta como la respuesta son campos obligatorios.',
      });
      return;
    }

    setIsSaving(true);
    setNotification(null);

    try {
      if (editingId) {
        // Actualizar
        const result = await updateFaq(editingId, {
          question: formQuestion,
          answer: formAnswer,
          sort_order: formSortOrder,
          is_published: formIsPublished,
        });

        if (!result.success) {
          throw new Error(result.error || 'No se pudo actualizar la pregunta frecuente.');
        }

        setFaqs((prev) =>
          prev
            .map((item) => (item.id === editingId ? result.data! : item))
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        );

        setNotification({
          type: 'success',
          message: 'Pregunta frecuente actualizada exitosamente.',
        });
      } else {
        // Crear
        const result = await createFaq({
          question: formQuestion,
          answer: formAnswer,
          sort_order: formSortOrder,
          is_published: formIsPublished,
        });

        if (!result.success) {
          throw new Error(result.error || 'No se pudo registrar la nueva pregunta frecuente.');
        }

        setFaqs((prev) =>
          [...prev, result.data!].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        );

        setNotification({
          type: 'success',
          message: 'Nueva pregunta frecuente creada con éxito.',
        });
      }

      setIsModalOpen(false);
    } catch (err) {
      setNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error inesperado al guardar.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Alternar publicación rápida
  const handleTogglePublished = async (item: FaqItem) => {
    if (!item.id) return;
    const newStatus = !item.is_published;

    // Optimistic UI update
    setFaqs((prev) =>
      prev.map((f) => (f.id === item.id ? { ...f, is_published: newStatus } : f))
    );

    const result = await toggleFaqPublished(item.id, newStatus);
    if (!result.success) {
      // Revert on error
      setFaqs((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, is_published: !newStatus } : f))
      );
      setNotification({
        type: 'error',
        message: result.error || 'No se pudo cambiar el estado de publicación.',
      });
    } else {
      setNotification({
        type: 'success',
        message: newStatus
          ? 'Pregunta publicada en el portal público.'
          : 'Pregunta oculta temporalmente.',
      });
    }
  };

  // Reordenar hacia arriba o hacia abajo
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (isReordering) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= faqs.length) return;

    const currentItem = faqs[index];
    const targetItem = faqs[targetIndex];

    if (!currentItem.id || !targetItem.id) return;

    // Intercambiar sort_order
    const currentOrder = currentItem.sort_order ?? index * 10;
    const targetOrder = targetItem.sort_order ?? targetIndex * 10;

    // Si ambos órdenes fueran iguales, diferenciarlos
    const newCurrentOrder = currentOrder === targetOrder ? (direction === 'up' ? targetOrder - 5 : targetOrder + 5) : targetOrder;
    const newTargetOrder = currentOrder;

    const updatedList = [...faqs];
    updatedList[index] = { ...currentItem, sort_order: newCurrentOrder };
    updatedList[targetIndex] = { ...targetItem, sort_order: newTargetOrder };
    updatedList.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    setFaqs(updatedList);
    setIsReordering(true);

    try {
      const result = await reorderFaqs([
        { id: currentItem.id, sort_order: newCurrentOrder },
        { id: targetItem.id, sort_order: newTargetOrder },
      ]);

      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (err) {
      setNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al guardar el nuevo orden.',
      });
      // Recargar desde base de datos para restaurar orden real
      void loadFaqs();
    } finally {
      setIsReordering(false);
    }
  };

  // Confirmar y Ejecutar Eliminación
  const handleDelete = async () => {
    if (!deletingFaq?.id) return;
    setIsSaving(true);

    try {
      const result = await deleteFaq(deletingFaq.id);
      if (!result.success) {
        throw new Error(result.error || 'No fue posible eliminar la pregunta.');
      }

      setFaqs((prev) => prev.filter((f) => f.id !== deletingFaq.id));
      setNotification({
        type: 'success',
        message: 'Pregunta frecuente eliminada exitosamente.',
      });
      setDeletingFaq(null);
    } catch (err) {
      setNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al eliminar la pregunta.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.faqSection}>
      {/* Cabecera del Gestor de Preguntas Frecuentes */}
      <div className={styles.faqHeader}>
        <div className={styles.faqHeaderLeft}>
          <h3 className={styles.faqTitle}>
            <HelpCircle size={22} className={styles.faqTitleIcon} />
            Preguntas Frecuentes (FAQ) del Portal
          </h3>
          <p className={styles.faqSubtitle}>
            Gestiona el catálogo oficial de preguntas y respuestas visibles en el acordeón de la
            página principal. Puedes crear nuevas dudas habituales, editarlas, reordenarlas y
            activar u ocultar su visualización.
          </p>
        </div>

        <div className={styles.faqHeaderActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => void loadFaqs()}
            disabled={isLoading}
            title="Refrescar catálogo de preguntas"
            aria-label="Refrescar preguntas"
          >
            <RefreshCw size={17} className={isLoading ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            className={styles.addBtn}
            onClick={handleOpenCreate}
            disabled={isLoading}
          >
            <Plus size={18} />
            <span>Nueva Pregunta</span>
          </button>
        </div>
      </div>

      {/* Alerta de Notificación */}
      {notification && (
        <div
          className={`${styles.alert} ${
            notification.type === 'success' ? styles.alertSuccess : styles.alertError
          }`}
          role="status"
        >
          <div className={styles.alertContent}>
            {notification.type === 'success' ? (
              <CheckCircle2 size={18} />
            ) : (
              <AlertCircle size={18} />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            className={styles.alertCloseBtn}
            onClick={() => setNotification(null)}
            aria-label="Cerrar aviso"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Listado de Preguntas */}
      {isLoading && faqs.length === 0 ? (
        <div className={styles.emptyState}>
          <Loader2 size={32} className={`animate-spin ${styles.faqTitleIcon}`} />
          <h4 className={styles.emptyStateTitle}>Cargando preguntas frecuentes...</h4>
          <p className={styles.emptyStateText}>
            Conectando con la tabla faq_items en Supabase.
          </p>
        </div>
      ) : faqs.length === 0 ? (
        <div className={styles.emptyState}>
          <HelpCircle size={40} className={styles.faqTitleIcon} />
          <h4 className={styles.emptyStateTitle}>No hay preguntas frecuentes registradas</h4>
          <p className={styles.emptyStateText}>
            Aún no has agregado preguntas o la tabla está vacía. Crea la primera pregunta para
            orientar a tus participantes.
          </p>
          <button type="button" className={styles.addBtn} onClick={handleOpenCreate}>
            <Plus size={18} />
            <span>Crear Primera Pregunta</span>
          </button>
        </div>
      ) : (
        <div className={styles.faqList}>
          {faqs.map((item, index) => {
            const isFirst = index === 0;
            const isLast = index === faqs.length - 1;

            return (
              <div
                key={item.id || index}
                className={`${styles.faqItemCard} ${
                  !item.is_published ? styles.faqItemCardUnpublished : ''
                }`}
              >
                <div className={styles.itemHeader}>
                  <div className={styles.itemHeaderLeft}>
                    <span className={styles.orderBadge} title={`Orden de visualización: ${item.sort_order ?? 0}`}>
                      #{index + 1}
                    </span>

                    {item.is_published ? (
                      <span className={styles.statusBadgePublished}>
                        <CheckCircle2 size={13} />
                        Publicada
                      </span>
                    ) : (
                      <span className={styles.statusBadgeHidden}>
                        <EyeOff size={13} />
                        Oculta (Borrador)
                      </span>
                    )}
                  </div>

                  {/* Acciones de la Tarjeta */}
                  <div className={styles.itemActions}>
                    {/* Reordenar */}
                    <button
                      type="button"
                      className={styles.actionIconBtn}
                      onClick={() => handleMove(index, 'up')}
                      disabled={isFirst || isReordering}
                      title="Mover hacia arriba"
                      aria-label="Mover hacia arriba"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      className={styles.actionIconBtn}
                      onClick={() => handleMove(index, 'down')}
                      disabled={isLast || isReordering}
                      title="Mover hacia abajo"
                      aria-label="Mover hacia abajo"
                    >
                      <ArrowDown size={15} />
                    </button>

                    {/* Alternar publicación */}
                    <button
                      type="button"
                      className={styles.actionToggleBtn}
                      onClick={() => handleTogglePublished(item)}
                      title={item.is_published ? 'Ocultar del portal público' : 'Publicar en el portal público'}
                    >
                      {item.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
                      <span>{item.is_published ? 'Ocultar' : 'Publicar'}</span>
                    </button>

                    {/* Editar */}
                    <button
                      type="button"
                      className={styles.actionIconBtn}
                      onClick={() => handleOpenEdit(item)}
                      title="Editar pregunta"
                      aria-label="Editar"
                    >
                      <Pencil size={15} />
                    </button>

                    {/* Eliminar */}
                    <button
                      type="button"
                      className={`${styles.actionIconBtn} ${styles.actionIconBtnDanger}`}
                      onClick={() => setDeletingFaq(item)}
                      title="Eliminar pregunta"
                      aria-label="Eliminar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <h4 className={styles.itemQuestion}>{item.question}</h4>
                <p className={styles.itemAnswer}>{item.answer}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE CREACIÓN / EDICIÓN */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={handleCloseModal}>
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="faqModalTitle"
          >
            <div className={styles.modalHeader}>
              <h4 id="faqModalTitle" className={styles.modalTitle}>
                {editingId ? <Pencil size={20} /> : <Plus size={20} />}
                {editingId ? 'Editar Pregunta Frecuente' : 'Nueva Pregunta Frecuente'}
              </h4>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={handleCloseModal}
                disabled={isSaving}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className={styles.modalBody}>
                {/* Pregunta */}
                <div className={styles.formGroup}>
                  <label htmlFor="faqQuestionInput" className={styles.formLabel}>
                    <span>
                      Pregunta <span className={styles.formRequired}>*</span>
                    </span>
                    <span className={styles.formHint}>
                      {formQuestion.length}/200 caracteres
                    </span>
                  </label>
                  <input
                    id="faqQuestionInput"
                    type="text"
                    className={styles.formInput}
                    placeholder="Ej: ¿Cómo se determina el número ganador del sorteo?"
                    value={formQuestion}
                    maxLength={200}
                    onChange={(e) => setFormQuestion(e.target.value)}
                    required
                    autoFocus
                    disabled={isSaving}
                  />
                </div>

                {/* Respuesta */}
                <div className={styles.formGroup}>
                  <label htmlFor="faqAnswerInput" className={styles.formLabel}>
                    <span>
                      Respuesta Oficial <span className={styles.formRequired}>*</span>
                    </span>
                    <span className={styles.formHint}>
                      {formAnswer.length}/1000 caracteres
                    </span>
                  </label>
                  <textarea
                    id="faqAnswerInput"
                    className={styles.formTextarea}
                    placeholder="Redacta la respuesta de forma clara, confiable y transparente..."
                    value={formAnswer}
                    maxLength={1000}
                    rows={4}
                    onChange={(e) => setFormAnswer(e.target.value)}
                    required
                    disabled={isSaving}
                  />
                  <span className={styles.formHint}>
                    💡 Consejo: Explica el proceso con claridad para dar máxima confianza y evitar dudas reiteradas.
                  </span>
                </div>

                {/* Fila de Orden y Estado */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="faqSortOrderInput" className={styles.formLabel}>
                      Prioridad / Orden
                    </label>
                    <input
                      id="faqSortOrderInput"
                      type="number"
                      min={0}
                      step={10}
                      className={styles.formInput}
                      value={formSortOrder}
                      onChange={(e) => setFormSortOrder(Number(e.target.value) || 0)}
                      disabled={isSaving}
                    />
                    <span className={styles.formHint}>
                      Menor valor = aparece primero (ej: 10, 20, 30).
                    </span>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Visibilidad Inmediata</label>
                    <label className={styles.switchGroup}>
                      <input
                        type="checkbox"
                        className={styles.switchInput}
                        checked={formIsPublished}
                        onChange={(e) => setFormIsPublished(e.target.checked)}
                        disabled={isSaving}
                      />
                      <span className={styles.switchLabelText}>
                        {formIsPublished ? 'Publicada en la web' : 'Guardar como borrador'}
                      </span>
                    </label>
                    <span className={styles.formHint}>
                      {formIsPublished
                        ? 'Visible para todos los compradores.'
                        : 'Oculta hasta que decidas publicarla.'}
                    </span>
                  </div>
                </div>

                {/* Previsualizador en Tiempo Real */}
                <div className={styles.previewSection}>
                  <div className={styles.previewHeader}>
                    <Sparkles size={14} />
                    <span>Vista Previa en Vivo (Estilo Portal Público)</span>
                  </div>

                  <div className={styles.previewCard}>
                    <div
                      className={styles.previewCardHeader}
                      onClick={() => setIsPreviewOpen((prev) => !prev)}
                      style={{ cursor: 'pointer' }}
                    >
                      <span>
                        {formQuestion.trim() || '¿Aquí aparecerá el texto de tu pregunta?'}
                      </span>
                      {isPreviewOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>

                    {isPreviewOpen && (
                      <div className={styles.previewCardBody}>
                        {formAnswer.trim() ||
                          'Aquí se visualizará el texto completo de tu respuesta oficial cuando el participante haga clic en la pregunta dentro del acordeón de la página.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={handleCloseModal}
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button type="submit" className={styles.saveBtn} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>{editingId ? 'Guardar Cambios' : 'Crear Pregunta'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {/* ========================================================================= */}
      {deletingFaq && (
        <div className={styles.modalOverlay} onClick={() => !isSaving && setDeletingFaq(null)}>
          <div
            className={`${styles.modalCard} ${styles.deleteConfirmModal}`}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="deleteFaqTitle"
          >
            <div className={styles.modalHeader}>
              <h4 id="deleteFaqTitle" className={styles.modalTitle} style={{ color: '#d32f2f' }}>
                <Trash2 size={20} />
                ¿Eliminar Pregunta Frecuente?
              </h4>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => !isSaving && setDeletingFaq(null)}
                disabled={isSaving}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#2b3d32' }}>
                Estás a punto de eliminar de forma permanente la siguiente pregunta frecuente:
              </p>

              <div className={styles.deleteQuestionQuote}>
                &ldquo;{deletingFaq.question}&rdquo;
              </div>

              <p className={styles.deleteWarningText}>
                ⚠️ Esta acción no se puede deshacer. La pregunta dejará de aparecer inmediatamente en el acordeón del portal público.
              </p>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setDeletingFaq(null)}
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={handleDelete}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Sí, Eliminar Pregunta</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

