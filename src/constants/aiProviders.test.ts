import { describe, expect, it } from 'vitest';
import type { AIProvider } from '../types';
import { DEFAULT_MODEL_BY_PROVIDER, MODELS_BY_PROVIDER } from './aiProviders';

const providers = Object.keys(MODELS_BY_PROVIDER) as AIProvider[];

describe('AI provider model registry', () => {
  it('keeps each provider default available in its model list', () => {
    for (const provider of providers) {
      const modelIds = MODELS_BY_PROVIDER[provider].map((model) => model.id);
      expect(modelIds).toContain(DEFAULT_MODEL_BY_PROVIDER[provider]);
    }
  });

  it('uses the recommended OpenAI model as the first dropdown option', () => {
    expect(MODELS_BY_PROVIDER.openai[0]?.id).toBe(
      DEFAULT_MODEL_BY_PROVIDER.openai,
    );
  });

  it('does not expose duplicate model ids per provider', () => {
    for (const provider of providers) {
      const modelIds = MODELS_BY_PROVIDER[provider].map((model) => model.id);
      expect(new Set(modelIds).size).toBe(modelIds.length);
    }
  });
});
