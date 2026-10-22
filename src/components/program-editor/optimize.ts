import type { FilledSessionExercise } from '../../services/coaching/programCoach';
import {
  type ExerciseRequest,
  normalizeExerciseName,
} from '../../services/writers/exerciseResolver';
import type {
  AIExerciseResponse,
  AIProgramGeneratorResponse,
  AIProgramOptimizationInput,
  EquipmentType,
  Exercise,
  ExperienceLevel,
  UserProfile,
} from '../../types';
import { calculateAgeFromBirthdate } from '../../utils/date';
import {
  type ExerciseFormData,
  generateSupersetId,
  isDurationType,
  type ProgramFormData,
  type SessionFormData,
} from './schema';

// Pure translation between the editor form and the AI coach (generate,
// improve, fill).

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

/** Every exercise name in an AI program, as resolver requests. */
export function programExerciseRequests(
  result: AIProgramGeneratorResponse,
  created: AIExerciseResponse[] = [],
): ExerciseRequest[] {
  const details = new Map(
    created.map((d) => [normalizeExerciseName(d.name), d]),
  );
  return result.sessions.flatMap((s) =>
    s.exercises.map((e) => ({
      name: e.name,
      details: details.get(normalizeExerciseName(e.name)),
    })),
  );
}

/** Targets from the AI on a library exercise, shaped for the form. */
function toFormExercise(
  exercise: Exercise,
  target: {
    targetSets: number;
    targetRepMin?: number | null;
    targetRepMax?: number | null;
    targetDurationSeconds?: number | null;
    notes?: string | null;
  },
  supersetGroupId: string | null = null,
): ExerciseFormData {
  const exerciseType = exercise.exercise_type || 'reps_weight';
  const isDuration = isDurationType(exerciseType);
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    exerciseType,
    targetSets: Math.max(1, Math.round(target.targetSets) || 3),
    targetRepMin: isDuration ? null : (target.targetRepMin ?? 8),
    targetRepMax: isDuration ? null : (target.targetRepMax ?? 12),
    targetDurationSeconds: isDuration
      ? target.targetDurationSeconds || 30
      : null,
    supersetGroupId,
    notes: target.notes || '',
  };
}

/**
 * Map an AI program (generated or improved) onto the form. `resolved` comes
 * from resolveExercises over programExerciseRequests, so every name has a
 * library row and nothing is dropped.
 */
export function applyOptimizationResult(
  result: AIProgramGeneratorResponse,
  resolved: Map<string, Exercise>,
): ProgramFormData {
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

    const exercises = session.exercises.flatMap((exercise) => {
      const libraryExercise = resolved.get(
        normalizeExerciseName(exercise.name),
      );
      if (!libraryExercise) return [];
      const supersetGroupId = exercise.supersetWith
        ? supersetPairs[
            [exercise.name, exercise.supersetWith].sort().join('|')
          ] || null
        : null;
      return [toFormExercise(libraryExercise, exercise, supersetGroupId)];
    });

    return {
      name: session.name,
      dayOfWeek: session.dayOfWeek?.toString() ?? '',
      isExpanded: true,
      exercises,
    };
  });

  return {
    name: result.programName,
    description: result.programDescription,
    sessions,
  };
}

/** Fill suggestions not already in the session (or repeated), by name. */
export function newFillExercises<T extends { name: string }>(
  existing: { exerciseName: string }[],
  filled: T[],
): T[] {
  const seen = new Set(
    existing.map((e) => normalizeExerciseName(e.exerciseName)),
  );
  return filled.filter((e) => {
    const key = normalizeExerciseName(e.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Append "Fill with AI" suggestions to a session, skipping duplicates. */
export function appendFilledExercises(
  existing: ExerciseFormData[],
  filled: FilledSessionExercise[],
  resolved: Map<string, Exercise>,
): ExerciseFormData[] {
  const added = newFillExercises(existing, filled).flatMap((e) => {
    const libraryExercise = resolved.get(normalizeExerciseName(e.name));
    return libraryExercise ? [toFormExercise(libraryExercise, e)] : [];
  });
  return [...existing, ...added];
}
