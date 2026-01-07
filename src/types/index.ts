// User Profile Types
export interface UserProfile {
  id: number;
  age: number;
  gender: 'male' | 'female';
  height_cm: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active';
  goal: 'bulk' | 'lean_bulk' | 'recomp' | 'cut' | 'maintain';
  target_rate_kg_per_week: number;
  calorie_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  gemini_api_key: string | null;
  created_at: string;
  updated_at: string;
}

// Weight Log Types
export interface WeightLog {
  id: number;
  date: string;
  weight_kg: number;
  waist_cm: number | null;
  neck_cm: number | null;
  arm_cm: number | null;
  body_fat_pct: number | null;
  created_at: string;
  updated_at: string;
}

// Food Entry Types
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodEntry {
  id: number;
  date: string;
  meal_type: MealType;
  food_description: string;
  portion_grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  is_ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

// Exercise Types
export interface Exercise {
  id: number;
  name: string;
  description: string;
  muscle_groups: string;
  equipment: string;
  video_url: string | null;
  is_ai_generated: boolean;
  created_at: string;
}

// Workout Program Types
export interface WorkoutProgram {
  id: number;
  name: string;
  description: string;
  sessions_per_week: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProgramSession {
  id: number;
  program_id: number;
  name: string;
  day_of_week: number | null;
  order_index: number;
  created_at: string;
}

export interface ProgramExercise {
  id: number;
  session_id: number;
  exercise_id: number;
  target_sets: number;
  target_rep_min: number;
  target_rep_max: number;
  order_index: number;
  notes: string | null;
}

// Workout Log Types
export interface WorkoutLog {
  id: number;
  program_id: number | null;
  session_id: number | null;
  date: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface WorkoutSet {
  id: number;
  workout_log_id: number;
  exercise_id: number;
  set_number: number;
  reps: number;
  weight_kg: number;
  notes: string | null;
  created_at: string;
}

// AI Goal Review Types
export interface AIGoalReview {
  id: number;
  review_date: string;
  previous_calorie_target: number;
  new_calorie_target: number;
  previous_goal: string;
  new_goal_suggestion: string | null;
  ai_analysis: string;
  was_accepted: boolean;
  created_at: string;
}

// AI Response Types
export interface AIFoodItem {
  name: string;
  portion_grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface AIFoodAnalysisResponse {
  items: AIFoodItem[];
  total: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
}

export interface AIExerciseResponse {
  name: string;
  description: string;
  muscle_groups: string[];
  equipment: string;
  tips: string[];
}

export interface AITargetResponse {
  calorie_target: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  reasoning: string;
}

export interface AIGoalReviewResponse {
  assessment: string;
  on_track: boolean;
  recommendations: {
    calorie_target: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    goal_change: string | null;
    reasoning: string;
  };
  program_suggestions: string;
}

// Joined/View Types
export interface ProgramExerciseWithDetails extends ProgramExercise {
  exercise_name: string;
  exercise_description: string;
  muscle_groups: string;
  equipment: string;
}

export interface ProgramSessionWithExercises extends ProgramSession {
  exercises: ProgramExerciseWithDetails[];
}

export interface WorkoutProgramWithSessions extends WorkoutProgram {
  sessions: ProgramSessionWithExercises[];
}

export interface WorkoutSetWithExercise extends WorkoutSet {
  exercise_name: string;
}

export interface DailyCalorieSummary {
  date: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  meals: {
    breakfast: FoodEntry[];
    lunch: FoodEntry[];
    dinner: FoodEntry[];
    snack: FoodEntry[];
  };
}

// App State Types
export interface AppSettings {
  isOnboardingComplete: boolean;
  isOnline: boolean;
}
