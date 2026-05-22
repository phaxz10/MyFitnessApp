import { isAIError } from '../../services/ai/AIError';

export function describeAIError(err: unknown, fallback: string): string {
  if (!isAIError(err)) return fallback;
  switch (err.kind) {
    case 'unavailable':
      return 'AI is not configured. Add an OpenAI key in Settings.';
    case 'parse_failed':
    case 'schema_mismatch':
      return 'AI returned an unexpected response. Please try again.';
    case 'rate_limited':
      return 'OpenAI rate limit reached. Please wait a moment and try again.';
    case 'timeout':
      return 'AI took too long to respond. Please try again.';
    case 'server_error':
      return fallback;
    default:
      return fallback;
  }
}
