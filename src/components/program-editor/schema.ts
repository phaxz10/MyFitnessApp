import { Dumbbell, Timer } from 'lucide-react';
import { z } from 'zod';
import type { ExerciseType } from '../../types';

// Program editor form model plus the small pure helpers built on it.

export const DAY_OPTIONS = [
  { value: '', label: 'Any Day' },
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

export const EXERCISE_TYPE_LABELS: Record<
  ExerciseType,
  { label: string; icon: typeof Dumbbell }
> = {
  reps_weight: { label: 'Reps & Weight', icon: Dumbbell },
  reps_only: { label: 'Reps Only', icon: Dumbbell },
  duration: { label: 'Duration', icon: Timer },
  duration_weight: { label: 'Duration & Weight', icon: Timer },
};

// Form schema with nested arrays
const programExerciseFormSchema = z.object({
  id: z.number().optional(),
  exerciseId: z.number(),
  exerciseName: z.string(),
  exerciseType: z.enum([
    'reps_weight',
    'reps_only',
    'duration',
    'duration_weight',
  ]),
  targetSets: z.number().min(1, 'At least 1 set required'),
  targetRepMin: z.number().nullable(),
  targetRepMax: z.number().nullable(),
  targetDurationSeconds: z.number().nullable(),
  supersetGroupId: z.string().nullable(),
  notes: z.string().optional(),
});

const programSessionFormSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Session name is required'),
  dayOfWeek: z.string(),
  isExpanded: z.boolean(),
  exercises: z.array(programExerciseFormSchema),
});

export const programFormSchema = z.object({
  name: z.string().min(1, 'Program name is required'),
  description: z.string().optional(),
  sessions: z.array(programSessionFormSchema),
});

export type ProgramFormData = z.infer<typeof programFormSchema>;
export type SessionFormData = z.infer<typeof programSessionFormSchema>;
export type ExerciseFormData = z.infer<typeof programExerciseFormSchema>;

export interface SupersetSelection {
  sessionIndex: number;
  exerciseIndex: number;
}

export function isDurationType(type: ExerciseType | undefined): boolean {
  return type === 'duration' || type === 'duration_weight';
}

// Generate unique superset group ID
export function generateSupersetId(): string {
  return `ss-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface ExerciseGroup {
  supersetId: string | null;
  exercises: { exercise: ExerciseFormData; index: number }[];
}

// Group exercises by superset for visual display
export function getExerciseGroups(
  exercises: ExerciseFormData[],
): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  const processedIndices = new Set<number>();

  exercises.forEach((exercise, index) => {
    if (processedIndices.has(index)) return;

    if (exercise.supersetGroupId) {
      // Find all exercises in this superset
      const supersetExercises = exercises
        .map((ex, i) => ({ exercise: ex, index: i }))
        .filter(
          (item) => item.exercise.supersetGroupId === exercise.supersetGroupId,
        );

      for (const item of supersetExercises) {
        processedIndices.add(item.index);
      }
      groups.push({
        supersetId: exercise.supersetGroupId,
        exercises: supersetExercises,
      });
    } else {
      processedIndices.add(index);
      groups.push({ supersetId: null, exercises: [{ exercise, index }] });
    }
  });

  return groups;
}
