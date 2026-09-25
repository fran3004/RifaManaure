import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import styles from './AdminBreadcrumbs.module.css';

const ROUTE_LABELS: Record<string, string> = {
  '': 'Resumen',
  dashboard: 'Resumen',
  ordenes: 'Órdenes',
  comprobantes: 'Comprobantes',
  tickets: 'Boletos',
  rifas: 'Rifas',
  cuentas: 'Cuentas de pago',
  aliados: 'Aliados',
  ganadores: 'Ganadores',
  auditoria: 'Auditoría',
  configuracion: 'Configuración',
};

export const AdminBreadcrumbs: React.FC = () => {
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean); // ['admin', 'ordenes', ...]

  // Si estamos en /admin, el segmento secundario es vacío o dashboard
  const subSection = pathSegments[1] || '';
  const currentLabel = ROUTE_LABELS[subSection] || 'Panel';

  return (
    <nav className={styles.breadcrumbsNav} aria-label="Ruta de navegación">
      <Link to="/admin" className={styles.crumbLink}>
        Administración
      </Link>
      <span className={styles.separator} aria-hidden="true">
        <ChevronRight size={14} />
      </span>
      <span className={styles.currentCrumb} aria-current="page">
        {currentLabel}
      </span>
    </nav>
  );
};
