import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Dumbbell,
  Clock,
  Calendar,
  Target,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react';
import { Modal, Button, Card, CardContent } from '../ui';
import { useProgramGenerator } from '../../hooks/useProgramGenerator';
import { useProfile } from '../../hooks/useProfile';
import { useAppStore } from '../../hooks/useAppStore';
import { initGemini, isGeminiInitialized } from '../../services/gemini';
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_PRESETS,
  TRAINING_SPLITS,
  MUSCLE_GROUPS,
  EXPERIENCE_LEVELS,
} from '../../constants/equipment';
import type {
  EquipmentType,
  ExperienceLevel,
  AIProgramGeneratorInput,
} from '../../types';

type WizardStep =
  | 'frequency'
  | 'equipment'
  | 'goals'
  | 'generating'
  | 'review'
  | 'saving';

interface ProgramGeneratorWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProgramGeneratorWizard({
  isOpen,
  onClose,
}: ProgramGeneratorWizardProps) {
  const navigate = useNavigate();
  const { profile, fetchProfile } = useProfile();
  const isOnline = useAppStore((state) => state.isOnline);
  const {
    state: generatorState,
    generateProgram,
    saveProgram,
    resetState,
  } = useProgramGenerator();

  const [wizardStep, setWizardStep] = useState<WizardStep>('frequency');

  // Form state
  const [trainingDays, setTrainingDays] = useState(4);
  const [sessionDuration, setSessionDuration] = useState(60);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentType[]>(
    [],
  );
  const [experienceLevel, setExperienceLevel] =
    useState<ExperienceLevel>('intermediate');
  const [trainingSplit, setTrainingSplit] =
    useState<AIProgramGeneratorInput['preferredTrainingSplit']>('auto');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [injuries, setInjuries] = useState('');

  // Load profile on mount
  useEffect(() => {
    if (isOpen && !profile) {
      fetchProfile();
    }
  }, [isOpen, profile, fetchProfile]);

  // Initialize Gemini when profile loads
  useEffect(() => {
    if (profile?.gemini_api_key && !isGeminiInitialized()) {
      initGemini(profile.gemini_api_key);
    }
  }, [profile]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setWizardStep('frequency');
      resetState();
    }
  }, [isOpen, resetState]);

  const handleEquipmentPreset = (presetKey: keyof typeof EQUIPMENT_PRESETS) => {
    const preset = EQUIPMENT_PRESETS[presetKey];
    setSelectedEquipment([...preset.equipment]);
  };

  const toggleEquipment = (equipment: EquipmentType) => {
    setSelectedEquipment((prev) =>
      prev.includes(equipment)
        ? prev.filter((e) => e !== equipment)
        : [...prev, equipment],
    );
  };

  const toggleFocusArea = (area: string) => {
    setFocusAreas((prev) =>
      prev.includes(area)
        ? prev.filter((a) => a !== area)
        : prev.length < 2
          ? [...prev, area]
          : prev,
    );
  };

  const handleGenerate = async () => {
    if (!profile) return;

    setWizardStep('generating');

    const input: AIProgramGeneratorInput = {
      trainingDaysPerWeek: trainingDays,
      sessionDurationMinutes: sessionDuration,
      availableEquipment: selectedEquipment,
      goal: profile.goal,
      experienceLevel,
      focusAreas: focusAreas.length > 0 ? focusAreas : undefined,
      injuries: injuries.trim() || undefined,
      preferredTrainingSplit: trainingSplit,
    };

    await generateProgram(input);
  };

  // Watch for generation completion and transition to review step
  useEffect(() => {
    if (wizardStep === 'generating') {
      if (
        generatorState.step === 'complete' &&
        generatorState.generatedProgram
      ) {
        setWizardStep('review');
      } else if (generatorState.step === 'error') {
        // Stay on generating step to show error with retry option
      }
    }
  }, [wizardStep, generatorState.step, generatorState.generatedProgram]);

  const handleSave = async () => {
    setWizardStep('saving');
    const programId = await saveProgram();

    if (programId) {
      onClose();
      navigate(`/workout/program/${programId}`);
    }
  };

  const canProceedFromFrequency = trainingDays >= 2 && trainingDays <= 7;
  const canProceedFromEquipment = true; // Equipment is optional (bodyweight always available)
  const canProceedFromGoals = profile !== null;

  // Render functions for each step
  const renderFrequencyStep = () => (
    <div className="space-y-6">
      {/* Training Days */}
      <div>
        <div className="block text-white font-medium mb-3">
          <Calendar size={18} className="inline mr-2" />
          Training Days per Week
        </div>
        <div className="grid grid-cols-6 gap-2">
          {[2, 3, 4, 5, 6, 7].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setTrainingDays(days)}
              className={`p-3 rounded-lg text-center transition-colors ${
                trainingDays === days
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {days}
            </button>
          ))}
        </div>
        <p className="text-slate-400 text-sm mt-2">
          {trainingDays <= 3
            ? 'Great for beginners or busy schedules'
            : trainingDays <= 5
              ? 'Ideal for most goals'
              : 'Advanced - ensure adequate recovery'}
        </p>
      </div>

      {/* Session Duration */}
      <div>
        <div className="block text-white font-medium mb-3">
          <Clock size={18} className="inline mr-2" />
          Session Duration (minutes)
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[30, 45, 60, 90].map((duration) => (
            <button
              key={duration}
              type="button"
              onClick={() => setSessionDuration(duration)}
              className={`p-3 rounded-lg text-center transition-colors ${
                sessionDuration === duration
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {duration}m
            </button>
          ))}
        </div>
      </div>

      {/* Training Split */}
      <div>
        <div className="block text-white font-medium mb-3">
          <Dumbbell size={18} className="inline mr-2" />
          Training Split
        </div>
        <div className="space-y-2">
          {(
            Object.entries(TRAINING_SPLITS) as [
              keyof typeof TRAINING_SPLITS,
              (typeof TRAINING_SPLITS)[keyof typeof TRAINING_SPLITS],
            ][]
          ).map(([key, split]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTrainingSplit(key)}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                trainingSplit === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <div className="font-medium">{split.label}</div>
              <div
                className={`text-sm ${trainingSplit === key ? 'text-blue-200' : 'text-slate-400'}`}
              >
                {split.description}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderEquipmentStep = () => (
    <div className="space-y-6">
      {/* Quick Presets */}
      <div>
        <div className="block text-white font-medium mb-3">Quick Setup</div>
        <div className="grid grid-cols-2 gap-2">
          {(
            Object.entries(EQUIPMENT_PRESETS) as [
              keyof typeof EQUIPMENT_PRESETS,
              (typeof EQUIPMENT_PRESETS)[keyof typeof EQUIPMENT_PRESETS],
            ][]
          ).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleEquipmentPreset(key)}
              className="p-3 rounded-lg bg-slate-700 text-left hover:bg-slate-600 transition-colors"
            >
              <div className="text-white font-medium">{preset.label}</div>
              <div className="text-slate-400 text-xs">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Equipment Categories */}
      <div>
        <div className="block text-white font-medium mb-3">
          Available Equipment
        </div>
        <p className="text-slate-400 text-sm mb-3">
          <Info size={14} className="inline mr-1" />
          Bodyweight and Resistance Bands are always available
        </p>

        <div className="space-y-4 max-h-64 overflow-y-auto">
          {(
            Object.entries(EQUIPMENT_CATEGORIES) as [
              string,
              { label: string; items: EquipmentType[] },
            ][]
          ).map(([key, category]) => (
            <div key={key}>
              <div className="text-slate-400 text-sm font-medium mb-2">
                {category.label}
              </div>
              <div className="flex flex-wrap gap-2">
                {category.items.map((equipment) => (
                  <button
                    key={equipment}
                    type="button"
                    onClick={() => toggleEquipment(equipment)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      selectedEquipment.includes(equipment)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {equipment}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected count */}
      <div className="text-center text-slate-400">
        {selectedEquipment.length === 0
          ? 'Using bodyweight exercises only'
          : `${selectedEquipment.length} equipment type${selectedEquipment.length > 1 ? 's' : ''} selected`}
      </div>
    </div>
  );

  const renderGoalsStep = () => (
    <div className="space-y-6">
      {/* Experience Level */}
      <div>
        <div className="block text-white font-medium mb-3">
          Experience Level
        </div>
        <div className="space-y-2">
          {(
            Object.entries(EXPERIENCE_LEVELS) as [
              ExperienceLevel,
              { label: string; description: string },
            ][]
          ).map(([key, level]) => (
            <button
              key={key}
              type="button"
              onClick={() => setExperienceLevel(key)}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                experienceLevel === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <div className="font-medium">{level.label}</div>
              <div
                className={`text-sm ${experienceLevel === key ? 'text-blue-200' : 'text-slate-400'}`}
              >
                {level.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Current Goal (from profile) */}
      {profile && (
        <div>
          <div className="block text-white font-medium mb-2">
            <Target size={18} className="inline mr-2" />
            Your Goal
          </div>
          <div className="p-3 bg-slate-700 rounded-lg">
            <span className="text-white capitalize">
              {profile.goal.replace(/_/g, ' ')}
            </span>
            <p className="text-slate-400 text-sm mt-1">
              Based on your profile settings
            </p>
          </div>
        </div>
      )}

      {/* Focus Areas */}
      <div>
        <div className="block text-white font-medium mb-2">
          Focus Areas (Optional)
        </div>
        <p className="text-slate-400 text-sm mb-3">
          Select up to 2 muscle groups to prioritize
        </p>
        <div className="flex flex-wrap gap-2">
          {MUSCLE_GROUPS.map((muscle) => (
            <button
              key={muscle}
              type="button"
              onClick={() => toggleFocusArea(muscle)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                focusAreas.includes(muscle)
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {muscle}
            </button>
          ))}
        </div>
      </div>

      {/* Injuries */}
      <div>
        <label
          htmlFor="injuries-input"
          className="block text-white font-medium mb-2"
        >
          Injuries or Limitations (Optional)
        </label>
        <textarea
          id="injuries-input"
          value={injuries}
          onChange={(e) => setInjuries(e.target.value)}
          placeholder="e.g., bad shoulder, lower back issues..."
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
        />
      </div>
    </div>
  );

  const renderGeneratingStep = () => (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 size={48} className="text-blue-400 animate-spin mb-4" />
      <h3 className="text-lg font-semibold text-white mb-2">
        Creating Your Program
      </h3>
      <p className="text-slate-400 text-center">{generatorState.progress}</p>

      {generatorState.step === 'error' && (
        <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg">
          <p className="text-red-300">{generatorState.error}</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => setWizardStep('goals')}
          >
            Try Again
          </Button>
        </div>
      )}
    </div>
  );

  const renderReviewStep = () => {
    const program = generatorState.generatedProgram;
    if (!program) return null;

    const newExercises = generatorState.exerciseMappings.filter(
      (m) => m.status === 'needs_creation',
    );
    const matchedExercises = generatorState.exerciseMappings.filter(
      (m) => m.status === 'matched' || m.status === 'duplicate_found',
    );

    return (
      <div className="space-y-4">
        {/* Program Overview */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold text-white mb-1">
              {program.programName}
            </h3>
            <p className="text-slate-400 text-sm">
              {program.programDescription}
            </p>
          </CardContent>
        </Card>

        {/* Sessions Summary */}
        <div>
          <h4 className="text-white font-medium mb-2">
            Sessions ({program.sessions.length})
          </h4>
          <div className="space-y-2">
            {program.sessions.map((session) => {
              const dayNames = [
                'Sunday',
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday',
              ];
              const dayName =
                session.dayOfWeek !== null
                  ? dayNames[session.dayOfWeek]
                  : 'Flexible';

              return (
                <div
                  key={`session-${session.name}-${session.dayOfWeek}`}
                  className="p-3 bg-slate-700 rounded-lg"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-white font-medium">
                        {session.name}
                      </span>
                      <span className="text-slate-400 text-sm ml-2">
                        {dayName}
                      </span>
                    </div>
                    <span className="text-slate-400 text-sm">
                      {session.exercises.length} exercises
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {session.exercises.slice(0, 4).map((ex) => (
                      <span
                        key={`ex-${ex.name}`}
                        className="text-xs bg-slate-600 text-slate-300 px-2 py-0.5 rounded"
                      >
                        {ex.name}
                      </span>
                    ))}
                    {session.exercises.length > 4 && (
                      <span className="text-xs bg-slate-600 text-slate-400 px-2 py-0.5 rounded">
                        +{session.exercises.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Volume Summary */}
        <div>
          <h4 className="text-white font-medium mb-2">Weekly Volume</h4>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(
              program.weeklyVolumeSummary.muscleGroupBreakdown,
            ).map(([muscle, sets]) => (
              <div
                key={muscle}
                className="flex justify-between p-2 bg-slate-700 rounded"
              >
                <span className="text-slate-300 text-sm">{muscle}</span>
                <span className="text-white text-sm">{sets} sets</span>
              </div>
            ))}
          </div>
        </div>

        {/* Exercise Status */}
        <div>
          <h4 className="text-white font-medium mb-2">Exercise Library</h4>
          <div className="space-y-2">
            {matchedExercises.length > 0 && (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <Check size={16} />
                {matchedExercises.length} exercises found in your library
              </div>
            )}
            {newExercises.length > 0 && (
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <Sparkles size={16} />
                {newExercises.length} new exercises will be added
              </div>
            )}
          </div>
        </div>

        {/* Recommendations */}
        {program.recommendations.length > 0 && (
          <div>
            <h4 className="text-white font-medium mb-2">Tips</h4>
            <ul className="space-y-1">
              {program.recommendations.map((tip) => (
                <li
                  key={`tip-${tip.slice(0, 20)}`}
                  className="text-slate-400 text-sm flex items-start gap-2"
                >
                  <span className="text-blue-400">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderSavingStep = () => (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 size={48} className="text-green-400 animate-spin mb-4" />
      <h3 className="text-lg font-semibold text-white mb-2">Saving Program</h3>
      <p className="text-slate-400 text-center">{generatorState.progress}</p>
    </div>
  );

  // Navigation buttons
  const renderNavigation = () => {
    if (wizardStep === 'generating' || wizardStep === 'saving') return null;

    const steps: WizardStep[] = ['frequency', 'equipment', 'goals', 'review'];
    const currentIndex = steps.indexOf(wizardStep);

    return (
      <div className="flex gap-3 pt-4 border-t border-slate-700">
        {currentIndex > 0 && wizardStep !== 'review' && (
          <Button
            variant="secondary"
            onClick={() => setWizardStep(steps[currentIndex - 1])}
          >
            <ChevronLeft size={18} className="mr-1" />
            Back
          </Button>
        )}

        <div className="flex-1" />

        {wizardStep === 'frequency' && (
          <Button
            onClick={() => setWizardStep('equipment')}
            disabled={!canProceedFromFrequency}
          >
            Next
            <ChevronRight size={18} className="ml-1" />
          </Button>
        )}

        {wizardStep === 'equipment' && (
          <Button
            onClick={() => setWizardStep('goals')}
            disabled={!canProceedFromEquipment}
          >
            Next
            <ChevronRight size={18} className="ml-1" />
          </Button>
        )}

        {wizardStep === 'goals' && (
          <Button
            onClick={handleGenerate}
            disabled={
              !canProceedFromGoals || !isOnline || !isGeminiInitialized()
            }
          >
            <Sparkles size={18} className="mr-1" />
            Generate Program
          </Button>
        )}

        {wizardStep === 'review' && (
          <>
            <Button variant="secondary" onClick={() => setWizardStep('goals')}>
              <ChevronLeft size={18} className="mr-1" />
              Regenerate
            </Button>
            <Button onClick={handleSave}>
              <Check size={18} className="mr-1" />
              Save Program
            </Button>
          </>
        )}
      </div>
    );
  };

  // Step indicator
  const renderStepIndicator = () => {
    const steps = [
      { key: 'frequency', label: 'Schedule' },
      { key: 'equipment', label: 'Equipment' },
      { key: 'goals', label: 'Goals' },
      { key: 'review', label: 'Review' },
    ];

    const currentIndex =
      wizardStep === 'generating' || wizardStep === 'saving'
        ? 3
        : steps.findIndex((s) => s.key === wizardStep);

    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((step, index) => (
          <div key={step.key} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                index < currentIndex
                  ? 'bg-green-600 text-white'
                  : index === currentIndex
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-400'
              }`}
            >
              {index < currentIndex ? <Check size={16} /> : index + 1}
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-8 h-0.5 ${index < currentIndex ? 'bg-green-600' : 'bg-slate-700'}`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  // Check prerequisites
  if (!isOnline) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="AI Program Generator"
        size="lg"
      >
        <div className="text-center py-8">
          <AlertCircle size={48} className="text-amber-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            Internet Connection Required
          </h3>
          <p className="text-slate-400">
            AI program generation requires an internet connection.
          </p>
        </div>
      </Modal>
    );
  }

  if (profile && !profile.gemini_api_key) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="AI Program Generator"
        size="lg"
      >
        <div className="text-center py-8">
          <AlertCircle size={48} className="text-amber-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            API Key Required
          </h3>
          <p className="text-slate-400 mb-4">
            Please set up your Gemini API key in Settings to use AI features.
          </p>
          <Button onClick={() => navigate('/settings')}>Go to Settings</Button>
        </div>
      </Modal>
    );
  }

  const stepTitles: Record<WizardStep, string> = {
    frequency: 'Schedule & Split',
    equipment: 'Available Equipment',
    goals: 'Goals & Preferences',
    generating: 'Generating...',
    review: 'Review Program',
    saving: 'Saving...',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={stepTitles[wizardStep]}
      size="lg"
    >
      {renderStepIndicator()}

      {wizardStep === 'frequency' && renderFrequencyStep()}
      {wizardStep === 'equipment' && renderEquipmentStep()}
      {wizardStep === 'goals' && renderGoalsStep()}
      {wizardStep === 'generating' && renderGeneratingStep()}
      {wizardStep === 'review' && renderReviewStep()}
      {wizardStep === 'saving' && renderSavingStep()}

      {renderNavigation()}
    </Modal>
  );
}
