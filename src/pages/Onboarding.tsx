import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dumbbell } from 'lucide-react';
import { Button, Input, Select } from '../components/ui';
import { useAppStore } from '../hooks/useAppStore';
import { useProfile } from '../hooks/useProfile';
import { useWeight } from '../hooks/useWeight';
import { initGemini } from '../services/gemini';
import { calculateTargets } from '../services/gemini';
import { formatDate } from '../utils/date';
import { onboardingSchema, type OnboardingFormData } from '../schemas/forms';

type Step =
  | 'welcome'
  | 'basic'
  | 'weight'
  | 'activity'
  | 'goal'
  | 'rate'
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
  const setOnboardingComplete = useAppStore(
    (state) => state.setOnboardingComplete,
  );
  const { createProfile } = useProfile();
  const { addLog } = useWeight();

  const [step, setStep] = useState<Step>('welcome');
  const [error, setError] = useState<string | null>(null);

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
      age: '',
      gender: 'male',
      heightCm: '',
      weightKg: '',
      activityLevel: 'moderate',
      goal: 'lean_bulk',
      targetRate: '0.25',
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
        const isValid = await trigger(['age', 'heightCm']);
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
        if (goal === 'maintain' || goal === 'recomp') {
          setStep('api');
        } else {
          setStep('rate');
        }
        break;
      case 'rate':
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

  const calculateUserTargets = async () => {
    const values = getValues();
    try {
      if (values.apiKey) {
        initGemini(values.apiKey);
        const result = await calculateTargets({
          age: parseInt(values.age),
          gender: values.gender,
          height_cm: parseFloat(values.heightCm),
          weight_kg: parseFloat(values.weightKg),
          activity_level: values.activityLevel,
          goal: values.goal,
          target_rate_kg_per_week: parseFloat(values.targetRate) || 0,
        });
        setValue('targets', {
          calories: result.calorie_target,
          protein: result.protein_g,
          carbs: result.carbs_g,
          fat: result.fat_g,
        });
      } else {
        // Fallback calculation without AI
        const weight = parseFloat(values.weightKg);
        const multipliers = {
          sedentary: 1.2,
          light: 1.375,
          moderate: 1.55,
          active: 1.725,
        };
        const bmr =
          values.gender === 'male'
            ? 10 * weight +
              6.25 * parseFloat(values.heightCm) -
              5 * parseInt(values.age) +
              5
            : 10 * weight +
              6.25 * parseFloat(values.heightCm) -
              5 * parseInt(values.age) -
              161;

        const tdee = bmr * multipliers[values.activityLevel];

        const goalAdjustments: Record<string, number> = {
          bulk: 500,
          lean_bulk: 250,
          recomp: 0,
          cut: -500,
          maintain: 0,
        };

        const calories = Math.round(tdee + goalAdjustments[values.goal]);
        const protein = Math.round(weight * 2); // 2g per kg
        const fat = Math.round((calories * 0.25) / 9);
        const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);

        setValue('targets', { calories, protein, carbs, fat });
      }
      setStep('targets');
    } catch (err) {
      setError('Failed to calculate targets. Using default values.');
      // Set fallback values
      const weight = parseFloat(values.weightKg);
      setValue('targets', {
        calories: Math.round(weight * 30),
        protein: Math.round(weight * 2),
        carbs: Math.round(weight * 3),
        fat: Math.round(weight * 1),
      });
      setStep('targets');
    }
  };

  const saveProfile = async () => {
    const values = getValues();
    try {
      await createProfile({
        age: parseInt(values.age),
        gender: values.gender,
        height_cm: parseFloat(values.heightCm),
        activity_level: values.activityLevel,
        goal: values.goal,
        target_rate_kg_per_week: parseFloat(values.targetRate) || 0,
        calorie_target: values.targets.calories,
        protein_target_g: values.targets.protein,
        carbs_target_g: values.targets.carbs,
        fat_target_g: values.targets.fat,
        gemini_api_key: values.apiKey || null,
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
    } catch (err) {
      setError('Failed to save profile. Please try again.');
    }
  };

  const goToDashboard = () => {
    navigate('/');
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
                label="Age"
                type="number"
                {...register('age')}
                placeholder="Enter your age"
                error={errors.age?.message}
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

        {/* Target Rate Step */}
        {step === 'rate' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Target Rate</h2>
            <p className="text-slate-400 mb-4">
              How fast do you want to {goal === 'cut' ? 'lose' : 'gain'} weight?
            </p>
            <Select
              label="Weekly target (kg)"
              {...register('targetRate')}
              options={[
                { value: '0.25', label: '0.25 kg/week (Slow & steady)' },
                { value: '0.5', label: '0.5 kg/week (Moderate)' },
                { value: '0.75', label: '0.75 kg/week (Aggressive)' },
                { value: '1', label: '1 kg/week (Very aggressive)' },
              ]}
            />
            <p className="text-slate-500 text-sm mt-2">
              Slower rates are more sustainable and preserve muscle.
            </p>
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
              Enter your Gemini API key to enable AI features like food analysis
              and smart recommendations.
            </p>
            <Input
              label="Gemini API Key"
              type="password"
              {...register('apiKey')}
              placeholder="Enter your API key"
            />
            <a
              href="https://makersuite.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 text-sm hover:underline mt-2 inline-block"
            >
              Get your free API key
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
                      calories: parseInt(e.target.value) || 0,
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
                      protein: parseInt(e.target.value) || 0,
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
                      carbs: parseInt(e.target.value) || 0,
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
                      fat: parseInt(e.target.value) || 0,
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
