# MyPersonalFitness

A free, open-source, offline-first fitness tracker with AI-powered coaching. Built as a Progressive Web App (PWA) — your data stays in your browser, your AI key stays in your hands.

**BYOK (Bring Your Own Key)** — This app uses your own OpenAI API key for AI features. No accounts, no subscriptions, no data collection. You pay OpenAI directly for what you use (typically $0.01-0.05 per AI interaction).

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
- **Your API key** — AI features use your OpenAI key directly, so you control costs
- **No backend** — the entire app runs client-side; optional Google Drive backup uses your own Drive
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
- **Progress photos** — front/side/back photos stored locally with optional Drive backup

### Exercise Library
- **AI-generated details** — descriptions, muscle groups, form tips, and exercise type classification
- **Duplicate detection** — AI-powered fuzzy matching prevents library bloat
- **Batch operations** — bulk-create exercises or regenerate details after prompt improvements

### Data & Backup
- **Google Drive auto-backup** — automatic 60-second debounced backup after any data change
- **Photo sync** — progress photos uploaded individually to your Drive
- **Restore on load** — detects newer remote backups and pulls them automatically
- **Manual export/import** — JSON snapshot of all data for manual backup
- **Privacy-first** — API keys are stripped from exports; photos stored separately

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript 6, React Router 7 |
| **Styling** | Tailwind CSS 4, Lucide icons |
| **State** | Zustand 5 (persisted), TanStack React Query 5 |
| **Forms** | React Hook Form 7, Zod 4 (validation) |
| **Database** | PGlite 0.4 (PostgreSQL in IndexedDB) |
| **AI** | OpenAI SDK 6 (gpt-4o, Responses API) |
| **Charts** | Recharts 3 |
| **Build** | Vite 8, Biome 2 (lint + format) |
| **PWA** | Workbox 7, vite-plugin-pwa |
| **Testing** | Vitest 4 (integration tests with real PGlite) |
| **Backup** | Google Drive API (client-side OAuth) |
| **CORS Proxy** | Cloudflare Worker (optional, for Responses API) |

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

1. Get an [OpenAI API key](https://platform.openai.com/api-keys)
2. Open Settings in the app
3. Paste your API key

**About the CORS proxy:** The OpenAI Responses API doesn't include CORS headers, so browser-direct calls fail. You have two options:
- **Deploy the included Cloudflare Worker** (recommended, free tier) — see [worker/README.md](worker/) for setup
- **Use without proxy** — some AI features that don't require Responses API will still work

### Configure Google Drive Backup

1. Go to Settings > Cloud Backup
2. Sign in with Google (uses `drive.file` scope — can only access files it created)
3. Auto-backup starts automatically after any data change

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

worker/                 # Cloudflare Worker (OpenAI CORS proxy)
docs/adr/               # Architectural Decision Records
```

## Architecture

### AI System

The AI system follows a layered architecture:

```
UI Components
    ↓
Coaching Modules (domain prompts + Zod validation)
    ↓
AI Client (stateless transport + caching + error classification)
    ↓
OpenAI Responses API (via optional CORS proxy)
```

- **AI Client** (`src/services/ai/aiClient.ts`) — stateless, reads the API key from Zustand on each call. Two entry points: `complete<T>()` for single-turn with optional Zod validation, `respond()` for multi-turn/tool-calling conversations.
- **Coaching Modules** (`src/services/coaching/`) — five domain-specific modules that own prompts and response schemas. Each module knows about fitness; the AI client does not.
- **AI Capability** — a configuration concept ("is a key configured?"), separate from network state ("are we online?"). See [ADR-0001](docs/adr/0001-ai-capability-is-configuration-not-call-readiness.md).

### Database

PGlite runs PostgreSQL directly in the browser via IndexedDB. The database schema lives in `src/services/migrator.ts` with sequential migrations.

Key patterns:
- **json_agg** — collapses N+1 queries into single round-trips (see `src/services/queries/workoutHistory.ts`)
- **generate_series** — pre-creates workout sets in bulk instead of looping (see `src/services/writers/workoutWriter.ts`)
- **Write Bus** — intercepts mutations and emits events for auto-backup subscription

### Backup

Google Drive backup uses client-side OAuth (implicit flow) with the `drive.file` scope. Two artifacts are synced:
- `MyFitnessApp/backup.json` — all structured data (photo blobs excluded)
- `MyFitnessApp/photos/photo-{id}.jpg` — individual progress photos

Photos with NULL `photo_data` are lazy-loaded from Drive on demand.

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
- **BYOK** — your OpenAI API key is stored in PGlite, never transmitted to any server except OpenAI
- **Export safety** — API keys are automatically stripped from JSON exports
- **Drive scope** — Google OAuth uses `drive.file` scope (can only access files the app created)


---

Built with React, PGlite, and the OpenAI API. No backend required.
