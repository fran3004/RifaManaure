import React, { useState, useEffect, useCallback } from 'react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminEmptyState } from '@/components/admin/common/AdminEmptyState';
import { AdminLoadingState } from '@/components/admin/common/AdminLoadingState';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import { fetchAuditLogsPaginated, type AuditLogItem } from '@/services/paymentService';
import { useAdminRaffle } from '@/context/AdminRaffleContext';
import { formatCOP, formatTicketNumber } from '@/lib/utils';
import { normalizeAppError, logAppError } from '@/lib/errorHandling';
import {
  History,
  Search,
  ShieldCheck,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ShoppingCart,
  FileText,
  Unlock,
  Lock,
  Activity,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  Table as TableIcon,
  Shield,
  User,
  Cpu,
  Sparkles,
  Trophy,
  ExternalLink,
  Trash2,
  UserPlus,
  Settings,
} from 'lucide-react';
import commonStyles from './AdminViews.module.css';
import styles from './AuditView.module.css';

interface ActionConfig {
  title: string;
  pillClass: string;
  nodeClass: string;
  icon: React.ReactNode;
  actor: string;
}

/**
 * Traduce y estandariza cualquier identificador de actividad a un título amigable en español
 * libre de tecnicismos, siglas en inglés o mayúsculas sostenidas de código.
 */
function formatActionTitle(action: string): string {
  const upper = (action || '').toUpperCase().trim();
  if (upper.includes('PURGE') || upper.includes('CLEANUP') || upper.includes('STORAGE')) {
    return 'Vaciado de Comprobantes';
  }
  if (upper.includes('INVITED') || upper.includes('INVITE')) {
    return 'Invitación de Administrador';
  }
  if (upper.includes('SETTINGS')) {
    return 'Ajustes del Sistema';
  }
  if (upper.includes('AUTO_CLOSE')) {
    return 'Cierre Automático de Rifa';
  }
  if (upper.includes('AUTO_EXPIRE') || upper.includes('EXPIR')) {
    return 'Reserva Expirada';
  }
  if (upper.includes('PAID') || upper.includes('APPROVED')) {
    return 'Pago Aprobado';
  }
  if (upper.includes('PROOF_SUBMITTED') || upper.includes('PROOF')) {
    return 'Comprobante Enviado';
  }
  if (upper.includes('PENDING')) {
    return 'Por Validar';
  }
  if (upper.includes('CREATED')) {
    return 'Orden Reservada';
  }
  if (upper.includes('REJECT') || upper.includes('CANCEL')) {
    return 'Pago Rechazado';
  }
  if (upper.includes('UNBLOCKED')) {
    return 'Boleto Desbloqueado';
  }
  if (upper.includes('BLOCKED')) {
    return 'Boleto Bloqueado';
  }
  if (upper.includes('BUYER')) {
    return 'Comprador Editado';
  }
  if (upper.includes('WINNER_DELETED')) {
    return 'Ganador Anulado';
  }
  if (upper.includes('WINNER')) {
    return 'Ganador Registrado';
  }
  if (upper.includes('RAFFLE_DELETED')) {
    return 'Rifa Eliminada';
  }
  if (upper.includes('RAFFLE_UPDATED') || upper.includes('RAFFLE_EDIT')) {
    return 'Parámetros Editados';
  }
  if (upper.includes('RAFFLE_CREATED') || upper.includes('RAFFLE')) {
    return 'Nueva Rifa Creada';
  }
  if (upper.includes('ORDER')) {
    return 'Gestión de Orden';
  }
  if (upper.includes('TICKET')) {
    return 'Gestión de Boletos';
  }
  return 'Actividad Registrada';
}

function getActionConfig(action: string, log?: AuditLogItem): ActionConfig {
  const upper = (action || '').toUpperCase();
  const isActorAdmin = Boolean(
    log?.performed_by ||
    upper.includes('ADMIN') ||
    upper.includes('UPDATE') ||
    upper.includes('DELETE') ||
    upper.includes('CREATE') ||
    upper.includes('PURGE') ||
    upper.includes('BLOCKED') ||
    upper.includes('UNBLOCKED')
  );

  if (upper.includes('PURGE') || upper.includes('CLEANUP') || upper.includes('STORAGE')) {
    return {
      title: 'Vaciado de Comprobantes',
      pillClass: styles.pillWarning,
      nodeClass: styles.nodeWarning,
      icon: <Trash2 size={15} />,
      actor: isActorAdmin ? 'Administrador (Mantenimiento)' : 'Mantenimiento del Sistema',
    };
  }
  if (upper.includes('INVITED') || upper.includes('INVITE')) {
    return {
      title: 'Invitación de Administrador',
      pillClass: styles.pillInfo,
      nodeClass: styles.nodeInfo,
      icon: <UserPlus size={15} />,
      actor: 'Administrador (Equipo)',
    };
  }
  if (upper.includes('SETTINGS')) {
    return {
      title: 'Ajustes del Sistema',
      pillClass: styles.pillInfo,
      nodeClass: styles.nodeInfo,
      icon: <Settings size={15} />,
      actor: 'Administrador (Configuración)',
    };
  }
  if (upper.includes('AUTO_CLOSE')) {
    return {
      title: 'Cierre Automático de Rifa',
      pillClass: styles.pillWarning,
      nodeClass: styles.nodeWarning,
      icon: <Clock size={15} />,
      actor: 'Sistema (Cierre Automático)',
    };
  }
  if (upper.includes('AUTO_EXPIRE') || upper.includes('EXPIR')) {
    return {
      title: 'Reserva Expirada',
      pillClass: styles.pillWarning,
      nodeClass: styles.nodeWarning,
      icon: <Clock size={15} />,
      actor: 'Sistema (Liberación Automática)',
    };
  }
  if (upper.includes('PAID') || upper.includes('APPROVED')) {
    return {
      title: 'Pago Aprobado',
      pillClass: styles.pillSuccess,
      nodeClass: styles.nodeSuccess,
      icon: <CheckCircle2 size={15} />,
      actor: 'Administrador (Confirmación)',
    };
  }
  if (upper.includes('PROOF_SUBMITTED') || upper.includes('PROOF')) {
    return {
      title: 'Comprobante Enviado',
      pillClass: styles.pillInfo,
      nodeClass: styles.nodeInfo,
      icon: <FileText size={15} />,
      actor: 'Comprador (Portal Web)',
    };
  }
  if (upper.includes('PENDING_VERIFICATION') || upper.includes('PENDING')) {
    return {
      title: 'Por Validar',
      pillClass: styles.pillWarning,
      nodeClass: styles.nodeWarning,
      icon: <Clock size={15} />,
      actor: 'Sistema (En Bandeja)',
    };
  }
  if (upper.includes('CREATED')) {
    return {
      title: 'Orden Reservada',
      pillClass: styles.pillInfo,
      nodeClass: styles.nodeInfo,
      icon: <ShoppingCart size={15} />,
      actor: 'Comprador (Reserva Web)',
    };
  }
  if (upper.includes('REJECT') || upper.includes('CANCEL')) {
    return {
      title: 'Pago Rechazado',
      pillClass: styles.pillDanger,
      nodeClass: styles.nodeDanger,
      icon: <XCircle size={15} />,
      actor: 'Administrador (Revisión)',
    };
  }
  if (upper.includes('UNBLOCKED')) {
    return {
      title: 'Boleto Desbloqueado',
      pillClass: styles.pillSuccess,
      nodeClass: styles.nodeSuccess,
      icon: <Unlock size={15} />,
      actor: 'Administrador',
    };
  }
  if (upper.includes('BLOCKED')) {
    return {
      title: 'Boleto Bloqueado',
      pillClass: styles.pillWarning,
      nodeClass: styles.nodeWarning,
      icon: <Lock size={15} />,
      actor: 'Administrador',
    };
  }
  if (upper.includes('BUYER')) {
    return {
      title: 'Comprador Editado',
      pillClass: styles.pillInfo,
      nodeClass: styles.nodeInfo,
      icon: <User size={15} />,
      actor: 'Administrador (Edición)',
    };
  }
  if (upper.includes('WINNER_DELETED')) {
    return {
      title: 'Ganador Anulado',
      pillClass: styles.pillDanger,
      nodeClass: styles.nodeDanger,
      icon: <XCircle size={15} />,
      actor: 'Administrador (Corrección)',
    };
  }
  if (upper.includes('WINNER')) {
    return {
      title: 'Ganador Oficial Registrado',
      pillClass: styles.pillSuccess,
      nodeClass: styles.nodeSuccess,
      icon: <Trophy size={15} />,
      actor: 'Administrador (Sorteo)',
    };
  }
  if (upper.includes('RAFFLE_DELETED')) {
    return {
      title: 'Rifa Eliminada',
      pillClass: styles.pillDanger,
      nodeClass: styles.nodeDanger,
      icon: <XCircle size={15} />,
      actor: 'Administrador',
    };
  }
  if (upper.includes('RAFFLE_UPDATED') || upper.includes('RAFFLE_EDIT')) {
    return {
      title: 'Parámetros de Rifa Editados',
      pillClass: styles.pillSuccess,
      nodeClass: styles.nodeSuccess,
      icon: <Sparkles size={15} />,
      actor: 'Administrador (Configuración)',
    };
  }
  if (upper.includes('RAFFLE_CREATED') || upper.includes('RAFFLE')) {
    return {
      title: 'Nueva Rifa Creada',
      pillClass: styles.pillSuccess,
      nodeClass: styles.nodeSuccess,
      icon: <Sparkles size={15} />,
      actor: 'Administrador (Lanzamiento)',
    };
  }

  return {
    title: formatActionTitle(action),
    pillClass: styles.pillNeutral,
    nodeClass: styles.nodeNeutral,
    icon: <Activity size={15} />,
    actor: isActorAdmin ? 'Administrador' : 'Sistema',
  };
}

interface NarrativeResult {
  headline: string;
  detail: string;
  chips: { label: string; type: 'gold' | 'emerald' | 'muted'; link?: string }[];
}

function getNarrative(log: AuditLogItem): NarrativeResult {
  const d = log.details || {};
  const action = (log.action || '').toUpperCase();
  const ref = (d.reference as string) || '';
  const total = typeof d.total_amount === 'number' ? formatCOP(d.total_amount) : '';
  const ticketCount = typeof d.ticket_count === 'number' ? d.ticket_count : 0;
  const ticketNum = (d.ticket_number as string) || '';
  const reason = (d.reason as string) || '';

  // 1. Vaciado y Mantenimiento de Almacenamiento (comprobantes de pago)
  if (action.includes('PURGE') || action.includes('STORAGE') || action.includes('CLEANUP')) {
    const scope = String(d.scope || '').toLowerCase();
    const isAll = scope === 'all' || !scope;
    const filesCount =
      typeof d.purged_files_count === 'number'
        ? d.purged_files_count
        : typeof d.purged_count === 'number'
          ? d.purged_count
          : 0;

    return {
      headline: isAll
        ? 'Vaciado general del almacenamiento de comprobantes.'
        : 'Liberación de almacenamiento de comprobantes ya verificados.',
      detail:
        filesCount > 0
          ? `Se eliminaron de forma segura ${filesCount} ${filesCount === 1 ? 'archivo de comprobante' : 'archivos de comprobantes'} para liberar y optimizar el almacenamiento del sistema.`
          : 'El almacenamiento fue revisado y optimizado con éxito; no había archivos antiguos pendientes por depurar.',
      chips: [
        { label: isAll ? 'Vaciado Total' : 'Comprobantes Verificados', type: 'gold' as const },
        { label: 'Almacenamiento Optimizado', type: 'emerald' as const },
        ...(filesCount > 0
          ? [
              {
                label: `${filesCount} ${filesCount === 1 ? 'archivo liberado' : 'archivos liberados'}`,
                type: 'muted' as const,
              },
            ]
          : []),
      ],
    };
  }

  // 2. Invitación a administradores del equipo
  if (action.includes('INVITED') || action.includes('INVITE')) {
    const email = (d.email as string) || (d.invited_email as string) || '';
    const role = (d.role as string) === 'super_admin' ? 'Super Administrador' : 'Administrador';
    return {
      headline: 'Invitación enviada a nuevo miembro del equipo.',
      detail: `Se generó y envió invitación de acceso a ${email ? `"${email}"` : 'un nuevo administrador'} con permisos de ${role}.`,
      chips: [
        ...(email ? [{ label: email, type: 'gold' as const }] : []),
        { label: `Rol: ${role}`, type: 'emerald' as const },
      ],
    };
  }

  // 3. Ajustes y Configuración del Sistema
  if (action.includes('SETTINGS')) {
    return {
      headline: 'Ajustes generales del sistema actualizados.',
      detail: 'Se guardaron nuevos parámetros operativos, información de contacto o configuración de pagos.',
      chips: [{ label: 'Ajustes Guardados', type: 'emerald' as const }],
    };
  }

  // 4. Cierre Automático por fecha de sorteo
  if (action.includes('AUTO_CLOSE') || (action.includes('CLOSE') && action.includes('DRAW'))) {
    return {
      headline: 'Cierre automático de venta por fecha del sorteo.',
      detail: 'Se cumplió la fecha programada para el sorteo oficial. La venta de boletos fue cerrada automáticamente para garantizar la transparencia.',
      chips: [
        { label: 'Cierre por Fecha', type: 'gold' as const },
        { label: 'Sorteo Oficial', type: 'emerald' as const },
      ],
    };
  }

  // 5. Ganador Anulado
  if (
    action.includes('WINNER') &&
    (action.includes('DELETE') || action.includes('REVOKE') || action.includes('CANCEL'))
  ) {
    return {
      headline: 'Registro de ganador anulado.',
      detail: 'Se revocó administrativamente el resultado del sorteo para realizar ajustes o reprogramar el sorteo oficial.',
      chips: [{ label: 'Resultado Anulado', type: 'gold' as const }],
    };
  }

  // 6. Rifa Eliminada
  if (action.includes('RAFFLE') && (action.includes('DELETE') || action.includes('REMOVE'))) {
    return {
      headline: 'Rifa eliminada del sistema.',
      detail: 'La rifa y su información asociada fueron retiradas por administración.',
      chips: [{ label: 'Rifa Eliminada', type: 'gold' as const }],
    };
  }

  if (action.includes('PAID') || action.includes('APPROVED')) {
    return {
      headline: `Pago de la orden ${ref ? `${ref}` : ''} verificado y aprobado.`,
      detail: `La transferencia fue validada con éxito. Se confirmaron definitivamente ${ticketCount > 0 ? `${ticketCount} ${ticketCount === 1 ? 'boleto' : 'boletos'}` : 'los boletos'} como VENDIDOS.`,
      chips: [
        ...(ref ? [{ label: `Orden ${ref}`, type: 'gold' as const }] : []),
        ...(total ? [{ label: total, type: 'emerald' as const }] : []),
        ...(ticketCount > 0
          ? [
              {
                label: `${ticketCount} ${ticketCount === 1 ? 'boleto vendido' : 'boletos vendidos'}`,
                type: 'muted' as const,
              },
            ]
          : []),
      ],
    };
  }

  if (action.includes('PROOF_SUBMITTED')) {
    const fileName = (d.file_name as string) || 'comprobante_bancario';
    const fileSize = typeof d.file_size === 'number' ? `${Math.round(d.file_size / 1024)} KB` : '';
    return {
      headline: `Comprobante de pago recibido ${ref ? `para la orden ${ref}` : ''}.`,
      detail: `El comprador adjuntó el soporte de transferencia "${fileName}" ${fileSize ? `(${fileSize})` : ''}. Listo para revisión.`,
      chips: [
        ...(ref ? [{ label: `Orden ${ref}`, type: 'gold' as const }] : []),
        ...(fileSize ? [{ label: fileSize, type: 'muted' as const }] : []),
      ],
    };
  }

  if (action.includes('PENDING_VERIFICATION')) {
    return {
      headline: `Orden ${ref || ''} pasó a estado Por Validar.`,
      detail: `El comprobante ingresó a la bandeja de validación para cotejar el ingreso bancario en cuenta.`,
      chips: [
        ...(ref ? [{ label: `Orden ${ref}`, type: 'gold' as const }] : []),
        { label: 'Bandeja de Validación', type: 'muted' as const },
      ],
    };
  }

  if (action.includes('CREATED')) {
    return {
      headline: `Nueva orden ${ref || ''} generada por el comprador.`,
      detail: `Se reservaron temporalmente ${ticketCount > 0 ? `${ticketCount} ${ticketCount === 1 ? 'boleto' : 'boletos'}` : 'números'} por un valor liquidado de ${total || 'COP'}.`,
      chips: [
        ...(ref ? [{ label: `Orden ${ref}`, type: 'gold' as const }] : []),
        ...(total ? [{ label: total, type: 'emerald' as const }] : []),
        ...(ticketCount > 0
          ? [
              {
                label: `${ticketCount} ${ticketCount === 1 ? 'boleto' : 'boletos'}`,
                type: 'muted' as const,
              },
            ]
          : []),
      ],
    };
  }

  if (action.includes('REJECT')) {
    return {
      headline: `Orden ${ref || ''} rechazada y cancelada.`,
      detail: `El pago no fue validado. Los boletos reservados fueron liberados inmediatamente a la venta pública.${reason ? ` Motivo: "${reason}".` : ''}`,
      chips: [
        ...(ref ? [{ label: `Orden ${ref}`, type: 'gold' as const }] : []),
        ...(reason ? [{ label: `Motivo: ${reason}`, type: 'muted' as const }] : []),
      ],
    };
  }

  if (action.includes('UNBLOCKED')) {
    return {
      headline: `Boleto #${formatTicketNumber(ticketNum)} desbloqueado.`,
      detail: `La restricción administrativa fue levantada y el boleto vuelve a estar disponible para compra pública.${reason ? ` Motivo: "${reason}".` : ''}`,
      chips: [
        { label: `Boleto #${formatTicketNumber(ticketNum)}`, type: 'emerald' as const },
        ...(reason ? [{ label: reason, type: 'muted' as const }] : []),
      ],
    };
  }

  if (action.includes('BLOCKED')) {
    return {
      headline: `Boleto #${formatTicketNumber(ticketNum)} bloqueado preventivamente.`,
      detail: `El boleto fue apartado por administración y no estará visible en el portal público.${reason ? ` Motivo: "${reason}".` : ''}`,
      chips: [
        { label: `Boleto #${formatTicketNumber(ticketNum)}`, type: 'gold' as const },
        ...(reason ? [{ label: reason, type: 'muted' as const }] : []),
      ],
    };
  }

  if (action.includes('EXPIR')) {
    const count = typeof d.released_count === 'number' ? d.released_count : 0;
    return {
      headline: `Liberación automática de reservas vencidas.`,
      detail: `El cronómetro del sistema liberó boletos con tiempo límite expirado para permitir compras de otros clientes.`,
      chips: [
        ...(count > 0 ? [{ label: `${count} boletos liberados`, type: 'muted' as const }] : []),
      ],
    };
  }

  if (action.includes('BUYER')) {
    const doc = (d.document_id as string) || '';
    const newName = (d.new_full_name as string) || '';
    return {
      headline: `Datos de comprador actualizados administrativamente.`,
      detail: `Se modificó la información de contacto de ${newName || 'un comprador'}${doc ? ` (C.C. ${doc})` : ''} por solicitud o corrección de datos.`,
      chips: [
        ...(doc ? [{ label: `C.C. ${doc}`, type: 'gold' as const }] : []),
        ...(newName ? [{ label: newName, type: 'emerald' as const }] : []),
      ],
    };
  }

  if (action.includes('RAFFLE_UPDATED') || action.includes('RAFFLE_EDIT')) {
    const newVals = (d.new_values as Record<string, unknown>) || {};
    const prevVals = (d.previous_values as Record<string, unknown>) || {};
    const title =
      (newVals.title as string) || (prevVals.title as string) || (d.title as string) || 'Rifa';
    const status = (newVals.status as string) || (d.status as string) || '';
    const newPrice =
      typeof newVals.ticket_price === 'number'
        ? formatCOP(newVals.ticket_price)
        : typeof d.ticket_price === 'number'
          ? formatCOP(d.ticket_price)
          : null;
    const oldPrice =
      typeof prevVals.ticket_price === 'number' ? formatCOP(prevVals.ticket_price) : null;

    const changeDetails: string[] = [];
    if (newVals.status && prevVals.status && newVals.status !== prevVals.status) {
      changeDetails.push(`el estado pasó a "${newVals.status}"`);
    } else if (status) {
      changeDetails.push(`estado "${status}"`);
    }

    if (
      newVals.ticket_price &&
      prevVals.ticket_price &&
      newVals.ticket_price !== prevVals.ticket_price
    ) {
      changeDetails.push(`precio ajustado de ${oldPrice} a ${newPrice}`);
    }

    if (
      newVals.lottery_reference &&
      prevVals.lottery_reference &&
      newVals.lottery_reference !== prevVals.lottery_reference
    ) {
      changeDetails.push(`lotería asignada "${newVals.lottery_reference}"`);
    }

    if (newVals.draw_date && prevVals.draw_date && newVals.draw_date !== prevVals.draw_date) {
      changeDetails.push('fecha del sorteo actualizada');
    }

    const detailText =
      changeDetails.length > 0
        ? `Se modificaron los parámetros: ${changeDetails.join(', ')} desde el panel de administración.`
        : `Se actualizaron los parámetros operativos, precio o fecha de sorteo desde el panel de administración.`;

    return {
      headline: `Parámetros de la rifa "${title}" actualizados.`,
      detail: detailText,
      chips: [
        { label: title, type: 'emerald' as const },
        ...(status ? [{ label: `Estado: ${status}`, type: 'gold' as const }] : []),
        ...(newPrice ? [{ label: `Precio: ${newPrice}`, type: 'muted' as const }] : []),
      ],
    };
  }

  if (action.includes('RAFFLE_CREATED')) {
    const title = (d.title as string) || 'Nueva Rifa';
    const total = d.total_tickets as number;
    return {
      headline: `Nueva edición de rifa "${title}" creada.`,
      detail: `Se configuraron los parámetros de la rifa y se generaron todos los boletos en el sistema de manera segura y ordenada.`,
      chips: [
        { label: title, type: 'emerald' as const },
        ...(total ? [{ label: `${total} boletos`, type: 'gold' as const }] : []),
      ],
    };
  }

  if (action.includes('WINNER')) {
    const winnerName = (d.buyer_name as string) || '';
    const ticket = (d.ticket_number as string) || '';
    const drawNum = (d.lottery_draw_number as string) || '';
    const raffleTitle = (d.raffle_title as string) || '';
    const orderRef = (d.order_reference as string) || (d.reference as string) || '';
    const buyerDoc = (d.buyer_document as string) || '';
    const actUrl = (d.official_act_url as string) || '';

    const numFormatted = ticket
      ? `#${formatTicketNumber(ticket)}`
      : drawNum
        ? `#${formatTicketNumber(drawNum)}`
        : '';

    return {
      headline: `Ganador oficial registrado para ${raffleTitle || 'la rifa'}.`,
      detail: `Sorteo oficial completado con éxito. Boleto premiado ${numFormatted || 'asignado'} perteneciente a ${winnerName || 'un comprador verificado'}${buyerDoc ? ` (Documento: ${buyerDoc})` : ''}${orderRef ? ` respaldado por la orden ${orderRef}` : ''}.`,
      chips: [
        ...(numFormatted
          ? [{ label: `Boleto Ganador ${numFormatted}`, type: 'gold' as const }]
          : []),
        ...(winnerName ? [{ label: winnerName, type: 'emerald' as const }] : []),
        ...(orderRef ? [{ label: `Orden ${orderRef}`, type: 'muted' as const }] : []),
        ...(actUrl
          ? [{ label: 'Acta Oficial Adjunta (PDF)', type: 'emerald' as const, link: actUrl }]
          : []),
      ],
    };
  }

  // Filtrar estrictamente cualquier clave técnica interna para evitar volcados crudos de datos o código
  const isExcludedKey = (k: string): boolean => {
    const lower = k.toLowerCase();
    return (
      lower.endsWith('_id') ||
      lower.endsWith('_uuid') ||
      lower.endsWith('_hash') ||
      lower.endsWith('_token') ||
      lower.endsWith('_key') ||
      lower.startsWith('id') ||
      lower.includes('count') ||
      lower.includes('url') ||
      lower === 'timestamp' ||
      lower === 'executed_by' ||
      lower === 'performed_by' ||
      lower === 'registered_by_admin' ||
      lower === 'user_id' ||
      lower === 'admin_id' ||
      lower === 'buyer_id' ||
      lower === 'order_id' ||
      lower === 'raffle_id' ||
      lower === 'scope' ||
      lower === 'session_id' ||
      lower === 'ip_address' ||
      lower === 'user_agent' ||
      lower === 'entity_id' ||
      lower === 'entity_type'
    );
  };

  const isExcludedVal = (val: unknown): boolean => {
    if (val === null || val === undefined || typeof val === 'object') return true;
    const s = String(val).trim();
    if (!s || s.startsWith('http://') || s.startsWith('https://')) return true;
    // UUID v4
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
    // Marca de tiempo ISO
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/i.test(s)) return true;
    return false;
  };

  const friendlyKeyLabels: Record<string, string> = {
    reason: 'Motivo',
    notes: 'Notas',
    note: 'Nota',
    title: 'Título',
    name: 'Nombre',
    buyer_name: 'Comprador',
    status: 'Estado',
    message: 'Mensaje',
    channel: 'Canal',
    phone: 'Teléfono',
    email: 'Correo',
    amount: 'Monto',
  };

  const readableEntries = Object.entries(d).filter(
    ([k, v]) => !isExcludedKey(k) && !isExcludedVal(v)
  );

  const actionTitle = formatActionTitle(action);

  return {
    headline: `Actividad registrada: ${actionTitle}.`,
    detail:
      readableEntries.length > 0
        ? readableEntries
            .map(([k, v]) => `${friendlyKeyLabels[k] || k.replace(/_/g, ' ')}: ${String(v)}`)
            .join(' • ')
        : 'Operación procesada y respaldada en el historial de seguridad del sistema.',
    chips: [...(ref ? [{ label: `Orden ${ref}`, type: 'gold' as const }] : [])],
  };
}

interface FormattedTime {
  relative: string;
  dateStr: string;
  timeStr: string;
  full: string;
}

function getFormattedTime(dateStr: string): FormattedTime {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    let relative = '';
    if (diffSec < 60) {
      relative = 'Hace un momento';
    } else if (diffSec < 3600) {
      const min = Math.floor(diffSec / 60);
      relative = `Hace ${min} min`;
    } else if (diffSec < 86400 && date.getDate() === now.getDate()) {
      relative = `Hoy, ${date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    } else {
      relative = date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    }

    const dateStrFormatted = date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const timeStrFormatted = date.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const full = date.toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'medium',
    });

    return { relative, dateStr: dateStrFormatted, timeStr: timeStrFormatted, full };
  } catch {
    return { relative: dateStr, dateStr: '', timeStr: '', full: dateStr };
  }
}

interface AuditRowData {
  time: FormattedTime;
  event: {
    title: string;
    pillClass: string;
    icon: React.ReactNode;
  };
  reference: string | null;
  referenceType: 'order' | 'ticket' | null;
  description: string;
  amount: string | null;
  tickets: string | null;
  fileInfo: string | null;
  actor: {
    label: string;
    type: 'admin' | 'buyer' | 'system';
  };
}

function getAuditRowData(log: AuditLogItem): AuditRowData {
  const d = log.details || {};
  const action = (log.action || '').toUpperCase();
  const ref = (d.reference as string) || '';
  const total = typeof d.total_amount === 'number' ? formatCOP(d.total_amount) : null;
  const ticketCount = typeof d.ticket_count === 'number' ? d.ticket_count : null;
  const ticketNum = (d.ticket_number as string) || '';
  const reason = (d.reason as string) || '';
  const time = getFormattedTime(log.created_at);
  const isActorAdmin = Boolean(
    log.performed_by ||
    action.includes('ADMIN') ||
    action.includes('UPDATE') ||
    action.includes('DELETE') ||
    action.includes('CREATE') ||
    action.includes('PURGE') ||
    action.includes('BLOCKED') ||
    action.includes('UNBLOCKED')
  );

  // 1. Vaciado de comprobantes y almacenamiento
  if (action.includes('PURGE') || action.includes('STORAGE') || action.includes('CLEANUP')) {
    const scope = String(d.scope || '').toLowerCase();
    const isAll = scope === 'all' || !scope;
    const filesCount =
      typeof d.purged_files_count === 'number'
        ? d.purged_files_count
        : typeof d.purged_count === 'number'
          ? d.purged_count
          : 0;

    return {
      time,
      event: {
        title: 'Vaciado de Comprobantes',
        pillClass: styles.pillWarning,
        icon: <Trash2 size={14} />,
      },
      reference: isAll ? 'Vaciado Total' : 'Comprobantes Verificados',
      referenceType: null,
      description:
        filesCount > 0
          ? `Se liberó espacio en el sistema eliminando ${filesCount} ${filesCount === 1 ? 'archivo de comprobante' : 'archivos de comprobantes'}.`
          : 'Almacenamiento verificado y optimizado; no había archivos antiguos pendientes.',
      amount: null,
      tickets: filesCount > 0 ? `${filesCount} archivos` : null,
      fileInfo: 'Almacenamiento',
      actor: { label: isActorAdmin ? 'Administrador' : 'Sistema', type: isActorAdmin ? 'admin' : 'system' },
    };
  }

  // 2. Invitación a administrador
  if (action.includes('INVITED') || action.includes('INVITE')) {
    const email = (d.email as string) || (d.invited_email as string) || '';
    return {
      time,
      event: {
        title: 'Invitación Admin',
        pillClass: styles.pillInfo,
        icon: <UserPlus size={14} />,
      },
      reference: email || null,
      referenceType: null,
      description: email
        ? `Invitación de acceso enviada a "${email}".`
        : 'Invitación enviada a nuevo miembro del equipo.',
      amount: null,
      tickets: null,
      fileInfo: null,
      actor: { label: 'Administrador', type: 'admin' },
    };
  }

  // 3. Ajustes del Sistema
  if (action.includes('SETTINGS')) {
    return {
      time,
      event: {
        title: 'Ajustes del Sistema',
        pillClass: styles.pillInfo,
        icon: <Settings size={14} />,
      },
      reference: null,
      referenceType: null,
      description: 'Configuración general y parámetros operativos del sistema actualizados.',
      amount: null,
      tickets: null,
      fileInfo: null,
      actor: { label: 'Administrador', type: 'admin' },
    };
  }

  // 4. Cierre Automático por fecha de sorteo
  if (action.includes('AUTO_CLOSE') || (action.includes('CLOSE') && action.includes('DRAW'))) {
    return {
      time,
      event: {
        title: 'Cierre Automático',
        pillClass: styles.pillWarning,
        icon: <Clock size={14} />,
      },
      reference: null,
      referenceType: null,
      description: 'Venta cerrada automáticamente al alcanzarse la fecha oficial del sorteo.',
      amount: null,
      tickets: null,
      fileInfo: null,
      actor: { label: 'Sistema', type: 'system' },
    };
  }

  // 5. Ganador Anulado
  if (
    action.includes('WINNER') &&
    (action.includes('DELETE') || action.includes('REVOKE') || action.includes('CANCEL'))
  ) {
    return {
      time,
      event: {
        title: 'Ganador Anulado',
        pillClass: styles.pillDanger,
        icon: <XCircle size={14} />,
      },
      reference: null,
      referenceType: null,
      description: 'Registro de ganador revocado administrativamente para corrección.',
      amount: null,
      tickets: null,
      fileInfo: null,
      actor: { label: 'Administrador', type: 'admin' },
    };
  }

  // 6. Rifa Eliminada
  if (action.includes('RAFFLE') && (action.includes('DELETE') || action.includes('REMOVE'))) {
    return {
      time,
      event: {
        title: 'Rifa Eliminada',
        pillClass: styles.pillDanger,
        icon: <XCircle size={14} />,
      },
      reference: null,
      referenceType: null,
      description: 'Rifa eliminada permanentemente por administración.',
      amount: null,
      tickets: null,
      fileInfo: null,
      actor: { label: 'Administrador', type: 'admin' },
    };
  }

  if (action.includes('PAID') || action.includes('APPROVED')) {
    return {
      time,
      event: {
        title: 'Pago Aprobado',
        pillClass: styles.pillSuccess,
        icon: <CheckCircle2 size={14} />,
      },
      reference: ref || null,
      referenceType: 'order',
      description:
        'Transferencia validada con éxito. Boletos confirmados definitivamente como VENDIDOS.',
      amount: total,
      tickets: ticketCount ? `${ticketCount} ${ticketCount === 1 ? 'boleto' : 'boletos'}` : null,
      fileInfo: null,
      actor: { label: 'Administrador', type: 'admin' },
    };
  }

  if (action.includes('PROOF_SUBMITTED')) {
    const fileName = (d.file_name as string) || '';
    const fileSize =
      typeof d.file_size === 'number' ? `${Math.round(d.file_size / 1024)} KB` : null;
    return {
      time,
      event: {
        title: 'Comprobante',
        pillClass: styles.pillInfo,
        icon: <FileText size={14} />,
      },
      reference: ref || null,
      referenceType: 'order',
      description: fileName
        ? `Comprobante adjuntado ("${fileName}"). Listo para validación.`
        : 'Comprobante de pago bancario adjuntado por el comprador.',
      amount: null,
      tickets: null,
      fileInfo: fileSize,
      actor: { label: 'Comprador', type: 'buyer' },
    };
  }

  if (action.includes('PENDING_VERIFICATION') || action.includes('PENDING')) {
    return {
      time,
      event: {
        title: 'Por Validar',
        pillClass: styles.pillWarning,
        icon: <Clock size={14} />,
      },
      reference: ref || null,
      referenceType: 'order',
      description: 'Ingresó a la bandeja de validación para cotejo de ingreso en cuenta.',
      amount: total,
      tickets: null,
      fileInfo: null,
      actor: { label: 'Sistema', type: 'system' },
    };
  }

  if (action.includes('CREATED')) {
    return {
      time,
      event: {
        title: 'Orden Reservada',
        pillClass: styles.pillInfo,
        icon: <ShoppingCart size={14} />,
      },
      reference: ref || null,
      referenceType: 'order',
      description: 'Reserva temporal generada por el comprador en el portal web.',
      amount: total,
      tickets: ticketCount ? `${ticketCount} ${ticketCount === 1 ? 'boleto' : 'boletos'}` : null,
      fileInfo: null,
      actor: { label: 'Comprador', type: 'buyer' },
    };
  }

  if (action.includes('REJECT') || action.includes('CANCEL')) {
    return {
      time,
      event: {
        title: 'Pago Rechazado',
        pillClass: styles.pillDanger,
        icon: <XCircle size={14} />,
      },
      reference: ref || null,
      referenceType: 'order',
      description: reason
        ? `Pago no verificado. Motivo: "${reason}". Boletos devueltos a la venta pública.`
        : 'Pago no verificado. Boletos reservados liberados al público.',
      amount: null,
      tickets: null,
      fileInfo: null,
      actor: { label: 'Administrador', type: 'admin' },
    };
  }

  if (action.includes('UNBLOCKED')) {
    return {
      time,
      event: {
        title: 'Desbloqueado',
        pillClass: styles.pillSuccess,
        icon: <Unlock size={14} />,
      },
      reference: ticketNum ? `#${formatTicketNumber(ticketNum)}` : null,
      referenceType: 'ticket',
      description: reason
        ? `Restricción levantada (${reason}). Boleto disponible para compra.`
        : 'Restricción administrativa levantada. Boleto disponible para compra.',
      amount: null,
      tickets: null,
      fileInfo: null,
      actor: { label: 'Administrador', type: 'admin' },
    };
  }

  if (action.includes('BLOCKED')) {
    return {
      time,
      event: {
        title: 'Bloqueado',
        pillClass: styles.pillWarning,
        icon: <Lock size={14} />,
      },
      reference: ticketNum ? `#${formatTicketNumber(ticketNum)}` : null,
      referenceType: 'ticket',
      description: reason
        ? `Boleto apartado preventivamente (${reason}).`
        : 'Boleto apartado preventivamente por administración.',
      amount: null,
      tickets: null,
      fileInfo: null,
      actor: { label: 'Administrador', type: 'admin' },
    };
  }

  if (action.includes('EXPIR')) {
    const count = typeof d.released_count === 'number' ? d.released_count : null;
    return {
      time,
      event: {
        title: 'Reserva Expirada',
        pillClass: styles.pillWarning,
        icon: <Clock size={14} />,
      },
      reference: null,
      referenceType: null,
      description: 'Tiempo límite de reserva expirado. Boletos liberados automáticamente.',
      amount: null,
      tickets: count ? `${count} boletos` : null,
      fileInfo: null,
      actor: { label: 'Sistema', type: 'system' },
    };
  }

  if (action.includes('BUYER')) {
    const doc = (d.document_id as string) || '';
    const newName = (d.new_full_name as string) || '';
    return {
      time,
      event: {
        title: 'Comprador Editado',
        pillClass: styles.pillInfo,
        icon: <User size={14} />,
      },
      reference: doc ? `C.C. ${doc}` : null,
      referenceType: null,
      description: newName
        ? `Datos de contacto actualizados: "${newName}".`
        : 'Datos de contacto del comprador actualizados por administración.',
      amount: null,
      tickets: null,
      fileInfo: null,
      actor: { label: 'Administrador', type: 'admin' },
    };
  }

  if (action.includes('WINNER')) {
    const winnerName = (d.buyer_name as string) || '';
    const ticket = (d.ticket_number as string) || '';
    const drawNum = (d.lottery_draw_number as string) || '';
    const orderRef = (d.order_reference as string) || (d.reference as string) || '';
    const actUrl = (d.official_act_url as string) || '';
    const numFormatted = ticket
      ? `#${formatTicketNumber(ticket)}`
      : drawNum
        ? `#${formatTicketNumber(drawNum)}`
        : '';

    return {
      time,
      event: {
        title: 'Ganador Registrado',
        pillClass: styles.pillSuccess,
        icon: <Trophy size={14} />,
      },
      reference: orderRef || numFormatted || null,
      referenceType: orderRef ? 'order' : 'ticket',
      description: `Boleto premiado ${numFormatted} (${winnerName || 'Ganador'}). Sorteo oficial registrado.`,
      amount: null,
      tickets: numFormatted,
      fileInfo: actUrl ? 'Acta Oficial (PDF)' : null,
      actor: { label: 'Administrador', type: 'admin' },
    };
  }

  if (action.includes('RAFFLE_UPDATED') || action.includes('RAFFLE_EDIT')) {
    const newVals = (d.new_values as Record<string, unknown>) || {};
    const prevVals = (d.previous_values as Record<string, unknown>) || {};
    const title =
      (newVals.title as string) || (prevVals.title as string) || (d.title as string) || 'Rifa';
    const status = (newVals.status as string) || (d.status as string) || '';
    const newPrice =
      typeof newVals.ticket_price === 'number'
        ? formatCOP(newVals.ticket_price)
        : typeof d.ticket_price === 'number'
          ? formatCOP(d.ticket_price)
          : null;
    const oldPrice =
      typeof prevVals.ticket_price === 'number' ? formatCOP(prevVals.ticket_price) : null;

    const changeDetails: string[] = [];
    if (newVals.status && prevVals.status && newVals.status !== prevVals.status) {
      changeDetails.push(`Estado: ${prevVals.status} → ${newVals.status}`);
    } else if (status) {
      changeDetails.push(`Estado: ${status}`);
    }

    if (
      newVals.ticket_price &&
      prevVals.ticket_price &&
      newVals.ticket_price !== prevVals.ticket_price
    ) {
      changeDetails.push(`Precio: ${oldPrice} → ${newPrice}`);
    }

    if (
      newVals.lottery_reference &&
      prevVals.lottery_reference &&
      newVals.lottery_reference !== prevVals.lottery_reference
    ) {
      changeDetails.push(`Lotería: ${newVals.lottery_reference}`);
    }

    if (newVals.draw_date && prevVals.draw_date && newVals.draw_date !== prevVals.draw_date) {
      changeDetails.push('Fecha de sorteo actualizada');
    }

    const description =
      changeDetails.length > 0
        ? `Parámetros de "${title}" actualizados (${changeDetails.join(', ')}).`
        : `Parámetros operativos de "${title}" modificados desde la configuración administrativa.`;

    return {
      time,
      event: {
        title: 'Parámetros Editados',
        pillClass: styles.pillSuccess,
        icon: <Sparkles size={14} />,
      },
      reference: title,
      referenceType: null,
      description,
      amount: newPrice,
      tickets: status ? `Estado: ${status}` : null,
      fileInfo: null,
      actor: { label: 'Administrador', type: 'admin' },
    };
  }

  if (action.includes('RAFFLE_CREATED') || action === 'RAFFLE') {
    const title = (d.title as string) || 'Nueva Rifa';
    const total = typeof d.total_tickets === 'number' ? d.total_tickets : null;
    const price = typeof d.ticket_price === 'number' ? formatCOP(d.ticket_price) : null;

    return {
      time,
      event: {
        title: 'Nueva Rifa Creada',
        pillClass: styles.pillSuccess,
        icon: <Sparkles size={14} />,
      },
      reference: title,
      referenceType: null,
      description: `Lanzamiento y configuración de nueva edición "${title}". Boletos generados atómicamente.`,
      amount: price,
      tickets: total ? `${total} boletos` : null,
      fileInfo: null,
      actor: { label: 'Administrador', type: 'admin' },
    };
  }

  // Fallback seguro con títulos limpios en español y actor coherente
  const fallbackTitle = formatActionTitle(action);

  return {
    time,
    event: {
      title: fallbackTitle,
      pillClass: styles.pillNeutral,
      icon: <Activity size={14} />,
    },
    reference: ref || null,
    referenceType: ref ? 'order' : null,
    description: 'Operación registrada y respaldada en el historial de seguridad del sistema.',
    amount: total,
    tickets: null,
    fileInfo: null,
    actor: isActorAdmin
      ? { label: 'Administrador', type: 'admin' }
      : { label: 'Sistema', type: 'system' },
  };
}

export const AuditView: React.FC = () => {
  const { selectedRaffleId, selectedRaffle } = useAdminRaffle();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [actionType, setActionType] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');

  // Reiniciar a página 1 si cambia la rifa seleccionada
  const [prevRaffleId, setPrevRaffleId] = useState(selectedRaffleId);
  if (prevRaffleId !== selectedRaffleId) {
    setPrevRaffleId(selectedRaffleId);
    setPage(1);
  }

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchAuditLogsPaginated({
        actionFilter: actionType,
        searchTerm,
        page,
        pageSize,
        raffleId: selectedRaffleId,
      });
      setLogs(res.logs);
      setTotalCount(res.totalCount);
      setTotalPages(res.totalPages || 1);
      setIsForbidden(false);
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, 'Error al cargar la bitácora de auditoría');
      logAppError('AuditView.loadLogs', normalized);
      setError(normalized.userMessage);
      setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
    } finally {
      setIsLoading(false);
    }
  }, [actionType, searchTerm, page, pageSize, selectedRaffleId]);

  useEffect(() => {
    let isMounted = true;
    fetchAuditLogsPaginated({
      actionFilter: actionType,
      searchTerm,
      page,
      pageSize,
      raffleId: selectedRaffleId,
    })
      .then((res) => {
        if (!isMounted) return;
        setLogs(res.logs);
        setTotalCount(res.totalCount);
        setTotalPages(res.totalPages || 1);
        setIsForbidden(false);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const normalized = normalizeAppError(err, 'Error al cargar la bitácora de auditoría');
        logAppError('AuditView.init', normalized);
        setError(normalized.userMessage);
        setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [actionType, searchTerm, page, pageSize, selectedRaffleId]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  const handleActionTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setActionType(e.target.value);
    setPage(1);
  };

  return (
    <div className={commonStyles.viewContainer}>
      <AdminPageHeader
        title="Bitácora de Auditoría"
        description={
          selectedRaffle
            ? `Historial de actividades, movimientos y validaciones de pago para: ${selectedRaffle.title}`
            : 'Historial de actividades, confirmaciones de pago y movimientos del sistema en tiempo real.'
        }
        badge="Seguridad y actividad"
        actions={
          <button
            type="button"
            className={commonStyles.btnPrimary}
            onClick={() => void loadLogs()}
            disabled={isLoading}
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            <span>Refrescar</span>
          </button>
        }
      />

      {/* Métricas Visuales */}
      <div className={styles.metricsContainer}>
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Seguridad del Registro</span>
            <div className={styles.metricIcon}>
              <ShieldCheck size={18} color="var(--color-success)" />
            </div>
          </div>
          <div className={`${styles.metricValue} ${styles.metricValueSuccess}`}>
            Activa y Protegida
          </div>
          <span className={styles.metricHint}>Historial protegido contra alteraciones</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Total de Actividades</span>
            <div className={styles.metricIcon}>
              <History size={18} color="var(--brand-accent)" />
            </div>
          </div>
          <div className={styles.metricValue}>{totalCount}</div>
          <span className={styles.metricHint}>Operaciones y movimientos registrados</span>
        </div>
      </div>

      {/* Barra de Filtros y Selector de Vista */}
      <div className={commonStyles.filterBar}>
        <div className={commonStyles.searchGroup}>
          <Search size={18} />
          <input
            type="text"
            className={commonStyles.searchInput}
            placeholder="Buscar por número de orden, comprador o actividad..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>

        <div className={commonStyles.filterControls}>
          <div className={commonStyles.filterLabel}>
            <Filter size={16} />
            <span className={commonStyles.filterLabelText}>Filtrar:</span>
          </div>
          <select
            className={commonStyles.filterSelect}
            value={actionType}
            onChange={handleActionTypeChange}
          >
            <option value="ALL">Todas las actividades</option>
            <option value="PAID">Pagos Aprobados</option>
            <option value="PROOF">Comprobantes Enviados</option>
            <option value="PENDING">Pendientes de Validación</option>
            <option value="TICKET">Gestión de Boletos</option>
            <option value="RAFFLE">Configuración de Rifa</option>
            <option value="WINNER">Ganadores Registrados</option>
            <option value="REJECT">Pagos Rechazados</option>
            <option value="PURGE">Vaciado y Almacenamiento</option>
            <option value="SETTINGS">Ajustes del Sistema</option>
          </select>

          {/* Selector de Modo: Línea de Tiempo o Tabla */}
          <div className={styles.viewSwitcher}>
            <button
              type="button"
              className={`${styles.switcherBtn} ${viewMode === 'timeline' ? styles.switcherBtnActive : ''}`}
              onClick={() => setViewMode('timeline')}
              title="Ver en formato Línea de Tiempo"
            >
              <LayoutList size={15} />
              <span>Flujo</span>
            </button>
            <button
              type="button"
              className={`${styles.switcherBtn} ${viewMode === 'table' ? styles.switcherBtnActive : ''}`}
              onClick={() => setViewMode('table')}
              title="Ver en formato Tabla"
            >
              <TableIcon size={15} />
              <span>Tabla</span>
            </button>
          </div>
        </div>
      </div>

      {/* Contenedor Principal */}
      {isLoading ? (
        <div className={commonStyles.cardSection}>
          <AdminLoadingState message="Cargando bitácora de auditoría..." />
        </div>
      ) : error ? (
        <div className={commonStyles.cardSection}>
          <AdminErrorState
            title={isForbidden ? 'Acceso Restringido' : 'Error al cargar auditoría'}
            message={error}
            isForbidden={isForbidden}
            onRetry={() => void loadLogs()}
          />
        </div>
      ) : logs.length === 0 ? (
        <AdminEmptyState
          icon={<History size={36} />}
          title="Sin actividades registradas"
          description="Las operaciones realizadas en el sistema se reflejarán automáticamente aquí."
        />
      ) : viewMode === 'timeline' ? (
        /* =================== MODO LÍNEA DE TIEMPO (TIMELINE) =================== */
        <div className={commonStyles.cardSection}>
          <div className={styles.viewSectionHeader}>
            <h2 className={`${commonStyles.sectionTitle} ${styles.sectionTitleCompact}`}>
              Actividades y Movimientos Recientes{' '}
              <span className={styles.eventCountBadge}>
                ({totalCount} registros)
              </span>
            </h2>
          </div>

          <div className={styles.timelineWrapper}>
            <div className={styles.timelineSpine} />

            {logs.map((log) => {
              const config = getActionConfig(log.action, log);
              const narrative = getNarrative(log);
              const time = getFormattedTime(log.created_at);

              return (
                <div key={log.id} className={styles.timelineItem}>
                  {/* Nodo de estado en la línea */}
                  <div
                    className={`${styles.timelineNode} ${config.nodeClass}`}
                    title={config.title}
                  >
                    {config.icon}
                  </div>

                  {/* Tarjeta de actividad */}
                  <div className={styles.timelineCard}>
                    <div className={styles.cardHeader}>
                      <div className={styles.headerTags}>
                        <span className={config.pillClass}>
                          {config.icon}
                          <span>{config.title}</span>
                        </span>

                        <span className={styles.actorTag}>
                          <span>• {config.actor}</span>
                        </span>
                      </div>

                      <span className={styles.timeBadge} title={time.full}>
                        <Clock size={12} />
                        <span>{time.relative}</span>
                      </span>
                    </div>

                    <div className={styles.cardBody}>
                      <div className={styles.cardHeadline}>
                        {narrative.headline}
                      </div>
                      <div className={styles.cardDetail}>
                        {narrative.detail}
                      </div>
                    </div>

                    {narrative.chips.length > 0 && (
                      <div className={styles.cardFooter}>
                        <div className={styles.footerChips}>
                          {narrative.chips.map((chip, idx) => {
                            let chipClass = styles.chipMuted;
                            if (chip.type === 'gold') chipClass = styles.chipGold;
                            if (chip.type === 'emerald') chipClass = styles.chipEmerald;

                            if (chip.link) {
                              return (
                                <a
                                  key={idx}
                                  href={chip.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`${chipClass} ${styles.chipLink}`}
                                  title="Abrir documento en nueva pestaña"
                                >
                                  <span>{chip.label}</span>
                                  <ExternalLink size={11} />
                                </a>
                              );
                            }

                            return (
                              <span key={idx} className={chipClass}>
                                {chip.label}
                              </span>
                            );
                          })}
                        </div>
                        <span className={styles.footerTimestamp}>
                          {time.full}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginación */}
          <div className={commonStyles.paginationBar}>
            <div className={commonStyles.paginationInfo}>
              Mostrando <strong>{logs.length}</strong> de <strong>{totalCount}</strong> eventos
            </div>
            <div className={commonStyles.paginationControls}>
              <div className={commonStyles.pageSizeRow}>
                <span className={commonStyles.pageSizeLabel}>
                  Por pág.:
                </span>
                <select
                  className={commonStyles.pageSizeSelect}
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <button
                type="button"
                className={commonStyles.paginationBtn}
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                <ChevronLeft size={16} />
                <span>Anterior</span>
              </button>
              <span className={commonStyles.paginationPageBadge}>
                Pág. {page} de {totalPages}
              </span>
              <button
                type="button"
                className={commonStyles.paginationBtn}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              >
                <span>Siguiente</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* =================== MODO TABLA EJECUTIVA =================== */
        <div>
          <div className={styles.viewSectionHeader}>
            <h2 className={`${commonStyles.sectionTitle} ${styles.sectionTitleCompact}`}>
              Actividades y Movimientos Recientes{' '}
              <span className={styles.eventCountBadge}>
                ({totalCount} registros)
              </span>
            </h2>
          </div>

          <div className={styles.tableCardContainer}>
            <div className={styles.tableScrollWrapper}>
              <table className={styles.executiveTable}>
                <thead>
                  <tr>
                    <th className={styles.thDateTime}>Fecha y Hora</th>
                    <th className={styles.thEvent}>Actividad</th>
                    <th className={styles.thReference}>Referencia</th>
                    <th>Detalle de la Operación</th>
                    <th className={styles.thImpact}>Impacto / Monto</th>
                    <th className={styles.thActor}>Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const row = getAuditRowData(log);

                    return (
                      <tr key={log.id} className={styles.executiveTableRow}>
                        {/* 1. Fecha / Hora */}
                        <td>
                          <div className={styles.tableTimeCell}>
                            <span className={styles.tableTimeMain}>
                              {row.time.dateStr} • {row.time.timeStr}
                            </span>
                            <span className={styles.tableTimeAgo}>
                              <Clock size={11} />
                              {row.time.relative}
                            </span>
                          </div>
                        </td>

                        {/* 2. Evento */}
                        <td>
                          <span className={row.event.pillClass}>
                            {row.event.icon}
                            <span>{row.event.title}</span>
                          </span>
                        </td>

                        {/* 3. Referencia */}
                        <td>
                          {row.reference ? (
                            <span
                              className={`${
                                row.referenceType === 'order' ? styles.chipGold : styles.chipEmerald
                              } ${styles.tableReferenceChip}`}
                              title={row.reference}
                            >
                              {row.reference}
                            </span>
                          ) : (
                            <span className={styles.emptyDash}>—</span>
                          )}
                        </td>

                        {/* 4. Detalle de la Operación */}
                        <td>
                          <span className={styles.tableDescription}>{row.description}</span>
                        </td>

                        {/* 5. Impacto / Monto */}
                        <td>
                          <div className={styles.tableImpactGroup}>
                            {row.amount && (
                              <strong className={styles.tableAmount}>{row.amount}</strong>
                            )}
                            {row.tickets && (
                              <span className={styles.tableTicketBadge}>{row.tickets}</span>
                            )}
                            {row.fileInfo && (
                              <span className={styles.tableFileBadge}>{row.fileInfo}</span>
                            )}
                            {!row.amount && !row.tickets && !row.fileInfo && (
                              <span className={styles.emptyDash}>—</span>
                            )}
                          </div>
                        </td>

                        {/* 6. Responsable */}
                        <td className={styles.tdActor}>
                          {row.actor.type === 'admin' && (
                            <span className={styles.actorBadgeAdmin}>
                              <Shield size={12} />
                              <span>Administrador</span>
                            </span>
                          )}
                          {row.actor.type === 'buyer' && (
                            <span className={styles.actorBadgeBuyer}>
                              <User size={12} />
                              <span>Comprador</span>
                            </span>
                          )}
                          {row.actor.type === 'system' && (
                            <span className={styles.actorBadgeSystem}>
                              <Cpu size={12} />
                              <span>Sistema</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación integrada al pie de la tabla */}
            <div className={styles.tableFooterPagination}>
              <div className={commonStyles.paginationInfo}>
                Mostrando <strong>{logs.length}</strong> de <strong>{totalCount}</strong> eventos
              </div>
              <div className={commonStyles.paginationControls}>
                <div className={commonStyles.pageSizeRow}>
                  <span className={commonStyles.pageSizeLabel}>
                    Por pág.:
                  </span>
                  <select
                    className={commonStyles.pageSizeSelect}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <button
                  type="button"
                  className={commonStyles.paginationBtn}
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                >
                  <ChevronLeft size={16} />
                  <span>Anterior</span>
                </button>
                <span className={commonStyles.paginationPageBadge}>
                  Pág. {page} de {totalPages}
                </span>
                <button
                  type="button"
                  className={commonStyles.paginationBtn}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                >
                  <span>Siguiente</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
