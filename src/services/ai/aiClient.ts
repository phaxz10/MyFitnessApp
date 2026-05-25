import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import {
  APICallError,
  type GenerateTextResult,
  generateText,
  JSONParseError,
  type LanguageModel,
  type ModelMessage,
  NoObjectGeneratedError,
  Output,
  stepCountIs,
  type Tool,
  type ToolSet,
  TypeValidationError,
} from 'ai';
import type { ZodType } from 'zod';
import { useAppStore } from '../../hooks/useAppStore';
import type { AIProvider } from '../../types';
import { AIError } from './AIError';

// ---------------------------------------------------------------------------
// Caching constants — see CONTEXT.md › Wrapper.
// ---------------------------------------------------------------------------
const CACHE_PREFIX = 'mypersonalfitness.aiResponseCache.v1';
const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const MAX_MEMORY_CACHE_SIZE = 100;
const DEFAULT_MAX_STEPS = 10;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Prompt = string | ModelMessage[];

export interface RespondOptions {
  prompt: Prompt;
  /** System instruction (maps to Vercel's `system`). */
  instructions?: string;
  /** Tool definitions built via `tool()` from 'ai'. */
  tools?: ToolSet;
  /** Override the user's configured model for this call. */
  model?: string;
  temperature?: number;
  /** Maximum tool-orchestration steps. Defaults to 10. */
  maxSteps?: number;
}

export interface AICacheOptions {
  namespace: string;
  ttlMs?: number;
}

export interface CompleteOptions<T> extends RespondOptions {
  schema?: ZodType<T>;
  /** Stable name for the schema; used as the structured-output name. */
  schemaName?: string;
  cache?: AICacheOptions;
}

// Vercel's GenerateTextResult is the wrapper-level "raw response" — coaches
// that need text, tool calls, or steps reach into this type. ToolSet is `any`
// because callers can pass arbitrary tool maps.
// biome-ignore lint/suspicious/noExplicitAny: tools shape is caller-specific.
export type RawResponse = GenerateTextResult<any, never>;

// ---------------------------------------------------------------------------
// Provider factory — stateless, reads store on each call (ADR-0002).
// ---------------------------------------------------------------------------

interface ActiveConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  proxyUrl: string | undefined;
}

function readActiveConfig(modelOverride?: string): ActiveConfig {
  const profile = useAppStore.getState().userProfile;
  if (!profile?.ai_api_key) {
    throw new AIError('unavailable', 'No AI API key configured');
  }
  return {
    provider: profile.ai_provider,
    model: modelOverride ?? profile.ai_model,
    apiKey: profile.ai_api_key,
    proxyUrl: profile.ai_proxy_url?.trim() || undefined,
  };
}

function buildLanguageModel(cfg: ActiveConfig): LanguageModel {
  switch (cfg.provider) {
    case 'openai': {
      const baseURL = cfg.proxyUrl
        ? `${cfg.proxyUrl.replace(/\/+$/, '')}/v1`
        : undefined;
      const openai = createOpenAI({ apiKey: cfg.apiKey, baseURL });
      // Proxy configured → use the Responses API path so openai.tools.webSearch()
      // works. Without a proxy, plain chat completions has no CORS issue.
      return cfg.proxyUrl ? openai.responses(cfg.model) : openai(cfg.model);
    }
    case 'anthropic': {
      // Anthropic browser-direct only works with this header set.
      const anthropic = createAnthropic({
        apiKey: cfg.apiKey,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      });
      return anthropic(cfg.model);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey: cfg.apiKey });
      return google(cfg.model);
    }
  }
}

// webSearchTool returns the active provider's native web-search tool, or
// `undefined` when the provider can't expose one in the current config.
// OpenAI requires the Responses API (proxy) to use webSearch.
export function webSearchTool(): Tool | undefined {
  const profile = useAppStore.getState().userProfile;
  if (!profile?.ai_api_key) return undefined;
  const apiKey = profile.ai_api_key;
  const proxyUrl = profile.ai_proxy_url?.trim() || undefined;

  switch (profile.ai_provider) {
    case 'openai': {
      if (!proxyUrl) return undefined;
      const baseURL = `${proxyUrl.replace(/\/+$/, '')}/v1`;
      return createOpenAI({ apiKey, baseURL }).tools.webSearch({});
    }
    case 'anthropic':
      return createAnthropic({
        apiKey,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      }).tools.webSearch_20250305({});
    case 'google':
      return createGoogleGenerativeAI({ apiKey }).tools.googleSearch({});
  }
}

// ---------------------------------------------------------------------------
// respond() — free-form text or tool-orchestrated calls.
// ---------------------------------------------------------------------------

export async function respond(opts: RespondOptions): Promise<RawResponse> {
  const cfg = readActiveConfig(opts.model);
  const model = buildLanguageModel(cfg);
  try {
    return (await generateText({
      model,
      system: opts.instructions,
      ...promptOrMessages(opts.prompt),
      tools: opts.tools,
      temperature: opts.temperature,
      stopWhen: opts.tools
        ? stepCountIs(opts.maxSteps ?? DEFAULT_MAX_STEPS)
        : undefined,
    })) as RawResponse;
  } catch (err) {
    throw classifyError(err);
  }
}

// ---------------------------------------------------------------------------
// complete<T>() — single-turn JSON with optional Zod validation, cache, and
// one-shot retry on parse drift (see ADR-0003).
// ---------------------------------------------------------------------------

const RETRY_INSTRUCTION =
  'IMPORTANT: Your previous response did not match the required JSON schema. Return ONLY a single valid JSON object matching the exact format specified. No markdown code fences, no prose before or after, no arithmetic expressions, no comments. Every required field must be present.';

export async function complete<T = unknown>(
  opts: CompleteOptions<T>,
): Promise<T> {
  try {
    return await completeOnce(opts);
  } catch (err) {
    if (
      !(err instanceof AIError) ||
      (err.kind !== 'parse_failed' && err.kind !== 'schema_mismatch')
    ) {
      throw err;
    }

    console.warn(
      `[aiClient] ${err.kind} on first attempt; retrying once with stricter prompt`,
      err.cause,
    );

    return completeOnce({
      ...opts,
      cache: undefined,
      instructions: opts.instructions
        ? `${opts.instructions}\n\n${RETRY_INSTRUCTION}`
        : RETRY_INSTRUCTION,
    });
  }
}

async function completeOnce<T = unknown>(opts: CompleteOptions<T>): Promise<T> {
  const cfg = readActiveConfig(opts.model);
  const schemaName = toSchemaName(
    opts.schemaName ?? opts.cache?.namespace ?? 'ai_response',
  );
  const cacheKey = opts.cache
    ? buildCacheKey(opts.cache.namespace, {
        prompt: opts.prompt,
        instructions: opts.instructions,
        toolNames: opts.tools ? Object.keys(opts.tools).sort() : undefined,
        provider: cfg.provider,
        model: cfg.model,
        proxyUsed: !!cfg.proxyUrl,
        temperature: opts.temperature,
        schemaName,
      })
    : null;

  if (cacheKey) {
    const cached = readCache(
      cacheKey,
      opts.cache?.ttlMs ?? DEFAULT_CACHE_TTL_MS,
    );
    if (cached !== null) {
      try {
        return validateParsed(cached, opts.schema);
      } catch (err) {
        deleteCache(cacheKey);
        if (!(err instanceof AIError && err.kind === 'schema_mismatch')) {
          throw err;
        }
      }
    }
  }

  const model = buildLanguageModel(cfg);

  // Vercel SDK v6 unifies structured output under generateText + Output.object
  // (generateObject is the older API; the docs steer everything through this
  // path). The structured-output step counts toward stopWhen, so when tools
  // are present we budget one extra step for the final formatted output.
  const baseStopWhen = opts.tools
    ? stepCountIs((opts.maxSteps ?? DEFAULT_MAX_STEPS) + (opts.schema ? 1 : 0))
    : undefined;

  try {
    let value: unknown;

    if (opts.schema) {
      const result = await generateText({
        model,
        system: opts.instructions,
        ...promptOrMessages(opts.prompt),
        tools: opts.tools,
        temperature: opts.temperature,
        stopWhen: baseStopWhen,
        output: Output.object({ schema: opts.schema, name: schemaName }),
      });
      value = result.output;
    } else {
      // Schemaless JSON path — parse the model's text ourselves.
      const result = await generateText({
        model,
        system: opts.instructions,
        ...promptOrMessages(opts.prompt),
        tools: opts.tools,
        temperature: opts.temperature,
        stopWhen: baseStopWhen,
      });
      try {
        value = JSON.parse(stripCodeFences(result.text));
      } catch (err) {
        throw new AIError('parse_failed', err);
      }
    }

    const data = validateParsed(value, opts.schema);
    if (cacheKey) writeCache(cacheKey, data);
    return data;
  } catch (err) {
    throw classifyError(err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function promptOrMessages(
  p: Prompt,
): { prompt: string } | { messages: ModelMessage[] } {
  return typeof p === 'string' ? { prompt: p } : { messages: p };
}

function classifyError(err: unknown): AIError {
  if (err instanceof AIError) return err;

  // Vercel's structured-output errors collapse to parse/schema mismatch.
  if (NoObjectGeneratedError.isInstance(err)) {
    // NoObjectGeneratedError wraps either a JSON parse failure or a Zod
    // mismatch in `cause`. Distinguish so the retry layer can branch.
    const cause = (err as { cause?: unknown }).cause;
    if (cause && TypeValidationError.isInstance(cause)) {
      return new AIError('schema_mismatch', err);
    }
    return new AIError('parse_failed', err);
  }
  if (TypeValidationError.isInstance(err)) {
    return new AIError('schema_mismatch', err);
  }
  if (JSONParseError.isInstance(err)) {
    return new AIError('parse_failed', err);
  }

  if (APICallError.isInstance(err)) {
    const status = err.statusCode ?? 0;
    if (status === 429) return new AIError('rate_limited', err);
    if (status >= 500) return new AIError('server_error', err);
    if (status === 401 || status === 403) {
      return new AIError('unavailable', err);
    }
  }

  if (err instanceof Error && err.name === 'AbortError') {
    return new AIError('timeout', err);
  }

  return new AIError('server_error', err);
}

function stripCodeFences(text: string): string {
  return text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
}

function validateParsed<T>(parsed: unknown, schema: ZodType<T> | undefined): T {
  if (!schema) return parsed as T;
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AIError('schema_mismatch', result.error);
  }
  return result.data;
}

function toSchemaName(name: string): string {
  const normalized = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return normalized.length > 0 ? normalized : 'ai_response';
}

function buildCacheKey(namespace: string, material: unknown): string {
  return `${CACHE_PREFIX}.${toSchemaName(namespace)}.${hashString(
    stableStringify(material),
  )}`;
}

interface CacheEntry {
  createdAt: number;
  value: unknown;
}

const memoryCache = new Map<string, CacheEntry>();

function readCache(key: string, ttlMs: number): unknown | null {
  const now = Date.now();
  const memoryEntry = memoryCache.get(key);
  if (memoryEntry && now - memoryEntry.createdAt <= ttlMs) {
    return memoryEntry.value;
  }
  if (memoryEntry) memoryCache.delete(key);

  const storage = getLocalStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const entry = JSON.parse(raw) as CacheEntry;
    if (now - entry.createdAt > ttlMs) {
      storage.removeItem(key);
      return null;
    }

    memoryCache.set(key, entry);
    return entry.value;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  const entry: CacheEntry = { createdAt: Date.now(), value };

  // LRU eviction: if at capacity, drop the oldest entry by createdAt.
  if (memoryCache.size >= MAX_MEMORY_CACHE_SIZE && !memoryCache.has(key)) {
    let oldestKey: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [k, v] of memoryCache) {
      if (v.createdAt < oldestTime) {
        oldestTime = v.createdAt;
        oldestKey = k;
      }
    }
    if (oldestKey) memoryCache.delete(oldestKey);
  }

  memoryCache.set(key, entry);

  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    // Best-effort cache: quota/private-mode failures should never break AI.
  }
}

function deleteCache(key: string): void {
  memoryCache.delete(key);
  const storage = getLocalStorage();
  if (!storage) return;
  storage.removeItem(key);
}

/** Clear all AI response caches (memory + localStorage). Call on sign-out or profile reset. */
export function clearAICache(): void {
  memoryCache.clear();
  const storage = getLocalStorage();
  if (!storage) return;
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) {
      storage.removeItem(key);
    }
  }
}

function getLocalStorage(): Storage | null {
  if (typeof globalThis.localStorage === 'undefined') return null;
  return globalThis.localStorage;
}

// JSON.stringify doesn't guarantee key order, so identical objects could produce
// different strings. This sorts keys recursively to ensure the same inputs
// always produce the same cache key, regardless of property insertion order.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

// FNV-1a hash: fast, non-cryptographic hash for cache key generation.
// Produces a compact base-36 string from the stable-stringified input.
function hashString(value: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  return (hash >>> 0).toString(36);
}
