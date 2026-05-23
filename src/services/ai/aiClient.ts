import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type {
  Response as OpenAIResponse,
  ResponseInputItem,
  ResponseTextConfig,
  Tool,
} from 'openai/resources/responses/responses';
import type { ZodType } from 'zod';
import { useAppStore } from '../../hooks/useAppStore';
import { AIError } from './AIError';

const DEFAULT_MODEL = 'gpt-4o';

// Two-tier cache: in-memory Map (instant) + localStorage (survives page reload).
// Key format: "{prefix}.{namespace}.{fnv1a-hash-of-inputs}"
const CACHE_PREFIX = 'mypersonalfitness.aiResponseCache.v1';
const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const MAX_MEMORY_CACHE_SIZE = 100;

export interface RespondOptions {
  prompt: string | ResponseInputItem[];
  instructions?: string;
  tools?: Tool[];
  tool_choice?: 'auto' | 'required' | 'none';
  model?: string;
  temperature?: number;
  text?: ResponseTextConfig;
}

export interface AICacheOptions {
  namespace: string;
  ttlMs?: number;
}

export interface CompleteOptions<T> extends RespondOptions {
  schema?: ZodType<T>;
  schemaName?: string;
  cache?: AICacheOptions;
}

type Client = OpenAI;
// We never request streaming, so narrow the union to the non-stream Response.
export type RawResponse = OpenAIResponse;

function buildClient(): Client {
  const profile = useAppStore.getState().userProfile;
  const apiKey = profile?.openai_api_key;
  if (!apiKey) {
    throw new AIError('unavailable', 'No OpenAI API key configured');
  }
  // If a proxy URL is configured (see worker/README.md), route through it.
  // The proxy adds CORS headers OpenAI omits on /v1/responses. Without a
  // proxy, calls to the Responses API fail with CORS in browsers.
  const proxyUrl = profile?.openai_proxy_url?.trim();
  const baseURL = proxyUrl ? `${proxyUrl.replace(/\/+$/, '')}/v1` : undefined;
  return new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true });
}

// Lower-level escape hatch: returns the raw SDK response so coaches can
// inspect tool calls, drive multi-turn conversations, etc.
export async function respond(opts: RespondOptions): Promise<RawResponse> {
  const client = buildClient();
  try {
    const response = await client.responses.create({
      model: opts.model ?? DEFAULT_MODEL,
      input: opts.prompt,
      instructions: opts.instructions,
      tools: opts.tools,
      tool_choice: opts.tool_choice,
      temperature: opts.temperature,
      text: opts.text,
      stream: false,
    });
    return response;
  } catch (err) {
    throw classifyTransportError(err);
  }
}

// Single-turn JSON-parse helper with optional Zod validation.
export async function complete<T = unknown>(
  opts: CompleteOptions<T>,
): Promise<T> {
  const model = opts.model ?? DEFAULT_MODEL;
  const schemaName = toSchemaName(
    opts.schemaName ?? opts.cache?.namespace ?? 'ai_response',
  );
  const cacheKey = opts.cache
    ? buildCacheKey(opts.cache.namespace, {
        prompt: opts.prompt,
        instructions: opts.instructions,
        tools: opts.tools,
        tool_choice: opts.tool_choice,
        model,
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

  const response = await respond({
    ...opts,
    model,
    text: buildResponseTextConfig(opts.schema, schemaName, opts.text),
  });
  const text = responseText(response);
  const cleaned = extractJson(stripCodeFences(text), opts.schema);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new AIError('parse_failed', err);
  }

  const data = validateParsed(parsed, opts.schema);

  if (cacheKey) {
    writeCache(cacheKey, data);
  }

  return data;
}

function classifyTransportError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  const status = (err as { status?: number } | null)?.status;
  if (status === 429) return new AIError('rate_limited', err);
  if (typeof status === 'number' && status >= 500)
    return new AIError('server_error', err);
  if (err instanceof Error && err.name === 'AbortError')
    return new AIError('timeout', err);
  return new AIError('server_error', err);
}

function stripCodeFences(text: string): string {
  return text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
}

function responseText(response: RawResponse): string {
  if (typeof response.output_text === 'string' && response.output_text.length) {
    return response.output_text;
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return '';

  const texts: string[] = [];
  for (const item of output) {
    if (!isObject(item) || item.type !== 'message') continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!isObject(part) || part.type !== 'output_text') continue;
      if (typeof part.text === 'string') texts.push(part.text);
    }
  }

  return texts.join('');
}

// LLMs sometimes wrap JSON in prose ("Here is the result: {...}") or include
// markdown citations before/after the payload. Scan for the first balanced
// object/array that actually parses as JSON and, when a schema exists, matches
// that schema.
function extractJson<T>(text: string, schema: ZodType<T> | undefined): string {
  let firstJsonCandidate: string | null = null;

  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{' && text[start] !== '[') continue;
    const end = findJsonEnd(text, start);
    if (end === -1) continue;

    const candidate = text.slice(start, end + 1);
    try {
      const parsed = JSON.parse(candidate);
      firstJsonCandidate ??= candidate;
      if (!schema || schema.safeParse(parsed).success) {
        return candidate;
      }
    } catch {
      // Markdown links such as [source](...) are balanced but not JSON.
    }
  }

  return firstJsonCandidate ?? text;
}

function findJsonEnd(text: string, start: number): number {
  const stack = [text[start]];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char !== '}' && char !== ']') continue;

    const opener = stack.pop();
    if ((char === '}' && opener !== '{') || (char === ']' && opener !== '[')) {
      return -1;
    }
    if (stack.length === 0) return index;
  }

  return -1;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validateParsed<T>(parsed: unknown, schema: ZodType<T> | undefined): T {
  if (!schema) return parsed as T;

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AIError('schema_mismatch', result.error);
  }
  return result.data;
}

function buildResponseTextConfig<T>(
  schema: ZodType<T> | undefined,
  schemaName: string,
  fallback: ResponseTextConfig | undefined,
): ResponseTextConfig | undefined {
  if (!schema) return fallback;

  try {
    return { format: zodTextFormat(schema, schemaName) };
  } catch {
    // The OpenAI helper only supports object-root schemas. Array-root schemas
    // still get validated after parsing, so fall back to prompt-guided JSON.
    return fallback;
  }
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
