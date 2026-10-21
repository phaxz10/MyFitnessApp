import { Sparkles, Target } from 'lucide-react';
import { EXPERIENCE_LEVELS, MUSCLE_GROUPS } from '../../../constants/equipment';
import type { ExperienceLevel, UserProfile } from '../../../types';
import { ToggleChip } from '../../training/ToggleChip';
import { TextArea } from '../../ui';
import { OptionButton, StepQuestion } from './OptionButton';

interface GoalsStepProps {
  profile: UserProfile | null;
  experienceLevel: ExperienceLevel | 'auto';
  onExperienceLevel: (level: ExperienceLevel | 'auto') => void;
  focusAreas: string[];
  onToggleFocusArea: (area: string) => void;
  injuries: string;
  onInjuries: (value: string) => void;
}

export function GoalsStep({
  profile,
  experienceLevel,
  onExperienceLevel,
  focusAreas,
  onToggleFocusArea,
  injuries,
  onInjuries,
}: GoalsStepProps) {
  return (
    <div className="space-y-6">
      <section>
        <StepQuestion>Experience Level</StepQuestion>
        <div className="space-y-2">
          <OptionButton
            selected={experienceLevel === 'auto'}
            onSelect={() => onExperienceLevel('auto')}
            title={
              <span className="flex items-center gap-2">
                <Sparkles size={16} aria-hidden="true" />
                Auto-Detect
              </span>
            }
            description="AI will analyze your workout history to determine your level"
          />
          {(
            Object.entries(EXPERIENCE_LEVELS) as [
              ExperienceLevel,
              { label: string; description: string },
            ][]
          ).map(([key, level]) => (
            <OptionButton
              key={key}
              selected={experienceLevel === key}
              onSelect={() => onExperienceLevel(key)}
              title={level.label}
              description={level.description}
            />
          ))}
        </div>
      </section>

      {profile && (
        <section>
          <StepQuestion icon={<Target size={18} />}>Your Goal</StepQuestion>
          <div className="px-4 py-3 bg-sunken rounded-xl">
            <p className="font-semibold text-ink capitalize">
              {profile.goal.replace(/_/g, ' ')}
            </p>
            <p className="text-ink-2 text-sm">Based on your profile settings</p>
          </div>
        </section>
      )}

      <section>
        <StepQuestion>Focus Areas (Optional)</StepQuestion>
        <p className="text-ink-2 text-sm -mt-1 mb-3">
          Select up to 2 muscle groups to prioritize
        </p>
        <div className="flex flex-wrap gap-2">
          {MUSCLE_GROUPS.map((muscle) => (
            <ToggleChip
              key={muscle}
              selected={focusAreas.includes(muscle)}
              onToggle={() => onToggleFocusArea(muscle)}
            >
              {muscle}
            </ToggleChip>
          ))}
        </div>
      </section>

      <TextArea
        id="injuries-input"
        label="Injuries or Limitations (Optional)"
        value={injuries}
        onChange={(e) => onInjuries(e.target.value)}
        placeholder="e.g., bad shoulder, lower back issues..."
        rows={2}
      />
    </div>
  );
}
