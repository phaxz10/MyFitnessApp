import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateExerciseDetails,
  generateExerciseDetailsBatch,
} from './exerciseLibraryCoach';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  OpenAI: vi.fn(),
}));

vi.mock('openai', () => ({
  default: mocks.OpenAI,
}));

vi.mock('../../hooks/useAppStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({
      userProfile: {
        openai_api_key: 'sk-test',
        openai_proxy_url: '',
      },
    })),
  },
}));

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
  tips: ['Brace core', 'Knees track over toes', 'Drive through heels', 'Breathe'],
};

beforeEach(() => {
  mocks.create.mockReset();
  mocks.OpenAI.mockReset();
  mocks.OpenAI.mockImplementation(function OpenAIMock() {
    return { responses: { create: mocks.create } };
  });
});

describe('exerciseLibraryCoach', () => {
  it('unwraps the { exercises } envelope on single generation', async () => {
    mocks.create.mockResolvedValue({
      output_text: JSON.stringify({ exercises: [benchPress] }),
      output: [],
    });

    await expect(generateExerciseDetails('Bench Press')).resolves.toEqual(
      benchPress,
    );
  });

  it('unwraps the { exercises } envelope on batch generation', async () => {
    mocks.create.mockResolvedValue({
      output_text: JSON.stringify({ exercises: [benchPress, squat] }),
      output: [],
    });

    await expect(
      generateExerciseDetailsBatch(['Bench Press', 'Squat']),
    ).resolves.toEqual([benchPress, squat]);
  });

  it('requests structured JSON for the wrapped schema', async () => {
    // The wrapper exists specifically so this call uses json_schema mode —
    // a bare z.array() at the root would silently drop to free-text.
    mocks.create.mockResolvedValue({
      output_text: JSON.stringify({ exercises: [benchPress] }),
      output: [],
    });

    await generateExerciseDetails('Bench Press');

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.objectContaining({
          format: expect.objectContaining({
            type: 'json_schema',
            name: 'exercise_details_batch',
          }),
        }),
      }),
    );
  });

  it('throws when the AI returns an empty exercises array for single generation', async () => {
    mocks.create.mockResolvedValue({
      output_text: JSON.stringify({ exercises: [] }),
      output: [],
    });

    await expect(generateExerciseDetails('Bench Press')).rejects.toThrow(
      'AI returned no exercise details',
    );
  });
});
