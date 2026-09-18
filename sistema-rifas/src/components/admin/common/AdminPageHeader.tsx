import React, { type ReactNode } from 'react';
import styles from './AdminPageHeader.module.css';

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  actions?: ReactNode;
}

export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  title,
  description,
  badge,
  actions,
}) => {
  return (
    <div className={styles.headerContainer}>
      <div className={styles.titleArea}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {badge && <span className={styles.badge}>{badge}</span>}
        </div>
        {description && <p className={styles.description}>{description}</p>}
      </div>

      {actions && <div className={styles.actionsArea}>{actions}</div>}
    </div>
  );
};
