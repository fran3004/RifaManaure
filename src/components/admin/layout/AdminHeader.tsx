import React from 'react';
import { useAuth } from '@/context/useAuth';
import { useAdminRaffle } from '@/context/AdminRaffleContext';
import { AdminBreadcrumbs } from './AdminBreadcrumbs';
import { Menu, ExternalLink, LogOut, Shield, Sparkles } from 'lucide-react';
import styles from './AdminHeader.module.css';

interface AdminHeaderProps {
  onToggleSidebar: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ onToggleSidebar }) => {
  const { user, adminProfile, signOut } = useAuth();
  const { selectedRaffleId, selectedRaffle, raffles, isLoadingRaffles, setSelectedRaffleId } =
    useAdminRaffle();

  return (
    <header className={styles.header}>
      <div className={styles.leftSection}>
        <button
          type="button"
          className={styles.menuToggleBtn}
          onClick={onToggleSidebar}
          aria-label="Abrir menú de navegación"
        >
          <Menu size={20} />
        </button>

        <AdminBreadcrumbs />
      </div>

      <div className={styles.rightSection}>
        {/* Selector Global de Rifa Activa */}
        <div className={styles.raffleSelectorContainer}>
          <div className={styles.raffleSelectorLabel}>
            <Sparkles size={14} className={styles.raffleIcon} />
            <span>Rifa:</span>
          </div>
          {isLoadingRaffles ? (
            <span className={styles.raffleLoadingBadge}>Cargando...</span>
          ) : raffles.length === 0 ? (
            <span className={styles.raffleEmptyBadge}>Sin rifas creadas</span>
          ) : (
            <div className={styles.selectWrapper}>
              <select
                className={styles.raffleSelect}
                value={selectedRaffleId || ''}
                onChange={(e) => setSelectedRaffleId(e.target.value)}
                aria-label="Seleccionar rifa en gestión"
                title={
                  selectedRaffle
                    ? `${selectedRaffle.title} (${
                        selectedRaffle.status === 'active'
                          ? 'Activa'
                          : selectedRaffle.status === 'paused'
                            ? 'Pausada'
                            : selectedRaffle.status === 'finished'
                              ? 'Concluida'
                              : selectedRaffle.status === 'closed'
                                ? 'Cerrada'
                                : 'Borrador'
                      })`
                    : 'Seleccionar rifa en gestión'
                }
              >
                {raffles.map((r) => {
                  let statusTag = 'Activa';
                  if (r.status === 'paused') statusTag = 'Pausada';
                  else if (r.status === 'finished') statusTag = 'Concluida';
                  else if (r.status === 'closed') statusTag = 'Cerrada';
                  else if (r.status === 'draft') statusTag = 'Borrador';

                  return (
                    <option key={r.id} value={r.id}>
                      {r.title} ({statusTag})
                    </option>
                  );
                })}
              </select>
              {selectedRaffle && (
                <span
                  className={`${styles.statusDot} ${
                    selectedRaffle.status === 'active'
                      ? styles.statusDotActive
                      : selectedRaffle.status === 'paused'
                        ? styles.statusDotPaused
                        : selectedRaffle.status === 'finished'
                          ? styles.statusDotFinished
                          : styles.statusDotDefault
                  }`}
                  title={`Estado: ${selectedRaffle.status}`}
                />
              )}
            </div>
          )}
        </div>

        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.storeLink}
          title="Abrir tienda pública en nueva pestaña"
        >
          <ExternalLink size={15} />
          <span className={styles.storeText}>Ver Tienda</span>
        </a>

        <div className={styles.userBadge}>
          <Shield size={14} color="var(--admin-accent, var(--brand-accent))" />
          <span className={styles.userEmail}>{user?.email}</span>
          <span className={styles.roleTag}>{adminProfile?.role || 'admin'}</span>
        </div>

        <button
          type="button"
          className={styles.headerLogoutBtn}
          onClick={() => void signOut()}
          title="Cerrar sesión"
        >
          <LogOut size={16} />
          <span className={styles.logoutText}>Salir</span>
        </button>
      </div>
    </header>
  );
};
