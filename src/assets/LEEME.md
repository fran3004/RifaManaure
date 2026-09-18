# Assets de la rifa — logos e imágenes listos para web

Todo el material quedó procesado y organizado. Esta carpeta se copia tal cual dentro de `src/assets/` en tu proyecto de React.

---

## Lo que se hizo

**Logos (10 archivos)**

- Los 9 logos que venían en `.webp` ya tenían transparencia real, así que se conservó intacta.
- El logo principal de **Manaure Vive** venía en JPEG con fondo blanco: se le quitó el fondo con un relleno por inundación desde los bordes, que es lo que permite conservar los blancos _internos_ del diseño (el contorno blanco de "MANAURE VIVE" y el trazo del pincel). Un "todo lo blanco a transparente" habría destruido esas partes.
- A todos se les quitó el espacio transparente sobrante alrededor, para que en una fila de aliados se vean del mismo tamaño visual y no unos flotando y otros pegados al borde.

**Imágenes (9 fotos × 5 tamaños × 2 formatos = 90 archivos)**

- `cuatrimoto.heic` era un HEIC de iPhone que ni el navegador ni la mayoría de herramientas abren. Convertido a formatos web. Es además la foto de mejor calidad de todo el set (4032×3024).
- Dos de las fotos eran capturas de pantalla de Instagram con la marquita del carrusel ("1/5", "4/5") en la esquina. Se borraron con reconstrucción del cielo; no queda rastro.
- Todas se generaron en WebP (principal, más liviano) y JPEG (respaldo para navegadores viejos).

---

## Estructura de carpetas

```
assets-rifa/
├── logos/
│   ├── master/        PNG transparente, resolución completa (para imprimir, editar, exportar)
│   ├── web/           WebP transparente, 600 px lado mayor (uso general en la página)
│   ├── grid-400/      400×400 transparente, todos centrados igual (fila de aliados)
│   └── grid-800/      lo mismo a 800×800 (pantallas retina, @2x)
│
├── imagenes/
│   ├── hero-1920x1080/      fondo grande / banner principal (16:9)
│   ├── card-1200x800/       tarjetas de galería, secciones (3:2)
│   ├── thumb-600x400/       miniaturas, listados (3:2)
│   ├── movil-1080x1350/     vertical para móvil y redes (4:5)
│   └── original-optimizado/ la foto completa, comprimida, máximo 2400 px
│
├── assets.ts          inventario de rutas para importar en React
└── LEEME.md
```

**Cuándo usar cada tamaño:**

| Uso en la página                      | Carpeta                 | Por qué                                 |
| ------------------------------------- | ----------------------- | --------------------------------------- |
| Fondo del encabezado de la rifa       | `hero-1920x1080`        | llena pantalla completa en escritorio   |
| Galería del premio                    | `card-1200x800`         | buen detalle sin pesar demasiado        |
| Listado de rifas, previsualizaciones  | `thumb-600x400`         | carga instantánea                       |
| Carrusel en celular / historias       | `movil-1080x1350`       | vertical, aprovecha la pantalla         |
| Abrir la foto en grande al hacer clic | `original-optimizado`   | máxima calidad disponible               |
| Fila de logos de aliados              | `grid-400` + `grid-800` | todos alineados y del mismo peso visual |

---

## Actualización — logo principal recortado y logo de La Casa de las Arepas

Ya quedaron los 10 logos completos: se sumó el de **La Casa de las Arepas** (el que faltaba, número 7 del afiche), procesado igual que los demás — se le quitó el fondo blanco de las esquinas de la foto conservando el círculo naranja y el blanco interior del diseño, que sí es parte del logo.

También se recortó el **logo principal**: ahora solo tiene el dibujo (colibrí, montaña, flores) y el texto "MANAURE VIVE", sin la franja verde de "NATURALEZA · CULTURA · GASTRONOMÍA · EXPERIENCIAS" ni el bloque de texto de "Manaure EcoTurístico". Si en algún lugar de la página quieres esa versión completa con todo el texto (por ejemplo en un pie de página institucional), avísame y te dejo también esa variante aparte — para no perderla, no se sobrescribió el archivo, se generó como una versión nueva.

## Sobre generar paisajes con IA

Acá no tengo una herramienta de generación de imágenes, así que no pude crear paisajes nuevos ni extender las fotos con IA. Prefiero decírtelo derecho antes que entregarte algo que no es.

Lo que sí hice para las fotos verticales fue armar la versión horizontal con la técnica que se usa en producción cuando no hay material horizontal: la foto va centrada a tamaño completo y los costados se rellenan con una versión ampliada, desenfocada y oscurecida de la misma foto. Queda un banner 16:9 que se ve intencional, no recortado a la fuerza, y no inventa contenido que no existe.

Si quieres paisajes generados o extendidos de verdad, el camino es una herramienta de generación de imágenes con _outpainting_ (la función de expandir el lienzo). Le das una de estas fotos ya procesadas y le pides que extienda los lados. Mi recomendación honesta, sin embargo, es otra: para una rifa con dinero real, **las fotos reales del lugar generan mucha más confianza que un paisaje generado**. Si el paisaje de fondo es IA y alguien lo nota, juega en contra. Yo usaría IA solo para elementos decorativos, no para mostrar el premio.

---

## Calidad real de cada foto

| Foto                          | Resolución original | Sirve para                                  |
| ----------------------------- | ------------------- | ------------------------------------------- |
| `cuatrimoto-flota`            | 4032×3024           | todo, incluido hero a pantalla completa     |
| `serrania-perija-laguna`      | 1600×1200           | todo                                        |
| `fogata-casa-de-vidrio`       | 1600×1200           | todo                                        |
| `parapente-bandera`           | 1200×1600           | tarjetas y móvil; hero solo extendido       |
| `serrania-perija-frailejones` | 1156×671            | hero aceptable, tarjetas perfecto           |
| `serrania-perija-panoramica`  | 1075×805            | hero aceptable, tarjetas perfecto           |
| `cuatrimoto-mirador`          | 750×931             | tarjetas y móvil; era captura de Instagram  |
| `cuatrimoto-ruta`             | 750×883             | tarjetas y móvil; era captura de Instagram  |
| `parapente-vuelo`             | 598×1077            | miniaturas y móvil; la más limitada del set |

Las que salieron de capturas de Instagram están comprimidas por la propia app, eso ya no se recupera. Al ampliarlas se les aplicó enfoque para que no se vean lavadas, pero si consigues los originales del fotógrafo van a quedar bastante mejor.

**Fotos que recomiendo como fondo principal de la rifa:** `cuatrimoto-flota`, `serrania-perija-laguna`, `fogata-casa-de-vidrio` y `serrania-perija-panoramica`. Son las que aguantan tamaño grande sin verse pixeladas.

---

## Cómo usarlas en React

Importa el inventario en vez de escribir rutas sueltas:

```tsx
import { aliados, fotos, logoPrincipal, fotosParaHero } from '@/assets/assets-rifa/assets';

// Fila de logos de aliados
<div className="aliados">
  {aliados.map((a) => (
    <img
      key={a.slug}
      src={a.logoGrid}
      srcSet={`${a.logoGrid} 400w, ${a.logoGrid2x} 800w`}
      sizes="(max-width: 600px) 120px, 160px"
      alt={`Logo de ${a.nombre}`}
      loading="lazy"
      width={400}
      height={400}
    />
  ))}
</div>;
```

Para las fotos, sirviendo WebP con respaldo JPEG:

```tsx
const foto = fotos[0];

<picture>
  <source srcSet={foto.hero} type="image/webp" />
  <img
    src={foto.hero.replace('.webp', '.jpg')}
    alt={foto.alt}
    width={1920}
    height={1080}
    loading="lazy"
  />
</picture>;
```

Un detalle que casi siempre se olvida y sí importa: pon siempre `width` y `height` en las etiquetas `<img>`. Sin eso, el navegador no reserva el espacio y la página "salta" mientras cargan las imágenes, que es justo lo que hace que un sitio se sienta poco profesional. En una página donde la gente va a poner plata, esa sensación cuesta caro.

Y la primera imagen visible (el fondo del encabezado) va con `loading="eager"` y `fetchPriority="high"`, no con `lazy`.

---

## Prompt para tu agente en VS Code

```
En src/assets/assets-rifa/ tengo los logos e imágenes ya procesados, con un inventario
en assets.ts que exporta: logoPrincipal, aliados (9 aliados con logoWeb, logoGrid,
logoGrid2x, logoMaster), fotos (9 fotos con hero, card, thumb, movil, full, alt,
experiencia y heroExtendido) y fotosParaHero.

Con eso construye:

1. Un componente <FilaAliados /> que muestre los logos de los aliados en una cuadrícula
   responsiva, usando srcSet con grid-400 y grid-800, loading lazy, width y height
   explícitos, y el nombre del aliado como alt. En pantallas pequeñas debe pasar a
   scroll horizontal en vez de apilarse en una columna larga.

2. Un componente <GaleriaPremio /> que muestre las 9 fotos como tarjetas usando el
   tamaño card, agrupadas por el campo experiencia (cuatrimoto, parapente, serrania,
   fogata) con un título por grupo. Al hacer clic, abre la foto en un visor usando el
   tamaño full.

3. Un componente <HeroRifa /> que use una foto de fotosParaHero como fondo a pantalla
   completa, con el logoPrincipal encima y un degradado oscuro para que el texto se lea.
   La imagen del hero debe ir con loading eager y fetchPriority high.

4. Todos los <img> deben usar <picture> con <source type="image/webp"> y un <img> de
   respaldo apuntando al mismo archivo con extensión .jpg.

Usa CSS puro en archivos .module.css, nada de Tailwind. El logo principal tiene texto
verde oscuro en la parte inferior, así que sobre fondos oscuros ponlo sobre una placa
clara o usa suficiente contraste para que se lea.
```
