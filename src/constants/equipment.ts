import type { AlwaysAvailableEquipment, EquipmentType } from '../types';

// Equipment that is always available (user doesn't need to select these)
export const ALWAYS_AVAILABLE_EQUIPMENT: AlwaysAvailableEquipment[] = [
  'Bodyweight',
  'Resistance Bands',
];

// Equipment categories for better organization in UI
export const EQUIPMENT_CATEGORIES = {
  freeWeights: {
    label: 'Free Weights',
    items: [
      'Barbell',
      'Dumbbell',
      'Kettlebell',
      'EZ Curl Bar',
      'Trap Bar',
    ] as EquipmentType[],
  },
  machines: {
    label: 'Machines',
    items: [
      'Cable Machine',
      'Smith Machine',
      'Leg Press',
      'Leg Curl Machine',
      'Leg Extension Machine',
      'Lat Pulldown Machine',
      'Chest Press Machine',
      'Shoulder Press Machine',
      'Rowing Machine',
    ] as EquipmentType[],
  },
  bodyweight: {
    label: 'Bodyweight Stations',
    items: ['Pull-up Bar', 'Dip Station'] as EquipmentType[],
  },
  benches: {
    label: 'Benches & Racks',
    items: ['Bench', 'Squat Rack'] as EquipmentType[],
  },
  accessories: {
    label: 'Accessories',
    items: [
      'Medicine Ball',
      'Stability Ball',
      'TRX / Suspension Trainer',
      'Battle Ropes',
    ] as EquipmentType[],
  },
} as const;

// Flat list of all equipment options
export const ALL_EQUIPMENT: EquipmentType[] = Object.values(
  EQUIPMENT_CATEGORIES,
).flatMap((category) => category.items);

// Preset equipment configurations for quick selection
export const EQUIPMENT_PRESETS = {
  homeBasic: {
    label: 'Home Basic',
    description: 'Dumbbells and a bench',
    equipment: ['Dumbbell', 'Bench'] as EquipmentType[],
  },
  homeAdvanced: {
    label: 'Home Gym',
    description: 'Full home gym setup',
    equipment: [
      'Barbell',
      'Dumbbell',
      'Bench',
      'Squat Rack',
      'Pull-up Bar',
      'Kettlebell',
    ] as EquipmentType[],
  },
  commercialGym: {
    label: 'Commercial Gym',
    description: 'Full gym with machines',
    equipment: ALL_EQUIPMENT,
  },
  minimal: {
    label: 'Minimal',
    description: 'Bodyweight and bands only',
    equipment: [] as EquipmentType[], // Only always-available equipment
  },
} as const;

// Training split options
export const TRAINING_SPLITS = {
  full_body: {
    label: 'Full Body',
    description: 'Train all muscle groups each session',
    recommendedDays: [2, 3, 4],
  },
  upper_lower: {
    label: 'Upper/Lower',
    description: 'Alternate between upper and lower body',
    recommendedDays: [4],
  },
  push_pull_legs: {
    label: 'Push/Pull/Legs',
    description: 'Split by movement pattern',
    recommendedDays: [3, 6],
  },
  bro_split: {
    label: 'Body Part Split',
    description: 'One muscle group per day',
    recommendedDays: [5, 6],
  },
  auto: {
    label: 'Auto (Recommended)',
    description: 'Let AI choose the best split for your schedule',
    recommendedDays: [2, 3, 4, 5, 6],
  },
} as const;

// Muscle groups for focus area selection
export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Legs',
  'Core',
  'Glutes',
] as const;

// Experience level descriptions
export const EXPERIENCE_LEVELS = {
  beginner: {
    label: 'Beginner',
    description: 'New to lifting or less than 1 year of consistent training',
  },
  intermediate: {
    label: 'Intermediate',
    description: '1-3 years of consistent training',
  },
  advanced: {
    label: 'Advanced',
    description: '3+ years of consistent training',
  },
} as const;
