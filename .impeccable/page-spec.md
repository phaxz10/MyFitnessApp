# Page revamp spec (shared by all page agents)

Repo: /Users/phaxz/Desktop/MyFitnessApp (React 19 + Vite + TS + Tailwind v4). Mobile-first PWA used one-handed in a home gym.
Direction: "Munich '72" (Otl Aicher Olympic identity): flat discipline colours, strict grid, geometric movement pictograms. Read PRODUCT.md and .impeccable/surfaces/src-app-tsx.md first.

## Already done (do not edit): src/index.css, src/components/ui/{Button,Card,Field,Input,Select,TextArea,Modal,Header,BottomNav,discipline,MovementPictogram,index}.tsx/ts, src/App.tsx
- A mechanical script already swapped old slate/blue/etc classes for tokens. Results are rough: review every className in your files and fix meaning, hierarchy and spacing.
- The Header is now a coloured band showing the section title (Today / Training / Nutrition / Body / Exercises / Settings). Remove page-level h1s that just repeat that title; keep real sub-headings.
- main already has bottom padding for the nav. Remove page-level pb-20/pb-24 hacks for the nav.

## Tokens (the ONLY colour classes allowed; no raw palette classes like slate/blue/purple, no hex, no `dark:` variants: tokens flip light/dark automatically)
- Neutrals: bg-canvas (page), bg-surface (modules), bg-sunken / bg-sunken-strong (fields, wells, hover), border-line / border-line-strong, divide-line, text-ink (primary), text-ink-2 (secondary), text-ink-3 (tertiary/meta), text-on-accent (text on a solid discipline fill), text-canvas (text on bg-ink).
- Disciplines: train / eat / body, each as `bg-X` (solid fill, use text-on-accent), `bg-X-soft` (tint, pair with text-X-ink), `text-X-ink`, `border-X`. Training pages use train, Nutrition eat, Body/weight body. Dashboard uses each module's discipline.
- States: danger / danger-soft, warn / warn-soft. Success uses eat.
- Macros: text-macro-calories|protein|carbs|fat and CSS vars var(--macro-*) (MACRO_PALETTE in components/nutrition already points at them).
- AI features: neutral ink. Primary AI action `bg-ink text-canvas`, AI panels `bg-sunken`, lucide `Sparkles` icon. No purple.
- Black overlays are fine only for the camera UI.
- Charts/SVG: use `var(--train)`, `var(--eat)`, `var(--body)`, `var(--line)` (grid), `var(--ink-3)` (axis text), `var(--surface)` (tooltip bg). Keep the y-axis scale fixed per metric (don't let it re-zoom so small changes look dramatic).

## Primitives (import from '../components/ui' etc.)
- Button: variant primary|secondary|danger|ghost, tone train|eat|body (primary only), size sm (h-9) | md (h-11) | lg (h-13). Primary page actions: size lg, full width, at thumb height.
- Card / CardHeader / CardTitle / CardContent: hairline modules (bg-surface, 1px border-line, rounded-xl, no shadow). Never nest cards; inside a card use rows with `divide-y divide-line`.
- Input / Select / TextArea (h-11, 16px text), Modal (bottom sheet on phones; don't add your own backdrop/overlay for modals), TimeRangeSelector (segmented control).
- ExerciseMark({name, muscleGroups, size}) and MovementPictogram/movementPatternFor: show ExerciseMark beside every exercise name in lists, cards and session rows. This is the design's signature.
- DISCIPLINE_FILL / DISCIPLINE_SOFT / DISCIPLINE_TEXT class maps for discipline-coded bits.

## Layout and type
- Font is Archivo (variable, has width axis). `num` utility = condensed tabular numerals. Every weight, rep count, kcal, macro, timer, date number uses `num`; primary values big and bold (e.g. `num text-4xl font-bold`), units small in text-ink-3.
- Page: `px-4 py-4 space-y-4`. 4px grid. More space above a heading than below it.
- Headings: page sub-heading text-lg font-bold text-ink; section label text-sm font-semibold text-ink-2. BANNED: small uppercase tracked labels/eyebrows above headings; gradient text; glass/backdrop-blur; coloured border-left/right accents thicker than 1px; hard offset shadows; emoji as icons (use lucide-react); nested cards; same-size icon+heading+text card grids as page structure.
- Touch targets >= 44px (h-11 / size-11 for icon buttons). Inputs 16px text.
- Radius: rounded-xl (12px) modules/buttons, rounded-lg small bits, rounded-full only for small pills/avatars.
- States: every list needs an empty state (one line of guidance + the action), loading uses existing Skeleton components, errors name the problem and the recovery.
- Session set rows: fixed columns (set # / previous / weight / reps / done) that never shift; a completed set is "stamped" (row bg-train-soft, filled check), a skipped set stays visible with line-through and a "Skipped" tag. Nothing silently disappears.
- Keep existing copy unless it is clearly clunky; never invent claims, numbers or testimonials.

## Rules
- UI only: do not change behavior, data flow, hooks, services, routes or props contracts used outside your files.
- Code cleanup in your files: remove dead code and unused imports, extract repeated JSX into small local components, and split any file over ~600 lines into focused components in a sibling folder (pure moves, behavior identical).
- Only edit files in your assigned group. If a shared primitive lacks something, build it locally and mention it in your report.
- Before finishing run: `pnpm exec tsc --noEmit -p tsconfig.app.json`, `pnpm exec biome check --write <your files>`, `pnpm test`. All must pass for your files.
- Do not commit. Do not start dev servers.
- Report (<= 15 lines): what changed per file, files created/split, primitive gaps, anything you were unsure about.
