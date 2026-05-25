// Multi-provider AI registry — see ADR-0005 and CONTEXT.md.
//
// This is the single source of truth for which provider+model combinations
// the app exposes. Onboarding/Settings dropdowns read from here; aiClient's
// provider factory reads from here. New models drop frequently — update
// MODELS_BY_PROVIDER and the matching DEFAULT_MODEL_BY_PROVIDER when they do.

import type { AIProvider } from '../types';

export interface AIModelOption {
  id: string;
  label: string;
}

export interface AIProviderOption {
  id: AIProvider;
  label: string;
  /** Where the user gets an API key. Shown as a link in the UI. */
  apiKeyUrl: string;
  /** Short copy under the provider name in the picker. */
  blurb: string;
}

export const PROVIDER_OPTIONS: AIProviderOption[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    blurb:
      'GPT models. Works without proxy; advanced users can configure one to enable web search.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    blurb:
      'Claude models. Works browser-direct. Strong reasoning for program generation.',
  },
  {
    id: 'google',
    label: 'Google',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    blurb: 'Gemini models. Works browser-direct. Cheap per call.',
  },
];

export const MODELS_BY_PROVIDER: Record<AIProvider, AIModelOption[]> = {
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini (cheap)' },
    { id: 'gpt-5', label: 'GPT-5' },
  ],
  anthropic: [
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (cheap)' },
  ],
  google: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (cheap)' },
  ],
};

export const DEFAULT_MODEL_BY_PROVIDER: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-6',
  google: 'gemini-2.5-flash',
};

export function isAIProvider(value: unknown): value is AIProvider {
  return value === 'openai' || value === 'anthropic' || value === 'google';
}

export function getProviderLabel(id: AIProvider): string {
  return PROVIDER_OPTIONS.find((p) => p.id === id)?.label ?? id;
}

export function getModelLabel(provider: AIProvider, modelId: string): string {
  return (
    MODELS_BY_PROVIDER[provider].find((m) => m.id === modelId)?.label ?? modelId
  );
}
