import { CheckCircle2, Scale, Utensils } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../ui';
import { type AppliedRecommendations, goalLabel } from './reviewTypes';

interface QuickActionProps {
  icon: ReactNode;
  tone: string;
  label: string;
  hint: string;
  onClick: () => void;
}

function QuickAction({ icon, tone, label, hint, onClick }: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 min-h-11 border border-line hover:border-line-strong active:bg-sunken rounded-xl transition-colors"
    >
      <span className={`grid place-items-center size-10 rounded-full ${tone}`}>
        {icon}
      </span>
      <span className="text-ink text-sm font-semibold">{label}</span>
      <span className="text-ink-3 text-sm">{hint}</span>
    </button>
  );
}

interface CompleteStepProps {
  applied: AppliedRecommendations;
  calories: string;
  selectedGoal: string | null;
  motivationalMessage?: string;
  onDone: () => void;
  onLogWeight: () => void;
  onLogFood: () => void;
}

export function CompleteStep({
  applied,
  calories,
  selectedGoal,
  motivationalMessage,
  onDone,
  onLogWeight,
  onLogFood,
}: CompleteStepProps) {
  const anyApplied = applied.measurements || applied.targets || applied.goal;

  return (
    <div className="space-y-6 py-2">
      <div>
        <CheckCircle2 size={40} className="text-eat-ink mb-3" />
        <h3 className="text-2xl font-bold text-ink">Check-In Complete</h3>
        <p className="text-ink-2 text-sm mt-1">
          Your weekly review has been saved.
        </p>
      </div>

      {anyApplied && (
        <div className="bg-sunken rounded-xl p-4">
          <p className="text-ink-2 text-sm font-semibold mb-2">
            Changes applied
          </p>
          <ul className="space-y-1">
            {applied.measurements && <Change>Body measurements updated</Change>}
            {applied.targets && (
              <Change>
                Calorie targets adjusted to{' '}
                <span className="num font-bold">{calories}</span> kcal
              </Change>
            )}
            {applied.goal && (
              <Change>
                Goal changed to {selectedGoal ? goalLabel(selectedGoal) : ''}
              </Change>
            )}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-ink-2">
          Start your week strong
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <QuickAction
            icon={<Scale size={20} className="text-body-ink" />}
            tone="bg-body-soft"
            label="Log Weight"
            hint="Track today's weight"
            onClick={onLogWeight}
          />
          <QuickAction
            icon={<Utensils size={20} className="text-eat-ink" />}
            tone="bg-eat-soft"
            label="Log Food"
            hint="Start logging meals"
            onClick={onLogFood}
          />
        </div>
      </div>

      {motivationalMessage && (
        <p className="bg-sunken rounded-xl p-4 text-ink text-sm italic">
          "{motivationalMessage}"
        </p>
      )}

      <Button size="lg" onClick={onDone} className="w-full">
        Done
      </Button>
    </div>
  );
}

function Change({ children }: { children: ReactNode }) {
  return (
    <li className="text-eat-ink text-sm flex items-center gap-2">
      <CheckCircle2 size={14} aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}
