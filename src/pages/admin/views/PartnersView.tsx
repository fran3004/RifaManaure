import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import { normalizeAppError, logAppError } from '@/lib/errorHandling';
import {
  getAllPartnersAdmin,
  createPartner,
  updatePartner,
  togglePartnerActive,
  deletePartner,
  uploadPartnerLogo,
  generatePartnerSlug,
} from '@/services/partnerService';
import {
  getOptimizedCloudinaryUrl,
  deleteFromCloudinary,
  extractCloudinaryPublicId,
} from '@/services/cloudinaryService';
import type { PartnerRow } from '@/types/raffle.types';
import { aliados as fallbackAliados } from '@/assets/assets';
import {
  Building2,
  Plus,
  Sparkles,
  Check,
  Edit2,
  Trash2,
  EyeOff,
  ExternalLink,
  Globe,
  Upload,
  Link,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  Search,
  Image as ImageIcon,
  Compass,
  RefreshCw,
} from 'lucide-react';
import styles from './AdminViews.module.css';
import partnerStyles from './PartnersView.module.css';

const InstagramIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 14,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

// Diccionario de logos locales para fallback visual en la vista administrativa
const localAliadosMap = new Map(fallbackAliados.map((a) => [a.slug, a.logoGrid]));

const CATEGORY_PRESETS = [
  'Aventura y Deportes Extremos',
  'Hospedaje & Glamping',
  'Gastronomía Típica',
  'Naturaleza & Ecoturismo',
  'Artesanías & Café',
  'Fotografía & Audiovisual',
];

export const PartnersView: React.FC = () => {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState<boolean>(false);

  // Filtros
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modales
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<PartnerRow | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingPartner, setDeletingPartner] = useState<PartnerRow | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    category: '',
    description: '',
    website_url: '',
    instagram_url: '',
    display_order: 0,
    is_active: true,
  });

  // Estado para gestión del Logo
  const [logoTab, setLogoTab] = useState<'upload' | 'url'>('upload');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllPartnersAdmin();
      setPartners(data);
      setIsForbidden(false);
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, 'Error al cargar los aliados');
      logAppError('PartnersView.loadPartners', normalized);
      setError(normalized.userMessage);
      setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function fetchInitialPartners() {
      setLoading(true);
      setError(null);
      try {
        const data = await getAllPartnersAdmin();
        if (ignore) return;
        setPartners(data);
        setIsForbidden(false);
      } catch (err: unknown) {
        if (!ignore) {
          const normalized = normalizeAppError(err, 'Error al cargar los aliados');
          logAppError('PartnersView.fetchInitialPartners', normalized);
          setError(normalized.userMessage);
          setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void fetchInitialPartners();
    return () => {
      ignore = true;
    };
  }, []);

  // Limpiar feedback automáticamente
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Abrir Modal de Creación
  const handleOpenCreateModal = () => {
    setEditingPartner(null);
    setFormData({
      name: '',
      slug: '',
      category: 'Aventura y Deportes Extremos',
      description: '',
      website_url: '',
      instagram_url: '',
      display_order: partners.length + 1,
      is_active: true,
    });
    setLogoTab('upload');
    setLogoUrl('');
    setLogoFile(null);
    setLogoPreview(null);
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Abrir Modal de Edición
  const handleOpenEditModal = (partner: PartnerRow) => {
    setEditingPartner(partner);
    setFormData({
      name: partner.name,
      slug: partner.slug,
      category: partner.category,
      description: partner.description || '',
      website_url: partner.website_url || '',
      instagram_url: partner.instagram_url || '',
      display_order: partner.display_order,
      is_active: partner.is_active,
    });
    setLogoUrl(partner.logo_url || '');
    setLogoFile(null);
    setLogoPreview(
      partner.logo_url
        ? getOptimizedCloudinaryUrl(partner.logo_url, { width: 200 })
        : localAliadosMap.get(partner.slug) || null
    );
    setLogoTab('upload');
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Manejar cambio de nombre con autogeneración de slug
  const handleNameChange = (val: string) => {
    setFormData((prev) => ({
      ...prev,
      name: val,
      slug:
        !editingPartner || prev.slug === generatePartnerSlug(prev.name)
          ? generatePartnerSlug(val)
          : prev.slug,
    }));
  };

  // Manejar selección de archivo de logo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      setFormErrors((prev) => ({
        ...prev,
        logo: 'Formato no admitido. Usa PNG, WebP, JPG o SVG.',
      }));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFormErrors((prev) => ({
        ...prev,
        logo: 'El archivo supera el límite de 5 MB.',
      }));
      return;
    }

    setFormErrors((prev) => {
      const copy = { ...prev };
      delete copy.logo;
      return copy;
    });

    setLogoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);
  };

  const handleRemoveSelectedFile = () => {
    if (logoFile) {
      setLogoFile(null);
      setLogoPreview(
        logoUrl
          ? getOptimizedCloudinaryUrl(logoUrl, { width: 200 })
          : editingPartner
            ? localAliadosMap.get(editingPartner.slug) || null
            : null
      );
    } else {
      setLogoUrl('');
      setLogoFile(null);
      setLogoPreview(null);
    }
  };

  // Validaciones del Formulario
  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'El nombre del aliado es obligatorio.';
    if (!formData.slug.trim()) errs.slug = 'El identificador (slug) es obligatorio.';
    if (!formData.category.trim()) errs.category = 'La categoría es obligatoria.';

    if (formData.website_url.trim() && !/^https?:\/\//i.test(formData.website_url.trim())) {
      errs.website_url = 'El enlace web debe comenzar con http:// o https://';
    }

    if (formData.instagram_url.trim() && !/^https?:\/\//i.test(formData.instagram_url.trim())) {
      errs.instagram_url = 'El enlace de Instagram debe comenzar con http:// o https://';
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Enviar Formulario (Crear o Actualizar)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      let finalLogoUrl = logoUrl.trim() || null;

      // Si se subió un archivo nuevo, subir a Cloudinary
      if (logoFile) {
        const uploadRes = await uploadPartnerLogo(logoFile, formData.slug);
        if (!uploadRes.success || !uploadRes.url) {
          setFormErrors((prev) => ({
            ...prev,
            logo: uploadRes.error || 'Error al subir el logotipo a Cloudinary.',
          }));
          setIsSubmitting(false);
          return;
        }
        finalLogoUrl = uploadRes.url;
      }

      if (editingPartner) {
        // Actualizar
        const res = await updatePartner(editingPartner.id, {
          name: formData.name,
          slug: formData.slug,
          category: formData.category,
          description: formData.description || null,
          logo_url: finalLogoUrl,
          website_url: formData.website_url.trim() || null,
          instagram_url: formData.instagram_url.trim() || null,
          display_order: Number(formData.display_order) || 0,
          is_active: formData.is_active,
        });

        if (res.success && res.data) {
          // Si el logo fue reemplazado por uno nuevo, eliminar el anterior de Cloudinary para no dejar basura
          const oldLogo = editingPartner.logo_url;
          if (oldLogo && finalLogoUrl && oldLogo !== finalLogoUrl) {
            const oldPublicId = extractCloudinaryPublicId(oldLogo);
            if (oldPublicId && oldPublicId.startsWith('manaure-vive/aliados/')) {
              void deleteFromCloudinary(oldPublicId).catch((err) => {
                console.warn('[PartnersView] No se pudo purgar el logo anterior de Cloudinary:', err);
              });
            }
          }

          setPartners((prev) => prev.map((p) => (p.id === res.data!.id ? res.data! : p)));
          setFeedback({
            type: 'success',
            message: `Aliado "${formData.name}" actualizado correctamente.`,
          });
          setIsFormModalOpen(false);
        } else {
          setFormErrors((prev) => ({
            ...prev,
            submit: res.error || 'Error al actualizar el aliado.',
          }));
        }
      } else {
        // Crear
        const res = await createPartner({
          name: formData.name,
          slug: formData.slug,
          category: formData.category,
          description: formData.description || null,
          logo_url: finalLogoUrl,
          website_url: formData.website_url.trim() || null,
          instagram_url: formData.instagram_url.trim() || null,
          display_order: Number(formData.display_order) || 0,
          is_active: formData.is_active,
        });

        if (res.success && res.data) {
          setPartners((prev) => [...prev, res.data!]);
          setFeedback({
            type: 'success',
            message: `Aliado "${formData.name}" registrado exitosamente.`,
          });
          setIsFormModalOpen(false);
        } else {
          setFormErrors((prev) => ({
            ...prev,
            submit: res.error || 'Error al registrar el aliado.',
          }));
        }
      }
    } catch (err) {
      setFormErrors((prev) => ({
        ...prev,
        submit: err instanceof Error ? err.message : 'Error inesperado de comunicación.',
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Activo / Inactivo
  const handleToggleActive = async (partner: PartnerRow) => {
    const nextState = !partner.is_active;

    // Optimista
    setPartners((prev) =>
      prev.map((p) => (p.id === partner.id ? { ...p, is_active: nextState } : p))
    );

    const res = await togglePartnerActive(partner.id, nextState);
    if (!res.success) {
      // Revertir
      setPartners((prev) =>
        prev.map((p) => (p.id === partner.id ? { ...p, is_active: partner.is_active } : p))
      );
      setFeedback({
        type: 'error',
        message: res.error || 'No fue posible modificar el estado del aliado.',
      });
    } else {
      setFeedback({
        type: 'success',
        message: `Aliado "${partner.name}" ${nextState ? 'activado' : 'desactivado'}.`,
      });
    }
  };

  // Eliminar
  const handleConfirmDelete = async () => {
    if (!deletingPartner) return;
    setIsSubmitting(true);
    try {
      const res = await deletePartner(deletingPartner.id, deletingPartner.logo_url);
      if (res.success) {
        setPartners((prev) => prev.filter((p) => p.id !== deletingPartner.id));
        setFeedback({
          type: 'success',
          message: `Aliado "${deletingPartner.name}" y su logotipo en Cloudinary eliminados correctamente.`,
        });
        setIsDeleteModalOpen(false);
        setDeletingPartner(null);
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'No fue posible eliminar el aliado.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Error de red al intentar eliminar el aliado.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtrado de Aliados
  const filteredPartners = useMemo(() => {
    return partners.filter((p) => {
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && p.is_active) ||
        (filterStatus === 'inactive' && !p.is_active);

      const searchLower = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !searchLower ||
        p.name.toLowerCase().includes(searchLower) ||
        p.category.toLowerCase().includes(searchLower) ||
        p.slug.toLowerCase().includes(searchLower) ||
        (p.description && p.description.toLowerCase().includes(searchLower));

      return matchesStatus && matchesSearch;
    });
  }, [partners, filterStatus, searchTerm]);

  // Métricas dinámicas
  const metrics = useMemo(() => {
    const total = partners.length;
    const active = partners.filter((p) => p.is_active).length;
    const inactive = total - active;
    const uniqueCategories = new Set(partners.map((p) => p.category.trim())).size;

    return { total, active, inactive, uniqueCategories };
  }, [partners]);

  // Resolver el logo a renderizar
  const getPartnerLogoSrc = (partner: PartnerRow) => {
    if (partner.logo_url && partner.logo_url.trim() !== '') {
      return getOptimizedCloudinaryUrl(partner.logo_url, { width: 200 });
    }
    return localAliadosMap.get(partner.slug) || null;
  };

  return (
    <div className={styles.viewContainer}>
      <AdminPageHeader
        title="Convenios y Aliados"
        description="Administración integral de operadores turísticos, cabañas, restaurantes y comercios aliados en Manaure (Cesar)."
        badge={`${metrics.total} Aliados`}
        actions={
          <div className={partnerStyles.headerActions}>
            <button
              type="button"
              className={`${styles.btnSecondary} ${partnerStyles.btnRefresh}`}
              onClick={() => void loadPartners()}
              disabled={loading}
              title="Actualizar lista de aliados"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button type="button" className={styles.btnPrimary} onClick={handleOpenCreateModal}>
              <Plus size={16} />
              <span>Nuevo Aliado</span>
            </button>
          </div>
        }
      />

      {/* Banner de Retroalimentación */}
      {feedback && (
        <div
          className={`${styles.cardSection} ${partnerStyles.feedbackBanner} ${
            feedback.type === 'success'
              ? partnerStyles.feedbackBannerSuccess
              : partnerStyles.feedbackBannerError
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className={partnerStyles.feedbackMessage}>{feedback.message}</span>
        </div>
      )}

      {/* Grid de Métricas Dinámicas */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Total Registrados</span>
            <div className={styles.metricIcon}>
              <Building2 size={18} />
            </div>
          </div>
          <div className={styles.metricValue}>{metrics.total}</div>
          <span className={styles.metricHint}>Convenios en base de datos</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Visibles en Web</span>
            <div className={`${styles.metricIcon} ${partnerStyles.metricSuccess}`}>
              <Sparkles size={18} />
            </div>
          </div>
          <div className={`${styles.metricValue} ${partnerStyles.metricSuccess}`}>
            {metrics.active}
          </div>
          <span className={styles.metricHint}>Publicados en FilaAliados</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Inactivos / Ocultos</span>
            <div className={`${styles.metricIcon} ${partnerStyles.metricDanger}`}>
              <EyeOff size={18} />
            </div>
          </div>
          <div className={`${styles.metricValue} ${partnerStyles.metricDanger}`}>
            {metrics.inactive}
          </div>
          <span className={styles.metricHint}>Pausados temporalmente</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Sectores / Categorías</span>
            <div className={`${styles.metricIcon} ${partnerStyles.metricInfo}`}>
              <Compass size={18} />
            </div>
          </div>
          <div className={`${styles.metricValue} ${partnerStyles.metricInfo}`}>
            {metrics.uniqueCategories}
          </div>
          <span className={styles.metricHint}>Diversidad de servicios turísticos</span>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className={styles.filterBar}>
        <div className={styles.searchGroup}>
          <Search size={16} className={partnerStyles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por nombre, categoría, slug o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className={styles.filterControls}>
          <select
            className={styles.filterSelect}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Solo Activos (En Web)</option>
            <option value="inactive">Solo Inactivos</option>
          </select>
        </div>
      </div>

      {/* Grid de Aliados */}
      {loading ? (
        <div className={styles.emptyStateCard}>
          <Loader2
            size={32}
            className={`animate-spin ${partnerStyles.loaderAccent}`}
          />
          <h3 className={styles.emptyStateTitle}>Cargando Aliados</h3>
          <p className={styles.emptyStateDescription}>
            Consultando el catálogo oficial de aliados comerciales...
          </p>
        </div>
      ) : error ? (
        <div className={styles.cardSection}>
          <AdminErrorState
            title={isForbidden ? 'Acceso Restringido' : 'Error al cargar aliados'}
            message={error}
            isForbidden={isForbidden}
            onRetry={() => void loadPartners()}
          />
        </div>
      ) : filteredPartners.length === 0 ? (
        <div className={styles.emptyStateCard}>
          <div className={styles.emptyStateIconWrapper}>
            <Building2 size={28} />
          </div>
          <h3 className={styles.emptyStateTitle}>No se encontraron aliados</h3>
          <p className={styles.emptyStateDescription}>
            {searchTerm || filterStatus !== 'all'
              ? 'No hay registros que coincidan con los filtros aplicados.'
              : 'Aún no hay aliados registrados. Utiliza el botón "Nuevo Aliado" para agregar el primero.'}
          </p>
          <button type="button" className={styles.btnPrimary} onClick={handleOpenCreateModal}>
            <Plus size={16} />
            <span>Crear Primer Aliado</span>
          </button>
        </div>
      ) : (
        <div className={styles.receiptGrid}>
          {filteredPartners.map((partner) => {
            const logoSrc = getPartnerLogoSrc(partner);

            return (
              <div
                key={partner.id}
                className={`${partnerStyles.partnerCard} ${
                  !partner.is_active ? partnerStyles.partnerCardInactive : ''
                }`}
              >
                {/* Parte Superior con Logo e Información Principal */}
                <div className={partnerStyles.cardTop}>
                  <div className={partnerStyles.logoBox}>
                    {logoSrc ? (
                      <img
                        src={logoSrc}
                        alt={`Logo de ${partner.name}`}
                        className={partnerStyles.logoImg}
                        loading="lazy"
                        onError={(e) => {
                          const fallbackSrc = localAliadosMap.get(partner.slug);
                          if (fallbackSrc && e.currentTarget.src !== fallbackSrc) {
                            e.currentTarget.src = fallbackSrc;
                          }
                        }}
                      />
                    ) : (
                      <Building2
                        size={28}
                        className={partnerStyles.logoFallbackIcon}
                      />
                    )}
                  </div>

                  <div className={partnerStyles.partnerInfo}>
                    <div className={partnerStyles.partnerHeaderRow}>
                      <h4 className={partnerStyles.partnerName}>{partner.name}</h4>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(partner)}
                        className={`${styles.statusToggleBtn} ${
                          partner.is_active
                            ? styles.statusToggleActive
                            : styles.statusToggleInactive
                        }`}
                        title={
                          partner.is_active
                            ? 'Clic para ocultar de la web'
                            : 'Clic para publicar en web'
                        }
                      >
                        {partner.is_active ? <Check size={13} /> : <EyeOff size={13} />}
                        <span>{partner.is_active ? 'Activo' : 'Inactivo'}</span>
                      </button>
                    </div>

                    <span className={partnerStyles.partnerSlug}>@{partner.slug}</span>
                    <span className={partnerStyles.categoryBadge}>{partner.category}</span>
                  </div>
                </div>

                {/* Descripción */}
                {partner.description && (
                  <p className={partnerStyles.partnerDesc} title={partner.description}>
                    {partner.description}
                  </p>
                )}

                {/* Enlaces Salientes */}
                <div className={partnerStyles.linksRow}>
                  {partner.website_url && (
                    <a
                      href={partner.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={partnerStyles.linkTag}
                      title="Visitar sitio web oficial"
                    >
                      <Globe size={13} />
                      <span>Web</span>
                      <ExternalLink size={10} />
                    </a>
                  )}

                  {partner.instagram_url && (
                    <a
                      href={partner.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${partnerStyles.linkTag} ${partnerStyles.linkTagInstagram}`}
                      title="Visitar perfil de Instagram"
                    >
                      <InstagramIcon size={13} />
                      <span>Instagram</span>
                      <ExternalLink size={10} />
                    </a>
                  )}

                  {!partner.website_url && !partner.instagram_url && (
                    <span className={partnerStyles.noLinksText}>
                      Sin enlaces externos configurados
                    </span>
                  )}
                </div>

                {/* Pie de Tarjeta con Orden y Acciones */}
                <div className={partnerStyles.cardFooter}>
                  <span className={partnerStyles.orderNumberBadge}>
                    Prioridad #{partner.display_order}
                  </span>

                  <div className={partnerStyles.actionsGroup}>
                    <button
                      type="button"
                      className={styles.btnActionEdit}
                      onClick={() => handleOpenEditModal(partner)}
                      title="Editar información del aliado"
                    >
                      <Edit2 size={13} />
                      <span>Editar</span>
                    </button>

                    <button
                      type="button"
                      className={styles.btnActionDelete}
                      onClick={() => {
                        setDeletingPartner(partner);
                        setIsDeleteModalOpen(true);
                      }}
                      title="Eliminar aliado"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE CREACIÓN / EDICIÓN DE ALIADO */}
      {/* ========================================================================= */}
      {isFormModalOpen && (
        <div
          className={styles.adminModalBackdrop}
          onClick={() => !isSubmitting && setIsFormModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`${styles.adminModalCard} ${partnerStyles.modalCardLg}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={partnerStyles.modalHeaderRow}>
              <div className={partnerStyles.modalTitleGroup}>
                <div className={partnerStyles.modalIconBox}>
                  <Building2 size={20} />
                </div>
                <h3 className={`${styles.sectionTitle} ${partnerStyles.modalSectionTitle}`}>
                  {editingPartner ? 'Editar Aliado Oficial' : 'Registrar Nuevo Aliado'}
                </h3>
              </div>
              <button
                type="button"
                className={`${styles.btnSecondary} ${partnerStyles.modalCloseBtn}`}
                onClick={() => !isSubmitting && setIsFormModalOpen(false)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            {formErrors.submit && (
              <div className={partnerStyles.formErrorBanner}>
                {formErrors.submit}
              </div>
            )}

            <form onSubmit={handleSubmitForm} className={styles.formModalGrid}>
              {/* Nombre */}
              <div className={styles.formModalGroup}>
                <label className={styles.formModalLabel}>
                  Nombre del Aliado <span className={partnerStyles.requiredIndicator}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Cuatri Tours Manaure"
                  className={styles.formModalInput}
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  disabled={isSubmitting}
                />
                {formErrors.name && (
                  <span className={partnerStyles.formFieldError}>{formErrors.name}</span>
                )}
              </div>

              {/* Slug */}
              <div className={styles.formModalGroup}>
                <label className={styles.formModalLabel}>
                  Slug Identificador <span className={partnerStyles.requiredIndicator}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="cuatri-tours-manaure"
                  className={styles.formModalInput}
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                    }))
                  }
                  disabled={isSubmitting}
                />
                {formErrors.slug && (
                  <span className={partnerStyles.formFieldError}>{formErrors.slug}</span>
                )}
              </div>

              {/* Categoría */}
              <div className={`${styles.formModalGroup} ${styles.formModalFull}`}>
                <label className={styles.formModalLabel}>
                  Sector o Categoría Turística <span className={partnerStyles.requiredIndicator}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Aventura en cuatrimotos y rutas"
                  className={styles.formModalInput}
                  value={formData.category}
                  onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                  disabled={isSubmitting}
                />
                <div className={styles.presetChipsRow}>
                  {CATEGORY_PRESETS.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`${styles.presetChip} ${
                        formData.category === cat ? styles.presetChipSelected : ''
                      }`}
                      onClick={() => setFormData((prev) => ({ ...prev, category: cat }))}
                      disabled={isSubmitting}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logotipo: Selección Dual */}
              <div className={`${styles.formModalGroup} ${styles.formModalFull}`}>
                <label className={styles.formModalLabel}>Logotipo Oficial del Aliado</label>

                <div className={partnerStyles.logoTabsRow}>
                  <button
                    type="button"
                    className={`${partnerStyles.logoTabBtn} ${
                      logoTab === 'upload' ? partnerStyles.logoTabBtnActive : ''
                    }`}
                    onClick={() => setLogoTab('upload')}
                  >
                    <Upload size={14} />
                    <span>Subir archivo (Cloudinary)</span>
                  </button>
                  <button
                    type="button"
                    className={`${partnerStyles.logoTabBtn} ${
                      logoTab === 'url' ? partnerStyles.logoTabBtnActive : ''
                    }`}
                    onClick={() => setLogoTab('url')}
                  >
                    <Link size={14} />
                    <span>URL Externa</span>
                  </button>
                </div>

                {logoTab === 'upload' ? (
                  <div>
                    <label className={partnerStyles.fileDropzone}>
                      <ImageIcon
                        size={28}
                        className={partnerStyles.dropzoneIcon}
                      />
                      <span className={partnerStyles.dropzoneTitle}>
                        {logoFile
                          ? logoFile.name
                          : editingPartner?.logo_url
                            ? 'Haz clic o arrastra para reemplazar el logotipo actual'
                            : 'Haz clic para seleccionar o arrastra un logotipo'}
                      </span>
                      <span className={partnerStyles.dropzoneHint}>
                        PNG, WebP, JPG o SVG (máx. 5 MB). Se alojará en Cloudinary CDN.
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/webp,image/jpeg,image/svg+xml"
                        className={partnerStyles.hiddenInput}
                        onChange={handleFileChange}
                        disabled={isSubmitting}
                      />
                    </label>
                  </div>
                ) : (
                  <div>
                    <input
                      type="url"
                      placeholder="https://ejemplo.com/logo.png"
                      className={styles.formModalInput}
                      value={logoUrl}
                      onChange={(e) => {
                        setLogoUrl(e.target.value);
                        setLogoPreview(e.target.value || null);
                      }}
                      disabled={isSubmitting}
                    />
                  </div>
                )}

                {/* Previsualización del Logo */}
                {logoPreview && (
                  <div className={partnerStyles.logoPreviewArea}>
                    <img
                      src={logoPreview}
                      alt="Vista previa del logo"
                      className={partnerStyles.logoPreviewThumb}
                    />
                    <div className={partnerStyles.logoPreviewMeta}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong>Vista Previa del Logotipo</strong>
                        {logoFile ? (
                          <span className={partnerStyles.newFileBadge}>Nuevo archivo</span>
                        ) : logoUrl?.includes('res.cloudinary.com') ? (
                          <span className={partnerStyles.cloudinaryBadge}>Cloudinary CDN</span>
                        ) : null}
                      </div>
                      <div>
                        {logoFile
                          ? `${logoFile.name} (${Math.round(logoFile.size / 1024)} KB)`
                          : logoUrl?.includes('res.cloudinary.com')
                            ? 'Alojado y optimizado en Cloudinary CDN'
                            : 'Logo local asignado'}
                      </div>
                    </div>
                    {(logoFile || logoUrl || logoPreview) && (
                      <button
                        type="button"
                        className={partnerStyles.btnRemoveLogo}
                        onClick={handleRemoveSelectedFile}
                        disabled={isSubmitting}
                      >
                        {logoFile ? 'Cancelar archivo' : 'Remover'}
                      </button>
                    )}
                  </div>
                )}

                {formErrors.logo && (
                  <div
                    className={partnerStyles.formErrorBanner}
                    style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <AlertCircle size={15} style={{ flexShrink: 0 }} />
                    <span>{formErrors.logo}</span>
                  </div>
                )}
              </div>

              {/* Descripción */}
              <div className={`${styles.formModalGroup} ${styles.formModalFull}`}>
                <label className={styles.formModalLabel}>Descripción o Reseña de Servicios</label>
                <textarea
                  placeholder="Breve reseña sobre las experiencias, rutas o platos que ofrece este aliado..."
                  className={styles.formModalTextarea}
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>

              {/* Enlace Web */}
              <div className={styles.formModalGroup}>
                <label className={styles.formModalLabel}>Enlace Web Oficial</label>
                <input
                  type="url"
                  placeholder="https://aliado.com o link de WhatsApp"
                  className={styles.formModalInput}
                  value={formData.website_url}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, website_url: e.target.value }))
                  }
                  disabled={isSubmitting}
                />
                {formErrors.website_url && (
                  <span className={partnerStyles.formFieldError}>
                    {formErrors.website_url}
                  </span>
                )}
              </div>

              {/* Enlace Instagram */}
              <div className={styles.formModalGroup}>
                <label className={styles.formModalLabel}>Perfil de Instagram</label>
                <input
                  type="url"
                  placeholder="https://instagram.com/usuario"
                  className={styles.formModalInput}
                  value={formData.instagram_url}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, instagram_url: e.target.value }))
                  }
                  disabled={isSubmitting}
                />
                {formErrors.instagram_url && (
                  <span className={partnerStyles.formFieldError}>
                    {formErrors.instagram_url}
                  </span>
                )}
              </div>

              {/* Orden de Visualización */}
              <div className={styles.formModalGroup}>
                <label className={styles.formModalLabel}>Prioridad / Orden en Cuadrícula</label>
                <input
                  type="number"
                  min={0}
                  className={styles.formModalInput}
                  value={formData.display_order}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      display_order: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  disabled={isSubmitting}
                />
              </div>

              {/* Estado Activo */}
              <div className={`${styles.formModalGroup} ${partnerStyles.formModalGroupCentered}`}>
                <label className={styles.formModalCheckboxLabel}>
                  <input
                    type="checkbox"
                    className={styles.formModalCheckbox}
                    checked={formData.is_active}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
                    }
                    disabled={isSubmitting}
                  />
                  <span>Publicar y hacer visible en la página principal</span>
                </label>
              </div>

              {/* Botones de Acción */}
              <div
                className={`${styles.formModalFull} ${partnerStyles.formModalFooter}`}
              >
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setIsFormModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>
                        {logoFile
                          ? 'Subiendo logotipo a Cloudinary...'
                          : editingPartner
                            ? 'Actualizando aliado...'
                            : 'Registrando aliado...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>{editingPartner ? 'Actualizar Aliado' : 'Registrar Aliado'}</span>
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
      {isDeleteModalOpen && deletingPartner && (
        <div
          className={styles.adminModalBackdrop}
          onClick={() => !isSubmitting && setIsDeleteModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`${styles.adminModalCard} ${partnerStyles.deleteModalCard}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={partnerStyles.deleteModalIcon}>
              <Trash2 size={24} />
            </div>

            <h3 className={`${styles.sectionTitle} ${partnerStyles.deleteModalTitle}`}>
              ¿Eliminar Aliado Oficial?
            </h3>

            <p className={partnerStyles.deleteModalDescription}>
              Estás a punto de eliminar a{' '}
              <strong className={partnerStyles.highlightText}>{deletingPartner.name}</strong>. Esta acción
              removerá el convenio de la base de datos y eliminará permanentemente su logotipo de Cloudinary CDN para no dejar archivos residuales.
            </p>

            <div className={partnerStyles.deleteModalActions}>
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
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Eliminando y liberando espacio...</span>
                  </>
                ) : (
                  <span>Sí, Eliminar Aliado</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
