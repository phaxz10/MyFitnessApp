# ADR-0007 — OpenRouter is the single AI provider, with a live model catalog

- **Status**: Accepted
- **Date**: 2026-10-19
- **Amends**: ADR-0005 (multi-provider registry)

## Context

ADR-0005 made AI multi-provider (OpenAI / Anthropic / Google) with a hand-maintained registry. That maintenance cost turned out to be real: model ids rotate constantly, each vendor has its own browser-CORS story (the OpenAI proxy never shipped past a footgun, Anthropic needs the dangerous-direct-browser-access header), and the registry's curated model lists went stale between app updates in an offline-first PWA that has no release channel to ship fresh ids.

OpenRouter solves all three sides at once: one BYOK account works with every vendor's models, it is OpenAI-API-compatible and CORS-friendly (browser-direct, no proxy), and it publishes a **public, no-auth model catalog** (`GET /api/v1/models`) whose ids are always current.

## Decision

**OpenRouter is the single AI provider, and the model list is fetched, not hard-coded.**

1. **The provider union collapses to `'openrouter'`.** Transport stays the Vercel AI SDK — `buildLanguageModel` now constructs a `createOpenAI` client pointed at `https://openrouter.ai/api/v1` (OpenAI-compatible, via `.chat()` — the SDK default would target the Responses API), with the `HTTP-Referer` / `X-Title` attribution headers OpenRouter recommends. No new dependency.

2. **The model catalog goes live.** `src/services/ai/openrouterModels.ts` fetches the public models list (no API key required), caches it two-tier (memory + localStorage, 24h TTL — same pattern as the AI response cache in aiClient), and exposes normalization (pricing → per-1M buckets, free/vision flags, context length) plus search. Onboarding and Settings render it through a searchable **combobox** (`ModelCombobox`): `openrouter` has hundreds of models, so a pick-list was never viable. The raw input *is* the value — a typed id the catalog doesn't know (new model, offline fetch) still commits, so the UI never hard-blocks configuration.

3. **Web search is translated, not dropped.** OpenRouter has no native `web_search` tool over the AI SDK transport, but its hosted web-search plugin is enabled per-request by appending `:online` to the model id. Coaches are untouched: `webSearchTool()` now returns a sentinel, and the Wrapper's `splitWebSearch()` strips it from the outbound tools map and applies the suffix — including in cache keys, so an `:online` run can't collide with a plain one.

4. **The Profile still carries the selection (migration v5).** The v3 CHECK constraint is dropped and re-added pinned to `'openrouter'`. Legacy rows keep their model *id* by remapping to the OpenRouter slug (`gpt-4o` → `openai/gpt-4o`, `claude-*` → `anthropic/claude-*`, `gemini-*` → `google/gemini-*`; shared helper `toOpenRouterModelId`). Vendored API keys and `ai_proxy_url` are **nulled**: a raw OpenAI/Anthropic/Google key cannot authenticate against OpenRouter, and nulling them flips Capability off so users land on AI Settings and paste an `sk-or-…` key instead of facing opaque 401s mid-feature. Backup import (`backup.ts`) applies the same remap so pre-v5 restores don't violate the CHECK.

## Consequences

- **Positive**: One key unlocks every vendor; model ids never go stale in the app because they come from the source at setup time; the OpenAI proxy, the vendor-CORS quirks, and the per-vendor `buildLanguageModel` switch all disappear.
- **Positive**: Coaches and the Capability concept survive intact — Coaches build prompt + schema against the Wrapper; Capability is still model + key.
- **Negative**: Users must create an OpenRouter account (existing vendor keys no longer work). Accepted — one re-setup beats a proxy + header + registry matrix that already bit users.
- **Negative**: A Coach's web-search request becomes an `:online` run billed to the user's OpenRouter account for hosted search, not the underlying model's native tooling. Same payer, different meter.
- **Migration**: ADR-0005's registry decision ("single source of truth") survives, re-aimed: the catalog service + combobox replace `MODELS_BY_PROVIDER`, and `buildLanguageModel` remains the transport seam. ADR-0005's "three providers" framing is superseded; its re-litigation guard applies to *this* design — do not re-suggest per-vendor handlists or scattering model ids at call sites.

## Alternatives considered

- **Keep ADR-0005's three providers.** Rejected — the registry rots (no release channel), the CORS matrix grows with every vendor, and each new vendor advertises the same "one key, all models" benefit OpenRouter gives for free.
- **Use `@openrouter/ai-sdk-provider`.** Rejected for now — `createOpenAI` against the OpenAI-compatible base URL covers the whole surface the app uses (chat completions + structured output); a bespoke provider package duplicates that.
- **Native web-search passthrough.** Rejected — OpenRouter routes don't accept vendor-native tool formats; `:online` is the supported path.
- **Hard-code a curated shortlist on top of the catalog.** Rejected — reintroduces the staleness ADR-0005 accepted as its worst cost, for no UX gain once search exists.
