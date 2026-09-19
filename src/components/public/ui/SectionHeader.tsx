import React from 'react';
import { Pill } from './Pill';
import styles from './SectionHeader.module.css';

export interface SectionHeaderProps {
  badge?: string;
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'center' | 'left';
  id?: string;
  tone?: 'light' | 'dark';
  className?: string;
  children?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  badge,
  icon,
  title,
  subtitle,
  align = 'center',
  id,
  tone = 'light',
  className,
  children,
}) => {
  return (
    <div className={`${styles.header} ${styles[align]} ${styles[`tone-${tone}`]} ${className || ''}`}>
      {badge && (
        <div className={styles.badgeWrapper}>
          <Pill variant={tone === 'dark' ? 'dark' : 'soft'} icon={icon}>
            {badge}
          </Pill>
        </div>
      )}
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      {children}
    </div>
  );
};

