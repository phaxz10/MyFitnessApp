import { Scale } from 'lucide-react';
import { Input } from '../ui';
import type { MeasurementsFormState } from './reviewTypes';
import { StepActions } from './StepActions';
import { StepHeading } from './StepHeading';

interface MeasurementsStepProps {
  form: MeasurementsFormState;
  onChange: (next: MeasurementsFormState) => void;
  reason?: string | null;
  isLoading: boolean;
  onSkip: () => void;
  onSave: () => void;
}

export function MeasurementsStep({
  form,
  onChange,
  reason,
  isLoading,
  onSkip,
  onSave,
}: MeasurementsStepProps) {
  const set = (key: keyof MeasurementsFormState) => (value: string) =>
    onChange({ ...form, [key]: value });

  return (
    <div className="space-y-4">
      <StepHeading
        icon={<Scale size={20} className="text-body-ink" />}
        title="Update Measurements"
        reason={reason}
      />

      <Input
        label="Weight (kg) *"
        id="review-weight"
        type="number"
        inputMode="decimal"
        step="0.1"
        className="num"
        value={form.weight}
        onChange={(e) => set('weight')(e.target.value)}
        placeholder="Enter your current weight"
      />

      <p className="text-ink-3 text-sm">
        Optional measurements for body fat calculation:
      </p>

      <div className="grid grid-cols-3 gap-3">
        <Input
          label="Waist (cm)"
          id="review-waist"
          type="number"
          inputMode="decimal"
          step="0.1"
          className="num"
          value={form.waist}
          onChange={(e) => set('waist')(e.target.value)}
          placeholder="cm"
        />
        <Input
          label="Neck (cm)"
          id="review-neck"
          type="number"
          inputMode="decimal"
          step="0.1"
          className="num"
          value={form.neck}
          onChange={(e) => set('neck')(e.target.value)}
          placeholder="cm"
        />
        <Input
          label="Arm (cm)"
          id="review-arm"
          type="number"
          inputMode="decimal"
          step="0.1"
          className="num"
          value={form.arm}
          onChange={(e) => set('arm')(e.target.value)}
          placeholder="cm"
        />
      </div>

      <StepActions
        secondaryLabel="Skip"
        onSecondary={onSkip}
        primaryLabel="Save & Continue"
        onPrimary={onSave}
        isLoading={isLoading}
        primaryDisabled={!form.weight}
      />
    </div>
  );
}
