import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '@/context/useAuth';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Ticket,
  Sparkles,
  CreditCard,
  Building2,
  Trophy,
  History,
  Settings,
  X,
  LogOut,
  Users,
  Gift,
} from 'lucide-react';
import styles from './AdminSidebar.module.css';

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ isOpen, onClose }) => {
  const { user, adminProfile, signOut } = useAuth();

  const handleLinkClick = () => {
    // Si la pantalla es móvil/tablet, cerrar sidebar al seleccionar enlace
    if (window.innerWidth <= 1024) {
      onClose();
    }
  };

  const initial = (adminProfile?.full_name || user?.email || 'A')[0].toUpperCase();

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
      {/* Encabezado con Logo de Marca */}
      <div className={styles.brandArea}>
        <Link to="/admin" className={styles.brandLink} onClick={handleLinkClick}>
          <img
            src="/favicon.svg"
            alt="Logo oficial Manaure Vive"
            width={38}
            height={38}
            className={styles.brandLogoImg}
          />
          <div className={styles.brandText}>
            <span className={styles.brandName}>Manaure Vive</span>
            <span className={styles.brandTag}>Panel Admin</span>
          </div>
        </Link>

        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Cerrar menú lateral"
        >
          <X size={20} />
        </button>
      </div>

      {/* Contenedor de Navegación */}
      <div className={styles.navContainer}>
        {/* Sección: Principal */}
        <div className={styles.navSection}>
          <p className={styles.sectionHeading}>Principal</p>

          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            onClick={handleLinkClick}
          >
            <LayoutDashboard size={18} className={styles.linkIcon} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/admin/ordenes"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            onClick={handleLinkClick}
          >
            <ShoppingCart size={18} className={styles.linkIcon} />
            <span>Órdenes</span>
          </NavLink>

          <NavLink
            to="/admin/comprobantes"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            onClick={handleLinkClick}
          >
            <Receipt size={18} className={styles.linkIcon} />
            <span>Comprobantes</span>
          </NavLink>

          <NavLink
            to="/admin/tickets"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            onClick={handleLinkClick}
          >
            <Ticket size={18} className={styles.linkIcon} />
            <span>Tickets</span>
          </NavLink>
        </div>

        {/* Sección: Gestión */}
        <div className={styles.navSection}>
          <p className={styles.sectionHeading}>Gestión</p>

          <NavLink
            to="/admin/compradores"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            onClick={handleLinkClick}
          >
            <Users size={18} className={styles.linkIcon} />
            <span>Compradores</span>
          </NavLink>

          <NavLink
            to="/admin/rifas"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            onClick={handleLinkClick}
          >
            <Sparkles size={18} className={styles.linkIcon} />
            <span>Rifas</span>
          </NavLink>

          <NavLink
            to="/admin/premio"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            onClick={handleLinkClick}
          >
            <Gift size={18} className={styles.linkIcon} />
            <span>El Premio</span>
          </NavLink>

          <NavLink
            to="/admin/cuentas"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            onClick={handleLinkClick}
          >
            <CreditCard size={18} className={styles.linkIcon} />
            <span>Cuentas de pago</span>
          </NavLink>

          <NavLink
            to="/admin/aliados"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            onClick={handleLinkClick}
          >
            <Building2 size={18} className={styles.linkIcon} />
            <span>Aliados</span>
          </NavLink>

          <NavLink
            to="/admin/ganadores"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            onClick={handleLinkClick}
          >
            <Trophy size={18} className={styles.linkIcon} />
            <span>Ganadores</span>
          </NavLink>
        </div>

        {/* Sección: Sistema */}
        <div className={styles.navSection}>
          <p className={styles.sectionHeading}>Sistema</p>

          <NavLink
            to="/admin/auditoria"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            onClick={handleLinkClick}
          >
            <History size={18} className={styles.linkIcon} />
            <span>Auditoría</span>
          </NavLink>

          <NavLink
            to="/admin/configuracion"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            onClick={handleLinkClick}
          >
            <Settings size={18} className={styles.linkIcon} />
            <span>Configuración</span>
          </NavLink>
        </div>
      </div>

      {/* Pie del Sidebar: Usuario y Cierre de Sesión */}
      <div className={styles.sidebarFooter}>
        <div className={styles.userCard}>
          <div className={styles.userAvatar}>{initial}</div>
          <div className={styles.userDetails}>
            <span className={styles.userName}>
              {adminProfile?.full_name || user?.email?.split('@')[0] || 'Admin'}
            </span>
            <span className={styles.userRole}>{adminProfile?.role || 'admin'}</span>
          </div>
        </div>

        <button type="button" className={styles.logoutButton} onClick={() => void signOut()}>
          <LogOut size={16} />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
};
