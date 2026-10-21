import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useWeightUnit } from '../../hooks/useWeightUnit';
import { type WeightLogFormData, weightLogSchema } from '../../schemas/forms';
import { unitLabel } from '../../utils/units';
import { Button, Input, Modal } from '../ui';

export const EMPTY_WEIGHT_FORM: WeightLogFormData = {
  weight: '',
  waist: '',
  neck: '',
  arm: '',
};

interface WeightEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** True when the selected day already has an entry that will be updated. */
  isEditing: boolean;
  /** Form values applied each time the modal opens. Must be a stable reference. */
  initialValues: WeightLogFormData;
  isSaving: boolean;
  error: string | null;
  onSave: (data: WeightLogFormData) => void;
}

export function WeightEntryModal({
  isOpen,
  onClose,
  title,
  isEditing,
  initialValues,
  isSaving,
  error,
  onSave,
}: WeightEntryModalProps) {
  const unit = useWeightUnit();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WeightLogFormData>({
    resolver: zodResolver(weightLogSchema),
    defaultValues: EMPTY_WEIGHT_FORM,
  });

  useEffect(() => {
    reset(isOpen ? initialValues : EMPTY_WEIGHT_FORM);
  }, [isOpen, initialValues, reset]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit(onSave)} className="space-y-4">
        {isEditing && (
          <p className="rounded-lg bg-body-soft p-3 text-sm text-body-ink">
            You already logged weight for this day. This will update your
            existing entry.
          </p>
        )}
        <Input
          label={`Weight (${unitLabel(unit)})`}
          type="number"
          step="0.1"
          {...register('weight')}
          placeholder="Enter your weight"
          error={errors.weight?.message}
        />

        <div className="border-t border-line pt-4">
          <p className="mb-3 text-sm font-semibold text-ink-2">
            Body measurements (optional)
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Waist (cm)"
              type="number"
              step="0.1"
              {...register('waist')}
              placeholder="cm"
            />
            <Input
              label="Neck (cm)"
              type="number"
              step="0.1"
              {...register('neck')}
              placeholder="cm"
            />
            <Input
              label="Arm (cm)"
              type="number"
              step="0.1"
              {...register('arm')}
              placeholder="cm"
            />
          </div>
          <p className="mt-2 text-sm text-ink-3">
            Body fat % is calculated when waist and neck are provided.
          </p>
        </div>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            tone="body"
            isLoading={isSaving}
            className="flex-1"
          >
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
