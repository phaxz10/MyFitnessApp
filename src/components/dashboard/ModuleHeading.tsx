import type { ReactNode } from 'react';
import type { Discipline } from '../ui';

const MARKER: Record<Discipline, string> = {
  neutral: 'bg-ink',
  train: 'bg-train',
  eat: 'bg-eat',
  body: 'bg-body',
};

interface ModuleHeadingProps {
  discipline: Discipline;
  children: string;
  action?: ReactNode;
}

// Module heading with a small flat square in the discipline colour.
export function ModuleHeading({
  discipline,
  children,
  action,
}: ModuleHeadingProps) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-11">
      <h2 className="flex items-center gap-2.5 text-lg font-bold text-ink">
        <span
          className={`size-3 rounded-[3px] ${MARKER[discipline]}`}
          aria-hidden="true"
        />
        {children}
      </h2>
      {action}
    </div>
  );
}
