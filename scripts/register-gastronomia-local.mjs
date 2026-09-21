import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const manifestTsPath = path.join(rootDir, 'src', 'types', 'image-manifest.ts');
let content = fs.readFileSync(manifestTsPath, 'utf8');

const gastronomiaLocalEntry = `  "gastronomia-local": {
    "id": "gastronomia-local",
    "category": "gastronomia",
    "sourceFile": "gastronomia-local.jpg",
    "nativeWidth": 710,
    "nativeHeight": 960,
    "alt": "Degustación de arepa rellena artesanal y plato típico tradicional con arroz, pollo en salsa, yuca y ensalada",
    "caption": "Experiencia gastronómica tradicional en La Casa de las Arepas, Manaure.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.5
    },
    "dominantColor": "#23302a",
    "lqip": "data:image/webp;base64,UklGRswAAABXRUJQVlA4IMAAAABQBQCdASoUABsAPzmMwVcvKSejqAqp4CcJbACuHA+DNztXE+Pv696N5lEDokogpkjBigAA9Y+cLWzYqHaTDvzwxXG1JpT9ZnbwCi8jo5QfWyBr+X0P+DH1+WXyEiYH2oTBUKdbef8iGlpW7rtjt+o7kjhPGkZ3owf9v9a1DsV+h27OwrRf1aVW7XJvG1PbC/rvs3nAabGULe3TgQ+cyLoX1bgRWyeGxfYA5u2tdYmv63WOHuQEvhrHH5fTPjqMYAA=",
    "variants": [
      {
        "role": "tarjeta",
        "ratio": "4x5",
        "width": 710,
        "height": 960,
        "webp": {
          "url": "/images/rifa/gastronomia/gastronomia-local-710w.webp",
          "bytes": 68000,
          "quality": 85
        },
        "jpg": {
          "url": "/images/rifa/gastronomia/gastronomia-local-710w.jpg",
          "bytes": 95000,
          "quality": 85
        }
      },
      {
        "role": "tarjeta",
        "ratio": "4x5",
        "width": 480,
        "height": 649,
        "webp": {
          "url": "/images/rifa/gastronomia/gastronomia-local-480w.webp",
          "bytes": 42000,
          "quality": 85
        },
        "jpg": {
          "url": "/images/rifa/gastronomia/gastronomia-local-480w.jpg",
          "bytes": 62000,
          "quality": 85
        }
      },
      {
        "role": "lightbox",
        "ratio": "full",
        "width": 710,
        "height": 960,
        "webp": {
          "url": "/images/rifa/gastronomia/gastronomia-local.webp",
          "bytes": 68000,
          "quality": 85
        },
        "jpg": {
          "url": "/images/rifa/gastronomia/gastronomia-local.jpg",
          "bytes": 95000,
          "quality": 85
        }
      }
    ]
  },`;

// Add gastronomia-local if not present
if (!content.includes('"gastronomia-local": {')) {
  content = content.replace(
    'export const imageManifest: Record<string, ImageEntry> = {',
    'export const imageManifest: Record<string, ImageEntry> = {\n' + gastronomiaLocalEntry
  );
}

// Add aliases
if (!content.includes('"gastronomia-casa-arepas": "gastronomia-local"')) {
  content = content.replace(
    'export const imageAliases: Record<string, string> = {',
    `export const imageAliases: Record<string, string> = {
  "gastronomia-casa-arepas": "gastronomia-local",
  "gastronomia-arepa": "gastronomia-local",
  "gastronomia-plato": "gastronomia-local",`
  );
}

fs.writeFileSync(manifestTsPath, content, 'utf8');
console.log('✅ image-manifest.ts actualizado');

