import { z } from 'zod';

// ============== Onboarding Schemas ==============

export const onboardingBasicSchema = z.object({
  birthdate: z
    .string()
    .min(1, 'Birthdate is required')
    .transform((val, ctx) => {
      const parsed = new Date(val);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid birthdate',
        });
        return z.NEVER;
      }
      return val;
    }),
  gender: z.enum(['male', 'female']),
  heightCm: z
    .string()
    .min(1, 'Height is required')
    .transform((val, ctx) => {
      const num = parseInt(val, 10);
      if (Number.isNaN(num) || num < 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Height must be at least 100cm',
        });
        return z.NEVER;
      }
      if (num > 250) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Height must be under 250cm',
        });
        return z.NEVER;
      }
      return num;
    }),
});

export const onboardingWeightSchema = z.object({
  weightKg: z
    .string()
    .min(1, 'Weight is required')
    .transform((val, ctx) => {
      const num = parseFloat(val);
      if (Number.isNaN(num) || num < 30) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Weight must be at least 30kg',
        });
        return z.NEVER;
      }
      if (num > 300) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Weight must be under 300kg',
        });
        return z.NEVER;
      }
      return num;
    }),
});

export const onboardingActivitySchema = z.object({
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active']),
});

export const onboardingGoalSchema = z.object({
  goal: z.enum(['bulk', 'lean_bulk', 'recomp', 'cut', 'maintain']),
});

export const onboardingApiSchema = z.object({
  aiProvider: z.enum(['openai', 'anthropic', 'google']).optional(),
  aiModel: z.string().optional(),
  apiKey: z.string().optional(),
  proxyUrl: z.string().optional(),
});

export const onboardingTargetsSchema = z.object({
  calories: z
    .number()
    .min(1000, 'Calories must be at least 1000')
    .max(10000, 'Calories too high'),
  protein: z
    .number()
    .min(50, 'Protein must be at least 50g')
    .max(500, 'Protein too high'),
  carbs: z
    .number()
    .min(50, 'Carbs must be at least 50g')
    .max(1000, 'Carbs too high'),
  fat: z.number().min(20, 'Fat must be at least 20g').max(500, 'Fat too high'),
});

// Combined onboarding schema for the full form data
export const onboardingSchema = z.object({
  birthdate: z.string().min(1, 'Birthdate is required'),
  gender: z.enum(['male', 'female']),
  heightCm: z.string().min(1, 'Height is required'),
  weightKg: z.string().min(1, 'Weight is required'),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active']),
  goal: z.enum(['bulk', 'lean_bulk', 'recomp', 'cut', 'maintain']),
  aiProvider: z.enum(['openai', 'anthropic', 'google']).optional(),
  aiModel: z.string().optional(),
  apiKey: z.string().optional(),
  proxyUrl: z.string().optional(),
  targets: z.object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
  }),
});

export type OnboardingFormData = z.infer<typeof onboardingSchema>;

// ============== Settings Schemas ==============

export const profileFormSchema = z.object({
  birthdate: z.string().min(1, 'Birthdate is required'),
  heightCm: z.string().min(1, 'Height is required'),
  activityLevel: z.string().min(1, 'Activity level is required'),
});

export const goalsFormSchema = z.object({
  goal: z.string().min(1, 'Goal is required'),
  calories: z.string().min(1, 'Calories is required'),
  protein: z.string().min(1, 'Protein is required'),
  carbs: z.string().min(1, 'Carbs is required'),
  fat: z.string().min(1, 'Fat is required'),
});

export const apiKeyFormSchema = z.object({
  aiProvider: z.enum(['openai', 'anthropic', 'google']).optional(),
  aiModel: z.string().optional(),
  apiKey: z.string().optional(),
  proxyUrl: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === '') return true;
        try {
          const url = new URL(val);
          return url.protocol === 'https:' || url.protocol === 'http:';
        } catch {
          return false;
        }
      },
      { message: 'Must be a valid http(s) URL' },
    ),
});

export type ProfileFormData = z.infer<typeof profileFormSchema>;
export type GoalsFormData = z.infer<typeof goalsFormSchema>;
export type ApiKeyFormData = z.infer<typeof apiKeyFormSchema>;

// ============== Weight Tracker Schema ==============

export const weightLogSchema = z.object({
  weight: z.string().min(1, 'Weight is required'),
  waist: z.string().optional(),
  neck: z.string().optional(),
  arm: z.string().optional(),
});

export type WeightLogFormData = z.infer<typeof weightLogSchema>;

// ============== Calorie Log Schema ==============

export const foodEntrySchema = z.object({
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  foodDescription: z.string().optional(),
  portionGrams: z.string().optional(),
  calories: z.string().min(1, 'Calories is required'),
  protein: z.string().min(1, 'Protein is required'),
  carbs: z.string().min(1, 'Carbs is required'),
  fat: z.string().min(1, 'Fat is required'),
});

export type FoodEntryFormData = z.infer<typeof foodEntrySchema>;

// ============== Exercise Library Schema ==============

export const exerciseFormSchema = z.object({
  name: z.string().min(1, 'Exercise name is required'),
  description: z.string().optional(),
  muscleGroups: z.string().optional(),
  equipment: z.string().optional(),
  exerciseType: z.enum([
    'reps_weight',
    'reps_only',
    'duration',
    'duration_weight',
  ]),
});

export type ExerciseFormData = z.infer<typeof exerciseFormSchema>;

// ============== Program Editor Schema ==============

export const programExerciseSchema = z
  .object({
    exerciseId: z.number(),
    exerciseName: z.string(),
    exerciseType: z
      .enum(['reps_weight', 'reps_only', 'duration', 'duration_weight'])
      .default('reps_weight'),
    targetSets: z.number().min(1, 'At least 1 set required'),
    targetRepMin: z.number().nullable().optional(),
    targetRepMax: z.number().nullable().optional(),
    targetDurationSeconds: z.number().nullable().optional(),
    supersetGroupId: z.string().nullable().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      // For duration exercises, ensure duration is set
      if (
        data.exerciseType === 'duration' ||
        data.exerciseType === 'duration_weight'
      ) {
        return (
          data.targetDurationSeconds !== null &&
          data.targetDurationSeconds !== undefined &&
          data.targetDurationSeconds > 0
        );
      }
      // For rep exercises, ensure reps are set
      return (
        data.targetRepMin !== null &&
        data.targetRepMin !== undefined &&
        data.targetRepMax !== null &&
        data.targetRepMax !== undefined &&
        data.targetRepMin > 0 &&
        data.targetRepMax >= data.targetRepMin
      );
    },
    {
      message: 'Please set valid targets for this exercise type',
    },
  );

export const programSessionSchema = z.object({
  name: z.string().min(1, 'Session name is required'),
  dayOfWeek: z.number().nullable(),
  exercises: z.array(programExerciseSchema),
});

export const programSchema = z.object({
  name: z.string().min(1, 'Program name is required'),
  description: z.string().optional(),
  sessions: z
    .array(programSessionSchema)
    .min(1, 'At least one session required'),
});

export type ProgramFormData = z.infer<typeof programSchema>;
export type ProgramSessionFormData = z.infer<typeof programSessionSchema>;
export type ProgramExerciseFormData = z.infer<typeof programExerciseSchema>;

// ============== Workout Session Schema ==============

export const workoutSetSchema = z.object({
  reps: z.string().optional(),
  weight: z.string().optional(),
  durationSeconds: z.string().optional(),
});

export const workoutNotesSchema = z.object({
  notes: z.string().optional(),
});

export type WorkoutSetFormData = z.infer<typeof workoutSetSchema>;
export type WorkoutNotesFormData = z.infer<typeof workoutNotesSchema>;
