import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  Coffee,
  Download,
  Sparkles,
  Target,
  Trash2,
  Upload,
  User,
  Weight,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { AISetupForm } from '../components/settings/AISetupForm';
import { ClearDataModal } from '../components/settings/ClearDataModal';
import { ExportModal } from '../components/settings/ExportModal';
import { GoalsForm } from '../components/settings/GoalsForm';
import { ProfileForm } from '../components/settings/ProfileForm';
import {
  SettingsActionRow,
  SettingsControlRow,
  SettingsFileRow,
  SettingsRow,
  SettingsSection,
} from '../components/settings/SettingsSection';
import { Button, UnitSelector } from '../components/ui';
import { AI_PROVIDER, FALLBACK_MODEL } from '../constants/aiProviders';
import { useAppStore } from '../hooks/useAppStore';
import { useProfile } from '../hooks/useProfile';
import { useWeight } from '../hooks/useWeight';
import {
  type ApiKeyFormData,
  apiKeyFormSchema,
  type GoalsFormData,
  goalsFormSchema,
  type ProfileFormData,
  profileFormSchema,
} from '../schemas/forms';
import {
  downloadBackup,
  type ExportOptions,
  exportBackup,
  importBackup,
  readBackupFile,
} from '../services/backup';
import { calculateTargets } from '../services/coaching/nutritionCoach';
import { resetDatabase } from '../services/db';
import { calculateAgeFromBirthdate, formatDate } from '../utils/date';
import type { WeightUnit } from '../utils/units';

export function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, updateProfile } = useProfile();
  const { getLatestLog } = useWeight();
  const setOnboardingComplete = useAppStore(
    (state) => state.setOnboardingComplete,
  );

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // One banner at a time: starting an action clears both; failing clears success.
  const clearBanners = () => {
    setError(null);
    setSuccess(null);
  };
  const [showExportModal, setShowExportModal] = useState(false);
  const [showClearDataModal, setShowClearDataModal] = useState(false);

  // Profile form
  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      birthdate: '',
      heightCm: '',
      activityLevel: '',
    },
  });

  // Goals form
  const goalsForm = useForm<GoalsFormData>({
    resolver: zodResolver(goalsFormSchema),
    defaultValues: {
      goal: '',
      dietType: 'balanced',
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
    },
  });

  // AI Setup form
  const apiKeyForm = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: {
      aiModel: undefined,
      apiKey: '',
    },
  });

  // Profile is automatically fetched by useQuery - no need for manual useEffect

  useEffect(() => {
    if (profile) {
      profileForm.reset({
        birthdate: profile.birthdate ? formatDate(profile.birthdate) : '',
        heightCm: profile.height_cm.toString(),
        activityLevel: profile.activity_level,
      });
      goalsForm.reset({
        goal: profile.goal,
        dietType: profile.diet_type,
        calories: profile.calorie_target.toString(),
        protein: profile.protein_target_g.toString(),
        carbs: profile.carbs_target_g.toString(),
        fat: profile.fat_target_g.toString(),
      });
      apiKeyForm.reset({
        aiModel: profile.ai_model,
        apiKey: profile.ai_api_key || '',
      });
    }
  }, [profile, profileForm, goalsForm, apiKeyForm]);

  const handleUpdateProfile = async (data: ProfileFormData) => {
    setIsLoading(true);
    clearBanners();
    try {
      await updateProfile({
        birthdate: data.birthdate,
        height_cm: parseFloat(data.heightCm),
        activity_level: data.activityLevel as
          | 'sedentary'
          | 'light'
          | 'moderate'
          | 'active',
      });
      setSuccess('Profile updated');
      setActiveSection(null);
    } catch (_err) {
      setError('Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTargets = async (data: GoalsFormData) => {
    setIsLoading(true);
    clearBanners();
    try {
      await updateProfile({
        goal: data.goal as 'bulk' | 'lean_bulk' | 'recomp' | 'cut' | 'maintain',
        diet_type: data.dietType as
          | 'balanced'
          | 'moderate'
          | 'low_carb'
          | 'keto',
        calorie_target: parseInt(data.calories, 10),
        protein_target_g: parseInt(data.protein, 10),
        carbs_target_g: parseInt(data.carbs, 10),
        fat_target_g: parseInt(data.fat, 10),
      });
      setSuccess('Targets updated');
      setActiveSection(null);
    } catch (_err) {
      setError('Failed to update targets');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecalculateTargets = async () => {
    if (!profile) {
      setError('Please set up your profile first');
      return;
    }

    setIsLoading(true);
    clearBanners();
    try {
      const values = goalsForm.getValues();
      const latestWeight = await getLatestLog();
      if (!latestWeight) {
        setError('Add a current weight log before recalculating targets');
        return;
      }

      const result = await calculateTargets({
        age: calculateAgeFromBirthdate(profileForm.getValues().birthdate),
        gender: profile.gender,
        height_cm: parseFloat(profileForm.getValues().heightCm),
        weight_kg: latestWeight.weight_kg,
        activity_level: profileForm.getValues().activityLevel as
          | 'sedentary'
          | 'light'
          | 'moderate'
          | 'active',
        goal: values.goal as
          | 'bulk'
          | 'lean_bulk'
          | 'recomp'
          | 'cut'
          | 'maintain',
        diet_type: values.dietType as
          | 'balanced'
          | 'moderate'
          | 'low_carb'
          | 'keto',
      });

      goalsForm.setValue('calories', result.calorie_target.toString());
      goalsForm.setValue('protein', result.protein_g.toString());
      goalsForm.setValue('carbs', result.carbs_g.toString());
      goalsForm.setValue('fat', result.fat_g.toString());
      setSuccess('Targets recalculated');
    } catch (_err) {
      setError('Failed to recalculate targets');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateApiKey = async (data: ApiKeyFormData) => {
    setIsLoading(true);
    clearBanners();
    try {
      const provider: typeof AI_PROVIDER = AI_PROVIDER;
      const model = data.aiModel ?? FALLBACK_MODEL;
      await updateProfile({
        ai_provider: provider,
        ai_model: model,
        ai_api_key: data.apiKey || null,
        // The legacy OpenAI proxy is obsolete — OpenRouter is browser-direct.
        ai_proxy_url: null,
      });
      // useProfile's refetch + App.tsx's mirror effect updates the store,
      // which the stateless aiClient reads on its next call.
      setSuccess('AI settings updated');
      setActiveSection(null);
    } catch (_err) {
      setError('Failed to update AI settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnitChange = async (unit: WeightUnit) => {
    if (!profile || profile.weight_unit === unit) return;
    clearBanners();
    try {
      // Storage stays kg; only the display/entry unit changes.
      await updateProfile({ weight_unit: unit });
    } catch (_err) {
      setError('Failed to update units');
    }
  };

  const handleExport = async (options: ExportOptions) => {
    setIsLoading(true);
    clearBanners();
    try {
      downloadBackup(await exportBackup(options));
      setSuccess('Backup downloaded');
    } catch (_err) {
      setError('Failed to export data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    clearBanners();
    try {
      await importBackup(await readBackupFile(file));
      // Refetch everything the restore may have replaced
      await queryClient.invalidateQueries();
      setSuccess('Backup restored');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to import the backup',
      );
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  const handleClearData = async () => {
    setIsLoading(true);
    clearBanners();
    try {
      await resetDatabase();
      setOnboardingComplete(false);
      navigate('/onboarding');
    } catch (_err) {
      setError('Failed to clear data');
      setIsLoading(false);
      setShowClearDataModal(false);
    }
  };

  type SectionId = 'profile' | 'goals' | 'api';
  const toggle = (id: SectionId) =>
    setActiveSection(activeSection === id ? null : id);
  const weightUnit = profile?.weight_unit ?? 'kg';

  return (
    <div className="px-4 py-4 space-y-4">
      {success && (
        <div
          role="status"
          className="bg-eat-soft text-eat-ink font-medium px-4 py-3 rounded-xl"
        >
          {success}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="bg-danger-soft text-danger font-medium px-4 py-3 rounded-xl"
        >
          {error}
        </div>
      )}

      <SettingsSection title="You">
        <SettingsRow
          icon={<User size={18} />}
          discipline="body"
          title="Profile"
          summary="Birthdate, height, activity level"
          isOpen={activeSection === 'profile'}
          onToggle={() => toggle('profile')}
        >
          <ProfileForm
            form={profileForm}
            onSubmit={handleUpdateProfile}
            isLoading={isLoading}
          />
        </SettingsRow>
        <SettingsRow
          icon={<Target size={18} />}
          discipline="eat"
          title="Goals & Targets"
          summary="Calories, macros, goal type"
          isOpen={activeSection === 'goals'}
          onToggle={() => toggle('goals')}
        >
          <GoalsForm
            form={goalsForm}
            onSubmit={handleUpdateTargets}
            onRecalculate={handleRecalculateTargets}
            isLoading={isLoading}
          />
        </SettingsRow>
        <SettingsControlRow
          icon={<Weight size={18} />}
          discipline="train"
          label="Units"
          hint="Lifts, body weight, charts"
          control={
            <UnitSelector
              value={weightUnit}
              onChange={handleUnitChange}
              className="w-32"
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="AI coaching">
        <SettingsRow
          icon={<Sparkles size={18} />}
          title="AI Settings"
          summary="Provider, model, API key"
          isOpen={activeSection === 'api'}
          onToggle={() => toggle('api')}
        >
          <form
            onSubmit={apiKeyForm.handleSubmit(handleUpdateApiKey)}
            className="space-y-4"
          >
            <AISetupForm
              compact
              value={{
                model: apiKeyForm.watch('aiModel'),
                apiKey: apiKeyForm.watch('apiKey') ?? '',
              }}
              onChange={(next) => {
                apiKeyForm.setValue('aiModel', next.model);
                apiKeyForm.setValue('apiKey', next.apiKey);
              }}
            />
            <Button
              type="submit"
              size="lg"
              isLoading={isLoading}
              className="w-full"
            >
              Save AI Settings
            </Button>
          </form>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Backup and data">
        <SettingsActionRow
          icon={<Download size={18} />}
          label="Export backup (.zip)"
          hint="Choose what to include, then download"
          onClick={() => setShowExportModal(true)}
        />
        <SettingsFileRow
          icon={<Upload size={18} />}
          label="Import backup"
          hint="Restore from a .zip or older .json backup"
          accept=".zip,.json,application/zip,application/json"
          onFile={handleImport}
        />
        <p className="px-4 py-3 text-sm text-ink-2">
          Backups never leave this device unless you move the file yourself.
          Importing replaces whatever data the backup includes.
        </p>
      </SettingsSection>

      <SettingsSection title="Support">
        <SettingsActionRow
          href="https://buymeacoffee.com/phaxz10"
          icon={<Coffee size={18} />}
          label="Buy me a coffee"
          hint="Your support helps keep MyPersonalFitness free"
        />
      </SettingsSection>

      <SettingsSection title="Danger zone" danger>
        <SettingsActionRow
          danger
          icon={<Trash2 size={18} />}
          label="Clear All Data"
          hint="Permanently delete everything on this device"
          onClick={() => setShowClearDataModal(true)}
        />
      </SettingsSection>

      <div className="text-center text-ink-3 text-sm pt-2">
        <p>MyPersonalFitness v0.0.1</p>
        <p>Offline-first PWA</p>
      </div>

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        isLoading={isLoading}
      />

      <ClearDataModal
        isOpen={showClearDataModal}
        onClose={() => setShowClearDataModal(false)}
        onConfirm={handleClearData}
        isLoading={isLoading}
      />
    </div>
  );
}
