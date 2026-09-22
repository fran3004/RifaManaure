import { describe, it, expect } from 'vitest';
import { aliados, fotos, fotosParaHero, logoPrincipal, logoPrincipalCompleto } from '@/assets/assets';

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

  it('logoPrincipal y logoPrincipalCompleto deben estar disponibles y alojados en Cloudinary', () => {
    expect(logoPrincipal).toBeDefined();
    expect(logoPrincipal.master).toContain('res.cloudinary.com');
    expect(logoPrincipal.web).toContain('res.cloudinary.com');
    expect(logoPrincipalCompleto).toBeDefined();
    expect(logoPrincipalCompleto.master).toContain('res.cloudinary.com');
    expect(logoPrincipalCompleto.web).toContain('res.cloudinary.com');
  });

  it('todos los logos de aliados deben estar alojados en Cloudinary con transformaciones optimizadas', () => {
    aliados.forEach((aliado) => {
      expect(aliado.logoMaster).toContain('res.cloudinary.com');
      expect(aliado.logoWeb).toContain('res.cloudinary.com');
      expect(aliado.logoGrid).toContain('res.cloudinary.com');
    });
  });

  it('catalogoFotosManaure debe contener las 26 fotografías optimizadas de Manaure categorizadas', async () => {
    const { catalogoFotosManaure, resolveExperienceImage } = await import('@/assets/assets');
    expect(catalogoFotosManaure.length).toBe(26);

    const gastroFoto = catalogoFotosManaure.find((f) => f.slug === 'gastronomia-casa-arepas');
    expect(gastroFoto).toBeDefined();
    expect(gastroFoto?.categoria).toBe('gastronomia');
    expect(gastroFoto?.categoriaLabel).toBe('Gastronomía Local');
    expect(gastroFoto?.card).toContain('.webp');

    // Debe resolver correctamente la imagen
    const resolvedUrl = resolveExperienceImage('gastronomia-casa-arepas');
    expect(resolvedUrl).toBeTruthy();
    expect(resolvedUrl).toContain('gastronomia-casa-arepas');
  });
});
