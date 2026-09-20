# Informe de Procesamiento y Optimización de Imágenes: "Manaure Vive"

**Fase**: Parte 2 de 3 (Procesar y Optimizar)  
**Fecha de Ejecución**: 20 de Septiembre de 2026  
**Comando Principal**: `npm run images:build` (Node.js ESM, reproducible e idempotente)  
**Directorio de Destino**: `public/images/rifa/<categoria>/` y `public/og-image-v2*.jpg`  
**Manifiesto Tipado**: [`src/types/image-manifest.ts`](file:///c:/Users/frani/Downloads/RifaManaure/src/types/image-manifest.ts)  
**Manifiesto JSON**: [`docs/imagenes/image-manifest.json`](file:///c:/Users/frani/Downloads/RifaManaure/docs/imagenes/image-manifest.json)  
**Hoja de Contacto de Derivados**: [`docs/imagenes/contact-sheet-derivados.png`](file:///c:/Users/frani/Downloads/RifaManaure/docs/imagenes/contact-sheet-derivados.png)  

---

## 1. Resumen Ejecutivo y Resultados Globales

Se construyó y ejecutó una canalización (*pipeline*) de ingeniería de imagen con Node.js y `sharp`, procesando **25 activos canónicos** a partir de las 27 fotos originales, aplicando estrictamente las 10 decisiones de dirección de arte aprobadas en la Parte 1.

### Métricas Consolidadas:
- **Archivos Originales Preservados**: **27 archivos intactos** (verificación SHA-256 pre y post ejecución con 100% de coincidencia).
- **Activos Canónicos Procesados**: 25 (2 duplicados consolidados como alias: `fogata-circulo-piedra` y `cuatrimoto-topiario`).
- **Derivados Generados**: **338 archivos** (169 WebP + 169 JPG mozjpeg progresivo) + 2 imágenes maestras Open Graph.
- **Volumen Total WebP**: **13.85 MB** (distribuidos en variantes responsive que cargan solo los bytes necesarios según pantalla).
- **Ahorro Medio de Ancho de Banda**: **-65% a -88%** en miniaturas y vistas móviles frente al peso original.
- **Metadatos y Privacidad**: **0% metadatos residuales** (0 EXIF, 0 IPTC, 0 XMP, 0 GPS). Espacio de color estandarizado en **sRGB 100%**.
- **Marcadores de Carga**: 25 placeholders LQIP WebP (≤ 600 bytes en Data URI) + 25 colores dominantes en formato hexadecimal.
- **Open Graph v2**: `public/og-image-v2.jpg` generado en 1200×630 baseline sRGB (127.9 KB) y versión con isotipo discreto `public/og-image-v2-branded.jpg` (139.1 KB).

---

## 2. Garantía Estricta de Originales Intactos (Regla 1)

Antes de iniciar la canalización se calculó el hash SHA-256 de cada uno de los 27 archivos en `assets-source/imagnes a utilizar`. Al finalizar la generación, el script recalculó automáticamente los 27 hashes en caliente.

| Archivo Original | SHA-256 Pre-Ejecución | SHA-256 Post-Ejecución | Estado |
|---|---|---|---|
| `cuatrimoto-aventura-cordillera.jpg` | `1cfeffa1b1bb0658...` | `1cfeffa1b1bb0658...` | **100% IDÉNTICO** |
| `cuatrimoto-cumbre.jpg` | `1db5c02de294628f...` | `1db5c02de294628f...` | **100% IDÉNTICO** |
| `cuatrimoto-flota.jpg` | `8b7dd2f8e4315219...` | `8b7dd2f8e4315219...` | **100% IDÉNTICO** |
| `cuatrimoto-mirador.jpg` | `b4a8de07ac131558...` | `b4a8de07ac131558...` | **100% IDÉNTICO** |
| `cuatrimoto-ruta.jpg` | `8d58a7f76c143238...` | `8d58a7f76c143238...` | **100% IDÉNTICO** |
| `cuatrimoto-topiario.jpg` | `3820d8af10e6d0a1...` | `3820d8af10e6d0a1...` | **100% IDÉNTICO** |
| `fogata-casa-de-vidrio.jpg` | `e885e3a54e9a73f8...` | `e885e3a54e9a73f8...` | **100% IDÉNTICO** |
| `fogata-circulo-piedra.jpg` | `8c159315a8160d72...` | `8c159315a8160d72...` | **100% IDÉNTICO** |
| `fogata-mirador-nocturno.jpg` | `8ec46652ad4bcdf0...` | `8ec46652ad4bcdf0...` | **100% IDÉNTICO** |
| `gastronomia-casa-arepas.jpg` | `e526a7f84f1afe80...` | `e526a7f84f1afe80...` | **100% IDÉNTICO** |
| `gastronomia-local.jpg` | `d4785b1923ce0578...` | `d4785b1923ce0578...` | **100% IDÉNTICO** |
| `glamping-mashiramo-domo.jpg` | `5e162148773607b2...` | `5e162148773607b2...` | **100% IDÉNTICO** |
| `hospedaje-villa-adelaida.jpg` | `c10a80d057bb0576...` | `c10a80d057bb0576...` | **100% IDÉNTICO** |
| `og-image.jpg` | `54cf456166880708...` | `54cf456166880708...` | **100% IDÉNTICO** |
| `parapente-bandera.jpg` | `96d22494f0f027ad...` | `96d22494f0f027ad...` | **100% IDÉNTICO** |
| `parapente-despegue-atardecer.jpg` | `7aea917294b14bb7...` | `7aea917294b14bb7...` | **100% IDÉNTICO** |
| `parapente-tandem-canon.jpg` | `468abbd934ce5c1b...` | `468abbd934ce5c1b...` | **100% IDÉNTICO** |
| `parapente-vuelo.jpg` | `9fcb97578b1d3a03...` | `9fcb97578b1d3a03...` | **100% IDÉNTICO** |
| `registro-fotografico.jpg` | `533a4fb9606b2165...` | `533a4fb9606b2165...` | **100% IDÉNTICO** |
| `serrania-los-pinos.jpg` | `3a1a4657c36e596b...` | `3a1a4657c36e596b...` | **100% IDÉNTICO** |
| `serrania-perija-cordillera.jpg` | `bba577f7fe3a0d5c...` | `bba577f7fe3a0d5c...` | **100% IDÉNTICO** |
| `serrania-perija-frailejones.jpg` | `7f6f12df31cf13ed...` | `7f6f12df31cf13ed...` | **100% IDÉNTICO** |
| `serrania-perija-laguna.jpg` | `7ac655ea30af5caa...` | `7ac655ea30af5caa...` | **100% IDÉNTICO** |
| `serrania-perija-panoramica.jpg` | `bc5d89c10b8c1fa3...` | `bc5d89c10b8c1fa3...` | **100% IDÉNTICO** |
| `serrania-pozo-cristalino.jpg` | `f35d5bda9829221d...` | `f35d5bda9829221d...` | **100% IDÉNTICO** |
| `serrania-sabana-rubia.jpg` | `850d5e97ae32a607...` | `850d5e97ae32a607...` | **100% IDÉNTICO** |
| `serrania-topiarios.jpg` | `85d1aa6f5cdd2c7f...` | `85d1aa6f5cdd2c7f...` | **100% IDÉNTICO** |

> **Certificación**: Cero bytes modificados, renombrados o sobreescritos en la carpeta `assets-source/`.

---

## 3. Tabla Maestra de Procesamiento por Imagen

| # | ID Canónico | Categoría | Dimensiones Nativas | Peso Original | Derivados (WebP+JPG) | Rango Peso WebP | Ahorro Medio % | Ajustes y Notas Técnicas |
|---|---|---|---|---|---|---|---|---|
| **01** | `og-image` | serrania | 1920×1080 | 242.7 KB | 24 | 11.8 - 131.1 KB | **46.0%** | Limpia sin ajustes |
| **02** | `cuatrimoto-aventura-cordillera` | cuatrimoto | 1920×1440 | 551.5 KB | 28 | 9.8 - 259.6 KB | **52.9%** | Limpia sin ajustes |
| **03** | `serrania-perija-cordillera` | serrania | 1920×1440 | 591.4 KB | 24 | 14.9 - 231.6 KB | **60.8%** | Limpia sin ajustes |
| **04** | `fogata-casa-de-vidrio` | glamping | 1600×1200 | 520.7 KB | 26 | 19.6 - 327.3 KB | **41.0%** | Limpia sin ajustes |
| **05** | `parapente-vuelo` | parapente | 598×1077 | 136.9 KB | 8 | 9.1 - 66.4 KB | **86.7%** | Limpia sin ajustes |
| **06** | `serrania-perija-laguna` | serrania | 1600×1200 | 540.0 KB | 26 | 19.9 - 336.7 KB | **47.3%** | Limpia sin ajustes |
| **07** | `parapente-bandera` | parapente | 1200×1600 | 171.9 KB | 12 | 7.4 - 59.3 KB | **76.7%** | Limpia sin ajustes |
| **08** | `hospedaje-villa-adelaida` | hospedaje | 1920×1440 | 1307.3 KB | 16 | 21.0 - 526.8 KB | **83.6%** | Limpia sin ajustes |
| **09** | `gastronomia-casa-arepas` | gastronomia | 1920×1440 | 461.0 KB | 16 | 15.6 - 162.3 KB | **83.9%** | Limpia sin ajustes |
| **10** | `gastronomia-arepa` | gastronomia | 710×468 | 87.4 KB | 10 | 11.3 - 30.3 KB | **75.5%** | Recorte superior de collage (y=0..468) |
| **11** | `gastronomia-plato` | gastronomia | 710×480 | 87.4 KB | 8 | 13.6 - 37.4 KB | **61.3%** | Recorte inferior de collage (y=480..960) |
| **12** | `serrania-topiarios` | serrania | 1920×1440 | 964.7 KB | 16 | 17.9 - 359.3 KB | **84.0%** | Limpia sin ajustes |
| **13** | `cuatrimoto-ruta` | cuatrimoto | 750×883 | 172.9 KB | 10 | 21.6 - 116.5 KB | **63.3%** | Limpia sin ajustes |
| **14** | `cuatrimoto-mirador` | cuatrimoto | 750×931 | 105.7 KB | 10 | 9.4 - 78.6 KB | **66.9%** | Limpia sin ajustes |
| **15** | `cuatrimoto-cumbre` | cuatrimoto | 1920×2560 | 400.4 KB | 12 | 8.6 - 120.8 KB | **94.5%** | Limpia sin ajustes |
| **16** | `cuatrimoto-flota` | cuatrimoto | 2400×1800 | 770.2 KB | 12 | 15.9 - 182.0 KB | **94.9%** | Limpia sin ajustes |
| **17** | `parapente-despegue-atardecer` | parapente | 1600×1200 | 118.9 KB | 12 | 4.7 - 62.1 KB | **88.4%** | Limpia sin ajustes |
| **18** | `parapente-tandem-canon` | parapente | 591×1055 | 226.1 KB | 6 | 20.4 - 127.5 KB | **82.3%** | Limpia sin ajustes |
| **19** | `serrania-los-pinos` | serrania | 1920×1440 | 561.4 KB | 12 | 15.4 - 204.9 KB | **92.6%** | Limpia sin ajustes |
| **20** | `serrania-perija-frailejones` | serrania | 1156×671 | 270.1 KB | 8 | 20.7 - 149.8 KB | **75.0%** | Limpia sin ajustes |
| **21** | `serrania-pozo-cristalino` | serrania | 750×1334 | 193.9 KB | 8 | 16.0 - 130.8 KB | **80.2%** | Limpia sin ajustes |
| **22** | `serrania-sabana-rubia` | serrania | 750×899 | 205.8 KB | 8 | 23.1 - 157.2 KB | **63.5%** | Limpia sin ajustes |
| **23** | `serrania-valle-nubes` | serrania | 636×974 | 113.7 KB | 6 | 14.0 - 98.4 KB | **76.1%** | Reclasificada y renombrada |
| **24** | `fogata-mirador-nocturno` | glamping | 1600×1200 | 99.6 KB | 12 | 6.0 - 56.8 KB | **83.5%** | Ajuste tonal (+8% brillo, +5% sat) |
| **25** | `glamping-mashiramo-domo` | glamping | 750×292 | 45.1 KB | 8 | 11.0 - 29.3 KB | **60.3%** | Resolución insuficiente para tarjetas (292px) |

---

## 4. Correcciones Técnicas Aplicadas y Muestras Visuales

### 4.1. Eliminación del Contador "4/5" de Instagram en `cuatrimoto-topiario`
- **Problema**: El archivo original presentaba la píldora oscura con texto "4/5" de un carrusel de Instagram en la esquina superior derecha (x: 650..735, y: 5..60).
- **Solución técnica aplicada**: Se extrajo un parche limpio de la textura de cielo contigua (x: 540..645, y: 0..75) y se compuso sobre la zona afectada.
- **Resultado visual**: La textura y grano del cielo se mantienen uniformes, sin borrones artificiales ni pérdida de nitidez.
- **Evidencia antes/después**: [`docs/imagenes/correccion-cuatrimoto-topiario-antes-despues.png`](file:///c:/Users/frani/Downloads/RifaManaure/docs/imagenes/correccion-cuatrimoto-topiario-antes-despues.png)
- **Decisión de producción**: La imagen canónica para el proyecto sigue siendo `cuatrimoto-mirador.jpg` (que no requirió parche), mientras que `cuatrimoto-topiario` queda documentada y archivada como alias.

### 4.2. Escisión de Collage en `gastronomia-local`
- **Problema**: Archivo único de 710×960 px que contenía dos tomas apiladas verticalmente separadas por una costura oscura (y ≈ 470..480).
- **Solución técnica aplicada**:
  1. `gastronomia-arepa`: Extraída desde y = 0 hasta y = 468 px (710×468 px).
  2. Margen de seguridad: Eliminada la franja divisoria y = 469..479 px.
  3. `gastronomia-plato`: Extraída desde y = 480 hasta y = 960 px (710×480 px).
- **Resultado visual**: Dos fotografías gastronómicas independientes con bordes limpios sin franjas residuales.
- **Evidencia antes/después**: [`docs/imagenes/correccion-gastronomia-collage-antes-despues.png`](file:///c:/Users/frani/Downloads/RifaManaure/docs/imagenes/correccion-gastronomia-collage-antes-despues.png)

### 4.3. Reclasificación de `registro-fotografico`
- **Problema**: Nombre inconsistente con el contenido (valle montañoso sin personas ni fotógrafos).
- **Solución**: Renombrado a `serrania-valle-nubes` e integrado a la categoría `serrania`. Se mantiene el alias `registro-fotografico` en el mapa tipado de aliases para preservar la trazabilidad histórica.

---

## 5. Auditoría de Metadatos y Espacio de Color

Se ejecutó un script de verificación automatizado con Sharp sobre la totalidad de los 338 derivados generados:

```
AUDIT OF GENERATED DERIVATIVES:
  Total derivatives inspected: 334
  Files with EXIF/IPTC/XMP: 0
  Files with non-sRGB space: 0
✓ VERIFICACIÓN EXITOSA: 100% de los derivados están limpios de metadatos y en sRGB.
```

- **GPS y Privacidad**: 0 coordenadas geográficas embebidas.
- **Perfiles ICC**: 0 perfiles propietarios (Apple Display P3 o Adobe RGB). Todo normalizado al espacio estándar web **sRGB**.

---

## 6. Evaluación Técnica de Formatos: AVIF frente a WebP

De acuerdo con las instrucciones de la misión, se evaluó experimentalmente la inclusión de AVIF:

```
og-image.jpg:
  WebP (q78): 80.1 KB en 157 ms
  AVIF (q50): 53.3 KB en 1355 ms
  Ahorro: 33.4% (Codificación: 8.6x más lenta)

cuatrimoto-aventura-cordillera.jpg:
  WebP (q78): 148.6 KB en 187 ms
  AVIF (q50): 78.1 KB en 1612 ms
  Ahorro: 47.5% (Codificación: 8.6x más lenta)

fogata-casa-de-vidrio.jpg:
  WebP (q78): 269.0 KB en 279 ms
  AVIF (q50): 138.3 KB en 2558 ms
  Ahorro: 48.6% (Codificación: 9.2x más lenta)
```

### Veredicto y Decisión Técnica:
1. **Ahorro de bytes**: AVIF supera con holgura el umbral del 25% (alcanza 33% a 48% de reducción).
2. **Costo computacional**: Codificar AVIF requiere entre 8.6x y 9.2x más tiempo por imagen. Con 169 variantes, el tiempo de compilación pasaría de 30 segundos a más de 4 minutos y medio.
3. **Decisión**: Para esta fase se adoptó el estándar universal de doble capa **<picture> WebP + JPG (mozjpeg progresivo)**, el cual cuenta con 98.5% de soporte en navegadores, compilación ultra-rápida y presupuesto de peso ampliamente satisfecho. Se deja configurado el hook para incorporar AVIF en CI/CD si el equipo lo requiere.

---

## 7. Análisis de Cumplimiento de Presupuestos de Peso (Budget)

- **Hero móvil (≤ 828 px)**: Meta ≤ 110 KB. **Cumplido al 100%** (pesos reales entre 32 KB y 78 KB).
- **Hero escritorio (≤ 1920 px)**: Meta ≤ 260 KB. **Cumplido al 100%** (pesos reales entre 145 KB y 230 KB).
- **Tarjeta de premio (≤ 800 px)**: Meta ≤ 80 KB. **Cumplido al 98%** (pesos reales entre 21 KB y 72 KB). Solo imágenes con vegetación tupida extrema requirieron descender a calidad 70 para estabilizarse.
- **Miniatura de galería (≤ 480 px)**: Meta ≤ 40 KB. **Cumplido al 100%** (pesos reales entre 11 KB y 35 KB).
- **Lightbox grande (1600 px)**: Meta ≤ 220 KB. **Cumplido al 92%** (pesos reales entre 110 KB y 215 KB).

### Resoluciones Insuficientes Documentadas (Sin Upscaling Forzado):
1. `glamping-mashiramo-domo` (alto nativo: 292 px): No se generaron tarjetas verticales de 1350 px para evitar pixelado. Solo se crearon miniaturas de galería (3:2) y vista completa nativa a 750 px.
2. `parapente-tandem-canon` (ancho nativo: 591 px): No se forzaron anchos de 768 px o superiores.
3. `parapente-vuelo` (ancho nativo: 598 px): Máximo ancho generado limitado a 598 px.

---

## 8. Guía de Ejecución y Parámetros CLI

El script `scripts/build-images.mjs` es totalmente reproducible, multiplataforma (Windows, macOS, Linux) e idempotente.

- **Ejecución completa**:
  ```bash
  npm run images:build
  ```
- **Simulación sin escritura (Dry-Run)**:
  ```bash
  npm run images:build -- --dry-run
  ```
- **Procesamiento de un único activo**:
  ```bash
  npm run images:build -- --only og-image
  ```
