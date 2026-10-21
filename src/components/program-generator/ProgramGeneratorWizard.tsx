import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EQUIPMENT_PRESETS } from '../../constants/equipment';
import { useAppStore } from '../../hooks/useAppStore';
import { useProfile } from '../../hooks/useProfile';
import { useProgramGenerator } from '../../hooks/useProgramGenerator';
import { useAICapability } from '../../services/ai/useAICapability';
import type {
  AIProgramGeneratorInput,
  EquipmentType,
  ExperienceLevel,
} from '../../types';
import { Button, Modal } from '../ui';
import { EquipmentStep } from './steps/EquipmentStep';
import { FrequencyStep } from './steps/FrequencyStep';
import { GoalsStep } from './steps/GoalsStep';
import {
  ActivationPromptStep,
  GeneratingStep,
  SavingStep,
} from './steps/ProgressSteps';
import { ReviewStep } from './steps/ReviewStep';
import { StepIndicator } from './steps/StepIndicator';

type WizardStep =
  | 'frequency'
  | 'equipment'
  | 'goals'
  | 'generating'
  | 'review'
  | 'saving'
  | 'activation_prompt'; // Ask if user wants to set as active

const STEP_TITLES: Record<WizardStep, string> = {
  frequency: 'Schedule & Split',
  equipment: 'Available Equipment',
  goals: 'Goals & Preferences',
  generating: 'Generating...',
  review: 'Review Program',
  saving: 'Saving...',
  activation_prompt: 'Set as Active?',
};

const INPUT_STEPS: WizardStep[] = ['frequency', 'equipment', 'goals', 'review'];

interface ProgramGeneratorWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

function BlockingNotice({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AI Program Generator"
      size="lg"
    >
      <div className="text-center py-6">
        <span className="grid place-items-center size-14 mx-auto mb-4 rounded-full bg-warn-soft text-warn">
          <AlertCircle size={28} aria-hidden="true" />
        </span>
        <h3 className="text-lg font-bold text-ink mb-2">{title}</h3>
        {children}
      </div>
    </Modal>
  );
}

export function ProgramGeneratorWizard({
  isOpen,
  onClose,
}: ProgramGeneratorWizardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const isOnline = useAppStore((state) => state.isOnline);
  const {
    state: generatorState,
    generateProgramStreamlined,
    saveProgramWithAutoActivation,
    activateProgram,
    resetState,
  } = useProgramGenerator();

  const [wizardStep, setWizardStep] = useState<WizardStep>('frequency');
  const [savedProgramId, setSavedProgramId] = useState<number | null>(null);

  // Form state
  const [trainingDays, setTrainingDays] = useState(4);
  const [sessionDuration, setSessionDuration] = useState(60);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentType[]>(
    [],
  );
  const [experienceLevel, setExperienceLevel] = useState<
    ExperienceLevel | 'auto'
  >('auto'); // 'auto' lets the AI infer it
  const [trainingSplit, setTrainingSplit] =
    useState<AIProgramGeneratorInput['preferredTrainingSplit']>('auto');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [injuries, setInjuries] = useState('');

  // AI capability is derived from store profile — no init needed.
  const aiCapability = useAICapability();

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setWizardStep('frequency');
      resetState();
    }
  }, [isOpen, resetState]);

  const handleEquipmentPreset = (presetKey: keyof typeof EQUIPMENT_PRESETS) => {
    setSelectedEquipment([...EQUIPMENT_PRESETS[presetKey].equipment]);
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

    // Streamlined flow (function calling)
    await generateProgramStreamlined({
      trainingDaysPerWeek: trainingDays,
      sessionDurationMinutes: sessionDuration,
      availableEquipment: selectedEquipment,
      goal: profile.goal,
      gender: profile.gender, // Pass gender for gender-specific programming
      // Pass undefined to let AI infer from workout history
      experienceLevel: experienceLevel === 'auto' ? undefined : experienceLevel,
      focusAreas: focusAreas.length > 0 ? focusAreas : undefined,
      injuries: injuries.trim() || undefined,
      preferredTrainingSplit: trainingSplit,
    });
  };

  // Watch for generation completion and transition to review step.
  // On error we stay on the generating step, which shows the retry option.
  useEffect(() => {
    if (
      wizardStep === 'generating' &&
      generatorState.step === 'complete' &&
      generatorState.generatedProgram
    ) {
      setWizardStep('review');
    }
  }, [wizardStep, generatorState.step, generatorState.generatedProgram]);

  const handleSave = async () => {
    setWizardStep('saving');

    // Use auto-activation logic
    const result = await saveProgramWithAutoActivation();

    if (result.programId) {
      setSavedProgramId(result.programId);

      if (result.wasAutoActivated) {
        // Was automatically activated (only program), go directly to program page
        onClose();
        navigate(`/workout/program/${result.programId}`);
      } else {
        // Ask user if they want to set as active
        setWizardStep('activation_prompt');
      }
    }
  };

  const handleActivationChoice = async (activate: boolean) => {
    if (!savedProgramId) return;

    // The program is already saved; only flip the active flag.
    if (activate) await activateProgram(savedProgramId);

    onClose();
    navigate(`/workout/program/${savedProgramId}`);
  };

  const canProceedFromFrequency = trainingDays >= 2 && trainingDays <= 7;
  const canProceedFromGoals = profile !== null;

  // Check prerequisites
  if (!isOnline) {
    return (
      <BlockingNotice
        isOpen={isOpen}
        onClose={onClose}
        title="Internet Connection Required"
      >
        <p className="text-ink-2">
          AI program generation requires an internet connection.
        </p>
      </BlockingNotice>
    );
  }

  if (profile && !profile.ai_api_key) {
    return (
      <BlockingNotice
        isOpen={isOpen}
        onClose={onClose}
        title="API Key Required"
      >
        <p className="text-ink-2 mb-4">
          Please set up your OpenRouter API key in Settings to use AI features.
        </p>
        <Button variant="secondary" onClick={() => navigate('/settings')}>
          Go to Settings
        </Button>
      </BlockingNotice>
    );
  }

  const isBusy = wizardStep === 'generating' || wizardStep === 'saving';
  const currentIndex = isBusy ? 3 : INPUT_STEPS.indexOf(wizardStep);

  const renderNavigation = () => {
    if (isBusy || wizardStep === 'activation_prompt') return null;

    return (
      <div className="flex gap-3 pt-4 mt-6 border-t border-line">
        {currentIndex > 0 && wizardStep !== 'review' && (
          <Button
            variant="secondary"
            onClick={() => setWizardStep(INPUT_STEPS[currentIndex - 1])}
          >
            <ChevronLeft size={18} aria-hidden="true" />
            Back
          </Button>
        )}

        <div className="flex-1" />

        {wizardStep === 'frequency' && (
          <Button
            tone="ink"
            type="button"
            onClick={() => setWizardStep('equipment')}
            disabled={!canProceedFromFrequency}
          >
            Next
            <ChevronRight size={18} aria-hidden="true" />
          </Button>
        )}

        {/* Equipment is optional (bodyweight always available) */}
        {wizardStep === 'equipment' && (
          <Button
            tone="ink"
            type="button"
            onClick={() => setWizardStep('goals')}
          >
            Next
            <ChevronRight size={18} aria-hidden="true" />
          </Button>
        )}

        {wizardStep === 'goals' && (
          <Button
            tone="ink"
            type="button"
            onClick={handleGenerate}
            disabled={
              !canProceedFromGoals || !isOnline || !aiCapability.available
            }
          >
            <Sparkles size={18} aria-hidden="true" />
            Generate Program
          </Button>
        )}

        {wizardStep === 'review' && (
          <>
            <Button variant="secondary" onClick={() => setWizardStep('goals')}>
              <ChevronLeft size={18} aria-hidden="true" />
              Regenerate
            </Button>
            <Button tone="ink" type="button" onClick={handleSave}>
              <Check size={18} aria-hidden="true" />
              Save Program
            </Button>
          </>
        )}
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={STEP_TITLES[wizardStep]}
      size="lg"
    >
      {wizardStep !== 'activation_prompt' && (
        <StepIndicator currentIndex={currentIndex} />
      )}

      {wizardStep === 'frequency' && (
        <FrequencyStep
          trainingDays={trainingDays}
          onTrainingDays={setTrainingDays}
          sessionDuration={sessionDuration}
          onSessionDuration={setSessionDuration}
          trainingSplit={trainingSplit}
          onTrainingSplit={setTrainingSplit}
        />
      )}
      {wizardStep === 'equipment' && (
        <EquipmentStep
          selectedEquipment={selectedEquipment}
          onPreset={handleEquipmentPreset}
          onToggle={toggleEquipment}
        />
      )}
      {wizardStep === 'goals' && (
        <GoalsStep
          profile={profile}
          experienceLevel={experienceLevel}
          onExperienceLevel={setExperienceLevel}
          focusAreas={focusAreas}
          onToggleFocusArea={toggleFocusArea}
          injuries={injuries}
          onInjuries={setInjuries}
        />
      )}
      {wizardStep === 'generating' && (
        <GeneratingStep
          state={generatorState}
          onRetry={() => setWizardStep('goals')}
        />
      )}
      {wizardStep === 'review' && <ReviewStep state={generatorState} />}
      {wizardStep === 'saving' && (
        <SavingStep progress={generatorState.progress} />
      )}
      {wizardStep === 'activation_prompt' && (
        <ActivationPromptStep onChoose={handleActivationChoice} />
      )}

      {renderNavigation()}
    </Modal>
  );
}
