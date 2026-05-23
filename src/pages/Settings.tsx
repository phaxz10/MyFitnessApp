import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
  Key,
  LogOut,
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
  getBackupStatus,
  performAutoBackup,
  restoreFromDrive,
} from '../services/autoBackup';
import {
  downloadBackup,
  type ExportOptions,
  exportData,
  importData,
  readBackupFile,
} from '../services/backup';
import { calculateTargets } from '../services/coaching/nutritionCoach';
import { resetDatabase } from '../services/db';
import {
  type GoogleUser,
  getStoredUser,
  signOut as googleSignOut,
  requestGoogleAccessToken,
  signIn,
} from '../services/googleAuth';
import {
  clearDriveState,
  deleteAppFolder,
  hasRemoteBackup,
} from '../services/googleDrive';
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
  const { getLatestLog } = useWeight();
  const setOnboardingComplete = useAppStore(
    (state) => state.setOnboardingComplete,
  );

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [clearDataConfirmText, setClearDataConfirmText] = useState('');

  // Auto-backup state
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(
    getStoredUser(),
  );
  const [backupStatus, setBackupStatus] = useState(getBackupStatus());
  const [isBackupLoading, setIsBackupLoading] = useState(false);

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
    if (!profile) {
      setError('Please set up your profile first');
      return;
    }

    setIsLoading(true);
    setError(null);
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
      if (googleUser) {
        try {
          await deleteAppFolder();
        } catch {
          // Drive cleanup is best-effort — don't block local reset
        }
        googleSignOut();
        clearDriveState();
        setGoogleUser(null);
      }
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

  // Google backup handlers
  const handleGoogleSignIn = async () => {
    setIsBackupLoading(true);
    setError(null);

    try {
      const { user } = await signIn();
      setGoogleUser(user);

      const backupExists = await hasRemoteBackup();
      if (backupExists) {
        await restoreFromDrive();
        await queryClient.invalidateQueries({ queryKey: ['profile'] });
        setSuccess('Google Drive backup connected and restored!');
      } else {
        const result = await performAutoBackup();
        if (result.success) {
          setSuccess('Google Drive backup enabled! Initial backup created.');
        } else {
          setSuccess('Google Drive backup enabled!');
        }
      }

      setBackupStatus(getBackupStatus());
      setActiveSection(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to sign in with Google',
      );
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleDisconnectGoogle = () => {
    googleSignOut();
    clearDriveState();
    setGoogleUser(null);
    setBackupStatus(getBackupStatus());
    setSuccess('Google Drive backup disconnected');
  };

  const handleManualBackup = async () => {
    setIsBackupLoading(true);
    setError(null);

    try {
      await requestGoogleAccessToken();
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
                  disabled={isLoading}
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
                Browsers can't call OpenAI's Responses API directly (CORS).
                Deploy the included Cloudflare Worker (see{' '}
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
                    ? 'Backing up to Google Drive'
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
              {googleUser ? (
                <>
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-3 mb-2">
                      <img
                        src={googleUser.picture}
                        alt=""
                        className="w-8 h-8 rounded-full"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Check
                            size={14}
                            className="text-green-400 flex-shrink-0"
                          />
                          <span className="text-green-400 font-medium text-sm">
                            Connected
                          </span>
                        </div>
                        <p className="text-slate-400 text-sm truncate">
                          {googleUser.email}
                        </p>
                      </div>
                    </div>
                    {backupStatus.lastBackup && (
                      <p className="text-slate-400 text-xs">
                        Last backup:{' '}
                        {new Date(backupStatus.lastBackup).toLocaleString()}
                      </p>
                    )}
                  </div>

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
                      variant="danger"
                      onClick={handleDisconnectGoogle}
                      className="w-full justify-center"
                    >
                      <LogOut size={16} className="mr-2" />
                      Disconnect Google Drive
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <p className="text-blue-400 text-sm">
                      Sign in with Google to automatically back up your data to
                      Google Drive. Your data stays in your own Drive account.
                    </p>
                  </div>

                  <Button
                    onClick={handleGoogleSignIn}
                    isLoading={isBackupLoading}
                    className="w-full"
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <title>SignIn</title>
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
              Lost your data? If you had Auto Backup enabled, sign in with
              Google in the Auto Backup section above to restore from Google
              Drive.
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
                {googleUser &&
                  ' Your Google Drive backup will also be removed and your account will be disconnected.'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-slate-300 text-sm mb-2">
              Type{' '}
              <span className="font-mono font-bold text-white">DELETE</span> to
              confirm:
            </p>
            <input
              type="text"
              value={clearDataConfirmText}
              onChange={(e) => setClearDataConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
              autoComplete="off"
            />
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
