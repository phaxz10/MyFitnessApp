import type { AIExerciseResponse, Exercise, ExerciseType } from '../../types';

export const MUSCLE_GROUPS = [
  'All',
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Legs',
  'Core',
  'Glutes',
  'Full Body',
];

export const EXERCISE_TYPES: {
  value: ExerciseType;
  label: string;
  description: string;
}[] = [
  {
    value: 'reps_weight',
    label: 'Reps & Weight',
    description: 'e.g., Bench Press, Squat',
  },
  {
    value: 'reps_only',
    label: 'Reps Only',
    description: 'e.g., Pull-ups, Push-ups',
  },
  {
    value: 'duration',
    label: 'Duration',
    description: 'e.g., Plank, Dead Hang',
  },
  {
    value: 'duration_weight',
    label: 'Duration & Weight',
    description: 'e.g., Weighted Plank',
  },
];

// Generate YouTube search URL for exercise demo
export function getYouTubeSearchUrl(exerciseName: string): string {
  const query = encodeURIComponent(`${exerciseName} exercise form tutorial`);
  return `https://www.youtube.com/results?search_query=${query}`;
}

export interface BatchExercise {
  name: string;
  status: 'pending' | 'generating' | 'ready' | 'error';
  details?: AIExerciseResponse;
  duplicates?: Exercise[];
  includeForGeneration: boolean;
}

export interface RegenerateProgress {
  current: number;
  total: number;
  currentExercise: string;
  errors: string[];
  completed: string[];
}
