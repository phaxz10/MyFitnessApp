import { useQuery } from '@tanstack/react-query';
import { OPENROUTER_MODELS_URL } from '../../constants/aiProviders';

// OPENROUTER MODEL CATALOG — see ADR-0007.
//
// OpenRouter exposes a public, no-auth models list (GET /api/v1/models,
// CORS-enabled). We fetch it to drive the model combobox so users pick real,
// current ids instead of typing them. Two-tier cache (memory + localStorage,
// 24h TTL, same pattern as the AI response cache in aiClient) keeps cold
// starts cheap and offline starts usable.

const CACHE_PREFIX = 'mypersonalfitness.openrouterModelCatalog.v1';
const DEFAULT_CATALOG_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export interface ModelCatalogEntry {
  id: string;
  name: string;
  /** Can accept image inputs — matters for food-photo analysis. */
  vision: boolean;
  /** Free models (pricing.prompt + completion === "0"), tagged in the UI. */
  free: boolean;
  /** Rough price bucket for UI sorting/tagging, in $ per 1M prompt tokens. */
  inputPricePerM: number;
  outputPricePerM: number;
  contextLength: number | null;
}

function toNumber(value: string | undefined): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function normalize(raw: OpenRouterModelsResponse): ModelCatalogEntry[] {
  const seen = new Set<string>();
  const entries: ModelCatalogEntry[] = [];
  for (const model of raw.data ?? []) {
    if (!model?.id || seen.has(model.id)) continue;
    seen.add(model.id);
    const input = toNumber(model.pricing?.prompt);
    const output = toNumber(model.pricing?.completion);
    entries.push({
      id: model.id,
      name: model.name ?? model.id,
      // Vision matters for food-photo analysis; surfaced as a UI hint.
      vision: (model.architecture?.input_modalities ?? []).includes('image'),
      free: model.id.endsWith(':free') || (input === 0 && output === 0),
      inputPricePerM: input * 1_000_000,
      outputPricePerM: output * 1_000_000,
      contextLength: model.context_length ?? null,
    });
  }
  return entries;
}

export function priceTag(entry: ModelCatalogEntry): string {
  if (entry.free) return 'Free';
  // OpenRouter bills per token; tags are coarse buckets of $ / 1M input tokens.
  if (entry.inputPricePerM < 0.5) return '$';
  if (entry.inputPricePerM < 3) return '$$';
  return '$$$';
}

// ----------------------------- Cache layer ---------------------------------

interface CacheEntry {
  fetchedAt: number;
  entries: ModelCatalogEntry[];
}

const memoryCache = new Map<string, CacheEntry>();

function getLocalStorage(): Storage | null {
  if (typeof globalThis.localStorage === 'undefined') return null;
  return globalThis.localStorage;
}

function readCache(key: string, ttlMs: number): ModelCatalogEntry[] | null {
  const now = Date.now();
  const mem = memoryCache.get(key);
  if (mem && now - mem.fetchedAt <= ttlMs) return mem.entries;
  if (mem) memoryCache.delete(key);

  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (now - entry.fetchedAt > ttlMs) {
      storage.removeItem(key);
      return null;
    }
    memoryCache.set(key, entry);
    return entry.entries;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

function writeCache(key: string, entries: ModelCatalogEntry[]): void {
  const entry: CacheEntry = { fetchedAt: Date.now(), entries };
  memoryCache.set(key, entry);
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    // Best-effort: quota/private-mode must never break AI setup.
  }
}

/** Test/teardown hook: clear the in-memory catalog cache. */
export function clearModelCatalogCache(): void {
  memoryCache.delete(CACHE_PREFIX);
}

// ------------------------------ Fetching -----------------------------------

const emptyCatalog: ModelCatalogEntry[] = [];

export async function fetchOpenRouterModels(): Promise<ModelCatalogEntry[]> {
  const cached = readCache(CACHE_PREFIX, DEFAULT_CATALOG_TTL_MS);
  if (cached) return cached;

  const res = await fetch(OPENROUTER_MODELS_URL);
  if (!res.ok) {
    throw new Error(`OpenRouter models request failed: HTTP ${res.status}`);
  }
  const parsed = normalize((await res.json()) as OpenRouterModelsResponse);
  if (parsed.length === 0) {
    throw new Error('OpenRouter models request returned no models');
  }
  writeCache(CACHE_PREFIX, parsed);
  return parsed;
}

function useOpenRouterModelsQuery() {
  return useQuery({
    queryKey: ['openrouter-model-catalog'],
    queryFn: fetchOpenRouterModels,
    staleTime: DEFAULT_CATALOG_TTL_MS,
    // The catalog is cosmetic metadata — don't hammer retries on flaky wifi.
    retry: 1,
  });
}

export function useModelCatalog() {
  const query = useOpenRouterModelsQuery();
  return {
    models: query.data ?? emptyCatalog,
    isLoading: query.isLoading,
    error: query.error ? String((query.error as Error).message) : null,
    refetch: query.refetch,
  };
}

// ----------------------------- Filtering -----------------------------------

/**
 * Substring search across id + name (case-insensitive). No thresholding —
 * a typed full model id that isn't in the catalog still resolves as a value;
 * the combobox treats the raw input as the selection.
 */
export function filterModels(
  models: ModelCatalogEntry[],
  query: string,
): ModelCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  return models.filter(
    (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
  );
}

interface RawOpenRouterModel {
  id?: string;
  name?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[] };
  pricing?: { prompt?: string; completion?: string };
}

interface OpenRouterModelsResponse {
  data?: RawOpenRouterModel[];
}
