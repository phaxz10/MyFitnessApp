import { Sparkles } from 'lucide-react';
import type {
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
} from 'react-hook-form';
import type { ExerciseFormData } from '../../schemas/forms';
import type { ExerciseType } from '../../types';
import { Button, Input, Modal, TextArea } from '../ui';
import { EXERCISE_TYPES } from './constants';

interface ExerciseFormModalProps {
  isOpen: boolean;
  isEditing: boolean;
  onClose: () => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  register: UseFormRegister<ExerciseFormData>;
  setValue: UseFormSetValue<ExerciseFormData>;
  errors: FieldErrors<ExerciseFormData>;
  formName: string;
  formExerciseType: ExerciseType;
  aiAvailable: boolean;
  isGenerating: boolean;
  onGenerateDetails: () => void;
  loading: boolean;
}

export function ExerciseFormModal({
  isOpen,
  isEditing,
  onClose,
  onSubmit,
  register,
  setValue,
  errors,
  formName,
  formExerciseType,
  aiAvailable,
  isGenerating,
  onGenerateDetails,
  loading,
}: ExerciseFormModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Exercise' : 'Add Exercise'}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-semibold text-ink-2 mb-1.5"
          >
            Exercise Name *
          </label>
          <div className="flex gap-2">
            <Input
              id="name"
              {...register('name')}
              placeholder="e.g., Bench Press"
              className="flex-1"
              error={errors.name?.message}
            />
            {aiAvailable && (
              <Button
                type="button"
                variant="secondary"
                onClick={onGenerateDetails}
                disabled={isGenerating || !formName.trim()}
                title="Generate details with AI"
                aria-label="Generate details with AI"
              >
                <Sparkles
                  size={18}
                  className={isGenerating ? 'animate-spin' : ''}
                />
              </Button>
            )}
          </div>
        </div>
        <div>
          <label
            htmlFor="description"
            className="block text-sm font-semibold text-ink-2 mb-1.5"
          >
            Description
          </label>
          <TextArea
            id="description"
            {...register('description')}
            placeholder="How to perform the exercise..."
            rows={3}
          />
        </div>
        <div>
          <label
            htmlFor="muscleGroups"
            className="block text-sm font-semibold text-ink-2 mb-1.5"
          >
            Muscle Groups
          </label>
          <Input
            id="muscleGroups"
            {...register('muscleGroups')}
            placeholder="e.g., Chest, Shoulders, Triceps"
          />
        </div>
        <div>
          <label
            htmlFor="equipment"
            className="block text-sm font-semibold text-ink-2 mb-1.5"
          >
            Equipment
          </label>
          <Input
            id="equipment"
            {...register('equipment')}
            placeholder="e.g., Barbell, Bench"
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-2 mb-1.5">
            Exercise Type
          </p>
          <div className="grid grid-cols-2 gap-2">
            {EXERCISE_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setValue('exerciseType', type.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  formExerciseType === type.value
                    ? 'border-train bg-train-soft'
                    : 'border-line hover:border-line-strong'
                }`}
              >
                <p className="text-ink text-sm font-medium">{type.label}</p>
                <p className="text-ink-3 text-xs">{type.description}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={loading || !formName.trim()}
          >
            {isEditing ? 'Save Changes' : 'Add Exercise'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
