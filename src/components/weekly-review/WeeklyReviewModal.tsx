import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Battery,
  BatteryLow,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Loader2,
  Minus,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
  Utensils,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '../../hooks/useAppStore';
import { useProfile } from '../../hooks/useProfile';
import { useWeeklyReview } from '../../hooks/useWeeklyReview';
import { useWeight } from '../../hooks/useWeight';
import { initOpenAI, reviewWeeklyProgress } from '../../services/openai';
import type {
  AIWeeklyReviewResponse,
  UserProfile,
  WeeklyReviewData,
} from '../../types';
import { calculateBodyFatPercentage } from '../../utils/calculations';
import { formatDate, formatDisplayDate } from '../../utils/date';
import { Button, Card, CardContent, Modal } from '../ui';

type ReviewStep =
  | 'loading'
  | 'summary'
  | 'measurements'
  | 'targets'
  | 'goal'
  | 'complete';

interface WeeklyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
}

export function WeeklyReviewModal({
  isOpen,
  onClose,
  profile,
}: WeeklyReviewModalProps) {
  const queryClient = useQueryClient();
  const { fetchWeeklyData, saveWeeklyReview, getPastWeekRange } =
    useWeeklyReview();
  const { updateProfile } = useProfile();
  const { addLog } = useWeight();
  const { isOnline, openFoodLogModal, openWeightLogModal } = useAppStore();

  const [step, setStep] = useState<ReviewStep>('loading');
  const [weeklyData, setWeeklyData] = useState<WeeklyReviewData | null>(null);
  const [aiReview, setAiReview] = useState<AIWeeklyReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form states for recommendations
  const [measurementsForm, setMeasurementsForm] = useState({
    weight: '',
    waist: '',
    neck: '',
    arm: '',
  });
  const [targetsForm, setTargetsForm] = useState({
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
  });
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);

  // Track what was applied
  const [appliedRecommendations, setAppliedRecommendations] = useState<
    Record<string, boolean>
  >({
    measurements: false,
    targets: false,
    goal: false,
  });

  // Track if we've already loaded data for this modal session
  const [hasLoadedData, setHasLoadedData] = useState(false);

  // Load data and get AI review when modal opens
  useEffect(() => {
    async function loadData() {
      setStep('loading');
      setError(null);

      try {
        const data = await fetchWeeklyData(profile);
        if (!data) {
          setError('Failed to load weekly data');
          return;
        }
        setWeeklyData(data);

        // Get AI review if online and has API key
        if (isOnline && profile.openai_api_key) {
          initOpenAI(profile.openai_api_key);
          const review = await reviewWeeklyProgress(profile, data);
          setAiReview(review);

          // Pre-fill forms with AI recommendations
          if (review.recommendations.newCalorieTarget) {
            setTargetsForm({
              calories: review.recommendations.newCalorieTarget.toString(),
              protein: (
                review.recommendations.newProteinTarget ||
                profile.protein_target_g
              ).toString(),
              carbs: (
                review.recommendations.newCarbsTarget || profile.carbs_target_g
              ).toString(),
              fat: (
                review.recommendations.newFatTarget || profile.fat_target_g
              ).toString(),
            });
          }

          if (review.recommendations.suggestedGoal) {
            setSelectedGoal(review.recommendations.suggestedGoal);
          }
        }

        setStep('summary');
        setHasLoadedData(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load review');
      }
    }

    // Only load data if modal is open AND we haven't already loaded data
    if (isOpen && profile && !hasLoadedData) {
      loadData();
    }
  }, [isOpen, profile, fetchWeeklyData, isOnline, hasLoadedData]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasLoadedData(false);
      setStep('loading');
      setWeeklyData(null);
      setAiReview(null);
      setError(null);
      setMeasurementsForm({ weight: '', waist: '', neck: '', arm: '' });
      setTargetsForm({ calories: '', protein: '', carbs: '', fat: '' });
      setSelectedGoal(null);
      setAppliedRecommendations({
        measurements: false,
        targets: false,
        goal: false,
      });
    }
  }, [isOpen]);

  async function handleSaveMeasurements() {
    if (!measurementsForm.weight) return;

    setIsLoading(true);
    try {
      let bodyFatPct: number | null = null;
      if (
        measurementsForm.waist &&
        measurementsForm.neck &&
        profile.height_cm
      ) {
        bodyFatPct = calculateBodyFatPercentage(
          profile.gender,
          parseFloat(measurementsForm.waist),
          parseFloat(measurementsForm.neck),
          profile.height_cm,
        );
      }

      await addLog({
        date: formatDate(new Date()),
        weight_kg: parseFloat(measurementsForm.weight),
        waist_cm: measurementsForm.waist
          ? parseFloat(measurementsForm.waist)
          : null,
        neck_cm: measurementsForm.neck
          ? parseFloat(measurementsForm.neck)
          : null,
        arm_cm: measurementsForm.arm ? parseFloat(measurementsForm.arm) : null,
        body_fat_pct: bodyFatPct,
      });

      setAppliedRecommendations((prev) => ({ ...prev, measurements: true }));
      moveToNextStep('measurements');
    } catch {
      setError('Failed to save measurements');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveTargets() {
    setIsLoading(true);
    try {
      await updateProfile({
        calorie_target: parseInt(targetsForm.calories, 10),
        protein_target_g: parseInt(targetsForm.protein, 10),
        carbs_target_g: parseInt(targetsForm.carbs, 10),
        fat_target_g: parseInt(targetsForm.fat, 10),
      });

      setAppliedRecommendations((prev) => ({ ...prev, targets: true }));
      moveToNextStep('targets');
    } catch {
      setError('Failed to save targets');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveGoal() {
    if (!selectedGoal) return;

    setIsLoading(true);
    try {
      await updateProfile({
        goal: selectedGoal as UserProfile['goal'],
      });

      setAppliedRecommendations((prev) => ({ ...prev, goal: true }));
      moveToNextStep('goal');
    } catch {
      setError('Failed to save goal');
    } finally {
      setIsLoading(false);
    }
  }

  function moveToNextStep(currentStep: ReviewStep) {
    const steps: ReviewStep[] = [
      'summary',
      'measurements',
      'targets',
      'goal',
      'complete',
    ];

    // Determine which steps to show based on AI recommendations
    const shouldShowMeasurements =
      aiReview?.recommendations.updateMeasurements ?? true;
    const shouldShowTargets = aiReview?.recommendations.adjustCalories ?? false;
    const shouldShowGoal = aiReview?.recommendations.changeGoal ?? false;

    const currentIndex = steps.indexOf(currentStep);

    for (let i = currentIndex + 1; i < steps.length; i++) {
      const nextStep = steps[i];

      if (nextStep === 'measurements' && !shouldShowMeasurements) continue;
      if (nextStep === 'targets' && !shouldShowTargets) continue;
      if (nextStep === 'goal' && !shouldShowGoal) continue;

      setStep(nextStep);
      return;
    }

    // If no more steps, go to complete
    setStep('complete');
  }

  async function handleComplete() {
    if (weeklyData && aiReview) {
      try {
        await saveWeeklyReview(
          weeklyData,
          profile,
          aiReview.summary,
          appliedRecommendations,
          appliedRecommendations.goal ? selectedGoal : null,
          appliedRecommendations.targets
            ? parseInt(targetsForm.calories, 10)
            : null,
        );
      } catch {
        // Silent fail - review still completed
      }
    }
    // Invalidate profile query to trigger refetch after updates
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    onClose();
  }

  function handleSkip(currentStep: ReviewStep) {
    moveToNextStep(currentStep);
  }

  const weekRange = getPastWeekRange();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Weekly Check-In" size="lg">
      <div className="min-h-[400px]">
        {/* Loading State */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 size={48} className="text-purple-400 animate-spin mb-4" />
            <p className="text-slate-400">Analyzing your progress...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Summary Step */}
        {step === 'summary' && weeklyData && (
          <div className="space-y-4">
            {/* Week Header */}
            <div className="text-center mb-4">
              <p className="text-slate-400 text-sm">Week of</p>
              <p className="text-white font-semibold">
                {formatDisplayDate(weekRange.start)} -{' '}
                {formatDisplayDate(weekRange.end)}
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <Scale size={20} className="text-blue-400 mx-auto mb-1" />
                  <p className="text-white font-semibold">
                    {weeklyData.weightChange !== null
                      ? `${weeklyData.weightChange > 0 ? '+' : ''}${weeklyData.weightChange} kg`
                      : '--'}
                  </p>
                  <p className="text-slate-400 text-xs">Weight Change</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <Target size={20} className="text-green-400 mx-auto mb-1" />
                  <p className="text-white font-semibold">
                    {weeklyData.calorieAdherence}%
                  </p>
                  <p className="text-slate-400 text-xs">Cal Adherence</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <Dumbbell
                    size={20}
                    className="text-orange-400 mx-auto mb-1"
                  />
                  <p className="text-white font-semibold">
                    {weeklyData.totalWorkouts}
                  </p>
                  <p className="text-slate-400 text-xs">Workouts</p>
                </CardContent>
              </Card>
            </div>

            {/* AI Summary */}
            {aiReview && (
              <Card
                className={`border-l-4 ${aiReview.onTrack ? 'border-l-green-500' : 'border-l-yellow-500'}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {aiReview.onTrack ? (
                      <CheckCircle2
                        size={24}
                        className="text-green-400 flex-shrink-0 mt-0.5"
                      />
                    ) : (
                      <AlertCircle
                        size={24}
                        className="text-yellow-400 flex-shrink-0 mt-0.5"
                      />
                    )}
                    <div>
                      <p className="text-white font-medium mb-2">
                        {aiReview.onTrack ? 'On Track!' : 'Needs Attention'}
                      </p>
                      <p className="text-slate-300 text-sm">
                        {aiReview.summary}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Metabolic Response */}
            {aiReview?.metabolicResponse && (
              <Card
                className={`border-l-4 ${
                  aiReview.metabolicResponse.type === 'thrifty'
                    ? 'border-l-orange-500'
                    : aiReview.metabolicResponse.type === 'spendthrift'
                      ? 'border-l-blue-500'
                      : 'border-l-green-500'
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {aiReview.metabolicResponse.type === 'thrifty' ? (
                      <BatteryLow
                        size={24}
                        className="text-orange-400 flex-shrink-0 mt-0.5"
                      />
                    ) : aiReview.metabolicResponse.type === 'spendthrift' ? (
                      <Zap
                        size={24}
                        className="text-blue-400 flex-shrink-0 mt-0.5"
                      />
                    ) : (
                      <Battery
                        size={24}
                        className="text-green-400 flex-shrink-0 mt-0.5"
                      />
                    )}
                    <div>
                      <p className="text-white font-medium mb-1">
                        {aiReview.metabolicResponse.type === 'thrifty'
                          ? 'Thrifty Metabolism Detected'
                          : aiReview.metabolicResponse.type === 'spendthrift'
                            ? 'Spendthrift Metabolism'
                            : 'Normal Metabolic Response'}
                      </p>
                      <p className="text-slate-300 text-sm mb-2">
                        {aiReview.metabolicResponse.analysis}
                      </p>
                      <p className="text-slate-400 text-xs">
                        {aiReview.metabolicResponse.recommendation}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Diet Break Recommendation */}
            {aiReview?.recommendations.dietBreakRecommended && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle
                    size={18}
                    className="text-orange-400 flex-shrink-0 mt-0.5"
                  />
                  <div>
                    <p className="text-orange-300 font-medium text-sm">
                      Diet Break Recommended
                    </p>
                    <p className="text-orange-200/70 text-xs mt-1">
                      {aiReview.recommendations.dietBreakReason}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Progress Details */}
            {aiReview && (
              <div className="space-y-2">
                <p className="text-slate-400 text-sm font-medium">
                  Progress Assessment
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {weeklyData.weightChange !== null &&
                    weeklyData.weightChange > 0 ? (
                      <TrendingUp size={16} className="text-green-400" />
                    ) : weeklyData.weightChange !== null &&
                      weeklyData.weightChange < 0 ? (
                      <TrendingDown size={16} className="text-red-400" />
                    ) : (
                      <Minus size={16} className="text-slate-400" />
                    )}
                    <p className="text-slate-300 text-sm">
                      {aiReview.progressAssessment.weightProgress}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target size={16} className="text-blue-400" />
                    <p className="text-slate-300 text-sm">
                      {aiReview.progressAssessment.calorieAdherence}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Dumbbell size={16} className="text-orange-400" />
                    <p className="text-slate-300 text-sm">
                      {aiReview.progressAssessment.workoutConsistency}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Recommendations Preview */}
            {aiReview && (
              <div className="space-y-2">
                <p className="text-slate-400 text-sm font-medium">
                  Recommendations
                </p>
                <div className="space-y-1">
                  {aiReview.recommendations.updateMeasurements && (
                    <div className="flex items-center gap-2 text-slate-300 text-sm">
                      <ChevronRight size={14} className="text-purple-400" />
                      Update body measurements
                    </div>
                  )}
                  {aiReview.recommendations.adjustCalories && (
                    <div className="flex items-center gap-2 text-slate-300 text-sm">
                      <ChevronRight size={14} className="text-purple-400" />
                      Adjust calorie target to{' '}
                      {aiReview.recommendations.newCalorieTarget} kcal
                    </div>
                  )}
                  {aiReview.recommendations.changeGoal && (
                    <div className="flex items-center gap-2 text-slate-300 text-sm">
                      <ChevronRight size={14} className="text-purple-400" />
                      Consider switching to{' '}
                      {aiReview.recommendations.suggestedGoal?.replace(
                        '_',
                        ' ',
                      )}
                    </div>
                  )}
                  {!aiReview.recommendations.updateMeasurements &&
                    !aiReview.recommendations.adjustCalories &&
                    !aiReview.recommendations.changeGoal && (
                      <div className="flex items-center gap-2 text-green-400 text-sm">
                        <CheckCircle2 size={14} />
                        Keep up the good work! No changes needed.
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Motivational Message */}
            {aiReview && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                <p className="text-purple-300 text-sm italic">
                  "{aiReview.motivationalMessage}"
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button variant="secondary" onClick={onClose} className="flex-1">
                Close
              </Button>
              <Button
                onClick={() => moveToNextStep('summary')}
                className="flex-1"
              >
                {aiReview?.recommendations.updateMeasurements ||
                aiReview?.recommendations.adjustCalories ||
                aiReview?.recommendations.changeGoal
                  ? 'Continue'
                  : 'Complete'}
                <ArrowRight size={16} className="ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Measurements Step */}
        {step === 'measurements' && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <Scale size={32} className="text-blue-400 mx-auto mb-2" />
              <h3 className="text-white font-semibold text-lg">
                Update Measurements
              </h3>
              {aiReview?.recommendations.measurementsReason && (
                <p className="text-slate-400 text-sm mt-1">
                  {aiReview.recommendations.measurementsReason}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="review-weight"
                  className="block text-slate-400 text-sm mb-1"
                >
                  Weight (kg) *
                </label>
                <input
                  id="review-weight"
                  type="number"
                  step="0.1"
                  value={measurementsForm.weight}
                  onChange={(e) =>
                    setMeasurementsForm((prev) => ({
                      ...prev,
                      weight: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Enter your current weight"
                />
              </div>

              <p className="text-slate-500 text-sm">
                Optional measurements for body fat calculation:
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="review-waist"
                    className="block text-slate-400 text-sm mb-1"
                  >
                    Waist (cm)
                  </label>
                  <input
                    id="review-waist"
                    type="number"
                    step="0.1"
                    value={measurementsForm.waist}
                    onChange={(e) =>
                      setMeasurementsForm((prev) => ({
                        ...prev,
                        waist: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="cm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="review-neck"
                    className="block text-slate-400 text-sm mb-1"
                  >
                    Neck (cm)
                  </label>
                  <input
                    id="review-neck"
                    type="number"
                    step="0.1"
                    value={measurementsForm.neck}
                    onChange={(e) =>
                      setMeasurementsForm((prev) => ({
                        ...prev,
                        neck: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="cm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="review-arm"
                    className="block text-slate-400 text-sm mb-1"
                  >
                    Arm (cm)
                  </label>
                  <input
                    id="review-arm"
                    type="number"
                    step="0.1"
                    value={measurementsForm.arm}
                    onChange={(e) =>
                      setMeasurementsForm((prev) => ({
                        ...prev,
                        arm: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="cm"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="secondary"
                onClick={() => handleSkip('measurements')}
                className="flex-1"
              >
                Skip
              </Button>
              <Button
                onClick={handleSaveMeasurements}
                isLoading={isLoading}
                disabled={!measurementsForm.weight}
                className="flex-1"
              >
                Save & Continue
              </Button>
            </div>
          </div>
        )}

        {/* Targets Step */}
        {step === 'targets' && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <Target size={32} className="text-green-400 mx-auto mb-2" />
              <h3 className="text-white font-semibold text-lg">
                Adjust Calorie Targets
              </h3>
              {aiReview?.recommendations.caloriesReason && (
                <p className="text-slate-400 text-sm mt-1">
                  {aiReview.recommendations.caloriesReason}
                </p>
              )}
            </div>

            <div className="bg-slate-700/50 rounded-lg p-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Current Target:</span>
                <span className="text-white">
                  {profile.calorie_target} kcal
                </span>
              </div>
              {aiReview?.recommendations.newCalorieTarget && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-400">Recommended:</span>
                  <span className="text-green-400">
                    {aiReview.recommendations.newCalorieTarget} kcal
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="review-calories"
                  className="block text-slate-400 text-sm mb-1"
                >
                  Daily Calories
                </label>
                <input
                  id="review-calories"
                  type="number"
                  value={targetsForm.calories}
                  onChange={(e) =>
                    setTargetsForm((prev) => ({
                      ...prev,
                      calories: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="review-protein"
                    className="block text-slate-400 text-sm mb-1"
                  >
                    Protein (g)
                  </label>
                  <input
                    id="review-protein"
                    type="number"
                    value={targetsForm.protein}
                    onChange={(e) =>
                      setTargetsForm((prev) => ({
                        ...prev,
                        protein: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="review-carbs"
                    className="block text-slate-400 text-sm mb-1"
                  >
                    Carbs (g)
                  </label>
                  <input
                    id="review-carbs"
                    type="number"
                    value={targetsForm.carbs}
                    onChange={(e) =>
                      setTargetsForm((prev) => ({
                        ...prev,
                        carbs: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="review-fat"
                    className="block text-slate-400 text-sm mb-1"
                  >
                    Fat (g)
                  </label>
                  <input
                    id="review-fat"
                    type="number"
                    value={targetsForm.fat}
                    onChange={(e) =>
                      setTargetsForm((prev) => ({
                        ...prev,
                        fat: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="secondary"
                onClick={() => handleSkip('targets')}
                className="flex-1"
              >
                Skip
              </Button>
              <Button
                onClick={handleSaveTargets}
                isLoading={isLoading}
                disabled={!targetsForm.calories}
                className="flex-1"
              >
                Save & Continue
              </Button>
            </div>
          </div>
        )}

        {/* Goal Step */}
        {step === 'goal' && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <Target size={32} className="text-purple-400 mx-auto mb-2" />
              <h3 className="text-white font-semibold text-lg">
                Change Your Goal
              </h3>
              {aiReview?.recommendations.goalReason && (
                <p className="text-slate-400 text-sm mt-1">
                  {aiReview.recommendations.goalReason}
                </p>
              )}
            </div>

            <div className="bg-slate-700/50 rounded-lg p-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Current Goal:</span>
                <span className="text-white capitalize">
                  {profile.goal.replace('_', ' ')}
                </span>
              </div>
              {aiReview?.recommendations.suggestedGoal && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-400">Recommended:</span>
                  <span className="text-purple-400 capitalize">
                    {aiReview.recommendations.suggestedGoal.replace('_', ' ')}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {['bulk', 'lean_bulk', 'recomp', 'cut', 'maintain'].map(
                (goal) => (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => setSelectedGoal(goal)}
                    className={`w-full p-3 rounded-lg border text-left transition-colors ${
                      selectedGoal === goal
                        ? 'border-purple-500 bg-purple-500/20'
                        : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                    }`}
                  >
                    <span className="text-white capitalize">
                      {goal.replace('_', ' ')}
                    </span>
                    {goal === aiReview?.recommendations.suggestedGoal && (
                      <span className="ml-2 text-xs bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded">
                        Recommended
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="secondary"
                onClick={() => handleSkip('goal')}
                className="flex-1"
              >
                Keep Current
              </Button>
              <Button
                onClick={handleSaveGoal}
                isLoading={isLoading}
                disabled={!selectedGoal}
                className="flex-1"
              >
                Change Goal
              </Button>
            </div>
          </div>
        )}

        {/* Complete Step */}
        {step === 'complete' && (
          <div className="space-y-6 py-4">
            <div className="text-center">
              <CheckCircle2 size={56} className="text-green-400 mx-auto mb-3" />
              <h3 className="text-white font-semibold text-xl mb-1">
                Check-In Complete!
              </h3>
              <p className="text-slate-400 text-sm">
                Your weekly review has been saved.
              </p>
            </div>

            {/* Summary of changes */}
            {(appliedRecommendations.measurements ||
              appliedRecommendations.targets ||
              appliedRecommendations.goal) && (
              <div className="bg-slate-700/50 rounded-lg p-4 text-left">
                <p className="text-slate-400 text-sm mb-2">Changes Applied:</p>
                <ul className="space-y-1">
                  {appliedRecommendations.measurements && (
                    <li className="text-green-400 text-sm flex items-center gap-2">
                      <CheckCircle2 size={14} />
                      Body measurements updated
                    </li>
                  )}
                  {appliedRecommendations.targets && (
                    <li className="text-green-400 text-sm flex items-center gap-2">
                      <CheckCircle2 size={14} />
                      Calorie targets adjusted to {targetsForm.calories} kcal
                    </li>
                  )}
                  {appliedRecommendations.goal && (
                    <li className="text-green-400 text-sm flex items-center gap-2">
                      <CheckCircle2 size={14} />
                      Goal changed to {selectedGoal?.replace('_', ' ')}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Quick Actions */}
            <div className="space-y-3">
              <p className="text-slate-400 text-sm font-medium text-center">
                Start Your Week Strong
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    handleComplete();
                    // Use setTimeout to ensure modal closes first
                    setTimeout(() => {
                      openWeightLogModal();
                    }, 100);
                  }}
                  className="flex flex-col items-center gap-2 p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-blue-500/50 rounded-xl transition-all"
                >
                  <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <Scale size={20} className="text-blue-400" />
                  </div>
                  <span className="text-white text-sm font-medium">
                    Log Weight
                  </span>
                  <span className="text-slate-500 text-xs">
                    Track today's weight
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleComplete();
                    setTimeout(() => {
                      openFoodLogModal();
                    }, 100);
                  }}
                  className="flex flex-col items-center gap-2 p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-green-500/50 rounded-xl transition-all"
                >
                  <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                    <Utensils size={20} className="text-green-400" />
                  </div>
                  <span className="text-white text-sm font-medium">
                    Log Food
                  </span>
                  <span className="text-slate-500 text-xs">
                    Start logging meals
                  </span>
                </button>
              </div>
            </div>

            {/* Motivational message */}
            {aiReview?.motivationalMessage && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                <p className="text-purple-300 text-sm italic text-center">
                  "{aiReview.motivationalMessage}"
                </p>
              </div>
            )}

            <Button onClick={handleComplete} className="w-full">
              Done
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
