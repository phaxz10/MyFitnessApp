import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, User, Target, Key, Download, Upload, Trash2, RefreshCw } from 'lucide-react';
import { Card, CardContent, Button, Input, Select } from '../components/ui';
import { useProfile } from '../hooks/useProfile';
import { useAppStore } from '../hooks/useAppStore';
import { initGemini, calculateTargets } from '../services/gemini';
import { exportData, importData, downloadBackup, readBackupFile } from '../services/backup';
import { resetDatabase } from '../services/db';

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
  const setOnboardingComplete = useAppStore((state) => state.setOnboardingComplete);
  const isOnline = useAppStore((state) => state.isOnline);

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profile form
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [activityLevel, setActivityLevel] = useState('');
  const [goal, setGoal] = useState('');
  const [targetRate, setTargetRate] = useState('');

  // Targets form
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  // API Key
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (profile) {
      setAge(profile.age.toString());
      setHeightCm(profile.height_cm.toString());
      setActivityLevel(profile.activity_level);
      setGoal(profile.goal);
      setTargetRate(profile.target_rate_kg_per_week.toString());
      setCalories(profile.calorie_target.toString());
      setProtein(profile.protein_target_g.toString());
      setCarbs(profile.carbs_target_g.toString());
      setFat(profile.fat_target_g.toString());
      setApiKey(profile.gemini_api_key || '');
    }
  }, [profile]);

  const handleUpdateProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await updateProfile({
        age: parseInt(age),
        height_cm: parseFloat(heightCm),
        activity_level: activityLevel as any,
        goal: goal as any,
        target_rate_kg_per_week: parseFloat(targetRate),
      });
      setSuccess('Profile updated');
      setActiveSection(null);
    } catch (err) {
      setError('Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTargets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await updateProfile({
        calorie_target: parseInt(calories),
        protein_target_g: parseInt(protein),
        carbs_target_g: parseInt(carbs),
        fat_target_g: parseInt(fat),
      });
      setSuccess('Targets updated');
      setActiveSection(null);
    } catch (err) {
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
      const result = await calculateTargets({
        age: parseInt(age),
        gender: profile.gender,
        height_cm: parseFloat(heightCm),
        weight_kg: 70, // Would need to get latest weight
        activity_level: activityLevel as any,
        goal: goal as any,
        target_rate_kg_per_week: parseFloat(targetRate),
      });

      setCalories(result.calorie_target.toString());
      setProtein(result.protein_g.toString());
      setCarbs(result.carbs_g.toString());
      setFat(result.fat_g.toString());
      setSuccess('Targets recalculated');
    } catch (err) {
      setError('Failed to recalculate targets');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateApiKey = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await updateProfile({ gemini_api_key: apiKey || null });
      if (apiKey) {
        initGemini(apiKey);
      }
      setSuccess('API key updated');
      setActiveSection(null);
    } catch (err) {
      setError('Failed to update API key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    setIsLoading(true);
    try {
      const data = await exportData();
      downloadBackup(data);
      setSuccess('Data exported successfully');
    } catch (err) {
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
    } catch (err) {
      setError('Failed to import data');
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  const handleClearData = async () => {
    if (!confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      return;
    }

    setIsLoading(true);
    try {
      await resetDatabase();
      setOnboardingComplete(false);
      navigate('/onboarding');
    } catch (err) {
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
            onClick={() => setActiveSection(activeSection === 'profile' ? null : 'profile')}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <User size={20} className="text-blue-400" />
              <div>
                <p className="text-white font-medium">Profile</p>
                <p className="text-slate-400 text-sm">Age, height, activity level</p>
              </div>
            </div>
            <ChevronRight size={20} className={`text-slate-400 transition-transform ${activeSection === 'profile' ? 'rotate-90' : ''}`} />
          </button>

          {activeSection === 'profile' && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-4">
              <Input
                label="Age"
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
              <Input
                label="Height (cm)"
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
              />
              <Select
                label="Activity Level"
                value={activityLevel}
                onChange={(e) => setActivityLevel(e.target.value)}
                options={activityOptions}
              />
              <Button onClick={handleUpdateProfile} isLoading={isLoading} className="w-full">
                Save Changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Goals Section */}
      <Card className="mb-3">
        <CardContent className="p-0">
          <button
            onClick={() => setActiveSection(activeSection === 'goals' ? null : 'goals')}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Target size={20} className="text-green-400" />
              <div>
                <p className="text-white font-medium">Goals & Targets</p>
                <p className="text-slate-400 text-sm">Calories, macros, goal type</p>
              </div>
            </div>
            <ChevronRight size={20} className={`text-slate-400 transition-transform ${activeSection === 'goals' ? 'rotate-90' : ''}`} />
          </button>

          {activeSection === 'goals' && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-4">
              <Select
                label="Goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                options={goalOptions}
              />
              <Input
                label="Target Rate (kg/week)"
                type="number"
                step="0.25"
                value={targetRate}
                onChange={(e) => setTargetRate(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Calories"
                  type="number"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                />
                <Input
                  label="Protein (g)"
                  type="number"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                />
                <Input
                  label="Carbs (g)"
                  type="number"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                />
                <Input
                  label="Fat (g)"
                  type="number"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleUpdateTargets} isLoading={isLoading} className="flex-1">
                  Save Changes
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleRecalculateTargets}
                  isLoading={isLoading}
                  disabled={!isOnline || !profile?.gemini_api_key}
                >
                  <RefreshCw size={16} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Key Section */}
      <Card className="mb-3">
        <CardContent className="p-0">
          <button
            onClick={() => setActiveSection(activeSection === 'api' ? null : 'api')}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Key size={20} className="text-purple-400" />
              <div>
                <p className="text-white font-medium">AI Settings</p>
                <p className="text-slate-400 text-sm">Gemini API key</p>
              </div>
            </div>
            <ChevronRight size={20} className={`text-slate-400 transition-transform ${activeSection === 'api' ? 'rotate-90' : ''}`} />
          </button>

          {activeSection === 'api' && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-4">
              <Input
                label="Gemini API Key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
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
              <Button onClick={handleUpdateApiKey} isLoading={isLoading} className="w-full">
                Save API Key
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card className="mb-3">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-white font-medium mb-2">Data Management</h3>
          
          <Button variant="secondary" onClick={handleExport} className="w-full justify-start">
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

          <Button variant="danger" onClick={handleClearData} className="w-full justify-start">
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
    </div>
  );
}
