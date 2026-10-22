import { AlertCircle, ChevronDown, Info, Sparkles } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_PRESETS,
  EXPERIENCE_LEVELS,
  MUSCLE_GROUPS,
  TRAINING_SPLITS,
} from '../../constants/equipment';
import { useAppStore } from '../../hooks/useAppStore';
import { useProfile } from '../../hooks/useProfile';
import {
  type GeneratedDraft,
  useProgramGenerator,
} from '../../hooks/useProgramGenerator';
import { useAICapability } from '../../services/ai/useAICapability';
import type {
  AIProgramGeneratorInput,
  EquipmentType,
  ExperienceLevel,
} from '../../types';
import { ToggleChip } from '../training/ToggleChip';
import { Button, Modal, TextArea } from '../ui';
import { NumberOption, OptionButton } from './OptionButton';

// One sheet, no steps: the free-text request is the main lever, the rest are
// quick taps. The result is a draft for the editor; nothing is saved here.

type Split = AIProgramGeneratorInput['preferredTrainingSplit'];

interface GeneratorInputs {
  days: number;
  minutes: number;
  equipment: EquipmentType[];
  split: Split;
  experience: ExperienceLevel | 'auto';
  focusAreas: string[];
  injuries: string;
}

const STORAGE_KEY = 'mpf.programGenerator.lastInputs';
const DAY_CHOICES = [2, 3, 4, 5, 6, 7];
const MINUTE_CHOICES = [30, 45, 60, 75, 90];
const DEFAULT_INPUTS: GeneratorInputs = {
  days: 4,
  minutes: 60,
  equipment: [],
  split: 'auto',
  experience: 'auto',
  focusAreas: [],
  injuries: '',
};

function loadInputs(): GeneratorInputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_INPUTS;
    const saved = JSON.parse(raw) as Partial<GeneratorInputs>;
    return {
      ...DEFAULT_INPUTS,
      ...saved,
      days: DAY_CHOICES.includes(saved.days ?? 0)
        ? (saved.days as number)
        : DEFAULT_INPUTS.days,
      minutes: MINUTE_CHOICES.includes(saved.minutes ?? 0)
        ? (saved.minutes as number)
        : DEFAULT_INPUTS.minutes,
      equipment: Array.isArray(saved.equipment) ? saved.equipment : [],
      focusAreas: Array.isArray(saved.focusAreas) ? saved.focusAreas : [],
    };
  } catch {
    return DEFAULT_INPUTS;
  }
}

function storeInputs(inputs: GeneratorInputs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  } catch {
    // Private mode or storage full: just don't remember.
  }
}

function sameSet<T>(a: readonly T[], b: readonly T[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function Disclosure({
  label,
  open,
  onToggle,
  controls,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 h-11 -mx-2 px-2 rounded-lg text-sm font-semibold text-ink-2 hover:text-ink hover:bg-sunken"
    >
      {label}
      <ChevronDown
        size={16}
        aria-hidden="true"
        className={`transition-transform ${open ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

function FieldGroup({
  legend,
  children,
}: {
  legend: string;
  children: ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink-2 mb-1.5">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

interface GenerateProgramModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Apply the draft to the editor; throwing keeps the sheet open. */
  onGenerated: (draft: GeneratedDraft) => Promise<void>;
}

export function GenerateProgramModal({
  isOpen,
  onClose,
  onGenerated,
}: GenerateProgramModalProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const isOnline = useAppStore((state) => state.isOnline);
  const aiCapability = useAICapability();
  const { state, generate, reset } = useProgramGenerator();

  const [request, setRequest] = useState('');
  const [inputs, setInputs] = useState<GeneratorInputs>(loadInputs);
  const [showEquipment, setShowEquipment] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      reset();
      setApplyError(null);
    }
  }, [isOpen, reset]);

  const set = <K extends keyof GeneratorInputs>(
    key: K,
    value: GeneratorInputs[K],
  ) => setInputs((prev) => ({ ...prev, [key]: value }));

  const toggleEquipment = (item: EquipmentType) =>
    set(
      'equipment',
      inputs.equipment.includes(item)
        ? inputs.equipment.filter((e) => e !== item)
        : [...inputs.equipment, item],
    );

  const toggleFocusArea = (area: string) =>
    set(
      'focusAreas',
      inputs.focusAreas.includes(area)
        ? inputs.focusAreas.filter((a) => a !== area)
        : inputs.focusAreas.length < 2
          ? [...inputs.focusAreas, area]
          : inputs.focusAreas,
    );

  const isGenerating =
    state.step === 'generating_program' ||
    state.step === 'inferring_experience';
  const isBusy = isGenerating || isApplying;
  const error = state.error ?? applyError;

  const blocker: { title: string; body: string; settings: boolean } | null =
    !isOnline
      ? {
          title: 'You are offline',
          body: 'Generating a program needs an internet connection. Connect and try again.',
          settings: false,
        }
      : !profile
        ? {
            title: 'Set up your profile first',
            body: 'The AI uses your goal and gender to shape the program.',
            settings: true,
          }
        : !aiCapability.available
          ? {
              title: 'Add an AI key',
              body: 'Add your OpenRouter API key in Settings to use AI features.',
              settings: true,
            }
          : null;

  const handleGenerate = async () => {
    if (!profile || blocker || isBusy) return;
    storeInputs(inputs);
    setApplyError(null);
    const draft = await generate({
      notes: request.trim() || undefined,
      trainingDaysPerWeek: inputs.days,
      sessionDurationMinutes: inputs.minutes,
      availableEquipment: inputs.equipment,
      goal: profile.goal,
      gender: profile.gender,
      experienceLevel:
        inputs.experience === 'auto' ? undefined : inputs.experience,
      focusAreas: inputs.focusAreas.length > 0 ? inputs.focusAreas : undefined,
      injuries: inputs.injuries.trim() || undefined,
      preferredTrainingSplit: inputs.split,
    });
    if (!draft) return;

    setIsApplying(true);
    try {
      await onGenerated(draft);
      setRequest('');
    } catch (err) {
      setApplyError(
        err instanceof Error ? err.message : 'Could not apply the program.',
      );
    } finally {
      setIsApplying(false);
    }
  };

  const close = () => {
    if (!isBusy) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Generate program" size="lg">
      <div className="space-y-5">
        {blocker && (
          <div
            role="alert"
            className="flex gap-3 p-4 rounded-xl bg-warn-soft text-warn"
          >
            <AlertCircle size={20} className="shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">{blocker.title}</p>
              <p className="text-sm text-ink-2 mt-0.5">{blocker.body}</p>
              {blocker.settings && (
                <Button
                  variant="secondary"
                  className="mt-3"
                  onClick={() => navigate('/settings')}
                >
                  Go to Settings
                </Button>
              )}
            </div>
          </div>
        )}

        <fieldset disabled={isBusy} className="space-y-5 min-w-0">
          <TextArea
            id="generate-request"
            label="What do you want?"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="e.g. Build muscle, 4 days, home gym with dumbbells and a bench, keep my left knee happy"
            rows={3}
          />

          <FieldGroup legend="Days per week">
            <div className="grid grid-cols-6 gap-2">
              {DAY_CHOICES.map((days) => (
                <NumberOption
                  key={days}
                  selected={inputs.days === days}
                  onSelect={() => set('days', days)}
                >
                  {days}
                </NumberOption>
              ))}
            </div>
          </FieldGroup>

          <FieldGroup legend="Session length (minutes)">
            <div className="grid grid-cols-5 gap-2">
              {MINUTE_CHOICES.map((minutes) => (
                <NumberOption
                  key={minutes}
                  selected={inputs.minutes === minutes}
                  onSelect={() => set('minutes', minutes)}
                >
                  {minutes}
                </NumberOption>
              ))}
            </div>
          </FieldGroup>

          <FieldGroup legend="Equipment">
            <div className="flex flex-wrap gap-2">
              {Object.values(EQUIPMENT_PRESETS).map((preset) => (
                <ToggleChip
                  key={preset.label}
                  selected={sameSet(inputs.equipment, preset.equipment)}
                  onToggle={() => set('equipment', [...preset.equipment])}
                >
                  {preset.label}
                </ToggleChip>
              ))}
            </div>
            <p className="text-sm text-ink-3 mt-2" aria-live="polite">
              {inputs.equipment.length === 0 ? (
                'Bodyweight and resistance bands only'
              ) : (
                <>
                  <span className="num">{inputs.equipment.length}</span>{' '}
                  {inputs.equipment.length === 1 ? 'item' : 'items'} plus
                  bodyweight and bands
                </>
              )}
            </p>
            <Disclosure
              label="Edit equipment"
              open={showEquipment}
              onToggle={() => setShowEquipment((v) => !v)}
              controls="generate-equipment"
            />
            {showEquipment && (
              <div id="generate-equipment" className="space-y-3 pt-1">
                {Object.entries(EQUIPMENT_CATEGORIES).map(([key, category]) => (
                  <div key={key}>
                    <p className="text-sm text-ink-3 mb-1.5">
                      {category.label}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {category.items.map((item) => (
                        <ToggleChip
                          key={item}
                          selected={inputs.equipment.includes(item)}
                          onToggle={() => toggleEquipment(item)}
                        >
                          {item}
                        </ToggleChip>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="flex items-center gap-1.5 text-sm text-ink-3">
                  <Info size={14} aria-hidden="true" />
                  Bodyweight and resistance bands are always available
                </p>
              </div>
            )}
          </FieldGroup>

          <div>
            <Disclosure
              label="More options"
              open={showMore}
              onToggle={() => setShowMore((v) => !v)}
              controls="generate-more"
            />
            {showMore && (
              <div id="generate-more" className="space-y-5 pt-2">
                <FieldGroup legend="Split">
                  <div className="space-y-2">
                    {(
                      Object.entries(TRAINING_SPLITS) as [
                        NonNullable<Split>,
                        (typeof TRAINING_SPLITS)[keyof typeof TRAINING_SPLITS],
                      ][]
                    ).map(([key, split]) => (
                      <OptionButton
                        key={key}
                        selected={inputs.split === key}
                        onSelect={() => set('split', key)}
                        title={split.label}
                        description={split.description}
                      />
                    ))}
                  </div>
                </FieldGroup>

                <FieldGroup legend="Experience">
                  <div className="grid grid-cols-2 gap-2">
                    <OptionButton
                      selected={inputs.experience === 'auto'}
                      onSelect={() => set('experience', 'auto')}
                      title="Auto"
                      description="From your workout history"
                    />
                    {(
                      Object.entries(EXPERIENCE_LEVELS) as [
                        ExperienceLevel,
                        { label: string; description: string },
                      ][]
                    ).map(([key, level]) => (
                      <OptionButton
                        key={key}
                        selected={inputs.experience === key}
                        onSelect={() => set('experience', key)}
                        title={level.label}
                      />
                    ))}
                  </div>
                </FieldGroup>

                <FieldGroup legend="Focus areas (up to 2)">
                  <div className="flex flex-wrap gap-2">
                    {MUSCLE_GROUPS.map((muscle) => (
                      <ToggleChip
                        key={muscle}
                        selected={inputs.focusAreas.includes(muscle)}
                        onToggle={() => toggleFocusArea(muscle)}
                      >
                        {muscle}
                      </ToggleChip>
                    ))}
                  </div>
                </FieldGroup>

                <TextArea
                  id="generate-injuries"
                  label="Injuries or limitations"
                  value={inputs.injuries}
                  onChange={(e) => set('injuries', e.target.value)}
                  placeholder="e.g. bad shoulder, lower back issues"
                  rows={2}
                />
              </div>
            )}
          </div>
        </fieldset>

        {isBusy && (
          <p className="text-sm text-ink-2" aria-live="polite">
            {isApplying
              ? 'Adding exercises to your library...'
              : state.progress}
          </p>
        )}

        {error && !isBusy && (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-danger">
              The program could not be generated: {error}
            </p>
            <Button variant="secondary" onClick={handleGenerate}>
              Try again
            </Button>
          </div>
        )}

        <Button
          tone="ink"
          size="lg"
          className="w-full"
          isLoading={isBusy}
          disabled={!!blocker}
          onClick={handleGenerate}
        >
          {!isBusy && <Sparkles size={20} aria-hidden="true" />}
          Generate
        </Button>
      </div>
    </Modal>
  );
}
