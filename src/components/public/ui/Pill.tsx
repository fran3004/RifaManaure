import React from 'react';
import styles from './Pill.module.css';

export type PillVariant = 'dark' | 'accent' | 'soft';

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: PillVariant;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const Pill: React.FC<PillProps> = ({
  variant = 'soft',
  icon,
  children,
  className,
  ...props
}) => {
  return (
    <span
      className={`${styles.pill} ${styles[variant]} ${className || ''}`}
      {...props}
    >
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
};

