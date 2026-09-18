import { describe, it, expect } from 'vitest';
import { aliados, fotos, fotosParaHero, logoPrincipal } from '@/assets/assets';

describe('Inventario de Assets y Aliados (src/assets/assets.ts)', () => {
  it('debe contener los 10 aliados ecoturísticos oficiales', () => {
    expect(aliados).toHaveLength(10);
    const slugs = aliados.map((a) => a.slug);
    expect(slugs).toContain('cuatri-tours-manaure');
    expect(slugs).toContain('villa-adelaida');
    expect(slugs).toContain('absolom-casita-de-la-mora');
    expect(slugs).toContain('los-pinos-manaure');
    expect(slugs).toContain('mashiramo-glamping');
    expect(slugs).toContain('la-casa-de-las-arepas');
    expect(slugs).toContain('metallura');
    expect(slugs).toContain('manaure-aventura');
    expect(slugs).toContain('coruscans');
    expect(slugs).toContain('photours');
  });

  it('todos los aliados deben tener nombre y categoría definidos', () => {
    aliados.forEach((aliado) => {
      expect(aliado.nombre).toBeTruthy();
      expect(aliado.categoria).toBeTruthy();
      expect(aliado.slug).toBeTruthy();
    });
  });

  it('debe tener registradas 9 fotos con sus respectivas experiencias', () => {
    expect(fotos).toHaveLength(9);
    fotos.forEach((foto) => {
      expect(foto.slug).toBeTruthy();
      expect(foto.alt).toBeTruthy();
      expect(['cuatrimoto', 'parapente', 'serrania', 'fogata']).toContain(foto.experiencia);
    });
  });

  it('fotosParaHero debe filtrar fotos horizontales nativas sin extensión de bordes', () => {
    expect(fotosParaHero.length).toBeGreaterThan(0);
    fotosParaHero.forEach((f) => {
      expect(f.heroExtendido).toBe(false);
    });
  });

  it('logoPrincipal debe estar disponible', () => {
    expect(logoPrincipal).toBeDefined();
  });
});

