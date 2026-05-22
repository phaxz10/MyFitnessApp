# REFACTOR PLAN — AI Capability Boundary & Module Depth

**Status**: Grilled and committed · 2026-05-22
**Owner**: jonathan
**Architecture review**: see `/tmp/architecture-review-20260522-102138.html`
**Domain glossary**: [CONTEXT.md](CONTEXT.md)
**Decisions**: [docs/adr/0001](docs/adr/0001-ai-capability-is-configuration-not-call-readiness.md), [0002](docs/adr/0002-ai-client-is-stateless.md), [0003](docs/adr/0003-ai-errors-are-typed-throws.md)

---

## Goal

Make AI an *optional accelerator* in the app, not an ambient assumption. When no OpenAI key is configured:

- Calorie tracking continues to work (manual entry as first-class)
- Workout program creation continues to work (blank program → ProgramEditor)
- Settings, exercise library, weekly review, and onboarding degrade gracefully
- No disabled-button-with-tooltip UX; missing capabilities are *hidden*, not nagged about

Secondary goal: kill the 1,929-line `services/openai.ts` god module. Replace with a stateless transport (`aiClient`) and five domain-shaped coaching modules.

---

## Architecture in one diagram

```
┌──────────────────────────────────────────────────────┐
│  UI surfaces (Settings, CalorieLog, WorkoutSession…) │
└─────────────────────┬────────────────────────────────┘
                      │ asks
                      ▼
            ┌─────────────────────┐
            │   useAICapability   │  ← derived from profile.openai_api_key
            └──────────┬──────────┘     (network is orthogonal: useAppStore.isOnline)
                       │ gates mounts
                       ▼
        ┌──────────────────────────────┐
        │   Coaching modules           │
        │   ─────────────────────────  │
        │   nutritionCoach             │
        │   exerciseLibraryCoach       │
        │   programCoach               │
        │   workoutCoach               │
        │   weeklyReviewCoach          │
        └──────────────┬───────────────┘
                       │ uses
                       ▼
            ┌─────────────────────┐
            │      aiClient       │  ← stateless; reads key per-call from useAppStore
            │   complete<T>(…)    │     throws AIError on failure; optional Zod schema
            └──────────┬──────────┘
                       │ wraps
                       ▼
                  OpenAI SDK
```

---

## Phase 1 — Foundation (Capability + Client)

**Candidates**: 01 + 02
**Outcome**: Single source of truth for "AI is configured". Stateless AI client. Typed error model.

### Files created

```
src/services/ai/
├── aiClient.ts          ← complete<T>({ prompt, schema?, tools?, timeoutMs? })
├── AIError.ts           ← class AIError with `kind` discriminator
└── useAICapability.ts   ← React hook returning { available, reason? }
```

### Files modified

- **src/App.tsx** — remove `initOpenAI` useEffect (no singleton to hydrate)
- **src/pages/Settings.tsx** — remove `initOpenAI` call on save (no singleton)
- **src/pages/Onboarding.tsx** — remove `initOpenAI` call; keep the API-key field as a profile setting
- **src/hooks/useAppStore.ts** — `userProfile.openai_api_key` remains the canonical source (no new slice needed)

### Files deleted (after Phase 3 migration)

- **src/services/openai.ts** — replaced by `aiClient` + coaching modules

### `aiClient.complete` contract

```typescript
export async function complete<T = unknown>(params: {
  prompt: string | ResponseInputItem[];
  schema?: ZodSchema<T>;        // opt-in; when present, response is validated
  tools?: Tool[];               // OpenAI tools (web_search, function-calling)
  model?: string;               // defaults to 'gpt-4o'
  temperature?: number;
  timeoutMs?: number;
}): Promise<T>;

// Throws AIError on:
//   - kind: 'unavailable'      (no key configured)
//   - kind: 'parse_failed'     (JSON.parse threw)
//   - kind: 'schema_mismatch'  (Zod validation failed)
//   - kind: 'rate_limited'
//   - kind: 'server_error'
//   - kind: 'timeout'
```

### Test surface

- `aiCapability.test.ts` — given a profile state, returns expected `{ available, reason }`
- `aiClient.test.ts` — given a mocked OpenAI SDK, validates prompt routing, JSON parse failure → throws, schema mismatch → throws
- No more "is the singleton hydrated?" tests, because no singleton.

### Risk / rollback

Low. The new modules are additive. Old `openai.ts` stays callable through Phase 1 (consumers still import from it). At end of Phase 3, old file is removed.

---

## Phase 2 — Meal Entry Inversion

**Candidate**: 03
**Outcome**: Calorie tracking decoupled from AI. Native camera capture for image-based logging.

### Files created

```
src/components/meal-entry/
├── MealEntryShell.tsx           ← thin modal (replaces FoodLogModal · ~150 lines)
├── ManualEntryAdapter.tsx       ← always-available form
├── AITextEntryAdapter.tsx       ← prose → nutritionCoach.analyzeFoodText → editable items
└── AIImageEntryAdapter.tsx      ← in-app camera → nutritionCoach.analyzeFoodImage
```

### Files deleted

- **src/components/modals/FoodLogModal.tsx** (961 lines) — replaced by shell + 3 adapters
- **src/pages/MealScanner.tsx** — duplicates `AIImageEntryAdapter`
- `/scanner` route in **src/App.tsx**

### Files modified

- **src/components/modals/index.tsx** — `GlobalModalContainer` mounts `MealEntryShell` instead of `FoodLogModal`
- **src/components/ui/BottomNav.tsx** — remove scanner tab
- **src/hooks/useAppStore.ts** — modal state union: replace `mode: 'select' | 'text' | 'scanner' | 'manual'` with `mode: 'picker' | 'manual' | 'ai_text' | 'ai_image'`

### Shell behaviour

```typescript
function MealEntryShell() {
  const capability = useAICapability();
  const isOnline = useAppStore(s => s.isOnline);

  const adapters = useMemo(() => {
    const list = [ManualEntryAdapter];
    if (capability.available && isOnline) {
      list.push(AITextEntryAdapter, AIImageEntryAdapter);
    }
    return list;
  }, [capability.available, isOnline]);

  if (adapters.length === 1) {
    // Skip picker — collapse to single adapter
    return <ManualEntryAdapter ... />;
  }
  return <MealEntryPicker adapters={adapters} ... />;
}
```

### AIImageEntryAdapter — camera flow

1. On mount of image-capture mode, call `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`.
2. On success, render `<video autoPlay playsInline>` with the stream; show a capture button.
3. Capture button draws current frame to `<canvas>`, converts to base64 via `canvas.toDataURL('image/jpeg', 0.92)`.
4. On `getUserMedia` rejection or absent `MediaDevices` → fall back to `<input type="file" accept="image/*" capture="environment">`.
5. Always: stop tracks on capture, retake, unmount.

### Test surface

- Each adapter is independently testable (manual form validation, AI mocking via `aiClient` mock).
- Shell test asserts dispatch logic (capability state → which adapters mount).

### Risk / rollback

Medium. UX change visible to user. Migrate behind a feature flag if anxious; the data layer (`useCalories`) is unchanged, so rollback is component-level only.

---

## Phase 3 — Coaching Split

**Candidate**: 04
**Outcome**: `openai.ts` deleted. Five domain-shaped modules each consume `aiClient`.

### Files created

```
src/services/coaching/
├── nutritionCoach.ts
│   ├─ analyzeFoodText(description) → FoodAnalysis
│   ├─ analyzeFoodImage(image, description?) → FoodAnalysis
│   └─ calculateTargets(profile) → CalorieTargets
│
├── exerciseLibraryCoach.ts
│   ├─ generateExerciseDetails(name) → ExerciseDetails
│   ├─ generateExerciseDetailsBatch(names) → ExerciseDetails[]
│   └─ findDuplicateExercises(candidate, library) → Exercise[]
│
├── programCoach.ts
│   ├─ generateWorkoutProgram(input, library) → Program
│   ├─ generateWorkoutProgramWithFunctionCalling(...) → Program
│   ├─ optimizeWorkoutProgram(input) → Program
│   └─ inferExperienceLevel(history) → ExperienceLevelInference
│
├── workoutCoach.ts
│   └─ generateExerciseCoaching(exercise, history) → ExerciseCoaching
│
└── weeklyReviewCoach.ts
    ├─ reviewWeeklyProgress(profile, data) → WeeklyReview
    └─ reviewGoals(profile, history, ...) → GoalReview
```

Each coach module owns:
- Its prompts (inline template literals — defer markdown extraction)
- Its Zod schemas (opt-in per ADR-0003; validate program/weekly/food/targets, skip for low-stakes)
- Its function-tool declarations (when using OpenAI function calling)

### Files deleted

- **src/services/openai.ts** (1,929 lines)

### Files modified (import updates)

All current consumers of `../services/openai` switch to the relevant coach. Mostly mechanical.

### Risk / rollback

Low. Mostly file motion + import updates. Behaviour preserved exactly.

---

## Phase 4 — Program Origin

**Candidate**: 06
**Outcome**: A user without AI can still create a workout program. Same architectural shape as Phase 2.

### Files created

```
src/components/program-origin/
├── ProgramOriginShell.tsx       ← thin route/modal; mounts adapters available
├── BlankProgramAdapter.tsx      ← hands off to existing ProgramEditor at /workout/program/new
└── AIProgramAdapter.tsx         ← wraps existing ProgramGeneratorWizard
```

Templates are explicitly **out of scope** for this phase. The adapter interface is shaped so a `TemplateProgramAdapter` can drop in later without re-litigation.

### Files modified

- **src/pages/Workout.tsx** — "Create Program" CTA goes to `ProgramOriginShell`
- **src/components/program-generator/ProgramGeneratorWizard.tsx** — becomes the implementation behind `AIProgramAdapter`
- **src/hooks/useProgramGenerator.ts** — guard the AI call paths with `useAICapability`; throw `AIError('unavailable')` early instead of crashing

### Shell behaviour

```typescript
function ProgramOriginShell() {
  const capability = useAICapability();
  const isOnline = useAppStore(s => s.isOnline);
  const aiAvailable = capability.available && isOnline;

  if (!aiAvailable) {
    // Skip picker → straight to Blank
    return <Navigate to="/workout/program/new" replace />;
  }
  return <ProgramOriginPicker /* Blank + AI tiles */ />;
}
```

### Risk / rollback

Low. The existing `ProgramEditor` and `ProgramGeneratorWizard` are unchanged behind the adapters.

---

## Phase 5 — Polish (deferred)

**Candidates**: 05 + 07
**Status**: Reassessed after Phases 1-4 land.

### Open questions to answer *after* implementation

1. After Phases 1-4, how many inline capability checks remain? Where?
2. Do they cluster into two genuinely-distinct shapes (disable vs hide vs swap), or are they all one pattern?
3. If two+ shapes: build `<RequiresAI>`. If one shape: write a 5-line helper. If they're all one-offs: leave them.

### Likely small follow-up PRs

- Onboarding API step copy: add "Optional — we'll calculate sensible defaults if you skip" framing. Already optional in the form schema; just UX clarity.
- Settings → API Key section: clearer "what AI does for you" description.

---

## Sequencing and dependencies

```
Phase 1 ────────────────────► Phase 2 ────► Phase 4
   │                              │            │
   └──► Phase 3 (after 1) ────────┴────────────┘
                                               │
                                               ▼
                                          Phase 5 (deferred)
```

- Phase 1 unblocks all others.
- Phase 2 (meal entry) is the user-facing "AI off" payoff and depends only on Phase 1.
- Phase 3 (coaching split) can land before or after Phase 2; doing it after Phase 2 means we migrate `analyzeFoodText` etc. when they're already touched.
- Phase 4 depends on Phase 1's capability hook.
- Phase 5 explicitly waits.

### Suggested ship order

1. Phase 1 (foundation) — ships behind no flag; new modules added, old `openai.ts` left in place.
2. Phase 2 (meal entry) — first user-visible payoff. Manual entry becomes first-class.
3. Phase 3 (coaching split) — internal cleanup. Delete `openai.ts`.
4. Phase 4 (program origin) — closes the last hard AI blocker.
5. Phase 5 — audit and small follow-ups.

---

## Out of scope (explicit non-goals)

- **Templates for Program Origin** — future initiative, not in this refactor. Adapter pattern leaves a slot.
- **Multi-provider AI** (Anthropic, local models) — `aiClient` is OpenAI-flavoured. Provider abstraction is a future ADR.
- **Telemetry / cost tracking on AI calls** — could live in `aiClient` later. Out of scope for the structural refactor.
- **Markdown-based prompt files** — defer. Inline template literals are fine for the file sizes we have.
- **Replacing TanStack Query patterns** — coaching modules return data; consumers wrap in mutations as today.

---

## Verification checklist (definition of done per phase)

### Phase 1
- [ ] `useAICapability` returns correct state for: no key, valid key (no validation needed at this stage)
- [ ] `aiClient.complete({ prompt: 'test' })` works when key present; throws `AIError('unavailable')` when not
- [ ] No `initOpenAI` calls remain in the codebase outside `aiClient`
- [ ] No `let client` style globals remain

### Phase 2
- [ ] With no API key configured, "Log Food" opens manual entry directly (no picker, no greyed buttons)
- [ ] With API key + online, "Log Food" shows picker with all three options
- [ ] Camera permission flow works on iOS Safari and Android Chrome
- [ ] File-upload fallback works when permission denied
- [ ] `/scanner` route returns 404 / redirects (not silently broken)
- [ ] BottomNav has no scanner tab

### Phase 3
- [ ] `src/services/openai.ts` is deleted
- [ ] All imports point to `src/services/coaching/*` or `src/services/ai/aiClient`
- [ ] `pnpm build` passes
- [ ] AI behaviour unchanged for existing flows (smoke test: generate exercise, run weekly review, generate program)

### Phase 4
- [ ] With no API key, "Create Program" goes to blank ProgramEditor (no error, no wizard)
- [ ] With API key, "Create Program" shows Blank + AI picker
- [ ] `useProgramGenerator` no longer crashes when called without capability

### Phase 5
- [ ] Inline capability check audit complete; decision recorded in a follow-up ADR if `<RequiresAI>` is built
