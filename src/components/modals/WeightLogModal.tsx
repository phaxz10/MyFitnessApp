import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAppStore } from '../../hooks/useAppStore';
import { useProfile } from '../../hooks/useProfile';
import { useWeight } from '../../hooks/useWeight';
import { type WeightLogFormData, weightLogSchema } from '../../schemas/forms';
import { calculateBodyFatPercentage } from '../../utils/calculations';
import { formatDate, formatDisplayDate } from '../../utils/date';
import { Button, Input, Modal } from '../ui';

export function WeightLogModal() {
  const { weightLogModal, closeWeightLogModal } = useAppStore();
  const { logs, addLog, fetchLogs } = useWeight();
  const { profile } = useProfile();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WeightLogFormData>({
    resolver: zodResolver(weightLogSchema),
    defaultValues: {
      weight: '',
      waist: '',
      neck: '',
      arm: '',
    },
  });

  // Check if there's already an entry for the selected date
  const existingLog = logs.find(
    (log) => formatDate(log.date) === weightLogModal.date,
  );

  // Populate form when modal opens
  useEffect(() => {
    if (weightLogModal.isOpen) {
      // Fetch logs to check for existing entry
      fetchLogs();
    }
  }, [weightLogModal.isOpen, fetchLogs]);

  useEffect(() => {
    if (weightLogModal.isOpen && existingLog) {
      reset({
        weight: existingLog.weight_kg.toString(),
        waist: existingLog.waist_cm?.toString() || '',
        neck: existingLog.neck_cm?.toString() || '',
        arm: existingLog.arm_cm?.toString() || '',
      });
      setIsEditing(true);
    } else if (weightLogModal.isOpen) {
      reset({
        weight: '',
        waist: '',
        neck: '',
        arm: '',
      });
      setIsEditing(false);
    }
  }, [weightLogModal.isOpen, existingLog, reset]);

  const handleClose = useCallback(() => {
    reset();
    setError(null);
    setIsLoading(false);
    closeWeightLogModal();
  }, [reset, closeWeightLogModal]);

  const onSubmit = async (data: WeightLogFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      let bodyFatPct: number | null = null;

      if (data.waist && data.neck && profile?.height_cm) {
        bodyFatPct = calculateBodyFatPercentage(
          profile.gender,
          parseFloat(data.waist),
          parseFloat(data.neck),
          profile.height_cm,
        );
      }

      await addLog({
        date: weightLogModal.date,
        weight_kg: parseFloat(data.weight),
        waist_cm: data.waist ? parseFloat(data.waist) : null,
        neck_cm: data.neck ? parseFloat(data.neck) : null,
        arm_cm: data.arm ? parseFloat(data.arm) : null,
        body_fat_pct: bodyFatPct,
      });

      weightLogModal.onSuccess?.();
      handleClose();
    } catch {
      setError('Failed to save weight log');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={weightLogModal.isOpen}
      onClose={handleClose}
      title={
        isEditing
          ? `Update Weight - ${formatDisplayDate(weightLogModal.date)}`
          : `Log Weight - ${formatDisplayDate(weightLogModal.date)}`
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {isEditing && (
          <p className="text-slate-400 text-sm bg-slate-700/50 p-2 rounded">
            You already logged weight for this day. This will update your
            existing entry.
          </p>
        )}

        <Input
          label="Weight (kg)"
          type="number"
          step="0.1"
          {...register('weight')}
          placeholder="Enter your weight"
          error={errors.weight?.message}
        />

        <div className="border-t border-slate-700 pt-4">
          <p className="text-slate-400 text-sm mb-3">
            Body Measurements (optional)
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
          <p className="text-slate-500 text-xs mt-2">
            Body fat % will be calculated if waist and neck are provided.
          </p>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading} className="flex-1">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
