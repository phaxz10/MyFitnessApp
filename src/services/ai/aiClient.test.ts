import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { complete } from './aiClient';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  OpenAI: vi.fn(),
}));

vi.mock('openai', () => ({
  default: mocks.OpenAI,
}));

vi.mock('../../hooks/useAppStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({
      userProfile: {
        openai_api_key: 'sk-test',
        openai_proxy_url: '',
      },
    })),
  },
}));

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
  total: {
    calories: 195,
    protein_g: 4.1,
    carbs_g: 42,
    fat_g: 0.5,
  },
};

describe('aiClient.complete', () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.OpenAI.mockReset();
    mocks.OpenAI.mockImplementation(function OpenAIMock() {
      return {
        responses: {
          create: mocks.create,
        },
      };
    });
  });

  it('parses Responses API output text when the SDK helper field is absent', async () => {
    mocks.create.mockResolvedValue({
      object: 'response',
      output: [
        {
          type: 'web_search_call',
          status: 'completed',
        },
        {
          type: 'message',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: `Here is the nutritional breakdown:\n\n${JSON.stringify(
                foodAnalysis,
                null,
                2,
              )}\n\nDetails: [source](https://example.com)`,
            },
          ],
          role: 'assistant',
        },
      ],
    });

    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
      }),
    ).resolves.toEqual(foodAnalysis);
  });

  it('does not mistake markdown citation brackets before JSON for the JSON payload', async () => {
    mocks.create.mockResolvedValue({
      output_text: `Using [nutrition data](https://example.com), here is the result:\n\n${JSON.stringify(
        foodAnalysis,
      )}`,
      output: [],
    });

    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
      }),
    ).resolves.toEqual(foodAnalysis);
  });

  it('skips parseable citation footnotes that do not match the schema', async () => {
    mocks.create.mockResolvedValue({
      output_text: `Using source [1], here is the result:\n\n${JSON.stringify(
        foodAnalysis,
      )}`,
      output: [],
    });

    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
      }),
    ).resolves.toEqual(foodAnalysis);
  });

  it('requests structured JSON when a schema is provided', async () => {
    mocks.create.mockResolvedValue({
      output_text: JSON.stringify(foodAnalysis),
      output: [],
    });

    await complete({
      prompt: '150g white rice',
      schema: foodAnalysisSchema,
      schemaName: 'food_analysis',
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.objectContaining({
          format: expect.objectContaining({
            name: 'food_analysis',
            type: 'json_schema',
          }),
        }),
      }),
    );
  });

  it('retries once when the first response is unparseable JSON', async () => {
    // First call returns prose that contains no valid JSON object;
    // second call returns valid JSON. The retry should succeed.
    mocks.create
      .mockResolvedValueOnce({
        output_text: 'sorry I cannot answer that',
        output: [],
      })
      .mockResolvedValueOnce({
        output_text: JSON.stringify(foodAnalysis),
        output: [],
      });

    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
      }),
    ).resolves.toEqual(foodAnalysis);

    expect(mocks.create).toHaveBeenCalledTimes(2);
    const retryCall = mocks.create.mock.calls[1][0];
    expect(retryCall.instructions).toContain(
      'previous response did not match',
    );
  });

  it('retries once when the first response fails schema validation', async () => {
    const wrongShape = {
      items: 'not-an-array',
      total: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    };
    mocks.create
      .mockResolvedValueOnce({
        output_text: JSON.stringify(wrongShape),
        output: [],
      })
      .mockResolvedValueOnce({
        output_text: JSON.stringify(foodAnalysis),
        output: [],
      });

    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
      }),
    ).resolves.toEqual(foodAnalysis);

    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it('does not retry on rate_limited or transport errors', async () => {
    mocks.create.mockRejectedValue(
      Object.assign(new Error('Too Many Requests'), { status: 429 }),
    );

    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
      }),
    ).rejects.toMatchObject({ kind: 'rate_limited' });

    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('gives up after the single retry on persistent schema mismatch', async () => {
    const wrongShape = { items: 'not-an-array' };
    mocks.create.mockResolvedValue({
      output_text: JSON.stringify(wrongShape),
      output: [],
    });

    await expect(
      complete({
        prompt: '150g white rice',
        schema: foodAnalysisSchema,
        schemaName: 'food_analysis',
      }),
    ).rejects.toMatchObject({ kind: 'schema_mismatch' });

    // 1 initial + 1 retry = 2 calls, no third attempt
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
});
