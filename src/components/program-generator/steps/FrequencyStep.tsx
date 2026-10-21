import { Calendar, Clock, Dumbbell } from 'lucide-react';
import { TRAINING_SPLITS } from '../../../constants/equipment';
import type { AIProgramGeneratorInput } from '../../../types';
import { NumberOption, OptionButton, StepQuestion } from './OptionButton';

type Split = AIProgramGeneratorInput['preferredTrainingSplit'];

interface FrequencyStepProps {
  trainingDays: number;
  onTrainingDays: (days: number) => void;
  sessionDuration: number;
  onSessionDuration: (minutes: number) => void;
  trainingSplit: Split;
  onTrainingSplit: (split: Split) => void;
}

export function FrequencyStep({
  trainingDays,
  onTrainingDays,
  sessionDuration,
  onSessionDuration,
  trainingSplit,
  onTrainingSplit,
}: FrequencyStepProps) {
  return (
    <div className="space-y-6">
      <section>
        <StepQuestion icon={<Calendar size={18} />}>
          Training Days per Week
        </StepQuestion>
        <div className="grid grid-cols-6 gap-2">
          {[2, 3, 4, 5, 6, 7].map((days) => (
            <NumberOption
              key={days}
              selected={trainingDays === days}
              onSelect={() => onTrainingDays(days)}
            >
              {days}
            </NumberOption>
          ))}
        </div>
        <p className="text-ink-2 text-sm mt-2">
          {trainingDays <= 3
            ? 'Great for beginners or busy schedules'
            : trainingDays <= 5
              ? 'Ideal for most goals'
              : 'Advanced - ensure adequate recovery'}
        </p>
      </section>

      <section>
        <StepQuestion icon={<Clock size={18} />}>
          Session Duration (minutes)
        </StepQuestion>
        <div className="grid grid-cols-4 gap-2">
          {[30, 45, 60, 90].map((duration) => (
            <NumberOption
              key={duration}
              selected={sessionDuration === duration}
              onSelect={() => onSessionDuration(duration)}
            >
              {duration}m
            </NumberOption>
          ))}
        </div>
      </section>

      <section>
        <StepQuestion icon={<Dumbbell size={18} />}>
          Training Split
        </StepQuestion>
        <div className="space-y-2">
          {(
            Object.entries(TRAINING_SPLITS) as [
              keyof typeof TRAINING_SPLITS,
              (typeof TRAINING_SPLITS)[keyof typeof TRAINING_SPLITS],
            ][]
          ).map(([key, split]) => (
            <OptionButton
              key={key}
              selected={trainingSplit === key}
              onSelect={() => onTrainingSplit(key)}
              title={split.label}
              description={split.description}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
