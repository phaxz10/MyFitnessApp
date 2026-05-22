import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  HelpCircle,
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
  fetchBackupFromGist,
  findExistingBackupGist,
  getBackupStatus,
  performAutoBackup,
  removeGithubToken,
  saveGistId,
  saveGithubToken,
  validateGithubToken,
} from '../services/autoBackup';
import {
  downloadBackup,
  type ExportOptions,
  exportData,
  importData,
  readBackupFile,
} from '../services/backup';
import { resetDatabase } from '../services/db';
import { calculateTargets } from '../services/coaching/nutritionCoach';
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

  // Auto-backup state
  const [githubToken, setGithubToken] = useState('');
  const [backupStatus, setBackupStatus] = useState(getBackupStatus());
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showBackupHelpModal, setShowBackupHelpModal] = useState(false);
  const [foundGistId, setFoundGistId] = useState<string | null>(null);

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
      proxyUrl: '',
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
        apiKey: profile.openai_api_key || '',
        proxyUrl: profile.openai_proxy_url || '',
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
    if (!profile || !isOnline || !profile.openai_api_key) {
      setError('Requires internet connection and API key');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
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
      await updateProfile({
        openai_api_key: data.apiKey || null,
        openai_proxy_url: data.proxyUrl?.trim() || null,
      });
      // useProfile's refetch + App.tsx's mirror effect updates the store,
      // which the stateless aiClient reads on its next call.
      setSuccess('AI settings updated');
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

  // Auto-backup handlers
  const handleSaveGithubToken = async () => {
    if (!githubToken.trim()) {
      setError('Please enter a GitHub token');
      return;
    }

    setIsBackupLoading(true);
    setError(null);

    try {
      const isValid = await validateGithubToken(githubToken);
      if (!isValid) {
        setError('Invalid GitHub token. Please check and try again.');
        setIsBackupLoading(false);
        return;
      }

      // Check for existing backup BEFORE saving token completely or creating new backup
      const existingGistId = await findExistingBackupGist(githubToken);

      if (existingGistId) {
        setFoundGistId(existingGistId);
        setShowRestoreModal(true);
        setIsBackupLoading(false);
        return;
      }

      // No existing backup, proceed as new
      saveGithubToken(githubToken);
      await performInitialBackup();
    } catch (_err) {
      setError('Failed to configure backup');
      setIsBackupLoading(false);
    }
  };

  const performInitialBackup = async () => {
    try {
      const result = await performAutoBackup();
      if (result.success) {
        setBackupStatus(getBackupStatus());
        setSuccess('GitHub backup configured! Initial backup created.');
        setGithubToken('');
        setActiveSection(null);
      } else {
        setError(`Backup failed: ${result.error}`);
      }
    } catch (_err) {
      setError('Failed to create initial backup');
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleRestoreFoundBackup = async () => {
    if (!foundGistId) return;

    setIsBackupLoading(true);
    setShowRestoreModal(false);

    try {
      saveGithubToken(githubToken);
      saveGistId(foundGistId);

      const backupData = await fetchBackupFromGist(githubToken, foundGistId);
      if (backupData) {
        await importData(backupData);
        await queryClient.invalidateQueries({ queryKey: ['profile'] });
        setSuccess('Backup found and restored successfully!');
        setBackupStatus(getBackupStatus());
        setGithubToken('');
        setActiveSection(null);
      } else {
        setError('Failed to fetch backup data');
      }
    } catch (_err) {
      setError('Failed to restore backup');
    } finally {
      setIsBackupLoading(false);
      setFoundGistId(null);
    }
  };

  const handleSkipRestore = async () => {
    setShowRestoreModal(false);
    setFoundGistId(null);
    setIsBackupLoading(true);

    try {
      saveGithubToken(githubToken);
      // This will create a NEW gist since we didn't save the found Gist ID
      await performInitialBackup();
    } catch (_err) {
      setError('Failed to configure backup');
      setIsBackupLoading(false);
    }
  };

  const handleRemoveGithubToken = () => {
    removeGithubToken();
    setBackupStatus(getBackupStatus());
    setSuccess('Auto-backup disabled');
  };

  const handleManualBackup = async () => {
    setIsBackupLoading(true);
    setError(null);

    try {
      const result = await performAutoBackup();
      if (result.success) {
        setBackupStatus(getBackupStatus());
        setSuccess('Backup completed successfully!');
      } else {
        setError(`Backup failed: ${result.error}`);
      }
    } catch (_err) {
      setError('Failed to backup');
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleRestoreFromGist = async () => {
    setIsBackupLoading(true);
    setError(null);

    try {
      const backupData = await fetchBackupFromGist();
      if (!backupData) {
        setError('No backup found or failed to fetch');
        setIsBackupLoading(false);
        return;
      }

      await importData(backupData);
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setSuccess('Data restored from backup!');
    } catch (_err) {
      setError('Failed to restore from backup');
    } finally {
      setIsBackupLoading(false);
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
                  disabled={!isOnline || !profile?.openai_api_key}
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
                <p className="text-slate-400 text-sm">OpenAI API key</p>
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
                label="OpenAI API Key"
                type="password"
                {...apiKeyForm.register('apiKey')}
                placeholder="Enter your API key"
              />
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 text-sm hover:underline"
              >
                Get your API key
              </a>
              <Input
                label="Proxy URL (optional)"
                type="url"
                {...apiKeyForm.register('proxyUrl')}
                placeholder="https://your-worker.workers.dev"
                error={apiKeyForm.formState.errors.proxyUrl?.message}
              />
              <p className="text-slate-400 text-xs leading-relaxed">
                Browsers can't call OpenAI's Responses API directly (CORS). Deploy
                the included Cloudflare Worker (see{' '}
                <code className="text-slate-300">worker/README.md</code>) and
                paste its URL above. Your API key still lives in this browser —
                the proxy only adds CORS headers.
              </p>
              <Button type="submit" isLoading={isLoading} className="w-full">
                Save AI Settings
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Auto Backup Section */}
      <Card className="mb-3">
        <CardContent className="p-0">
          <button
            type="button"
            onClick={() =>
              setActiveSection(activeSection === 'backup' ? null : 'backup')
            }
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              {backupStatus.isConfigured ? (
                <Cloud size={20} className="text-green-400" />
              ) : (
                <CloudOff size={20} className="text-slate-400" />
              )}
              <div>
                <p className="text-white font-medium">Auto Backup</p>
                <p className="text-slate-400 text-sm">
                  {backupStatus.isConfigured
                    ? 'Backing up to GitHub Gist'
                    : 'Not configured'}
                </p>
              </div>
            </div>
            <ChevronRight
              size={20}
              className={`text-slate-400 transition-transform ${activeSection === 'backup' ? 'rotate-90' : ''}`}
            />
          </button>

          {activeSection === 'backup' && (
            <div className="px-4 pb-4 space-y-4 border-t border-slate-700 pt-4">
              {backupStatus.isConfigured ? (
                <>
                  {/* Backup Status */}
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Check size={16} className="text-green-400" />
                      <span className="text-green-400 font-medium">
                        Auto-backup enabled
                      </span>
                    </div>
                    {backupStatus.lastBackup && (
                      <p className="text-slate-400 text-sm">
                        Last backup:{' '}
                        {new Date(backupStatus.lastBackup).toLocaleString()}
                      </p>
                    )}
                    {backupStatus.gistUrl && (
                      <a
                        href={backupStatus.gistUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 text-sm hover:underline flex items-center gap-1 mt-1"
                      >
                        View Gist <ExternalLink size={12} />
                      </a>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    <Button
                      variant="secondary"
                      onClick={handleManualBackup}
                      isLoading={isBackupLoading}
                      className="w-full justify-center"
                    >
                      <RefreshCw size={16} className="mr-2" />
                      Backup Now
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleRestoreFromGist}
                      isLoading={isBackupLoading}
                      className="w-full justify-center"
                    >
                      <Download size={16} className="mr-2" />
                      Restore from Backup
                    </Button>
                    <Button
                      variant="danger"
                      onClick={handleRemoveGithubToken}
                      className="w-full justify-center"
                    >
                      Disable Auto-backup
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Setup Instructions */}
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-blue-400 text-sm">
                        Enable auto-backup to save your data to a private GitHub
                        Gist every time you open the app.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowBackupHelpModal(true)}
                        className="text-blue-400 p-1 hover:bg-blue-400/10 rounded-full transition-colors"
                        title="Help"
                      >
                        <HelpCircle size={18} />
                      </button>
                    </div>
                    <a
                      href="https://github.com/settings/tokens/new?scopes=gist&description=MyPersonalFitness%20Backup"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 text-sm hover:underline flex items-center gap-1"
                    >
                      Create a GitHub token with 'gist' scope{' '}
                      <ExternalLink size={12} />
                    </a>
                  </div>

                  <Input
                    label="GitHub Personal Access Token"
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxx"
                  />

                  <Button
                    onClick={handleSaveGithubToken}
                    isLoading={isBackupLoading}
                    className="w-full"
                  >
                    Enable Auto-backup
                  </Button>
                </>
              )}
            </div>
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

          <div className="pt-4 border-t border-slate-700">
            <h4 className="text-white font-medium mb-2 flex items-center gap-2">
              <RefreshCw size={16} className="text-blue-400" />
              Data Recovery
            </h4>
            <p className="text-slate-400 text-sm mb-3">
              Lost your data? If you had Auto Backup enabled, you can recover it
              by re-entering your GitHub token in the Auto Backup section above.
            </p>
          </div>
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
      {/* Backup Help Modal */}
      <Modal
        isOpen={showBackupHelpModal}
        onClose={() => setShowBackupHelpModal(false)}
        title="How to Create a Token"
      >
        <div className="space-y-4 text-slate-300 text-sm">
          <p>
            To back up to Gists, you need a <strong>Classic</strong> Personal
            Access Token.
          </p>

          <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
            <h4 className="text-white font-medium mb-2">
              Option 1: The Easy Way
            </h4>
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                Click the{' '}
                <span className="text-blue-400">
                  "Create a GitHub token with 'gist' scope"
                </span>{' '}
                link below.
              </li>
              <li>It will open GitHub with all settings pre-filled.</li>
              <li>
                Scroll to the bottom and click <strong>Generate token</strong>.
              </li>
            </ol>
          </div>

          <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
            <h4 className="text-white font-medium mb-2">
              Option 2: The Manual Way
            </h4>
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                Go to GitHub Settings &gt; Developer settings &gt; Personal
                access tokens &gt; <strong>Tokens (classic)</strong>.
              </li>
              <li>
                Click <strong>Generate new token (classic)</strong>.
              </li>
              <li>
                Select the <strong>gist</strong> checkbox scope.
              </li>
              <li>
                Click <strong>Generate token</strong>.
              </li>
            </ol>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg">
            <p className="text-yellow-400 text-xs">
              <strong>Note:</strong> Copy the token immediately (it starts with{' '}
              <code className="bg-black/20 px-1 rounded">ghp_</code>). You won't
              be able to see it again!
            </p>
          </div>

          <Button
            onClick={() => setShowBackupHelpModal(false)}
            className="w-full"
          >
            Got it
          </Button>
        </div>
      </Modal>

      {/* Restore Found Backup Modal */}
      <Modal
        isOpen={showRestoreModal}
        onClose={() => setShowRestoreModal(false)}
        title="Found Existing Backup"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <Cloud className="text-blue-400 mt-0.5 flex-shrink-0" size={20} />
            <div>
              <p className="text-blue-400 font-medium">Backup Found!</p>
              <p className="text-slate-400 text-sm mt-1">
                We found an existing MyPersonalFitness backup associated with
                this GitHub token. Would you like to restore this data?
              </p>
            </div>
          </div>

          <p className="text-slate-300 text-sm">
            <strong className="text-white">Restore:</strong> Overwrites current
            app data with backup data.
            <br />
            <strong className="text-white">Start Fresh:</strong> Creates a new
            backup file (keeps old backup safe).
          </p>

          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={handleSkipRestore}
              className="flex-1"
            >
              Start Fresh
            </Button>
            <Button
              onClick={handleRestoreFoundBackup}
              isLoading={isLoading}
              className="flex-1"
            >
              Restore Data
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
