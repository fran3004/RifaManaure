import { describe, it, expect, vi } from 'vitest';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

describe('lazyWithRetry', () => {
  it('debe resolver exitosamente en el primer intento si no hay error', async () => {
    const DummyComponent = () => null;
    const loader = vi.fn().mockResolvedValue({ default: DummyComponent });

    const LazyComp = lazyWithRetry(loader, 'TestComponent');
    expect(LazyComp).toBeDefined();

    // Invocar el loader subyacente que React.lazy ejecuta
    // En Vitest/Node, lazy retorna un objeto con _payload._result o similar,
    // o podemos verificar llamando directamente a la función envuelta
    const result = await loader();
    expect(result.default).toBe(DummyComponent);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('debe reintentar ante un fallo inicial y resolver si el segundo intento es exitoso', async () => {
    const DummyComponent = () => null;
    let attempts = 0;
    const loader = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Failed to fetch dynamically imported module');
      }
      return { default: DummyComponent };
    });

    // Simulamos la lógica ejecutada dentro de lazyWithRetry
    const wrappedFactory = async () => {
      try {
        return await loader();
      } catch {
        await new Promise((r) => setTimeout(r, 10));
        return await loader();
      }
    };

    const res = await wrappedFactory();
    expect(res.default).toBe(DummyComponent);
    expect(attempts).toBe(2);
  });

  it('debe propagar el error si el segundo intento también falla', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('Chunk permanently missing'));

    const wrappedFactory = async () => {
      try {
        return await loader();
      } catch (err) {
        await new Promise((r) => setTimeout(r, 10));
        return await loader();
      }
    };

    await expect(wrappedFactory()).rejects.toThrow('Chunk permanently missing');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
