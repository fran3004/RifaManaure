import React, { useEffect, useRef, useCallback } from 'react';
import {
  Trophy,
  Sparkles,
  Award,
  Calendar,
  User,
  MapPin,
  FileText,
  ExternalLink,
  CheckCircle,
  Compass,
} from 'lucide-react';
import type { WinnerWithDetails } from '@/types/raffle.types';
import { maskBuyerName, maskDocumentId } from '@/services/winnerService';
import styles from './GanadorShowcase.module.css';

interface GanadorShowcaseProps {
  winner: WinnerWithDetails;
}

interface Particle {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  vx: number;
  vy: number;
  angle: number;
  angularSpeed: number;
  opacity: number;
}

const CONFETTI_COLORS = [
  '#fbbf24', // Gold light
  '#f59e0b', // Gold amber
  '#10b981', // Emerald
  '#34d399', // Emerald bright
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#ffffff', // White sparkle
];

export const GanadorShowcase: React.FC<GanadorShowcaseProps> = ({ winner }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  // Lanzar explosión de confeti
  const burstConfetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width;
    const height = canvas.height;
    const newParticles: Particle[] = [];

    // Generar 160 partículas con impulsos parabólicos desde el centro y los lados
    for (let i = 0; i < 160; i++) {
      const fromLeft = i % 2 === 0;
      const startX = fromLeft ? width * 0.15 : width * 0.85;
      const startY = height * 0.25;

      const angle = fromLeft
        ? Math.random() * 0.4 - 0.2 + Math.PI / 4 // hacia la derecha
        : Math.random() * 0.4 - 0.2 + (3 * Math.PI) / 4; // hacia la izquierda

      const speed = Math.random() * 9 + 5;

      newParticles.push({
        x: startX,
        y: startY,
        w: Math.random() * 8 + 6,
        h: Math.random() * 12 + 8,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        vx: Math.cos(angle) * speed,
        vy: -Math.abs(Math.sin(angle) * speed) - Math.random() * 4,
        angle: Math.random() * 360,
        angularSpeed: (Math.random() - 0.5) * 12,
        opacity: 1,
      });
    }

    particlesRef.current = [...particlesRef.current, ...newParticles];
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      if (!canvas) return;
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || 650;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Lanzar primer estallido de confeti
    burstConfetti();
    const secondBurstTimer = setTimeout(() => {
      burstConfetti();
    }, 1200);

    let isRunning = true;

    const renderLoop = () => {
      if (!isRunning || !ctx || !canvas) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.22; // Gravedad suave
        p.vx *= 0.985; // Fricción del aire
        p.angle += p.angularSpeed;

        // Desvanecimiento cuando llega al tercio inferior
        if (p.y > canvas.height * 0.75) {
          p.opacity -= 0.02;
        }

        if (p.opacity <= 0 || p.y > canvas.height + 20) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.angle * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      isRunning = false;
      clearTimeout(secondBurstTimer);
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [burstConfetti]);

  const formatDate = (dateStr: string) => {
    try {
      return new Intl.DateTimeFormat('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  return (
    <section id="boletos" className={styles.celebrationSection} aria-label="Ganador Oficial">
      <canvas ref={canvasRef} className={styles.confettiCanvas} />

      <div className={styles.container}>
        {/* Badge Superior Brillante */}
        <div className={styles.headerBadge}>
          <Sparkles size={16} />
          <span>Sorteo Oficial Concluido con Éxito</span>
          <Sparkles size={16} />
        </div>

        {/* Título Principal */}
        <div className={styles.titleGroup}>
          <h2 className={styles.mainTitle}>
            ¡Tenemos un <span className={styles.goldenHighlight}>Ganador Oficial</span>!
          </h2>
          <p className={styles.subtitle}>
            La Gran Rifa Ecoturística Manaure Vive ha premiado a su afortunado participante con la
            experiencia todo incluido en la Serranía del Perijá.
          </p>
        </div>

        {/* Tarjeta Hero del Ganador */}
        <div className={styles.winnerHeroCard}>
          {/* Trofeo y Número Ganador */}
          <div className={styles.trophyDisplay}>
            <div className={styles.trophyIconContainer}>
              <Trophy size={46} />
            </div>

            <div className={styles.ticketPresentation}>
              <span className={styles.ticketPresentationLabel}>Número del Boleto Premiado</span>
              <div className={styles.hugeTicketNumber}>#{winner.ticket_number}</div>
              <div className={styles.lotteryMetaPill}>
                <Award size={16} color="#fbbf24" />
                <span>
                  Sorteo con la{' '}
                  <strong>{winner.raffle?.lottery_reference || 'Lotería Oficial'}</strong> • Premio
                  Mayor: <strong>{winner.lottery_draw_number}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Datos del Ganador (Protegidos por Privacidad) */}
          <div className={styles.winnerInfoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>
                <User size={14} color="#10b981" /> Ganador Acreditado
              </span>
              <span className={styles.infoValue}>{maskBuyerName(winner.buyer?.full_name)}</span>
              <span className={styles.infoSub}>
                <CheckCircle size={13} /> {maskDocumentId(winner.buyer?.document_id)}
              </span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>
                <MapPin size={14} color="#f59e0b" /> Procedencia
              </span>
              <span className={styles.infoValue}>
                {winner.buyer?.city || 'Manaure (Balcón del Cesar)'}
              </span>
              <span className={styles.infoSub} style={{ color: '#94a3b8' }}>
                Municipio del Comprador
              </span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>
                <Calendar size={14} color="#3b82f6" /> Fecha del Sorteo
              </span>
              <span className={styles.infoValue}>{formatDate(winner.draw_date)}</span>
              <span className={styles.infoSub} style={{ color: '#93c5fd' }}>
                Adjudicado Oficialmente
              </span>
            </div>
          </div>

          {/* Evidencias Oficiales (Acta en PDF y Fotos) */}
          <div className={styles.evidencesWrapper}>
            {winner.official_act_url && (
              <a
                href={winner.official_act_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.actButton}
              >
                <FileText size={20} />
                <span>Consultar Acta Oficial de Adjudicación (PDF)</span>
                <ExternalLink size={16} />
              </a>
            )}

            {winner.delivery_photos && winner.delivery_photos.length > 0 && (
              <div className={styles.photoGalleryRow}>
                <span className={styles.photoGalleryLabel}>Registro Fotográfico de Entrega:</span>
                <div className={styles.photoThumbnails}>
                  {winner.delivery_photos.map((photoUrl, pIdx) => (
                    <a
                      key={pIdx}
                      href={photoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.photoThumb}
                      title={`Ver foto de entrega #${pIdx + 1}`}
                    >
                      <img src={photoUrl} alt={`Foto entrega ${pIdx + 1}`} />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Botón para festejar y relanzar confeti */}
          <div>
            <button type="button" onClick={burstConfetti} className={styles.btnConfetti}>
              <span>🎉 ¡Celebrar de Nuevo!</span>
            </button>
          </div>
        </div>

        {/* Aviso de Próxima Edición */}
        <div className={styles.nextEditionNotice}>
          <Compass size={32} className={styles.noticeIcon} />
          <div>
            <h4 className={styles.noticeTitle}>
              ¡Pronto una Nueva Aventura Ecoturística en Manaure!
            </h4>
            <p className={styles.noticeDesc}>
              Esta edición del sorteo ha concluido exitosamente. Nuestro equipo está preparando la
              siguiente edición con más experiencias únicas en el Balcón del Cesar. Tan pronto se
              abra la convocatoria, la selección de boletos estará disponible nuevamente aquí.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
