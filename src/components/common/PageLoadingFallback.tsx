import React from 'react';

interface PageLoadingFallbackProps {
  message?: string;
}

export const PageLoadingFallback: React.FC<PageLoadingFallbackProps> = ({
  message = 'Cargando contenido oficial...',
}) => {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.25rem',
        padding: '2rem',
        backgroundColor: 'transparent',
      }}
    >
      <div
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          border: '3px solid rgba(245, 158, 11, 0.2)',
          borderTopColor: '#f59e0b',
          borderRightColor: '#10b981',
          animation: 'mvSpin 0.8s linear infinite',
        }}
      />
      <span
        style={{
          fontSize: '0.9rem',
          fontWeight: 600,
          color: '#9cb5ab',
          letterSpacing: '0.02em',
        }}
      >
        {message}
      </span>
      <style>{`
        @keyframes mvSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
