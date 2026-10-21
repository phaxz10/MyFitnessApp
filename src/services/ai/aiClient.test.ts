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
        ai_provider: 'openrouter',
        ai_model: 'openai/gpt-4o-mini',
        ai_api_key: 'sk-or-test',
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
const {
  complete,
  respond,
  clearAICache,
  pruneAICacheStorage,
  repairJson,
  MAX_STORAGE_CACHE_ENTRIES,
} = await import('./aiClient');

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
    // 'web_search' is a reserved key (the Wrapper strips it and applies
    // OpenRouter's :online suffix — covered in its own test below), so real
    // passthrough is asserted with a non-sentinel name.
    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
        tools: { other_tool: fakeTool },
      }),
    ).resolves.toEqual(foodAnalysis);

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    const callArgs = mocks.generateText.mock.calls[0][0];
    expect(callArgs.output).toBeDefined();
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.stopWhen).toBeDefined();
  });

  it('translates a web_search tool into the OpenRouter :online suffix', async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: '',
      output: foodAnalysis,
    });

    // Coaches specify web search via webSearchTool()'s sentinel; the Wrapper
    // must convert it to OpenRouter's hosted web plugin instead of sending
    // the sentinel as a real tool.
    const { webSearchTool } = await import('./aiClient');
    await expect(
      complete({
        prompt: 'a Big Mac',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
        tools: { web_search: webSearchTool() as never },
      }),
    ).resolves.toEqual(foodAnalysis);

    const callArgs = mocks.generateText.mock.calls[0][0];
    // The sentinel must not reach the provider, and the model id gains the
    // hosted web plugin suffix.
    expect(callArgs.tools).toBeUndefined();
    expect(String(callArgs.model.modelId)).toBe('openai/gpt-4o-mini:online');
  });

  it('strips the web_search sentinel alongside other real tools', async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: '',
      output: foodAnalysis,
    });

    const { webSearchTool } = await import('./aiClient');
    const fakeTool = { type: 'function' } as unknown as never;
    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
        tools: { web_search: webSearchTool() as never, other: fakeTool },
      }),
    ).resolves.toEqual(foodAnalysis);

    const callArgs = mocks.generateText.mock.calls[0][0];
    expect(callArgs.tools).toBeDefined();
    expect(Object.keys(callArgs.tools)).toEqual(['other']);
    expect(String(callArgs.model.modelId)).toBe('openai/gpt-4o-mini:online');
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

describe('aiClient transport', () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
  });

  // OpenRouter is used via its OpenAI-compatible chat completions endpoint.
  // @ai-sdk/openai v3's default `provider(id)` builds a Responses API model,
  // which hits /responses instead (ADR-0007).
  it('targets OpenRouter chat completions, not the Responses API', async () => {
    mocks.generateText.mockResolvedValueOnce({ text: 'ok', steps: [] });
    await respond({ prompt: 'ping' });
    const { model } = mocks.generateText.mock.calls[0][0];
    expect(model.provider).toBe('openai.chat');
    expect(model.modelId).toBe('openai/gpt-4o-mini');
  });
});

describe('aiClient cost controls', () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
    clearAICache();
  });

  it('dedupes identical concurrent calls into one request', async () => {
    let resolve: (v: unknown) => void = () => {};
    mocks.generateText.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const opts = {
      prompt: 'concurrent-dedupe-prompt',
      schema: foodAnalysisSchema,
      schemaName: 'food_analysis',
    };
    const a = complete(opts);
    const b = complete(opts);
    resolve({ text: '', output: foodAnalysis });
    await expect(Promise.all([a, b])).resolves.toEqual([
      foodAnalysis,
      foodAnalysis,
    ]);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);

    // Once settled, a new call is a new request (no stale promise kept).
    mocks.generateText.mockResolvedValueOnce({
      text: '',
      output: foodAnalysis,
    });
    await complete(opts);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });

  it('repairs fenced JSON with numeric strings locally, without a paid retry', async () => {
    const drifted = {
      ...foodAnalysis,
      items: [
        { ...foodAnalysis.items[0], calories: '195', portion_grams: '150' },
      ],
    };
    mocks.generateText.mockRejectedValueOnce(
      new NoObjectGeneratedError({
        message: 'No object generated',
        cause: new TypeValidationError({
          value: drifted,
          cause: new Error('expected number'),
        }),
        text: `\`\`\`json\n${JSON.stringify(drifted)},\n\`\`\``,
        response: dummyResponseMeta,
        usage: dummyUsage,
        finishReason: 'stop',
      }),
    );

    await expect(
      complete({
        prompt: 'repair-me',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
      }),
    ).resolves.toEqual(foodAnalysis);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it('writes the paid-retry result to the cache under the original key', async () => {
    mocks.generateText
      .mockRejectedValueOnce(makeParseError())
      .mockResolvedValueOnce({ text: '', output: foodAnalysis });
    const opts = {
      prompt: 'retry-then-cache',
      schema: foodAnalysisSchema,
      schemaName: 'food_analysis',
      cache: { namespace: 'retry_cache_test' },
    };
    await expect(complete(opts)).resolves.toEqual(foodAnalysis);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);

    await expect(complete(opts)).resolves.toEqual(foodAnalysis);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });

  it('combines stopWhen with the step cap on tool calls', async () => {
    mocks.generateText.mockResolvedValueOnce({ text: '', steps: [] });
    const { hasToolCall } = await import('ai');
    await respond({
      prompt: 'tools',
      tools: { t: { type: 'function' } as never },
      stopWhen: hasToolCall('t'),
    });
    const { stopWhen } = mocks.generateText.mock.calls[0][0];
    expect(Array.isArray(stopWhen)).toBe(true);
    expect(stopWhen).toHaveLength(2);
  });
});

describe('repairJson', () => {
  it('evaluates arithmetic and trailing commas', () => {
    const result = repairJson('{"a": 1.5 * 186, "b": 10 - 2 * 3,}', undefined);
    expect(result).toEqual({ ok: true, value: { a: 279, b: 4 } });
  });

  it('gives up on prose', () => {
    expect(repairJson('sorry, no', foodAnalysisSchema)).toEqual({ ok: false });
  });
});

describe('pruneAICacheStorage', () => {
  const PREFIX = 'mypersonalfitness.aiResponseCache.v1.test.';

  it('drops expired entries, then the oldest beyond the cap', () => {
    const storage = new TestStorage() as unknown as Storage;
    const now = 1_000_000_000;
    storage.setItem('unrelated.key', 'keep me');
    storage.setItem(
      `${PREFIX}expired`,
      JSON.stringify({ createdAt: now - 1000, ttlMs: 500, value: 1 }),
    );
    storage.setItem(`${PREFIX}garbage`, '{not json');
    for (let i = 0; i < MAX_STORAGE_CACHE_ENTRIES + 10; i++) {
      storage.setItem(
        `${PREFIX}${i}`,
        JSON.stringify({ createdAt: now - 100_000 + i, ttlMs: 1e9, value: i }),
      );
    }

    pruneAICacheStorage(storage, MAX_STORAGE_CACHE_ENTRIES, now);

    const keys = Array.from({ length: storage.length }, (_, i) =>
      storage.key(i),
    );
    const cacheKeys = keys.filter((k) => k?.startsWith(PREFIX));
    expect(cacheKeys).toHaveLength(MAX_STORAGE_CACHE_ENTRIES);
    expect(storage.getItem(`${PREFIX}expired`)).toBeNull();
    expect(storage.getItem(`${PREFIX}garbage`)).toBeNull();
    // Oldest ten (0..9) evicted, newest kept.
    expect(storage.getItem(`${PREFIX}0`)).toBeNull();
    expect(storage.getItem(`${PREFIX}9`)).toBeNull();
    expect(storage.getItem(`${PREFIX}10`)).not.toBeNull();
    expect(storage.getItem('unrelated.key')).toBe('keep me');
  });

  it('keeps localStorage bounded as complete() writes', async () => {
    for (let i = 0; i < MAX_STORAGE_CACHE_ENTRIES + 5; i++) {
      mocks.generateText.mockResolvedValueOnce({
        text: '',
        output: foodAnalysis,
      });
      await complete({
        prompt: `bounded-${i}`,
        schema: foodAnalysisSchema,
        cache: { namespace: 'bounded' },
      });
    }
    const count = Array.from({ length: localStorage.length }, (_, i) =>
      localStorage.key(i),
    ).filter((k) => k?.startsWith('mypersonalfitness.aiResponseCache')).length;
    expect(count).toBeLessThanOrEqual(MAX_STORAGE_CACHE_ENTRIES);
  });
});

describe('reasoning request body', () => {
  const CATALOG_KEY = 'mypersonalfitness.openrouterModelCatalog.v3';
  const catalogEntry = (id: string, reasoning: boolean) => ({
    id,
    name: id,
    vision: true,
    tools: true,
    reasoning,
    free: false,
    inputPricePerM: 1,
    outputPricePerM: 1,
    contextLength: 1000,
  });

  beforeEach(async () => {
    mocks.generateText.mockReset();
    const { clearModelCatalogCache } = await import('./openrouterModels');
    clearModelCatalogCache();
    localStorage.setItem(
      CATALOG_KEY,
      JSON.stringify({
        fetchedAt: Date.now(),
        entries: [
          catalogEntry('deepseek/deepseek-r1', true),
          catalogEntry('openai/gpt-4o-mini', false),
        ],
      }),
    );
  });

  async function send(model: string, extra: Record<string, unknown> = {}) {
    const { createReasoningFetch } = await import('./aiClient');
    const base = vi.fn(async () => new Response('{}'));
    const wrapped = createReasoningFetch('medium', base as never);
    const original = JSON.stringify({ model, messages: [], ...extra });
    await wrapped('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      body: original,
    });
    const sent = (base.mock.calls[0] as unknown[])[1] as RequestInit;
    return { original, sent: sent.body as string };
  }

  it('adds reasoning {effort, exclude} for a model that advertises it', async () => {
    const { sent } = await send('deepseek/deepseek-r1', {
      reasoning_effort: 'high',
    });
    const body = JSON.parse(sent);
    expect(body.reasoning).toEqual({ effort: 'medium', exclude: true });
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('looks the model up without the :online suffix', async () => {
    const { sent } = await send('deepseek/deepseek-r1:online');
    expect(JSON.parse(sent).reasoning).toEqual({
      effort: 'medium',
      exclude: true,
    });
  });

  it('leaves the body untouched for a non-supporting model', async () => {
    const { original, sent } = await send('openai/gpt-4o-mini');
    expect(sent).toBe(original);
  });

  it('leaves the body untouched for an unknown model or no catalog', async () => {
    const unknown = await send('someone/new-model');
    expect(unknown.sent).toBe(unknown.original);

    const { clearModelCatalogCache } = await import('./openrouterModels');
    clearModelCatalogCache();
    localStorage.removeItem(CATALOG_KEY);
    const noCatalog = await send('deepseek/deepseek-r1');
    expect(noCatalog.sent).toBe(noCatalog.original);
  });

  it('never sends reasoning_effort from the SDK path', async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: '',
      output: foodAnalysis,
    });
    await complete({
      prompt: 'reasoning-sdk-path',
      schema: foodAnalysisSchema,
      reasoning: 'medium',
    });
    // Reasoning rides the fetch wrapper, not providerOptions (which would
    // emit the undocumented top-level reasoning_effort).
    const args = mocks.generateText.mock.calls[0][0];
    expect(args.providerOptions).toBeUndefined();
  });

  it('keys the cache on the reasoning level', async () => {
    clearAICache();
    mocks.generateText.mockResolvedValue({ text: '', output: foodAnalysis });
    const base = {
      prompt: 'reasoning-cache-key',
      schema: foodAnalysisSchema,
      cache: { namespace: 'reasoning_key' },
    };
    await complete(base);
    await complete({ ...base, reasoning: 'low' as const });
    await complete({ ...base, reasoning: 'low' as const });
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });
});
