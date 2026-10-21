import { Edit, Sparkles, Trash2, Video } from 'lucide-react';
import type { Exercise } from '../../types';
import { Button, ExerciseMark, Modal } from '../ui';
import { EXERCISE_TYPES, getYouTubeSearchUrl } from './constants';

interface ExerciseDetailsModalProps {
  exercise: Exercise | null;
  onClose: () => void;
  onEdit: (exercise: Exercise) => void;
  onDelete: (exercise: Exercise) => void;
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-ink-2 text-sm">{label}</p>
      {children}
    </div>
  );
}

export function ExerciseDetailsModal({
  exercise,
  onClose,
  onEdit,
  onDelete,
}: ExerciseDetailsModalProps) {
  return (
    <Modal isOpen={!!exercise} onClose={onClose} title={exercise?.name || ''}>
      {exercise && (
        <div className="space-y-4">
          <ExerciseMark
            name={exercise.name}
            muscleGroups={exercise.muscle_groups}
            size={56}
          />
          <DetailField label="Exercise Type">
            <p className="text-ink">
              {EXERCISE_TYPES.find(
                (t) => t.value === (exercise.exercise_type || 'reps_weight'),
              )?.label || 'Reps & Weight'}
            </p>
          </DetailField>
          {exercise.muscle_groups && (
            <DetailField label="Muscle Groups">
              <p className="text-ink">{exercise.muscle_groups}</p>
            </DetailField>
          )}
          {exercise.equipment && (
            <DetailField label="Equipment">
              <p className="text-ink">{exercise.equipment}</p>
            </DetailField>
          )}
          {exercise.description && (
            <DetailField label="Instructions">
              <p className="text-ink whitespace-pre-wrap">
                {exercise.description}
              </p>
            </DetailField>
          )}
          {/* Video Demo Link */}
          <a
            href={getYouTubeSearchUrl(exercise.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 min-h-11 text-train-ink font-medium"
          >
            <Video size={18} />
            <span>Watch Demo on YouTube</span>
          </a>
          {exercise.is_ai_generated && (
            <div className="flex items-center gap-2 text-ink-3 text-sm">
              <Sparkles size={14} />
              <span>AI Generated</span>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => onEdit(exercise)}
            >
              <Edit size={18} className="mr-2" />
              Edit
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => onDelete(exercise)}
            >
              <Trash2 size={18} className="mr-2" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
