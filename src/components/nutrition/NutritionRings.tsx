// Concentric progress rings (Apple Watch-inspired) for daily nutrition.
// Outer-to-inner: calories, protein, carbs, fat. Each ring fills as the
// consumed value approaches its target. Selected over flat bars + a stacked
// macro bar in the visual prototype (see /calories ?variant= history) — the
// rings win on at-a-glance legibility for four simultaneous progress signals.
//
// Palette is exported because the meal-entry results screen, Settings target
// card, and Onboarding targets display use the same per-macro colors even
// when they don't render rings themselves.
import type { ReactNode } from 'react';

export const MACRO_PALETTE = {
  // Hex used as raw SVG stroke; the *_TEXT variants are Tailwind utility
  // classes so consumers don't have to thread CSS variables.
  calories: { hex: '#f43f5e', text: 'text-rose-400' }, // rose-500
  protein: { hex: '#facc15', text: 'text-amber-300' }, // yellow-400
  carbs: { hex: '#22d3ee', text: 'text-cyan-400' }, // cyan-400
  fat: { hex: '#c084fc', text: 'text-violet-400' }, // purple-400
} as const;

export interface NutritionRingsProps {
  consumed: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  targets: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  size?: number; // px — square viewport. Defaults to 176 (44 * 4 ≈ tap-friendly).
  // Custom center overlay. If omitted, renders the consumed calorie count
  // plus a small "of N kcal" caption.
  center?: ReactNode;
  // <title> for screen readers / a11y. Defaults to a descriptive label.
  title?: string;
}

const RING_RADII = [85, 68, 51, 34] as const; // outer→inner
const STROKE_WIDTH = 11;

function ringDashArray(progress: number, radius: number): string {
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(Math.max(progress, 0), 1) * circumference;
  return `${filled} ${circumference - filled}`;
}

export function NutritionRings({
  consumed,
  targets,
  size = 176,
  center,
  title = 'Daily nutrition progress rings',
}: NutritionRingsProps) {
  // Targets default to 1 to avoid div-by-zero before profile is loaded.
  const safe = (t: number) => (t > 0 ? t : 1);
  const rings = [
    {
      radius: RING_RADII[0],
      progress: consumed.calories / safe(targets.calories),
      color: MACRO_PALETTE.calories.hex,
    },
    {
      radius: RING_RADII[1],
      progress: consumed.protein / safe(targets.protein),
      color: MACRO_PALETTE.protein.hex,
    },
    {
      radius: RING_RADII[2],
      progress: consumed.carbs / safe(targets.carbs),
      color: MACRO_PALETTE.carbs.hex,
    },
    {
      radius: RING_RADII[3],
      progress: consumed.fat / safe(targets.fat),
      color: MACRO_PALETTE.fat.hex,
    },
  ];

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full"
        role="img"
        aria-label={title}
      >
        <title>{title}</title>
        {rings.map((ring) => (
          // Rotate so progress starts at 12 o'clock and fills clockwise.
          <g key={ring.radius} transform="rotate(-90 100 100)">
            <circle
              cx="100"
              cy="100"
              r={ring.radius}
              fill="none"
              stroke={ring.color}
              strokeOpacity="0.15"
              strokeWidth={STROKE_WIDTH}
            />
            <circle
              cx="100"
              cy="100"
              r={ring.radius}
              fill="none"
              stroke={ring.color}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={ringDashArray(ring.progress, ring.radius)}
              style={{ transition: 'stroke-dasharray 0.5s ease-out' }}
            />
          </g>
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {center ?? (
          <>
            <p className="text-3xl font-black text-white tabular-nums leading-none">
              {Math.round(consumed.calories).toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">
              of {Math.round(targets.calories).toLocaleString()} kcal
            </p>
          </>
        )}
      </div>
    </div>
  );
}
