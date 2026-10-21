// Geometric movement pictograms in the Munich '72 manner: figures built from
// round-capped bars at fixed angles plus a solid head. One stroke weight,
// 24x24 grid, currentColor. The signature move of the design system.

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'push'
  | 'press'
  | 'pull'
  | 'row'
  | 'arms'
  | 'carry'
  | 'core'
  | 'general';

type Figure = {
  head?: [number, number];
  lines: string;
  dots?: [number, number][];
};

const FIGURES: Record<MovementPattern, Figure> = {
  squat: {
    head: [11, 4.5],
    lines: 'M4 8.5H17 M10 8 L8 14 L14.5 14.5 L13 21',
  },
  hinge: {
    head: [6.5, 5.5],
    lines: 'M8.5 8 L15 12 L14 21 M8.5 8 L9 15.5 M6 16H12',
  },
  lunge: {
    head: [11, 4],
    lines: 'M11 7.5V13.5 L15.5 14 L16 20.5 M11 13.5 L8.5 19.5 H5',
  },
  push: {
    head: [4, 13.5],
    lines: 'M3 17.5H21 M6.5 14H15 L19 15 L19.5 21 M8.5 14V7 M5.5 7H11.5',
  },
  press: {
    head: [12, 6.5],
    lines:
      'M6 2.5H18 M12 9.5 L8.5 3 M12 9.5 L15.5 3 M12 9.5V16 L10 22 M12 16 L14 22',
  },
  pull: {
    head: [12, 7.5],
    lines: 'M4 2.5H20 M12 10.5 L8 3 M12 10.5 L16 3 M12 10.5V16.5 L11 20 L14 22',
  },
  row: {
    head: [5.8, 8.5],
    lines: 'M8 10.5 L15.5 12 L14.5 21 M8 10.5 L12 8.5 L11.5 13.5 M9.5 14H13.5',
  },
  arms: {
    head: [12, 4.5],
    lines:
      'M12 7.5V15 L10.5 22 M12 15 L13.5 22 M12 8.5 L14 13 L17 9.5 M16 8.2 L18 10.8',
  },
  carry: {
    head: [12, 4.5],
    lines:
      'M12 7.5V14 L9.5 21 M12 14 L14.5 21 M12 8 L8.5 13.5 M12 8 L15.5 13.5',
    dots: [
      [8, 15.8],
      [16, 15.8],
    ],
  },
  core: {
    head: [4.5, 10.5],
    lines: 'M7 11.5 L19.5 15 L20.5 17 M8 12 V17 H11',
  },
  general: {
    lines: 'M6 12H18 M6 8V16 M18 8V16 M3.5 10V14 M20.5 10V14',
  },
};

// Order matters: specific patterns before the general ones they contain
// ("split squat" is a lunge, "leg curl" is not an arm exercise).
const NAME_RULES: [RegExp, MovementPattern][] = [
  [/lunge|split squat|step[- ]?up|bulgarian/, 'lunge'],
  [/leg (extension|press)|squat|goblet|hack/, 'squat'],
  [
    /leg curl|hamstring curl|deadlift|rdl|romanian|good ?morning|hip thrust|glute bridge|swing|hinge/,
    'hinge',
  ],
  [/carry|farmer|suitcase/, 'carry'],
  [
    /plank|crunch|sit[- ]?up|leg raise|knee raise|twist|dead ?bug|hollow|rollout|ab wheel|\bcore\b/,
    'core',
  ],
  [/pull[- ]?up|chin[- ]?up|pull[- ]?down|lat pull/, 'pull'],
  [/row|face pull|rear delt|reverse fly|shrug/, 'row'],
  [
    /overhead|shoulder press|military|arnold|lateral raise|front raise|pike|upright/,
    'press',
  ],
  [/bench|push[- ]?up|chest|dip|fly|flye|pec|floor press/, 'push'],
  [/curl|tricep|skull|kickback|pushdown|extension/, 'arms'],
];

const MUSCLE_RULES: [RegExp, MovementPattern][] = [
  [/chest/, 'push'],
  [/lat|back/, 'row'],
  [/shoulder|delt/, 'press'],
  [/hamstring/, 'hinge'],
  [/quad|glute|leg/, 'squat'],
  [/bicep|tricep|arm|forearm/, 'arms'],
  [/core|ab|oblique/, 'core'],
];

export function movementPatternFor(
  name: string,
  muscleGroups?: string | string[],
): MovementPattern {
  const n = name.toLowerCase();
  for (const [re, pattern] of NAME_RULES) if (re.test(n)) return pattern;
  const m = (
    Array.isArray(muscleGroups) ? muscleGroups.join(' ') : (muscleGroups ?? '')
  ).toLowerCase();
  for (const [re, pattern] of MUSCLE_RULES) if (re.test(m)) return pattern;
  return 'general';
}

interface MovementPictogramProps {
  pattern: MovementPattern;
  size?: number;
  className?: string;
  title?: string;
}

export function MovementPictogram({
  pattern,
  size = 24,
  className = '',
  title,
}: MovementPictogramProps) {
  const fig = FIGURES[pattern];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={fig.lines} />
      {fig.head && (
        <circle
          cx={fig.head[0]}
          cy={fig.head[1]}
          r={2.1}
          fill="currentColor"
          stroke="none"
        />
      )}
      {fig.dots?.map(([cx, cy]) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r={1.5}
          fill="currentColor"
          stroke="none"
        />
      ))}
    </svg>
  );
}

/** Pictogram on a soft training-blue tile: the standard exercise marker. */
export function ExerciseMark({
  name,
  muscleGroups,
  size = 40,
}: {
  name: string;
  muscleGroups?: string | string[];
  size?: number;
}) {
  return (
    <span
      className="grid place-items-center shrink-0 rounded-lg bg-train-soft text-train-ink"
      style={{ width: size, height: size }}
    >
      <MovementPictogram
        pattern={movementPatternFor(name, muscleGroups)}
        size={Math.round(size * 0.65)}
      />
    </span>
  );
}
