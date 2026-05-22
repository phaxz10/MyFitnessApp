# ADR-0002 — AI Client is stateless; no singleton

- **Status**: Accepted
- **Date**: 2026-05-22
- **Deciders**: jonathan (product owner)

## Context

[src/services/openai.ts:278](src/services/openai.ts:278) holds a module-level mutable singleton:

```typescript
let client: OpenAI | null = null;

export function initOpenAI(apiKey: string): void {
  client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
}

function requireClient(): OpenAI {
  if (!client) throw new Error('OpenAI API not initialized');
  return client;
}
```

The singleton is hydrated from two independent call sites — [App.tsx:108-114](src/App.tsx:108) when the profile loads, and [Settings.tsx:243](src/pages/Settings.tsx:243) when the user saves a key. [useProgramGenerator.ts](src/hooks/useProgramGenerator.ts) calls AI functions assuming the singleton is hydrated, with no guard.

This produces a class of "is the client initialised yet?" race conditions, and forces every consumer to either check `isOpenAIInitialized()` or accept the risk of a synchronous throw.

The OpenAI SDK constructor — `new OpenAI({ apiKey })` — is essentially a no-op: it stores configuration and a fetch reference. There is no connection, no handshake, no resource that justifies caching a single instance.

## Decision

**The AI Client is stateless.** There is no module-level singleton, no `initOpenAI()`, no `requireClient()`.

The `aiClient.complete()` method reads the current API key from `useAppStore` on each invocation and constructs a fresh OpenAI SDK instance scoped to that call. If no key is configured, the call returns/throws a typed `AIError` of kind `'unavailable'` rather than crashing on `null`.

```typescript
// services/ai/aiClient.ts (sketch)
export async function complete<T>(params: {
  prompt: string | InputItem[];
  schema?: ZodSchema<T>;
  tools?: Tool[];
}): Promise<T> {
  const apiKey = useAppStore.getState().userProfile?.openai_api_key;
  if (!apiKey) throw new AIError('unavailable', 'no_key');
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  // ... call, parse, validate, return
}
```

## Consequences

- **Positive**: No initialisation race. The whole class of "is the singleton hydrated yet?" bugs becomes unrepresentable.
- **Positive**: The client module is pure (modulo the store read). Trivially mockable: set the store, call the method, assert.
- **Positive**: Capability changes (user adds/removes key in Settings) take effect on the next call, not "next time `initOpenAI` happens to run".
- **Positive**: Future support for multiple API providers (Anthropic, local models) is one branch in `complete()` rather than a parallel singleton.
- **Negative**: Slight per-call overhead — one SDK object allocation. The SDK constructor is sync and trivial; in practice unmeasurable next to the network round trip.
- **Negative**: The client now reaches into the Zustand store, coupling transport to state management. Acceptable because `useAppStore` is the canonical app-global already.

## Alternatives considered

- **Keep the singleton, centralise init through `useAICapability`** — rejected because it preserves the race-prone class while adding indirection. The singleton concentrates no real complexity (deletion test fails).
- **Dependency-injected `getApiKey()` provider** — rejected as ceremony; the store coupling is honest about where state lives.
- **Construct one client per session via React Context** — rejected because the SDK object has no session affinity to preserve; this is solving a problem that doesn't exist.

## Re-litigation guard

Future architecture reviews **should not re-suggest** introducing a module-level OpenAI singleton or any equivalent global `client` variable. The lazy-construction overhead is intentional. If a real need emerges (e.g. measured cold-start cost, connection pooling that some future SDK introduces) revisit explicitly via a new ADR.
