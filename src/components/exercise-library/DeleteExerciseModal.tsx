import type { Exercise } from '../../types';
import { ConfirmModal } from '../ui';

interface DeleteExerciseModalProps {
  exercise: Exercise | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteExerciseModal({
  exercise,
  onClose,
  onConfirm,
}: DeleteExerciseModalProps) {
  return (
    <ConfirmModal
      isOpen={!!exercise}
      onClose={onClose}
      title="Delete Exercise"
      confirmLabel="Delete"
      onConfirm={onConfirm}
      danger
    >
      Are you sure you want to delete "{exercise?.name}"? This may affect
      programs that use this exercise.
    </ConfirmModal>
  );
}
