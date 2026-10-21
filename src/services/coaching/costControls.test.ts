import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cross-Coach cost contracts: which calls pay for web search, and that the
// session coaching / food caches collapse repeat work into one request.
const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, generateText: mocks.generateText };
});

vi.mock('../../hooks/useAppStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({
      userProfile: {
        ai_provider: 'openrouter',
        ai_model: 'openai/gpt-4o-mini',
        ai_api_key: 'sk-test',
      },
    })),
  },
}));

const { clearAICache } = await import('../ai/aiClient');
const { analyzeFoodText, analyzeFoodImage, foodTextCacheKey } = await import(
  './nutritionCoach'
);
const { generateExerciseDetails } = await import('./exerciseLibraryCoach');
const { reviewWeeklyProgress } = await import('./weeklyReviewCoach');
const {
  optimizeWorkoutProgram,
  generateWorkoutProgramWithFunctionCalling,
  inferExperienceLevelLocally,
} = await import('./programCoach');
const { getSessionCoaching } = await import('./workoutCoach');

const food = {
  items: [
    {
      name: 'egg',
      portion_grams: 50,
      calories: 72,
      protein_g: 6.3,
      carbs_g: 0.4,
      fat_g: 4.8,
    },
  ],
  not_food_reason: null,
};

function modelIds(): string[] {
  return mocks.generateText.mock.calls.map((c) => String(c[0].model.modelId));
}

beforeEach(() => {
  mocks.generateText.mockReset();
  clearAICache();
});

describe('web search is only paid for on food estimates', () => {
  it('food text and food photo use :online', async () => {
    mocks.generateText.mockResolvedValue({ text: '', output: food });
    await analyzeFoodText('a Big Mac');
    await analyzeFoodImage('aGVsbG8=', 'image/jpeg');
    expect(modelIds()).toEqual([
      'openai/gpt-4o-mini:online',
      'openai/gpt-4o-mini:online',
    ]);
  });

  it('exercise details, weekly review, optimize, generation and coaching do not', async () => {
    // Shapes don't matter here — only the outgoing model ids do.
    mocks.generateText.mockResolvedValue({ text: '', output: {}, steps: [] });
    const swallow = (p: Promise<unknown>) => p.catch(() => undefined);

    await swallow(generateExerciseDetails('Bench Press'));
    await swallow(
      reviewWeeklyProgress(
        {
          birthdate: '1990-01-01',
          gender: 'male',
          height_cm: 180,
          goal: 'cut',
          diet_type: 'balanced',
          calorie_target: 2200,
          protein_target_g: 180,
          carbs_target_g: 200,
          fat_target_g: 70,
        } as never,
        {
          weekStart: '2026-10-12',
          weekEnd: '2026-10-18',
          weightLogs: [],
          weightChange: null,
          daysWithWeightLog: 0,
          daysWithCalorieLog: 0,
          totalWorkouts: 0,
          avgDailyCalories: 0,
          calorieAdherence: 0,
        } as never,
      ),
    );
    await swallow(
      optimizeWorkoutProgram({
        profile: {},
        program: {
          name: 'P',
          description: '',
          sessionsPerWeek: 1,
          sessions: [],
        },
        exerciseLibrary: [],
        performanceSummary: [],
        weeklyVolumeSummary: { totalSets: 0, muscleGroupBreakdown: {} },
        preferences: {
          injuries: null,
          focusAreas: [],
          experienceLevel: 'beginner',
          preferredTrainingSplit: 'auto',
          availableEquipment: [],
          sessionDurationMinutes: 60,
        },
      } as never),
    );
    await swallow(
      generateWorkoutProgramWithFunctionCalling(
        {
          trainingDaysPerWeek: 3,
          sessionDurationMinutes: 60,
          availableEquipment: [],
          goal: 'cut',
          experienceLevel: 'beginner',
          gender: 'male',
        } as never,
        [],
      ),
    );
    await swallow(
      getSessionCoaching([
        {
          exerciseId: 1,
          exerciseName: 'Bench Press',
          history: [{ date: '2026-10-01', sets: [] }],
          targetRepMin: 8,
          targetRepMax: 12,
          targetSets: 3,
        },
      ]),
    );

    // At least one request from each of the five Coaches.
    expect(mocks.generateText.mock.calls.length).toBeGreaterThanOrEqual(5);
    for (const id of modelIds()) expect(id).toBe('openai/gpt-4o-mini');
  });
});

describe('food caching', () => {
  it('normalises food text for the cache key', () => {
    expect(foodTextCacheKey('  Two Eggs\n and   TOAST ')).toBe(
      foodTextCacheKey('two eggs and toast'),
    );
    expect(foodTextCacheKey('two eggs')).not.toBe(foodTextCacheKey('3 eggs'));
  });

  it('serves a re-typed description from cache', async () => {
    mocks.generateText.mockResolvedValue({ text: '', output: food });
    await analyzeFoodText('2 Eggs');
    await analyzeFoodText('  2 eggs ');
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it('serves the same photo from cache, a different photo is a new call', async () => {
    mocks.generateText.mockResolvedValue({ text: '', output: food });
    await analyzeFoodImage('aW1hZ2UtYQ==', 'image/jpeg');
    await analyzeFoodImage('aW1hZ2UtYQ==', 'image/jpeg');
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    await analyzeFoodImage('aW1hZ2UtYg==', 'image/jpeg');
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });

  it('no longer asks the model for totals (recomputed locally)', async () => {
    mocks.generateText.mockResolvedValue({ text: '', output: food });
    const result = await analyzeFoodText('one egg');
    expect(result.total.calories).toBe(72);
  });
});

describe('session coaching', () => {
  it('coaches N exercises with exactly one call', async () => {
    const reqs = [3, 1, 2].map((id) => ({
      exerciseId: id,
      exerciseName: `Lift ${id}`,
      history: [
        {
          date: '2026-10-01',
          sets: [{ weight_kg: 60, reps: 10 }] as never,
        },
      ],
      targetRepMin: 8,
      targetRepMax: 12,
      targetSets: 1,
    }));
    mocks.generateText.mockResolvedValue({
      text: '',
      output: {
        exercises: [1, 2, 3, 99].map((id) => ({
          exerciseId: id,
          overallTrend: 'progressing',
          sets: [
            {
              setNumber: 1,
              weight: 'increase',
              reps: 'maintain',
              suggestedWeight: 62.5,
              suggestedReps: 10,
            },
          ],
          coachingTip: 'Add weight.',
        })),
      },
    });
    const result = await getSessionCoaching(reqs);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    // Unknown ids from the model are dropped.
    expect([...result.keys()].sort()).toEqual([1, 2, 3]);

    // Same exercises in a different order: same prompt, served from cache.
    await getSessionCoaching([...reqs].reverse());
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });
});

describe('inferExperienceLevelLocally', () => {
  const base = {
    avgExercisesPerSession: 5,
    avgSetsPerSession: 18,
    hasUsedSupersets: false,
    topExercises: [],
  };
  it('applies the fixed thresholds', () => {
    expect(
      inferExperienceLevelLocally({
        ...base,
        totalWorkouts: 30,
        totalWeeks: 40,
      }).inferredLevel,
    ).toBe('beginner');
    expect(
      inferExperienceLevelLocally({
        ...base,
        totalWorkouts: 100,
        totalWeeks: 8,
      }).inferredLevel,
    ).toBe('beginner');
    expect(
      inferExperienceLevelLocally({
        ...base,
        totalWorkouts: 120,
        totalWeeks: 30,
      }).inferredLevel,
    ).toBe('intermediate');
    expect(
      inferExperienceLevelLocally({
        ...base,
        totalWorkouts: 300,
        totalWeeks: 60,
      }).inferredLevel,
    ).toBe('advanced');
  });
});
