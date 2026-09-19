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
        <nav className={styles.desktopNav}>
          <a
            href="/#premio"
            className={styles.navLink}
            onClick={(e) => handleSectionClick(e, 'premio')}
          >
            <Compass size={16} /> El Premio
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
            <HelpCircle size={16} /> Preguntas
          </a>
          <Link to="/verificar" className={styles.verifyLink} onClick={closeMenu}>
            <ShieldCheck size={16} /> Consultar Boletos
          </Link>
          <a
            href="/#boletos"
            className={styles.ctaButton}
            onClick={(e) => handleSectionClick(e, 'boletos')}
          >
            <Ticket size={18} /> Comprar Boletos
          </a>
        </nav>

        {/* Botón menú móvil */}
        <button
          type="button"
          className={styles.menuToggle}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú de navegación'}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Menú Móvil Desplegable con animación */}
      <div className={`${styles.mobileMenu} ${mobileMenuOpen ? styles.mobileMenuOpen : ''}`}>
          <a
            href="/#premio"
            className={styles.mobileNavLink}
            onClick={(e) => handleSectionClick(e, 'premio')}
          >
            <Compass size={18} /> El Premio
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
            <HelpCircle size={18} /> Preguntas Frecuentes
          </a>
          <Link to="/verificar" className={styles.mobileVerifyLink} onClick={closeMenu}>
            <ShieldCheck size={18} /> Consultar mis Boletos
          </Link>
          <a
            href="/#boletos"
            className={styles.mobileCtaButton}
            onClick={(e) => handleSectionClick(e, 'boletos')}
          >
            <Ticket size={20} /> Elegir Boletos
          </a>
        </div>
    </header>
  );
};
