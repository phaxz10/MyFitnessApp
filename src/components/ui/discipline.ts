// Discipline colour coding (Munich '72 direction, see PRODUCT.md / DESIGN.md).
// Every route belongs to one discipline; the header band and active tab take
// its colour. Class strings are literal so Tailwind's scanner sees them.

export type Discipline = 'neutral' | 'train' | 'eat' | 'body';

export function disciplineForPath(pathname: string): Discipline {
  if (pathname.startsWith('/calories')) return 'eat';
  if (pathname.startsWith('/workout') || pathname.startsWith('/exercises'))
    return 'train';
  if (pathname.startsWith('/weight')) return 'body';
  return 'neutral';
}

export const DISCIPLINE_FILL: Record<Discipline, string> = {
  neutral: 'bg-band text-on-band',
  train: 'bg-train text-on-accent',
  eat: 'bg-eat text-on-accent',
  body: 'bg-body text-on-accent',
};

export const DISCIPLINE_TEXT: Record<Discipline, string> = {
  neutral: 'text-ink',
  train: 'text-train-ink',
  eat: 'text-eat-ink',
  body: 'text-body-ink',
};

export const DISCIPLINE_SOFT: Record<Discipline, string> = {
  neutral: 'bg-sunken text-ink',
  train: 'bg-train-soft text-train-ink',
  eat: 'bg-eat-soft text-eat-ink',
  body: 'bg-body-soft text-body-ink',
};
