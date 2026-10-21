import type { ExerciseFormData } from './schema';

// Pure superset edits for the Program editor. Invariants: a superset has at
// least two members, all members share one targetSets (rounds line up), and on
// save the members sit next to each other.

type Exercises = readonly ExerciseFormData[];

/** Clear the group id of any superset left with a single member. */
function dropSingletons(exercises: ExerciseFormData[]): ExerciseFormData[] {
  const sizes = new Map<string, number>();
  for (const e of exercises) {
    if (e.supersetGroupId) {
      sizes.set(e.supersetGroupId, (sizes.get(e.supersetGroupId) ?? 0) + 1);
    }
  }
  return exercises.map((e) =>
    e.supersetGroupId && sizes.get(e.supersetGroupId) === 1
      ? { ...e, supersetGroupId: null }
      : e,
  );
}

/**
 * Link exercise `second` with exercise `first`. If either is already in a
 * superset the other joins it (so a superset can grow to 3+; two supersets
 * merge, keeping the first's id); otherwise a new superset starts. Every
 * member takes the set count of `first`'s group.
 */
export function linkExercises(
  exercises: Exercises,
  first: number,
  second: number,
  newId: () => string,
): ExerciseFormData[] {
  const a = exercises[first];
  const b = exercises[second];
  if (!a || !b || first === second) return [...exercises];

  const targetId = a.supersetGroupId ?? b.supersetGroupId ?? newId();
  const absorbed = new Set(
    [a.supersetGroupId, b.supersetGroupId].filter(
      (id): id is string => !!id && id !== targetId,
    ),
  );
  const targetSets = a.targetSets;

  return exercises.map((e, i) =>
    i === first ||
    i === second ||
    e.supersetGroupId === targetId ||
    (e.supersetGroupId && absorbed.has(e.supersetGroupId))
      ? { ...e, supersetGroupId: targetId, targetSets }
      : e,
  );
}

/** Remove one exercise; a superset it leaves with one member dissolves. */
export function deleteExercise(
  exercises: Exercises,
  index: number,
): ExerciseFormData[] {
  return dropSingletons(exercises.filter((_, i) => i !== index));
}

/**
 * The order to save: each superset's members are pulled up next to its first
 * member, everything else keeps its relative order, and lone group ids clear.
 */
export function normalizeSupersets(exercises: Exercises): ExerciseFormData[] {
  const cleaned = dropSingletons([...exercises]);
  const placed = new Set<string>();
  const result: ExerciseFormData[] = [];
  for (const e of cleaned) {
    const id = e.supersetGroupId;
    if (!id) {
      result.push(e);
    } else if (!placed.has(id)) {
      placed.add(id);
      result.push(...cleaned.filter((m) => m.supersetGroupId === id));
    }
  }
  return result;
}
