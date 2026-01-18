# MyPersonalFitness

Personal fitness tracker with AI-powered coaching, nutrition scanning, and offline-first logging.

## What It Does

- **Dashboard insights** with calorie targets, macro progress, weekly consistency, and goal tracking.
- **Nutrition logging** with meal summaries, quick add, edit, and copy-from-previous-day support.
- **AI meal scanner** to analyze food photos and generate nutrition estimates.
- **Workout programs** with a full program editor, sessions, and superset support.
- **Workout sessions** with timers, rest alerts, exercise notes, and AI coaching prompts.
- **Strength progress analytics** with overview + per-exercise trends.
- **Weight tracker** with trend charts, body-fat estimates, and progress photos.
- **Exercise library** with AI-generated descriptions, batch creation, and duplicate checks.
- **Weekly AI review** that suggests target adjustments and goal changes.
- **Offline-first PWA** using local PGlite storage + service worker caching.
- **Backup/export** for profile, workouts, nutrition logs, progress photos, and AI reviews.

## Big-Win Ideas to Consider Next

- **Cloud sync + multi-device sign-in** so progress follows users everywhere.
- **Push notifications** for workout reminders, rest timers, and daily check-ins.
- **Adaptive workout progression** that auto-adjusts loads based on performance.
- **Deload + fatigue management** with auto-suggested volume reductions.
- **Wearable integrations** (Apple Health/Google Fit) for sleep, HRV, and steps.
- **Recovery tracking** (sleep quality, soreness, stress) to guide training volume.
- **Mobility & prehab plans** tied to weak points and injury history.
- **Pain/injury logging** to flag recurring issues and modify exercises.
- **Hydration + micronutrient targets** to round out health tracking.
- **Form check capture** with AI cues from short clips.
- **Performance insights** like volume PRs, estimated 1RM, and load recommendations.
- **Data insights export** (CSV/API) for deeper analytics and BI tools.

## Getting Started

```bash
pnpm install
pnpm dev
```

## Scripts

- `pnpm dev` - Start the Vite dev server
- `pnpm build` - Type-check and build
- `pnpm lint` - Run Biome lint
- `pnpm format` - Format with Biome
- `pnpm check` - Lint + format checks
- `pnpm preview` - Preview production build

## Debug & Override URL Parameters

These URL parameters allow you to trigger special features or override default behavior for testing and maintenance.

### Weekly Review

| URL | Description |
|-----|-------------|
| `/?forceReview=true` | Force the weekly AI review modal to appear (normally only shows on Mondays) |

### Exercise Library

| URL | Description |
|-----|-------------|
| `/exercises?regenerate-details-all=true` | Regenerate AI details for ALL exercises in the library. Useful after updating AI prompts to refresh descriptions, muscle groups, tips, etc. |

### Calorie Log

| URL | Description |
|-----|-------------|
| `/calories?date=YYYY-MM-DD` | View calorie log for a specific date |
| `/calories?action=add` | Auto-open the food entry modal |

### Weight Tracker

| URL | Description |
|-----|-------------|
| `/weight?date=YYYY-MM-DD` | Select a specific date in the weight tracker |
| `/weight?action=add` | Auto-open the weight log modal |

### Workout

| URL | Description |
|-----|-------------|
| `/workout?date=YYYY-MM-DD` | Set date override for logging missed workout sessions |
| `/workout/session?date=YYYY-MM-DD` | Override date for the current workout session |

### Examples

```bash
# Force weekly review to show (for testing)
http://localhost:5173/?forceReview=true

# Regenerate all exercise details after prompt improvements
http://localhost:5173/exercises?regenerate-details-all=true

# Log a missed workout from yesterday
http://localhost:5173/workout?date=2025-01-17

# Add food entry for a specific date
http://localhost:5173/calories?date=2025-01-15&action=add
```
