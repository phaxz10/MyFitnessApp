import type { UseFormReturn } from 'react-hook-form';
import type { ProfileFormData } from '../../schemas/forms';
import { Button, Input, Select } from '../ui';

const activityOptions = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
];

interface ProfileFormProps {
  form: UseFormReturn<ProfileFormData>;
  onSubmit: (data: ProfileFormData) => void;
  isLoading: boolean;
}

export function ProfileForm({ form, onSubmit, isLoading }: ProfileFormProps) {
  const { register, handleSubmit, formState } = form;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label="Birthdate"
        type="date"
        {...register('birthdate')}
        error={formState.errors.birthdate?.message}
      />
      <Input
        label="Height (cm)"
        type="number"
        inputMode="decimal"
        {...register('heightCm')}
        error={formState.errors.heightCm?.message}
      />
      <Select
        label="Activity Level"
        {...register('activityLevel')}
        options={activityOptions}
        error={formState.errors.activityLevel?.message}
      />
      <Button type="submit" size="lg" isLoading={isLoading} className="w-full">
        Save Changes
      </Button>
    </form>
  );
}
