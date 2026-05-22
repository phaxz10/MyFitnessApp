/**
 * Shared types for query modules.
 *
 * WorkoutLogWithSets was originally defined in useWorkoutLogs.ts — moved here
 * so both the query module and hook consumers can import without circular deps.
 */

import type { WorkoutLog, WorkoutSetWithExercise } from '../../types';

export interface WorkoutLogWithSets extends WorkoutLog {
  sets: WorkoutSetWithExercise[];
  session_name?: string;
  program_name?: string;
}
