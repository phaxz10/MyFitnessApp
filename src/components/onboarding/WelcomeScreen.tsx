import { Upload } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '../ui';

// The three disciplines as a flat Munich '72 colour band.
const DISCIPLINES = [
  { label: 'Train', fill: 'bg-train' },
  { label: 'Eat', fill: 'bg-eat' },
  { label: 'Body', fill: 'bg-body' },
] as const;

interface WelcomeScreenProps {
  onStart: () => void;
  onRestoreFile: (file: File) => void;
  isRestoring: boolean;
  error: string | null;
}

export function WelcomeScreen({
  onStart,
  onRestoreFile,
  isRestoring,
  error,
}: WelcomeScreenProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
      <div className="grid grid-cols-3" aria-hidden="true">
        {DISCIPLINES.map(({ label, fill }) => (
          <div
            key={label}
            className={`${fill} text-on-accent flex items-end px-4 pb-3 pt-[calc(env(safe-area-inset-top)+5rem)] text-lg font-bold`}
          >
            {label}
          </div>
        ))}
      </div>

      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-8 flex flex-col justify-center gap-4">
        <h1 className="text-4xl font-bold tracking-tight text-ink">
          MyPersonalFitness
        </h1>
        <p className="text-lg text-ink-2">
          Free and offline. Your data stays in your browser. Bring your own AI
          key via OpenRouter.
        </p>
      </main>

      <footer className="w-full max-w-lg mx-auto px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3">
        <Button onClick={onStart} size="lg" className="w-full">
          Get Started
        </Button>

        <div className="border-t border-line pt-3 space-y-2">
          <p className="text-ink-2 text-sm text-center">
            Used MyPersonalFitness before?
          </p>
          <Button
            variant="secondary"
            onClick={() => fileInput.current?.click()}
            size="lg"
            className="w-full"
            isLoading={isRestoring}
          >
            <Upload size={18} aria-hidden="true" />
            Restore from a backup file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onRestoreFile(file);
            }}
          />
          {error && (
            <p role="alert" className="text-danger text-sm text-center">
              {error}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
