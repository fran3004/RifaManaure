import React, { useState, useEffect, useId, useRef, useMemo } from 'react';
import {
  Images,
  Plus,
  Search,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Maximize2,
  Upload,
  Image as ImageIcon,
  Check,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  Info,
  FolderPlus,
  Tag,
  Shield,
} from 'lucide-react';
import {
  getAdminGalleryItems,
  createGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,
  toggleGalleryItemActive,
  reorderGalleryItems,
  uploadGalleryPhoto,
  getGalleryCategories,
  createGalleryCategory,
  deleteGalleryCategory,
  DEFAULT_GALLERY_CATEGORIES,
} from '@/services/galleryService';
import {
  getOptimizedCloudinaryUrl,
  getCloudinaryResponsiveUrl,
} from '@/services/cloudinaryService';
import type {
  GalleryItemRow,
  GalleryItemInsert,
  GalleryItemUpdate,
  GalleryCategoryItem,
} from '@/types/raffle.types';
import {
  catalogoFotosManaure,
  resolveExperienceImage,
  type CatalogoFotoItem,
} from '@/assets/assets';
import styles from './GalleryView.module.css';

const getCategoryBadgeClass = (categorySlug: string): string => {
  switch (categorySlug.toLowerCase()) {
    case 'cuatrimoto': return styles.catCuatrimoto;
    case 'parapente': return styles.catParapente;
    case 'serrania': return styles.catSerrania;
    case 'hospedaje': return styles.catHospedaje;
    case 'gastronomia': return styles.catGastronomia;
    case 'fogata': return styles.catFogata;
    case 'otro': return styles.catOtro;
    default: return styles.catCustom;
  }
};


export const GalleryView: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputId = useId();
  const categorySelectId = useId();
  const altInputId = useId();
  const orderInputId = useId();

  // Estados principales de la vista
  const [items, setItems] = useState<GalleryItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Filtros de búsqueda y categoría
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [selectedStatus, setSelectedStatus] = useState<'todas' | 'activas' | 'ocultas'>('todas');

  // Modal de Crear / Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItemRow | null>(null);
  const [imageMode, setImageMode] = useState<'upload' | 'local'>('upload');
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<string>('serrania');
  const [formAltText, setFormAltText] = useState('');
  const [formOrder, setFormOrder] = useState<number>(1);
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formImageSlug, setFormImageSlug] = useState<string>('serrania-perija-laguna');
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null);
  const [selectedLocalFile, setSelectedLocalFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<string>('todas');
  const [savingItem, setSavingItem] = useState(false);

  // Modal de Confirmación de Eliminación
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<GalleryItemRow | null>(null);
  const [deletingInProgress, setDeletingInProgress] = useState(false);

  // Estados para la Gestión de Categorías
  const [categories, setCategories] = useState<GalleryCategoryItem[]>(DEFAULT_GALLERY_CATEGORIES);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);
  const [catToDelete, setCatToDelete] = useState<GalleryCategoryItem | null>(null);
  const [deletingCatInProgress, setDeletingCatInProgress] = useState(false);

  // Modal Lightbox para visualización ampliada
  const [lightboxUrl, setLightboxUrl] = useState<{ url: string; title: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    const res = await getAdminGalleryItems();
    if (!res.success) {
      setError(res.error || 'Error al cargar las fotografías.');
      showNotification('error', res.error || 'Error al cargar la galería.');
    } else {
      setItems(res.data || []);
    }
    setLoading(false);
  };

  const loadCategories = async () => {
    const cats = await getGalleryCategories();
    if (cats && cats.length > 0) {
      setCategories(cats);
    }
  };

  useEffect(() => {
    loadItems();
    loadCategories();
  }, []);

  const handleCreateCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newCatName.trim();
    if (!trimmed) return;

    setCreatingCat(true);
    const res = await createGalleryCategory(trimmed);
    setCreatingCat(false);

    if (!res.success || !res.category) {
      showNotification('error', res.error || 'Error al crear la categoría.');
    } else {
      setCategories((prev) => [...prev.filter((c) => c.slug !== res.category!.slug), res.category!]);
      setNewCatName('');
      showNotification('success', `Categoría "${res.category.name}" creada exitosamente.`);
    }
  };

  const handleDeleteCategory = async (cat: GalleryCategoryItem) => {
    setDeletingCatInProgress(true);
    const res = await deleteGalleryCategory(cat.slug);
    setDeletingCatInProgress(false);

    if (!res.success) {
      showNotification('error', res.error || 'Error al eliminar la categoría.');
    } else {
      setCategories((prev) => prev.filter((c) => c.slug !== cat.slug));
      setCatToDelete(null);

      // Si el filtro de categoría activo era el eliminado, volver a 'todas'
      if (selectedCategory === cat.slug) {
        setSelectedCategory('todas');
      }

      // Si el formulario de foto tenía seleccionada esta categoría, cambiar a 'serrania' o 'otro'
      if (formCategory === cat.slug) {
        setFormCategory('otro');
      }

      // Si se reasignaron fotos, notificar y recargar la galería
      if (res.reassignedPhotosCount > 0) {
        showNotification(
          'success',
          `Categoría eliminada. Se reasignaron ${res.reassignedPhotosCount} foto(s) a "Otra Experiencia".`
        );
        loadItems();
      } else {
        showNotification('success', `Categoría "${cat.name}" eliminada exitosamente.`);
      }
    }
  };

  // Resolver la URL de imagen optimizada (ya sea remota o del catálogo local)
  const resolveImage = (item: { image_slug: string | null; image_url: string | null }) => {
    if (item.image_url && item.image_url.trim()) {
      return item.image_url.trim();
    }
    return resolveExperienceImage(item.image_slug);
  };

  // Cerrar modal de creación/edición y liberar memoria de URL local
  const handleCloseModal = () => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }
    setSelectedLocalFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsModalOpen(false);
  };

  // Abrir modal para crear
  const handleOpenCreateModal = () => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }
    setSelectedLocalFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setEditingItem(null);
    setFormTitle('');
    setFormCategory(categories[0]?.slug || 'serrania');
    setFormAltText('');
    setFormOrder(items.length > 0 ? Math.max(...items.map((i) => i.display_order)) + 1 : 1);
    setFormIsActive(true);
    setImageMode('upload');
    setFormImageUrl(null);
    setFormImageSlug('serrania-perija-laguna');
    setIsModalOpen(true);
  };

  // Abrir modal para editar
  const handleOpenEditModal = (item: GalleryItemRow) => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }
    setSelectedLocalFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setEditingItem(item);
    setFormTitle(item.title);
    setFormCategory(item.category);
    setFormAltText(item.alt_text || '');
    setFormOrder(item.display_order);
    setFormIsActive(item.is_active);

    if (item.image_url) {
      setImageMode('upload');
      setFormImageUrl(item.image_url);
      setFormImageSlug(item.image_slug || 'serrania-perija-laguna');
    } else {
      setImageMode('local');
      setFormImageSlug(item.image_slug || 'serrania-perija-laguna');
      setFormImageUrl(null);
    }

    setIsModalOpen(true);
  };

  // Selección local de archivo (subida diferida: no sube a Cloudinary hasta guardar)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    if (!validTypes.includes(file.type)) {
      showNotification('error', 'Formato inválido. Se admiten imágenes WebP, JPG, PNG o AVIF.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showNotification('error', 'La imagen supera el límite recomendado de 10 MB.');
      return;
    }

    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }

    const preview = URL.createObjectURL(file);
    setSelectedLocalFile(file);
    setLocalPreviewUrl(preview);
    setFormImageUrl(null);

    // Auto-sugerir título y alt si están vacíos
    if (!formTitle.trim()) {
      const cleanName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .trim();
      if (cleanName) {
        const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        setFormTitle(capitalized);
        if (!formAltText.trim()) setFormAltText(capitalized);
      }
    }
  };

  const handleRemoveLocalFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }
    setSelectedLocalFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Guardar creación o edición
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formTitle.trim()) {
      showNotification('error', 'El título de la fotografía es obligatorio.');
      return;
    }

    if (imageMode === 'upload' && !selectedLocalFile && !formImageUrl) {
      showNotification('error', 'Por favor selecciona un archivo o escoge una foto del catálogo.');
      return;
    }

    if (imageMode === 'local' && !formImageSlug) {
      showNotification('error', 'Por favor selecciona una fotografía del catálogo.');
      return;
    }

    setSavingItem(true);
    let finalImageUrl = formImageUrl;

    // Si hay un archivo local seleccionado en modo upload, se sube ahora a Cloudinary
    if (imageMode === 'upload' && selectedLocalFile) {
      const uploadRes = await uploadGalleryPhoto(selectedLocalFile, formCategory);
      if (!uploadRes.success || !uploadRes.url) {
        showNotification('error', uploadRes.error || 'No fue posible subir la fotografía.');
        setSavingItem(false);
        return;
      }
      finalImageUrl = uploadRes.url;
    }

    // Verificar si en modo catálogo se seleccionó una foto personalizada previa
    const selectedCatalogItem =
      imageMode === 'local' ? dynamicCatalog.find((f) => f.slug === formImageSlug) : null;
    const isCustomCatalog = Boolean(selectedCatalogItem?.isCustom && selectedCatalogItem.imageUrl);

    const targetImageUrl =
      imageMode === 'upload'
        ? finalImageUrl
        : isCustomCatalog
          ? selectedCatalogItem?.imageUrl || null
          : null;
    const targetImageSlug =
      imageMode === 'local' && !isCustomCatalog ? formImageSlug : null;

    if (editingItem) {
      // Actualización
      const updates: GalleryItemUpdate = {
        title: formTitle.trim(),
        category: formCategory,
        alt_text: formAltText.trim() || formTitle.trim(),
        display_order: Number(formOrder) || 1,
        is_active: formIsActive,
        image_url: targetImageUrl,
        image_slug: targetImageSlug,
      };

      const res = await updateGalleryItem(editingItem.id, updates);
      if (!res.success || !res.data) {
        showNotification('error', res.error || 'No fue posible actualizar la fotografía.');
      } else {
        setItems((prev) =>
          prev
            .map((item) => (item.id === editingItem.id ? res.data! : item))
            .sort((a, b) => a.display_order - b.display_order)
        );
        handleCloseModal();
        showNotification('success', 'Fotografía actualizada correctamente.');
      }
    } else {
      // Creación
      const payload: GalleryItemInsert = {
        title: formTitle.trim(),
        category: formCategory,
        alt_text: formAltText.trim() || formTitle.trim(),
        display_order: Number(formOrder) || items.length + 1,
        is_active: formIsActive,
        image_url: targetImageUrl,
        image_slug: targetImageSlug,
      };

      const res = await createGalleryItem(payload);
      if (!res.success || !res.data) {
        showNotification('error', res.error || 'No fue posible crear la fotografía.');
      } else {
        setItems((prev) => [...prev, res.data!].sort((a, b) => a.display_order - b.display_order));
        handleCloseModal();
        showNotification('success', 'Nueva fotografía agregada a la galería.');
      }
    }

    setSavingItem(false);
  };

  // Alternar visibilidad rápida
  const handleToggleActive = async (item: GalleryItemRow) => {
    const newStatus = !item.is_active;
    const res = await toggleGalleryItemActive(item.id, newStatus);
    if (!res.success) {
      showNotification('error', res.error || 'No fue posible cambiar la visibilidad.');
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_active: newStatus } : i))
      );
      showNotification(
        'success',
        newStatus ? 'Fotografía visible en la galería.' : 'Fotografía ocultada de la galería.'
      );
    }
  };

  // Reordenar foto hacia arriba o hacia abajo
  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const currentItem = items[index];
    const targetItem = items[targetIndex];

    const currentOrder = currentItem.display_order;
    const targetOrder = targetItem.display_order;

    // Intercambiar ordenes
    const newItems = [...items];
    newItems[index] = { ...currentItem, display_order: targetOrder };
    newItems[targetIndex] = { ...targetItem, display_order: currentOrder };
    newItems.sort((a, b) => a.display_order - b.display_order);

    setItems(newItems);

    const res = await reorderGalleryItems([
      { id: currentItem.id, display_order: targetOrder },
      { id: targetItem.id, display_order: currentOrder },
    ]);

    if (!res.success) {
      showNotification('error', res.error || 'Error al reordenar la galería.');
      loadItems(); // Revertir en caso de fallo
    }
  };

  // Confirmar eliminación
  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;

    setDeletingInProgress(true);
    const res = await deleteGalleryItem(deletingItem.id, deletingItem.image_url);

    if (!res.success) {
      showNotification('error', res.error || 'No fue posible eliminar la fotografía.');
    } else {
      setItems((prev) => prev.filter((i) => i.id !== deletingItem.id));
      setIsDeleteModalOpen(false);
      setDeletingItem(null);
      showNotification('success', 'Fotografía eliminada permanentemente.');
    }

    setDeletingInProgress(false);
  };

  // Filtrado de fotos en la cuadrícula
  const filteredItems = items.filter((item) => {
    const matchesCategory =
      selectedCategory === 'todas' || item.category.toLowerCase() === selectedCategory.toLowerCase();

    const matchesStatus =
      selectedStatus === 'todas' ||
      (selectedStatus === 'activas' && item.is_active) ||
      (selectedStatus === 'ocultas' && !item.is_active);

    const term = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !term ||
      item.title.toLowerCase().includes(term) ||
      (item.alt_text && item.alt_text.toLowerCase().includes(term)) ||
      item.category.toLowerCase().includes(term);

    return matchesCategory && matchesStatus && matchesSearch;
  });

  // Métricas para la cabecera
  const totalCount = items.length;
  const activeCount = items.filter((i) => i.is_active).length;
  const hiddenCount = totalCount - activeCount;

  // Construcción del catálogo dinámico (fotos estáticas de Manaure + fotos personalizadas subidas por el admin)
  const dynamicCatalog = useMemo(() => {
    const base: (CatalogoFotoItem & { isCustom?: boolean; imageUrl?: string })[] = catalogoFotosManaure.map(
      (f) => ({ ...f, isCustom: false })
    );
    const seenUrls = new Set(base.map((f) => f.card).filter(Boolean));

    const customList: (CatalogoFotoItem & { isCustom?: boolean; imageUrl?: string })[] = [];
    for (const item of items) {
      if (item.image_url && item.image_url.trim()) {
        const url = item.image_url.trim();
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          const catMeta = categories.find(
            (c) => c.slug.toLowerCase() === item.category.toLowerCase()
          );
          customList.push({
            id: item.id,
            slug: item.image_slug || `custom-${item.id}`,
            alt: item.alt_text || item.title,
            caption: item.title,
            categoria: item.category as any,
            categoriaLabel: catMeta?.name || item.category,
            thumb: getCloudinaryResponsiveUrl(url, { width: 300, height: 200, crop: 'fill' }),
            card: getCloudinaryResponsiveUrl(url, { width: 768, height: 960, crop: 'fill' }),
            cardJpg: getCloudinaryResponsiveUrl(url, { width: 768, height: 960, crop: 'fill', format: 'jpg' }),
            full: getOptimizedCloudinaryUrl(url, { width: 1600 }),
            dominantColor: '#2d3748',
            isCustom: true,
            imageUrl: url,
          });
        }
      }
    }

    return [...base, ...customList];
  }, [items, categories]);

  // Filtrado de fotos del catálogo en el modal
  const filteredCatalog = useMemo(() => {
    if (catalogCategoryFilter === 'todas') return dynamicCatalog;
    return dynamicCatalog.filter(
      (f) => f.categoria.toLowerCase() === catalogCategoryFilter.toLowerCase()
    );
  }, [dynamicCatalog, catalogCategoryFilter]);

  // Vista previa de la imagen seleccionada en el modal
  const modalPreviewUrl = useMemo(() => {
    if (imageMode === 'upload') {
      if (localPreviewUrl) return localPreviewUrl;
      if (formImageUrl) return getOptimizedCloudinaryUrl(formImageUrl, { width: 600 });
      return '';
    }
    // Modo catálogo
    const match = dynamicCatalog.find((f) => f.slug === formImageSlug);
    if (match) {
      return match.imageUrl || match.card || match.thumb;
    }
    return resolveExperienceImage(formImageSlug);
  }, [imageMode, localPreviewUrl, formImageUrl, dynamicCatalog, formImageSlug]);

  return (
    <div className={styles.container}>
      {/* Notificación flotante */}
      {notification && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.9rem 1.25rem',
            borderRadius: '10px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            background: notification.type === 'success' ? '#064e3b' : '#7f1d1d',
            color: '#fff',
            fontSize: '0.9rem',
            fontWeight: 600,
            border:
              notification.type === 'success'
                ? '1px solid #10b981'
                : '1px solid #ef4444',
          }}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 size={20} color="#34d399" />
          ) : (
            <AlertCircle size={20} color="#f87171" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Cabecera Principal y Estadísticas */}
      <section className={styles.headerCard} aria-labelledby="gallery-admin-title">
        <div className={styles.headerTop}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.headerIconBox} aria-hidden="true">
              <Images size={26} />
            </div>
            <div className={styles.headerTextGroup}>
              <div className={styles.headerBadgeRow}>
                <h1 id="gallery-admin-title" className={styles.title}>
                  Galería Fotográfica
                </h1>
                <span className={styles.headerLiveBadge}>
                  <span className={styles.liveDot} aria-hidden="true" />
                  Catálogo Activo
                </span>
              </div>
              <p className={styles.subtitle}>
                Gestiona las fotografías auténticas de Manaure visibles en la landing page y organiza futuros catálogos.
              </p>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerBtnCategories}
              onClick={() => setIsCategoriesModalOpen(true)}
              title="Administrar categorías de la galería"
            >
              <FolderPlus size={18} aria-hidden="true" />
              <span>Gestionar Categorías</span>
              <span className={styles.headerBtnBadge}>{categories.length}</span>
            </button>
            <button
              type="button"
              className={styles.headerBtnAdd}
              onClick={handleOpenCreateModal}
            >
              <Plus size={18} aria-hidden="true" />
              <span>Agregar Fotografía</span>
            </button>
          </div>
        </div>

        {/* Métricas en vivo */}
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <div className={styles.metricCardHeader}>
              <span className={styles.metricLabel}>Total Fotos</span>
              <div className={`${styles.metricIconBox} ${styles.metricIconTotal}`} aria-hidden="true">
                <Images size={18} />
              </div>
            </div>
            <span className={styles.metricValue}>{totalCount}</span>
            <span className={styles.metricHint}>Catálogo general</span>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricCardHeader}>
              <span className={styles.metricLabel}>Visibles</span>
              <div className={`${styles.metricIconBox} ${styles.metricIconVisible}`} aria-hidden="true">
                <Eye size={18} />
              </div>
            </div>
            <span className={`${styles.metricValue} ${styles.metricValueActive}`}>{activeCount}</span>
            <span className={styles.metricHint}>Publicadas en la web</span>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricCardHeader}>
              <span className={styles.metricLabel}>Ocultas</span>
              <div className={`${styles.metricIconBox} ${styles.metricIconHidden}`} aria-hidden="true">
                <EyeOff size={18} />
              </div>
            </div>
            <span className={`${styles.metricValue} ${hiddenCount > 0 ? styles.metricValueHidden : ''}`}>
              {hiddenCount}
            </span>
            <span className={styles.metricHint}>Borradores o en pausa</span>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricCardHeader}>
              <span className={styles.metricLabel}>Categorías</span>
              <div className={`${styles.metricIconBox} ${styles.metricIconCategory}`} aria-hidden="true">
                <Tag size={18} />
              </div>
            </div>
            <span className={styles.metricValue}>{categories.length}</span>
            <span className={styles.metricHint}>Filtros activos</span>
          </div>
        </div>
      </section>

      {/* Barra de Búsqueda y Filtros de Categoría */}
      <section className={styles.controlsCard} aria-label="Filtros de galería">
        <div className={styles.controlsTop}>
          <div className={styles.searchBox}>
            <Search size={18} className={styles.searchIcon} aria-hidden="true" />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Buscar por título, categoría o descripción..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar fotografías"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className={styles.clearSearchBtn}
                aria-label="Limpiar búsqueda"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label htmlFor="status-filter-select" className={styles.formLabel} style={{ margin: 0 }}>
              Estado:
            </label>
            <select
              id="status-filter-select"
              className={styles.formSelect}
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
            >
              <option value="todas">Todas</option>
              <option value="activas">Solo Visibles</option>
              <option value="ocultas">Solo Ocultas</option>
            </select>
          </div>
        </div>

        {/* Chips de Categorías Dinámicas */}
        <div className={styles.filterTabs} role="toolbar" aria-label="Filtrar por categoría">
          <button
            type="button"
            className={`${styles.filterChip} ${selectedCategory === 'todas' ? styles.filterChipActive : ''}`}
            onClick={() => setSelectedCategory('todas')}
          >
            Todas ({items.length})
          </button>
          {categories.map((cat) => {
            const count = items.filter((i) => i.category.toLowerCase() === cat.slug.toLowerCase()).length;
            return (
              <button
                key={cat.slug}
                type="button"
                className={`${styles.filterChip} ${selectedCategory === cat.slug ? styles.filterChipActive : ''}`}
                onClick={() => setSelectedCategory(cat.slug)}
              >
                {cat.name} {count > 0 ? `(${count})` : ''}
              </button>
            );
          })}
        </div>
      </section>

      {/* Listado de Fotos en Cuadrícula */}
      {loading ? (
        <div className={styles.emptyState}>
          <Loader2 size={32} className="animate-spin" color="#10b981" />
          <p>Cargando galería fotográfica...</p>
        </div>
      ) : error ? (
        <div className={styles.emptyState}>
          <AlertCircle size={36} color="#ef4444" />
          <p style={{ color: '#ef4444', fontWeight: 600 }}>{error}</p>
          <button type="button" className={styles.btnSecondary} onClick={loadItems}>
            Reintentar
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className={styles.emptyState}>
          <Images size={40} color="var(--text-secondary)" />
          <p style={{ fontSize: '1rem', fontWeight: 600 }}>No se encontraron fotografías.</p>
          <p style={{ fontSize: '0.85rem' }}>
            Prueba ajustando los filtros de búsqueda o agrega una nueva fotografía a la galería.
          </p>
          <button type="button" className={styles.btnPrimary} onClick={handleOpenCreateModal}>
            <Plus size={16} /> Agregar Fotografía
          </button>
        </div>
      ) : (
        <div className={styles.galleryGrid}>
          {filteredItems.map((item, index) => {
            const imageSrc = resolveImage(item);
            const categoryMeta = categories.find(
              (c) => c.slug.toLowerCase() === item.category.toLowerCase()
            );
            const badgeClass = getCategoryBadgeClass(item.category);

            return (
              <article
                key={item.id}
                className={`${styles.photoCard} ${!item.is_active ? styles.photoCardHidden : ''}`}
              >
                {/* Contenedor de la miniatura */}
                <div className={styles.photoThumbBox}>
                  <img
                    src={imageSrc}
                    alt={item.alt_text || item.title}
                    className={styles.photoImage}
                    loading="lazy"
                  />

                  <div className={styles.thumbBadges}>
                    <span className={styles.orderBadge}>#{item.display_order}</span>
                    <span className={`${styles.categoryBadge} ${badgeClass}`}>
                      {categoryMeta?.name || item.category}
                    </span>
                  </div>

                  <span
                    className={`${styles.statusBadge} ${
                      item.is_active ? styles.statusActive : styles.statusHidden
                    }`}
                  >
                    {item.is_active ? (
                      <>
                        <Eye size={12} /> Visible
                      </>
                    ) : (
                      <>
                        <EyeOff size={12} /> Oculta
                      </>
                    )}
                  </span>
                </div>

                {/* Información de la foto */}
                <div className={styles.photoBody}>
                  <h3 className={styles.photoTitle}>{item.title}</h3>
                  <p className={styles.photoAlt} title={item.alt_text || item.title}>
                    {item.alt_text || 'Sin descripción alternativa'}
                  </p>
                  <span className={styles.sourceBadge}>
                    {item.image_url ? 'Foto Personalizada' : 'Catálogo Oficial'}
                  </span>
                </div>

                {/* Acciones Rápidas */}
                <div className={styles.photoActions}>
                  <div className={styles.reorderGroup}>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => handleMoveOrder(index, 'up')}
                      disabled={index === 0}
                      title="Mover arriba en el orden"
                      aria-label={`Mover ${item.title} arriba`}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => handleMoveOrder(index, 'down')}
                      disabled={index === items.length - 1}
                      title="Mover abajo en el orden"
                      aria-label={`Mover ${item.title} abajo`}
                    >
                      <ArrowDown size={15} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() =>
                        setLightboxUrl({
                          url: imageSrc,
                          title: item.title,
                        })
                      }
                      title="Ver fotografía ampliada"
                      aria-label="Ver ampliada"
                    >
                      <Maximize2 size={15} />
                    </button>

                    <button
                      type="button"
                      className={`${styles.actionBtn} ${item.is_active ? styles.actionBtnActive : ''}`}
                      onClick={() => handleToggleActive(item)}
                      title={item.is_active ? 'Ocultar foto de la web' : 'Publicar foto en la web'}
                      aria-label={item.is_active ? 'Ocultar foto' : 'Publicar foto'}
                    >
                      {item.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>

                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => handleOpenEditModal(item)}
                      title="Editar fotografía"
                      aria-label={`Editar ${item.title}`}
                    >
                      <Edit2 size={15} />
                    </button>

                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      onClick={() => {
                        setDeletingItem(item);
                        setIsDeleteModalOpen(true);
                      }}
                      title="Eliminar fotografía"
                      aria-label={`Eliminar ${item.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal de Creación / Edición */}
      {isModalOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={() => !savingItem && handleCloseModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <div className={styles.headerIconBox} style={{ width: 36, height: 36 }}>
                  <Images size={20} />
                </div>
                <h2 id="modal-title" className={styles.modalTitle}>
                  {editingItem ? 'Editar Fotografía de la Galería' : 'Agregar Nueva Fotografía'}
                </h2>
              </div>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={handleCloseModal}
                disabled={savingItem}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveItem} style={{ display: 'contents' }}>
              <div className={styles.modalBody}>
                {/* Selector de Modo de Imagen: Subir vs Catálogo de Manaure */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Origen de la Imagen:</label>
                  <div className={styles.tabGroup}>
                    <button
                      type="button"
                      className={`${styles.tabBtn} ${imageMode === 'upload' ? styles.tabBtnActive : ''}`}
                      onClick={() => setImageMode('upload')}
                    >
                      <Upload size={16} />
                      <span>Subir Foto Propia</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.tabBtn} ${imageMode === 'local' ? styles.tabBtnActive : ''}`}
                      onClick={() => setImageMode('local')}
                    >
                      <ImageIcon size={16} />
                      <span>Catálogo Manaure ({dynamicCatalog.length})</span>
                    </button>
                  </div>
                </div>

                {/* Pestaña: Subir Fotografía */}
                {imageMode === 'upload' && (
                  <div className={styles.formGroup}>
                    {/* Nota de sugerencia amigable sin restricciones estrictas */}
                    <div className={styles.qualityTip}>
                      <Info size={22} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <strong>Recomendación de Calidad:</strong>
                        <p style={{ margin: '0.2rem 0 0 0' }}>
                          Para una visualización nítida y atractiva en la galería y el visor ampliado, sugerimos subir imágenes de buena nitidez (formatos WebP, JPG, PNG o AVIF hasta 10 MB). Puedes usar fotos horizontales, verticales o panorámicas con total libertad.
                        </p>
                      </div>
                    </div>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      style={{ display: 'none' }}
                      aria-label="Subir archivo de imagen"
                    />

                    <div
                      className={styles.uploadDropzone}
                      onClick={() => fileInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                    >
                      {selectedLocalFile ? (
                        <>
                          <Check size={28} color="#10b981" />
                          <p className={styles.dropzoneText}>
                            {selectedLocalFile.name} ({Math.round(selectedLocalFile.size / 1024)} KB)
                          </p>
                          <p className={styles.dropzoneHint}>
                            Archivo listo para guardar • Haz clic para cambiar de foto
                          </p>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={handleRemoveLocalFile}
                            style={{ marginTop: '0.4rem', fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                            title="Quitar archivo seleccionado"
                          >
                            Quitar archivo
                          </button>
                        </>
                      ) : formImageUrl ? (
                        <>
                          <Check size={28} color="#10b981" />
                          <p className={styles.dropzoneText}>Fotografía actual guardada</p>
                          <p className={styles.dropzoneHint}>Haz clic si deseas reemplazarla por otra</p>
                        </>
                      ) : (
                        <>
                          <Upload size={32} color="#10b981" />
                          <p className={styles.dropzoneText}>Haz clic aquí para seleccionar tu foto</p>
                          <p className={styles.dropzoneHint}>Formatos admitidos: WebP, JPG, PNG, AVIF (hasta 10 MB)</p>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Pestaña: Catálogo de Fotos de Manaure */}
                {imageMode === 'local' && (
                  <div className={styles.formGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span className={styles.formLabel}>Selecciona una fotografía del catálogo:</span>
                      <select
                        className={styles.formSelect}
                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                        value={catalogCategoryFilter}
                        onChange={(e) => setCatalogCategoryFilter(e.target.value)}
                        aria-label="Filtrar catálogo local por categoría"
                      >
                        <option value="todas">Todas las categorías ({dynamicCatalog.length})</option>
                        {categories.map((cat) => {
                          const count = dynamicCatalog.filter(
                            (f) => f.categoria.toLowerCase() === cat.slug.toLowerCase()
                          ).length;
                          return (
                            <option key={cat.slug} value={cat.slug}>
                              {cat.name} ({count})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className={styles.catalogGrid}>
                      {filteredCatalog.map((foto) => {
                        const isSelected = formImageSlug === foto.slug;
                        return (
                          <div
                            key={foto.id || foto.slug}
                            className={`${styles.catalogItem} ${isSelected ? styles.catalogItemActive : ''}`}
                            onClick={() => {
                              setFormImageSlug(foto.slug);
                              if (foto.isCustom && foto.imageUrl) {
                                setFormImageUrl(foto.imageUrl);
                              } else {
                                setFormImageUrl(null);
                              }
                              if (!formTitle) setFormTitle(foto.alt);
                              if (!formAltText) setFormAltText(foto.alt);
                              if (foto.categoria) {
                                setFormCategory(foto.categoria);
                              }
                            }}
                            title={foto.alt}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && setFormImageSlug(foto.slug)}
                          >
                            <img
                              src={foto.thumb || foto.card}
                              alt={foto.alt}
                              className={styles.catalogThumb}
                              loading="lazy"
                            />
                            {foto.isCustom && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: '4px',
                                  left: '4px',
                                  fontSize: '0.62rem',
                                  background: 'rgba(0, 0, 0, 0.7)',
                                  color: '#10b981',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  fontWeight: 600,
                                }}
                              >
                                Subida
                              </span>
                            )}
                            {isSelected && (
                              <div className={styles.catalogItemCheck}>
                                <Check size={12} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Previsualizador en Vivo */}
                <div className={styles.previewBox}>
                  {modalPreviewUrl ? (
                    <img
                      src={modalPreviewUrl}
                      alt="Previsualización"
                      className={styles.previewThumb}
                    />
                  ) : (
                    <div className={styles.previewThumb} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1f2937' }}>
                      <ImageIcon size={28} color="#6b7280" />
                    </div>
                  )}
                  <div className={styles.previewInfo}>
                    <strong className={styles.previewTitle}>Previsualización en tiempo real</strong>
                    <span className={styles.previewSubtitle}>
                      {imageMode === 'upload'
                        ? selectedLocalFile
                          ? `Archivo listo: ${selectedLocalFile.name} (${Math.round(selectedLocalFile.size / 1024)} KB)`
                          : formImageUrl
                            ? 'Fotografía optimizada y lista para publicar'
                            : 'Esperando archivo de imagen...'
                        : `Foto seleccionada del catálogo: ${formImageSlug}`}
                    </span>
                  </div>
                </div>

                {/* Formulario de Metadatos */}
                <div className={styles.formGroup}>
                  <label htmlFor={titleInputId} className={styles.formLabel}>
                    Título de la Fotografía *
                  </label>
                  <input
                    id={titleInputId}
                    type="text"
                    className={styles.formInput}
                    placeholder="Ej: Caravana en la Cumbre de la Serranía"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className={styles.formGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label htmlFor={categorySelectId} className={styles.formLabel}>
                        Categoría
                      </label>
                      <button
                        type="button"
                        className={styles.quickAddCategoryBtn}
                        onClick={() => setIsCategoriesModalOpen(true)}
                        title="Crear o administrar categorías"
                      >
                        <Plus size={13} /> Gestionar
                      </button>
                    </div>
                    <select
                      id={categorySelectId}
                      className={styles.formSelect}
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                    >
                      {categories.map((cat) => (
                        <option key={cat.slug} value={cat.slug}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor={orderInputId} className={styles.formLabel}>
                      Orden Numérico
                    </label>
                    <input
                      id={orderInputId}
                      type="number"
                      min={1}
                      className={styles.formInput}
                      value={formOrder}
                      onChange={(e) => setFormOrder(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor={altInputId} className={styles.formLabel}>
                    Texto Alternativo Accesible (Alt)
                  </label>
                  <input
                    id={altInputId}
                    type="text"
                    className={styles.formInput}
                    placeholder="Describe la escena para accesibilidad visual y SEO..."
                    value={formAltText}
                    onChange={(e) => setFormAltText(e.target.value)}
                  />
                </div>

                <div className={styles.switchGroup} onClick={() => setFormIsActive(!formIsActive)}>
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    style={{ accentColor: '#10b981', width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <span className={styles.switchLabel}>
                    Fotografía activa y visible en la landing page
                  </span>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={handleCloseModal}
                  disabled={savingItem}
                >
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={savingItem}>
                  {savingItem ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{imageMode === 'upload' && selectedLocalFile ? 'Subiendo y guardando...' : 'Guardando...'}</span>
                    </>
                  ) : editingItem ? (
                    'Guardar Cambios'
                  ) : (
                    'Agregar a la Galería'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {isDeleteModalOpen && deletingItem && (
        <div
          className={styles.modalBackdrop}
          onClick={() => !deletingInProgress && setIsDeleteModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.modalContent} style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <div
                  className={styles.headerIconBox}
                  style={{ width: 36, height: 36, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}
                >
                  <Trash2 size={20} />
                </div>
                <h2 className={styles.modalTitle}>¿Eliminar Fotografía?</h2>
              </div>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={deletingInProgress}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p className={styles.deletePromptText}>
                Estás a punto de eliminar permanentemente la foto:
              </p>
              <div className={styles.deletePhotoCard}>
                <img
                  src={resolveImage(deletingItem)}
                  alt=""
                  className={styles.deletePhotoThumb}
                />
                <div>
                  <strong className={styles.deletePhotoTitle}>{deletingItem.title}</strong>
                  <p className={styles.deletePhotoCat}>Categoría: {deletingItem.category}</p>
                </div>
              </div>
              {deletingItem.image_url && (
                <p className={styles.deleteStorageWarning}>
                  Nota: El archivo de imagen asociado también será eliminado de forma segura para no dejar residuos.
                </p>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={deletingInProgress}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={handleDeleteConfirm}
                disabled={deletingInProgress}
              >
                {deletingInProgress ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Eliminando...
                  </>
                ) : (
                  'Confirmar Eliminación'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gestión de Categorías */}
      {isCategoriesModalOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={() => {
            if (!creatingCat && !deletingCatInProgress) {
              setIsCategoriesModalOpen(false);
              setCatToDelete(null);
            }
          }}
        >
          <div
            className={`${styles.modalContent} ${styles.catManagerModal}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-manager-title"
          >
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                    borderRadius: 10,
                    width: 40,
                    height: 40,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <FolderPlus size={22} />
                </div>
                <div>
                  <h2 id="category-manager-title" className={styles.modalTitle}>
                    Gestión de Categorías
                  </h2>
                  <p className={styles.subtitle} style={{ fontSize: '0.82rem', margin: '0.15rem 0 0 0' }}>
                    Crea y administra las categorías de fotos para filtros y clasificación.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => {
                  setIsCategoriesModalOpen(false);
                  setCatToDelete(null);
                }}
                disabled={creatingCat || deletingCatInProgress}
                aria-label="Cerrar modal de categorías"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Formulario de Creación de Categoría */}
              <form onSubmit={handleCreateCategory} className={styles.catCreateBox}>
                <label className={styles.catCreateLabel}>
                  <Tag size={15} color="#10b981" />
                  <span>Agregar Nueva Categoría</span>
                </label>
                <div className={styles.catCreateRow}>
                  <input
                    type="text"
                    className={styles.catCreateInput}
                    placeholder="Ej: Senderismo, Cascadas, Miradores..."
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    disabled={creatingCat}
                    maxLength={40}
                  />
                  <button
                    type="submit"
                    className={styles.catCreateBtn}
                    disabled={creatingCat || !newCatName.trim()}
                  >
                    {creatingCat ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Creando...
                      </>
                    ) : (
                      <>
                        <Plus size={16} /> Crear Categoría
                      </>
                    )}
                  </button>
                </div>
                <p className={styles.catCreateHint}>
                  <Info size={13} /> El identificador técnico (slug) para enlaces y filtros se normaliza automáticamente.
                </p>
              </form>

              {/* Sub-caja de Confirmación de Eliminación */}
              {catToDelete && (
                <div className={styles.catDeleteConfirmBox} role="alert">
                  <div className={styles.catDeleteConfirmHeader}>
                    <AlertCircle size={18} color="#b91c1c" />
                    <h4 className={styles.catDeleteConfirmTitle}>
                      ¿Eliminar la categoría &ldquo;{catToDelete.name}&rdquo;?
                    </h4>
                  </div>
                  <p className={styles.catDeleteConfirmText}>
                    {items.filter((i) => i.category.toLowerCase() === catToDelete.slug.toLowerCase()).length > 0 ? (
                      <>
                        Esta categoría tiene{' '}
                        <strong>
                          {items.filter((i) => i.category.toLowerCase() === catToDelete.slug.toLowerCase()).length} fotografía(s)
                        </strong>{' '}
                        asociadas. Al eliminarla, dichas fotos se reasignarán automáticamente a{' '}
                        <strong>&ldquo;Otra Experiencia&rdquo;</strong> para garantizar que nunca se pierdan.
                      </>
                    ) : (
                      'Esta categoría no tiene fotografías vinculadas actualmente y será removida de inmediato.'
                    )}
                  </p>
                  <div className={styles.catDeleteConfirmActions}>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => setCatToDelete(null)}
                      disabled={deletingCatInProgress}
                      style={{ padding: '0.45rem 0.95rem', fontSize: '0.84rem' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={styles.btnDanger}
                      onClick={() => handleDeleteCategory(catToDelete)}
                      disabled={deletingCatInProgress}
                      style={{ padding: '0.45rem 0.95rem', fontSize: '0.84rem' }}
                    >
                      {deletingCatInProgress ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Eliminando...
                        </>
                      ) : (
                        'Confirmar y Reasignar'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Listado de Categorías Registradas */}
              <div className={styles.catListSection}>
                <div className={styles.catListHeader}>
                  <h3 className={styles.catListTitle}>
                    <span>Categorías registradas</span>
                    <span className={styles.catCountBadge}>{categories.length}</span>
                  </h3>
                  <span className={styles.catListSubhint}>Filtros activos en web</span>
                </div>

                <div className={styles.catList}>
                  {categories.map((cat) => {
                    const photoCount = items.filter(
                      (i) => i.category.toLowerCase() === cat.slug.toLowerCase()
                    ).length;
                    const isProtected = cat.slug === 'otro';

                    return (
                      <div key={cat.slug} className={styles.catItem}>
                        <div className={styles.catItemLeft}>
                          <span className={`${styles.catBadgePill} ${getCategoryBadgeClass(cat.slug)}`}>
                            {cat.name}
                          </span>
                          <div className={styles.catItemMeta}>
                            <span className={styles.catItemSlug}>slug: {cat.slug}</span>
                            <span className={styles.catItemPhotosCount}>
                              <ImageIcon size={12} aria-hidden="true" />
                              {photoCount} {photoCount === 1 ? 'foto' : 'fotos'}
                            </span>
                          </div>
                        </div>

                        <div className={styles.catItemRight}>
                          {isProtected ? (
                            <span className={styles.catItemProtected} title="Categoría base del sistema protegida contra eliminación">
                              <Shield size={13} aria-hidden="true" />
                              <span>Base protegida</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={styles.catDeleteBtn}
                              onClick={() => setCatToDelete(cat)}
                              disabled={deletingCatInProgress}
                              title={`Eliminar categoría "${cat.name}"`}
                              aria-label={`Eliminar categoría ${cat.name}`}
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  setIsCategoriesModalOpen(false);
                  setCatToDelete(null);
                }}
                disabled={creatingCat || deletingCatInProgress}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Lightbox Ampliado */}
      {lightboxUrl && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setLightboxUrl(null)}
          style={{ padding: '1rem' }}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.actionBtn}
              style={{ position: 'absolute', top: -40, right: 0, width: 36, height: 36 }}
              onClick={() => setLightboxUrl(null)}
              aria-label="Cerrar vista ampliada"
            >
              <X size={20} />
            </button>
            <img
              src={lightboxUrl.url}
              alt={lightboxUrl.title}
              style={{
                maxWidth: '100%',
                maxHeight: '82vh',
                objectFit: 'contain',
                borderRadius: 8,
                boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
              }}
            />
            <p style={{ color: '#f3f7f5', marginTop: '0.75rem', fontSize: '0.95rem', fontWeight: 600 }}>
              {lightboxUrl.title}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GalleryView;
