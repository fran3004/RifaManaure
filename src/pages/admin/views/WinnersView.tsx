import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminEmptyState } from '@/components/admin/common/AdminEmptyState';
import { AdminLoadingState } from '@/components/admin/common/AdminLoadingState';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import { AdminRegisterWinnerModal } from '@/components/admin/winners/AdminRegisterWinnerModal';
import {
  Trophy,
  Award,
  Search,
  FileText,
  ExternalLink,
  Calendar,
  User,
  Phone,
  MapPin,
  FileSpreadsheet,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import { getWinners } from '@/services/winnerService';
import { fetchAdminRaffles } from '@/services/raffleService';
import type { WinnerWithDetails, RaffleRow } from '@/types/raffle.types';
import { useAdminRaffle } from '@/context/AdminRaffleContext';
import { formatCOP } from '@/lib/utils';
import styles from './WinnersView.module.css';

export const WinnersView: React.FC = () => {
  const { selectedRaffleId, selectedRaffle } = useAdminRaffle();
  const [winners, setWinners] = useState<WinnerWithDetails[]>([]);
  const [raffles, setRaffles] = useState<RaffleRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [winnersList, rafflesRes] = await Promise.all([
        getWinners(selectedRaffleId),
        fetchAdminRaffles(),
      ]);
      setWinners(winnersList);
      setRaffles(rafflesRes.raffles || []);
    } catch (err: unknown) {
      console.error('Error al cargar datos de ganadores:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar los datos de ganadores');
    } finally {
      setIsLoading(false);
    }
  }, [selectedRaffleId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleWinnerRegistered = () => {
    setSuccessToast('¡Ganador oficial y actas registradas con éxito!');
    loadData();
    setTimeout(() => setSuccessToast(null), 5000);
  };

  const filteredWinners = useMemo(() => {
    if (!searchTerm.trim()) return winners;
    const term = searchTerm.toLowerCase().trim();

    return winners.filter((w) => {
      const ticketMatch = w.ticket_number.includes(term);
      const lotteryMatch = w.lottery_draw_number.includes(term);
      const buyerNameMatch = w.buyer?.full_name?.toLowerCase().includes(term);
      const buyerDocMatch = w.buyer?.document_id?.toLowerCase().includes(term);
      const buyerPhoneMatch = w.buyer?.phone?.toLowerCase().includes(term);
      const orderRefMatch = w.order?.reference?.toLowerCase().includes(term);
      const raffleMatch = w.raffle?.title?.toLowerCase().includes(term);

      return (
        ticketMatch ||
        lotteryMatch ||
        buyerNameMatch ||
        buyerDocMatch ||
        buyerPhoneMatch ||
        orderRefMatch ||
        raffleMatch
      );
    });
  }, [winners, searchTerm]);

  const formatDate = (dateStr: string) => {
    try {
      return new Intl.DateTimeFormat('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={styles.viewContainer}>
      <AdminPageHeader
        title="Registro Oficial de Ganadores"
        description={
          selectedRaffle
            ? `Publicación de actas y entrega de premios para: ${selectedRaffle.title}`
            : 'Publicación de actas oficiales, verificación de boletos premiados y entrega de premios.'
        }
        actions={
          <div className={styles.headerActions}>
            <button
              type="button"
              onClick={loadData}
              className={styles.btnSecondary}
              title="Recargar lista"
            >
              <RefreshCw size={16} />
              <span>Actualizar</span>
            </button>
            <button
              type="button"
              onClick={() => setIsRegisterModalOpen(true)}
              className={styles.btnPrimary}
            >
              <Award size={18} />
              <span>Registrar Ganador</span>
            </button>
          </div>
        }
      />

      {/* Alerta de Éxito */}
      {successToast && (
        <div className={styles.toastAlertSuccess}>
          <CheckCircle size={18} />
          <span>{successToast}</span>
        </div>
      )}

      {/* Sección Principal */}
      <div className={styles.cardSection}>
        <div className={styles.controlsRow}>
          <div className={styles.searchBox}>
            <Search size={18} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Buscar por boleto, lotería, cédula, nombre u orden..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          <span className={styles.winnersCounter}>
            Total Ganadores Registrados: <strong>{winners.length}</strong>
          </span>
        </div>

        {isLoading ? (
          <AdminLoadingState message="Cargando historial de sorteos y ganadores..." />
        ) : error ? (
          <AdminErrorState
            title="Error al cargar ganadores"
            message={error}
            onRetry={() => void loadData()}
          />
        ) : filteredWinners.length === 0 ? (
          <AdminEmptyState
            icon={<Trophy size={42} color="#fbbf24" />}
            title={
              searchTerm
                ? 'No se encontraron ganadores para la búsqueda'
                : 'No hay ganadores registrados aún'
            }
            description={
              searchTerm
                ? 'Intenta con otro número de boleto, documento o referencia de orden.'
                : 'Cuando se realice el sorteo oficial con la Lotería de Santander, usa el botón "Registrar Ganador" para asociar el boleto vendido y subir las evidencias.'
            }
          />
        ) : (
          <div className={styles.winnersList}>
            {filteredWinners.map((winner) => (
              <article key={winner.id} className={styles.winnerCard}>
                {/* Encabezado del Ganador */}
                <div className={styles.winnerCardHeader}>
                  <div className={styles.winnerHeaderLeft}>
                    <div className={styles.trophyCircle}>
                      <Trophy size={26} />
                    </div>
                    <div>
                      <h3 className={styles.winnerRaffleTitle}>
                        {winner.raffle?.title || 'Gran Rifa Manaure Vive'}
                      </h3>
                      <div className={styles.winnerLotteryMeta}>
                        <span>
                          Sorteo:{' '}
                          <strong>{winner.raffle?.lottery_reference || 'Lotería Oficial'}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Premio Mayor:{' '}
                          <strong className={styles.lotteryDrawNumber}>{winner.lottery_draw_number}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.winnerTicketPill}>
                    <span className={styles.ticketLabel}>Boleto Ganador</span>
                    <span className={styles.ticketNumberBig}>#{winner.ticket_number}</span>
                  </div>
                </div>

                {/* Cuadrícula de Datos */}
                <div className={styles.winnerDataGrid}>
                  {/* Comprador Ganador */}
                  <div className={styles.dataGroup}>
                    <span className={styles.dataGroupLabel}>
                      <User size={14} color="var(--color-success)" /> Ganador Oficial
                    </span>
                    <span className={styles.dataGroupValue}>
                      {winner.buyer?.full_name || 'Comprador Registrado'}
                    </span>
                    <span className={styles.dataGroupSubvalue}>
                      C.C. {winner.buyer?.document_id || 'N/D'}
                    </span>
                  </div>

                  {/* Contacto */}
                  <div className={styles.dataGroup}>
                    <span className={styles.dataGroupLabel}>
                      <Phone size={14} color="#3b82f6" /> Contacto
                    </span>
                    <span className={styles.dataGroupValue}>{winner.buyer?.phone || 'N/D'}</span>
                    <span className={styles.dataGroupSubvalue}>{winner.buyer?.email || ''}</span>
                  </div>

                  {/* Ciudad */}
                  <div className={styles.dataGroup}>
                    <span className={styles.dataGroupLabel}>
                      <MapPin size={14} color="var(--brand-accent)" /> Ubicación
                    </span>
                    <span className={styles.dataGroupValue}>
                      {winner.buyer?.city || 'No especificada'}
                    </span>
                  </div>

                  {/* Orden de Compra */}
                  <div className={styles.dataGroup}>
                    <span className={styles.dataGroupLabel}>
                      <FileSpreadsheet size={14} color="#8b5cf6" /> Orden de Compra
                    </span>
                    <span className={styles.dataGroupValue}>
                      {winner.order?.reference || 'N/D'}
                    </span>
                    <span className={styles.dataGroupSubvalue}>
                      Total:{' '}
                      {winner.order?.total_amount ? formatCOP(winner.order.total_amount) : 'N/D'}
                    </span>
                  </div>

                  {/* Fecha de Adjudicación */}
                  <div className={styles.dataGroup}>
                    <span className={styles.dataGroupLabel}>
                      <Calendar size={14} color="#ec4899" /> Fecha de Sorteo
                    </span>
                    <span className={styles.dataGroupValue}>{formatDate(winner.draw_date)}</span>
                  </div>
                </div>

                {/* Evidencias y Acta Oficial */}
                <div className={styles.winnerEvidencesSection}>
                  <div className={styles.evidenceRow}>
                    {winner.official_act_url ? (
                      <a
                        href={winner.official_act_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.actLink}
                      >
                        <FileText size={16} />
                        <span>Ver Acta Oficial en PDF</span>
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <span className={styles.noActText}>
                        Sin acta PDF adjunta
                      </span>
                    )}

                  </div>

                  {winner.notes && (
                    <div className={styles.notesBlock}>
                      <strong>Observaciones:</strong> {winner.notes}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Modal para Registrar Ganador */}
      <AdminRegisterWinnerModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onWinnerRegistered={handleWinnerRegistered}
        raffles={raffles}
        initialRaffleId={selectedRaffleId || undefined}
      />
    </div>
  );
};
