import React from 'react';
import { Outlet } from 'react-router-dom';
import '@/styles/theme-admin.css';

/**
 * Raíz de enrutamiento administrativo que centraliza la carga de theme-admin.css
 * en un único punto de entrada para todo el subárbol /admin/* (incluyendo login y panel protegido).
 */
export const AdminRouteRoot: React.FC = () => {
  return <Outlet />;
};

export default AdminRouteRoot;

