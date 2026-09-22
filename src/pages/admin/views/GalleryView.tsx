import React, { useState, useEffect, useId, useRef } from 'react';
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
} from 'lucide-react';
import {
  getAdminGalleryItems,
  createGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,
  toggleGalleryItemActive,
  reorderGalleryItems,
  uploadGalleryPhoto,
} from '@/services/galleryService';
import type {
  GalleryItemRow,
  GalleryItemInsert,
  GalleryItemUpdate,
  GalleryCategory,
} from '@/types/raffle.types';
import {
  catalogoFotosManaure,
  resolveExperienceImage,
} from '@/assets/assets';
import styles from './GalleryView.module.css';

const CATEGORY_OPTIONS: { key: GalleryCategory; label: string; badgeClass: string }[] = [
  { key: 'cuatrimoto', label: 'Cuatrimotos', badgeClass: styles.catCuatrimoto },
  { key: 'parapente', label: 'Parapente', badgeClass: styles.catParapente },
  { key: 'serrania', label: 'Serranía del Perijá', badgeClass: styles.catSerrania },
  { key: 'hospedaje', label: 'Hospedaje & Glamping', badgeClass: styles.catHospedaje },
  { key: 'gastronomia', label: 'Gastronomía', badgeClass: styles.catGastronomia },
  { key: 'fogata', label: 'Noche & Fogata', badgeClass: styles.catFogata },
  { key: 'otro', label: 'Otra Experiencia', badgeClass: styles.catOtro },
];

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
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<string>('todas');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  // Modal de Confirmación de Eliminación
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<GalleryItemRow | null>(null);
  const [deletingInProgress, setDeletingInProgress] = useState(false);

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

  useEffect(() => {
    loadItems();
  }, []);

  // Resolver la URL de imagen optimizada (ya sea remota o del catálogo local)
  const resolveImage = (item: { image_slug: string | null; image_url: string | null }) => {
    if (item.image_url && item.image_url.trim()) {
      return item.image_url.trim();
    }
    return resolveExperienceImage(item.image_slug);
  };

  // Abrir modal para crear
  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormTitle('');
    setFormCategory('serrania');
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

  // Subir archivo al bucket de Supabase Storage
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setUploadingImage(true);

    const res = await uploadGalleryPhoto(file, formCategory || 'galeria');
    if (!res.success || !res.url) {
      showNotification('error', res.error || 'Error al subir la fotografía.');
    } else {
      setFormImageUrl(res.url);
      showNotification('success', 'Fotografía subida exitosamente.');
    }

    setUploadingImage(false);
  };

  // Guardar creación o edición
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formTitle.trim()) {
      showNotification('error', 'El título de la fotografía es obligatorio.');
      return;
    }

    if (imageMode === 'upload' && !formImageUrl) {
      showNotification('error', 'Por favor sube una fotografía o selecciona una del catálogo.');
      return;
    }

    setSavingItem(true);

    if (editingItem) {
      // Actualización
      const updates: GalleryItemUpdate = {
        title: formTitle.trim(),
        category: formCategory,
        alt_text: formAltText.trim() || formTitle.trim(),
        display_order: Number(formOrder) || 1,
        is_active: formIsActive,
        image_url: imageMode === 'upload' ? formImageUrl : null,
        image_slug: imageMode === 'local' ? formImageSlug : null,
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
        setIsModalOpen(false);
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
        image_url: imageMode === 'upload' ? formImageUrl : null,
        image_slug: imageMode === 'local' ? formImageSlug : null,
      };

      const res = await createGalleryItem(payload);
      if (!res.success || !res.data) {
        showNotification('error', res.error || 'No fue posible crear la fotografía.');
      } else {
        setItems((prev) => [...prev, res.data!].sort((a, b) => a.display_order - b.display_order));
        setIsModalOpen(false);
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
  const uniqueCategoriesCount = new Set(items.map((i) => i.category)).size;

  // Filtrado de fotos del catálogo de Manaure en el modal
  const filteredCatalog =
    catalogCategoryFilter === 'todas'
      ? catalogoFotosManaure
      : catalogoFotosManaure.filter((f) => f.categoria === catalogCategoryFilter);

  // Vista previa de la imagen seleccionada en el modal
  const modalPreviewUrl =
    imageMode === 'upload' && formImageUrl
      ? formImageUrl
      : resolveExperienceImage(formImageSlug);

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
            <div>
              <h1 id="gallery-admin-title" className={styles.title}>
                Galería Fotográfica
              </h1>
              <p className={styles.subtitle}>
                Gestiona las fotografías auténticas de Manaure visibles en la landing page y organiza futuros catálogos.
              </p>
            </div>
          </div>

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleOpenCreateModal}
          >
            <Plus size={18} aria-hidden="true" />
            <span>Agregar Fotografía</span>
          </button>
        </div>

        {/* Métricas en vivo */}
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Total Fotos</span>
            <span className={styles.metricValue}>{totalCount}</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Visibles</span>
            <span className={`${styles.metricValue} ${styles.metricValueActive}`}>{activeCount}</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Ocultas</span>
            <span className={`${styles.metricValue} ${styles.metricValueHidden}`}>{hiddenCount}</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Categorías</span>
            <span className={styles.metricValue}>{uniqueCategoriesCount}</span>
          </div>
        </div>
      </section>

      {/* Barra de Búsqueda y Filtros de Categoría */}
      <section className={styles.controlsCard} aria-label="Filtros de galería">
        <div className={styles.controlsTop}>
          <div className={styles.searchBox}>
            <Search size={18} color="var(--text-secondary)" aria-hidden="true" />
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
                style={{ background: 'none', border: 'none', color: '#9cb5ab', cursor: 'pointer' }}
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

        {/* Chips de Categorías */}
        <div className={styles.filterTabs} role="toolbar" aria-label="Filtrar por categoría">
          <button
            type="button"
            className={`${styles.filterChip} ${selectedCategory === 'todas' ? styles.filterChipActive : ''}`}
            onClick={() => setSelectedCategory('todas')}
          >
            Todas ({items.length})
          </button>
          {CATEGORY_OPTIONS.map((cat) => {
            const count = items.filter((i) => i.category.toLowerCase() === cat.key).length;
            return (
              <button
                key={cat.key}
                type="button"
                className={`${styles.filterChip} ${selectedCategory === cat.key ? styles.filterChipActive : ''}`}
                onClick={() => setSelectedCategory(cat.key)}
              >
                {cat.label} {count > 0 ? `(${count})` : ''}
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
            const categoryMeta = CATEGORY_OPTIONS.find((c) => c.key === item.category);

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
                    <span
                      className={`${styles.categoryBadge} ${
                        categoryMeta?.badgeClass || styles.catOtro
                      }`}
                    >
                      {categoryMeta?.label || item.category}
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
                    {item.image_url ? 'Subida a Supabase' : 'Catálogo Manaure'}
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
          onClick={() => !savingItem && setIsModalOpen(false)}
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
                onClick={() => setIsModalOpen(false)}
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
                      <span>Catálogo Manaure ({catalogoFotosManaure.length})</span>
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
                      {uploadingImage ? (
                        <>
                          <Loader2 size={32} className="animate-spin" color="#10b981" />
                          <p className={styles.dropzoneText}>Subiendo fotografía a Supabase...</p>
                        </>
                      ) : formImageUrl ? (
                        <>
                          <Check size={28} color="#10b981" />
                          <p className={styles.dropzoneText}>Fotografía cargada correctamente</p>
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
                        <option value="todas">Todas las categorías</option>
                        <option value="cuatrimoto">Cuatrimotos</option>
                        <option value="parapente">Parapente</option>
                        <option value="serrania">Serranía del Perijá</option>
                        <option value="hospedaje">Hospedaje</option>
                        <option value="glamping">Glamping & Fogata</option>
                        <option value="gastronomia">Gastronomía</option>
                      </select>
                    </div>

                    <div className={styles.catalogGrid}>
                      {filteredCatalog.map((foto) => {
                        const isSelected = formImageSlug === foto.slug;
                        return (
                          <div
                            key={foto.id}
                            className={`${styles.catalogItem} ${isSelected ? styles.catalogItemActive : ''}`}
                            onClick={() => {
                              setFormImageSlug(foto.slug);
                              if (!formTitle) setFormTitle(foto.alt);
                              if (!formAltText) setFormAltText(foto.alt);
                            }}
                            title={foto.alt}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && setFormImageSlug(foto.slug)}
                          >
                            <img
                              src={foto.thumb}
                              alt={foto.alt}
                              className={styles.catalogThumb}
                              loading="lazy"
                            />
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
                  <img
                    src={modalPreviewUrl}
                    alt="Previsualización"
                    className={styles.previewThumb}
                  />
                  <div className={styles.previewInfo}>
                    <strong style={{ color: '#f3f7f5' }}>Previsualización en tiempo real</strong>
                    <span style={{ color: '#9cb5ab' }}>
                      {imageMode === 'upload'
                        ? formImageUrl
                          ? 'Foto alojada en Supabase Storage'
                          : 'Esperando archivo...'
                        : `Foto del catálogo: ${formImageSlug}`}
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
                    <label htmlFor={categorySelectId} className={styles.formLabel}>
                      Categoría
                    </label>
                    <select
                      id={categorySelectId}
                      className={styles.formSelect}
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                    >
                      {CATEGORY_OPTIONS.map((cat) => (
                        <option key={cat.key} value={cat.key}>
                          {cat.label}
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
                  <span style={{ fontSize: '0.9rem', color: '#f3f7f5', fontWeight: 500 }}>
                    Fotografía activa y visible en la landing page
                  </span>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setIsModalOpen(false)}
                  disabled={savingItem}
                >
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={savingItem}>
                  {savingItem ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Guardando...
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
              <p style={{ margin: 0, color: '#f3f7f5', fontSize: '0.92rem' }}>
                Estás a punto de eliminar permanentemente la foto:
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', background: 'rgba(0,0,0,0.25)', padding: '0.75rem', borderRadius: 8 }}>
                <img
                  src={resolveImage(deletingItem)}
                  alt=""
                  style={{ width: 60, height: 45, objectFit: 'cover', borderRadius: 4 }}
                />
                <div>
                  <strong style={{ color: '#fff', fontSize: '0.95rem' }}>{deletingItem.title}</strong>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#9cb5ab' }}>Categoría: {deletingItem.category}</p>
                </div>
              </div>
              {deletingItem.image_url && (
                <p style={{ margin: 0, color: '#f59e0b', fontSize: '0.8rem' }}>
                  Nota: El archivo físico almacenado en Supabase Storage también será removido para liberar espacio.
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
