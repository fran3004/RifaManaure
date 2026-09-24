import React, { useState, useEffect, useCallback, useId } from 'react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import { normalizeAppError, logAppError } from '@/lib/errorHandling';
import {
  getAdminPrizeDetails,
  updatePrizeSettings,
  createPrizeExperience,
  updatePrizeExperience,
  togglePrizeExperienceActive,
  deletePrizeExperience,
  uploadPrizeImage,
  DEFAULT_PRIZE_SETTINGS,
  DEFAULT_OFFICIAL_TOUR_FEATURES,
} from '@/services/prizeService';
import { getOptimizedCloudinaryUrl } from '@/services/cloudinaryService';
import type { PrizeSettingsRow, PrizeExperienceRow, OfficialTourFeature } from '@/types/raffle.types';
import {
  catalogoFotosManaure,
  resolveExperienceImage,
  type CatalogoFotoItem,
} from '@/assets/assets';
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
  Trophy,
  ArrowUp,
  ArrowDown,
  Info,
} from 'lucide-react';
import styles from './PrizeView.module.css';

// Mapeo de iconos seleccionables para experiencias
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

type PhotoCategory =
  | 'todas'
  | 'gastronomia'
  | 'cuatrimoto'
  | 'glamping'
  | 'hospedaje'
  | 'parapente'
  | 'serrania';

const PHOTO_CATEGORY_TABS: { key: PhotoCategory; label: string }[] = [
  { key: 'todas', label: 'Todas las fotos' },
  { key: 'gastronomia', label: 'Gastronomía' },
  { key: 'cuatrimoto', label: 'Cuatrimotos' },
  { key: 'glamping', label: 'Glamping & Fogata' },
  { key: 'hospedaje', label: 'Hospedaje' },
  { key: 'parapente', label: 'Parapente' },
  { key: 'serrania', label: 'Serranía del Perijá' },
];

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
  const officialBadgeId = useId();
  const officialTitleId = useId();
  const officialSubtitleId = useId();
  const expTitleId = useId();
  const expPartnerId = useId();
  const expDescId = useId();
  const expOrderId = useId();
  const newFeatureInputId = useId();

  const [settings, setSettings] = useState<PrizeSettingsRow>(DEFAULT_PRIZE_SETTINGS);
  const [experiences, setExperiences] = useState<PrizeExperienceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);

  // Estado del formulario de cabecera general
  const [savingSettings, setSavingSettings] = useState(false);
  const [badgeText, setBadgeText] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');

  // Estado del formulario del Premio Mayor Oficial (Banner Verde)
  const [savingOfficialTour, setSavingOfficialTour] = useState(false);
  const [officialTourBadge, setOfficialTourBadge] = useState('PREMIO MAYOR OFICIAL');
  const [officialTourTitle, setOfficialTourTitle] = useState('Tour Vive Manaure • 3 Días y 2 Noches');
  const [officialTourSubtitle, setOfficialTourSubtitle] = useState(
    'Todo incluido para la pareja (2 personas). Especificación detallada del premio:'
  );
  const [officialTourFeatures, setOfficialTourFeatures] = useState<OfficialTourFeature[]>(
    DEFAULT_OFFICIAL_TOUR_FEATURES
  );
  const [newTourItemTitle, setNewTourItemTitle] = useState('');
  const [newTourItemDesc, setNewTourItemDesc] = useState('');

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

  // Modo de imagen y catálogo
  const [imageMode, setImageMode] = useState<'local' | 'upload'>('local');
  const [photoCategoryFilter, setPhotoCategoryFilter] = useState<PhotoCategory>('todas');
  const [expImageSlug, setExpImageSlug] = useState('cuatrimoto-flota');
  const [expImageUrl, setExpImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingExperience, setSavingExperience] = useState(false);

  // Diagnóstico de imagen subida (client-side pre-flight)
  const [uploadMeta, setUploadMeta] = useState<{
    width?: number;
    height?: number;
    aspectRatio?: string;
    fileSizeKB?: number;
    isOptimal?: boolean;
    warning?: string | null;
  } | null>(null);

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

      // Cargar campos del Premio Mayor Oficial
      setOfficialTourBadge(data.settings.official_tour_badge || 'PREMIO MAYOR OFICIAL');
      setOfficialTourTitle(data.settings.official_tour_title || 'Tour Vive Manaure • 3 Días y 2 Noches');
      setOfficialTourSubtitle(
        data.settings.official_tour_subtitle ||
          'Todo incluido para la pareja (2 personas). Especificación detallada del premio:'
      );

      const tourFeats: OfficialTourFeature[] =
        Array.isArray(data.settings.official_tour_features) &&
        (data.settings.official_tour_features as any[]).length > 0
          ? (data.settings.official_tour_features as any[]).map((f) => {
              if (typeof f === 'string') return { title: '', description: f };
              return { title: f.title || '', description: f.description || '', icon: f.icon };
            })
          : DEFAULT_OFFICIAL_TOUR_FEATURES;

      setOfficialTourFeatures(tourFeats);
      setExperiences(data.experiences);
      setIsForbidden(false);
    } catch (err) {
      const normalized = normalizeAppError(
        err,
        'No fue posible cargar la información del premio.'
      );
      logAppError('PrizeView.loadPrizeData', normalized);
      setError(normalized.userMessage);
      setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrizeData();
  }, [loadPrizeData]);

  // Guardar configuración de cabecera general
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

  // Guardar configuración del Banner Verde Oficial (Tour Vive Manaure)
  const handleSaveOfficialTour = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!officialTourTitle.trim() || !officialTourBadge.trim()) {
      showFeedback('error', 'El distintivo y título del tour oficial son obligatorios.');
      return;
    }

    try {
      setSavingOfficialTour(true);
      const res = await updatePrizeSettings({
        official_tour_badge: officialTourBadge,
        official_tour_title: officialTourTitle,
        official_tour_subtitle: officialTourSubtitle,
        official_tour_features: officialTourFeatures,
      });

      if (res.success && res.data) {
        setSettings(res.data);
        showFeedback('success', '¡Banner oficial del Premio Mayor actualizado correctamente!');
      } else {
        showFeedback('error', res.error || 'Error al guardar el banner oficial.');
      }
    } catch {
      showFeedback('error', 'Error de conexión al actualizar el banner oficial.');
    } finally {
      setSavingOfficialTour(false);
    }
  };

  // Gestión de especificaciones del tour oficial
  const handleAddTourFeature = () => {
    const desc = newTourItemDesc.trim();
    if (!desc) return;
    setOfficialTourFeatures([
      ...officialTourFeatures,
      {
        title: newTourItemTitle.trim(),
        description: desc,
      },
    ]);
    setNewTourItemTitle('');
    setNewTourItemDesc('');
  };

  const handleRemoveTourFeature = (index: number) => {
    setOfficialTourFeatures(officialTourFeatures.filter((_, idx) => idx !== index));
  };

  const handleMoveTourFeature = (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= officialTourFeatures.length) return;
    const updated = [...officialTourFeatures];
    const temp = updated[index];
    updated[index] = updated[newIdx];
    updated[newIdx] = temp;
    setOfficialTourFeatures(updated);
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
    setPhotoCategoryFilter('todas');
    setExpImageSlug('cuatrimoto-aventura-cordillera');
    setExpImageUrl(null);
    setUploadMeta(null);
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
    setUploadMeta(null);

    if (exp.image_url) {
      setImageMode('upload');
      setExpImageUrl(exp.image_url);
      setExpImageSlug(exp.image_slug || 'cuatrimoto-flota');
    } else {
      setImageMode('local');
      // Si es gastronomía y tenía slug antiguo, preseleccionar La Casa de las Arepas
      const defaultSlug =
        exp.title.toLowerCase().includes('gastron') &&
        (!exp.image_slug || exp.image_slug === 'serrania-perija-panoramica')
          ? 'gastronomia-casa-arepas'
          : exp.image_slug || 'cuatrimoto-flota';
      setExpImageSlug(defaultSlug);
      setExpImageUrl(null);

      // Si la foto pertenece a una categoría específica, pre-filtrar esa pestaña
      const match = catalogoFotosManaure.find((f) => f.slug === defaultSlug);
      if (match) {
        setPhotoCategoryFilter(match.categoria);
      } else {
        setPhotoCategoryFilter('todas');
      }
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

  // Subir imagen personalizada a Cloudinary con análisis previo de calidad
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileSizeKB = Math.round(file.size / 1024);
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      let ratioLabel = `${w} × ${h}`;
      if (Math.abs(w / h - 4 / 5) < 0.12) ratioLabel = '4:5 (Vertical ideal para tarjetas)';
      else if (Math.abs(w / h - 3 / 2) < 0.12) ratioLabel = '3:2 (Horizontal estándar)';
      else if (Math.abs(w / h - 16 / 9) < 0.12) ratioLabel = '16:9 (Panorámico)';
      else if (Math.abs(w / h - 1) < 0.05) ratioLabel = '1:1 (Cuadrado)';

      let warning = null;
      let isOptimal = true;
      if (w < 600 || h < 400) {
        warning = 'Resolución inferior a 600×400 px; la imagen podría verse borrosa.';
        isOptimal = false;
      } else if (fileSizeKB > 2048) {
        warning = 'El archivo supera los 2 MB. Podría ralentizar la carga en móviles.';
        isOptimal = false;
      }

      setUploadMeta({
        width: w,
        height: h,
        aspectRatio: ratioLabel,
        fileSizeKB,
        isOptimal,
        warning,
      });

      try {
        setUploadingImage(true);
        const res = await uploadPrizeImage(file, expPartner || 'premio');
        if (res.success && res.url) {
          setExpImageUrl(res.url);
          setImageMode('upload');
          showFeedback('success', 'Imagen subida exitosamente a Cloudinary.');
        } else {
          showFeedback('error', res.error || 'Error al subir la imagen.');
        }
      } catch {
        showFeedback('error', 'Error al procesar el archivo.');
      } finally {
        setUploadingImage(false);
      }
    };

    img.src = objectUrl;
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

  // Filtrado de fotos locales por categoría
  const filteredLocalPhotos =
    photoCategoryFilter === 'todas'
      ? catalogoFotosManaure
      : catalogoFotosManaure.filter((f) => f.categoria === photoCategoryFilter);

  // URL de la imagen que se está previsualizando en el modal
  const currentModalImagePreview =
    imageMode === 'upload' && expImageUrl
      ? getOptimizedCloudinaryUrl(expImageUrl, { width: 600 })
      : resolveExperienceImage(expImageSlug, expImageUrl);

  if (loading) {
    return (
      <div className={styles.container}>
        <AdminPageHeader
          title="Gestión del Premio Mayor"
          description="Cargando configuración y catálogo del premio..."
          badge="Cargando"
        />
        <div className={styles.loadingContainer}>
          <Loader2 size={36} className={`animate-spin ${styles.loaderBrand}`} />
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
        <AdminErrorState
          title={isForbidden ? 'Acceso Restringido' : 'Error al cargar información del premio'}
          message={error}
          isForbidden={isForbidden}
          onRetry={loadPrizeData}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Encabezado Superior */}
      <AdminPageHeader
        title="Gestión del Premio Mayor"
        description="Administra los textos principales, el banner oficial del tour y las experiencias ecoturísticas del premio."
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
          <div className={styles.notificationContent}>
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
              <h2 className={styles.sectionHeaderTitle}>Encabezado de la Sección en la Landing</h2>
              <p className={styles.cardSubtitle}>
                Edita el distintivo superior, título y descripción general de la sección del premio.{' '}
                {settings.updated_at && (
                  <span>
                    (Última edición: {new Date(settings.updated_at).toLocaleDateString('es-CO')})
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveSettings} className={styles.settingsForm}>
          <div className={styles.formGroup}>
            <label htmlFor={badgeTextId} className={styles.label}>
              <Sparkles size={14} className={styles.labelIcon} />
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
              <Gift size={14} className={styles.labelIcon} />
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

      {/* Tarjeta 2: Banner Verde Oficial del Premio Mayor (Tour Vive Manaure) */}
      <div className={styles.officialTourCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <div className={styles.officialTourCardIconBox}>
              <Trophy size={22} />
            </div>
            <div>
              <h2 className={styles.sectionHeaderTitle}>Premio Mayor Oficial (Banner Verde)</h2>
              <p className={styles.cardSubtitle}>
                Administra el banner destacado del tour completo y los 8 ítems de especificación detallada para la pareja.
              </p>
            </div>
          </div>
        </div>

        {/* Vista previa en vivo del Banner Verde */}
        <div className={styles.officialTourPreview}>
          <div className={styles.tourPreviewHeader}>
            <div className={styles.tourPreviewIcon}>
              <Trophy size={20} />
            </div>
            <div>
              <span className={styles.tourPreviewEyebrow}>
                {officialTourBadge || 'PREMIO MAYOR OFICIAL'}
              </span>
              <h3 className={styles.tourPreviewTitle}>
                {officialTourTitle || 'Tour Vive Manaure • 3 Días y 2 Noches'}
              </h3>
              <p className={styles.tourPreviewSubtitle}>
                {officialTourSubtitle ||
                  'Todo incluido para la pareja (2 personas). Especificación detallada del premio:'}
              </p>
            </div>
          </div>

          <div className={styles.tourPreviewFeaturesGrid}>
            {officialTourFeatures.map((feat, idx) => (
              <div key={idx} className={styles.tourPreviewFeatureItem}>
                <Sparkles size={14} className={styles.tourPreviewFeatureIcon} />
                <span>
                  {feat.title && <strong>{feat.title} </strong>}
                  {feat.description}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Formulario de edición del Tour Oficial */}
        <form onSubmit={handleSaveOfficialTour} className={styles.settingsForm}>
          <div className={styles.formGroup}>
            <label htmlFor={officialBadgeId} className={styles.label}>
              <Trophy size={14} className={styles.labelIcon} />
              Insignia del Tour
            </label>
            <input
              id={officialBadgeId}
              type="text"
              className={styles.input}
              placeholder="Ej: PREMIO MAYOR OFICIAL"
              value={officialTourBadge}
              onChange={(e) => setOfficialTourBadge(e.target.value)}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor={officialTitleId} className={styles.label}>
              <Sparkles size={14} className={styles.labelIcon} />
              Título del Tour
            </label>
            <input
              id={officialTitleId}
              type="text"
              className={styles.input}
              placeholder="Ej: Tour Vive Manaure • 3 Días y 2 Noches"
              value={officialTourTitle}
              onChange={(e) => setOfficialTourTitle(e.target.value)}
              required
            />
          </div>

          <div className={`${styles.formGroup} ${styles.fullWidth}`}>
            <label htmlFor={officialSubtitleId} className={styles.label}>
              Subtítulo / Condición del Tour
            </label>
            <input
              id={officialSubtitleId}
              type="text"
              className={styles.input}
              placeholder="Ej: Todo incluido para la pareja (2 personas). Especificación detallada del premio:"
              value={officialTourSubtitle}
              onChange={(e) => setOfficialTourSubtitle(e.target.value)}
              required
            />
          </div>

          {/* Editor de ítems del Tour */}
          <div className={`${styles.formGroup} ${styles.fullWidth}`}>
            <span className={styles.label}>
              <CheckCircle2 size={14} className={styles.labelIconSuccess} />
              Especificaciones Detalladas ({officialTourFeatures.length} ítems)
            </span>

            <div className={styles.tourFeaturesEditor}>
              {officialTourFeatures.map((feat, idx) => (
                <div key={idx} className={styles.tourFeatureEditRow}>
                  <input
                    type="text"
                    className={styles.tourFeatureInputTitle}
                    placeholder="Etiqueta (ej: Hospedaje:)"
                    value={feat.title}
                    onChange={(e) => {
                      const updated = [...officialTourFeatures];
                      updated[idx] = { ...updated[idx], title: e.target.value };
                      setOfficialTourFeatures(updated);
                    }}
                  />
                  <input
                    type="text"
                    className={styles.tourFeatureInputDesc}
                    placeholder="Descripción detallada del beneficio..."
                    value={feat.description}
                    onChange={(e) => {
                      const updated = [...officialTourFeatures];
                      updated[idx] = { ...updated[idx], description: e.target.value };
                      setOfficialTourFeatures(updated);
                    }}
                  />
                  <div className={styles.tourFeatureRowActions}>
                    <button
                      type="button"
                      onClick={() => handleMoveTourFeature(idx, 'up')}
                      disabled={idx === 0}
                      className={styles.btnMove}
                      title="Mover arriba"
                      aria-label="Mover arriba"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveTourFeature(idx, 'down')}
                      disabled={idx === officialTourFeatures.length - 1}
                      className={styles.btnMove}
                      title="Mover abajo"
                      aria-label="Mover abajo"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveTourFeature(idx)}
                      className={`${styles.btnIcon} ${styles.btnIconDanger}`}
                      title="Eliminar especificación"
                      aria-label="Eliminar especificación"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Agregar nuevo ítem */}
              <div className={styles.addTourFeatureRow}>
                <input
                  type="text"
                  className={styles.tourFeatureInputTitle}
                  placeholder="Nueva etiqueta (ej: Seguro:)"
                  value={newTourItemTitle}
                  onChange={(e) => setNewTourItemTitle(e.target.value)}
                />
                <input
                  type="text"
                  className={styles.tourFeatureInputDesc}
                  placeholder="Detalle del nuevo beneficio incluido..."
                  value={newTourItemDesc}
                  onChange={(e) => setNewTourItemDesc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTourFeature();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddTourFeature}
                  className={styles.btnPrimary}
                  style={{ minHeight: '34px', padding: '0.4rem 0.9rem' }}
                >
                  <Plus size={14} />
                  <span>Agregar</span>
                </button>
              </div>
            </div>
          </div>

          <div className={`${styles.settingsActions} ${styles.fullWidth}`}>
            <button type="submit" disabled={savingOfficialTour} className={styles.btnPrimary}>
              {savingOfficialTour ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Guardando Tour Oficial...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Guardar Banner Oficial</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Tarjeta 3: Catálogo de Experiencias y Actividades */}
      <section className={styles.experiencesSection}>
        <div className={styles.sectionBar}>
          <div className={styles.sectionBarTitleGroup}>
            <h2 className={styles.sectionTitle}>
              <Gift size={20} className={styles.sectionTitleIcon} />
              Experiencias y Actividades Incluidas
            </h2>
            <span className={styles.countBadge}>
              {experiences.filter((e) => e.is_active).length} activas / {experiences.length} totales
            </span>
          </div>

          <button type="button" onClick={handleOpenCreateModal} className={styles.btnPrimary}>
            <Plus size={16} />
            <span>Nueva Experiencia</span>
          </button>
        </div>

        {experiences.length === 0 ? (
          <div className={styles.emptyStateContainer}>
            <p className={styles.emptyStateText}>
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
              const imageSrc = resolveExperienceImage(exp.image_slug, exp.image_url);
              const featuresList = Array.isArray(exp.features) ? (exp.features as string[]) : [];

              return (
                <div
                  key={exp.id}
                  className={`${styles.experienceCard} ${!exp.is_active ? styles.cardInactive : ''}`}
                >
                  <div className={styles.cardMedia}>
                    <img
                      src={imageSrc}
                      alt={exp.title}
                      className={styles.cardImg}
                      loading="lazy"
                    />
                    <div className={styles.cardScrim} />
                  </div>

                  <div className={styles.cardInner}>
                    <div className={styles.cardTopBar}>
                      <div className={styles.topBarRow}>
                        <span className={styles.pillDarkGold}>
                          {`EXPERIENCIA ${String(exp.display_order || 1).padStart(2, '0')}`}
                        </span>
                        <div className={styles.topGlassBadge} aria-hidden="true">
                          <Compass size={16} />
                        </div>
                      </div>
                      {exp.partner_name && (
                        <div className={styles.partnerRow}>
                          <span className={styles.pillSolidAmber}>{exp.partner_name}</span>
                        </div>
                      )}
                    </div>

                    <div className={styles.cardBody}>
                      <div className={styles.titleGlassIcon} aria-hidden="true">
                        {renderExperienceIcon(exp.icon, 22)}
                      </div>
                      <h3 className={styles.expCardTitle}>{exp.title}</h3>

                      <p className={styles.expCardDescription}>{exp.description}</p>

                      {featuresList.length > 0 && (
                        <>
                          <hr className={styles.expCardDivider} />
                          <ul className={styles.cardFeatureList}>
                            {featuresList.map((feat, idx) => (
                              <li key={idx} className={styles.cardFeatureItem}>
                                <Sparkles size={15} aria-hidden="true" className={styles.cardFeatureIcon} />
                                <span>{feat}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
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
          <div className={styles.modalContent} style={{ maxWidth: '860px' }}>
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

            <form onSubmit={handleSaveExperience} className={styles.formContents}>
              <div className={styles.modalBody}>
                {/* Título y Operador */}
                <div className={styles.modalGridRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor={expTitleId} className={styles.label}>
                      Título de la Experiencia
                    </label>
                    <input
                      id={expTitleId}
                      type="text"
                      className={styles.input}
                      placeholder="Ej: Tour Gastronómico Local"
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
                      placeholder="Ej: La Casa de las Arepas & Absolom"
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

                {/* GUÍA DE ESPECIFICACIONES TÉCNICAS DE IMAGEN */}
                <div className={styles.imageSpecsGuide}>
                  <div className={styles.specsGuideHeader}>
                    <Info size={16} />
                    <span>Especificaciones Técnicas Recomendadas para Fotografías</span>
                  </div>

                  <div className={styles.specsGrid}>
                    <div className={styles.specItem}>
                      <span className={styles.specLabel}>Proporción (Aspect Ratio)</span>
                      <span className={styles.specValue}>4:5 (Vertical) o 3:2</span>
                    </div>

                    <div className={styles.specItem}>
                      <span className={styles.specLabel}>Resolución Recomendada</span>
                      <span className={styles.specValue}>1200 × 800 px (mín. 600×400)</span>
                    </div>

                    <div className={styles.specItem}>
                      <span className={styles.specLabel}>Formatos Permitidos</span>
                      <span className={styles.specValue}>WebP (preferido), JPG, PNG</span>
                    </div>

                    <div className={styles.specItem}>
                      <span className={styles.specLabel}>Peso Óptimo</span>
                      <span className={styles.specValue}>&lt; 1.5 MB (máx. 5 MB)</span>
                    </div>
                  </div>

                  <p className={styles.specNote}>
                    <strong>💡 Zona Segura de Encuadre:</strong> Procura que el sujeto principal (personas, vehículos o platos) esté centrado o en los 2/3 superiores. El tercio inferior cuenta con un degradado oscuro para que los textos de la tarjeta sean 100% legibles.
                  </p>
                </div>

                {/* Selector / Subida de Fotografía */}
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
                      <ImageIcon size={14} className={styles.tabIcon} />
                      Fotos Locales de Manaure ({catalogoFotosManaure.length})
                    </button>
                    <button
                      type="button"
                      className={`${styles.tabBtn} ${
                        imageMode === 'upload' ? styles.tabBtnActive : ''
                      }`}
                      onClick={() => setImageMode('upload')}
                    >
                      <Upload size={14} className={styles.tabIcon} />
                      Subir Foto Propia
                    </button>
                  </div>

                  {imageMode === 'local' ? (
                    <div>
                      {/* Filtros por Categoría */}
                      <div className={styles.categoryFilterTabs}>
                        {PHOTO_CATEGORY_TABS.map((tab) => (
                          <button
                            key={tab.key}
                            type="button"
                            className={`${styles.categoryFilterTab} ${
                              photoCategoryFilter === tab.key ? styles.categoryFilterTabActive : ''
                            }`}
                            onClick={() => setPhotoCategoryFilter(tab.key)}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Cuadrícula de fotos */}
                      <div
                        className={styles.localPhotosGrid}
                        style={{ maxHeight: '280px', overflowY: 'auto', padding: '0.25rem' }}
                      >
                        {filteredLocalPhotos.map((f: CatalogoFotoItem) => {
                          const isSelected = expImageSlug === f.slug;
                          return (
                            <button
                              type="button"
                              key={f.slug}
                              className={`${styles.photoThumbCard} ${
                                isSelected ? styles.photoThumbCardSelected : ''
                              }`}
                              onClick={() => {
                                setExpImageSlug(f.slug);
                                setExpImageUrl(null);
                              }}
                              title={`${f.alt} (${f.categoriaLabel})`}
                            >
                              <img
                                src={f.thumb}
                                alt={f.alt}
                                className={styles.thumbImg}
                                loading="lazy"
                              />
                              <div className={styles.photoThumbMeta}>
                                <span>{f.caption || f.alt}</span>
                              </div>
                              {isSelected && (
                                <div className={styles.photoCheckBadge}>
                                  <Check size={12} strokeWidth={3} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className={styles.uploadBox}>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileChange}
                          className={styles.hiddenFileInput}
                          disabled={uploadingImage}
                        />
                        {uploadingImage ? (
                          <>
                            <Loader2
                              size={24}
                              className={`animate-spin ${styles.loaderBrand}`}
                            />
                            <span className={styles.uploadingText}>
                              Subiendo imagen a Cloudinary...
                            </span>
                          </>
                        ) : expImageUrl ? (
                          <div className={styles.uploadPreviewRow}>
                            <img
                              src={expImageUrl}
                              alt="Vista previa subida"
                              className={styles.uploadPreviewImg}
                            />
                            <div className={styles.uploadPreviewInfo}>
                              <p className={styles.uploadPreviewTitle}>
                                Imagen cargada con éxito
                              </p>
                              <span className={styles.uploadPreviewHint}>
                                Haz clic aquí para reemplazarla
                              </span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <Upload size={24} className={styles.uploadBoxIcon} />
                            <span className={styles.uploadBoxTitle}>
                              Selecciona o arrastra una foto (JPG, PNG, WebP)
                            </span>
                            <span className={styles.uploadBoxSubtitle}>
                              Resolución recomendada: 1200×800 px. Máximo 5 MB.
                            </span>
                          </>
                        )}
                      </label>

                      {/* Diagnóstico en Vivo de la imagen analizada */}
                      {uploadMeta && (
                        <div
                          className={`${styles.uploadDiagnostic} ${
                            uploadMeta.isOptimal ? styles.diagnosticSuccess : styles.diagnosticWarning
                          }`}
                        >
                          <CheckCircle2 size={15} />
                          <span>
                            <strong>Dimensiones:</strong> {uploadMeta.width} × {uploadMeta.height} px ({uploadMeta.aspectRatio}) • <strong>Peso:</strong> {uploadMeta.fileSizeKB} KB
                          </span>
                          {uploadMeta.warning && (
                            <span style={{ display: 'block', width: '100%', fontSize: '0.72rem' }}>
                              ⚠️ {uploadMeta.warning}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Previsualización en Vivo de la Tarjeta */}
                <div className={styles.formGroup}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span className={styles.label} style={{ margin: 0 }}>
                      <Eye size={14} className={styles.labelIcon} />
                      Vista Previa de la Tarjeta en la Landing
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #7e9c90)' }}>
                      Vista real en desktop / móvil
                    </span>
                  </div>
                  <div className={styles.previewStage}>
                    <div className={styles.previewCardWrapper}>
                      <div className={`${styles.experienceCard} ${styles.previewCard}`}>
                        <div className={styles.cardMedia}>
                          <img
                            src={currentModalImagePreview}
                            alt={expTitle || 'Previsualización'}
                            className={styles.cardImg}
                          />
                          <div className={styles.cardScrim} />
                        </div>

                        <div className={styles.cardInner}>
                          <div className={styles.cardTopBar}>
                            <div className={styles.topBarRow}>
                              <span className={styles.pillDarkGold}>
                                {`EXPERIENCIA ${String(expDisplayOrder || 1).padStart(2, '0')}`}
                              </span>
                              <div className={styles.topGlassBadge} aria-hidden="true">
                                <Compass size={16} />
                              </div>
                            </div>
                            {expPartner && (
                              <div className={styles.partnerRow}>
                                <span className={styles.pillSolidAmber}>{expPartner}</span>
                              </div>
                            )}
                          </div>

                          <div className={styles.cardBody}>
                            <div className={styles.titleGlassIcon} aria-hidden="true">
                              {renderExperienceIcon(expIcon, 22)}
                            </div>
                            <h3 className={styles.expCardTitle}>
                              {expTitle || 'Título de la Experiencia'}
                            </h3>

                            <p className={styles.expCardDescription}>
                              {expDescription || 'Descripción de la actividad para los ganadores...'}
                            </p>

                            {expFeatures.filter((f) => f.trim().length > 0).length > 0 && (
                              <>
                                <hr className={styles.expCardDivider} />
                                <ul className={styles.cardFeatureList}>
                                  {expFeatures
                                    .filter((f) => f.trim().length > 0)
                                    .map((feat, idx) => (
                                      <li key={idx} className={styles.cardFeatureItem}>
                                        <Sparkles size={15} aria-hidden="true" className={styles.cardFeatureIcon} />
                                        <span>{feat}</span>
                                      </li>
                                    ))}
                                </ul>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
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
                    <CheckCircle2 size={14} className={styles.labelIconSuccess} />
                    Beneficios o Puntos Incluidos (Viñetas)
                  </span>
                  <div className={styles.featureFormList}>
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
                        className={`${styles.btnSecondary} ${styles.btnAddFeature}`}
                      >
                        <Plus size={15} />
                        <span>Agregar</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Orden y Estado */}
                <div className={styles.modalGridRow}>
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
                    <div className={styles.checkboxContainer}>
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={expIsActive}
                          onChange={(e) => setExpIsActive(e.target.checked)}
                          className={styles.checkboxInput}
                        />
                        <span>Mostrar en la página pública</span>
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
          <div className={`${styles.modalContent} ${styles.modalContentSm}`}>
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
              <p className={styles.deleteModalText}>
                ¿Estás seguro de que deseas eliminar permanentemente la experiencia{' '}
                <strong className={styles.textHighlight}>"{deletingExperience.title}"</strong> de{' '}
                <strong className={styles.textBrandAccent}>{deletingExperience.partner_name}</strong>?
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
