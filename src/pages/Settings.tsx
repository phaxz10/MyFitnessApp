import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronRight,
  Download,
  Key,
  RefreshCw,
  Target,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { ExportModal } from '../components/settings/ExportModal';
import {
  Button,
  Card,
  CardContent,
  Input,
  Modal,
  Select,
} from '../components/ui';
import { useAppStore } from '../hooks/useAppStore';
import { useProfile } from '../hooks/useProfile';
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
  exportData,
  importData,
  readBackupFile,
} from '../services/backup';
import { resetDatabase } from '../services/db';
import { calculateTargets, initGemini } from '../services/gemini';
import { calculateAgeFromBirthdate, formatDate } from '../utils/date';

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
  const queryClient = useQueryClient();
  const { profile, updateProfile } = useProfile();
  const setOnboardingComplete = useAppStore(
    (state) => state.setOnboardingComplete,
  );
  const isOnline = useAppStore((state) => state.isOnline);

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [clearDataConfirmText, setClearDataConfirmText] = useState('');

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
    setError(null);
    try {
      await updateProfile({
        goal: data.goal as 'bulk' | 'lean_bulk' | 'recomp' | 'cut' | 'maintain',
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
        age: calculateAgeFromBirthdate(profileForm.getValues().birthdate),
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
      // Invalidate profile query to trigger refetch after import
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setSuccess('Data imported successfully');
    } catch (_err) {
      setError('Failed to import data');
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  const handleClearData = async () => {
    setIsLoading(true);
    try {
      await resetDatabase();
      setOnboardingComplete(false);
      navigate('/onboarding');
    } catch (_err) {
      setError('Failed to clear data');
      setIsLoading(false);
      setShowClearDataModal(false);
      setClearDataConfirmText('');
    }
  };

  return (
    <div className="p-4 pb-20">
      <h1 className="text-xl font-bold text-white mb-6">Settings</h1>

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
                  Birthdate, height, activity level
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
                label="Birthdate"
                type="date"
                {...profileForm.register('birthdate')}
                error={profileForm.formState.errors.birthdate?.message}
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
            onClick={() => setShowClearDataModal(true)}
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

      {/* Clear Data Confirmation Modal */}
      <Modal
        isOpen={showClearDataModal}
        onClose={() => {
          setShowClearDataModal(false);
          setClearDataConfirmText('');
        }}
        title="Clear All Data"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle
              className="text-red-400 mt-0.5 flex-shrink-0"
              size={20}
            />
            <div>
              <p className="text-red-400 font-medium">
                This action cannot be undone
              </p>
              <p className="text-slate-400 text-sm mt-1">
                All your data including profile, weight logs, food entries,
                exercises, workout programs, and workout history will be
                permanently deleted.
              </p>
            </div>
          </div>

          <div>
            <p className="text-slate-300 text-sm mb-2">
              Type{' '}
              <span className="font-mono font-bold text-white">DELETE</span> to
              confirm:
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowClearDataModal(false);
                setClearDataConfirmText('');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleClearData}
              disabled={clearDataConfirmText !== 'DELETE' || isLoading}
              isLoading={isLoading}
              className="flex-1"
            >
              Clear All Data
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
