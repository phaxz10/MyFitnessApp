import type {
  AIProgramGeneratorResponse,
  AIProgramOptimizationInput,
  EquipmentType,
  Exercise,
  ExperienceLevel,
  UserProfile,
} from '../../types';
import { calculateAgeFromBirthdate } from '../../utils/date';
import {
  generateSupersetId,
  isDurationType,
  type ProgramFormData,
  type SessionFormData,
} from './schema';

// Pure translation between the editor form and the AI optimizer.

export interface OptimizePreferences {
  experienceLevel: ExperienceLevel;
  preferredSplit: AIProgramOptimizationInput['preferences']['preferredTrainingSplit'];
  sessionDurationMinutes: number;
  focusAreas: string[];
  injuries: string;
  availableEquipment: EquipmentType[];
}

export function buildOptimizationInput(
  profile: UserProfile,
  program: { name: string; description: string },
  sessions: SessionFormData[],
  allExercises: Exercise[],
  prefs: OptimizePreferences,
): AIProgramOptimizationInput {
  // Build weekly volume summary from current exercises
  const muscleGroupBreakdown: Record<string, number> = {};
  let totalSets = 0;

  for (const session of sessions) {
    for (const exercise of session.exercises) {
      totalSets += exercise.targetSets;
      // Find the exercise in the library to get muscle groups
      const libraryExercise = allExercises.find(
        (e) => e.id === exercise.exerciseId,
      );
      if (libraryExercise?.muscle_groups) {
        const muscles = libraryExercise.muscle_groups
          .split(',')
          .map((m) => m.trim());
        for (const muscle of muscles) {
          muscleGroupBreakdown[muscle] =
            (muscleGroupBreakdown[muscle] || 0) + exercise.targetSets;
        }
      }
    }
  }

  return {
    profile: {
      age: profile.birthdate
        ? calculateAgeFromBirthdate(profile.birthdate)
        : 30,
      gender: profile.gender,
      goal: profile.goal,
      activity_level: profile.activity_level,
      calorie_target: profile.calorie_target,
      protein_target_g: profile.protein_target_g,
      carbs_target_g: profile.carbs_target_g,
      fat_target_g: profile.fat_target_g,
    },
    program: {
      name: program.name,
      description: program.description,
      sessionsPerWeek: sessions.length,
      sessions: sessions.map((session) => ({
        name: session.name,
        dayOfWeek: session.dayOfWeek ? parseInt(session.dayOfWeek, 10) : null,
        exercises: session.exercises.map((exercise) => {
          const libraryExercise = allExercises.find(
            (e) => e.id === exercise.exerciseId,
          );
          return {
            name: exercise.exerciseName,
            muscle_groups: libraryExercise?.muscle_groups || '',
            equipment: libraryExercise?.equipment || '',
            exercise_type: exercise.exerciseType,
            targetSets: exercise.targetSets,
            targetRepMin: exercise.targetRepMin,
            targetRepMax: exercise.targetRepMax,
            targetDurationSeconds: exercise.targetDurationSeconds,
            notes: exercise.notes || null,
            supersetGroupId: exercise.supersetGroupId,
          };
        }),
      })),
    },
    exerciseLibrary: allExercises.map((e) => ({
      name: e.name,
      muscle_groups: e.muscle_groups,
      equipment: e.equipment,
      exercise_type: e.exercise_type,
    })),
    performanceSummary: [], // Could be populated from workout logs if needed
    weeklyVolumeSummary: {
      totalSets,
      muscleGroupBreakdown,
    },
    preferences: {
      injuries: prefs.injuries || null,
      focusAreas: prefs.focusAreas,
      experienceLevel: prefs.experienceLevel,
      preferredTrainingSplit: prefs.preferredSplit,
      availableEquipment: prefs.availableEquipment,
      sessionDurationMinutes: prefs.sessionDurationMinutes,
    },
  };
}

/**
 * Map the optimizer's result back onto the form.
 *
 * Exercises returned by the optimizer must resolve to a row in the user's
 * library before they can be saved (program_exercises.exercise_id is a NOT
 * NULL FK). Unmatched exercises are filtered out and returned by name so the
 * user knows which ones were dropped and can re-add them manually.
 */
export function applyOptimizationResult(
  result: AIProgramGeneratorResponse,
  allExercises: Exercise[],
): { form: ProgramFormData; unmatchedNames: string[] } {
  const unmatchedNames: string[] = [];

  const sessions: SessionFormData[] = result.sessions.map((session) => {
    // Track superset pairs by name
    const supersetPairs: Record<string, string> = {};

    // First pass: identify superset pairs and generate IDs
    for (const exercise of session.exercises) {
      if (exercise.supersetWith) {
        const key = [exercise.name, exercise.supersetWith].sort().join('|');
        if (!supersetPairs[key]) {
          supersetPairs[key] = generateSupersetId();
        }
      }
    }

    const matchedExercises = session.exercises
      .map((exercise) => {
        const libraryExercise = allExercises.find(
          (e) => e.name.toLowerCase() === exercise.name.toLowerCase(),
        );
        if (!libraryExercise) {
          unmatchedNames.push(exercise.name);
          return null;
        }

        // Determine superset group ID
        let supersetGroupId: string | null = null;
        if (exercise.supersetWith) {
          const key = [exercise.name, exercise.supersetWith].sort().join('|');
          supersetGroupId = supersetPairs[key] || null;
        }

        const exerciseType = libraryExercise.exercise_type || 'reps_weight';
        const isDuration = isDurationType(exerciseType);

        return {
          exerciseId: libraryExercise.id,
          exerciseName: libraryExercise.name,
          exerciseType,
          targetSets: exercise.targetSets,
          targetRepMin: isDuration ? null : exercise.targetRepMin,
          targetRepMax: isDuration ? null : exercise.targetRepMax,
          targetDurationSeconds: isDuration
            ? exercise.targetDurationSeconds || 30
            : null,
          supersetGroupId,
          notes: exercise.notes || '',
        };
      })
      .filter(<T>(x: T | null): x is T => x !== null);

    return {
      name: session.name,
      dayOfWeek: session.dayOfWeek?.toString() ?? '',
      isExpanded: true,
      exercises: matchedExercises,
    };
  });

  return {
    form: {
      name: result.programName,
      description: result.programDescription,
      sessions,
    },
    unmatchedNames,
  };
}

/** Recommendations and any dropped exercises, as one alert message. */
export function optimizationSummary(
  result: AIProgramGeneratorResponse,
  unmatchedNames: string[],
): string | null {
  const messageLines: string[] = ['Optimization complete!'];
  if (unmatchedNames.length > 0) {
    const uniqueUnmatched = [...new Set(unmatchedNames)];
    messageLines.push(
      '',
      `Dropped ${uniqueUnmatched.length} exercise(s) not in your library:`,
      ...uniqueUnmatched.map((n) => `- ${n}`),
      '',
      'Add them to your exercise library first, then re-optimize.',
    );
  }
  if (result.recommendations && result.recommendations.length > 0) {
    messageLines.push('', 'Recommendations:');
    messageLines.push(...result.recommendations.map((r) => `- ${r}`));
  }
  return messageLines.length > 1 ? messageLines.join('\n') : null;
}
