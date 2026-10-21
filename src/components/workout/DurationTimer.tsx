import { Check, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAlarmTone } from '../../hooks/useAlarmTone';
import { formatTimerDisplay } from '../../utils/formatters';
import { Button, Input } from '../ui';

interface DurationTimerProps {
  targetSeconds: number;
  onComplete: (actualSeconds: number) => void;
  onCancel: () => void;
}

export function DurationTimer({
  targetSeconds,
  onComplete,
  onCancel,
}: DurationTimerProps) {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [ringIntervalSeconds, setRingIntervalSeconds] = useState(0);
  const { isAlarming, playAlarmBeep, startAlarm, stopAlarm } = useAlarmTone();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRingSecondRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      lastRingSecondRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning || ringIntervalSeconds <= 0) return;
    if (seconds === 0 || seconds >= targetSeconds) return;

    if (
      seconds % ringIntervalSeconds === 0 &&
      lastRingSecondRef.current !== seconds
    ) {
      playAlarmBeep();
      lastRingSecondRef.current = seconds;
    }
  }, [isRunning, playAlarmBeep, ringIntervalSeconds, seconds, targetSeconds]);

  useEffect(() => {
    if (targetSeconds <= 0) return;

    if (seconds >= targetSeconds) {
      if (!isAlarming) startAlarm();
    } else if (isAlarming) {
      stopAlarm();
    }
  }, [isAlarming, seconds, startAlarm, stopAlarm, targetSeconds]);

  const handleRingIntervalChange = (value: string) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      setRingIntervalSeconds(0);
      return;
    }
    setRingIntervalSeconds(Math.max(0, Math.floor(parsed)));
  };

  const progress = Math.min((seconds / targetSeconds) * 100, 100);
  const isOverTarget = seconds >= targetSeconds;

  const reset = () => {
    stopAlarm();
    setIsRunning(false);
    setSeconds(0);
    lastRingSecondRef.current = null;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hold timer"
      className="fixed inset-0 z-50 flex flex-col bg-canvas pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Hold</h2>
          <p className="text-sm text-ink-2">
            Target{' '}
            <span className="num text-lg font-bold text-ink">
              {formatTimerDisplay(targetSeconds)}
            </span>
          </p>
        </div>

        {/* Count-up display */}
        <div className="flex flex-1 flex-col justify-center">
          <p
            role="timer"
            className={`num text-center text-8xl font-bold leading-none ${
              isOverTarget ? 'text-train-ink' : 'text-ink'
            }`}
          >
            {formatTimerDisplay(seconds)}
          </p>
          <div
            className="mt-6 h-2 overflow-hidden rounded-full bg-sunken-strong"
            aria-hidden="true"
          >
            <div
              className="h-full bg-train transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {isOverTarget && (
            <p className="mt-3 text-center text-base font-semibold text-train-ink">
              Target reached
            </p>
          )}
        </div>

        {/* Controls in thumb reach */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label
              htmlFor="duration-ring-interval"
              className="text-sm text-ink-2"
            >
              Ring every
            </label>
            <div className="w-20">
              <Input
                id="duration-ring-interval"
                type="number"
                min={0}
                inputMode="numeric"
                value={ringIntervalSeconds === 0 ? '' : ringIntervalSeconds}
                onChange={(event) =>
                  handleRingIntervalChange(event.target.value)
                }
                placeholder="Off"
                className="num text-center"
              />
            </div>
            <span className="text-sm text-ink-2">sec</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" onClick={reset}>
              <RotateCcw size={18} />
              Reset
            </Button>
            {!isRunning ? (
              <Button size="lg" onClick={() => setIsRunning(true)}>
                <Play size={18} />
                {seconds > 0 ? 'Resume' : 'Start'}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setIsRunning(false)}
              >
                <Pause size={18} />
                Pause
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                stopAlarm();
                onCancel();
              }}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={() => {
                stopAlarm();
                setIsRunning(false);
                onComplete(seconds);
              }}
              disabled={seconds === 0}
            >
              <Check size={18} />
              Complete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
