import { Check } from 'lucide-react';

const STEPS = ['Schedule', 'Equipment', 'Goals', 'Review'];

/** Four-step progress rail; `currentIndex` 0–3. Neutral ink (AI flow). */
export function StepIndicator({ currentIndex }: { currentIndex: number }) {
  return (
    <ol className="flex items-start mb-6" aria-label="Progress">
      {STEPS.map((label, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        return (
          <li
            key={label}
            className="flex-1 flex flex-col items-center gap-1 relative"
            aria-current={current ? 'step' : undefined}
          >
            {index > 0 && (
              <span
                className={`absolute top-4 right-1/2 w-full h-px -z-0 ${index <= currentIndex ? 'bg-ink' : 'bg-line-strong'}`}
                aria-hidden="true"
              />
            )}
            <span
              className={`num relative grid place-items-center size-8 rounded-full text-sm font-bold ${
                done || current
                  ? 'bg-ink text-canvas'
                  : 'bg-sunken text-ink-3 border border-line-strong'
              }`}
            >
              {done ? <Check size={16} aria-hidden="true" /> : index + 1}
            </span>
            <span
              className={`text-sm ${current ? 'font-semibold text-ink' : 'text-ink-3'}`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
