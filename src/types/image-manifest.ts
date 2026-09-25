/**
 * MANIFEST DE IMÁGENES AUTOGENERADO - MANAURE VIVE
 * Catálogo estático alojado en Cloudinary
 */

export interface ImageEntry {
  id: string;
  category: 'cuatrimoto' | 'parapente' | 'serrania' | 'glamping' | 'gastronomia' | 'hospedaje';
  sourceFile: string;
  nativeWidth: number;
  nativeHeight: number;
  alt: string;
  caption: string;
  focalPoint: { x: number; y: number };
  dominantColor: string;
  card?: {
    fit: 'cover' | 'contain' | 'asis';
    focal?: { x: number; y: number };
    dominantColor?: string;
  };
  lqip: string;
  cloudinary: {
    publicId: string;
    secureUrl: string;
    width: number;
    height: number;
  };
}

export const imageAliases: Record<string, string> = {
  "gastronomia-arepa": "gastronomia-local",
  "gastronomia-plato": "gastronomia-local",
  "fogata-circulo-piedra": "fogata-casa-de-vidrio",
  "cuatrimoto-topiario": "cuatrimoto-mirador",
  "serrania-perija-panoramica": "og-image",
  "registro-fotografico": "serrania-valle-nubes"
};

export const imageManifest: Record<string, ImageEntry> = {
  "gastronomia-local": {
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
    "card": {
      "fit": "asis",
      "focal": {
        "x": 0.5,
        "y": 0.5
      },
      "dominantColor": "#23302a"
    },
    "lqip": "data:image/webp;base64,UklGRswAAABXRUJQVlA4IMAAAABQBQCdASoUABsAPzmMwVcvKSejqAqp4CcJbACuHA+DNztXE+Pv696N5lEDokogpkjBigAA9Y+cLWzYqHaTDvzwxXG1JpT9ZnbwCi8jo5QfWyBr+X0P+DH1+WXyEiYH2oTBUKdbef8iGlpW7rtjt+o7kjhPGkZ3owf9v9a1DsV+h27OwrRf1aVW7XJvG1PbC/rvs3nAabGULe3TgQ+cyLoX1bgRWyeGxfYA5u2tdYmv63WOHuQEvhrHH5fTPjqMYAA=",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/gastronomia/gastronomia-local",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/gastronomia/gastronomia-local.jpg",
      "width": 710,
      "height": 960
    }
  },
  "og-image": {
    "id": "og-image",
    "category": "serrania",
    "sourceFile": "og-image.jpg",
    "nativeWidth": 1920,
    "nativeHeight": 1080,
    "alt": "Majestuoso cañón montañoso y cordillera de la Serranía del Perijá bajo cielo azul despejado",
    "caption": "Paisaje insigne de la Serranía del Perijá en Manaure Balcón del Cesar.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.5
    },
    "dominantColor": "#6a8299",
    "lqip": "data:image/webp;base64,UklGRo4AAABXRUJQVlA4IIIAAABwBACdASoYAA4APtFUo0uoJKMhsAgBABoJQBOmUABp7hy44IbXx6yk7afuQAD+6vIODaU1prJzNT2z8lhZLH9Zkd3y81xCW42bwauxKpG6nwupXjs3CZu5020WZyezfAfI4rfnvK8uq8uUeLh4pPjrcYoL4+tUpZc6FMTwI/fNAAAA",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/serrania/og-image",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/serrania/og-image.jpg",
      "width": 1600,
      "height": 900
    }
  },
  "cuatrimoto-aventura-cordillera": {
    "id": "cuatrimoto-aventura-cordillera",
    "category": "cuatrimoto",
    "sourceFile": "cuatrimoto-aventura-cordillera.jpg",
    "nativeWidth": 1920,
    "nativeHeight": 1440,
    "alt": "Grupo de cuatrimotos todoterreno estacionadas en una cresta verde con vista panorámica a la Serranía del Perijá",
    "caption": "Rutas todoterreno en las alturas de la Serranía del Perijá.",
    "focalPoint": {
      "x": 0.35,
      "y": 0.65
    },
    "dominantColor": "#748a9d",
    "card": {
      "fit": "contain",
      "focal": {
        "x": 0.35,
        "y": 0.65
      },
      "dominantColor": "#748a9d"
    },
    "lqip": "data:image/webp;base64,UklGRoQAAABXRUJQVlA4IHgAAABQBQCdASoYABIAPtFQpkuoJKOhsBgMAQAaCWIAnTLMAamL8zZjlNcD1bPFgXj6zzdqgAAA+pOezW9n9hPM/cKUqyU6OR/PdbfvBDjiMfqtk3kX0H/VQOFNSHGFkYqa6nZaSxP/Q0I0q/05rDmAnBwCRII+sXxwAAA=",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/cuatrimoto/cuatrimoto-aventura-cordillera",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/cuatrimoto/cuatrimoto-aventura-cordillera.jpg",
      "width": 1600,
      "height": 1200
    }
  },
  "serrania-perija-cordillera": {
    "id": "serrania-perija-cordillera",
    "category": "serrania",
    "sourceFile": "serrania-perija-cordillera.jpg",
    "nativeWidth": 1920,
    "nativeHeight": 1440,
    "alt": "Grandes cañones y formaciones geológicas de la Serranía del Perijá en un día soleado",
    "caption": "Imponente geografía montañosa que enmarca el Balcón del Cesar.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.55
    },
    "dominantColor": "#587189",
    "lqip": "data:image/webp;base64,UklGRtgAAABXRUJQVlA4IMwAAAAQBgCdASoYABIAPtFcp04oJSOiKAqpABoJZgCdMuu6CasQy+LZDe8LvwDUjkaaEdJE+C7N8yESHYAA/tUIys6UAgMfq6DLSy48zwxxMyMR4Ftc2TWen0348gXTwAonBHjZwpVaf4TwO59YLTGjqGwyJ8e3e+UMM1UU/06m1cWhW6ZLwFVfpFgDTWKPeYemXmcHWxfCDnmBnFQ+a0srJsIbKVIOuD+dKjd39StXaWvXOKn+0tm5dyX6xoLKRn2JqTIq5KauaIAlnADIgAA=",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/serrania/serrania-perija-cordillera",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/serrania/serrania-perija-cordillera.jpg",
      "width": 1600,
      "height": 1200
    }
  },
  "fogata-casa-de-vidrio": {
    "id": "fogata-casa-de-vidrio",
    "category": "glamping",
    "sourceFile": "fogata-casa-de-vidrio.jpg",
    "nativeWidth": 1600,
    "nativeHeight": 1200,
    "alt": "Círculo de fogata en piedra sobre terraza de montaña con vista panorámica a la Serranía del Perijá",
    "caption": "Fogata nocturna privada en el mirador de la Casa de Vidrio con vista panorámica al valle.",
    "focalPoint": {
      "x": 0.55,
      "y": 0.55
    },
    "dominantColor": "#777471",
    "card": {
      "fit": "cover",
      "focal": {
        "x": 0.55,
        "y": 0.55
      },
      "dominantColor": "#777471"
    },
    "lqip": "data:image/webp;base64,UklGRt4AAABXRUJQVlA4INIAAADQBQCdASoYABIAPtFaqE4oJKQiKAqpABoJQBOmWR3/y7BGEhf4inLDdag7aCzn4MrB3+MDSIvgAP7tqtFoVxotCS/MkwI8qFcOLJQPuoKOQTnOz+/ux1k415GNyhi7GZmYxw3USpS8Y9Ro/8GGRqX+5CI2QHiIbVM7z+5MsanbViwMET5mQH3gpne7WM5ull4J11XQjKTvxZyZlKiji3dNRGsDQe+RwkYHhKNiaogf5aLgnbvOww21mnmIqOikna0vi3c1aybnS4+BspI1AUgRgAA=",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/glamping/fogata-casa-de-vidrio",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/glamping/fogata-casa-de-vidrio.jpg",
      "width": 1600,
      "height": 1200
    }
  },
  "parapente-vuelo": {
    "id": "parapente-vuelo",
    "category": "parapente",
    "sourceFile": "parapente-vuelo.jpg",
    "nativeWidth": 598,
    "nativeHeight": 1077,
    "alt": "Parapente con vela deportiva roja y amarilla volando en altura sobre el valle verde de Manaure",
    "caption": "Vuelo panorámico con vela deportiva sobre la geografía del Cesar.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.4
    },
    "dominantColor": "#5b6977",
    "lqip": "data:image/webp;base64,UklGRjQBAABXRUJQVlA4ICgBAADwBgCdASoYACsAPtFcok2oJSKiKqoBABoJbACdMw46kGkgKIS5Eaxq53cB5ayG3aRjW4V9wq0p/5lMaMB+eMngAP5daEWyZhQR5JD8c1QorCwBFy66/deLSEI2Lw+0ZjJJLPBjZiM4M/ILgUMmEW4aki+tzcz2cjvJXjg2oHMShgLPVzY37uRqVQkeWwWglrIGfcA753Yv0EgFAmPWf92D+30nGlrtN2zpFAAcOxEA+3Kv7+7bhFulGudRtuftMF4FsX1mQGu8QtaF/ZXzXp9s2YDBwXLrgwnJvgC5XLafe+O9Nsm+3Y6NluNZuYdCSfLC3T3WG8k6BSfm7AqErsZUJNQSlsEGjUF0yCpyYltW6K5uDZkRA4u4Wkwvw0TIcoj4miyq3AAAAA==",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/parapente/parapente-vuelo",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/parapente/parapente-vuelo.jpg",
      "width": 598,
      "height": 1077
    }
  },
  "serrania-perija-laguna": {
    "id": "serrania-perija-laguna",
    "category": "serrania",
    "sourceFile": "serrania-perija-laguna.jpg",
    "nativeWidth": 1600,
    "nativeHeight": 1200,
    "alt": "Laguna natural de montaña reflejando los árboles y el cielo en la Serranía del Perijá",
    "caption": "Espejo de agua natural en las alturas de la Serranía del Perijá.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.5
    },
    "dominantColor": "#757975",
    "card": {
      "fit": "cover",
      "focal": {
        "x": 0.5,
        "y": 0.5
      },
      "dominantColor": "#757975"
    },
    "lqip": "data:image/webp;base64,UklGRuAAAABXRUJQVlA4INQAAADwBQCdASoYABIAPtFUpU2oJCOiMBgIAQAaCWIAuzNMjgAQKZulw174xThxbrhf2hzF/Lviye2EAAD+4cyuaSD0kMHRXmLpM7hYdHUe64qR1rtCmRKYFjHyI41LYhMOeYgQ/1p7ls+Puek+Dw0jd2HXVYKpjJwbV7Z90IAdX3RzNWAPC+Jqy7u98Fng1pMW2O6w2mf7BZ61CQLzFpU4oDqlWED7pVI0zj5uy4mCHTaMkRhEbvTQK61L1kChcqBVkUXOx9ELhhdBjh/D2g8b3jfTrOYAAA==",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/serrania/serrania-perija-laguna",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/serrania/serrania-perija-laguna.jpg",
      "width": 1600,
      "height": 1200
    }
  },
  "parapente-bandera": {
    "id": "parapente-bandera",
    "category": "parapente",
    "sourceFile": "parapente-bandera.jpg",
    "nativeWidth": 1200,
    "nativeHeight": 1600,
    "alt": "Vuelo en parapente sobre el valle ondeando la bandera amarilla de Manaure Aventura",
    "caption": "Vuelos tándem con instructores certificados sobre los cielos de Manaure.",
    "focalPoint": {
      "x": 0.55,
      "y": 0.45
    },
    "dominantColor": "#8d9796",
    "lqip": "data:image/webp;base64,UklGRvoAAABXRUJQVlA4IO4AAABQBgCdASoYACAAPtFQpUuoJKOhsBgMAQAaCWQAnTMy46HASxXvNAJoPP+gzAdGBQlDTv607Xilii3NAAD+6oW/c11UMwQTaLi6g7+moG7HdvDqWm1Do5cXQNrBBMOoOYscD453wOEsqvMtiMCWGhSknImgiMIFOiZbd9r83UhoQ+nXxLn9lkjKIifCIJAMU1lQKmmvWvEup4S+q+uAvWD2o4Goa/hR1fKumA3lbd6p3imx2JyLV3UMsHMPFFefYlJlHFnvFlgBTWD8ieQwT7MaaOnLqsRwVOnn/c3k+rwMiRtV/95HEHVYNlyuoAAA",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/parapente/parapente-bandera",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/parapente/parapente-bandera.jpg",
      "width": 960,
      "height": 1280
    }
  },
  "hospedaje-villa-adelaida": {
    "id": "hospedaje-villa-adelaida",
    "category": "hospedaje",
    "sourceFile": "hospedaje-villa-adelaida.jpg",
    "nativeWidth": 1920,
    "nativeHeight": 1440,
    "alt": "Cabaña campestre de piedra y teja colonial rodeada de jardines floridos y terrazas verdes en Villa Adelaida",
    "caption": "Alojamiento campestre y descanso en Villa Adelaida, aliado oficial de hotelería.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.5
    },
    "dominantColor": "#787a58",
    "lqip": "data:image/webp;base64,UklGRroAAABXRUJQVlA4IK4AAAAQBQCdASoYABIAPtFaqU2oJSQiKAqpABoJQBdgAb31FuOY3XcsRt5EAIiZ7q63u9owAP6pRkL8s1UeqRrc55iOdjO6kS9l1RcWvrp+rSkqebylRNDo7ejbW7NO3xKkK+Sn57IfgdqXMPo/P3iZgxzEq0bZBMtgDzop2b4axUIfQJ+j03SLzjoS5bFE2/6h2zgKwBhJC3NE9N6ZcMksuLlLYf1G2hmTtJ24EZ4AAAA=",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/hospedaje/hospedaje-villa-adelaida",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/hospedaje/hospedaje-villa-adelaida.jpg",
      "width": 1600,
      "height": 1200
    }
  },
  "gastronomia-casa-arepas": {
    "id": "gastronomia-casa-arepas",
    "category": "gastronomia",
    "sourceFile": "gastronomia-casa-arepas.jpg",
    "nativeWidth": 1920,
    "nativeHeight": 1440,
    "alt": "Fachada del restaurante La Casa de las Arepas con comensales disfrutando comida típica en Manaure",
    "caption": "Experiencia gastronómica tradicional en La Casa de las Arepas.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.55
    },
    "dominantColor": "#696153",
    "lqip": "data:image/webp;base64,UklGRtwAAABXRUJQVlA4INAAAADwBACdASoYABIAPtFUoEwoJKMiMBgMAQAaCUAWoQ4AMCfToIReG3KY3HWPtlOk/QAA/vV2Q5jd6YoXPXRCpE74ZE/Gf0MkVDlzw6bNR3VmEXiFj1Inoh7gEgB0o3f6wYZhHKZlqwjH1Cr/FNvibINQ7mXqN0sUP1pmc4FXr7/P1MN8CAvDAQ5jc5FQcn0ib7vQSq3+84zDMz0YCLCjlU3aSHe4++hHfprLu5/dBMCnUqJCW33BZo3DRGWVlkAUYJv/HHQL7EY+qHB2v02kUWwA",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/gastronomia/gastronomia-casa-arepas",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/gastronomia/gastronomia-casa-arepas.jpg",
      "width": 1600,
      "height": 1200
    }
  },
  "gastronomia-arepa": {
    "id": "gastronomia-arepa",
    "category": "gastronomia",
    "sourceFile": "gastronomia-local.jpg",
    "nativeWidth": 710,
    "nativeHeight": 468,
    "alt": "Arepa de maíz caliente rellena con carne desmechada y queso fundido en Manaure",
    "caption": "Arepas típicas rellenas tradicionales de La Casa de las Arepas.",
    "focalPoint": {
      "x": 0.55,
      "y": 0.5
    },
    "dominantColor": "#65553d",
    "lqip": "data:image/webp;base64,UklGRuoAAABXRUJQVlA4IN4AAADwBACdASoYABAAPtFUo0uoJKMhsAgBABoJbACdDiACPA92JOP7GxAAoe2fmVYV3iAA/Br8xpaLgJpg6qf/7jP61WNH5mItuLpSH4IezqDxTQnybsNfW4x2B+fuEtnRU4dHYpmUojcfS+pks/AA5eCZW3VKl9UFUUnXxrokhtP2hYQKfMBrMijXOK9LfzHSSbRNZM3k7lTestPOo3xE7RDPU+ExZJPMokIBAL46+6G0UWzE7zz+o4AfcqAA/Blijwb5SHdQCQqNO5VPC13UcBPEXiaNaJNgYXMD3dAAAAA=",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/gastronomia/gastronomia-arepa",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/gastronomia/gastronomia-arepa.jpg",
      "width": 710,
      "height": 468
    }
  },
  "gastronomia-plato": {
    "id": "gastronomia-plato",
    "category": "gastronomia",
    "sourceFile": "gastronomia-local.jpg",
    "nativeWidth": 710,
    "nativeHeight": 480,
    "alt": "Plato típico montañero con arroz tostado, pechuga criolla, yuca cocida y ensalada fresca",
    "caption": "Almuerzo tradicional campestre de la gastronomía de Manaure.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.5
    },
    "dominantColor": "#816c53",
    "lqip": "data:image/webp;base64,UklGRtAAAABXRUJQVlA4IMQAAABQBQCdASoYABAAPtFUo0uoJKMhsAgBABoJaACdMoFWAEez7lkX584/xwMcfH2ls0+ZEwAA/k8mY5JW6JWJNOSm9p99vJXCISTA+Yqi9GWKCKRZlev148w9LmqhodmoLF9Q3N4nTk44zfwLTMnM5VRf9rghfeMjvlQsF0pVTVsywYMEMSU/BuOJ2I6shW37URwYYcz+QeGnR4nIq+lzg8ag7FOoictmSXZfp0+eLnk34XReWlxqo1+QkRWET2VeHzk34gAA",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/gastronomia/gastronomia-plato",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/gastronomia/gastronomia-plato.jpg",
      "width": 710,
      "height": 480
    }
  },
  "serrania-topiarios": {
    "id": "serrania-topiarios",
    "category": "serrania",
    "sourceFile": "serrania-topiarios.jpg",
    "nativeWidth": 1920,
    "nativeHeight": 1440,
    "alt": "Mirador con figuras topiarias esculpidas en arbustos verdes frente al valle de Manaure",
    "caption": "Jardines topiarios con mirador hacia el valle en el Balcón del Cesar.",
    "focalPoint": {
      "x": 0.45,
      "y": 0.5
    },
    "dominantColor": "#748072",
    "lqip": "data:image/webp;base64,UklGRuIAAABXRUJQVlA4INYAAABQBQCdASoYABIAPtFcpU6oJSMiKAqpABoJQBOma0iEOh6PAXX+eDYAJYbSwaT1tQEVSwAA/pGDohgor3FHTxEWK9/8dL6fhn5ZHE43rNYiDjBXwO0qyugXKsvlm5E/5ywvsO8pVcPT2x+z5z669+e0srhJImsAV0aqzwEV5LqkKhWlBxAe0GQPNEqzXg4xqbmE71S3jn6tnXel8YJJqPyenRkl0oLVPUdhvaQtteC0mQ4dKgGpw1MLPp46a1yOCJDYlLwCXdJh02XHjufwfMnheRezHAAA",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/serrania/serrania-topiarios",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/serrania/serrania-topiarios.jpg",
      "width": 1600,
      "height": 1200
    }
  },
  "cuatrimoto-ruta": {
    "id": "cuatrimoto-ruta",
    "category": "cuatrimoto",
    "sourceFile": "cuatrimoto-ruta.jpg",
    "nativeWidth": 750,
    "nativeHeight": 883,
    "alt": "Cuatrimoto transitando por una trocha ecoturística rodeada de densa vegetación tropical en Manaure",
    "caption": "Recorridos guiados por senderos naturales y caminos veredales.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.6
    },
    "dominantColor": "#69816e",
    "lqip": "data:image/webp;base64,UklGRkIBAABXRUJQVlA4IDYBAABQBgCdASoYABwAPtFWo0uoJKMhsAgBABoJagCdMoR6cEArkBvfT8VMi7E3wXSViiZQXe6YghVWBHd0UAD+rqvzPxoNm0lYbe8addIMZxnH1GXA5dV10xZefEjfwDmkKao8CPQCmGMZZfECPvf4oLV2XOG7fJK8SjPN65Z9UlW8MgWz0agfOyOvKV5mfPyM1pY+5o880zsncu1fMkuB1kqLmHRh/9rEMjWd//BFBNWqISQ/P5ANA/i7Pmk6GxQpi9iz0hg6nuc02cahTE9DGQ2dbMGAH9ZgQGa8TtfgOLYjeqbu0oLBl3++um9E+R5WraTYFMIaLv3qb28kj3XHxfH/bw7T4OFmTWaSum5HcrenMkcYJmIS7HgzLxXGwK93idQP7kMnCHdT4nvwUp25lZGAXtArSBAA",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/cuatrimoto/cuatrimoto-ruta",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/cuatrimoto/cuatrimoto-ruta.jpg",
      "width": 750,
      "height": 883
    }
  },
  "cuatrimoto-mirador": {
    "id": "cuatrimoto-mirador",
    "category": "cuatrimoto",
    "sourceFile": "cuatrimoto-mirador.jpg",
    "nativeWidth": 750,
    "nativeHeight": 931,
    "alt": "Piloto en cuatrimoto posando junto a jardines topiarios y mirador de montaña en Manaure",
    "caption": "Paradas fotográficas en los miradores icónicos de la ruta en cuatrimoto.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.45
    },
    "dominantColor": "#7c8786",
    "card": {
      "fit": "cover",
      "focal": {
        "x": 0.5,
        "y": 0.45
      },
      "dominantColor": "#7c8786"
    },
    "lqip": "data:image/webp;base64,UklGRvIAAABXRUJQVlA4IOYAAADwBQCdASoYAB4APtFcpk6oJSMiKAqpABoJQBdmcBS36T9PrJrKAKs0QIbKppHcMaNH6IPe0tlIaAD+9+vYRCsLV+hRhdP+UcQAz/HF9ouahyVCf4cEKeBfM8ycFzeRTCzvR6NpZtvhRoTvuF9dRKAkcGLnFeYKcrQNWauZki5pe21Nc3Ftupo8CtSexEn+WPxL6WCp/s2Gydh3q/syv4+DMeWz3UokW+Zx73K+Oa/VYJ6hqfi3YFCgnhZ3R6J/eSTtfQA3yTQRg9B2PINQ54t4/auzz7YS2zC56e033b27fsc2uJAAAA==",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/cuatrimoto/cuatrimoto-mirador",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/cuatrimoto/cuatrimoto-mirador.jpg",
      "width": 750,
      "height": 931
    }
  },
  "cuatrimoto-cumbre": {
    "id": "cuatrimoto-cumbre",
    "category": "cuatrimoto",
    "sourceFile": "cuatrimoto-cumbre.jpg",
    "nativeWidth": 1920,
    "nativeHeight": 2560,
    "alt": "Cuatrimotos en la cima de la montaña frente a un amplio horizonte nublado en Manaure",
    "caption": "Ascenso en cuatrimoto a los puntos más elevados de la cordillera.",
    "focalPoint": {
      "x": 0.45,
      "y": 0.6
    },
    "dominantColor": "#768993",
    "lqip": "data:image/webp;base64,UklGRsIAAABXRUJQVlA4ILYAAACQBQCdASoYACAAPtFYpE0oJSMiKA1RABoJaACdMyS3WJx+y8s9knza0KFGKbtDOGXPQ5E+AAD+unQ6q2yUdmJmAnR6QdhTVOU/5m9T8CcrrVzzbXz6cSMgsNzUXWXFDOWgN5wp6lLdUsiTypJtwvbwQ29l+Go2X06G9etvtTX9EP54E8bnDZAtHCqgN+WgeFmFaTxYNpWpYzpm8LDy4LNvZ1o/06Uy4sEeuV5IIEgCbSL8O4AAAA==",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/cuatrimoto/cuatrimoto-cumbre",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/cuatrimoto/cuatrimoto-cumbre.jpg",
      "width": 1600,
      "height": 2133
    }
  },
  "cuatrimoto-flota": {
    "id": "cuatrimoto-flota",
    "category": "cuatrimoto",
    "sourceFile": "cuatrimoto-flota.jpg",
    "nativeWidth": 2400,
    "nativeHeight": 1800,
    "alt": "Cuatrimoto amarilla y negra todoterreno equipada y lista para el tour en la base de operaciones",
    "caption": "Vehículos todoterreno de última generación con mantenimiento certificado.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.55
    },
    "dominantColor": "#6c7276",
    "lqip": "data:image/webp;base64,UklGRuwAAABXRUJQVlA4IOAAAABwBQCdASoYABIAPtFgqU+oJSOiKAgBABoJYwCo9y6opjPZFRo5p7cNqkHHv0kTMPJPe8cAAP5pp1g+v/TmBQ3GtqVhvk9i4dwSJTE6V2I2d4iWMuIV2H7Gfgs4yooiPBNJbWoXxCwozW/jf43gvrr4E2139xrqVOiDoSjfnGqOTV7O070udr6UB6a1cFSNa92EIKifewqy6iIAuoAcP+K/KIwE94N8VIXJ9TmP3bxQ1bxWed/e7XywI/fjUVWkko5Xs6f3PZO87ru2Gv5HwKLJEyp+mx637+/H3FsLTXgAAA==",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/cuatrimoto/cuatrimoto-flota",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/cuatrimoto/cuatrimoto-flota.jpg",
      "width": 1600,
      "height": 1200
    }
  },
  "parapente-despegue-atardecer": {
    "id": "parapente-despegue-atardecer",
    "category": "parapente",
    "sourceFile": "parapente-despegue-atardecer.jpg",
    "nativeWidth": 1600,
    "nativeHeight": 1200,
    "alt": "Siluetas de pilotos y parapente despegando en la montaña frente al sol poniente en Manaure",
    "caption": "Despegue en parapente durante el atardecer en los miradores de Manaure.",
    "focalPoint": {
      "x": 0.7,
      "y": 0.6
    },
    "dominantColor": "#857160",
    "lqip": "data:image/webp;base64,UklGRowAAABXRUJQVlA4IIAAAAAQBQCdASoYABIAPtFWpE0oJCMiMBgIAQAaCUAXYAHsEUQmLtw/ITCtllEoYbbinFAAAN2RNfIeYkytZJ9qvoh5Y4lNyV2pOnHChrN/hkgfqt6oZF8bw1wBRRTkKxLrM6iN7ZrcMLUJBGhyQMJbjDxjda12Kfh7nvaX3/QQN0bsAA==",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/parapente/parapente-despegue-atardecer",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/parapente/parapente-despegue-atardecer.jpg",
      "width": 1600,
      "height": 1200
    }
  },
  "parapente-tandem-canon": {
    "id": "parapente-tandem-canon",
    "category": "parapente",
    "sourceFile": "parapente-tandem-canon.jpg",
    "nativeWidth": 591,
    "nativeHeight": 1055,
    "alt": "Piloto y pasajero volando en parapente tándem sobre el profundo cañón verde de Manaure",
    "caption": "Sobrevuelo biplaza disfrutando la inmensidad del cañón del Perijá.",
    "focalPoint": {
      "x": 0.35,
      "y": 0.6
    },
    "dominantColor": "#524c22",
    "lqip": "data:image/webp;base64,UklGRlwBAABXRUJQVlA4IFABAADwCACdASoYACsAPtFcok2oJSKiKqoBABoJQBajfO+FhFxgV1aBJ32fyIgq5ojKtnsW0Wm8FAwxdBm0x73WbHqbWVD1mzDYGOEbHZ2P0zqcAAD+5jvZrdxwz580xemL4I7rF3obuwZlPBD3IiaXX9KeuRJf0ONbVMVdjpBd1dBZSG70SSyH1Oy6Eg3bU3APcL6b0CrQOcriKJ812X9iqrIvx08+PStr0zRZbZg1fGcQFZr4AlIeOqSqQkZk+t+nIXuMYic56GV4WlQlXvEmKY84w9QytkZZuBw9b5OuO53zia6z6FgswwU/8bSoCQZ8ZJIz/QY/GiWBi7esYaSwxkyxzbu1ZkpujeyLJynLHjM9f983QyixaxtW3MTNWCGil5WTVZXV59lVDoPz7k/1Qh4PlvwKsg/siN7srq1Yzo/7cNnIXh2L2go6pG0X2gAAAAA=",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/parapente/parapente-tandem-canon",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/parapente/parapente-tandem-canon.jpg",
      "width": 591,
      "height": 1055
    }
  },
  "serrania-los-pinos": {
    "id": "serrania-los-pinos",
    "category": "serrania",
    "sourceFile": "serrania-los-pinos.jpg",
    "nativeWidth": 1920,
    "nativeHeight": 1440,
    "alt": "Bosque de pinos y senderos verdes en las alturas de Manaure con vista a la cordillera",
    "caption": "Senderismo y contacto con la naturaleza en la reserva Los Pinos.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.5
    },
    "dominantColor": "#60788e",
    "lqip": "data:image/webp;base64,UklGRtoAAABXRUJQVlA4IM4AAADQBQCdASoYABIAPtFcqE4oJSQiKAqpABoJZgC1F0qmwZgAbH+0N4Po4LBa+uq2Pk3CEUJsxzoAAP7VEED0J4drdaS8AjiYAPw3z4sStiyz4yk3AyizJFrPcC5+e8oiLNpdGhV8G1qLb0MbO0e4gfsrFcOeB00oj5ReT01OFguOkdNu0DUn0KgBEr2mtcIprJPKCuS+pi9C0LEHBiF4L1BysRVyX+lM8RmCxR7uSqEdv/8UKSDrlFizS3dGgqPv2I8a81kzkK/Dq1gOwAAAAA==",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/serrania/serrania-los-pinos",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/serrania/serrania-los-pinos.jpg",
      "width": 1600,
      "height": 1200
    }
  },
  "serrania-perija-frailejones": {
    "id": "serrania-perija-frailejones",
    "category": "serrania",
    "sourceFile": "serrania-perija-frailejones.jpg",
    "nativeWidth": 1156,
    "nativeHeight": 671,
    "alt": "Campo de frailejones florecidos en el páramo de la Serranía del Perijá",
    "caption": "Ecosistema único de páramo y frailejones en las cumbres del Perijá.",
    "focalPoint": {
      "x": 0.4,
      "y": 0.55
    },
    "dominantColor": "#838c87",
    "lqip": "data:image/webp;base64,UklGRqQAAABXRUJQVlA4IJgAAABwBACdASoYAA4APtFUo0uoJKMhsAgBABoJYwC7AYyK5a8fWG8czcP7+6ivQAD6l1Ankg7E6qveu6iGWeDQF+xIHZT+9hyo2d1WpqAi1h2QSz9UbQQ+O2gMjp01goR6CeJiACIHUBMp8bYCBruZ9de8GdLOHs1xEBrjUv2x8d1K8tqlpicYijB7wQ2UrZ+mB2F4+LbinAAAAA==",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/serrania/serrania-perija-frailejones",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/serrania/serrania-perija-frailejones.jpg",
      "width": 960,
      "height": 557
    }
  },
  "serrania-pozo-cristalino": {
    "id": "serrania-pozo-cristalino",
    "category": "serrania",
    "sourceFile": "serrania-pozo-cristalino.jpg",
    "nativeWidth": 750,
    "nativeHeight": 1334,
    "alt": "Pozo natural de agua cristalina entre formaciones rocosas en Manaure",
    "caption": "Aguas cristalinas y pozos naturales para refrescarse tras las caminatas.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.5
    },
    "dominantColor": "#6d6844",
    "lqip": "data:image/webp;base64,UklGRoQBAABXRUJQVlA4IHgBAAAwCACdASoYACsAPtFepU8oJSMiJWzJABoJZgCdL+fLCCMPGzAO0xMgVNd6oUDkq6mYBrIoWaMlvHC+UwoBt0WYe2ibn7MSzu2EwAD9UvHqQ5N8sfX0sQ1m8XlJmITlE25TiCzj1jXxTSdnsPqBo3TDbUIhWT+9mnmNV+oyFzkq6qCCA2U/MVg9pxa7vBNoFa43kdnn4qSNPU1IyekP2gmbOeguEBU0WWG3kWJ7M/e9Wmito5Dlum5IsW+eIDQQ2qigyG1j4ZkBM6IhOwrp+9lLygouJtKlQ0vzklUoTDz02k5RY/4V8qVcD0ZDMcYjwKLs2TYzUCDhtFc8SGWznIpZCgqhBAgcFCcH4C9X5qQQjFaxukmzdBOJY2byMqZYVzBQ8E+bG7I1pA2VtFyEqorL9Xwh/vHW32hXytISk8I+EFSihgLLC9kGEewCoyzbrGes2haY8WpUoBuefH2aKSCU3wdsXL2YqNXqniGELOgksszaWkWnFAAA",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/serrania/serrania-pozo-cristalino",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/serrania/serrania-pozo-cristalino.jpg",
      "width": 750,
      "height": 1334
    }
  },
  "serrania-sabana-rubia": {
    "id": "serrania-sabana-rubia",
    "category": "serrania",
    "sourceFile": "serrania-sabana-rubia.jpg",
    "nativeWidth": 750,
    "nativeHeight": 899,
    "alt": "Páramo de Sabana Rubia con vegetación dorada y senderos de alta montaña",
    "caption": "Pastizales dorados característicos de Sabana Rubia en Perijá.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.55
    },
    "dominantColor": "#837c63",
    "lqip": "data:image/webp;base64,UklGRvQAAABXRUJQVlA4IOgAAADQBQCdASoYAB0APsFQo0unpKOhsAwA8BgJQBOkJsuAIo4X33ZgLC6fuxsThYI1NngT6LJBVuEAAP7tWLCzyYUPgUT4v/EG/64UrlFA9b6Ho/gUvl9Ni9kOrLB1VnqgV8fh1Fd9mVuyEAKpOilwcocGiiFRuwT0t8dRi1jj01DXCHkEldQkWaKPBzh60mmifAuaHEVwLiiCcEv0TV6m0Ve/pewwuR4KYDuLqtTxHlR8AIoHz0fu/cZ9nDyV3w0cIDRcSdZSYKxeOklW5M2Vd2Pe0jOR1wXixHFMYZ4c3+14FOeMsCa5B1wA",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/serrania/serrania-sabana-rubia",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/serrania/serrania-sabana-rubia.jpg",
      "width": 750,
      "height": 899
    }
  },
  "serrania-valle-nubes": {
    "id": "serrania-valle-nubes",
    "category": "serrania",
    "sourceFile": "registro-fotografico.jpg",
    "nativeWidth": 636,
    "nativeHeight": 974,
    "alt": "Valle verde y laderas montañosas de la Serranía del Perijá cubiertas por nubes bajas",
    "caption": "Paisaje de valles y neblina en las estribaciones de la Serranía.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.5
    },
    "dominantColor": "#5c6629",
    "lqip": "data:image/webp;base64,UklGRnYBAABXRUJQVlA4IGoBAACwCACdASoYACUAPtFgo06oJaKiKrgKAQAaCWYArDN2xnh54XTdU7wT745YJBrc0De+tVjfkPqgtIacRwRRlDcjxlZQ1LoXAAN+Sf00CAAA/sV20Iz4Np4GgMbd69f0oMwazCANY8mHgRNTTFmCCTx9k1XAbxDbPZmngUShomrZ+KUd1U3ufBtpRnrtPCTFftjMCyyj5XxcxAXAdBiHa6TSnKRFuCxs8v3sfKkxFZHaARe6oMMJZj3onERxy1DdKly4EeoDPFPV0LN7wZ+YfRFka58CiI+6OOpuIZp3F/zn3jhdJa8QohZ0iD3RnJ8R8wOAkAjOqdKvtQNo2JMaDSTbmXKAttfEDtq2sZ+R6ZeWWP2uS0HKi8/8bogrWv+B/HelN1y256RxBNR+mRrfzkvbp1PG8u/SX2sZ90LzezATrTOfgj8CMCwo9IAaxTK6azoeQMK+JfgFMEMcM/lqlCuK2bfNtJCGzYAAAA==",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/serrania/serrania-valle-nubes",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/serrania/serrania-valle-nubes.jpg",
      "width": 636,
      "height": 974
    }
  },
  "fogata-mirador-nocturno": {
    "id": "fogata-mirador-nocturno",
    "category": "glamping",
    "sourceFile": "fogata-mirador-nocturno.jpg",
    "nativeWidth": 1600,
    "nativeHeight": 1200,
    "alt": "Carpa iluminada en campamento nocturno de montaña junto a sillas con cobijas bajo el cielo estrellado",
    "caption": "Noche bajo las estrellas en los campamentos de alta montaña de Manaure.",
    "focalPoint": {
      "x": 0.4,
      "y": 0.65
    },
    "dominantColor": "#323b35",
    "lqip": "data:image/webp;base64,UklGRo4AAABXRUJQVlA4IIIAAACQBACdASoYABIAPtFcpU6oJSMiKAqpABoJYwC3uA9zvPCgJWdXwbkW+/59XEwA/vXchPrWncuYXFDxxrFeCCvFToT9dHVFw6sCqhtNOgLMNR6scRO319/5FU95rd6tkjSz//I91HJVNM/vLPQ3MkwE0ZP0RwA2siWi76D+dy8SAAAA",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/glamping/fogata-mirador-nocturno",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/glamping/fogata-mirador-nocturno.jpg",
      "width": 1600,
      "height": 1200
    }
  },
  "glamping-mashiramo-domo": {
    "id": "glamping-mashiramo-domo",
    "category": "glamping",
    "sourceFile": "glamping-mashiramo-domo.jpg",
    "nativeWidth": 750,
    "nativeHeight": 292,
    "alt": "Domo geodésico de Mashiramo Glamping iluminado en la noche sobre plataforma de madera en el bosque",
    "caption": "Hospedaje de lujo en domos geodésicos en medio de la naturaleza de Manaure.",
    "focalPoint": {
      "x": 0.45,
      "y": 0.55
    },
    "dominantColor": "#494548",
    "lqip": "data:image/webp;base64,UklGRnwAAABXRUJQVlA4IHAAAAAwBACdASoYAAkAPtFUo0uoJKMhsAgBABoJZQC+SCPmVvJ6NX7DPqQrCAAA/uwbxMUPN2tYtPXwRJIV+xdOTvVoEMmlONkVZUG+6qkh8oH17nPaocqr3LvJzrNaHT7Xv98mPdMkitkZqODJm9agOAAA",
    "cloudinary": {
      "publicId": "manaure-vive/galeria/glamping/glamping-mashiramo-domo",
      "secureUrl": "https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/galeria/glamping/glamping-mashiramo-domo.jpg",
      "width": 750,
      "height": 292
    }
  }
};
