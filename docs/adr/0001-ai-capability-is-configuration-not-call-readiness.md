# ADR-0001 — AI Capability is configuration, not call-readiness

- **Status**: Accepted
- **Date**: 2026-05-22
- **Deciders**: jonathan (product owner)

## Context

The app has three independent signals that influence whether an AI call can succeed:

1. `profile.openai_api_key` — durable: is a key configured?
2. `navigator.onLine` (mirrored to `useAppStore.isOnline`) — transient: is the network up?
3. The OpenAI client's hydration state — transient: has the singleton been initialised?

Today these are checked in different combinations at every call site. There is no canonical answer to *"can I use AI right now?"*. Two reasonable interpretations exist:

- **Configuration interpretation** — "AI is set up" means a valid key is stored. Network is a separate question, checked separately.
- **Call-readiness interpretation** — "AI is available" bundles configuration + network + initialisation into one boolean.

The call-readiness interpretation makes call sites terser but loses the distinction between "you haven't set up AI" (one-time CTA → Settings) and "you're offline" (transient banner, no action needed). Treating these as the same concept led to inconsistent error copy across [FoodLogModal.tsx:216-243](src/components/modals/FoodLogModal.tsx:216), [Settings.tsx:197](src/pages/Settings.tsx:197), and [WeeklyReviewModal.tsx](src/components/weekly-review/WeeklyReviewModal.tsx).

## Decision

**AI Capability is a configuration concept.** It answers exactly one question: *"is a valid OpenAI key currently configured in the Profile?"*

Network state remains a separate concern, sourced from `useAppStore.isOnline`. Consumers that need both check both.

The `aiCapability` module exposes:

```typescript
type AICapability =
  | { available: true }
  | { available: false; reason: 'no_key' };
```

(`reason` is a discriminated union — future configuration-level reasons can be added without breaking call sites.)

## Consequences

- **Positive**: The "you haven't set up AI" CTA always points to Settings → API Key, with no ambiguity about whether the user should also try going online.
- **Positive**: Capability does not need to subscribe to `online`/`offline` events. Its update surface is the profile only.
- **Positive**: Validating a key on save is a *capability* operation; checking network is a separate check. The two concerns evolve independently.
- **Negative**: Call sites that need both gates have two checks instead of one. Mitigated by candidate 05 (`<RequiresAI>`) if patterns converge.

## Alternatives considered

- **Bundled (call-readiness)** — rejected because it forces every consumer to branch on `reason` to write decent copy, undoing the apparent simplification.
- **Three-way layered API** (`isConfigured` + `canCallNow`) — rejected as YAGNI; we can promote to layered later if a real need emerges.
