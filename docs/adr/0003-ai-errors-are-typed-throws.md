# ADR-0003 — AI errors are typed throws; response validation is opt-in Zod

- **Status**: Accepted
- **Date**: 2026-05-22
- **Deciders**: jonathan (product owner)

## Context

The rest of the codebase signals failure by throwing — see [useCalories.ts](src/hooks/useCalories.ts), [useProfile.ts](src/hooks/useProfile.ts), [autoBackup.ts](src/services/autoBackup.ts). Mutations live behind TanStack Query, which surfaces the throw on `mutation.error`. Adding a `Result<T, E>` idiom solely for AI would be a stylistic outlier requiring wrappers wherever AI calls are used inside mutations.

Separately: today every AI function does `JSON.parse(cleanJsonResponse(...))` and casts the result. Zero validation. AI model responses drift over time; an unrecognised shape crashes downstream UI rather than surfacing as a recognisable error.

## Decision

### Errors are typed throws

`aiClient.complete()` throws a single `AIError` class with a `kind` discriminator:

```typescript
class AIError extends Error {
  constructor(
    public readonly kind:
      | 'unavailable'      // capability not configured (no key)
      | 'parse_failed'     // JSON parse failed
      | 'schema_mismatch'  // Zod validation failed
      | 'rate_limited'
      | 'server_error'
      | 'timeout',
    public readonly cause?: unknown,
  ) {
    super(`AI call failed: ${kind}`);
  }
}
```

Consumers catch and switch on `kind`. TanStack Query surfaces `AIError` like any other.

### Response validation is opt-in Zod

`aiClient.complete()` accepts an optional `schema?: ZodSchema<T>`. When supplied, the client validates the parsed response and throws `AIError('schema_mismatch')` on failure. When omitted, the client returns the parsed JSON cast to `T`.

The rule of thumb: **validate when shape drift would crash a UI component**. Validate program generation, food analysis, weekly review, target calculation. Skip validation for low-stakes outputs (duplicate-index lookups) that already swallow errors silently.

## Consequences

- **Positive**: Error handling is uniform with the rest of the codebase; no new patterns to learn for AI calls used inside mutations.
- **Positive**: Schema mismatches become a recognisable error type instead of "undefined is not a function in some component three layers deep".
- **Positive**: Zod schemas double as documentation of the model's response contract.
- **Positive**: Coaching modules can incrementally add validation; we don't need 12 schemas before shipping the refactor.
- **Negative**: Optional validation means some call paths remain brittle. Acceptable — those paths already fail silently today.

## Alternatives considered

- **`Result<T, AIError>` everywhere** — rejected. Forces consumers to handle the failure branch but conflicts with throw-based mutation idioms used elsewhere. The type-level guidance gain is real but the friction outweighs it.
- **Always-required schema** — rejected. Forces full Zod coverage as a prerequisite for the refactor; the worst-affordance call sites (duplicate-index lookups) don't benefit from validation.
