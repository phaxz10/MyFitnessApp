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
- **Barcode + OCR food input** to speed up nutrition logging at scale.
- **Adaptive workout progression** that auto-adjusts loads based on performance.
- **Goal-based meal planning** with shopping lists and recipe macros.
- **Wearable integrations** (Apple Health/Google Fit) for steps, sleep, and HRV.
- **Recovery tracking** (sleep quality, readiness, soreness) to guide training volume.
- **Social accountability** via streaks, sharing milestones, or small groups.
- **Coach dashboard** to let trainers monitor client progress remotely.
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
