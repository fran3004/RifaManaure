import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AdminRaffleProvider } from '@/context/AdminRaffleContext';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import styles from './AdminLayout.module.css';

export const AdminLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <AdminRaffleProvider>
      <div className={styles.adminShell} data-theme="admin">
        {/* Backdrop overlay para dispositivos móviles y tablets */}
        <div
          className={`${styles.backdrop} ${isSidebarOpen ? styles.backdropVisible : ''}`}
          onClick={closeSidebar}
          aria-hidden="true"
        />

        {/* Sidebar de Navegación Lateral */}
        <AdminSidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

        {/* Área de contenido principal con Header superior */}
        <div className={styles.contentWrapper}>
          <AdminHeader onToggleSidebar={toggleSidebar} />

          <main className={styles.mainContent}>
            <Outlet />
          </main>
        </div>
      </div>
    </AdminRaffleProvider>
  );
};
