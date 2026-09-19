import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { logoPrincipal } from '@/assets/assets';
import { Ticket, Menu, X, Compass, HelpCircle, ShieldCheck } from 'lucide-react';
import styles from './Navbar.module.css';

export const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const closeMenu = () => setMobileMenuOpen(false);

  const handleSectionClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault();
    closeMenu();
    if (location.pathname === '/') {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      window.history.pushState(null, '', `/#${sectionId}`);
    } else {
      navigate(`/#${sectionId}`);
    }
  };

  return (
    <header className={`${styles.navbar} ${isScrolled ? styles.scrolled : ''}`}>
      <div className={`container ${styles.navContainer}`}>
        <Link to="/" className={styles.brandLink} onClick={closeMenu}>
          <img
            src={logoPrincipal.web}
            alt="Logo oficial de Manaure Vive"
            width={160}
            height={100}
            className={styles.brandLogo}
          />
        </Link>

        {/* Enlaces de escritorio */}
        <nav className={styles.desktopNav} aria-label="Principal">
          <a
            href="/#premio"
            className={styles.navLink}
            onClick={(e) => handleSectionClick(e, 'premio')}
          >
            <Compass size={16} aria-hidden="true" /> El Premio
          </a>
          <a
            href="/#galeria"
            className={styles.navLink}
            onClick={(e) => handleSectionClick(e, 'galeria')}
          >
            Galería
          </a>
          <a
            href="/#aliados"
            className={styles.navLink}
            onClick={(e) => handleSectionClick(e, 'aliados')}
          >
            Aliados
          </a>
          <a href="/#faq" className={styles.navLink} onClick={(e) => handleSectionClick(e, 'faq')}>
            <HelpCircle size={16} aria-hidden="true" /> Preguntas
          </a>
          <Link to="/verificar" className={styles.verifyLink} onClick={closeMenu}>
            <ShieldCheck size={16} aria-hidden="true" /> Consultar Boletos
          </Link>
          <a
            href="/#boletos"
            className={styles.ctaButton}
            onClick={(e) => handleSectionClick(e, 'boletos')}
          >
            <Ticket size={18} aria-hidden="true" /> Comprar Boletos
          </a>
        </nav>

        {/* Botón menú móvil */}
        <button
          type="button"
          className={styles.menuToggle}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu-drawer"
          aria-label={mobileMenuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
        >
          {mobileMenuOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
        </button>
      </div>

      {/* Menú Móvil Desplegable con animación */}
      <nav
        id="mobile-menu-drawer"
        className={`${styles.mobileMenu} ${mobileMenuOpen ? styles.mobileMenuOpen : ''}`}
        aria-label="Navegación móvil"
      >
        <a
          href="/#premio"
          className={styles.mobileNavLink}
          onClick={(e) => handleSectionClick(e, 'premio')}
        >
          <Compass size={18} aria-hidden="true" /> El Premio
        </a>
        <a
          href="/#galeria"
          className={styles.mobileNavLink}
          onClick={(e) => handleSectionClick(e, 'galeria')}
        >
          Galería de Fotos
        </a>
        <a
          href="/#aliados"
          className={styles.mobileNavLink}
          onClick={(e) => handleSectionClick(e, 'aliados')}
        >
          Aliados Estratégicos
        </a>
        <a
          href="/#faq"
          className={styles.mobileNavLink}
          onClick={(e) => handleSectionClick(e, 'faq')}
        >
          <HelpCircle size={18} aria-hidden="true" /> Preguntas Frecuentes
        </a>
        <Link to="/verificar" className={styles.mobileVerifyLink} onClick={closeMenu}>
          <ShieldCheck size={18} aria-hidden="true" /> Consultar mis Boletos
        </Link>
        <a
          href="/#boletos"
          className={styles.mobileCtaButton}
          onClick={(e) => handleSectionClick(e, 'boletos')}
        >
          <Ticket size={20} aria-hidden="true" /> Elegir Boletos
        </a>
      </nav>
    </header>
  );
};
