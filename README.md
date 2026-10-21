# MyPersonalFitness

[![CI](https://github.com/phaxz10/MyFitnessApp/actions/workflows/ci.yml/badge.svg)](https://github.com/phaxz10/MyFitnessApp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A free, open-source, offline-first fitness tracker with AI-powered coaching. Built as a Progressive Web App (PWA) — your data stays in your browser, your AI key stays in your hands.

**BYOK (Bring Your Own Key)** — This app uses your own [OpenRouter](https://openrouter.ai) API key, which works with models from OpenAI, Anthropic, Google, Meta and more. No accounts, no subscriptions, no data collection. You pay OpenRouter directly for what you use (typically $0.01-0.05 per AI interaction).

[Live Demo](https://my-fitness-app-opal.vercel.app) | [Report a Bug](https://github.com/phaxz10/MyFitnessApp/issues)

---

If you find this useful, consider supporting development:

<a href="https://buymeacoffee.com/phaxz10" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="40">
</a>

---

## Why This Exists

Most fitness apps either cost $10-20/month, lock your data behind accounts, or sell your information. MyPersonalFitness takes a different approach:

- **Free forever** — no premium tiers, no feature gates
- **Your data, your browser** — everything stored locally via PGlite (PostgreSQL in IndexedDB)
- **Your API key, your model** — paste an OpenRouter key and pick any model in Settings; AI features call OpenRouter directly, so you control costs
- **No backend** — the entire app runs client-side; backups are a `.zip` file you download and keep
- **Installable** — works offline as a PWA on any device

## Features

### Nutrition Tracking
- **AI meal scanner** — snap a photo or describe your meal in text, get instant macro estimates
- **Manual entry** — quick-add calories, protein, carbs, and fat
- **Daily dashboard** — calorie and macro progress bars with targets
- **Copy meals** — duplicate a previous day's entries with one tap

### Workout Programs
- **AI program generator** — creates personalized programs based on your goals, equipment, and experience level (powered by BuiltWithScience evidence-based principles)
- **Program editor** — full drag-and-drop editing with superset support
- **Templates** — start from Push/Pull/Legs, Upper/Lower, or Full Body
- **Multiple programs** — switch between programs as your goals change

### Workout Tracking
- **Active session UI** — log sets with weight/reps, tap to complete, rest timer with audio cues
- **Superset support** — grouped exercises with round-based tracking
- **AI coaching** — get progressive overload recommendations based on your history
- **Duration exercises** — built-in timer for planks, holds, and carries
- **Session changes** — diff view shows what you modified vs. the program template

### Strength Analytics
- **Progress overview** — total volume, workout count, time, and personal records
- **Volume charts** — daily and weekly volume trends with time range filters
- **Per-exercise detail** — estimated 1RM tracking (Epley formula), weight/rep history, trend detection
- **Muscle heatmap** — weekly sets per muscle group to spot imbalances
- **PR detection** — automatic personal record tracking for weight and estimated 1RM

### Weekly AI Review
- **Monday check-ins** — automated weekly analysis of nutrition, weight, and workout data
- **Metabolic response** — detects thrifty/normal/spendthrift metabolic patterns
- **Smart recommendations** — suggests calorie adjustments, diet breaks, goal changes
- **Review history** — track how recommendations changed over time

### Weight & Body Composition
- **Weight tracking** — daily logs with weekly trend projection
- **Body fat estimation** — US Navy method from circumference measurements
- **Progress photos** — front/side/back photos stored locally and included in backups

### Exercise Library
- **AI-generated details** — descriptions, muscle groups, form tips, and exercise type classification
- **Duplicate detection** — AI-powered fuzzy matching prevents library bloat
- **Batch operations** — bulk-create exercises or regenerate details after prompt improvements

### Data & Backup
- **Zip backup** — export a `.zip` (pick which data categories) containing `backup.json` plus your progress photos as real image files
- **Restore anywhere** — import a backup in Settings or straight from onboarding; older `.json` backups still restore
- **Privacy-first** — backups never leave the device unless you move the file; API keys are always stripped

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript 6, React Router 7 |
| **Styling** | Tailwind CSS 4, Lucide icons |
| **State** | Zustand 5 (persisted), TanStack React Query 5 |
| **Forms** | React Hook Form 7, Zod 4 (validation) |
| **Database** | PGlite 0.4 (PostgreSQL in IndexedDB) |
| **AI** | Vercel AI SDK 6 via OpenRouter (OpenAI-compatible) |
| **Charts** | Recharts 3 |
| **Build** | Vite 8, Biome 2 (lint + format) |
| **PWA** | Workbox 7, vite-plugin-pwa |
| **Testing** | Vitest 4 (integration tests with real PGlite) |
| **Backup** | Local `.zip` export/import (fflate) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+

### Install and Run

```bash
git clone https://github.com/phaxz10/MyFitnessApp.git
cd MyFitnessApp
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Configure AI Features

1. Open **Settings → AI Settings** (or do it in onboarding)
2. Paste an OpenRouter API key from [openrouter.ai/keys](https://openrouter.ai/keys)
3. Search and pick a model from OpenRouter's live catalog (or type any model id)

OpenRouter is browser-direct — no proxy required. Web search uses OpenRouter's `:online` plugin (see [ADR-0007](docs/adr/0007-openrouter-single-provider.md)).

## Project Structure

```
src/
├── pages/              # Route-level components (Dashboard, Workout, etc.)
├── components/         # Reusable UI components
│   ├── meal-entry/     # Manual, AI Text, and AI Image meal entry adapters
│   ├── workout/        # ExerciseCard, SupersetCard, RestTimer, etc.
│   ├── program-generator/  # AI program generation wizard
│   ├── weekly-review/  # Weekly AI review modal
│   ├── progress/       # Analytics charts and visualizations
│   └── ui/             # Generic components (Button, Modal, Card, etc.)
├── hooks/              # React hooks (state management + business logic)
├── services/
│   ├── ai/             # AI client (stateless), error types, capability check
│   ├── coaching/       # Domain-specific AI modules (5 coaches)
│   ├── queries/        # Read-only SQL queries (json_agg pattern)
│   └── writers/        # Batch write modules (generate_series pattern)
├── types/              # TypeScript type definitions
├── utils/              # Pure utility functions
├── constants/          # Equipment, muscle groups, form options
├── schemas/            # Zod form validation schemas
└── lib/                # TanStack Query configuration

worker/                 # Legacy OpenAI CORS proxy (unused since ADR-0007)
docs/adr/               # Architectural Decision Records
```

## Architecture

> **Design decisions** are recorded as [Architectural Decision Records](docs/adr/) (ADR-0001…0006), and the project's domain vocabulary lives in [CONTEXT.md](CONTEXT.md). Start there to understand *why* the code is shaped the way it is.

### AI System

The AI system follows a layered architecture:

```
UI Components
    ↓
Coaching Modules (domain prompts + Zod validation)
    ↓
AI Client (stateless transport + caching + error classification)
    ↓
Provider API — OpenRouter (single BYOK gateway for every vendor; hosted web search via the `:online` plugin)
```

- **AI Client** (`src/services/ai/aiClient.ts`) — stateless wrapper around the Vercel AI SDK. Reads the active provider + model + key from Zustand on each call. Two entry points: `complete<T>()` for single-turn with optional Zod validation, `respond()` for free-form text and tool-orchestrated calls. Cache, one-shot retry, and `AIError` taxonomy all live here.
- **Coaching Modules** (`src/services/coaching/`) — five domain-specific modules that own prompts and response schemas. Each module knows about fitness; the AI client does not.
- **AI Capability** — a configuration concept ("is a provider+model+key triple configured?"), separate from network state. See [ADR-0001](docs/adr/0001-ai-capability-is-configuration-not-call-readiness.md).
- **Live model catalog** — OpenRouter is the single provider; the model picker is a searchable combobox fed by OpenRouter's public models endpoint (`src/services/ai/openrouterModels.ts`). See [ADR-0007](docs/adr/0007-openrouter-single-provider.md).

### Database

PGlite runs PostgreSQL directly in the browser via IndexedDB. The database schema lives in `src/services/migrator.ts` with sequential migrations.

Key patterns:
- **json_agg** — collapses N+1 queries into single round-trips (see `src/services/queries/workoutHistory.ts`)
- **generate_series** — pre-creates workout sets in bulk instead of looping (see `src/services/writers/workoutWriter.ts`)
- **Write Bus** — intercepts mutations and emits `WriteEvent`s to `onDbWrite` listeners

### Backup

Backups are local files (`src/services/backup.ts`, see [ADR-0008](docs/adr/0008-local-zip-backup-replaces-google-drive.md)). Export writes `mypersonalfitness-backup-YYYY-MM-DD.zip`:
- `backup.json` — all selected tables; each `progress_photos` row carries `photo_file` instead of the inline image
- `photos/<id>.<ext>` — each progress photo as a decoded image file

Import accepts that `.zip` or a legacy `.json` backup (photos inline), and restores inside a single transaction.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Vite dev server |
| `pnpm build` | Type-check and build for production |
| `pnpm preview` | Preview production build locally |
| `pnpm test` | Run integration tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Run Biome linter |
| `pnpm format` | Format code with Biome |
| `pnpm check` | Combined lint + format check |

## Debug & Testing URLs

| URL | Description |
|-----|-------------|
| `/?forceReview=true` | Force weekly review modal (normally Monday-only) |
| `/exercises?regenerate-details-all=true` | Regenerate AI details for all exercises |
| `/calories?date=YYYY-MM-DD` | View calorie log for specific date |
| `/calories?action=add` | Auto-open food entry modal |
| `/weight?date=YYYY-MM-DD` | Select specific date in weight tracker |
| `/weight?action=add` | Auto-open weight log modal |
| `/workout?date=YYYY-MM-DD` | Log missed workout for specific date |


## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repo and create a feature branch
2. Run `pnpm install` and `pnpm dev` to start developing
3. Run `pnpm check` before committing to ensure lint + format pass
4. Run `pnpm test` to verify existing tests pass
5. Open a PR with a clear description of what changed and why

### Areas Where Help Is Appreciated

- **UI component tests** — React Testing Library coverage for key flows
- **AI coaching prompt improvements** — better prompts = better recommendations
- **Accessibility** — screen reader support, keyboard navigation
- **i18n** — internationalization support
- **New exercise types** — e.g., cardio tracking, AMRAP sets
- **Data visualizations** — new chart types in the Progress section

### Code Style

- TypeScript strict mode
- Biome for linting and formatting (run `pnpm check`)
- Prefer editing existing files over creating new ones
- Comments only for non-obvious "why" — the code should explain "what"
- Integration tests use real PGlite (no mocking)

## Privacy & Security

- **No telemetry** — zero analytics, no tracking, no data collection
- **No accounts** — no sign-up, no email, no passwords
- **Local-first** — all data stored in your browser's IndexedDB
- **BYOK** — your AI API key is stored in PGlite, never transmitted to any server except your chosen AI provider
- **Export safety** — API keys are automatically stripped from backups
- **No cloud sync** — backups are files you download; nothing is uploaded anywhere


---

Built with React, PGlite, and the Vercel AI SDK. No backend required.
