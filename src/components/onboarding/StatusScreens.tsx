import { Check, Loader2 } from 'lucide-react';
import { Button } from '../ui';

// Shown while targets are being calculated (deterministic or via AI).
export function CalculatingScreen() {
  return (
    <div
      role="status"
      className="min-h-dvh bg-canvas grid place-items-center px-4"
    >
      <div className="text-center space-y-4">
        <Loader2
          size={48}
          className="text-train animate-spin mx-auto"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Calculating...
          </h1>
          <p className="text-ink-2">Setting up your personalized targets</p>
        </div>
      </div>
    </div>
  );
}

// Final screen: a flat nutrition-green block, then the way in.
export function ReadyScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
      <div className="bg-eat text-on-accent px-4 pb-8 pt-[calc(env(safe-area-inset-top)+4rem)]">
        <div className="max-w-lg mx-auto">
          <Check size={56} strokeWidth={3} aria-hidden="true" />
        </div>
      </div>
      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-8 space-y-1">
        <h1 className="text-4xl font-bold tracking-tight text-ink">
          You're All Set!
        </h1>
        <p className="text-lg text-ink-2">Your fitness journey starts now.</p>
      </main>
      <footer className="w-full max-w-lg mx-auto px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button onClick={onContinue} size="lg" className="w-full">
          Go to Dashboard
        </Button>
      </footer>
    </div>
  );
}
