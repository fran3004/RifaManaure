import React from 'react';
import {
  Clock,
  Search,
  Sparkles,
  Trophy,
  ShieldCheck,
  Calendar,
  Compass,
  FileCheck2,
} from 'lucide-react';
import { Button } from '@/components/public/ui';
import type { RaffleRow } from '@/types/raffle.types';
import styles from './RaffleClosedWaitingWinner.module.css';

interface RaffleClosedWaitingWinnerProps {
  raffle: RaffleRow | null;
  lotteryReference: string;
  drawDateFormatted: string;
  cifrasText: string;
}

export const RaffleClosedWaitingWinner: React.FC<RaffleClosedWaitingWinnerProps> = ({
  raffle,
  lotteryReference,
  drawDateFormatted,
  cifrasText,
}) => {
  return (
    <section id="boletos" className={styles.section} aria-labelledby="titulo-sorteo-cerrado">
      <div className={styles.container}>
        {/* Badge Superior */}
        <div className={styles.headerBadge} role="status">
          <Clock size={16} aria-hidden="true" />
          <span>Sorteo Oficial · Venta Concluida</span>
        </div>

        {/* Tarjeta Principal de Presentación */}
        <div className={styles.mainCard}>
          {/* Icono de Trofeo en Espera Activa con Resplandor */}
          <div className={styles.iconWrapper} aria-hidden="true">
            <Trophy size={36} />
          </div>

          {/* Encabezado y Título */}
          <div className={styles.titleGroup}>
            <h2 id="titulo-sorteo-cerrado" className={styles.mainTitle}>
              ¡Venta Cerrada! Esperando al{' '}
              <span className={styles.goldenHighlight}>Ganador Oficial</span>
            </h2>
            <p className={styles.subtitle}>
              La emisión de boletos para{' '}
              <strong>{raffle?.title || 'la edición actual'}</strong> ha finalizado exitosamente al
              haberse cumplido la fecha límite oficial de venta.
            </p>
          </div>

          {/* Bloque Informativo al Comprador (Tranquilizador y Amable) */}
          <div className={styles.messageCard}>
            <div className={styles.messageItem}>
              <Sparkles size={18} className={styles.messageItemIcon} aria-hidden="true" />
              <div>
                <strong>¡Muchísimas gracias a todos por su participación!</strong> La venta de
                boletos para esta edición ha cerrado definitivamente y los números ya se encuentran
                en juego.
              </div>
            </div>

            <div className={styles.messageItem}>
              <Clock size={18} className={styles.messageItemIcon} aria-hidden="true" />
              <div>
                El sorteo oficial juega en convenio con <strong>{lotteryReference}</strong> ({cifrasText}). En este momento, el comité de Manaure Vive y las autoridades se encuentran a la
                espera del resultado emitido por la lotería para validar al ganador del premio
                mayor.
              </div>
            </div>

            <div className={styles.messageItem}>
              <FileCheck2 size={18} className={styles.messageItemIcon} aria-hidden="true" />
              <div>
                <strong>¿Compraste boletos para esta edición?</strong> Por favor mantente muy
                atento. Tan pronto se certifique el boleto ganador, esta página se actualizará
                automáticamente con la proclamación oficial, el acta notariada y el registro
                fotográfico de la entrega.
              </div>
            </div>
          </div>

          {/* Grid de Trazabilidad del Sorteo */}
          <div className={styles.detailsGrid}>
            <div className={styles.detailItem}>
              <Calendar size={18} className={styles.detailIcon} aria-hidden="true" />
              <div className={styles.detailContent}>
                <span className={styles.detailLabel}>Fecha del Sorteo</span>
                <strong className={styles.detailValue} title={drawDateFormatted}>
                  {drawDateFormatted}
                </strong>
              </div>
            </div>

            <div className={styles.detailItem}>
              <Trophy size={18} className={styles.detailIcon} aria-hidden="true" />
              <div className={styles.detailContent}>
                <span className={styles.detailLabel}>Lotería Oficial</span>
                <strong className={styles.detailValue} title={lotteryReference}>
                  {lotteryReference}
                </strong>
              </div>
            </div>

            <div className={styles.detailItem}>
              <ShieldCheck size={18} className={styles.detailIcon} aria-hidden="true" />
              <div className={styles.detailContent}>
                <span className={styles.detailLabel}>Modalidad</span>
                <strong className={styles.detailValue} title={cifrasText}>
                  {cifrasText}
                </strong>
              </div>
            </div>
          </div>

          {/* Fila de Botones de Acción */}
          <div className={styles.actionsRow}>
            <Button
              as="a"
              href="/verificar"
              variant="primary"
              size="lg"
              leftIcon={<Search size={18} aria-hidden="true" />}
              className={styles.btnVerify}
            >
              Consultar mis Boletos
            </Button>

            <Button
              as="a"
              href="#premio"
              variant="secondary"
              size="lg"
              leftIcon={<Compass size={18} aria-hidden="true" />}
              className={styles.btnPrize}
            >
              Conocer el Premio
            </Button>
          </div>

          {/* Nota de Transparencia Legal */}
          <div className={styles.transparencyNote}>
            <ShieldCheck size={15} aria-hidden="true" />
            <span>
              Sorteo certificado bajo la normativa colombiana. Trazabilidad garantizada para todos
              los compradores.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
