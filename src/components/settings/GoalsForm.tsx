import { RefreshCw } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { dietTypeOptions } from '../../constants/options';
import type { GoalsFormData } from '../../schemas/forms';
import { Button, Select } from '../ui';
import { MacroField } from './MacroField';

const goalOptions = [
  { value: 'bulk', label: 'Bulk' },
  { value: 'lean_bulk', label: 'Lean Bulk' },
  { value: 'recomp', label: 'Recomp' },
  { value: 'cut', label: 'Cut' },
  { value: 'maintain', label: 'Maintain' },
];

interface GoalsFormProps {
  form: UseFormReturn<GoalsFormData>;
  onSubmit: (data: GoalsFormData) => void;
  onRecalculate: () => void;
  isLoading: boolean;
}

export function GoalsForm({
  form,
  onSubmit,
  onRecalculate,
  isLoading,
}: GoalsFormProps) {
  const { register, handleSubmit, formState } = form;
  const { errors } = formState;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Select
        label="Goal"
        {...register('goal')}
        options={goalOptions}
        error={errors.goal?.message}
      />
      <Select
        label="Diet type"
        {...register('dietType')}
        options={dietTypeOptions}
        error={errors.dietType?.message}
      />
      <p className="text-ink-3 text-sm -mt-2">
        Changing this then tapping recalculate re-splits carbs and fat. Keto
        pins carbs low and lets fat fill the rest.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <MacroField
          macro="calories"
          label="Calories"
          {...register('calories')}
          error={errors.calories?.message}
        />
        <MacroField
          macro="protein"
          label="Protein (g)"
          {...register('protein')}
          error={errors.protein?.message}
        />
        <MacroField
          macro="carbs"
          label="Carbs (g)"
          {...register('carbs')}
          error={errors.carbs?.message}
        />
        <MacroField
          macro="fat"
          label="Fat (g)"
          {...register('fat')}
          error={errors.fat?.message}
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="submit"
          size="lg"
          isLoading={isLoading}
          className="flex-1"
        >
          Save Changes
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={onRecalculate}
          disabled={isLoading}
          aria-label="Recalculate targets"
        >
          <RefreshCw size={18} aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
