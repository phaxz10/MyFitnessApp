---
name: MyPersonalFitness
description: Munich '72 for a home-gym PWA. Three flat discipline colours, geometric movement pictograms, hairline modules, condensed numerals.
colors:
  canvas: "#f3f5f7"
  surface: "#ffffff"
  sunken: "#eef1f4"
  sunken-strong: "#e2e7ec"
  line: "#d8dee4"
  line-strong: "#b9c3cc"
  ink: "#17212b"
  ink-2: "#4b5865"
  ink-3: "#5f6b77"
  on-accent: "#ffffff"
  band: "#17212b"
  on-band: "#f3f5f7"
  train: "#1572ae"
  train-soft: "#dceef9"
  train-ink: "#0e5a8c"
  eat: "#2a7f47"
  eat-soft: "#dff2e5"
  eat-ink: "#1d6237"
  body: "#b3570a"
  body-soft: "#fcead9"
  body-ink: "#8f4507"
  danger: "#b42318"
  danger-soft: "#fde8e6"
  warn: "#9a6700"
  warn-soft: "#fbf0d4"
  macro-calories: "#2a7f47"
  macro-protein: "#1f8fd0"
  macro-carbs: "#c99a00"
  macro-fat: "#d9701a"
typography:
  page-title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    letterSpacing: "-0.025em"
  modal-title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
  card-title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  nav-label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
  numeral:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 700
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
    fontVariation: "font-stretch 75%"
rounded:
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  touch: "44px"
components:
  button-primary-train:
    backgroundColor: "{colors.train}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.xl}"
    height: "44px"
    padding: "0 16px"
  button-primary-eat:
    backgroundColor: "{colors.eat}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.xl}"
    height: "44px"
    padding: "0 16px"
  button-primary-body:
    backgroundColor: "{colors.body}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.xl}"
    height: "44px"
    padding: "0 16px"
  button-primary-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.xl}"
    height: "44px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    height: "44px"
    padding: "0 16px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.xl}"
    height: "44px"
    padding: "0 16px"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.xl}"
    height: "44px"
    padding: "0 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    height: "44px"
    padding: "0 12px"
  header-band:
    backgroundColor: "{colors.band}"
    textColor: "{colors.on-band}"
    height: "56px"
    padding: "0 16px"
  exercise-mark:
    backgroundColor: "{colors.train-soft}"
    textColor: "{colors.train-ink}"
    rounded: "{rounded.lg}"
    size: "40px"
  modal-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.2xl}"
  segmented-selected:
    backgroundColor: "{colors.train}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.lg}"
    height: "40px"
---

# Design System: MyPersonalFitness

Source of truth: `src/index.css` (tokens), `src/components/ui/*` (primitives). Tokens above are the light values; dark values are listed in Colors and in `.impeccable/design.json`.

## Overview

**Creative North Star: "Munich '72 Program"**

Training, eating and body are three disciplines, each owning one flat colour (blue, green, orange) in the manner of Otl Aicher's 1972 Olympic identity. Every movement pattern has a geometric pictogram built from round-capped bars and a solid head. Neutrals are cool silver and deep blue-black. There is no black UI, no gradient, no glass, no card shadow. Modules are hairline-ruled, laid on a 4px grid, with 12px as the working radius. Light is the default (daylight garage, phone on a bench); dark follows `prefers-color-scheme` for night sessions. It refuses the category default: near-black UI, one blue accent, rounded glass cards.

The app is used one-handed between sets, so density is calm and targets are large. Numbers (weights, reps, kcal, timers) are the loudest things on screen: condensed, tabular, bold.

**Key Characteristics:**
- Discipline colour is the only chroma: train blue, eat green, body orange.
- Signature move: `ExerciseMark` pictogram beside every exercise name.
- Hairline modules, flat at rest, no shadow (the bottom-sheet scrim shadow is the one exception).
- Condensed tabular numerals via the `num` utility.
- Fixed chart scales, fixed set-row columns, stamped set states.
- AI is neutral ink, never a brand colour.

## Colors

Cool, quiet neutrals carrying three flat discipline colours. Components use semantic utilities (`bg-surface`, `text-ink-2`, `bg-train`), never raw palette classes, hex, or `dark:` variants. Tokens flip automatically.

### Neutral (light / dark)
- **Canvas** `--canvas` (#f3f5f7 / #0e151c): page ground; also the text colour on `bg-ink` buttons.
- **Surface** `--surface` (#ffffff / #16202a): modules, fields, nav bar, modal sheet.
- **Sunken** `--sunken` (#eef1f4 / #1e2a36): wells, segmented-control track, AI panels, hover fill.
- **Sunken strong** `--sunken-strong` (#e2e7ec / #283746): skeleton blocks.
- **Line** `--line` (#d8dee4 / #2a3846): hairlines, dividers, chart grid.
- **Line strong** `--line-strong` (#b9c3cc / #3a4b5c): field borders, secondary button border, scrollbar.
- **Ink** `--ink` (#17212b / #edf1f4): primary text; AI action fill.
- **Ink 2** `--ink-2` (#4b5865 / #a9b6c2): secondary text, field labels, section labels.
- **Ink 3** `--ink-3` (#5f6b77 / #8593a0): meta, units, placeholders, inactive tab, chart axis text.
- **On accent** `--on-accent` (#ffffff / #0b1218): text on a solid discipline or danger fill.
- **Band** `--band` (#17212b / #1e2a36) with **On band** `--on-band` (#f3f5f7 / #edf1f4): the neutral (Today) header band.

### Disciplines (light / dark)
Each has a solid fill, a soft tint, and a text-safe ink.
- **Train** `--train` (#1572ae / #4aa8e3), soft (#dceef9 / #12324a), ink (#0e5a8c / #8ccbf2). Training, Exercises. Also the focus ring, caret and selection colour.
- **Eat** `--eat` (#2a7f47 / #48b56b), soft (#dff2e5 / #14331f), ink (#1d6237 / #8bd7a3). Nutrition. Also the success colour.
- **Body** `--body` (#b3570a / #ec9448), soft (#fcead9 / #3a2514), ink (#8f4507 / #f5b47a). Weight and body.

### Status (light / dark)
- **Danger** (#b42318 / #f0705f), soft (#fde8e6 / #3a1a17): errors, destructive buttons.
- **Warn** (#9a6700 / #e0b44a), soft (#fbf0d4 / #33290f): cautions.

### Macros (light / dark)
Fill vars for bars and chart marks: calories (#2a7f47 / #48b56b), protein (#1f8fd0 / #4aa8e3), carbs (#c99a00 / #e3bb3a), fat (#d9701a / #ec9448). Text-safe `-ink` variants (>= 4.5:1 on surface) back the `text-macro-*` utilities: calories #1d6237, protein #1569a0, carbs #8a6a00, fat #a8520c in light; equal to the fill in dark. Utilities are for text; fills use `var(--macro-*)` directly.

### Named Rules
**The Three Disciplines Rule.** A screen takes its chroma from its discipline and nothing else. Dashboard modules each use their own discipline.
**The Ink-for-AI Rule.** AI actions are `bg-ink text-canvas` (Button `tone="ink"`), AI panels are `bg-sunken`, icon is lucide `Sparkles`. No purple, no gradient.
**The Soft Pairing Rule.** `-soft` tints pair only with the matching `-ink` text. Solid fills pair with `text-on-accent`.

## Typography

**Font:** Archivo variable (weights 100-900, width axis 62%-125%), self-hosted woff2, fallback `ui-sans-serif, system-ui, sans-serif`. One family for everything.

**Character:** A grotesk in the Aicher/Univers lineage. The width axis does the work: normal width for words, condensed (75%) for numbers, so values stay large without eating the row.

### Hierarchy
- **Page title** (700, 1.25rem/`text-xl`, tracking-tight): the header band section name only.
- **Modal title** (700, 1.125rem/`text-lg`): sheet titles; also page sub-headings (`text-lg font-bold text-ink`).
- **Card title** (700, 1rem/`text-base`): `CardTitle`.
- **Body** (400, 1rem, line-height 1.45): default; inputs are 16px to stop iOS zoom.
- **Section / field label** (600, 0.875rem/`text-sm`, `text-ink-2`): sentence case, above fields and sections.
- **Nav label** (600, 0.75rem/`text-xs`): bottom tabs.
- **Numeral** (`num` utility): `font-stretch: 75%`, tabular-nums, letter-spacing -0.01em. Primary values go large and bold (e.g. `num text-4xl font-bold`); units small in `text-ink-3`.

### Named Rules
**The Num Rule.** Every weight, rep count, kcal, macro, timer and date number uses `num`.
**The Sentence-Case Rule.** No small uppercase tracked eyebrows above headings. Hierarchy comes from size and weight.

## Layout

Mobile-first, one column, content capped at `max-w-lg` (header and tab bar) and centred on larger screens. Page body: `px-4 py-4 space-y-4`. 4px base grid (Tailwind steps 1, 2, 3, 4). More space above a heading than below it. The main area already reserves bottom padding for the nav; pages do not add their own. Header and nav respect `env(safe-area-inset-*)`. Modals are bottom sheets below `sm`, centred dialogs from `sm` up.

Session set rows use fixed columns that never shift (the logged-exercise row is `grid-cols-[2.5rem_1fr_1fr_5rem]`: set #, weight, reps, done).

## Elevation & Depth

Flat. Depth is tonal and ruled: `surface` modules on a `canvas` ground, divided by 1px `line` hairlines; wells use `sunken`. No shadows on cards, buttons or nav. The only shadow is the modal sheet (`0 -8px 32px rgb(0 0 0 / 0.18)`) over a `bg-ink/50` scrim. Black overlays are for the camera UI only. Fields get a focus glow: `0 0 0 3px` of `train` at 25%.

### Named Rules
**The Flat-At-Rest Rule.** Hairline plus tone, not shadow. Cards are never nested; inside a card use rows with `divide-y divide-line`.

## Shapes

Radius ladder: 12px (`rounded-xl`) for modules, buttons, fields and the segmented track; 8px (`rounded-lg`) for small bits (ExerciseMark tile, segmented segments); 16px (`rounded-2xl`) for the modal sheet; full only for small pills and round icon buttons. Borders are 1px; no coloured side-border accents. The active tab marks itself with a 3px top bar (`rounded-b`) inset 16px each side. Pictograms are 24x24 with a 2.4 stroke, round caps and joins.

## Components

### Buttons (`Button`)
- **Variants:** `primary`, `secondary` (surface, `line-strong` border, hover `sunken`), `danger` (`danger` fill), `ghost` (transparent, `ink-2`, hover `sunken`).
- **Tone (primary only):** `train` (default), `eat`, `body`, `ink` (AI actions). Hover `brightness-110` (ink: opacity 90%).
- **Sizes:** `sm` h-9 (36px, dense contexts only), `md` h-11 (44px, default), `lg` h-13 (52px). Primary page actions are `lg`, full width, at thumb height.
- **Shape/type:** 12px radius, weight 600, base size 1rem (sm 0.875rem, lg 1.125rem).
- **States:** `active:scale-[0.98]`; disabled opacity 45% with no pointer events; `isLoading` shows a spinning Loader2 and sets `aria-busy`.

### Cards / Modules (`Card`, `CardHeader`, `CardTitle`, `CardContent`)
`bg-surface`, 1px `line` border, 12px radius, no shadow. Header: `px-4 pt-3.5 pb-2` with a bottom hairline; content `p-4`. With `onClick` the card is a full-width button: border goes `line-strong` on hover, `sunken` on press.

### Fields (`Input`, `Select`, `TextArea`, `Field`)
- **Style:** surface fill, 1px `line-strong` border, 12px radius, 16px text, `ink-3` placeholder. Input and Select are h-11; TextArea is `py-2.5`, no resize. Select has a lucide ChevronDown and no native arrow. Number inputs hide spinners.
- **Label:** `text-sm font-semibold text-ink-2`, 6px above. Helper text `text-sm text-ink-3`.
- **Focus:** border `train` plus the 3px 25% glow. **Error:** border `danger`, message `text-sm text-danger` with `role="alert"`, `aria-invalid`.

### Segmented control (`TimeRangeSelector`)
A `fieldset` track (`sunken`, 12px radius, 4px padding) of 40px segments (`aria-pressed`). Selected segment is a solid `train` (or `body` via `tone`) with `on-accent` text; others `ink-2`. Ranges: this week, 30 days, 90 days, all time.

### Modal (`Modal`) and ConfirmModal
Bottom sheet on phones (rounded top 16px, max-height 92dvh, safe-area padding), centred dialog from `sm` (`max-w-sm|md|lg|2xl`). Scrim is `bg-ink/50` and is built in: pages never add their own backdrop. Title row is 56px with a 44px round close button; Escape closes; body scroll locks. `ConfirmModal` wraps it: `ink-2` message, then two equal-width buttons, secondary cancel and primary (or `danger`) confirm.

### Header band (`Header`)
Sticky, 56px row under the safe area, filled with the route's discipline (`DISCIPLINE_FILL`): Today = band, Training/Exercises = train, Nutrition = eat, Body = body. Shows the section name (Today, Training, Nutrition, Body, Exercises, Settings), an Offline indicator with WifiOff when offline, and a 44px round Settings link (hidden on `/settings`). Pages do not repeat the section title as an h1.

### Bottom navigation (`BottomNav`)
Five tabs: Today (neutral/ink), Train (train), Eat (eat), Body (body), Exercises (train). Surface bar with top hairline, 64px tall, icon 22px over a `text-xs` label. Inactive: `ink-3`. Active: the discipline ink colour, a heavier icon stroke (2.5), and a 3px discipline-coloured bar at the top edge.

### Discipline maps (`discipline.ts`)
`DISCIPLINE_FILL` (solid + on-accent), `DISCIPLINE_SOFT` (tint + ink), `DISCIPLINE_TEXT` (ink) for neutral, train, eat, body. `disciplineForPath` assigns routes. Class strings are literal so Tailwind sees them.

### Movement pictograms (`MovementPictogram`, `ExerciseMark`)
Signature component. `ExerciseMark` is a 40px (default) `train-soft` tile, 8px radius, holding the pictogram at 65% of the tile in `train-ink`. It appears beside every exercise name in lists, cards and session rows. `movementPatternFor(name, muscleGroups)` picks the pattern by ordered name rules, then muscle-group rules, else `general`.

Patterns (11): `squat`, `hinge`, `lunge`, `push`, `press`, `pull`, `row`, `arms`, `carry` (adds two weight dots), `core`, `general` (a barbell, no head).
Name order matters: lunge/split squat first, then squat/leg press/extension, hinge (deadlift, RDL, leg curl, hip thrust), carry, core, pull, row, press, push, arms. Muscle fallback: chest to push, lat/back to row, shoulder to press, hamstring to hinge, quad/glute/leg to squat, arm muscles to arms, core to core.

### Set rows (training)
Fixed columns. A completed set is stamped: row `bg-train-soft` with a filled check. A skipped set stays visible with line-through values and a "Skipped" tag. Nothing silently disappears.

### Empty, loading, error states
Every list has an empty state (one line of guidance plus the action). Loading uses the `Skeleton` family (`animate-pulse`, `sunken-strong`). Errors name the problem and the recovery.

## Do's and Don'ts

### Do:
- **Do** use semantic token utilities only (`bg-surface`, `text-ink-2`, `bg-train-soft`).
- **Do** keep touch targets at least 44px (`h-11`, `size-11`); `Button size="sm"` (36px) is for dense secondary actions only.
- **Do** keep inputs at 16px text.
- **Do** put `ExerciseMark` beside every exercise name.
- **Do** use `num` on every number; make primary values big and bold, units small in `ink-3`.
- **Do** stamp completed sets, keep skipped sets visible, and keep set columns fixed.
- **Do** keep chart y-axis scales fixed per metric so small changes do not look dramatic. Chart colours: `var(--train|eat|body)`, grid `var(--line)`, axis text `var(--ink-3)`, tooltip `var(--surface)`.
- **Do** use lucide-react for icons.
- **Do** make primary page actions `size="lg"`, full width, at thumb height.
- **Do** honour `prefers-reduced-motion` (transitions and animations collapse to 0.01ms).

### Don't:
- **Don't** use raw palette classes, hex values or `dark:` variants in components.
- **Don't** use gradients, gradient text, glass or `backdrop-blur`.
- **Don't** use hard offset shadows, or any shadow on cards.
- **Don't** nest cards, or build page structure from same-size icon+heading+text card grids.
- **Don't** add small uppercase tracked eyebrows above headings.
- **Don't** use coloured border-left/right accents thicker than 1px.
- **Don't** use emoji as icons.
- **Don't** colour AI features purple or with a discipline colour; they are ink.
- **Don't** add your own backdrop or overlay to a `Modal`.
- **Don't** use black overlays outside the camera UI.
- **Don't** let a skipped or completed set vanish from a session list.
