import sharp from 'sharp';
import path from 'path';

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, 'assets-source', 'imagnes a utilizar');
const docsDir = path.join(rootDir, 'docs', 'imagenes');

async function generateComparisons() {
  console.log('Regenerating before/after comparisons...');

  // 1. Cuatrimoto Topiario before/after (zoom on badge region)
  const origCorner = await sharp(path.join(sourceDir, 'cuatrimoto-topiario.jpg'))
    .extract({ left: 500, top: 0, width: 250, height: 180 })
    .toBuffer();

  const skyPatch = await sharp(path.join(sourceDir, 'cuatrimoto-topiario.jpg'))
    .extract({ left: 540, top: 0, width: 105, height: 75 })
    .toBuffer();

  const patchedFull = await sharp(path.join(sourceDir, 'cuatrimoto-topiario.jpg'))
    .composite([{ input: skyPatch, left: 645, top: 0 }])
    .toBuffer();

  const patchedCorner = await sharp(patchedFull)
    .extract({ left: 500, top: 0, width: 250, height: 180 })
    .toBuffer();

  const svgBadgeComparison = `
    <svg width="560" height="260" xmlns="http://www.w3.org/2000/svg">
      <style>
        .label { font-family: sans-serif; font-size: 14px; font-weight: bold; fill: #ffffff; }
        .sub { font-family: sans-serif; font-size: 11px; fill: #9cb5ab; }
      </style>
      <rect width="560" height="260" fill="#0f1f16" rx="8"/>
      <text x="20" y="30" class="label">ANTES: Con Badge "4/5" Instagram</text>
      <text x="290" y="30" class="label">DESPUES: Parche de Cielo Vecino</text>
      <text x="20" y="245" class="sub">Archivo: cuatrimoto-topiario.jpg (esquina sup. der.)</text>
      <text x="290" y="245" class="sub">Sin perdida de textura ni difuminado artificial</text>
    </svg>
  `;

  await sharp(Buffer.from(svgBadgeComparison))
    .composite([
      { input: origCorner, left: 20, top: 45 },
      { input: patchedCorner, left: 290, top: 45 }
    ])
    .png()
    .toFile(path.join(docsDir, 'correccion-cuatrimoto-topiario-antes-despues.png'));

  console.log('Saved updated correccion-cuatrimoto-topiario-antes-despues.png');
}

generateComparisons();
