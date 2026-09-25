import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { logoPrincipal } from '@/assets/assets';
import {
  Ticket,
  Menu,
  X,
  Compass,
  Image as ImageIcon,
  Handshake,
  HelpCircle,
  Leaf,
} from 'lucide-react';
import { Button } from '@/components/public/ui/Button';
import styles from './Navbar.module.css';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'premio', label: 'El Premio', icon: Compass },
  { id: 'galeria', label: 'Galería', icon: ImageIcon },
  { id: 'aliados', label: 'Aliados', icon: Handshake },
  { id: 'faq', label: 'Preguntas', icon: HelpCircle },
];

export const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === '/';
  const effectiveActiveSection = isHome ? activeSection : '';

  const navHeaderRef = useRef<HTMLElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);

  // Detección de scroll (> 8px) para elevar la barra con sombra suave
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scrollspy: IntersectionObserver para las secciones principales de la home
  useEffect(() => {
    if (!isHome) return;

    const sectionIds = ['premio', 'galeria', 'aliados', 'faq'];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-20% 0px -65% 0px',
        threshold: 0,
      }
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        observer.observe(el);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [isHome]);

  const closeMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  // Bloqueo de scroll del body y auto-cierre al redimensionar a pantalla grande (>= 900px)
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleResize = () => {
      if (window.innerWidth >= 900) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('resize', handleResize);
    };
  }, [mobileMenuOpen]);

  // Focus trap para accesibilidad, tecla Escape y click fuera
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMobileMenuOpen(false);
        menuToggleRef.current?.focus();
        return;
      }

      if (e.key === 'Tab') {
        const container = mobileMenuRef.current;
        const toggle = menuToggleRef.current;
        if (!container || !toggle) return;

        const focusableElements = Array.from(
          container.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        const allFocusables = [toggle, ...focusableElements];
        if (allFocusables.length === 0) return;

        const firstEl = allFocusables[0];
        const lastEl = allFocusables[allFocusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        navHeaderRef.current &&
        !navHeaderRef.current.contains(e.target as Node)
      ) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mobileMenuOpen]);

  const handleSectionClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault();
    closeMenu();
    if (isHome) {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      window.history.pushState(null, '', `/#${sectionId}`);
      setActiveSection(sectionId);
    } else {
      navigate(`/#${sectionId}`);
    }
  };

  const handleConsultarClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    closeMenu();
    navigate('/verificar');
  };

  return (
    <header
      ref={navHeaderRef}
      className={`${styles.navbar} ${isScrolled ? styles.scrolled : ''} ${mobileMenuOpen ? styles.navbarMenuOpen : ''}`}
    >
      <div className={`container ${styles.navContainer}`}>
        <Link
          to="/"
          className={styles.brandLink}
          onClick={closeMenu}
          aria-label="Manaure Vive - Ir al inicio"
        >
          <img
            src={logoPrincipal.web}
            alt="Logo oficial de Manaure Vive"
            width={160}
            height={44}
            className={styles.brandLogo}
          />
        </Link>

        {/* Enlaces de escritorio (>= 900px) */}
        <nav className={styles.desktopNav} aria-label="Navegación principal">
          <div className={styles.linksGroup}>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = effectiveActiveSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`/#${item.id}`}
                  className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={(e) => handleSectionClick(e, item.id)}
                >
                  <Icon size={16} aria-hidden="true" className={styles.navIcon} />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </div>

          <div className={styles.actionsGroup}>
            <Button
              as="a"
              href="/verificar"
              variant="secondary"
              size="sm"
              className={styles.consultarBtn}
              leftIcon={<Leaf size={16} aria-hidden="true" />}
              onClick={handleConsultarClick}
            >
              <span className={styles.btnFullText}>Consultar Boletos</span>
              <span className={styles.btnShortText}>Consultar</span>
            </Button>
            <Button
              as="a"
              href="/#boletos"
              variant="primary"
              size="sm"
              className={styles.comprarBtn}
              leftIcon={<Ticket size={17} aria-hidden="true" />}
              onClick={(e) => handleSectionClick(e, 'boletos')}
            >
              <span className={styles.btnFullText}>Comprar Boletos</span>
              <span className={styles.btnShortText}>Comprar</span>
            </Button>
          </div>
        </nav>

        {/* Botón menú móvil */}
        <button
          ref={menuToggleRef}
          type="button"
          className={`${styles.menuToggle} ${mobileMenuOpen ? styles.menuToggleActive : ''}`}
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu-drawer"
          aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {mobileMenuOpen ? (
            <X size={24} aria-hidden="true" />
          ) : (
            <Menu size={24} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Backdrop oscuro translúcido para cerrar el menú y evitar toques accidentales en el fondo */}
      <div
        className={`${styles.mobileBackdrop} ${mobileMenuOpen ? styles.mobileBackdropOpen : ''}`}
        onClick={closeMenu}
        aria-hidden="true"
      />

      {/* Menú Móvil Desplegable con animación y foco atrapado */}
      <nav
        id="mobile-menu-drawer"
        ref={mobileMenuRef}
        className={`${styles.mobileMenu} ${mobileMenuOpen ? styles.mobileMenuOpen : ''}`}
        aria-label="Menú de navegación móvil"
        aria-hidden={!mobileMenuOpen}
        inert={!mobileMenuOpen ? true : undefined}
      >
        <div className={styles.mobileLinksList}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = effectiveActiveSection === item.id;
            return (
              <a
                key={item.id}
                href={`/#${item.id}`}
                className={`${styles.mobileNavLink} ${isActive ? styles.mobileNavLinkActive : ''}`}
                aria-current={isActive ? 'location' : undefined}
                onClick={(e) => handleSectionClick(e, item.id)}
              >
                <Icon size={18} aria-hidden="true" className={styles.mobileNavIcon} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </div>

        <hr className={styles.mobileDivider} />

        <div className={styles.mobileActions}>
          <Button
            as="a"
            href="/verificar"
            variant="secondary"
            size="md"
            className={styles.mobileConsultarBtn}
            leftIcon={<Leaf size={18} aria-hidden="true" />}
            onClick={handleConsultarClick}
          >
            Consultar Boletos
          </Button>
          <Button
            as="a"
            href="/#boletos"
            variant="primary"
            size="lg"
            className={styles.mobileComprarBtn}
            leftIcon={<Ticket size={20} aria-hidden="true" />}
            onClick={(e) => handleSectionClick(e, 'boletos')}
          >
            Comprar Boletos
          </Button>
        </div>
      </nav>
    </header>
  );
};
