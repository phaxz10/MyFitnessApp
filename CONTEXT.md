# MyPersonalFitness — Context & Language

The ubiquitous language of MyPersonalFitness: a single-user, offline-first fitness PWA with BYOK AI coaching and no backend. This glossary is the source of truth for naming — in code, UI copy, prompts, and commits. When two words exist for one concept, the preferred term is **bold** and the rejected ones are listed under _Avoid_.

## Language

### AI subsystem

**Wrapper**:
The single provider-agnostic entry point every AI call goes through (`src/services/ai/aiClient.ts`). Owns transport, the provider factory, typed errors, one-shot retry, and the two-tier response cache (in-memory LRU + localStorage). Exposes `respond()` (free-form / tool-orchestrated) and `complete<T>()` (single-turn JSON with optional Zod validation).
_Avoid_: client, SDK, service

**Coach**:
A domain module that builds a prompt + Zod schema for one job and calls the Wrapper — e.g. `nutritionCoach`, `programCoach`, `exerciseLibraryCoach`. A Coach holds domain knowledge; the Wrapper holds transport. A new AI feature is a new Coach.
_Avoid_: service, helper, agent

**Provider**:
One of the three AI vendors the app supports: `openai`, `anthropic`, `google`. The active Provider is stored on the Profile.
_Avoid_: vendor, backend, engine

**Model**:
A specific model id within a Provider (e.g. `gpt-5.4-mini`, `claude-sonnet-4-6`). Enumerated per Provider in the Provider registry.

**Provider registry**:
`src/constants/aiProviders.ts` — the single source of truth for which Provider + Model combinations the app exposes. Both the Settings pickers and the Wrapper's factory read it.
_Avoid_: config, models list

**Capability**:
The answer to "can AI run right now, by configuration?" — specifically, whether the active **Provider + Model + key** triple is set. A configuration concept only; network state is a separate concern. (See ADR-0001, ADR-0005.)
_Avoid_: availability, readiness

**Proxy**:
The optional Cloudflare Worker (`worker/openai-proxy.ts`) that adds CORS headers so OpenAI's Responses API (web search) works from the browser. OpenAI-only; Anthropic and Google need no Proxy.
_Avoid_: server, backend, gateway

**BYOK** (Bring Your Own Key):
The model where the user supplies their own Provider API key, stored only in their browser and sent straight to the Provider. The app is never a key custodian.

### Data layer

**Writer**:
A module under `src/services/writers/` that owns the write SQL (INSERT/UPDATE/DELETE) for a table or aggregate. UI and hooks call a Writer, never raw write SQL.
_Avoid_: repository, DAO, mutation

**Query**:
A module under `src/services/queries/` that owns the read SQL for one read shape, often collapsing an N+1 into a single round-trip.
_Avoid_: repository, selector, getter

**Write Bus**:
The lightweight pub/sub in `src/services/db.ts`: every mutating query emits a `WriteEvent` (`{ table, op }`) to `onDbWrite` listeners, so dependent views refresh without manual wiring.
_Avoid_: event emitter, signal

**Migration**:
A versioned, transactional schema change in `src/services/migrator.ts`, applied in order on startup. The schema is owned by Migrations and never hand-edited.

### Training domain

**Program**:
A saved training plan (`workout_programs`). Has many Sessions; one is marked active at a time.
_Avoid_: routine, plan, split

**Session**:
A *template* day within a Program (`program_sessions`) — e.g. "Push A". Holds ordered Program Exercises. Not a performed workout.
_Avoid_: day, workout, split

**Workout Log**:
A *performed* instance (`workout_logs`) — what actually happened on a date, with a status (`in_progress` / `completed` / `incomplete` / `missed`). The runtime counterpart to a Session.
_Avoid_: session, workout, entry

**Workout Log Exercise**:
An exercise as captured inside a Workout Log (`workout_log_exercises`) — an independent copy, so editing the Exercise library later never rewrites history.
_Avoid_: logged exercise

**Set**:
One performed set within a Workout Log (`workout_sets`): reps, weight, and/or duration, plus a `completed_at` marker.

**Superset**:
A group of exercises performed back-to-back, linked by a shared `superset_group_id`.

**Exercise**:
A library entry (`exercises`) — name, muscle groups, equipment, and Exercise Type. May be AI-generated.

**Exercise Type**:
What a Set measures: `reps_weight`, `reps_only`, `duration`, or `duration_weight`. Drives which inputs the logger shows.

**Personal Record (PR)**:
A best for an Exercise along one axis: `weight`, `reps`, `volume`, or `1rm`.
_Avoid_: best, max

**Estimated 1RM**:
A computed one-rep-max from a Set's weight × reps. "Estimated" is never dropped — it is not a logged lift.

**Volume**:
Sets × reps × weight, aggregated per Exercise, Session, or period.

### Nutrition & goals

**Food Entry**:
One logged item for a date and Meal Type (`food_entries`), with macros. May be AI-generated from text or a photo.
_Avoid_: meal, log

**Target**:
The user's daily calorie + macro goals (`calorie_target`, protein/carbs/fat). What intake is measured against.
_Avoid_: budget, limit

**Goal**:
The training/diet intent: `bulk`, `lean_bulk`, `recomp`, `cut`, or `maintain`. Shapes Targets and program advice.

**Weekly Review**:
The AI check-in (`weekly_reviews`) that reads a week of weight/intake/workout data and recommends Target/Goal/program adjustments the user can accept.
_Avoid_: report, summary

## Flagged ambiguities

- **Session vs Workout Log** — the sharpest one. A **Session** is the *template* (part of a Program); a **Workout Log** is the *performed instance*. "Workout" alone is ambiguous — prefer one of the two. UI copy may say "workout" to users, but code and prompts use the precise term.
- **Wrapper vs Coach** — the **Wrapper** is transport (one file, no domain knowledge); a **Coach** is domain + prompt (no transport knowledge). A new AI feature is a new Coach, never a change to the Wrapper.
- **Provider vs Model** — a **Provider** is the vendor (`openai`); a **Model** is a specific id (`gpt-5.4-mini`). Capability needs both, plus a key.

## Example dialogue

**Dev**: The user picked Anthropic but the Weekly Review still errored — is that a Capability problem?

**Domain expert**: Capability is just "is the Provider + Model + key triple set?" If they chose a Provider and Model and pasted a key, Capability is fine. The error is downstream — a Coach called the Wrapper and the Wrapper threw.

**Dev**: Right, the Weekly Review Coach. Does it need the web-search Tool?

**Domain expert**: Only if the Coach asks for one — the Wrapper resolves a requested Tool to the active Provider's native version. And web search for OpenAI needs the Proxy; Anthropic and Google don't. Same Coach, different Provider, different path.

**Dev**: And when the user accepts the recommendation, that writes new Targets?

**Domain expert**: Yes — the accept path goes through a Writer, which hits the Write Bus, so the dashboard's Queries refresh. The Weekly Review row records what was accepted.
