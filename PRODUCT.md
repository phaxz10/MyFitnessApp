# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primary: casual lifters training in a home gym with limited equipment (dumbbells, a bench, maybe a rack or bands), who want structure without a coach or a subscription. Secondary: dedicated natural lifters who track volume, PRs and macros seriously. Both use the app on a phone during or right after a session: one hand, between sets, often in poor lighting.

## Product Purpose
MyPersonalFitness is a free, open-source, offline-first PWA for planning workouts, logging sets, tracking nutrition and body weight, and getting AI coaching. Success means a lifter can log a set or a meal in seconds and see whether they are progressing.

## Positioning
No account, no backend, no subscription. All data lives in the browser (PGlite / IndexedDB) with optional backup to the user's own Google Drive. AI is bring-your-own-key through OpenRouter (ADR-0007), so the user picks the model and pays per request.

## Operating Context
- Mid-session logging: weights, reps, rest timer, supersets, duration holds.
- Program building, from templates or AI-generated for the equipment the user actually has.
- Meal logging by photo, text, or manual macros against daily targets.
- Weekly AI review, strength analytics (volume, estimated 1RM, muscle heatmap), weight trend.

## Capabilities and Constraints
- React 19 + Vite + TypeScript + Tailwind v4, PGlite, Zustand, React Query, Vercel AI SDK.
- Installable PWA, must work offline; AI features degrade gracefully without a key.
- Mobile-first; desktop is secondary.
- Also a public portfolio repo (github.com/phaxz10/MyFitnessApp); code quality is visible.

## Brand Commitments
Name: MyPersonalFitness. Voice: plain, encouraging, no hype.

## Evidence on Hand
No testimonials, user counts or press. Do not fabricate any.

## Product Principles
1. Logging speed beats everything during a session.
2. Works for limited equipment without making the lifter feel lesser.
3. Your data, your key: never imply accounts or tracking.
4. Show progress honestly; no gamified noise.

## Accessibility & Inclusion
Large touch targets for sweaty, one-handed use; readable in bright and dim light; WCAG AA contrast.
