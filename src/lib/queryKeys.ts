/**
 * Root React Query keys, one per cached read family. Every key a hook builds
 * starts with one of these, so the Write Bus (see queryClient.ts) can
 * invalidate a whole family by the table that was written.
 */
export const QUERY_ROOTS = {
  profile: 'profile',
  strengthProgress: 'strengthProgress',
  workoutLogs: 'workoutLogs',
  programs: 'programs',
  foodEntries: 'foodEntries',
  weightLogs: 'weightLogs',
  weeklyConsistency: 'weeklyConsistency',
  progressPhotos: 'progressPhotos',
} as const;

type QueryRoot = (typeof QUERY_ROOTS)[keyof typeof QUERY_ROOTS];

const R = QUERY_ROOTS;
const TRAINING: QueryRoot[] = [
  R.strengthProgress,
  R.workoutLogs,
  R.weeklyConsistency,
];

/** Which cached read families a write to each table can change. */
export const ROOTS_BY_TABLE: Record<string, QueryRoot[]> = {
  user_profile: [R.profile],
  workout_logs: TRAINING,
  workout_sets: TRAINING,
  workout_log_exercises: TRAINING,
  // Names and types are joined into history, progress and Programs.
  exercises: [...TRAINING, R.programs],
  // Program and Session names are joined into history; active Sessions'
  // days feed the week strip.
  workout_programs: [R.programs, R.workoutLogs, R.weeklyConsistency],
  program_sessions: [R.programs, R.workoutLogs, R.weeklyConsistency],
  program_exercises: [R.programs],
  food_entries: [R.foodEntries, R.weeklyConsistency],
  weight_logs: [R.weightLogs, R.weeklyConsistency],
  progress_photos: [R.progressPhotos],
};
