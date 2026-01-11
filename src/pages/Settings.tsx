import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ChevronRight,
  User,
  Target,
  Key,
  Download,
  Upload,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, Button, Input, Select } from '../components/ui';
import { ExportModal } from '../components/settings/ExportModal';
import { useProfile } from '../hooks/useProfile';
import { useAppStore } from '../hooks/useAppStore';
import { initGemini, calculateTargets } from '../services/gemini';
import {
  exportData,
  importData,
  downloadBackup,
  readBackupFile,
  type ExportOptions,
} from '../services/backup';
import { resetDatabase } from '../services/db';
import {
  profileFormSchema,
  goalsFormSchema,
  apiKeyFormSchema,
  type ProfileFormData,
  type GoalsFormData,
  type ApiKeyFormData,
} from '../schemas/forms';

const activityOptions = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
];

const goalOptions = [
  { value: 'bulk', label: 'Bulk' },
  { value: 'lean_bulk', label: 'Lean Bulk' },
  { value: 'recomp', label: 'Recomp' },
  { value: 'cut', label: 'Cut' },
  { value: 'maintain', label: 'Maintain' },
];

export function Settings() {
  const navigate = useNavigate();
  const { profile, fetchProfile, updateProfile } = useProfile();
  const setOnboardingComplete = useAppStore(
    (state) => state.setOnboardingComplete,
  );
  const isOnline = useAppStore((state) => state.isOnline);

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Profile form
  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      age: '',
      heightCm: '',
      activityLevel: '',
    },
  });

  // Goals form
  const goalsForm = useForm<GoalsFormData>({
    resolver: zodResolver(goalsFormSchema),
    defaultValues: {
      goal: '',
      targetRate: '',
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
    },
  });

  // API Key form
  const apiKeyForm = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: {
      apiKey: '',
    },
  });

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (profile) {
      profileForm.reset({
        age: profile.age.toString(),
        heightCm: profile.height_cm.toString(),
        activityLevel: profile.activity_level,
      });
      goalsForm.reset({
        goal: profile.goal,
        targetRate: profile.target_rate_kg_per_week.toString(),
        calories: profile.calorie_target.toString(),
        protein: profile.protein_target_g.toString(),
        carbs: profile.carbs_target_g.toString(),
        fat: profile.fat_target_g.toString(),
      });
      apiKeyForm.reset({
        apiKey: profile.gemini_api_key || '',
      });
    }
  }, [profile, profileForm, goalsForm, apiKeyForm]);

  const handleUpdateProfile = async (data: ProfileFormData) => {
    setIsLoading(true);
    setError(null);
    try {
      await updateProfile({
        age: parseInt(data.age, 10),
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
    setError(null);
    try {
      await updateProfile({
        goal: data.goal as 'bulk' | 'lean_bulk' | 'recomp' | 'cut' | 'maintain',
        target_rate_kg_per_week: parseFloat(data.targetRate),
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
    if (!profile || !isOnline || !profile.gemini_api_key) {
      setError('Requires internet connection and API key');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      initGemini(profile.gemini_api_key);
      const values = goalsForm.getValues();
      const result = await calculateTargets({
        age: parseInt(profileForm.getValues().age, 10),
        gender: profile.gender,
        height_cm: parseFloat(profileForm.getValues().heightCm),
        weight_kg: 70, // Would need to get latest weight
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
        target_rate_kg_per_week: parseFloat(values.targetRate),
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
    setError(null);
    try {
      await updateProfile({ gemini_api_key: data.apiKey || null });
      if (data.apiKey) {
        initGemini(data.apiKey);
      }
      setSuccess('API key updated');
      setActiveSection(null);
    } catch (_err) {
      setError('Failed to update API key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (options: ExportOptions) => {
    setIsLoading(true);
    try {
      const data = await exportData(options);
      downloadBackup(data);
      setSuccess('Data exported successfully');
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
    setError(null);
    try {
      const data = await readBackupFile(file);
      await importData(data);
      await fetchProfile();
      setSuccess('Data imported successfully');
    } catch (_err) {
      setError('Failed to import data');
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  const handleClearData = async () => {
    if (
      !confirm(
        'Are you sure you want to clear all data? This cannot be undone.',
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      await resetDatabase();
      setOnboardingComplete(false);
      navigate('/onboarding');
    } catch (_err) {
      setError('Failed to clear data');
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 pb-20">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      {success && (
        <div className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg mb-4">
          {success}
        </div>
      )}

      {error && (
        <div className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Profile Section */}
      <Card className="mb-3">
        <CardContent className="p-0">
          <button
            type="button"
            onClick={() =>
              setActiveSection(activeSection === 'profile' ? null : 'profile')
            }
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <User size={20} className="text-blue-400" />
              <div>
                <p className="text-white font-medium">Profile</p>
                <p className="text-slate-400 text-sm">
                  Age, height, activity level
                </p>
              </div>
            </div>
            <ChevronRight
              size={20}
              className={`text-slate-400 transition-transform ${activeSection === 'profile' ? 'rotate-90' : ''}`}
            />
          </button>

          {activeSection === 'profile' && (
            <form
              onSubmit={profileForm.handleSubmit(handleUpdateProfile)}
              className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-4"
            >
              <Input
                label="Age"
                type="number"
                {...profileForm.register('age')}
                error={profileForm.formState.errors.age?.message}
              />
              <Input
                label="Height (cm)"
                type="number"
                {...profileForm.register('heightCm')}
                error={profileForm.formState.errors.heightCm?.message}
              />
              <Select
                label="Activity Level"
                {...profileForm.register('activityLevel')}
                options={activityOptions}
                error={profileForm.formState.errors.activityLevel?.message}
              />
              <Button type="submit" isLoading={isLoading} className="w-full">
                Save Changes
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Goals Section */}
      <Card className="mb-3">
        <CardContent className="p-0">
          <button
            type="button"
            onClick={() =>
              setActiveSection(activeSection === 'goals' ? null : 'goals')
            }
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Target size={20} className="text-green-400" />
              <div>
                <p className="text-white font-medium">Goals & Targets</p>
                <p className="text-slate-400 text-sm">
                  Calories, macros, goal type
                </p>
              </div>
            </div>
            <ChevronRight
              size={20}
              className={`text-slate-400 transition-transform ${activeSection === 'goals' ? 'rotate-90' : ''}`}
            />
          </button>

          {activeSection === 'goals' && (
            <form
              onSubmit={goalsForm.handleSubmit(handleUpdateTargets)}
              className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-4"
            >
              <Select
                label="Goal"
                {...goalsForm.register('goal')}
                options={goalOptions}
                error={goalsForm.formState.errors.goal?.message}
              />
              <Input
                label="Target Rate (kg/week)"
                type="number"
                step="0.25"
                {...goalsForm.register('targetRate')}
                error={goalsForm.formState.errors.targetRate?.message}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Calories"
                  type="number"
                  {...goalsForm.register('calories')}
                  error={goalsForm.formState.errors.calories?.message}
                />
                <Input
                  label="Protein (g)"
                  type="number"
                  {...goalsForm.register('protein')}
                  error={goalsForm.formState.errors.protein?.message}
                />
                <Input
                  label="Carbs (g)"
                  type="number"
                  {...goalsForm.register('carbs')}
                  error={goalsForm.formState.errors.carbs?.message}
                />
                <Input
                  label="Fat (g)"
                  type="number"
                  {...goalsForm.register('fat')}
                  error={goalsForm.formState.errors.fat?.message}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" isLoading={isLoading} className="flex-1">
                  Save Changes
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleRecalculateTargets}
                  isLoading={isLoading}
                  disabled={!isOnline || !profile?.gemini_api_key}
                >
                  <RefreshCw size={16} />
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* API Key Section */}
      <Card className="mb-3">
        <CardContent className="p-0">
          <button
            type="button"
            onClick={() =>
              setActiveSection(activeSection === 'api' ? null : 'api')
            }
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Key size={20} className="text-purple-400" />
              <div>
                <p className="text-white font-medium">AI Settings</p>
                <p className="text-slate-400 text-sm">Gemini API key</p>
              </div>
            </div>
            <ChevronRight
              size={20}
              className={`text-slate-400 transition-transform ${activeSection === 'api' ? 'rotate-90' : ''}`}
            />
          </button>

          {activeSection === 'api' && (
            <form
              onSubmit={apiKeyForm.handleSubmit(handleUpdateApiKey)}
              className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-4"
            >
              <Input
                label="Gemini API Key"
                type="password"
                {...apiKeyForm.register('apiKey')}
                placeholder="Enter your API key"
              />
              <a
                href="https://makersuite.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 text-sm hover:underline"
              >
                Get your free API key
              </a>
              <Button type="submit" isLoading={isLoading} className="w-full">
                Save API Key
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card className="mb-3">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-white font-medium mb-2">Data Management</h3>

          <Button
            variant="secondary"
            onClick={() => setShowExportModal(true)}
            className="w-full justify-start"
          >
            <Download size={18} className="mr-2" />
            Export Data (JSON)
          </Button>

          <label className="block">
            <div className="inline-flex items-center justify-start w-full px-4 py-2 text-base font-medium rounded-lg transition-colors bg-slate-700 hover:bg-slate-600 text-white cursor-pointer">
              <Upload size={18} className="mr-2" />
              Import Data
            </div>
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>

          <Button
            variant="danger"
            onClick={handleClearData}
            className="w-full justify-start"
          >
            <Trash2 size={18} className="mr-2" />
            Clear All Data
          </Button>
        </CardContent>
      </Card>

      {/* App Info */}
      <div className="text-center text-slate-500 text-sm mt-8">
        <p>MyPersonalFitness v0.0.1</p>
        <p>Offline-first PWA</p>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        isLoading={isLoading}
      />
    </div>
  );
}
