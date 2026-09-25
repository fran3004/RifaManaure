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

  it('debe tener registradas 9 fotos con sus respectivas experiencias y alojadas en Cloudinary', () => {
    expect(fotos).toHaveLength(9);
    fotos.forEach((foto) => {
      expect(foto.slug).toBeTruthy();
      expect(foto.alt).toBeTruthy();
      expect(['cuatrimoto', 'parapente', 'serrania', 'fogata']).toContain(foto.experiencia);
      expect(foto.hero).toContain('res.cloudinary.com');
      expect(foto.heroJpg).toContain('res.cloudinary.com');
      expect(foto.card).toContain('res.cloudinary.com');
      expect(foto.cardJpg).toContain('res.cloudinary.com');
      expect(foto.thumb).toContain('res.cloudinary.com');
      expect(foto.full).toContain('res.cloudinary.com');
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

  it('catalogoFotosManaure debe contener las 26 fotografías optimizadas de Manaure categorizadas y alojadas en Cloudinary', async () => {
    const { catalogoFotosManaure, resolveExperienceImage } = await import('@/assets/assets');
    expect(catalogoFotosManaure.length).toBe(26);

    catalogoFotosManaure.forEach((foto) => {
      expect(foto.card).toContain('res.cloudinary.com');
      expect(foto.thumb).toContain('res.cloudinary.com');
      expect(foto.full).toContain('res.cloudinary.com');
    });

    const gastroFoto = catalogoFotosManaure.find((f) => f.slug === 'gastronomia-casa-arepas');
    expect(gastroFoto).toBeDefined();
    expect(gastroFoto?.categoria).toBe('gastronomia');
    expect(gastroFoto?.categoriaLabel).toBe('Gastronomía Local');
    expect(gastroFoto?.card).toContain('.webp');

    // Debe resolver correctamente la imagen
    const resolvedUrl = resolveExperienceImage('gastronomia-casa-arepas');
    expect(resolvedUrl).toBeTruthy();
    expect(resolvedUrl).toContain('gastronomia-casa-arepas');
    expect(resolvedUrl).toContain('res.cloudinary.com');

    // Debe resolver correctamente las fotos derivadas de gastronomia con recorte dinámico
    const arepaFoto = catalogoFotosManaure.find((f) => f.slug === 'gastronomia-arepa');
    expect(arepaFoto).toBeDefined();
    expect(arepaFoto?.card).toContain('c_crop,g_north');
    expect(arepaFoto?.card).toContain('gastronomia-local');

    const platoFoto = catalogoFotosManaure.find((f) => f.slug === 'gastronomia-plato');
    expect(platoFoto).toBeDefined();
    expect(platoFoto?.card).toContain('c_crop,g_south');
    expect(platoFoto?.card).toContain('gastronomia-local');

    const resolvedArepa = resolveExperienceImage('gastronomia-arepa');
    expect(resolvedArepa).toContain('c_crop,g_north');

    const resolvedPlato = resolveExperienceImage('gastronomia-plato');
    expect(resolvedPlato).toContain('c_crop,g_south');
  });
});
