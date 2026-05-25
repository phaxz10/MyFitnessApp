import {
  APICallError,
  type LanguageModelResponseMetadata,
  type LanguageModelUsage,
  NoObjectGeneratedError,
  TypeValidationError,
} from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Mock the high-level ai SDK functions so tests can control responses
// without round-tripping through a real provider model. Errors stay real
// (passed through from importActual) so our error-classification path runs
// against the actual class hierarchy.
//
// Note: aiClient routes all schema-bearing calls through generateText +
// Output.object per Vercel SDK v6 (generateObject was the older API).
const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateText: mocks.generateText,
  };
});

vi.mock('../../hooks/useAppStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({
      userProfile: {
        ai_provider: 'openai',
        ai_model: 'gpt-4o',
        ai_api_key: 'sk-test',
        ai_proxy_url: null,
      },
    })),
  },
}));

// vitest's node env provides a partial localStorage stub that's missing
// removeItem (causes the cache cleanup path to throw). Replace with a real
// in-memory shim so the cache layer exercises the same code paths it would
// in the browser.
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

// Imports MUST come after vi.mock so the mocked 'ai' module is what aiClient
// pulls in.
const { complete, respond } = await import('./aiClient');

const foodAnalysisSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      portion_grams: z.number(),
      calories: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
    }),
  ),
  total: z.object({
    calories: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
  }),
});

const foodAnalysis = {
  items: [
    {
      name: 'white rice (cooked)',
      portion_grams: 150,
      calories: 195,
      protein_g: 4.1,
      carbs_g: 42,
      fat_g: 0.5,
    },
  ],
  total: { calories: 195, protein_g: 4.1, carbs_g: 42, fat_g: 0.5 },
};

// Stub metadata used by NoObjectGeneratedError's constructor. The class
// accepts undefined readonly fields, but the ctor signature itself requires
// values — cast to bypass since these tests don't inspect them.
const dummyResponseMeta = {
  id: 'r',
  timestamp: new Date(),
  modelId: 'gpt-4o',
} as unknown as LanguageModelResponseMetadata;
const dummyUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
} as unknown as LanguageModelUsage;

// Helper: builds a fake NoObjectGeneratedError with a TypeValidationError
// cause (i.e. "AI returned something that didn't match the schema").
function makeSchemaMismatchError(): Error {
  const typeErr = new TypeValidationError({
    value: { items: 'not-an-array' },
    cause: new Error('items must be array'),
  });
  return new NoObjectGeneratedError({
    message: 'No object generated',
    cause: typeErr,
    text: '{ "items": "not-an-array" }',
    response: dummyResponseMeta,
    usage: dummyUsage,
    finishReason: 'stop',
  });
}

// Helper: builds a fake NoObjectGeneratedError with a JSON parse cause.
function makeParseError(): Error {
  return new NoObjectGeneratedError({
    message: 'No object generated',
    cause: new Error('Unexpected token'),
    text: 'sorry I cannot answer that',
    response: dummyResponseMeta,
    usage: dummyUsage,
    finishReason: 'stop',
  });
}

describe('aiClient.complete', () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
  });

  it('returns the typed object on a happy-path schema call', async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: '',
      output: foodAnalysis,
    });

    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
      }),
    ).resolves.toEqual(foodAnalysis);

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    const callArgs = mocks.generateText.mock.calls[0][0];
    expect(callArgs.output).toBeDefined();
  });

  it('passes tools through alongside Output.object when present', async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: '',
      output: foodAnalysis,
    });

    const fakeTool = { type: 'function' } as unknown as never;
    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
        tools: { web_search: fakeTool },
      }),
    ).resolves.toEqual(foodAnalysis);

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    const callArgs = mocks.generateText.mock.calls[0][0];
    expect(callArgs.output).toBeDefined();
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.stopWhen).toBeDefined();
  });

  it('retries once when the first response fails schema validation', async () => {
    mocks.generateText
      .mockRejectedValueOnce(makeSchemaMismatchError())
      .mockResolvedValueOnce({ text: '', output: foodAnalysis });

    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
      }),
    ).resolves.toEqual(foodAnalysis);

    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    const retryCall = mocks.generateText.mock.calls[1][0];
    expect(retryCall.system).toContain('previous response did not match');
  });

  it('retries once when the first response is unparseable JSON', async () => {
    mocks.generateText
      .mockRejectedValueOnce(makeParseError())
      .mockResolvedValueOnce({ text: '', output: foodAnalysis });

    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
      }),
    ).resolves.toEqual(foodAnalysis);

    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });

  it('does not retry on rate_limited (429)', async () => {
    mocks.generateText.mockRejectedValue(
      new APICallError({
        message: 'Too Many Requests',
        url: 'https://api.openai.com/v1/chat/completions',
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: {},
        responseBody: '',
        cause: undefined,
        isRetryable: false,
        data: undefined,
      }),
    );

    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
      }),
    ).rejects.toMatchObject({ kind: 'rate_limited' });

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it('gives up after the single retry on persistent schema mismatch', async () => {
    mocks.generateText.mockRejectedValue(makeSchemaMismatchError());

    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
      }),
    ).rejects.toMatchObject({ kind: 'schema_mismatch' });

    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });

  it('serves a cache hit without calling the model again', async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: '',
      output: foodAnalysis,
    });

    const first = await complete({
      prompt: 'unique-prompt-for-cache-test',
      schema: foodAnalysisSchema,
      schemaName: 'food_analysis',
      cache: { namespace: 'cache_test_namespace' },
    });
    expect(first).toEqual(foodAnalysis);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);

    const second = await complete({
      prompt: 'unique-prompt-for-cache-test',
      schema: foodAnalysisSchema,
      schemaName: 'food_analysis',
      cache: { namespace: 'cache_test_namespace' },
    });
    expect(second).toEqual(foodAnalysis);
    // No new model call — second hit served from cache.
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });
});

describe('aiClient.respond', () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
  });

  it('returns the GenerateTextResult shape (text + toolCalls)', async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: 'hello world',
      toolCalls: [],
      steps: [],
    });

    const result = await respond({ prompt: 'say hi' });
    expect(result.text).toBe('hello world');
  });
});
