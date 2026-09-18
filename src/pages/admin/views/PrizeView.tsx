import React, { useState, useEffect, useCallback, useId } from 'react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import {
  getAdminPrizeDetails,
  updatePrizeSettings,
  createPrizeExperience,
  updatePrizeExperience,
  togglePrizeExperienceActive,
  deletePrizeExperience,
  uploadPrizeImage,
  DEFAULT_PRIZE_SETTINGS,
} from '@/services/prizeService';
import type { PrizeSettingsRow, PrizeExperienceRow } from '@/types/raffle.types';
import { fotos } from '@/assets/assets';
import {
  Gift,
  Sparkles,
  Flame,
  Wind,
  Mountain,
  Utensils,
  Camera,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  Eye,
  EyeOff,
  X,
  Loader2,
  Save,
  Users,
  Heart,
  Tent,
  Compass,
  Check,
} from 'lucide-react';
import styles from './PrizeView.module.css';

// Mapeo de iconos seleccionables
const AVAILABLE_ICONS: { [key: string]: { label: string; icon: React.ReactNode } } = {
  Sparkles: { label: 'Destacado', icon: <Sparkles size={18} /> },
  Flame: { label: 'Fogata / Noche', icon: <Flame size={18} /> },
  Wind: { label: 'Viento / Vuelo', icon: <Wind size={18} /> },
  Mountain: { label: 'Montaña', icon: <Mountain size={18} /> },
  Utensils: { label: 'Gastronomía', icon: <Utensils size={18} /> },
  Camera: { label: 'Fotografía', icon: <Camera size={18} /> },
  Tent: { label: 'Glamping', icon: <Tent size={18} /> },
  Compass: { label: 'Aventura', icon: <Compass size={18} /> },
  Heart: { label: 'Romance', icon: <Heart size={18} /> },
};

function renderExperienceIcon(iconName: string, size = 18): React.ReactNode {
  switch (iconName) {
    case 'Flame':
      return <Flame size={size} />;
    case 'Wind':
      return <Wind size={size} />;
    case 'Mountain':
      return <Mountain size={size} />;
    case 'Utensils':
      return <Utensils size={size} />;
    case 'Camera':
      return <Camera size={size} />;
    case 'Tent':
      return <Tent size={size} />;
    case 'Compass':
      return <Compass size={size} />;
    case 'Heart':
      return <Heart size={size} />;
    case 'Sparkles':
    default:
      return <Sparkles size={size} />;
  }
}

export const PrizeView: React.FC = () => {
  const badgeTextId = useId();
  const titleId = useId();
  const subtitleId = useId();
  const expTitleId = useId();
  const expPartnerId = useId();
  const expDescId = useId();
  const expOrderId = useId();
  const newFeatureInputId = useId();
  const [settings, setSettings] = useState<PrizeSettingsRow>(DEFAULT_PRIZE_SETTINGS);
  const [experiences, setExperiences] = useState<PrizeExperienceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado del formulario de cabecera
  const [savingSettings, setSavingSettings] = useState(false);
  const [badgeText, setBadgeText] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');

  // Notificación de respuesta
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExperience, setEditingExperience] = useState<PrizeExperienceRow | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingExperience, setDeletingExperience] = useState<PrizeExperienceRow | null>(null);

  // Estado del formulario de experiencia
  const [expTitle, setExpTitle] = useState('');
  const [expPartner, setExpPartner] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expIcon, setExpIcon] = useState('Sparkles');
  const [expDisplayOrder, setExpDisplayOrder] = useState(1);
  const [expIsActive, setExpIsActive] = useState(true);
  const [expFeatures, setExpFeatures] = useState<string[]>([]);
  const [newFeatureInput, setNewFeatureInput] = useState('');

  // Modo de imagen: 'local' (de fotos de Manaure) o 'upload' (personalizada en Supabase Storage)
  const [imageMode, setImageMode] = useState<'local' | 'upload'>('local');
  const [expImageSlug, setExpImageSlug] = useState('cuatrimoto-flota');
  const [expImageUrl, setExpImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingExperience, setSavingExperience] = useState(false);

  // Mostrar mensaje temporal
  const showFeedback = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Carga de datos
  const loadPrizeData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAdminPrizeDetails();
      setSettings(data.settings);
      setBadgeText(data.settings.badge_text);
      setTitle(data.settings.title);
      setSubtitle(data.settings.subtitle);
      setExperiences(data.experiences);
    } catch (err) {
      console.error('[PrizeView] Error al cargar detalles del premio:', err);
      setError('No fue posible cargar la información del premio.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrizeData();
  }, [loadPrizeData]);

  // Guardar configuración de cabecera
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !subtitle.trim() || !badgeText.trim()) {
      showFeedback('error', 'Todos los campos del encabezado son obligatorios.');
      return;
    }

    try {
      setSavingSettings(true);
      const res = await updatePrizeSettings({
        badge_text: badgeText,
        title,
        subtitle,
      });

      if (res.success && res.data) {
        setSettings(res.data);
        showFeedback('success', '¡Encabezado del premio actualizado correctamente!');
      } else {
        showFeedback('error', res.error || 'Error al guardar encabezado.');
      }
    } catch {
      showFeedback('error', 'Error de conexión al actualizar el encabezado.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Abrir modal de creación
  const handleOpenCreateModal = () => {
    setEditingExperience(null);
    setExpTitle('');
    setExpPartner('');
    setExpDescription('');
    setExpIcon('Sparkles');
    setExpDisplayOrder((experiences.length || 0) + 1);
    setExpIsActive(true);
    setExpFeatures([]);
    setNewFeatureInput('');
    setImageMode('local');
    setExpImageSlug('cuatrimoto-flota');
    setExpImageUrl(null);
    setIsModalOpen(true);
  };

  // Abrir modal de edición
  const handleOpenEditModal = (exp: PrizeExperienceRow) => {
    setEditingExperience(exp);
    setExpTitle(exp.title);
    setExpPartner(exp.partner_name);
    setExpDescription(exp.description);
    setExpIcon(exp.icon || 'Sparkles');
    setExpDisplayOrder(exp.display_order ?? 1);
    setExpIsActive(exp.is_active);

    const parsedFeatures = Array.isArray(exp.features) ? (exp.features as string[]) : [];
    setExpFeatures(parsedFeatures);
    setNewFeatureInput('');

    if (exp.image_url) {
      setImageMode('upload');
      setExpImageUrl(exp.image_url);
      setExpImageSlug(exp.image_slug || 'cuatrimoto-flota');
    } else {
      setImageMode('local');
      setExpImageSlug(exp.image_slug || 'cuatrimoto-flota');
      setExpImageUrl(null);
    }

    setIsModalOpen(true);
  };

  // Alternar estado activo / inactivo
  const handleToggleActive = async (exp: PrizeExperienceRow) => {
    const newState = !exp.is_active;
    try {
      const res = await togglePrizeExperienceActive(exp.id, newState);
      if (res.success) {
        setExperiences((prev) =>
          prev.map((item) => (item.id === exp.id ? { ...item, is_active: newState } : item))
        );
        showFeedback(
          'success',
          `Experiencia ${newState ? 'activada' : 'ocultada'} correctamente.`
        );
      } else {
        showFeedback('error', res.error || 'No fue posible cambiar el estado.');
      }
    } catch {
      showFeedback('error', 'Error al cambiar estado.');
    }
  };

  // Abrir modal de eliminación
  const handleOpenDeleteModal = (exp: PrizeExperienceRow) => {
    setDeletingExperience(exp);
    setIsDeleteModalOpen(true);
  };

  // Confirmar eliminación
  const handleConfirmDelete = async () => {
    if (!deletingExperience) return;
    try {
      const res = await deletePrizeExperience(deletingExperience.id);
      if (res.success) {
        setExperiences((prev) => prev.filter((item) => item.id !== deletingExperience.id));
        showFeedback('success', 'Experiencia eliminada del premio mayor.');
      } else {
        showFeedback('error', res.error || 'No se pudo eliminar la experiencia.');
      }
    } catch {
      showFeedback('error', 'Error de red al intentar eliminar la experiencia.');
    } finally {
      setIsDeleteModalOpen(false);
      setDeletingExperience(null);
    }
  };

  // Gestión de viñetas / características
  const handleAddFeature = () => {
    const clean = newFeatureInput.trim();
    if (!clean) return;
    if (expFeatures.length >= 6) {
      showFeedback('error', 'Máximo 6 beneficios o puntos destacados por experiencia.');
      return;
    }
    setExpFeatures([...expFeatures, clean]);
    setNewFeatureInput('');
  };

  const handleRemoveFeature = (index: number) => {
    setExpFeatures(expFeatures.filter((_, idx) => idx !== index));
  };

  // Subir imagen personalizada a Supabase Storage
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const res = await uploadPrizeImage(file, expPartner || 'premio');
      if (res.success && res.url) {
        setExpImageUrl(res.url);
        setImageMode('upload');
        showFeedback('success', 'Imagen subida exitosamente a Supabase Storage.');
      } else {
        showFeedback('error', res.error || 'Error al subir la imagen.');
      }
    } catch {
      showFeedback('error', 'Error al procesar el archivo.');
    } finally {
      setUploadingImage(false);
    }
  };

  // Guardar experiencia (Crear o Editar)
  const handleSaveExperience = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expTitle.trim() || !expPartner.trim() || !expDescription.trim()) {
      showFeedback('error', 'Por favor diligencia el título, operador y descripción.');
      return;
    }

    try {
      setSavingExperience(true);
      const payload = {
        title: expTitle,
        partner_name: expPartner,
        description: expDescription,
        features: expFeatures,
        icon: expIcon,
        display_order: Number(expDisplayOrder) || 0,
        is_active: expIsActive,
        image_url: imageMode === 'upload' ? expImageUrl : null,
        image_slug: expImageSlug,
      };

      if (editingExperience) {
        const res = await updatePrizeExperience(editingExperience.id, payload);
        if (res.success && res.data) {
          setExperiences((prev) =>
            prev.map((item) => (item.id === editingExperience.id ? res.data! : item))
          );
          showFeedback('success', '¡Experiencia actualizada con éxito!');
          setIsModalOpen(false);
        } else {
          showFeedback('error', res.error || 'Error al actualizar experiencia.');
        }
      } else {
        const res = await createPrizeExperience(payload);
        if (res.success && res.data) {
          setExperiences((prev) => [...prev, res.data!]);
          showFeedback('success', '¡Nueva experiencia agregada al premio!');
          setIsModalOpen(false);
        } else {
          showFeedback('error', res.error || 'Error al crear experiencia.');
        }
      }
    } catch {
      showFeedback('error', 'Error inesperado al guardar la experiencia.');
    } finally {
      setSavingExperience(false);
    }
  };

  // Resolver imagen para renderizado en tarjeta
  const getExperienceImageSource = (exp: PrizeExperienceRow): string => {
    if (exp.image_url) {
      return exp.image_url;
    }
    const match = fotos.find((f) => f.slug === exp.image_slug);
    return match ? match.cardJpg : fotos[0].cardJpg;
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <AdminPageHeader
          title="Gestión del Premio Mayor"
          description="Cargando configuración y catálogo del premio..."
          badge="Cargando"
        />
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <Loader2 size={36} className="animate-spin" style={{ color: '#f59e0b' }} />
        </div>
      </div>
    );
  }

  if (error && experiences.length === 0) {
    return (
      <div className={styles.container}>
        <AdminPageHeader
          title="Gestión del Premio Mayor"
          description="Error al cargar la información."
          badge="Error"
        />
        <AdminErrorState message={error} onRetry={loadPrizeData} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Encabezado Superior */}
      <AdminPageHeader
        title="Gestión del Premio Mayor"
        description="Administra el paquete completo, textos de presentación y las experiencias o actividades premiadas."
        badge="Premio Mayor"
        actions={
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className={styles.btnPrimary}
          >
            <Plus size={18} />
            <span>Nueva Experiencia</span>
          </button>
        }
      />

      {/* Banner de Notificación */}
      {notification && (
        <div
          className={`${styles.notificationBanner} ${
            notification.type === 'success' ? styles.bannerSuccess : styles.bannerError
          }`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {notification.type === 'success' ? (
              <CheckCircle2 size={18} />
            ) : (
              <AlertCircle size={18} />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className={styles.modalCloseBtn}
            aria-label="Cerrar aviso"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Tarjeta 1: Textos de Presentación y Cabecera de la Sección */}
      <div className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <div className={styles.cardIconBox}>
              <Users size={20} />
            </div>
            <div>
              <h2 className={styles.cardTitle}>Encabezado del Premio en la Landing</h2>
              <p className={styles.cardSubtitle}>
                Edita el distintivo, título principal y la descripción introductoria.{' '}
                {settings.updated_at && (
                  <span>
                    (Última edición:{' '}
                    {new Date(settings.updated_at).toLocaleDateString('es-CO')})
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveSettings} className={styles.settingsForm}>
          <div className={styles.formGroup}>
            <label htmlFor={badgeTextId} className={styles.label}>
              <Sparkles size={14} style={{ color: '#f59e0b' }} />
              Distintivo / Badge Superior
            </label>
            <input
              id={badgeTextId}
              type="text"
              className={styles.input}
              placeholder="Ej: Paquete Todo Incluido para 2 Personas"
              value={badgeText}
              onChange={(e) => setBadgeText(e.target.value)}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor={titleId} className={styles.label}>
              <Gift size={14} style={{ color: '#f59e0b' }} />
              Título Principal de la Sección
            </label>
            <input
              id={titleId}
              type="text"
              className={styles.input}
              placeholder="Ej: ¿Qué incluye el Premio Mayor?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className={`${styles.formGroup} ${styles.fullWidth}`}>
            <label htmlFor={subtitleId} className={styles.label}>
              Descripción / Subtítulo Introductorio
            </label>
            <textarea
              id={subtitleId}
              className={styles.textarea}
              placeholder="Describe en una o dos oraciones el valor global de la experiencia..."
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              rows={2}
              required
            />
          </div>

          <div className={`${styles.settingsActions} ${styles.fullWidth}`}>
            <button type="submit" disabled={savingSettings} className={styles.btnPrimary}>
              {savingSettings ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Guardar Encabezado</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Tarjeta 2: Catálogo de Experiencias y Actividades */}
      <section className={styles.experiencesSection}>
        <div className={styles.sectionBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h2 className={styles.sectionTitle}>
              <Gift size={20} style={{ color: '#f59e0b' }} />
              Experiencias y Actividades Incluidas
            </h2>
            <span className={styles.countBadge}>
              {experiences.filter((e) => e.is_active).length} activas / {experiences.length} totales
            </span>
          </div>

          <button type="button" onClick={handleOpenCreateModal} className={styles.btnPrimary}>
            <Plus size={16} />
            <span>Agregar Actividad</span>
          </button>
        </div>

        {experiences.length === 0 ? (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              background: '#11221c',
              borderRadius: '16px',
              border: '1px dashed rgba(156,181,171,0.2)',
            }}
          >
            <p style={{ color: '#9cb5ab', margin: '0 0 1rem 0' }}>
              No hay actividades registradas en el premio mayor aún.
            </p>
            <button type="button" onClick={handleOpenCreateModal} className={styles.btnPrimary}>
              <Plus size={16} />
              <span>Crear la primera experiencia</span>
            </button>
          </div>
        ) : (
          <div className={styles.cardsGrid}>
            {experiences.map((exp) => {
              const imageSrc = getExperienceImageSource(exp);
              const featuresList = Array.isArray(exp.features) ? (exp.features as string[]) : [];

              return (
                <div
                  key={exp.id}
                  className={`${styles.experienceCard} ${!exp.is_active ? styles.cardInactive : ''}`}
                >
                  <div className={styles.imageContainer}>
                    <img
                      src={imageSrc}
                      alt={exp.title}
                      className={styles.cardImg}
                      loading="lazy"
                    />
                    <span className={styles.partnerTag}>{exp.partner_name}</span>
                    <span className={styles.orderBadge}>#{exp.display_order}</span>
                  </div>

                  <div className={styles.cardBody}>
                    <div className={styles.cardTitleRow}>
                      <div className={styles.itemIconBox}>
                        {renderExperienceIcon(exp.icon, 16)}
                      </div>
                      <h3 className={styles.itemTitle}>{exp.title}</h3>
                    </div>

                    <p className={styles.itemDescription}>{exp.description}</p>

                    {featuresList.length > 0 && (
                      <div className={styles.featureChips}>
                        {featuresList.slice(0, 3).map((feat, idx) => (
                          <span key={idx} className={styles.featureChip}>
                            ✓ {feat}
                          </span>
                        ))}
                        {featuresList.length > 3 && (
                          <span className={styles.featureChip}>
                            +{featuresList.length - 3} más
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={styles.cardFooter}>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(exp)}
                      className={`${styles.statusToggle} ${
                        exp.is_active ? styles.statusActive : styles.statusInactive
                      }`}
                      title={exp.is_active ? 'Haga clic para ocultar' : 'Haga clic para activar'}
                    >
                      {exp.is_active ? (
                        <>
                          <Eye size={14} />
                          <span>Visible</span>
                        </>
                      ) : (
                        <>
                          <EyeOff size={14} />
                          <span>Oculto</span>
                        </>
                      )}
                    </button>

                    <div className={styles.actionButtons}>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(exp)}
                        className={styles.btnIcon}
                        aria-label="Editar experiencia"
                        title="Editar experiencia"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDeleteModal(exp)}
                        className={`${styles.btnIcon} ${styles.btnIconDanger}`}
                        aria-label="Eliminar experiencia"
                        title="Eliminar experiencia"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal: Crear / Editar Experiencia */}
      {isModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {editingExperience ? 'Editar Actividad del Premio' : 'Nueva Actividad del Premio'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className={styles.modalCloseBtn}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveExperience} style={{ display: 'contents' }}>
              <div className={styles.modalBody}>
                {/* Título y Operador */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className={styles.formGroup}>
                    <label htmlFor={expTitleId} className={styles.label}>
                      Título de la Experiencia
                    </label>
                    <input
                      id={expTitleId}
                      type="text"
                      className={styles.input}
                      placeholder="Ej: Vuelo en Parapente Tándem"
                      value={expTitle}
                      onChange={(e) => setExpTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor={expPartnerId} className={styles.label}>
                      Aliado u Operador
                    </label>
                    <input
                      id={expPartnerId}
                      type="text"
                      className={styles.input}
                      placeholder="Ej: Manaure Aventura"
                      value={expPartner}
                      onChange={(e) => setExpPartner(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Icono temático */}
                <div className={styles.formGroup}>
                  <span className={styles.label}>Icono Representativo</span>
                  <div className={styles.iconGrid}>
                    {Object.entries(AVAILABLE_ICONS).map(([key, item]) => {
                      const isSelected = expIcon === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setExpIcon(key)}
                          className={`${styles.iconOption} ${
                            isSelected ? styles.iconOptionSelected : ''
                          }`}
                        >
                          {item.icon}
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Imagen de la experiencia */}
                <div className={styles.formGroup}>
                  <span className={styles.label}>Fotografía de la Experiencia</span>
                  <div className={styles.imageSelectorTabs}>
                    <button
                      type="button"
                      className={`${styles.tabBtn} ${
                        imageMode === 'local' ? styles.tabBtnActive : ''
                      }`}
                      onClick={() => setImageMode('local')}
                    >
                      <ImageIcon size={14} style={{ display: 'inline', marginRight: '4px' }} />
                      Fotos de Manaure
                    </button>
                    <button
                      type="button"
                      className={`${styles.tabBtn} ${
                        imageMode === 'upload' ? styles.tabBtnActive : ''
                      }`}
                      onClick={() => setImageMode('upload')}
                    >
                      <Upload size={14} style={{ display: 'inline', marginRight: '4px' }} />
                      Subir Foto Propia
                    </button>
                  </div>

                  {imageMode === 'local' ? (
                    <div className={styles.localPhotosGrid}>
                      {fotos.map((f) => {
                        const isSelected = expImageSlug === f.slug;
                        return (
                          <button
                            type="button"
                            key={f.slug}
                            className={`${styles.photoThumbOption} ${
                              isSelected ? styles.photoThumbSelected : ''
                            }`}
                            onClick={() => setExpImageSlug(f.slug)}
                            title={f.alt}
                          >
                            <img src={f.thumb} alt={f.alt} className={styles.thumbImg} />
                            {isSelected && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 4,
                                  right: 4,
                                  background: '#f59e0b',
                                  color: '#0a1410',
                                  borderRadius: '50%',
                                  padding: '2px',
                                  display: 'flex',
                                }}
                              >
                                <Check size={12} strokeWidth={3} />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div>
                      <label className={styles.uploadBox}>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileChange}
                          style={{ display: 'none' }}
                          disabled={uploadingImage}
                        />
                        {uploadingImage ? (
                          <>
                            <Loader2
                              size={24}
                              className="animate-spin"
                              style={{ color: '#f59e0b' }}
                            />
                            <span style={{ fontSize: '0.85rem', color: '#9cb5ab' }}>
                              Subiendo imagen a Supabase Storage...
                            </span>
                          </>
                        ) : expImageUrl ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '1rem',
                              width: '100%',
                            }}
                          >
                            <img
                              src={expImageUrl}
                              alt="Vista previa"
                              style={{
                                width: '70px',
                                height: '50px',
                                objectFit: 'cover',
                                borderRadius: '6px',
                              }}
                            />
                            <div style={{ textAlign: 'left', flex: 1 }}>
                              <p
                                style={{
                                  fontSize: '0.85rem',
                                  color: '#f3f7f5',
                                  margin: 0,
                                  fontWeight: 600,
                                }}
                              >
                                Imagen cargada con éxito
                              </p>
                              <span style={{ fontSize: '0.75rem', color: '#9cb5ab' }}>
                                Haz clic aquí para reemplazarla
                              </span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <Upload size={24} style={{ color: '#f59e0b' }} />
                            <span
                              style={{ fontSize: '0.85rem', color: '#f3f7f5', fontWeight: 600 }}
                            >
                              Selecciona o arrastra una foto (JPG, PNG, WebP)
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#5e7a6f' }}>
                              Máximo 5 MB. Se alojará de forma segura en la nube.
                            </span>
                          </>
                        )}
                      </label>
                    </div>
                  )}
                </div>

                {/* Descripción */}
                <div className={styles.formGroup}>
                  <label htmlFor={expDescId} className={styles.label}>
                    Descripción de la Experiencia
                  </label>
                  <textarea
                    id={expDescId}
                    className={styles.textarea}
                    placeholder="Describe en qué consiste la actividad para los ganadores..."
                    value={expDescription}
                    onChange={(e) => setExpDescription(e.target.value)}
                    rows={2}
                    required
                  />
                </div>

                {/* Beneficios / Puntos clave */}
                <div className={styles.formGroup}>
                  <span className={styles.label}>
                    <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                    Beneficios o Puntos Incluidos (Viñetas)
                  </span>
                  <div className={styles.featureList}>
                    {expFeatures.map((feat, idx) => (
                      <div key={idx} className={styles.featureRow}>
                        <input
                          type="text"
                          className={styles.featureInput}
                          value={feat}
                          aria-label={`Beneficio ${idx + 1}`}
                          onChange={(e) => {
                            const updated = [...expFeatures];
                            updated[idx] = e.target.value;
                            setExpFeatures(updated);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveFeature(idx)}
                          className={styles.btnIcon}
                          aria-label="Quitar beneficio"
                          title="Eliminar beneficio"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}

                    <div className={styles.addFeatureRow}>
                      <input
                        id={newFeatureInputId}
                        type="text"
                        className={styles.featureInput}
                        placeholder="Ej: Desayuno campestre incluido..."
                        value={newFeatureInput}
                        onChange={(e) => setNewFeatureInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddFeature();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAddFeature}
                        className={styles.btnSecondary}
                        style={{ padding: '0.5rem 0.85rem' }}
                      >
                        <Plus size={15} />
                        <span>Agregar</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Orden y Estado */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className={styles.formGroup}>
                    <label htmlFor={expOrderId} className={styles.label}>
                      Orden de Posición
                    </label>
                    <input
                      id={expOrderId}
                      type="number"
                      className={styles.input}
                      value={expDisplayOrder}
                      onChange={(e) => setExpDisplayOrder(Number(e.target.value))}
                      min={1}
                      max={99}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <span className={styles.label}>Visibilidad</span>
                    <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          cursor: 'pointer',
                          color: '#f3f7f5',
                          fontSize: '0.9rem',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={expIsActive}
                          onChange={(e) => setExpIsActive(e.target.checked)}
                          style={{ accentColor: '#f59e0b', width: '18px', height: '18px' }}
                        />
                        <span>Mostrar en la landing page</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={styles.btnSecondary}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={savingExperience} className={styles.btnPrimary}>
                  {savingExperience ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Guardar Actividad</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmación de Eliminación */}
      {isDeleteModalOpen && deletingExperience && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: '420px' }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>¿Eliminar Experiencia?</h2>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className={styles.modalCloseBtn}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p style={{ color: '#9cb5ab', margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
                ¿Estás seguro de que deseas eliminar permanentemente la experiencia{' '}
                <strong style={{ color: '#f3f7f5' }}>"{deletingExperience.title}"</strong> de{' '}
                <strong style={{ color: '#f59e0b' }}>{deletingExperience.partner_name}</strong>?
                Esta acción retirará la tarjeta de la landing page.
              </p>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className={styles.btnSecondary}
              >
                Cancelar
              </button>
              <button type="button" onClick={handleConfirmDelete} className={styles.btnDanger}>
                <Trash2 size={16} />
                <span>Sí, Eliminar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

