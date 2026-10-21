import { describe, expect, it } from 'vitest';
import {
  AI_PROVIDER,
  FALLBACK_MODEL,
  toOpenRouterModelId,
} from './aiProviders';

describe('OpenRouter provider registry', () => {
  it('exposes OpenRouter as the single provider', () => {
    expect(AI_PROVIDER).toBe('openrouter');
  });

  it('keeps the fallback model as a valid OpenRouter slug', () => {
    // Vendor-prefixed slug so the DB default is always a routable model.
    expect(FALLBACK_MODEL).toMatch(/^[a-z0-9_-]+\/[a-z0-9._-]+$/i);
  });

  describe('toOpenRouterModelId', () => {
    it('prefixes legacy vendor ids with their OpenRouter vendor slug', () => {
      expect(toOpenRouterModelId('gpt-4o')).toBe('openai/gpt-4o');
      expect(toOpenRouterModelId('claude-sonnet-4-6')).toBe(
        'anthropic/claude-sonnet-4-6',
      );
      expect(toOpenRouterModelId('gemini-2.5-flash')).toBe(
        'google/gemini-2.5-flash',
      );
    });

    it('passes OpenRouter slugs and unknown ids through untouched', () => {
      expect(toOpenRouterModelId('openai/gpt-4o')).toBe('openai/gpt-4o');
      expect(toOpenRouterModelId('meta-llama/llama-3.3-70b-instruct')).toBe(
        'meta-llama/llama-3.3-70b-instruct',
      );
      expect(toOpenRouterModelId('some-unknown-id')).toBe('some-unknown-id');
    });
  });
});
