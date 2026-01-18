// User Profile Types
export interface UserProfile {
  id: number;
  birthdate: string;
  gender: 'male' | 'female';
  height_cm: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active';
  goal: 'bulk' | 'lean_bulk' | 'recomp' | 'cut' | 'maintain';
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
export type ExerciseType =
  | 'reps_weight'
  | 'reps_only'
  | 'duration'
  | 'duration_weight';

export interface Exercise {
  id: number;
  name: string;
  description: string;
  muscle_groups: string;
  equipment: string;
  video_url: string | null;
  exercise_type: ExerciseType;
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
  target_rep_min: number | null;
  target_rep_max: number | null;
  target_duration_seconds: number | null;
  order_index: number;
  superset_group_id: string | null;
  notes: string | null;
}

// Workout Log Types
export type WorkoutStatus =
  | 'in_progress'
  | 'completed'
  | 'incomplete'
  | 'missed';

export interface WorkoutLog {
  id: number;
  program_id: number | null;
  session_id: number | null;
  date: string;
  started_at: string;
  ended_at: string | null;
  status: WorkoutStatus;
  notes: string | null;
  created_at: string;
}

export interface WorkoutSet {
  id: number;
  workout_log_id: number;
  exercise_id: number;
  workout_log_exercise_id: number | null; // References workout_log_exercises
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  notes: string | null;
  completed_at: string | null; // When user marked set as completed (NULL = not completed)
  created_at: string;
}

// Workout Log Exercise - independent copy of exercises for a specific workout
export interface WorkoutLogExercise {
  id: number;
  workout_log_id: number;
  exercise_id: number;
  order_index: number;
  superset_group_id: string | null;
  target_sets: number | null;
  target_rep_min: number | null;
  target_rep_max: number | null;
  target_duration_seconds: number | null;
  notes: string | null;
  created_at: string;
}

// Workout Log Exercise with exercise details (joined)
export interface WorkoutLogExerciseWithDetails extends WorkoutLogExercise {
  exercise_name: string;
  exercise_description: string;
  muscle_groups: string;
  equipment: string;
  exercise_type: ExerciseType;
}

export interface ExerciseNote {
  id: number;
  exercise_id: number;
  content: string;
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
  exercise_type: ExerciseType;
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
  exercise_type: ExerciseType;
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

// Weekly Review Types
export interface WeeklyReviewData {
  weekStart: string;
  weekEnd: string;
  weightLogs: WeightLog[];
  calorieEntries: FoodEntry[];
  workoutLogs: WorkoutLog[];
  daysWithWeightLog: number;
  daysWithCalorieLog: number;
  daysWithWorkout: number;
  totalUniqueDaysLogged: number; // Unique days with any type of logged data
  avgDailyCalories: number;
  totalWorkouts: number;
  startWeight: number | null;
  endWeight: number | null;
  weightChange: number | null;
  calorieAdherence: number; // percentage of target
}

export interface WeeklyReviewSufficiency {
  hasSufficientData: boolean;
  hasWeightData: boolean;
  hasCalorieData: boolean;
  hasWorkoutData: boolean;
  weightDaysLogged: number;
  calorieDaysLogged: number;
  workoutDaysLogged: number;
  totalDaysLogged: number;
  minimumLoggedDays: number;
  minimumWeightDays: number;
  minimumCalorieDays: number;
}

export interface AIWeeklyReviewResponse {
  summary: string;
  onTrack: boolean;
  metabolicResponse: {
    type: 'thrifty' | 'normal' | 'spendthrift';
    analysis: string;
    recommendation: string;
  };
  progressAssessment: {
    weightProgress: string;
    calorieAdherence: string;
    workoutConsistency: string;
  };
  recommendations: {
    updateMeasurements: boolean;
    measurementsReason: string | null;
    adjustCalories: boolean;
    newCalorieTarget: number | null;
    newProteinTarget: number | null;
    newCarbsTarget: number | null;
    newFatTarget: number | null;
    caloriesReason: string | null;
    dietBreakRecommended: boolean;
    dietBreakReason: string | null;
    changeGoal: boolean;
    suggestedGoal: 'bulk' | 'lean_bulk' | 'recomp' | 'cut' | 'maintain' | null;
    goalReason: string | null;
    changeProgram: boolean;
    programSuggestion: string | null;
  };
  motivationalMessage: string;
}

export interface WeeklyReview {
  id: number;
  week_start: string;
  week_end: string;
  start_weight: number | null;
  end_weight: number | null;
  weight_change: number | null;
  avg_daily_calories: number;
  calorie_target: number;
  calorie_adherence: number;
  workouts_completed: number;
  previous_goal: string;
  new_goal: string | null;
  previous_calorie_target: number;
  new_calorie_target: number | null;
  ai_summary: string;
  recommendations_applied: string | null; // JSON string of what was accepted
  created_at: string;
}

// AI Program Generator Types
export type EquipmentType =
  | 'Barbell'
  | 'Dumbbell'
  | 'Cable Machine'
  | 'Smith Machine'
  | 'Kettlebell'
  | 'Pull-up Bar'
  | 'Dip Station'
  | 'Bench'
  | 'Squat Rack'
  | 'Leg Press'
  | 'Leg Curl Machine'
  | 'Leg Extension Machine'
  | 'Lat Pulldown Machine'
  | 'Chest Press Machine'
  | 'Shoulder Press Machine'
  | 'Rowing Machine'
  | 'EZ Curl Bar'
  | 'Trap Bar'
  | 'Medicine Ball'
  | 'Stability Ball'
  | 'TRX / Suspension Trainer'
  | 'Battle Ropes';

// These are always available regardless of user selection
export type AlwaysAvailableEquipment = 'Bodyweight' | 'Resistance Bands';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export interface AIProgramGeneratorInput {
  trainingDaysPerWeek: number;
  sessionDurationMinutes: number;
  availableEquipment: EquipmentType[];
  goal: UserProfile['goal'];
  experienceLevel: ExperienceLevel;
  gender: UserProfile['gender']; // Male or female - affects program structure
  focusAreas?: string[]; // e.g., ["Chest", "Back"] for emphasis
  injuries?: string; // free text describing any limitations
  preferredTrainingSplit?:
    | 'full_body'
    | 'upper_lower'
    | 'push_pull_legs'
    | 'bro_split'
    | 'auto';
}

export interface AIProgramOptimizationInput {
  profile: {
    age: number;
    gender: UserProfile['gender'];
    goal: UserProfile['goal'];
    activity_level: UserProfile['activity_level'];
    calorie_target: number;
    protein_target_g: number;
    carbs_target_g: number;
    fat_target_g: number;
  };
  program: {
    name: string;
    description: string;
    sessionsPerWeek: number;
    sessions: {
      name: string;
      dayOfWeek: number | null;
      exercises: {
        name: string;
        muscle_groups: string;
        equipment: string;
        exercise_type: ExerciseType;
        targetSets: number;
        targetRepMin: number | null;
        targetRepMax: number | null;
        targetDurationSeconds: number | null;
        notes?: string | null;
        supersetGroupId?: string | null;
      }[];
    }[];
  };
  exerciseLibrary: {
    name: string;
    muscle_groups: string;
    equipment: string;
    exercise_type: ExerciseType;
  }[];

  performanceSummary: {
    exerciseName: string;
    lastPerformed: string | null;
    avgWeight: number | null;
    avgReps: number | null;
    maxWeight: number | null;
    maxReps: number | null;
    totalVolume: number | null;
    totalSessions: number;
  }[];
  weeklyVolumeSummary: {
    totalSets: number;
    muscleGroupBreakdown: Record<string, number>;
  };
  preferences: {
    injuries: string | null;
    focusAreas: string[];
    experienceLevel: ExperienceLevel;
    preferredTrainingSplit: AIProgramGeneratorInput['preferredTrainingSplit'];
    availableEquipment: EquipmentType[];
    sessionDurationMinutes: number | null;
  };
}

export interface AIGeneratedExercise {
  name: string;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
  targetDurationSeconds?: number; // for duration-based exercises
  notes?: string;
  supersetWith?: string; // name of exercise to superset with
}

export interface AIGeneratedSession {
  name: string;
  dayOfWeek: number | null; // 0=Sunday, 1=Monday, etc. null if flexible
  exercises: AIGeneratedExercise[];
}

export interface AIProgramGeneratorResponse {
  programName: string;
  programDescription: string;
  sessions: AIGeneratedSession[];
  weeklyVolumeSummary: {
    totalSets: number;
    muscleGroupBreakdown: Record<string, number>; // e.g., { "Chest": 12, "Back": 14 }
  };
  recommendations: string[]; // Tips for the user
  experienceLevel?: ExperienceLevel; // Inferred or confirmed experience level
}

// Experience level inference based on workout history
export interface ExperienceLevelInference {
  inferredLevel: ExperienceLevel;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  metrics: {
    totalWorkouts: number;
    averageVolumePerSession: number;
    exerciseVariety: number;
    trainingConsistencyWeeks: number;
    hasProgressiveOverload: boolean;
  };
}

// Function calling types for Gemini
export interface AIFunctionCallResult {
  functionName: string;
  args: Record<string, unknown>;
}

// Streamlined program generation input (can infer experience level)
export interface AIProgramGeneratorInputV2
  extends Omit<AIProgramGeneratorInput, 'experienceLevel'> {
  // Optional - if not provided, AI will infer from workout history
  experienceLevel?: ExperienceLevel;
  // Workout history for experience inference
  workoutHistory?: {
    totalWorkouts: number;
    totalWeeks: number;
    avgExercisesPerSession: number;
    avgSetsPerSession: number;
    hasUsedSupersets: boolean;
    topExercises: string[];
  };
}

// AI Exercise Coaching Types
export type ProgressionDirection = 'increase' | 'maintain' | 'decrease';

export interface SetProgression {
  setNumber: number;
  weight: ProgressionDirection;
  reps: ProgressionDirection;
  suggestedWeight: number;
  suggestedReps: number;
}

export interface AIExerciseCoachingResponse {
  exerciseId: number;
  overallTrend: 'progressing' | 'plateau' | 'regressing';
  sets: SetProgression[];
  coachingTip: string;
}

// App State Types
export interface AppSettings {
  isOnboardingComplete: boolean;
  isOnline: boolean;
}

// Progress Photo Types
export type PhotoType = 'front' | 'side' | 'back';

export interface ProgressPhoto {
  id: number;
  date: string;
  photo_data: string; // Base64 encoded image
  photo_type: PhotoType;
  notes: string | null;
  created_at: string;
}

// Strength Progress Types
export type ProgressTrend = 'progressing' | 'plateau' | 'regressing';

export interface PersonalRecord {
  exerciseId: number;
  exerciseName: string;
  type: 'weight' | 'reps' | 'volume' | '1rm';
  value: number;
  date: string;
  details: string; // e.g., "225 lbs × 8 reps"
}

export interface ExercisePR {
  maxWeight: { value: number; reps: number; date: string } | null;
  maxReps: { value: number; weight: number; date: string } | null;
  maxVolume: { value: number; date: string } | null;
  max1RM: { value: number; date: string } | null;
}

export interface ExerciseProgressSummary {
  exerciseId: number;
  exerciseName: string;
  muscleGroups: string;
  exerciseType: ExerciseType;
  trend: ProgressTrend;
  lastPerformed: string | null;
  estimated1RM: number | null;
  totalSessions: number;
  prs: ExercisePR;
}

export interface OverallProgressMetrics {
  totalVolume: number;
  totalWorkouts: number;
  totalTimeMinutes: number;
  uniqueExercises: number;
  volumeChange: number; // percentage vs previous period
  recentPRs: PersonalRecord[];
}

export interface ExerciseSessionData {
  date: string;
  estimated1RM: number | null;
  bestWeight: number | null;
  bestReps: number | null;
  totalVolume: number;
  totalSets: number;
  sets: {
    weight: number | null;
    reps: number | null;
    volume: number;
  }[];
}

export interface VolumeChartData {
  date: string;
  volume: number;
  workouts: number;
}
