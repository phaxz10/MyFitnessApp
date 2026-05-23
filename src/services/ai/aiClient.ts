import OpenAI from 'openai';
import type {
  Response as OpenAIResponse,
  ResponseInputItem,
  Tool,
} from 'openai/resources/responses/responses';
import type { ZodType } from 'zod';
import { useAppStore } from '../../hooks/useAppStore';
import { AIError } from './AIError';

const DEFAULT_MODEL = 'gpt-4o';

export interface RespondOptions {
  prompt: string | ResponseInputItem[];
  instructions?: string;
  tools?: Tool[];
  tool_choice?: 'auto' | 'required' | 'none';
  model?: string;
  temperature?: number;
}

export interface CompleteOptions<T> extends RespondOptions {
  schema?: ZodType<T>;
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
  const response = await respond(opts);
  const text = response.output_text ?? '';
  const cleaned = extractJson(stripCodeFences(text));

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // LLMs sometimes return arithmetic expressions instead of computed values
    // (e.g. "calories": 242 * 1.5). The result is valid JS, so evaluate it.
    try {
      parsed = new Function(`"use strict"; return (${cleaned})`)();
    } catch (err) {
      throw new AIError('parse_failed', err);
    }
  }

  if (opts.schema) {
    const result = opts.schema.safeParse(parsed);
    if (!result.success) {
      throw new AIError('schema_mismatch', result.error);
    }
    return result.data;
  }

  return parsed as T;
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

function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return text.substring(start, end + 1);
  }
  return text;
}
