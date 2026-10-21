import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearModelCatalogCache,
  filterModels,
  type ModelCatalogEntry,
  priceTag,
} from './openrouterModels';

// In-memory localStorage shim (node env lacks it).
class TestStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  key(i: number) {
    return [...this.store.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.store.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, v);
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
}
(globalThis as { localStorage?: Storage }).localStorage =
  new TestStorage() as unknown as Storage;

const entry = (over: Partial<ModelCatalogEntry>): ModelCatalogEntry => ({
  id: 'vendor/model',
  name: 'Vendor Model',
  vision: false,
  free: false,
  inputPricePerM: 1,
  outputPricePerM: 2,
  contextLength: 128000,
  ...over,
});

const catalog: ModelCatalogEntry[] = [
  entry({ id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', inputPricePerM: 0.3 }),
  entry({
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B (free)',
    free: true,
    inputPricePerM: 0,
    outputPricePerM: 0,
  }),
  entry({
    id: 'anthropic/claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    vision: true,
    inputPricePerM: 5,
    outputPricePerM: 15,
  }),
];

describe('openrouterModels', () => {
  beforeEach(() => {
    clearModelCatalogCache();
  });

  describe('filterModels', () => {
    it('returns everything for an empty query', () => {
      expect(filterModels(catalog, '')).toHaveLength(3);
      expect(filterModels(catalog, '   ')).toHaveLength(3);
    });

    it('matches on id and name, case-insensitively', () => {
      expect(filterModels(catalog, 'llama')).toHaveLength(1);
      expect(filterModels(catalog, 'GPT-4O')).toHaveLength(1);
      expect(filterModels(catalog, 'claude sonnet')).toHaveLength(1);
      expect(filterModels(catalog, 'nonexistent')).toHaveLength(0);
    });
  });

  describe('priceTag', () => {
    it('tags free models', () => {
      expect(priceTag(catalog[1])).toBe('Free');
    });

    it('buckets paid models into $ / $$ / $$$', () => {
      expect(priceTag(catalog[0])).toBe('$'); // 0.3 $/M input
      expect(priceTag(catalog[2])).toBe('$$$'); // 5 $/M input
    });
  });

  describe('fetchOpenRouterModels cache', () => {
    it('serves a cache hit without a second network call', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'openai/gpt-4o-mini',
                name: 'GPT-4o mini',
                created: 1,
                context_length: 128000,
                architecture: { input_modalities: ['text', 'image'] },
                pricing: { prompt: '0.00000015', completion: '0.0000006' },
              },
            ],
          }),
          { status: 200 },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { fetchOpenRouterModels } = await import('./openrouterModels');
      const first = await fetchOpenRouterModels();
      expect(first).toHaveLength(1);
      expect(first[0].vision).toBe(true); // image modality mapped
      expect(first[0].inputPricePerM).toBeCloseTo(0.15);

      const second = await fetchOpenRouterModels();
      expect(second).toEqual(first);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });
  });
});
