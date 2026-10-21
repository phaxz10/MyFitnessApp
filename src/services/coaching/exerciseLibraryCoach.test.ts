import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Vercel SDK function before importing the coach (which transitively
// imports aiClient → ai). All schema-bearing calls go through generateText +
// Output.object per Vercel SDK v6.
const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateText: mocks.generateText,
  };
});

vi.mock('../../hooks/useAppStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({
      userProfile: {
        ai_provider: 'openrouter',
        ai_model: 'openai/gpt-4o-mini',
        ai_api_key: 'sk-test',
        ai_proxy_url: null,
      },
    })),
  },
}));

const { generateExerciseDetails, generateExerciseDetailsBatch } = await import(
  './exerciseLibraryCoach'
);
const { clearAICache } = await import('../ai/aiClient');

const benchPress = {
  name: 'Bench Press',
  description: 'Lie on a bench and press the barbell up.',
  muscle_groups: ['Chest', 'Triceps'],
  equipment: 'Barbell',
  exercise_type: 'reps_weight' as const,
  tips: ['Retract scapula', 'Keep feet planted', 'Control descent', 'Breathe'],
};
const squat = {
  name: 'Squat',
  description: 'Drop hips below parallel and stand back up.',
  muscle_groups: ['Quads', 'Glutes'],
  equipment: 'Barbell',
  exercise_type: 'reps_weight' as const,
  tips: [
    'Brace core',
    'Knees track over toes',
    'Drive through heels',
    'Breathe',
  ],
};

beforeEach(() => {
  mocks.generateText.mockReset();
  // Exercise details are cached per name; isolate each test.
  clearAICache();
});

describe('exerciseLibraryCoach', () => {
  it('unwraps the { exercises } envelope on single generation', async () => {
    // The wrapper exists specifically so this call uses Output.object structured
    // mode. The mock returns the envelope shape; the coach unwraps it.
    mocks.generateText.mockResolvedValue({
      output: { exercises: [benchPress] },
      text: '',
    });

    await expect(generateExerciseDetails('Bench Press')).resolves.toEqual(
      benchPress,
    );
  });

  it('unwraps the { exercises } envelope on batch generation', async () => {
    mocks.generateText.mockResolvedValue({
      output: { exercises: [benchPress, squat] },
      text: '',
    });

    await expect(
      generateExerciseDetailsBatch(['Bench Press', 'Squat']),
    ).resolves.toEqual([benchPress, squat]);
  });

  it('routes structured-output calls through generateText with Output.object', async () => {
    mocks.generateText.mockResolvedValue({
      output: { exercises: [benchPress] },
      text: '',
    });

    await generateExerciseDetails('Bench Press');

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    const args = mocks.generateText.mock.calls[0][0];
    expect(args.output).toBeDefined();
  });

  it('throws when the AI returns an empty exercises array for single generation', async () => {
    mocks.generateText.mockResolvedValue({
      output: { exercises: [] },
      text: '',
    });

    await expect(generateExerciseDetails('Bench Press')).rejects.toThrow(
      'AI returned no exercise details',
    );
  });

  it('serves cached names locally and sends only the misses in one call', async () => {
    mocks.generateText.mockResolvedValueOnce({
      output: { exercises: [benchPress] },
      text: '',
    });
    await generateExerciseDetailsBatch(['Bench Press']);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);

    mocks.generateText.mockResolvedValueOnce({
      output: { exercises: [squat] },
      text: '',
    });
    // 'bench press' differs only in case: a cache hit.
    const result = await generateExerciseDetailsBatch(['bench press', 'Squat']);
    expect(result).toEqual([benchPress, squat]);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    // Only the miss was sent.
    const prompt = mocks.generateText.mock.calls[1][0].prompt as string;
    expect(prompt).toContain('Squat');
    expect(prompt).not.toContain('Bench Press');

    // Everything cached now: no call at all.
    await generateExerciseDetailsBatch(['Squat', 'Bench Press']);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });
});

describe('duplicate detection', () => {
  const lib = (name: string, id: number) =>
    ({
      id,
      name,
      muscle_groups: 'Chest',
      equipment: 'Barbell',
    }) as unknown as import('../../types').Exercise;

  it('resolves normalised exact matches locally without an AI call', async () => {
    const { findDuplicateExercisesBatch } = await import(
      './exerciseLibraryCoach'
    );
    const existing = [lib('DB Bench Presses', 1), lib('Squat', 2)];
    const result = await findDuplicateExercisesBatch(
      ['dumbbell bench press', 'Deadlift'],
      existing,
    );
    expect(result['dumbbell bench press']?.map((e) => e.id)).toEqual([1]);
    // 'Deadlift' shares no meaningful word with anything: no candidate.
    expect(result.Deadlift).toBeUndefined();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('sends only ambiguous candidates, all in ONE call', async () => {
    const { findDuplicateExercisesBatch } = await import(
      './exerciseLibraryCoach'
    );
    const existing = [
      lib('Barbell Bench Press', 1),
      lib('Romanian Deadlift', 2),
      lib('Lateral Raise', 3),
    ];
    mocks.generateText.mockResolvedValueOnce({
      text: '',
      output: {
        results: [
          { candidate: 1, duplicate_options: [1] },
          { candidate: 2, duplicate_options: [] },
        ],
      },
    });
    const result = await findDuplicateExercisesBatch(
      ['Flat Bench Press', 'Stiff Leg Deadlift', 'Hammer Curl'],
      existing,
    );
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(result['Flat Bench Press']?.map((e) => e.id)).toEqual([1]);
    expect(result['Stiff Leg Deadlift']).toBeUndefined();
    expect(result['Hammer Curl']).toBeUndefined();
    const prompt = mocks.generateText.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain('Hammer Curl');
    expect(prompt).not.toContain('Lateral Raise');
  });
});
