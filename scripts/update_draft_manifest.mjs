import fs from 'fs';
import path from 'path';

const manifestPath = path.join(process.cwd(), 'docs', 'imagenes', 'image-manifest.draft.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Actualizar con las 10 decisiones aprobadas por el usuario
manifest.forEach(item => {
  if (item.source.file === 'fogata-circulo-piedra.jpg') {
    item.decision = 'descartar';
    item.aliasOf = 'fogata-casa-de-vidrio';
    item.notes = 'DESCARTADO (Decisión 1 aprobada): Duplicado cuasi-idéntico de fogata-casa-de-vidrio.jpg.';
  } else if (item.source.file === 'cuatrimoto-topiario.jpg') {
    item.decision = 'descartar';
    item.aliasOf = 'cuatrimoto-mirador';
    item.notes = 'DESCARTADO (Decisión 2 aprobada): Duplicado con artefacto de Instagram "4/5". Usar cuatrimoto-mirador.jpg.';
  } else if (item.source.file === 'gastronomia-local.jpg') {
    item.decision = 'usar-con-correccion';
    item.notes = 'CORRECCIÓN APROBADA (Decisión 3): Escindida en dos activos independientes: gastronomia-arepa y gastronomia-plato.';
  } else if (item.source.file === 'registro-fotografico.jpg') {
    item.id = 'serrania-valle-nubes';
    item.category = 'serrania';
    item.aliasOf = 'registro-fotografico';
    item.decision = 'usar';
    item.notes = 'REASIGNADO Y RENOMBRADO (Decisión 4 aprobada): Paisaje de la Serranía del Perijá con nubes bajas. Nombre anterior registrado como alias.';
  } else if (item.source.file === 'og-image.jpg') {
    item.decision = 'usar';
    item.uses = ['hero', 'og-image', 'galeria'];
    item.notes = 'MÁSTER HERO Y OPEN GRAPH (Decisión 5 y 10 aprobada): Fuente nativa 1920x1080 16:9.';
  } else if (item.source.file === 'gastronomia-casa-arepas.jpg') {
    item.decision = 'usar';
    item.uses = ['tarjeta-premio', 'galeria'];
    item.notes = 'ASIGNADO A TARJETA GASTRONÓMICA (Decisión 6 aprobada): Aliado oficial La Casa de las Arepas.';
  } else if (item.source.file === 'glamping-mashiramo-domo.jpg') {
    item.decision = 'reservar';
    item.uses = ['galeria'];
    item.notForUse = ['hero', 'tarjeta-premio', 'og-image'];
    item.notes = 'RESERVADO (Decisión 7 aprobada): Baja altura (292 px) insuficiente para tarjetas verticales.';
  } else if (item.source.file === 'serrania-perija-panoramica.jpg') {
    item.decision = 'reservar';
    item.aliasOf = 'og-image';
    item.notes = 'RESERVADO: Misma escena que og-image.jpg. Se usa og-image como máster canónico.';
  } else if (['cuatrimoto-mirador.jpg', 'parapente-tandem-canon.jpg'].includes(item.source.file)) {
    item.risks.notes += ' Autorización de imagen confirmada por el usuario (Decisión 9 aprobada).';
  }
});

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log('image-manifest.draft.json updated with approved user decisions.');

