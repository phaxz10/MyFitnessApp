import { Target } from 'lucide-react';
import { MacroField } from '../settings/MacroField';
import type { TargetsFormState } from './reviewTypes';
import { StepActions } from './StepActions';
import { StepHeading } from './StepHeading';

interface TargetsStepProps {
  form: TargetsFormState;
  onChange: (next: TargetsFormState) => void;
  currentCalories: number;
  recommendedCalories?: number | null;
  reason?: string | null;
  isLoading: boolean;
  onSkip: () => void;
  onSave: () => void;
}

export function TargetsStep({
  form,
  onChange,
  currentCalories,
  recommendedCalories,
  reason,
  isLoading,
  onSkip,
  onSave,
}: TargetsStepProps) {
  const set = (key: keyof TargetsFormState) => (value: string) =>
    onChange({ ...form, [key]: value });

  return (
    <div className="space-y-4">
      <StepHeading
        icon={<Target size={20} className="text-eat-ink" />}
        title="Adjust Calorie Targets"
        reason={reason}
      />

      <dl className="bg-sunken rounded-xl p-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-2">Current target</dt>
          <dd className="text-ink">
            <span className="num font-bold">{currentCalories}</span> kcal
          </dd>
        </div>
        {recommendedCalories ? (
          <div className="flex justify-between">
            <dt className="text-ink-2">Recommended</dt>
            <dd className="text-eat-ink">
              <span className="num font-bold">{recommendedCalories}</span> kcal
            </dd>
          </div>
        ) : null}
      </dl>

      <MacroField
        macro="calories"
        label="Daily Calories"
        id="review-calories"
        value={form.calories}
        onChange={(e) => set('calories')(e.target.value)}
      />

      <div className="grid grid-cols-3 gap-3">
        <MacroField
          macro="protein"
          label="Protein (g)"
          id="review-protein"
          value={form.protein}
          onChange={(e) => set('protein')(e.target.value)}
        />
        <MacroField
          macro="carbs"
          label="Carbs (g)"
          id="review-carbs"
          value={form.carbs}
          onChange={(e) => set('carbs')(e.target.value)}
        />
        <MacroField
          macro="fat"
          label="Fat (g)"
          id="review-fat"
          value={form.fat}
          onChange={(e) => set('fat')(e.target.value)}
        />
      </div>

      <StepActions
        secondaryLabel="Skip"
        onSecondary={onSkip}
        primaryLabel="Save & Continue"
        onPrimary={onSave}
        isLoading={isLoading}
        primaryDisabled={!form.calories}
      />
    </div>
  );
}
