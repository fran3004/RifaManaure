import { formatCOP, formatTicketNumber } from '@/lib/utils';
import { logoPrincipalCompleto } from '@/assets/assets';

const logoImgSrc = logoPrincipalCompleto.master;

export interface DigitalReceiptData {
  orderReference: string;
  orderStatus: 'paid' | 'completed';
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
}

/**
 * Carga una imagen en una promesa para renderizado seguro en Canvas.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar el logo para el comprobante'));
    img.src = src;
  });
}

/**
 * Genera el Canvas del Comprobante Digital Oficial con diseño de alta resolución (1080x1440).
 */
export async function generateDigitalReceiptCanvas(
  data: DigitalReceiptData
): Promise<HTMLCanvasElement> {
  // Validación estricta de seguridad
  if (data.orderStatus !== 'paid' && data.orderStatus !== 'completed') {
    throw new Error(
      'Solo se permite generar comprobantes digitales para órdenes en estado PAGADO / CONFIRMADO.'
    );
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar el contexto 2D de Canvas.');

  const W = 1080;
  const H = 1440;
  canvas.width = W;
  canvas.height = H;

  // 1. Fondo elegante con degradado oscuro
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#0a1712');
  bgGrad.addColorStop(0.5, '#11221c');
  bgGrad.addColorStop(1, '#08120e');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Marco exterior decorativo dorado
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, W - 72, H - 72);

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(46, 46, W - 92, H - 92);

  // 3. Encabezado / Logo
  try {
    const logo = await loadImage(logoImgSrc);
    const logoW = 260;
    const logoH = (logo.height / logo.width) * logoW;
    ctx.drawImage(logo, (W - logoW) / 2, 70, logoW, logoH);
  } catch {
    // Fallback tipográfico si la imagen no carga
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 38px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MANAURE VIVE', W / 2, 110);
  }

  // 4. Insignia: CERTIFICADO OFICIAL DE PAGO
  const badgeY = 220;
  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  const badgeW = 440;
  const badgeH = 46;
  const badgeX = (W - badgeW) / 2;

  // Dibujar rectángulo redondeado
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 23);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('✓ COMPROBANTE OFICIAL DE PAGO', W / 2, badgeY + 30);

  // 5. Caja de Referencia y Estado
  const boxY = 295;
  ctx.fillStyle = '#162b23';
  ctx.strokeStyle = 'rgba(156, 181, 171, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(70, boxY, W - 140, 150, 16);
  ctx.fill();
  ctx.stroke();

  // Referencia
  ctx.fillStyle = '#9cb5ab';
  ctx.font = '600 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('REFERENCIA DE ORDEN:', 105, boxY + 45);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 36px monospace';
  ctx.fillText(data.orderReference, 105, boxY + 90);

  // Estado
  ctx.fillStyle = '#9cb5ab';
  ctx.font = '600 18px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('ESTADO:', W - 105, boxY + 45);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('PAGADO Y CONFIRMADO', W - 105, boxY + 85);

  ctx.fillStyle = '#5e7a6f';
  ctx.font = '16px sans-serif';
  ctx.fillText(
    `Emitido: ${new Date(data.createdAt).toLocaleDateString('es-CO')}`,
    W - 105,
    boxY + 118
  );

  // 6. Detalles del Comprador y del Sorteo
  const infoY = 475;
  ctx.fillStyle = '#11221c';
  ctx.strokeStyle = 'rgba(156, 181, 171, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(70, infoY, W - 140, 160, 16);
  ctx.fill();
  ctx.stroke();

  // Comprador
  ctx.fillStyle = '#9cb5ab';
  ctx.font = '600 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TITULAR REGISTRADO:', 105, infoY + 40);

  ctx.fillStyle = '#f3f7f5';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(data.buyerName, 105, infoY + 75);

  ctx.fillStyle = '#5e7a6f';
  ctx.font = '16px sans-serif';
  ctx.fillText(`Doc: ${data.buyerDocumentMasked}`, 105, infoY + 115);

  // Sorteo
  ctx.fillStyle = '#9cb5ab';
  ctx.font = '600 16px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('SORTEO / LOTERÍA:', W - 105, infoY + 40);

  ctx.fillStyle = '#f3f7f5';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(data.lotteryReference, W - 105, infoY + 75);

  if (data.drawDate) {
    ctx.fillStyle = '#f59e0b';
    ctx.font = '600 16px sans-serif';
    ctx.fillText(
      `Fecha Sorteo: ${new Date(data.drawDate).toLocaleDateString('es-CO')}`,
      W - 105,
      infoY + 115
    );
  }

  // 7. Sección de Boletos Asignados
  const ticketsY = 665;
  ctx.fillStyle = '#f3f7f5';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`NÚMEROS ASIGNADOS (${data.ticketNumbers.length})`, 75, ticketsY);

  ctx.fillStyle = '#9cb5ab';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Numeración de 3 Cifras', W - 75, ticketsY);

  // Grid de números (hasta 20 números por comprobante en columnas)
  const gridY = ticketsY + 25;
  const chipW = 160;
  const chipH = 65;
  const gapX = 25;
  const gapY = 20;
  const cols = 5;

  const displayNumbers = data.ticketNumbers.slice(0, 20);

  displayNumbers.forEach((num, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = 75 + col * (chipW + gapX);
    const y = gridY + row * (chipH + gapY);

    // Fondo chip
    ctx.fillStyle = '#0f291e';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, chipW, chipH, 10);
    ctx.fill();
    ctx.stroke();

    // Texto número
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(formatTicketNumber(num), x + chipW / 2, y + 44);
  });

  if (data.ticketNumbers.length > 20) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `+ ${data.ticketNumbers.length - 20} números adicionales en la orden`,
      W / 2,
      gridY + 280
    );
  }

  // 8. Resumen Financiero Total
  const totalY = 1040;
  ctx.fillStyle = '#162b23';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(70, totalY, W - 140, 110, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#9cb5ab';
  ctx.font = '600 20px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TOTAL CANCELADO:', 110, totalY + 65);

  ctx.fillStyle = '#f3f7f5';
  ctx.font = 'bold 44px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(formatCOP(data.totalAmount), W - 110, totalY + 70);

  // 9. Pie de Seguridad y Verificación
  const footerY = 1200;
  ctx.strokeStyle = 'rgba(156, 181, 171, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(70, footerY);
  ctx.lineTo(W - 70, footerY);
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MANAURE VIVE • PLATAFORMA OFICIAL DE TURISMO Y RIFAS', W / 2, footerY + 45);

  ctx.fillStyle = '#9cb5ab';
  ctx.font = '15px sans-serif';
  ctx.fillText(
    'Verifica la validez de este comprobante en: manaurevive.com/verificar',
    W / 2,
    footerY + 80
  );

  ctx.fillStyle = '#5e7a6f';
  ctx.font = '13px sans-serif';
  ctx.fillText(
    'Este documento es un comprobante digital de participación expedido tras la validación bancaria de la orden.',
    W / 2,
    footerY + 110
  );
  ctx.fillText(
    'Conserva este comprobante como respaldo oficial de tus números adquiridos.',
    W / 2,
    footerY + 130
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
    <html>
      <head>
        <title>Comprobante Oficial - ${data.orderReference}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            background-color: #08120e;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            min-height: 100dvh;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          img {
            max-width: 100%;
            height: auto;
            max-height: 98vh;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" alt="Comprobante Digital Oficial" />
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 350);
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

  return (
    `🎟️ *COMPROBANTE OFICIAL MANAURE VIVE*\n\n` +
    `✅ *Estado:* Pago Confirmado y Boletos Garantizados\n` +
    `📌 *Orden:* ${data.orderReference}\n` +
    `👤 *Comprador:* ${data.buyerName}\n` +
    `🎟️ *Números:* ${nums}\n` +
    `💰 *Total:* ${total}\n` +
    `🏆 *Sorteo:* ${data.raffleTitle} (${data.lotteryReference})\n\n` +
    `🔍 *Verifica tu comprobante oficial en vivo aquí:*\n` +
    `https://manaurevive.com/verificar?ref=${data.orderReference}`
  );
}
