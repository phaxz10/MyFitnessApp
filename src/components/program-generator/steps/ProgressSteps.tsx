import { Check, Loader2, Sparkles } from 'lucide-react';
import type { GeneratorState } from '../../../hooks/useProgramGenerator';
import { Button } from '../../ui';

// Busy and finished states of the wizard: generating, saving, activation.

interface GeneratingStepProps {
  state: GeneratorState;
  onRetry: () => void;
}

export function GeneratingStep({ state, onRetry }: GeneratingStepProps) {
  const isInferring = state.step === 'inferring_experience';
  const isError = state.step === 'error';

  return (
    <div className="flex flex-col items-center text-center py-10">
      {!isError && (
        <Loader2
          size={40}
          className="text-ink-2 animate-spin mb-4"
          aria-hidden="true"
        />
      )}
      {!isError && (
        <>
          <h3 className="text-lg font-bold text-ink mb-1">
            {isInferring
              ? 'Analyzing Your Experience'
              : 'Creating Your Program'}
          </h3>
          <p className="text-ink-2" aria-live="polite">
            {state.progress}
          </p>
        </>
      )}

      {state.inferredExperience && (
        <div className="mt-4 w-full px-4 py-3 bg-sunken rounded-xl">
          <p className="text-ink text-sm flex items-center justify-center gap-2">
            <Sparkles size={14} aria-hidden="true" />
            Experience detected:{' '}
            <span className="font-semibold capitalize">
              {state.inferredExperience.inferredLevel}
            </span>
          </p>
          <p className="text-ink-2 text-sm mt-1">
            {state.inferredExperience.reasoning}
          </p>
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="mt-4 w-full p-4 bg-danger-soft rounded-xl text-left"
        >
          <p className="font-semibold text-danger">
            The program could not be generated.
          </p>
          <p className="text-ink-2 text-sm mt-1">{state.error}</p>
          <Button variant="secondary" className="mt-3" onClick={onRetry}>
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

export function SavingStep({ progress }: { progress: string }) {
  return (
    <div className="flex flex-col items-center text-center py-10">
      <Loader2
        size={40}
        className="text-ink-2 animate-spin mb-4"
        aria-hidden="true"
      />
      <h3 className="text-lg font-bold text-ink mb-1">Saving Program</h3>
      <p className="text-ink-2" aria-live="polite">
        {progress}
      </p>
    </div>
  );
}

export function ActivationPromptStep({
  onChoose,
}: {
  onChoose: (activate: boolean) => void;
}) {
  return (
    <div className="text-center py-6">
      <span className="grid place-items-center size-14 mx-auto mb-4 rounded-full bg-eat-soft text-eat-ink">
        <Check size={28} aria-hidden="true" />
      </span>
      <h3 className="text-lg font-bold text-ink mb-2">
        Program Saved Successfully!
      </h3>
      <p className="text-ink-2 mb-1">
        Would you like to set this as your active program?
      </p>
      <p className="text-ink-3 text-sm mb-6">
        Your active program appears on the home screen for quick access to your
        workouts.
      </p>
      <div className="flex gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => onChoose(false)}
        >
          Not Now
        </Button>
        <Button className="flex-1" onClick={() => onChoose(true)}>
          <Check size={18} aria-hidden="true" />
          Set as Active
        </Button>
      </div>
    </div>
  );
}
