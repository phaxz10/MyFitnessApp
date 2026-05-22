export type AIErrorKind =
  | 'unavailable'
  | 'parse_failed'
  | 'schema_mismatch'
  | 'rate_limited'
  | 'server_error'
  | 'timeout';

export class AIError extends Error {
  readonly kind: AIErrorKind;
  readonly cause?: unknown;

  constructor(kind: AIErrorKind, cause?: unknown) {
    super(messageFor(kind, cause));
    this.name = 'AIError';
    this.kind = kind;
    this.cause = cause;
  }
}

function messageFor(kind: AIErrorKind, cause?: unknown): string {
  const base = `AI call failed: ${kind}`;
  if (cause instanceof Error && cause.message) {
    return `${base} — ${cause.message}`;
  }
  if (typeof cause === 'string' && cause.length > 0) {
    return `${base} — ${cause}`;
  }
  return base;
}

export function isAIError(value: unknown): value is AIError {
  return value instanceof AIError;
}
