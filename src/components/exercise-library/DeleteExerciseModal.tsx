import { useEffect, useState } from 'react';
import { getDB } from '../../services/db';
import {
  type ExerciseUsage,
  exerciseUsage,
} from '../../services/queries/exerciseUsage';
import type { Exercise } from '../../types';
import { ConfirmModal } from '../ui';

interface DeleteExerciseModalProps {
  exercise: Exercise | null;
  onClose: () => void;
  onConfirm: () => void;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// The copy says what removal really does (see exerciseWriter.removeExercise):
// an exercise with logged workouts is archived and its history stays; one with
// none is deleted. Either way it leaves every program.
function Body({ name, usage }: { name: string; usage: ExerciseUsage | null }) {
  if (!usage) return <>Remove "{name}" from your library?</>;
  const fromPrograms =
    usage.programs > 0
      ? ` It will be taken out of ${plural(usage.programs, 'program')}.`
      : '';
  if (usage.workouts > 0) {
    return (
      <>
        "{name}" will leave your library and exercise pickers.
        {fromPrograms} Your {plural(usage.workouts, 'logged workout')} keep it
        in history and progress.
      </>
    );
  }
  return (
    <>
      "{name}" has no logged workouts, so it will be deleted.
      {fromPrograms}
    </>
  );
}

export function DeleteExerciseModal({
  exercise,
  onClose,
  onConfirm,
}: DeleteExerciseModalProps) {
  const [usage, setUsage] = useState<ExerciseUsage | null>(null);
  const exerciseId = exercise?.id;

  useEffect(() => {
    setUsage(null);
    if (exerciseId === undefined) return;
    let cancelled = false;
    getDB()
      .then((db) => exerciseUsage(db, exerciseId))
      .then((u) => !cancelled && setUsage(u))
      .catch((err) => console.error('Failed to load exercise usage:', err));
    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  const archives = (usage?.workouts ?? 0) > 0;

  return (
    <ConfirmModal
      isOpen={!!exercise}
      onClose={onClose}
      title={archives ? 'Remove Exercise' : 'Delete Exercise'}
      confirmLabel={archives ? 'Remove' : 'Delete'}
      onConfirm={onConfirm}
      danger
    >
      <Body name={exercise?.name ?? ''} usage={usage} />
    </ConfirmModal>
  );
}
