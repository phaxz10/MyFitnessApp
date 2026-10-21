import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../hooks/useAppStore';
import { useProfile } from '../../hooks/useProfile';
import { useWeeklyReview } from '../../hooks/useWeeklyReview';
import { useWeight } from '../../hooks/useWeight';
import { reviewWeeklyProgress } from '../../services/coaching/weeklyReviewCoach';
import type {
  AIWeeklyReviewResponse,
  UserProfile,
  WeeklyReviewData,
} from '../../types';
import { calculateBodyFatPercentage } from '../../utils/calculations';
import { formatDate } from '../../utils/date';
import { fromInputWeight } from '../../utils/units';
import { Modal } from '../ui';
import { CompleteStep } from './CompleteStep';
import { GoalStep } from './GoalStep';
import { MeasurementsStep } from './MeasurementsStep';
import type {
  AppliedRecommendations,
  MeasurementsFormState,
  ReviewStep,
  TargetsFormState,
} from './reviewTypes';
import { SummaryStep } from './SummaryStep';
import { TargetsStep } from './TargetsStep';

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
  const [measurementsForm, setMeasurementsForm] =
    useState<MeasurementsFormState>({
      weight: '',
      waist: '',
      neck: '',
      arm: '',
    });
  const [targetsForm, setTargetsForm] = useState<TargetsFormState>({
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
  });
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);

  // Track what was applied
  const [appliedRecommendations, setAppliedRecommendations] =
    useState<AppliedRecommendations>({
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
        if (isOnline && profile.ai_api_key) {
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
        weight_kg: fromInputWeight(
          parseFloat(measurementsForm.weight),
          profile.weight_unit ?? 'kg',
        ),
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

  // Daily-average macros across the past week. Divides by 7 (not days-logged)
  // so skipped days drag the average down — the metric captures both portion
  // discipline AND logging consistency, which is what a weekly review wants.
  const weeklyAvg = useMemo(() => {
    if (!weeklyData) return null;
    const total = weeklyData.calorieEntries.reduce(
      (acc, entry) => ({
        calories: acc.calories + entry.calories,
        protein: acc.protein + entry.protein_g,
        carbs: acc.carbs + entry.carbs_g,
        fat: acc.fat + entry.fat_g,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
    const days = 7;
    return {
      calories: total.calories / days,
      protein: total.protein / days,
      carbs: total.carbs / days,
      fat: total.fat / days,
    };
  }, [weeklyData]);

  const rec = aiReview?.recommendations;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Weekly Check-In" size="lg">
      <div className="min-h-[400px]">
        {step === 'loading' && !error && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2
              size={40}
              className="text-ink-2 animate-spin"
              aria-hidden="true"
            />
            <p className="text-ink-2">Analyzing your progress...</p>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="bg-danger-soft text-danger font-medium px-4 py-3 rounded-xl mb-4"
          >
            {error}
          </div>
        )}

        {step === 'summary' && weeklyData && (
          <SummaryStep
            weeklyData={weeklyData}
            aiReview={aiReview}
            profile={profile}
            weeklyAvg={weeklyAvg}
            weekRange={weekRange}
            onClose={onClose}
            onContinue={() => moveToNextStep('summary')}
          />
        )}

        {step === 'measurements' && (
          <MeasurementsStep
            form={measurementsForm}
            onChange={setMeasurementsForm}
            reason={rec?.measurementsReason}
            isLoading={isLoading}
            onSkip={() => handleSkip('measurements')}
            onSave={handleSaveMeasurements}
          />
        )}

        {step === 'targets' && (
          <TargetsStep
            form={targetsForm}
            onChange={setTargetsForm}
            currentCalories={profile.calorie_target}
            recommendedCalories={rec?.newCalorieTarget}
            reason={rec?.caloriesReason}
            isLoading={isLoading}
            onSkip={() => handleSkip('targets')}
            onSave={handleSaveTargets}
          />
        )}

        {step === 'goal' && (
          <GoalStep
            currentGoal={profile.goal}
            suggestedGoal={rec?.suggestedGoal}
            selectedGoal={selectedGoal}
            onSelect={setSelectedGoal}
            reason={rec?.goalReason}
            isLoading={isLoading}
            onSkip={() => handleSkip('goal')}
            onSave={handleSaveGoal}
          />
        )}

        {step === 'complete' && (
          <CompleteStep
            applied={appliedRecommendations}
            calories={targetsForm.calories}
            selectedGoal={selectedGoal}
            motivationalMessage={aiReview?.motivationalMessage}
            onDone={handleComplete}
            onLogWeight={() => {
              handleComplete();
              // Use setTimeout to ensure modal closes first
              setTimeout(() => {
                openWeightLogModal();
              }, 100);
            }}
            onLogFood={() => {
              handleComplete();
              setTimeout(() => {
                openFoodLogModal();
              }, 100);
            }}
          />
        )}
      </div>
    </Modal>
  );
}
