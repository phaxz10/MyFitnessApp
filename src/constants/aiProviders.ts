// Central AI config — see ADR-0007 (single provider: OpenRouter).
//
// The old per-vendor registry (openai/anthropic/google) is gone: OpenRouter is
// OpenAI-API-compatible and CORS-friendly, so one provider id and one transport
// cover every model. The live model list is NOT hard-coded here — it comes from
// OpenRouter's public models endpoint via `src/services/ai/openrouterModels.ts`
// (see the ModelCombobox). This file holds only what that service and the rest
// of the app need: the provider constant, endpoints, and OpenRouter quirks.

import type { AIProvider } from '../types';

/** The one supported provider. The Profile carries it; keep for readability. */
export const AI_PROVIDER: AIProvider = 'openrouter';

export function isAIProvider(value: unknown): value is AIProvider {
  return value === 'openrouter';
}

/** Where the user gets an OpenRouter API key. Shown as a link in the UI. */
export const API_KEY_URL = 'https://openrouter.ai/keys';

export const PROVIDER_LABEL = 'OpenRouter';

export const PROVIDER_BLURB =
  'One key, every model — OpenAI, Anthropic, Google, Meta, Mistral and more. Pay OpenRouter per request.';

/**
 * `fetchOpenRouterModels` fallback: not a recommended model, just the
 * DB/migration default so a Profile row always satisfies NOT NULL. Users who
 * actually configure AI always pick a model through the combobox.
 */
export const FALLBACK_MODEL = 'openai/gpt-4o-mini';

/** OpenRouter's API base (OpenAI-compatible; browser-direct works). */
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Public, no-auth models listing — powers the model combobox. */
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/**
 * Suffix that turns on OpenRouter's hosted web-search plugin for a model.
 * Coaches request web search symbolically (webSearchTool() → sentinel) and the
 * Wrapper translates that to this suffix instead of a native tool — OpenRouter
 * has no native web_search tool over the AI SDK transport.
 */
export const WEB_SEARCH_SUFFIX = ':online';

/**
 * Ad-hoc attribution recommended by OpenRouter for API usage stats. Sent as
 * HTTP-Referer / X-Title on chat requests (not CORS-relevant, just metadata).
 */
export const APP_REFERENCE_URL = 'https://mypersonalfitness.app';
export const APP_TITLE = 'MyPersonalFitness';

/**
 * Maps a legacy (ADR-0005, pre-OpenRouter) model id onto the matching
 * OpenRouter slug, e.g. `gpt-4o` → `openai/gpt-4o`. Ids that already look like
 * OpenRouter slugs (contain `/`) or unknown shapes pass through untouched —
 * worst case is a legible runtime API error, same as a stale model id.
 */
export function toOpenRouterModelId(modelId: string): string {
  if (modelId.includes('/')) return modelId;
  if (modelId.startsWith('gpt')) return `openai/${modelId}`;
  if (modelId.startsWith('claude')) return `anthropic/${modelId}`;
  if (modelId.startsWith('gemini')) return `google/${modelId}`;
  return modelId;
}
