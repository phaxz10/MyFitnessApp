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
        ai_provider: 'openai',
        ai_model: 'gpt-4o',
        ai_api_key: 'sk-test',
        ai_proxy_url: null,
      },
    })),
  },
}));

const { generateExerciseDetails, generateExerciseDetailsBatch } = await import(
  './exerciseLibraryCoach'
);

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
});
