import { formatCOP, formatTicketNumber } from '@/lib/utils';
import { logoPrincipalCompleto } from '@/assets/assets';

const logoImgSrc = logoPrincipalCompleto.master;

export interface DigitalReceiptData {
  orderReference: string;
  orderStatus: 'paid';
  createdAt: string;
  totalAmount: number;
  ticketCount: number;
  buyerName: string;
  buyerDocumentMasked: string;
  raffleTitle: string;
  lotteryReference: string;
  drawDate?: string;
  ticketNumbers: string[];
  verifiedAt?: string;
  unitPrice?: number;
  paymentMethod?: string;
  supportPhone?: string;
}

export interface TicketGridLayout {
  cols: number;
  rows: number;
  chipWidth: number;
  chipHeight: number;
  gapX: number;
  gapY: number;
  fontSize: number;
  totalGridHeight: number;
}

/**
 * Obtiene la URL base de verificación respetando variables de entorno
 * y evitando cualquier dominio hardcodeado sin fallback dinámico.
 */
export function getVerificationBaseUrl(): string {
  const envUrl =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SITE_URL
      ? String(import.meta.env.VITE_SITE_URL).trim()
      : '';

  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return 'https://manaurevive.com';
}

/**
 * Construye la URL completa de verificación pública para una orden específica.
 */
export function getVerificationUrl(reference: string): string {
  const base = getVerificationBaseUrl();
  const cleanRef = encodeURIComponent((reference || '').trim());
  return `${base}/verificar?ref=${cleanRef}`;
}

/**
 * Carga una imagen de forma segura para Canvas con fallback tolerante.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      return reject(new Error('Image constructor no disponible en este entorno.'));
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar el logo para el comprobante'));
    img.src = src;
  });
}

function formatDateSafe(dateStr?: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

function formatDateTimeSafe(dateStr?: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return dateStr;
  }
}

/**
 * Dibuja un rectángulo con bordes redondeados con soporte universal y fallback.
 */
export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number | [number, number, number, number],
  fill?: string | CanvasGradient,
  stroke?: string | CanvasGradient,
  lineWidth = 1
): void {
  ctx.save();
  ctx.beginPath();

  const r = typeof radius === 'number' ? [radius, radius, radius, radius] : radius;
  const [tl, tr, br, bl] = r;

  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, [tl, tr, br, bl]);
  } else {
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    ctx.lineTo(x + bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
    ctx.lineTo(x, y + tl);
    ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
  }

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke && lineWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Ajusta dinámicamente el tamaño de fuente si el texto supera el ancho máximo.
 */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  baseFontSize: number,
  fontFamily = 'system-ui, -apple-system, sans-serif',
  fontWeight = 'bold',
  minFontSize = 13
): { fontSize: number; font: string } {
  let size = baseFontSize;
  ctx.font = `${fontWeight} ${size}px ${fontFamily}`;

  while (size > minFontSize && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
  }

  return { fontSize: size, font: `${fontWeight} ${size}px ${fontFamily}` };
}

/**
 * Divide un texto largo en múltiples líneas limpias en límites de palabras.
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2
): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines - 1) break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Función centralizada para dibujar texto con alineación, color y fuente consistentes.
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    font?: string;
    color?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    maxWidth?: number;
  } = {}
): void {
  ctx.save();
  if (options.font) ctx.font = options.font;
  if (options.color) ctx.fillStyle = options.color;
  if (options.align) ctx.textAlign = options.align;
  if (options.baseline) ctx.textBaseline = options.baseline;

  if (options.maxWidth) {
    ctx.fillText(text, x, y, options.maxWidth);
  } else {
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

/**
 * Dibuja un encabezado de sección con indicador decorativo y jerarquía visual.
 */
export function drawSectionHeader(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string | undefined,
  x: number,
  y: number,
  width: number
): void {
  // Barra decorativa vertical ámbar
  drawRoundedRect(ctx, x, y - 13, 4, 18, 2, '#E58B24');

  drawText(ctx, title, x + 12, y, {
    font: 'bold 18px system-ui, -apple-system, sans-serif',
    color: '#F4EFE4',
    align: 'left',
    baseline: 'middle',
  });

  if (subtitle) {
    drawText(ctx, subtitle, x + width, y, {
      font: '600 13px system-ui, -apple-system, sans-serif',
      color: '#9EB3A7',
      align: 'right',
      baseline: 'middle',
    });
  }
}

/**
 * Calcula la disposición de columnas, dimensiones de chip y altura del grid de boletos.
 */
export function computeTicketGridLayout(
  ticketCount: number,
  availableWidth: number
): TicketGridLayout {
  const count = Math.max(1, ticketCount);
  let cols: number;
  let chipWidth: number;
  let chipHeight: number;
  let gapX: number;
  let gapY: number;
  let fontSize: number;

  if (count === 1) {
    cols = 1;
    chipWidth = 280;
    chipHeight = 84;
    gapX = 0;
    gapY = 0;
    fontSize = 42;
  } else if (count === 2) {
    cols = 2;
    chipWidth = 250;
    chipHeight = 80;
    gapX = 24;
    gapY = 0;
    fontSize = 38;
  } else if (count === 3) {
    cols = 3;
    chipWidth = 230;
    chipHeight = 76;
    gapX = 20;
    gapY = 0;
    fontSize = 34;
  } else if (count <= 5) {
    cols = count;
    gapX = 16;
    gapY = 14;
    chipHeight = 70;
    fontSize = 30;
    const totalGaps = (cols - 1) * gapX;
    chipWidth = Math.floor((availableWidth - totalGaps) / cols);
  } else if (count <= 12) {
    cols = 4;
    gapX = 16;
    gapY = 14;
    chipHeight = 66;
    fontSize = 28;
    const totalGaps = (cols - 1) * gapX;
    chipWidth = Math.floor((availableWidth - totalGaps) / cols);
  } else if (count <= 30) {
    cols = 5;
    gapX = 14;
    gapY = 12;
    chipHeight = 58;
    fontSize = 24;
    const totalGaps = (cols - 1) * gapX;
    chipWidth = Math.floor((availableWidth - totalGaps) / cols);
  } else if (count <= 60) {
    cols = 6;
    gapX = 12;
    gapY = 10;
    chipHeight = 50;
    fontSize = 20;
    const totalGaps = (cols - 1) * gapX;
    chipWidth = Math.floor((availableWidth - totalGaps) / cols);
  } else {
    cols = 8;
    gapX = 10;
    gapY = 8;
    chipHeight = 44;
    fontSize = 17;
    const totalGaps = (cols - 1) * gapX;
    chipWidth = Math.floor((availableWidth - totalGaps) / cols);
  }

  const rows = Math.ceil(count / cols);
  const totalGridHeight = rows * chipHeight + Math.max(0, rows - 1) * gapY;

  return {
    cols,
    rows,
    chipWidth,
    chipHeight,
    gapX,
    gapY,
    fontSize,
    totalGridHeight,
  };
}

/**
 * Dibuja la cuadrícula completa de números asegurando que ninguno sea omitido.
 */
export function drawTicketGrid(
  ctx: CanvasRenderingContext2D,
  tickets: string[],
  x: number,
  y: number,
  width: number
): number {
  if (tickets.length === 0) return y;

  const layout = computeTicketGridLayout(tickets.length, width);
  const isCentered = tickets.length <= 3;
  const totalOccupiedWidth = isCentered
    ? tickets.length * layout.chipWidth + (tickets.length - 1) * layout.gapX
    : width;
  const startX = isCentered ? x + Math.floor((width - totalOccupiedWidth) / 2) : x;

  tickets.forEach((num, index) => {
    const col = index % layout.cols;
    const row = Math.floor(index / layout.cols);
    const chipX = startX + col * (layout.chipWidth + layout.gapX);
    const chipY = y + row * (layout.chipHeight + layout.gapY);

    // Fondo degradado del chip de boleto
    const chipGrad = ctx.createLinearGradient(chipX, chipY, chipX, chipY + layout.chipHeight);
    chipGrad.addColorStop(0, '#132E22');
    chipGrad.addColorStop(1, '#0B1E16');

    drawRoundedRect(
      ctx,
      chipX,
      chipY,
      layout.chipWidth,
      layout.chipHeight,
      10,
      chipGrad,
      'rgba(229, 139, 36, 0.45)',
      1.5
    );

    // Número formateado con #
    const formatted = `#${formatTicketNumber(num)}`;
    drawText(ctx, formatted, chipX + layout.chipWidth / 2, chipY + layout.chipHeight / 2 + 1, {
      font: `bold ${layout.fontSize}px 'JetBrains Mono', monospace`,
      color: '#FBBF24',
      align: 'center',
      baseline: 'middle',
    });
  });

  return y + layout.totalGridHeight;
}

/**
 * Calcula las dimensiones óptimas del canvas adaptándose dinámicamente al volumen de números.
 */
export function calculateReceiptCanvasDimensions(data: DigitalReceiptData): {
  width: number;
  height: number;
  gridRows: number;
  gridCols: number;
  totalGridHeight: number;
} {
  const width = 1000;
  const availableWidth = width - 110; // 55px margen a cada lado
  const ticketCount = data.ticketNumbers ? data.ticketNumbers.length : 0;
  const layout = computeTicketGridLayout(ticketCount, availableWidth);

  // Espacio fijo requerido por encabezados, tarjetas de datos, resumen y footer
  const fixedSectionsHeight = 1080;
  const minHeight = 1400;
  const height = Math.max(minHeight, fixedSectionsHeight + layout.totalGridHeight);

  return {
    width,
    height,
    gridRows: layout.rows,
    gridCols: layout.cols,
    totalGridHeight: layout.totalGridHeight,
  };
}

/**
 * Genera el Canvas del Comprobante Digital Oficial con diseño premium de alta resolución
 * y altura dinámica que jamás trunca ni oculta números adquiridos.
 */
export async function generateDigitalReceiptCanvas(
  data: DigitalReceiptData
): Promise<HTMLCanvasElement> {
  // Validación estricta de seguridad financiera
  if (data.orderStatus !== 'paid') {
    throw new Error(
      'Solo se permite generar comprobantes digitales para órdenes en estado PAGADO / CONFIRMADO.'
    );
  }

  if (typeof document === 'undefined') {
    throw new Error('Canvas solo puede generarse en un entorno con soporte de DOM.');
  }

  const { width: W, height: H } = calculateReceiptCanvasDimensions(data);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar el contexto 2D de Canvas.');

  canvas.width = W;
  canvas.height = H;

  const M = 55;
  const CW = W - 2 * M;
  const X = M;

  // 1. Fondo elegante con degradado profundo bosque
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#06130B');
  bgGrad.addColorStop(0.35, '#0A2114');
  bgGrad.addColorStop(0.75, '#07170E');
  bgGrad.addColorStop(1, '#040D07');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Resplandor superior suave
  const topGlow = ctx.createRadialGradient(W / 2, 110, 20, W / 2, 110, 480);
  topGlow.addColorStop(0, 'rgba(27, 74, 46, 0.45)');
  topGlow.addColorStop(1, 'rgba(27, 74, 46, 0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W, 450);

  // 2. Doble marco exterior decorativo con acentos dorados
  drawRoundedRect(ctx, 22, 22, W - 44, H - 44, 24, undefined, 'rgba(229, 139, 36, 0.45)', 2);
  drawRoundedRect(ctx, 32, 32, W - 64, H - 64, 18, undefined, 'rgba(229, 139, 36, 0.16)', 1);

  // Acentos en las 4 esquinas interiores
  const cornerSize = 14;
  ctx.save();
  ctx.strokeStyle = '#E58B24';
  ctx.lineWidth = 2;
  // Top-left
  ctx.beginPath();
  ctx.moveTo(42, 42 + cornerSize);
  ctx.lineTo(42, 42);
  ctx.lineTo(42 + cornerSize, 42);
  ctx.stroke();
  // Top-right
  ctx.beginPath();
  ctx.moveTo(W - 42 - cornerSize, 42);
  ctx.lineTo(W - 42, 42);
  ctx.lineTo(W - 42, 42 + cornerSize);
  ctx.stroke();
  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(42, H - 42 - cornerSize);
  ctx.lineTo(42, H - 42);
  ctx.lineTo(42 + cornerSize, H - 42);
  ctx.stroke();
  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(W - 42 - cornerSize, H - 42);
  ctx.lineTo(W - 42, H - 42);
  ctx.lineTo(W - 42, H - 42 - cornerSize);
  ctx.stroke();
  ctx.restore();

  let currentY = 52;

  // 3. Encabezado / Logo
  try {
    const logo = await loadImage(logoImgSrc);
    const logoW = 230;
    const logoH = (logo.height / logo.width) * logoW;
    ctx.drawImage(logo, (W - logoW) / 2, currentY, logoW, logoH);
    currentY += logoH + 8;
  } catch {
    // Fallback tipográfico elegante
    drawText(ctx, 'MANAURE VIVE', W / 2, currentY + 32, {
      font: "bold 38px 'Playfair Display', Georgia, serif",
      color: '#F4EFE4',
      align: 'center',
    });
    currentY += 48;
  }

  drawText(ctx, 'GRAN RIFA ECOTURÍSTICA • LA GUAJIRA', W / 2, currentY, {
    font: "700 13px 'Outfit', system-ui, sans-serif",
    color: '#E58B24',
    align: 'center',
  });
  currentY += 26;

  // 4. Insignia Oficial: PAGO CONFIRMADO
  const badgeW = 440;
  const badgeH = 42;
  const badgeX = (W - badgeW) / 2;
  drawRoundedRect(
    ctx,
    badgeX,
    currentY,
    badgeW,
    badgeH,
    21,
    'rgba(16, 185, 129, 0.16)',
    'rgba(52, 211, 153, 0.65)',
    1.5
  );

  drawText(ctx, '✓ PAGO CONFIRMADO • COMPROBANTE OFICIAL', W / 2, currentY + badgeH / 2 + 1, {
    font: "bold 17px 'Outfit', system-ui, sans-serif",
    color: '#34D399',
    align: 'center',
    baseline: 'middle',
  });
  currentY += badgeH + 22;

  // 5. Tarjeta Principal: Orden y Titular
  const mainCardH = 175;
  drawRoundedRect(
    ctx,
    X,
    currentY,
    CW,
    mainCardH,
    16,
    '#0D2218',
    'rgba(156, 181, 171, 0.22)',
    1
  );

  // Columna Izquierda: Referencia y Fechas
  const colLeftX = X + 28;
  drawText(ctx, 'REFERENCIA DE ORDEN', colLeftX, currentY + 30, {
    font: '700 12px system-ui, sans-serif',
    color: '#9EB3A7',
  });

  const refFit = fitText(
    ctx,
    data.orderReference,
    370,
    30,
    "'JetBrains Mono', monospace",
    'bold',
    18
  );
  drawText(ctx, data.orderReference, colLeftX, currentY + 65, {
    font: refFit.font,
    color: '#FBBF24',
  });

  drawText(ctx, 'FECHA DE COMPRA', colLeftX, currentY + 102, {
    font: '700 11px system-ui, sans-serif',
    color: '#9EB3A7',
  });
  drawText(ctx, formatDateTimeSafe(data.createdAt), colLeftX, currentY + 124, {
    font: '600 14px system-ui, sans-serif',
    color: '#F4EFE4',
  });

  drawText(ctx, 'ESTADO DE PAGO', colLeftX, currentY + 146, {
    font: '700 11px system-ui, sans-serif',
    color: '#9EB3A7',
  });
  drawText(ctx, '✓ Verificado y Aprobado', colLeftX, currentY + 163, {
    font: '700 13px system-ui, sans-serif',
    color: '#34D399',
  });

  // Divisor vertical
  const dividerX = X + Math.floor(CW / 2) - 10;
  ctx.save();
  ctx.strokeStyle = 'rgba(156, 181, 171, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dividerX, currentY + 20);
  ctx.lineTo(dividerX, currentY + mainCardH - 20);
  ctx.stroke();
  ctx.restore();

  // Columna Derecha: Titular y Validación
  const colRightX = dividerX + 30;
  const maxRightWidth = X + CW - colRightX - 25;

  drawText(ctx, 'COMPRADOR / TITULAR', colRightX, currentY + 30, {
    font: '700 12px system-ui, sans-serif',
    color: '#9EB3A7',
  });

  const nameFit = fitText(
    ctx,
    data.buyerName,
    maxRightWidth,
    22,
    'system-ui, sans-serif',
    'bold',
    15
  );
  drawText(ctx, data.buyerName, colRightX, currentY + 62, {
    font: nameFit.font,
    color: '#F4EFE4',
  });

  drawText(ctx, 'DOCUMENTO REGISTRADO', colRightX, currentY + 102, {
    font: '700 11px system-ui, sans-serif',
    color: '#9EB3A7',
  });
  drawText(ctx, data.buyerDocumentMasked, colRightX, currentY + 124, {
    font: "600 14px 'JetBrains Mono', monospace",
    color: '#F4EFE4',
  });

  drawText(ctx, 'FECHA DE CONFIRMACIÓN', colRightX, currentY + 146, {
    font: '700 11px system-ui, sans-serif',
    color: '#9EB3A7',
  });
  drawText(
    ctx,
    formatDateTimeSafe(data.verifiedAt || data.createdAt),
    colRightX,
    currentY + 163,
    {
      font: '600 13px system-ui, sans-serif',
      color: '#E58B24',
    }
  );

  currentY += mainCardH + 18;

  // 6. Tarjeta de Rifa y Lotería
  const raffleCardH = 88;
  drawRoundedRect(
    ctx,
    X,
    currentY,
    CW,
    raffleCardH,
    14,
    '#11281E',
    'rgba(229, 139, 36, 0.25)',
    1
  );

  drawText(ctx, 'SORTEO VINCULADO', X + 26, currentY + 28, {
    font: '700 11px system-ui, sans-serif',
    color: '#9EB3A7',
  });

  const raffleFit = fitText(
    ctx,
    data.raffleTitle,
    450,
    19,
    'system-ui, sans-serif',
    'bold',
    14
  );
  drawText(ctx, data.raffleTitle, X + 26, currentY + 58, {
    font: raffleFit.font,
    color: '#F4EFE4',
  });

  // Lado derecho
  drawText(ctx, 'LOTERÍA DE REFERENCIA', X + CW - 26, currentY + 28, {
    font: '700 11px system-ui, sans-serif',
    color: '#9EB3A7',
    align: 'right',
  });

  drawText(ctx, data.lotteryReference, X + CW - 26, currentY + 56, {
    font: 'bold 17px system-ui, sans-serif',
    color: '#FBBF24',
    align: 'right',
  });

  const drawDateText = data.drawDate
    ? `Sorteo Oficial: ${formatDateSafe(data.drawDate)}`
    : 'Juega con las últimas 3 cifras de la Lotería oficial';
  drawText(ctx, drawDateText, X + CW - 26, currentY + 75, {
    font: '500 12px system-ui, sans-serif',
    color: '#9EB3A7',
    align: 'right',
  });

  currentY += raffleCardH + 24;

  // 7. Sección de Números Adquiridos (Dinámica y Completa)
  drawSectionHeader(
    ctx,
    `NÚMEROS ASIGNADOS (${data.ticketNumbers.length})`,
    'Numeración Oficial de 3 Cifras • 100% Garantizados',
    X,
    currentY,
    CW
  );
  currentY += 20;

  currentY = drawTicketGrid(ctx, data.ticketNumbers, X, currentY, CW);
  currentY += 24;

  // 8. Resumen Financiero Total
  const summaryH = 92;
  const unitPrice =
    data.unitPrice ??
    (data.ticketCount > 0 ? Math.round(data.totalAmount / data.ticketCount) : 0);

  drawRoundedRect(
    ctx,
    X,
    currentY,
    CW,
    summaryH,
    14,
    '#0D2218',
    'rgba(229, 139, 36, 0.35)',
    1.5
  );

  // Métrica 1: Cantidad
  const sumCol1X = X + 28;
  drawText(ctx, 'CANTIDAD DE BOLETOS', sumCol1X, currentY + 28, {
    font: '700 11px system-ui, sans-serif',
    color: '#9EB3A7',
  });
  drawText(
    ctx,
    `${data.ticketCount} ${data.ticketCount === 1 ? 'Boleto' : 'Boletos'}`,
    sumCol1X,
    currentY + 62,
    {
      font: 'bold 20px system-ui, sans-serif',
      color: '#F4EFE4',
    }
  );

  // Métrica 2: Valor Unitario
  const sumCol2X = X + Math.floor(CW / 3) + 20;
  drawText(ctx, 'VALOR POR BOLETO', sumCol2X, currentY + 28, {
    font: '700 11px system-ui, sans-serif',
    color: '#9EB3A7',
  });
  drawText(ctx, formatCOP(unitPrice), sumCol2X, currentY + 62, {
    font: "bold 20px 'JetBrains Mono', monospace",
    color: '#F4EFE4',
  });

  // Métrica 3: Total Cancelado
  const sumCol3X = X + Math.floor((2 * CW) / 3) + 15;
  drawText(ctx, 'TOTAL CANCELADO', sumCol3X, currentY + 28, {
    font: '700 11px system-ui, sans-serif',
    color: '#9EB3A7',
  });
  drawText(ctx, formatCOP(data.totalAmount), sumCol3X, currentY + 64, {
    font: "bold 28px 'JetBrains Mono', monospace",
    color: '#FBBF24',
  });

  currentY += summaryH + 20;

  // 9. Área de Verificación en Línea
  const verifyH = 114;
  const verifyUrl = getVerificationUrl(data.orderReference);

  drawRoundedRect(
    ctx,
    X,
    currentY,
    CW,
    verifyH,
    14,
    'rgba(27, 74, 46, 0.32)',
    'rgba(229, 139, 36, 0.38)',
    1.2
  );

  drawText(ctx, '🔒 VERIFICA TU COMPRA EN LÍNEA', X + 26, currentY + 28, {
    font: "bold 13px 'Outfit', system-ui, sans-serif",
    color: '#34D399',
  });

  drawText(
    ctx,
    'Consulta y valida el estado oficial de tus números en cualquier momento en:',
    X + 26,
    currentY + 52,
    {
      font: '500 14px system-ui, sans-serif',
      color: '#F4EFE4',
    }
  );

  const urlFit = fitText(
    ctx,
    verifyUrl,
    CW - 52,
    16,
    "'JetBrains Mono', monospace",
    'bold',
    12
  );
  drawText(ctx, verifyUrl, X + 26, currentY + 80, {
    font: urlFit.font,
    color: '#FBBF24',
  });

  drawText(
    ctx,
    `Trazabilidad oficial • Clave de seguridad: ${data.orderReference} • Respaldo Manaure Vive`,
    X + 26,
    currentY + 101,
    {
      font: '500 11px system-ui, sans-serif',
      color: '#9EB3A7',
    }
  );

  currentY += verifyH + 24;

  // 10. Seguridad y Footer
  ctx.save();
  ctx.strokeStyle = 'rgba(156, 181, 171, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X, currentY);
  ctx.lineTo(X + CW, currentY);
  ctx.stroke();
  ctx.restore();
  currentY += 22;

  const supportRaw =
    data.supportPhone ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WHATSAPP_SUPPORT_NUMBER) ||
    '573001234567';
  const supportClean = supportRaw.replace(/^57/, '');

  drawText(
    ctx,
    `Soporte y Atención: WhatsApp +57 ${supportClean} • info@manaurevive.com`,
    W / 2,
    currentY,
    {
      font: '600 13px system-ui, sans-serif',
      color: '#F4EFE4',
      align: 'center',
    }
  );
  currentY += 22;

  drawText(
    ctx,
    'Este documento es un comprobante digital oficial emitido tras la validación y aprobación bancaria.',
    W / 2,
    currentY,
    {
      font: '500 12px system-ui, sans-serif',
      color: '#9EB3A7',
      align: 'center',
    }
  );
  currentY += 18;

  drawText(
    ctx,
    'Conserva este comprobante como respaldo oficial. Todos los boletos participan legítimamente en el sorteo.',
    W / 2,
    currentY,
    {
      font: '500 12px system-ui, sans-serif',
      color: '#9EB3A7',
      align: 'center',
    }
  );
  currentY += 22;

  drawText(
    ctx,
    `© ${new Date().getFullYear()} Manaure Vive • Turismo, Cultura y Sorteos Oficiales de La Guajira`,
    W / 2,
    currentY,
    {
      font: '600 12px system-ui, sans-serif',
      color: '#E58B24',
      align: 'center',
    }
  );

  return canvas;
}

/**
 * Descarga el comprobante digital como imagen PNG de alta resolución.
 */
export async function downloadDigitalReceiptImage(
  data: DigitalReceiptData,
  filename?: string
): Promise<void> {
  const canvas = await generateDigitalReceiptCanvas(data);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('No se pudo generar la imagen del comprobante.');

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `Comprobante_ManaureVive_${data.orderReference}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Abre la ventana de impresión optimizada para guardar como PDF.
 */
export async function printOrSavePdfDigitalReceipt(data: DigitalReceiptData): Promise<void> {
  const canvas = await generateDigitalReceiptCanvas(data);
  const dataUrl = canvas.toDataURL('image/png');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error(
      'Las ventanas emergentes están bloqueadas en tu navegador. Por favor permítelas para descargar el PDF.'
    );
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Comprobante Oficial Manaure Vive - ${data.orderReference}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body {
            margin: 0;
            padding: 0;
            background-color: #06130B;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          img {
            max-width: 100%;
            height: auto;
            max-height: 96vh;
            object-fit: contain;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
          }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" alt="Comprobante Digital Oficial Manaure Vive" />
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.focus();
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Genera el texto y enlace optimizado para compartir el comprobante por WhatsApp.
 */
export function getWhatsAppShareText(data: DigitalReceiptData): string {
  const nums = data.ticketNumbers.map((n) => `#${formatTicketNumber(n)}`).join(', ');
  const total = formatCOP(data.totalAmount);
  const verifyUrl = getVerificationUrl(data.orderReference);

  return (
    `🎟️ *COMPROBANTE OFICIAL MANAURE VIVE*\n\n` +
    `✅ *Estado:* Pago Confirmado y Boletos Garantizados\n` +
    `📌 *Orden:* ${data.orderReference}\n` +
    `👤 *Comprador:* ${data.buyerName}\n` +
    `🎟️ *Números:* ${nums}\n` +
    `💰 *Total:* ${total}\n` +
    `🏆 *Sorteo:* ${data.raffleTitle} (${data.lotteryReference})\n\n` +
    `🔍 *Verifica tu comprobante oficial en vivo aquí:*\n` +
    `${verifyUrl}`
  );
}
