import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { ChoiceList } from '../components/onboarding/ChoiceList';
import { OnboardingFrame } from '../components/onboarding/OnboardingFrame';
import {
  CalculatingScreen,
  ReadyScreen,
} from '../components/onboarding/StatusScreens';
import { TargetsEditor } from '../components/onboarding/TargetsEditor';
import { WelcomeScreen } from '../components/onboarding/WelcomeScreen';
import { AISetupForm } from '../components/settings/AISetupForm';
import { Button, Input } from '../components/ui';
import { AI_PROVIDER, FALLBACK_MODEL } from '../constants/aiProviders';
import { dietTypeOptions } from '../constants/options';
import { useAppStore } from '../hooks/useAppStore';
import { useProfile } from '../hooks/useProfile';
import { useWeight } from '../hooks/useWeight';
import { type OnboardingFormData, onboardingSchema } from '../schemas/forms';
import { importBackup, readBackupFile } from '../services/backup';
import {
  calculateDeterministicTargets,
  calculateTargets,
} from '../services/coaching/nutritionCoach';
import { calculateAgeFromBirthdate, formatDate } from '../utils/date';

type Step =
  | 'welcome'
  | 'basic'
  | 'weight'
  | 'activity'
  | 'goal'
  | 'api'
  | 'calculating'
  | 'targets'
  | 'ready';

type ActivityLevel = OnboardingFormData['activityLevel'];
type Goal = OnboardingFormData['goal'];

const TOTAL_STEPS = 6;

// Steps that show the progress indicator, in order, with the step to return
// to on Back.
const STEP_FLOW: Partial<Record<Step, { index: number; back: Step }>> = {
  basic: { index: 1, back: 'welcome' },
  weight: { index: 2, back: 'basic' },
  activity: { index: 3, back: 'weight' },
  goal: { index: 4, back: 'activity' },
  api: { index: 5, back: 'goal' },
  targets: { index: 6, back: 'api' },
};

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
] as const;

const activityOptions: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary (little or no exercise)' },
  { value: 'light', label: 'Light (exercise 1-3 days/week)' },
  { value: 'moderate', label: 'Moderate (exercise 3-5 days/week)' },
  { value: 'active', label: 'Active (hard exercise 6-7 days/week)' },
];

const goalOptions: { value: Goal; label: string }[] = [
  { value: 'bulk', label: 'Bulk - Aggressive muscle gain' },
  { value: 'lean_bulk', label: 'Lean Bulk - Slow muscle gain, minimize fat' },
  { value: 'recomp', label: 'Recomp - Maintain weight, change composition' },
  { value: 'cut', label: 'Cut - Fat loss' },
  { value: 'maintain', label: 'Maintain - Stay at current weight' },
];

export function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setOnboardingComplete = useAppStore(
    (state) => state.setOnboardingComplete,
  );
  const { createProfile } = useProfile();
  const { addLog } = useWeight();

  const [step, setStep] = useState<Step>('welcome');
  const [error, setError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Use React Hook Form for form state management
  const {
    register,
    watch,
    setValue,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      birthdate: '',
      gender: 'male',
      heightCm: '',
      weightKg: '',
      activityLevel: 'moderate',
      goal: 'lean_bulk',
      dietType: 'balanced',
      aiModel: undefined,
      apiKey: '',
      targets: {
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 70,
      },
    },
  });

  const gender = watch('gender');
  const activityLevel = watch('activityLevel');
  const goal = watch('goal');
  const dietType = watch('dietType');
  const targets = watch('targets');
  const aiModel = watch('aiModel');
  const apiKey = watch('apiKey') ?? '';

  const handleNext = async () => {
    setError(null);
    switch (step) {
      case 'welcome':
        setStep('basic');
        break;
      case 'basic': {
        const isValid = await trigger(['birthdate', 'heightCm']);
        if (!isValid) {
          setError('Please fill in all fields');
          return;
        }
        setStep('weight');
        break;
      }
      case 'weight': {
        const isValid = await trigger('weightKg');
        if (!isValid) {
          setError('Please enter your weight');
          return;
        }
        setStep('activity');
        break;
      }
      case 'activity':
        setStep('goal');
        break;
      case 'goal':
        setStep('api');
        break;
      case 'api':
        setStep('calculating');
        calculateUserTargets();
        break;
      case 'targets':
        saveProfile();
        break;
    }
  };

  const buildTargetProfile = () => {
    const values = getValues();
    return {
      age: calculateAgeFromBirthdate(values.birthdate),
      gender: values.gender,
      height_cm: parseFloat(values.heightCm),
      weight_kg: parseFloat(values.weightKg),
      activity_level: values.activityLevel,
      goal: values.goal,
      diet_type: values.dietType,
    };
  };

  const applyTargets = (result: {
    calorie_target: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }) => {
    setValue('targets', {
      calories: result.calorie_target,
      protein: result.protein_g,
      carbs: result.carbs_g,
      fat: result.fat_g,
    });
  };

  const calculateUserTargets = async () => {
    const values = getValues();
    const profile = buildTargetProfile();
    try {
      const hasFullAISetup = !!(values.aiModel && values.apiKey);
      if (hasFullAISetup) {
        // Seed the active profile in the store so the stateless aiClient can
        // read it. The full DB profile row is created right after this step.
        useAppStore.setState({
          userProfile: {
            id: 0,
            birthdate: values.birthdate,
            gender: values.gender,
            height_cm: parseFloat(values.heightCm),
            activity_level: values.activityLevel,
            goal: values.goal,
            diet_type: values.dietType,
            calorie_target: 0,
            protein_target_g: 0,
            carbs_target_g: 0,
            fat_target_g: 0,
            ai_provider: AI_PROVIDER,
            ai_model: values.aiModel as string,
            ai_api_key: values.apiKey ?? null,
            ai_proxy_url: null,
            created_at: '',
            updated_at: '',
          },
        });
        applyTargets(await calculateTargets(profile));
      } else {
        applyTargets(calculateDeterministicTargets(profile));
      }
      setStep('targets');
    } catch (_err) {
      setError('Failed to calculate targets. Using default values.');
      applyTargets(calculateDeterministicTargets(profile));
      setStep('targets');
    }
  };

  const saveProfile = async () => {
    const values = getValues();
    // If the user picked a model but skipped the key (or vice versa), fall
    // back to defaults so the DB row stays valid. The capability check gates
    // AI features on having model + key.
    const provider: typeof AI_PROVIDER = AI_PROVIDER;
    const model = values.aiModel ?? FALLBACK_MODEL;
    try {
      await createProfile({
        birthdate: values.birthdate,
        gender: values.gender,
        height_cm: parseFloat(values.heightCm),
        activity_level: values.activityLevel,
        goal: values.goal,
        diet_type: values.dietType,
        calorie_target: values.targets.calories,
        protein_target_g: values.targets.protein,
        carbs_target_g: values.targets.carbs,
        fat_target_g: values.targets.fat,
        ai_provider: provider,
        ai_model: model,
        ai_api_key: values.apiKey || null,
        ai_proxy_url: null,
      });

      // Add initial weight log
      await addLog({
        date: formatDate(new Date()),
        weight_kg: parseFloat(values.weightKg),
        waist_cm: null,
        neck_cm: null,
        arm_cm: null,
        body_fat_pct: null,
      });

      setOnboardingComplete(true);
      setStep('ready');
    } catch (_err) {
      setError('Failed to save profile. Please try again.');
    }
  };

  const goToDashboard = () => {
    navigate('/');
  };

  const handleRestoreFile = async (file: File) => {
    setIsRestoring(true);
    setError(null);

    try {
      const { hasProfile } = await importBackup(await readBackupFile(file));
      await queryClient.invalidateQueries();
      if (hasProfile) {
        setOnboardingComplete(true);
        navigate('/');
        return;
      }
      // Restored data but no profile: finish setup by hand.
      setStep('basic');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to restore the backup',
      );
    } finally {
      setIsRestoring(false);
    }
  };

  // Screens that sit outside the numbered flow.
  if (step === 'welcome') {
    return (
      <WelcomeScreen
        onStart={handleNext}
        onRestoreFile={handleRestoreFile}
        isRestoring={isRestoring}
        error={error}
      />
    );
  }
  if (step === 'calculating') return <CalculatingScreen />;
  if (step === 'ready') return <ReadyScreen onContinue={goToDashboard} />;

  const flow = STEP_FLOW[step];
  if (!flow) return null;

  const frame = {
    step: flow.index,
    total: TOTAL_STEPS,
    onBack: () => {
      setError(null);
      setStep(flow.back);
    },
    error,
  };
  const continueButton = (label: string, disabled = false) => (
    <Button
      onClick={handleNext}
      size="lg"
      className="w-full"
      disabled={disabled}
    >
      {label}
    </Button>
  );

  switch (step) {
    case 'basic':
      return (
        <OnboardingFrame
          {...frame}
          title="Basic Information"
          actions={continueButton('Continue')}
        >
          <div className="space-y-4">
            <Input
              label="Birthdate"
              type="date"
              {...register('birthdate')}
              error={errors.birthdate?.message}
            />
            <div>
              <p
                id="gender-label"
                className="block text-sm font-semibold text-ink-2 mb-1.5"
              >
                Gender
              </p>
              <div
                role="radiogroup"
                aria-labelledby="gender-label"
                className="flex gap-2"
              >
                {GENDER_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant={gender === option.value ? 'primary' : 'secondary'}
                    onClick={() => setValue('gender', option.value)}
                    className="flex-1"
                    type="button"
                    role="radio"
                    aria-checked={gender === option.value}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            <Input
              label="Height (cm)"
              type="number"
              inputMode="decimal"
              {...register('heightCm')}
              placeholder="Enter your height in cm"
              error={errors.heightCm?.message}
            />
          </div>
        </OnboardingFrame>
      );

    case 'weight':
      return (
        <OnboardingFrame
          {...frame}
          title="Current Weight"
          description="This will be your starting point for tracking progress."
          actions={continueButton('Continue')}
        >
          <Input
            label="Weight (kg)"
            type="number"
            inputMode="decimal"
            step="0.1"
            {...register('weightKg')}
            placeholder="Enter your current weight"
            error={errors.weightKg?.message}
          />
        </OnboardingFrame>
      );

    case 'activity':
      return (
        <OnboardingFrame
          {...frame}
          title="Activity Level"
          actions={continueButton('Continue')}
        >
          <ChoiceList
            label="Activity level"
            options={activityOptions}
            value={activityLevel}
            onChange={(next) => setValue('activityLevel', next)}
          />
        </OnboardingFrame>
      );

    case 'goal':
      return (
        <OnboardingFrame
          {...frame}
          title="Your Goal"
          actions={continueButton('Continue')}
        >
          <ChoiceList
            label="Goal"
            options={goalOptions}
            value={goal}
            onChange={(next) => setValue('goal', next)}
          />

          <div className="space-y-1 pt-4">
            <h2 className="text-lg font-bold text-ink">Diet Type</h2>
            <p className="text-ink-2 text-sm">
              How carbs are split. Low carb / keto pin carbs low and let fat
              fill the rest.
            </p>
          </div>
          <ChoiceList
            label="Diet type"
            options={dietTypeOptions}
            value={dietType}
            onChange={(next) => setValue('dietType', next)}
          />
          {dietType === 'keto' && (
            <p className="text-warn text-sm">
              Keto is a therapeutic approach — worth discussing with a doctor if
              you manage blood sugar or take medication.
            </p>
          )}
        </OnboardingFrame>
      );

    case 'api':
      return (
        <OnboardingFrame
          {...frame}
          title="AI Setup"
          description="You can skip this and add it later in Settings."
          actions={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="lg"
                onClick={handleNext}
                className="flex-1"
              >
                Skip for now
              </Button>
              <Button
                size="lg"
                onClick={handleNext}
                className="flex-1"
                disabled={!aiModel || !apiKey}
              >
                Continue
              </Button>
            </div>
          }
        >
          <AISetupForm
            value={{ model: aiModel, apiKey }}
            onChange={(next) => {
              setValue('aiModel', next.model);
              setValue('apiKey', next.apiKey);
            }}
          />
        </OnboardingFrame>
      );

    case 'targets':
      return (
        <OnboardingFrame
          {...frame}
          title="Your Targets"
          description="You can adjust these values or change them later in Settings."
          actions={continueButton('Confirm & Continue')}
        >
          <TargetsEditor
            values={targets}
            onChange={(next) => setValue('targets', next)}
          />
        </OnboardingFrame>
      );

    default:
      return null;
  }
}
