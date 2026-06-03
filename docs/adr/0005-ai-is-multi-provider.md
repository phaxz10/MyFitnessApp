# ADR-0005 — AI is multi-provider via a single SDK abstraction

- **Status**: Accepted
- **Date**: 2026-06-03
- **Deciders**: JP (@phaxz)
- **Amends**: ADR-0001 (capability), ADR-0002 (stateless client)

## Context

The app shipped OpenAI-only. ADR-0001 defined AI Capability as "is an OpenAI key configured?" and ADR-0002 made the client stateless, predicting that *"future support for multiple API providers (Anthropic, local models) is one branch in `complete()` rather than a parallel singleton."*

That future arrived. BYOK is the product's core promise — no backend, the user pays their own provider — and locking users to a single vendor undercuts it: pricing, rate limits, model quality, and (critically for a no-backend browser app) CORS behaviour all differ by provider:

- **OpenAI** can't be called browser-direct for the Responses API (web search) without CORS help — hence the optional `worker/openai-proxy.ts`. Plain chat completions are fine browser-direct.
- **Anthropic** allows browser-direct calls only with the `anthropic-dangerous-direct-browser-access` header.
- **Google (Gemini)** allows browser-direct calls with no special handling, and is the cheapest per call.

Hand-integrating three vendor SDKs — each with its own request/response shape, tool format, and error taxonomy — into every coaching module would multiply complexity by three.

## Decision

**AI is multi-provider, abstracted behind the Vercel AI SDK (`ai`), with a registry as the single source of truth.**

1. **One transport interface.** Every provider resolves to a Vercel `LanguageModel`. The provider factory `buildLanguageModel(cfg)` in `src/services/ai/aiClient.ts` switches on the active provider and returns a model; the rest of the Wrapper (`respond`, `complete`, error mapping, cache) is provider-agnostic.

2. **A registry, not scattered literals.** `src/constants/aiProviders.ts` owns `PROVIDER_OPTIONS`, `MODELS_BY_PROVIDER`, and `DEFAULT_MODEL_BY_PROVIDER`. The Onboarding/Settings pickers and the provider factory both read from it. Models drop frequently; adding one is a one-line registry edit.

3. **The Profile carries the selection.** Migration v3 (`src/services/migrator.ts`) renames `openai_api_key → ai_api_key` and `openai_proxy_url → ai_proxy_url`, and adds `ai_provider` (CHECK-constrained to the three) and `ai_model`. Existing rows backfill to `('openai', 'gpt-4o')`, so the migration is behaviour-preserving for current users.

4. **Capability becomes a triple (amends ADR-0001).** `useAICapability` now answers "is the active **provider + model + key** set?" — `{ available: true; provider; model } | { available: false; reason: 'no_key' }` — rather than "is an OpenAI key set?".

5. **Statelessness carries over (extends ADR-0002).** The factory reads `provider/model/key/proxy` from the Zustand store on every call. There is still no singleton; switching providers in Settings takes effect on the next call.

Provider-specific quirks are confined to `buildLanguageModel` and `webSearchTool`: the proxy/Responses-API branch for OpenAI, the browser-access header for Anthropic, native `googleSearch` for Google.

## Consequences

- **Positive**: Users pick the provider that fits their budget and quality needs; BYOK stays honest. Adding a model is a registry edit; adding a provider is one `switch` arm plus a registry entry.
- **Positive**: The Vercel SDK normalises requests, structured output (`Output.object`), tool calls, and errors, so coaching modules never see vendor differences. ADR-0003's `classifyError` maps the SDK's error classes once, for all three providers.
- **Positive**: The proxy stays optional and OpenAI-scoped; Anthropic and Google need no backend at all, reinforcing the no-backend architecture.
- **Negative**: The registry must track model churn — a stale model id surfaces as a runtime API error (mapped to `AIError`), not a type error. Accepted: the edit is cheap and the failure is legible.
- **Negative**: A dependency on the Vercel AI SDK's abstraction. Judged worth it versus maintaining three hand-rolled integrations; if the SDK ever blocks a needed feature, `buildLanguageModel` is the single seam to replace.
- **Migration**: ADR-0001 and ADR-0002's code sketches reference `openai_api_key`, `src/services/openai.ts`, and `initOpenAI()` — all superseded. Their *decisions* (capability-is-configuration; stateless client) stand; only the OpenAI-specific surface changed. Amendment notes have been added to both.

## Alternatives considered

- **Stay OpenAI-only.** Rejected — directly conflicts with BYOK's "your provider, your cost" promise and with the no-backend constraint (some users can't or won't use OpenAI).
- **Hand-roll three vendor SDK integrations.** Rejected — triples request/response/tool/error handling across every coach for no benefit the Vercel SDK doesn't already provide.
- **A custom backend that brokers providers server-side.** Rejected — reintroduces the data-custodian and infrastructure burden that ADR-0004 and the whole no-backend design deliberately avoid, and keys would have to leave the browser.
- **Provider abstraction without a registry (model literals at call sites).** Rejected — model lists would drift between the pickers and the factory; the registry makes "what we expose" exactly one file.

## Re-litigation guard

Do not re-suggest collapsing back to a single hard-coded provider, nor scattering model ids across call sites. The three-provider registry + SDK factory is intentional. Add a provider by extending the `AIProvider` union, the registry, and the `buildLanguageModel` switch — not by special-casing call sites.
