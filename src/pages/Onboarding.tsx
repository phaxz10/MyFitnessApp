import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Dumbbell } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from '../components/ui';
import { useAppStore } from '../hooks/useAppStore';
import { useProfile } from '../hooks/useProfile';
import { useWeight } from '../hooks/useWeight';
import { type OnboardingFormData, onboardingSchema } from '../schemas/forms';
import { restoreFromDrive } from '../services/autoBackup';
import {
  calculateDeterministicTargets,
  calculateTargets,
} from '../services/coaching/nutritionCoach';
import { signIn } from '../services/googleAuth';
import { hasRemoteBackup } from '../services/googleDrive';
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

const activityOptions = [
  { value: 'sedentary', label: 'Sedentary (little or no exercise)' },
  { value: 'light', label: 'Light (exercise 1-3 days/week)' },
  { value: 'moderate', label: 'Moderate (exercise 3-5 days/week)' },
  { value: 'active', label: 'Active (hard exercise 6-7 days/week)' },
];

const goalOptions = [
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
  const [isSigningIn, setIsSigningIn] = useState(false);

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
  const targets = watch('targets');

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
      if (values.apiKey) {
        // Seed the API key in the store so the stateless aiClient can read it.
        // The full profile is created right after this step completes.
        useAppStore.setState({
          userProfile: {
            id: 0,
            birthdate: values.birthdate,
            gender: values.gender,
            height_cm: parseFloat(values.heightCm),
            activity_level: values.activityLevel,
            goal: values.goal,
            calorie_target: 0,
            protein_target_g: 0,
            carbs_target_g: 0,
            fat_target_g: 0,
            openai_api_key: values.apiKey,
            openai_proxy_url: null,
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
    try {
      await createProfile({
        birthdate: values.birthdate,
        gender: values.gender,
        height_cm: parseFloat(values.heightCm),
        activity_level: values.activityLevel,
        goal: values.goal,
        calorie_target: values.targets.calories,
        protein_target_g: values.targets.protein,
        carbs_target_g: values.targets.carbs,
        fat_target_g: values.targets.fat,
        openai_api_key: values.apiKey || null,
        openai_proxy_url: null,
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

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setError(null);

    try {
      await signIn();

      const backupExists = await hasRemoteBackup();
      if (backupExists) {
        const hasProfile = await restoreFromDrive();
        if (hasProfile) {
          setOnboardingComplete(true);
          await queryClient.invalidateQueries({ queryKey: ['profile'] });
          navigate('/');
          return;
        }
      }

      setStep('basic');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to sign in with Google',
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Welcome Step */}
        {step === 'welcome' && (
          <div className="text-center">
            <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Dumbbell size={40} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              MyPersonalFitness
            </h1>
            <p className="text-slate-400 mb-8">
              Your AI-powered fitness companion
            </p>
            <Button onClick={handleNext} size="lg" className="w-full">
              Get Started
            </Button>

            {/* Google Sign-In for backup */}
            <div className="mt-6 pt-6 border-t border-slate-700">
              <p className="text-slate-500 text-sm mb-3">
                Sign in to sync your data
              </p>
              <Button
                variant="secondary"
                onClick={handleGoogleSignIn}
                size="lg"
                className="w-full"
                isLoading={isSigningIn}
              >
                <svg
                  aria-hidden="true"
                  className="w-5 h-5 mr-2"
                  viewBox="0 0 24 24"
                >
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign in with Google
              </Button>
              {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
            </div>
          </div>
        )}

        {/* Basic Info Step */}
        {step === 'basic' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">
              Basic Information
            </h2>
            <div className="space-y-4">
              <Input
                label="Birthdate"
                type="date"
                {...register('birthdate')}
                error={errors.birthdate?.message}
              />
              <div>
                <label
                  htmlFor="gender-selection"
                  className="block text-sm font-medium text-slate-300 mb-2"
                >
                  Gender
                </label>
                <div id="gender-selection" className="flex gap-2">
                  <Button
                    variant={gender === 'male' ? 'primary' : 'secondary'}
                    onClick={() => setValue('gender', 'male')}
                    className="flex-1"
                    type="button"
                  >
                    Male
                  </Button>
                  <Button
                    variant={gender === 'female' ? 'primary' : 'secondary'}
                    onClick={() => setValue('gender', 'female')}
                    className="flex-1"
                    type="button"
                  >
                    Female
                  </Button>
                </div>
              </div>
              <Input
                label="Height (cm)"
                type="number"
                {...register('heightCm')}
                placeholder="Enter your height in cm"
                error={errors.heightCm?.message}
              />
            </div>
            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
            <Button onClick={handleNext} size="lg" className="w-full mt-6">
              Continue
            </Button>
          </div>
        )}

        {/* Weight Step */}
        {step === 'weight' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">
              Current Weight
            </h2>
            <Input
              label="Weight (kg)"
              type="number"
              step="0.1"
              {...register('weightKg')}
              placeholder="Enter your current weight"
              error={errors.weightKg?.message}
            />
            <p className="text-slate-500 text-sm mt-2">
              This will be your starting point for tracking progress.
            </p>
            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
            <Button onClick={handleNext} size="lg" className="w-full mt-6">
              Continue
            </Button>
          </div>
        )}

        {/* Activity Level Step */}
        {step === 'activity' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">
              Activity Level
            </h2>
            <div className="space-y-2">
              {activityOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setValue(
                      'activityLevel',
                      option.value as typeof activityLevel,
                    )
                  }
                  className={`w-full p-4 rounded-lg border text-left transition-colors ${
                    activityLevel === option.value
                      ? 'border-blue-500 bg-blue-500/10 text-white'
                      : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button onClick={handleNext} size="lg" className="w-full mt-6">
              Continue
            </Button>
          </div>
        )}

        {/* Goal Step */}
        {step === 'goal' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Your Goal</h2>
            <div className="space-y-2">
              {goalOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setValue('goal', option.value as typeof goal)}
                  className={`w-full p-4 rounded-lg border text-left transition-colors ${
                    goal === option.value
                      ? 'border-blue-500 bg-blue-500/10 text-white'
                      : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button onClick={handleNext} size="lg" className="w-full mt-6">
              Continue
            </Button>
          </div>
        )}

        {/* API Key Step */}
        {step === 'api' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">AI Setup</h2>
            <p className="text-slate-400 mb-4">
              Enter your OpenAI API key to enable AI features like food analysis
              and smart recommendations.
            </p>
            <Input
              label="OpenAI API Key"
              type="password"
              {...register('apiKey')}
              placeholder="Enter your API key"
            />
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 text-sm hover:underline mt-2 inline-block"
            >
              Get your API key
            </a>
            <p className="text-slate-500 text-sm mt-4">
              You can skip this and add it later in Settings.
            </p>
            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
            <div className="flex gap-2 mt-6">
              <Button
                variant="secondary"
                onClick={handleNext}
                className="flex-1"
              >
                Skip for now
              </Button>
              <Button
                onClick={handleNext}
                className="flex-1"
                disabled={!watch('apiKey')}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Calculating Step */}
        {step === 'calculating' && (
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">
              Calculating...
            </h2>
            <p className="text-slate-400">
              Setting up your personalized targets
            </p>
          </div>
        )}

        {/* Targets Step */}
        {step === 'targets' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Your Targets</h2>
            <div className="bg-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Daily Calories</span>
                <Input
                  type="number"
                  value={targets.calories}
                  onChange={(e) =>
                    setValue('targets', {
                      ...targets,
                      calories: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-24 text-right"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Protein (g)</span>
                <Input
                  type="number"
                  value={targets.protein}
                  onChange={(e) =>
                    setValue('targets', {
                      ...targets,
                      protein: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-24 text-right"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Carbs (g)</span>
                <Input
                  type="number"
                  value={targets.carbs}
                  onChange={(e) =>
                    setValue('targets', {
                      ...targets,
                      carbs: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-24 text-right"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Fat (g)</span>
                <Input
                  type="number"
                  value={targets.fat}
                  onChange={(e) =>
                    setValue('targets', {
                      ...targets,
                      fat: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-24 text-right"
                />
              </div>
            </div>
            <p className="text-slate-500 text-sm mt-4">
              You can adjust these values or change them later in Settings.
            </p>
            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
            <Button onClick={handleNext} size="lg" className="w-full mt-6">
              Confirm & Continue
            </Button>
          </div>
        )}

        {/* Ready Step */}
        {step === 'ready' && (
          <div className="text-center">
            <div className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-labelledby="check-icon-title"
              >
                <title id="check-icon-title">Success checkmark</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              You're All Set!
            </h2>
            <p className="text-slate-400 mb-8">
              Your fitness journey starts now.
            </p>
            <Button onClick={goToDashboard} size="lg" className="w-full">
              Go to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
