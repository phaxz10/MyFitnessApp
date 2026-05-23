# CONTEXT

Domain glossary for MyPersonalFitness. Terms here are the *names we use* — in code, in PRs, in conversation. When a new concept earns a name during design work, it goes here.

This file is grilled alongside architecture decisions in `docs/adr/`. If a term needs nuance beyond a one-liner, link to the ADR.

---

## Profile

The user's durable settings and physiology: birthdate, gender, height, activity level, goal, calorie and macro targets, and optionally a configured OpenAI key. There is exactly one Profile per install (this is a single-user PWA). Stored in PGlite, mirrored to Zustand on load. See [src/types/index.ts](src/types/index.ts) `UserProfile`.

## Meal / Meal Entry

A meal is one of `breakfast | lunch | dinner | snack`. A **Meal Entry** is a row in the food log: a description, portion in grams, and macros. Entries are produced by **Meal Entry Adapters** (see below) and persisted via [useCalories](src/hooks/useCalories.ts).

## Meal Entry Adapter

A way to *produce* a Meal Entry. Today, three are envisioned:
- **Manual Entry Adapter** — user types macros directly. Always available.
- **AI Text Entry Adapter** — user describes food in prose; AI returns structured items. Requires AI Capability.
- **AI Image Entry Adapter** — user captures a photo via in-app camera (with file-upload fallback); AI returns structured items. Requires AI Capability + camera permission (preferred) or file picker (fallback).

These satisfy a single `MealEntryAdapter` interface so the meal-logging UI can mount only the adapters that are usable.

### AI Image Entry Adapter — capture model

The image adapter uses an in-app camera flow, not just `<input type="file" capture>`:

1. User taps "Scan Meal" → `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })` requests rear-camera permission.
2. Stream feeds a live `<video>` preview; a capture button takes a frame via `<canvas>`.
3. On permission deny / no `MediaDevices` support → graceful fallback to file picker.
4. Stream is released on capture, retake, modal close, and unmount.

The "Log Meal" entry point on the select screen owns no camera state — the adapter does, scoped to its mount.

## Workout Program

A named training program with a fixed set of sessions per week. Each **Program Session** has a day-of-week (or flex) and an ordered list of **Program Exercises** with target sets/reps/duration. Programs are produced by **Program Origin Adapters** (Blank, Template, AI) and then customised in the Program Editor.

## Exercise Library

The user's personal catalogue of exercises (name, description, muscle groups, equipment, exercise type, tips). Exercises can be AI-generated or hand-authored. The `is_ai_generated` flag records origin, not capability.

## Weekly Review

A Monday check-in that summarises the previous week's nutrition, weight, and workouts. Optionally enriched with AI analysis (metabolic response, recommendations) when AI Capability is available; otherwise shows raw data.

## AI Capability

The configuration state: *"is a valid OpenAI key currently stored in the Profile?"*

AI Capability is **about configuration, not about whether a call can succeed right now**. Network connectivity (`isOnline`) is a separate, orthogonal concern. A consumer that wants to make an AI call typically checks both.

See [ADR-0001](docs/adr/0001-ai-capability-is-configuration-not-call-readiness.md).

## AI Client

The single transport adapter for all AI calls. Stateless: no singleton, no init lifecycle. On each call it reads the current API key from the Zustand store. Returns typed results; throws typed errors (`AIError` with a `kind` discriminator — see ADR-0002 once written).

The AI Client knows nothing about fitness. Domain prompts live in **Coaching Modules** that consume the client.

Failure surface is an `AIError` class with a `kind` discriminator (`'unavailable' | 'parse_failed' | 'schema_mismatch' | 'rate_limited' | 'server_error' | 'timeout'`). Response validation is opt-in via an optional Zod schema per call.

See [ADR-0002](docs/adr/0002-ai-client-is-stateless.md) and [ADR-0003](docs/adr/0003-ai-errors-are-typed-throws.md).

## Coaching Module

A domain-specific module that owns prompts and response shapes for one area of the app. Planned set:
- **Nutrition Coach** — food analysis (text, image), calorie/macro target calculation
- **Exercise Coach** — exercise detail generation, duplicate detection
- **Program Coach** — workout program generation, optimisation, experience-level inference
- **Weekly Review Coach** — weekly check-in analysis

Coaching modules depend on the AI Client; the AI Client does not depend on them.

## Workout History

The list of past workout logs joined with their sets and exercise names. Produced by [src/services/queries/workoutHistory.ts](src/services/queries/workoutHistory.ts) — `recent(db, limit)` for the most recent N, `inRange(db, since, until)` for date-bounded queries. Returns `WorkoutLogWithSets[]`. Each log includes its sets nested inline via a single SQL query using `json_agg`, replacing the previous N+1 pattern that issued one query per log.

## Exercise History

The list of past sessions that included a specific exercise. Produced by [src/services/queries/exerciseHistory.ts](src/services/queries/exerciseHistory.ts) — `sessions(db, exerciseId, opts)`. Returns `ExerciseSession[]` (unified shape) regardless of caller. Call-site adapters extract what each consumer needs (last performance, coaching history, full history).

## Food Entry Writer

The batch-write module for food entries. Produced by [src/services/writers/foodEntryWriter.ts](src/services/writers/foodEntryWriter.ts) — `addMany(db, entries)` for multi-row INSERT (replaces loop-of-single-INSERTs from AI adapters), `copyFromDate(db, source, target)` for copying a day's meals via INSERT...SELECT. Returns inserted `FoodEntry[]` via RETURNING *.

## Workout Writer

The batch-write module for workout exercises and sets. Produced by [src/services/writers/workoutWriter.ts](src/services/writers/workoutWriter.ts) — `instantiateSession(db, workoutLogId, sessionId)` creates exercises + pre-created sets from a program session template in two INSERT-SELECT statements (replaces the ~20 serial INSERTs from the doubly-nested loop), `addExercise(db, workoutLogId, exerciseId, opts)` adds a single exercise mid-workout with its pre-created sets. Both return the created rows via RETURNING *.

## Cloud Backup

The system that persists app data to the user's own Google Drive. Two backup artifacts: a **Backup Snapshot** (`backup.json` — all structured table data, photo rows with `photo_data` omitted) and individual **Photo Blobs** (decoded JPEG files in a `photos/` subfolder). Authenticated via Google Identity Services (client-side implicit flow, `drive.file` scope). Triggers on a 60-second debounce after any database write. On app load, compares remote `exported_at` to local `last-restored-at` and restores if remote is newer.
_Avoid_: sync, replication, GitHub backup

## Write Bus

An event seam inside the DB layer. The thin wrapper returned by `getDB()` in [src/services/db.ts](src/services/db.ts) intercepts every `query()` call; when the SQL is a mutation (INSERT, UPDATE, DELETE) it emits a `{ table, op }` event to registered listeners via `onDbWrite()`. The auto-backup module subscribes once at import time and debounces a full-DB backup — no manual `triggerAutoBackup()` calls needed at mutation sites.

## Program Origin Adapter

A way to *produce* a draft Workout Program. Three envisioned:
- **Blank Origin** — empty program, user fills in
- **Template Origin** — picks a static starting point (PPL, Upper/Lower, Full Body)
- **AI Origin** — runs the AI generator wizard. Requires AI Capability.

All three hand off to the same Program Editor for review and customisation.
