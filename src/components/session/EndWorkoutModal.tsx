import type { FormEventHandler } from 'react';
import type { UseFormRegister } from 'react-hook-form';
import type { WorkoutNotesFormData } from '../../schemas/forms';
import { formatElapsedTime } from '../../utils/formatters';
import { Button, Modal, TextArea } from '../ui';

interface EndWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  register: UseFormRegister<WorkoutNotesFormData>;
  completedSets: number;
  elapsedSeconds: number;
}

export function EndWorkoutModal({
  isOpen,
  onClose,
  onSubmit,
  register,
  completedSets,
  elapsedSeconds,
}: EndWorkoutModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="End Workout">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 divide-x divide-line rounded-xl border border-line">
          <div className="px-4 py-3">
            <p className="num text-4xl font-bold text-ink">{completedSets}</p>
            <p className="text-sm text-ink-2">sets completed</p>
          </div>
          <div className="px-4 py-3">
            <p className="num text-4xl font-bold text-ink">
              {formatElapsedTime(elapsedSeconds)}
            </p>
            <p className="text-sm text-ink-2">duration</p>
          </div>
        </div>
        <p className="text-ink-2">Great work!</p>
        <TextArea
          {...register('notes')}
          aria-label="Workout notes"
          placeholder="Add any notes about this workout (optional)"
          rows={3}
        />
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="lg">
            Save Workout
          </Button>
        </div>
      </form>
    </Modal>
  );
}
