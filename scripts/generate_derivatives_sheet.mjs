import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const rootDir = process.cwd();
const manifestPath = path.join(rootDir, 'docs', 'imagenes', 'image-manifest.json');
const outputPath = path.join(rootDir, 'docs', 'imagenes', 'contact-sheet-derivados.png');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

async function generateDerivativesSheet() {
  console.log('Generating contact-sheet-derivados.png...');

  const itemsHtml = manifest.images.map((img, idx) => {
    const num = (idx + 1).toString().padStart(2, '0');
    // Escoger la mejor variante representativa (preferir 640w o 480w)
    const bestVar = img.variants.find(v => v.width === 640 || v.width === 480) || img.variants[0];
    const diskPath = path.join(rootDir, 'public', bestVar.webp.url.replace(/^\//, ''));
    const b64 = 'data:image/webp;base64,' + fs.readFileSync(diskPath).toString('base64');
    const webpKb = (bestVar.webp.bytes / 1024).toFixed(1);
    const jpgKb = (bestVar.jpg.bytes / 1024).toFixed(1);

    return `
      <div class="card">
        <div class="card-header">
          <span class="badge-num">${num}</span>
          <span class="card-name" title="${img.id}">${img.id}</span>
        </div>
        <div class="img-box">
          <img src="${b64}" alt="${img.id}" />
          <span class="dim-tag">${bestVar.ratio} | ${bestVar.width}×${bestVar.height}</span>
        </div>
        <div class="card-footer">
          <div class="meta-row">
            <span class="cat-pill">${img.category}</span>
            <span class="var-count">${img.variants.length} variantes</span>
          </div>
          <div class="weight-row">
            <span class="webp-badge">WebP: ${webpKb} KB</span>
            <span class="jpg-badge">JPG: ${jpgKb} KB</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: #0b1410;
          color: #e6ede8;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          padding: 40px;
          width: 2500px;
        }
        .header {
          margin-bottom: 30px;
          border-bottom: 2px solid #244833;
          padding-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .title-h1 {
          font-size: 32px;
          font-weight: 800;
          color: #f5a623;
          letter-spacing: -0.5px;
        }
        .subtitle {
          font-size: 16px;
          color: #9cb5ab;
          margin-top: 6px;
        }
        .summary-stats {
          text-align: right;
          font-size: 14px;
          color: #cadfd4;
          line-height: 1.5;
        }
        .summary-stats strong { color: #f5a623; }
        .grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 24px;
        }
        .card {
          background-color: #132219;
          border: 1px solid #233e2f;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 8px 20px rgba(0,0,0,0.4);
        }
        .card-header {
          padding: 10px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: #0f1c15;
          border-bottom: 1px solid #233e2f;
        }
        .badge-num {
          background: #f5a623;
          color: #0d1612;
          font-weight: 800;
          font-size: 14px;
          padding: 2px 8px;
          border-radius: 6px;
        }
        .card-name {
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-family: monospace;
        }
        .img-box {
          position: relative;
          height: 290px;
          background-color: #080c0a;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .img-box img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        .dim-tag {
          position: absolute;
          bottom: 8px;
          right: 8px;
          background: rgba(0,0,0,0.8);
          color: #e6ede8;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 4px;
          font-family: monospace;
        }
        .card-footer {
          padding: 12px 14px;
          background: #132219;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .cat-pill {
          background: #1b3827;
          color: #72d99d;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 4px;
          text-transform: uppercase;
        }
        .var-count {
          font-size: 12px;
          color: #8da698;
          font-family: monospace;
        }
        .weight-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .webp-badge {
          background: rgba(36, 106, 64, 0.4);
          color: #72d99d;
          border: 1px solid #246a40;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 6px;
          border-radius: 4px;
          font-family: monospace;
        }
        .jpg-badge {
          background: rgba(245, 166, 35, 0.15);
          color: #f5a623;
          border: 1px solid rgba(245, 166, 35, 0.4);
          font-size: 11px;
          font-weight: 700;
          padding: 3px 6px;
          border-radius: 4px;
          font-family: monospace;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="title-h1">Manaure Vive – Banco de Imágenes Derivadas</h1>
          <div class="subtitle">Hoja de Contacto de Derivados Optimizados (WebP + JPG MozJPEG, sRGB, metadatos eliminados)</div>
        </div>
        <div class="summary-stats">
          <div>Activos procesados: <strong>25 canónicos</strong> | Total archivos derivados: <strong>338</strong></div>
          <div>Formato principal: <strong>WebP</strong> | Respaldo: <strong>JPG progresivo</strong></div>
          <div>Open Graph: <strong>1200×630 baseline</strong> | Generado: <strong>${manifest.generatedAt.slice(0, 10)}</strong></div>
        </div>
      </div>
      <div class="grid">
        ${itemsHtml}
      </div>
    </body>
    </html>
  `;

  const htmlPath = path.join(rootDir, 'scratch_derivatives.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  console.log('Launching headless Chrome to capture contact-sheet-derivados.png...');
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9253',
    '--window-size=2500,3200',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const res = await fetch('http://127.0.0.1:9253/json');
    const tabs = await res.json();
    const tab = tabs.find(t => t.type === 'page') || tabs[0];
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));

    let id = 1;
    const send = (method, params = {}) => new Promise(resolve => {
      const msgId = id++;
      const h = (e) => {
        const d = JSON.parse(e.data);
        if (d.id === msgId) {
          ws.removeEventListener('message', h);
          resolve(d.result);
        }
      };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

    await send('Page.enable');
    const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
    await send('Page.navigate', { url: fileUrl });
    await new Promise(r => setTimeout(r, 3000));

    const docLayout = await send('Runtime.evaluate', {
      expression: '({ width: document.body.scrollWidth, height: document.body.scrollHeight })',
      returnByValue: true
    });

    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: 2500,
        height: docLayout.result.value.height,
        scale: 1
      }
    });

    const buffer = Buffer.from(screenshot.data, 'base64');
    fs.writeFileSync(outputPath, buffer);
    console.log('Saved contact-sheet-derivados.png successfully:', buffer.length, 'bytes');

    ws.close();
    fs.unlinkSync(htmlPath);
  } catch (e) {
    console.error(e);
  } finally {
    chrome.kill();
  }
}

generateDerivativesSheet();

