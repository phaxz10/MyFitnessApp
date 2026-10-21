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
  type StopCondition,
  stepCountIs,
  type Tool,
  type ToolSet,
  TypeValidationError,
} from 'ai';
import type { ZodType } from 'zod';
import {
  APP_REFERENCE_URL,
  APP_TITLE,
  OPENROUTER_BASE_URL,
  WEB_SEARCH_SUFFIX,
} from '../../constants/aiProviders';
import { useAppStore } from '../../hooks/useAppStore';
import type { AIProvider } from '../../types';
import { AIError } from './AIError';
import { modelSupportsReasoning } from './openrouterModels';

// ---------------------------------------------------------------------------
// Caching constants — see CONTEXT.md › Wrapper.
// ---------------------------------------------------------------------------
const CACHE_PREFIX = 'mypersonalfitness.aiResponseCache.v1';
const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const MAX_MEMORY_CACHE_SIZE = 100;
/** localStorage cap for AI cache entries; oldest are dropped on write. */
export const MAX_STORAGE_CACHE_ENTRIES = 200;
const DEFAULT_MAX_STEPS = 10;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Prompt = string | ModelMessage[];

export type ReasoningEffort = 'low' | 'medium' | 'high';

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
  /**
   * Extra stop conditions for tool loops (e.g. `hasToolCall('x')`), combined
   * with the maxSteps cap: the loop stops when ANY condition is met.
   */
  // biome-ignore lint/suspicious/noExplicitAny: tools shape is caller-specific.
  stopWhen?: StopCondition<any> | StopCondition<any>[];
  /**
   * Ask for OpenRouter reasoning at this effort. Only sent when the model
   * catalog says the model supports `reasoning`; otherwise ignored.
   */
  reasoning?: ReasoningEffort;
}

export interface AICacheOptions {
  namespace: string;
  ttlMs?: number;
  /**
   * Caller-chosen cache identity (e.g. normalised food text, an image hash).
   * Replaces the prompt as the key material; the instructions, schema name,
   * model and web-search flag are still part of the key, so a prompt-template
   * change in `instructions` still invalidates old entries.
   */
  key?: unknown;
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
// Provider factory — stateless, reads store on each call (ADR-0002, ADR-0007).
// OpenRouter is the single provider: OpenAI-API-compatible and CORS-friendly,
// so browser-direct calls need no proxy and every model rides one transport.
// ---------------------------------------------------------------------------

interface ActiveConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
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
  };
}

// Attribution metadata OpenRouter recommends for usage dashboards.
function buildLanguageModel(
  cfg: ActiveConfig,
  reasoning?: ReasoningEffort,
): LanguageModel {
  const openrouter = createOpenAI({
    apiKey: cfg.apiKey,
    baseURL: OPENROUTER_BASE_URL,
    headers: {
      'HTTP-Referer': APP_REFERENCE_URL,
      'X-Title': APP_TITLE,
    },
    ...(reasoning ? { fetch: createReasoningFetch(reasoning) } : {}),
  });
  // .chat(): the v3 default `openrouter(id)` targets the Responses API.
  return openrouter.chat(cfg.model);
}

// Reasoning: OpenRouter documents `reasoning: { effort, exclude }` in the
// request body; the SDK's providerOptions can only emit the undocumented
// top-level `reasoning_effort`. So a fetch wrapper rewrites the body — and
// only for models the cached catalog says support `reasoning` (behaviour for
// other models is undocumented). `exclude: true` keeps the reasoning text out
// of the response; the model still reasons. Exported for tests.
export function createReasoningFetch(
  effort: ReasoningEffort,
  baseFetch: typeof fetch = (...args) => globalThis.fetch(...args),
): typeof fetch {
  return (input, init) => {
    if (typeof init?.body !== 'string') return baseFetch(input, init);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return baseFetch(input, init);
    }
    if (typeof body.model !== 'string' || !modelSupportsReasoning(body.model)) {
      return baseFetch(input, init);
    }
    delete body.reasoning_effort;
    body.reasoning = { effort, exclude: true };
    return baseFetch(input, { ...init, body: JSON.stringify(body) });
  };
}

// Web search works differently through OpenRouter: there is no native
// web_search tool over the AI SDK transport, but OpenRouter offers a hosted
// web-search plugin enabled per-request by appending ':online' to the model id
// (billed via OpenRouter, no proxy needed). It is paid per request, so only
// the food-estimate Coaches ask for it.
//
// To keep Coaches provider-agnostic, webSearchTool() returns a sentinel and
// this module translates a `web_search` entry in the tools map into the suffix
// instead of sending a tool. See splitWebSearch() below.
const WEB_SEARCH_KEY = 'web_search';
/** Sentinel a Coach puts in its tools map to declare "this call wants web search". */
const WEB_SEARCH_SENTINEL = {
  description: "Sentinel for OpenRouter's hosted web-search plugin (:online).",
} as unknown as Tool;

// webSearchTool returns the web-search capability for the active config, or
// `undefined` when no key is configured (so the Coach skips the tool path).
export function webSearchTool(): Tool | undefined {
  const profile = useAppStore.getState().userProfile;
  if (!profile?.ai_api_key) return undefined;
  return WEB_SEARCH_SENTINEL;
}

// Splits a Coach's tools map into (real tools, web-search intent). The
// sentinel is never sent to the provider — it only flips the ':online' suffix
// on the outgoing model id.
function splitWebSearch(tools?: ToolSet): {
  tools: ToolSet | undefined;
  webSearch: boolean;
} {
  if (!tools) return { tools: undefined, webSearch: false };
  if (!(WEB_SEARCH_KEY in tools)) return { tools, webSearch: false };
  const rest: ToolSet = { ...tools };
  delete rest[WEB_SEARCH_KEY];
  return {
    tools: Object.keys(rest).length > 0 ? rest : undefined,
    webSearch: true,
  };
}

// Applies the web-search suffix to a model id. Idempotent (user-entered ids
// may already end in ':online').
function applyWebSearch(modelId: string): string {
  return modelId.endsWith(WEB_SEARCH_SUFFIX)
    ? modelId
    : modelId + WEB_SEARCH_SUFFIX;
}

function buildStopWhen(
  tools: ToolSet | undefined,
  maxSteps: number,
  extra: RespondOptions['stopWhen'],
  // biome-ignore lint/suspicious/noExplicitAny: tools shape is caller-specific.
): StopCondition<any>[] | undefined {
  if (!tools) return undefined;
  const extras = extra ? (Array.isArray(extra) ? extra : [extra]) : [];
  return [stepCountIs(maxSteps), ...extras];
}

// ---------------------------------------------------------------------------
// respond() — free-form text or tool-orchestrated calls.
// ---------------------------------------------------------------------------

export async function respond(opts: RespondOptions): Promise<RawResponse> {
  const cfg = readActiveConfig(opts.model);
  const { tools, webSearch } = splitWebSearch(opts.tools);
  if (webSearch) cfg.model = applyWebSearch(cfg.model);
  const model = buildLanguageModel(cfg, opts.reasoning);
  try {
    return (await generateText({
      model,
      system: opts.instructions,
      ...promptOrMessages(opts.prompt),
      tools,
      temperature: opts.temperature,
      stopWhen: buildStopWhen(
        tools,
        opts.maxSteps ?? DEFAULT_MAX_STEPS,
        opts.stopWhen,
      ),
    })) as RawResponse;
  } catch (err) {
    throw classifyError(err);
  }
}

// ---------------------------------------------------------------------------
// complete<T>() — single-turn JSON with optional Zod validation, cache,
// in-flight dedupe, local repair, and one paid retry on parse drift
// (see ADR-0003).
// ---------------------------------------------------------------------------

const RETRY_INSTRUCTION =
  'IMPORTANT: Your previous response did not match the required JSON schema. Return ONLY a single valid JSON object matching the exact format specified. No markdown code fences, no prose before or after, no arithmetic expressions, no comments. Every required field must be present.';

// Identical concurrent complete() calls (StrictMode double effects, a
// double-tap, two components asking the same question) share one request.
const inFlight = new Map<string, Promise<unknown>>();

interface PreparedCall {
  cfg: ActiveConfig;
  tools: ToolSet | undefined;
  schemaName: string;
  /** Persistent cache key, or null when the caller did not opt in. */
  cacheKey: string | null;
  /** Key identifying identical concurrent requests. */
  dedupeKey: string;
}

function prepareCall<T>(opts: CompleteOptions<T>): PreparedCall {
  const cfg = readActiveConfig(opts.model);
  const { tools, webSearch } = splitWebSearch(opts.tools);
  if (webSearch) cfg.model = applyWebSearch(cfg.model);
  const schemaName = toSchemaName(
    opts.schemaName ?? opts.cache?.namespace ?? 'ai_response',
  );
  const baseMaterial = {
    instructions: opts.instructions,
    // The sentinel never reaches the request body, so the effective tool
    // names are what matter for the key. Reflect web-search intent too —
    // a ':online' run must not collide with a plain one.
    toolNames: tools ? Object.keys(tools).sort() : undefined,
    webSearch,
    provider: cfg.provider,
    model: cfg.model,
    temperature: opts.temperature,
    schemaName,
    reasoning: opts.reasoning,
  };
  const cacheKey = opts.cache
    ? buildCacheKey(opts.cache.namespace, {
        ...baseMaterial,
        ...(opts.cache.key !== undefined
          ? { key: opts.cache.key }
          : { prompt: opts.prompt }),
      })
    : null;
  const dedupeKey =
    cacheKey ??
    buildCacheKey('inflight', { ...baseMaterial, prompt: opts.prompt });
  return { cfg, tools, schemaName, cacheKey, dedupeKey };
}

export async function complete<T = unknown>(
  opts: CompleteOptions<T>,
): Promise<T> {
  const call = prepareCall(opts);

  if (call.cacheKey) {
    const hit = readValidatedCache(
      call.cacheKey,
      opts.cache?.ttlMs ?? DEFAULT_CACHE_TTL_MS,
      opts.schema,
    );
    if (hit.found) return hit.value;
  }

  const pending = inFlight.get(call.dedupeKey);
  if (pending) return pending as Promise<T>;

  const promise = runComplete(opts, call).finally(() => {
    inFlight.delete(call.dedupeKey);
  });
  inFlight.set(call.dedupeKey, promise);
  return promise;
}

async function runComplete<T>(
  opts: CompleteOptions<T>,
  call: PreparedCall,
): Promise<T> {
  const ttlMs = opts.cache?.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const first = await attemptOnce(opts, call, opts.instructions);
  if (first.ok) {
    if (call.cacheKey) writeCache(call.cacheKey, first.data, ttlMs);
    return first.data;
  }

  const { error } = first;
  if (error.kind !== 'parse_failed' && error.kind !== 'schema_mismatch') {
    throw error;
  }

  // Free fix first: most drift is code fences, numbers as strings, or a
  // trailing comma. Only pay for a second request if local repair fails.
  if (first.rawText) {
    const repaired = repairJson(first.rawText, opts.schema);
    if (repaired.ok) {
      if (call.cacheKey) writeCache(call.cacheKey, repaired.value, ttlMs);
      return repaired.value;
    }
  }

  console.warn(
    `[aiClient] ${error.kind} on first attempt; retrying once with stricter prompt`,
    error.cause,
  );

  const retry = await attemptOnce(
    opts,
    call,
    opts.instructions
      ? `${opts.instructions}\n\n${RETRY_INSTRUCTION}`
      : RETRY_INSTRUCTION,
  );
  if (retry.ok) {
    // Cache under the ORIGINAL key so the next identical call is free.
    if (call.cacheKey) writeCache(call.cacheKey, retry.data, ttlMs);
    return retry.data;
  }
  if (retry.rawText) {
    const repaired = repairJson(retry.rawText, opts.schema);
    if (repaired.ok) {
      if (call.cacheKey) writeCache(call.cacheKey, repaired.value, ttlMs);
      return repaired.value;
    }
  }
  throw retry.error;
}

type AttemptResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AIError; rawText?: string };

async function attemptOnce<T>(
  opts: CompleteOptions<T>,
  call: PreparedCall,
  instructions: string | undefined,
): Promise<AttemptResult<T>> {
  const model = buildLanguageModel(call.cfg, opts.reasoning);
  // Vercel SDK v6 unifies structured output under generateText + Output.object
  // (generateObject is the older API; the docs steer everything through this
  // path). The structured-output step counts toward stopWhen, so when tools
  // are present we budget one extra step for the final formatted output.
  const stopWhen = buildStopWhen(
    call.tools,
    (opts.maxSteps ?? DEFAULT_MAX_STEPS) + (opts.schema ? 1 : 0),
    opts.stopWhen,
  );

  let rawText: string | undefined;
  try {
    let value: unknown;
    if (opts.schema) {
      const result = await generateText({
        model,
        system: instructions,
        ...promptOrMessages(opts.prompt),
        tools: call.tools,
        temperature: opts.temperature,
        stopWhen,
        output: Output.object({ schema: opts.schema, name: call.schemaName }),
      });
      value = result.output;
      rawText = safeStringify(value);
    } else {
      // Schemaless JSON path — parse the model's text ourselves.
      const result = await generateText({
        model,
        system: instructions,
        ...promptOrMessages(opts.prompt),
        tools: call.tools,
        temperature: opts.temperature,
        stopWhen,
      });
      rawText = result.text;
      try {
        value = JSON.parse(stripCodeFences(result.text));
      } catch (err) {
        throw new AIError('parse_failed', err);
      }
    }
    return { ok: true, data: validateParsed(value, opts.schema) };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      rawText = (err as { text?: string }).text ?? rawText;
    }
    return { ok: false, error: classifyError(err), rawText };
  }
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Local JSON repair — exported for tests.
// ---------------------------------------------------------------------------

export function repairJson<T>(
  rawText: string,
  schema: ZodType<T> | undefined,
): { ok: true; value: T } | { ok: false } {
  let text = stripCodeFences(rawText);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return { ok: false };
  text = text.slice(start, end + 1);

  const parsed =
    tryParse(text) ??
    tryParse(evaluateArithmetic(removeTrailingCommas(text))) ??
    undefined;
  if (parsed === undefined) return { ok: false };

  for (const candidate of [parsed, coerceNumericStrings(parsed)]) {
    if (!schema) return { ok: true, value: candidate as T };
    const result = schema.safeParse(candidate);
    if (result.success) return { ok: true, value: result.data };
  }
  return { ok: false };
}

function tryParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function removeTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1');
}

// Models sometimes emit `"calories": 1.5 * 186`. Evaluate simple numeric
// expressions that sit in value position (after a colon) — + - * / only.
function evaluateArithmetic(text: string): string {
  return text.replace(
    /:\s*(-?\d+(?:\.\d+)?(?:\s*[-+*/]\s*-?\d+(?:\.\d+)?)+)(?=\s*[,}\]])/g,
    (match, expr: string) => {
      const value = evalSimpleExpression(expr);
      return value === null ? match : `: ${value}`;
    },
  );
}

function evalSimpleExpression(expr: string): number | null {
  const tokens = expr.match(/-?\d+(?:\.\d+)?|[-+*/]/g);
  if (!tokens) return null;
  // Re-split so "3 -2" is (3, -, 2) rather than (3, -2).
  const normalized: (number | string)[] = [];
  for (const tok of tokens) {
    const prev = normalized[normalized.length - 1];
    if (/^-\d/.test(tok) && typeof prev === 'number') {
      normalized.push('-', Number(tok.slice(1)));
    } else if (/^[-+*/]$/.test(tok)) {
      normalized.push(tok);
    } else {
      normalized.push(Number(tok));
    }
  }
  // Pass 1: * and /. Pass 2: + and -.
  const terms: (number | string)[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const tok = normalized[i];
    if (tok === '*' || tok === '/') {
      const left = terms.pop();
      const right = normalized[++i];
      if (typeof left !== 'number' || typeof right !== 'number') return null;
      terms.push(tok === '*' ? left * right : left / right);
    } else {
      terms.push(tok);
    }
  }
  let total = terms[0];
  if (typeof total !== 'number') return null;
  for (let i = 1; i < terms.length; i += 2) {
    const op = terms[i];
    const right = terms[i + 1];
    if (typeof right !== 'number') return null;
    if (op === '+') total += right;
    else if (op === '-') total -= right;
    else return null;
  }
  return Number.isFinite(total) ? Math.round(total * 1000) / 1000 : null;
}

function coerceNumericStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    return /^\s*-?\d+(?:\.\d+)?\s*$/.test(value) ? Number(value) : value;
  }
  if (Array.isArray(value)) return value.map(coerceNumericStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        coerceNumericStrings(v),
      ]),
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Caller-managed cache entries — for Coaches that split a batch into cache
// hits and misses (e.g. exercise details per exercise name). Keys are scoped
// to the active provider + model like complete()'s own entries.
// ---------------------------------------------------------------------------

function scopedKey(namespace: string, material: unknown): string {
  const cfg = readActiveConfig();
  return buildCacheKey(namespace, {
    material,
    provider: cfg.provider,
    model: cfg.model,
  });
}

export function readAICache<T>(
  namespace: string,
  material: unknown,
  opts: { ttlMs?: number; schema?: ZodType<T> } = {},
): T | undefined {
  const hit = readValidatedCache(
    scopedKey(namespace, material),
    opts.ttlMs ?? DEFAULT_CACHE_TTL_MS,
    opts.schema,
  );
  return hit.found ? hit.value : undefined;
}

export function writeAICache(
  namespace: string,
  material: unknown,
  value: unknown,
  ttlMs: number = DEFAULT_CACHE_TTL_MS,
): void {
  writeCache(scopedKey(namespace, material), value, ttlMs);
}

/** Lowercase, trim and collapse whitespace — for text-based cache keys. */
export function normalizeCacheText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
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
  /** Absent on entries written before TTLs were stored. */
  ttlMs?: number;
  value: unknown;
}

const memoryCache = new Map<string, CacheEntry>();

function readValidatedCache<T>(
  key: string,
  ttlMs: number,
  schema: ZodType<T> | undefined,
): { found: true; value: T } | { found: false } {
  const cached = readCache(key, ttlMs);
  if (cached === null) return { found: false };
  if (!schema) return { found: true, value: cached as T };
  const result = schema.safeParse(cached);
  if (result.success) return { found: true, value: result.data };
  // Stale shape (schema changed since it was written) — drop and refetch.
  deleteCache(key);
  return { found: false };
}

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

function writeCache(key: string, value: unknown, ttlMs: number): void {
  const entry: CacheEntry = { createdAt: Date.now(), ttlMs, value };

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

  const serialized = JSON.stringify(entry);
  try {
    pruneAICacheStorage(
      storage,
      MAX_STORAGE_CACHE_ENTRIES - 1,
      entry.createdAt,
    );
    storage.setItem(key, serialized);
  } catch {
    // Quota hit: halve the cache and try once more. Still best-effort —
    // a full localStorage must never break AI.
    try {
      pruneAICacheStorage(
        storage,
        Math.floor(MAX_STORAGE_CACHE_ENTRIES / 2),
        entry.createdAt,
      );
      storage.setItem(key, serialized);
    } catch {
      // ignore
    }
  }
}

/**
 * Drops expired AI cache entries, then the oldest ones until at most
 * `maxEntries` remain. Only touches keys under the AI cache prefix.
 * Exported for tests.
 */
export function pruneAICacheStorage(
  storage: Storage,
  maxEntries: number,
  now: number = Date.now(),
): void {
  const live: { key: string; createdAt: number }[] = [];
  const toRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(CACHE_PREFIX)) continue;
    try {
      const entry = JSON.parse(storage.getItem(key) ?? '') as CacheEntry;
      const ttl = entry.ttlMs ?? DEFAULT_CACHE_TTL_MS;
      if (typeof entry.createdAt !== 'number' || now - entry.createdAt > ttl) {
        toRemove.push(key);
      } else {
        live.push({ key, createdAt: entry.createdAt });
      }
    } catch {
      toRemove.push(key);
    }
  }
  if (live.length > maxEntries) {
    live.sort((a, b) => a.createdAt - b.createdAt);
    for (const { key } of live.slice(0, live.length - maxEntries)) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) {
    storage.removeItem(key);
    memoryCache.delete(key);
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
  const storage = globalThis.localStorage as Storage | undefined;
  // Some test/SSR environments expose a partial stub; treat it as absent.
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function' ||
    typeof storage.key !== 'function'
  ) {
    return null;
  }
  return storage;
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

// cyrb53: fast non-cryptographic 53-bit hash. 53 bits (vs the old 32-bit
// FNV-1a) because image-hash keys must not collide — a collision would serve
// one meal's nutrition for another photo.
export function hashString(value: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
