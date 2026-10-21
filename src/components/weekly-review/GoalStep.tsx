import { Check, Target } from 'lucide-react';
import type { UserProfile } from '../../types';
import { GOAL_OPTIONS, goalLabel } from './reviewTypes';
import { StepActions } from './StepActions';
import { StepHeading } from './StepHeading';

interface GoalStepProps {
  currentGoal: UserProfile['goal'];
  suggestedGoal?: string | null;
  selectedGoal: string | null;
  onSelect: (goal: string) => void;
  reason?: string | null;
  isLoading: boolean;
  onSkip: () => void;
  onSave: () => void;
}

export function GoalStep({
  currentGoal,
  suggestedGoal,
  selectedGoal,
  onSelect,
  reason,
  isLoading,
  onSkip,
  onSave,
}: GoalStepProps) {
  return (
    <div className="space-y-4">
      <StepHeading
        icon={<Target size={20} className="text-ink" />}
        title="Change Your Goal"
        reason={reason}
      />

      <dl className="bg-sunken rounded-xl p-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-2">Current goal</dt>
          <dd className="text-ink capitalize">{goalLabel(currentGoal)}</dd>
        </div>
        {suggestedGoal && (
          <div className="flex justify-between">
            <dt className="text-ink-2">Recommended</dt>
            <dd className="text-ink capitalize">{goalLabel(suggestedGoal)}</dd>
          </div>
        )}
      </dl>

      <div
        role="radiogroup"
        aria-label="Goal"
        className="divide-y divide-line border border-line rounded-xl overflow-hidden"
      >
        {GOAL_OPTIONS.map((goal) => {
          const selected = selectedGoal === goal;
          return (
            // biome-ignore lint/a11y/useSemanticElements: styled radio row
            <button
              key={goal}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(goal)}
              className={`w-full min-h-12 px-4 py-2 flex items-center gap-2 text-left transition-colors ${
                selected ? 'bg-eat-soft' : 'hover:bg-sunken'
              }`}
            >
              <span className="text-ink capitalize flex-1">
                {goalLabel(goal)}
              </span>
              {goal === suggestedGoal && (
                <span className="text-sm text-ink-2">Recommended</span>
              )}
              {selected && (
                <Check
                  size={18}
                  className="text-eat-ink shrink-0"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      <StepActions
        secondaryLabel="Keep Current"
        onSecondary={onSkip}
        primaryLabel="Change Goal"
        onPrimary={onSave}
        isLoading={isLoading}
        primaryDisabled={!selectedGoal}
      />
    </div>
  );
}
