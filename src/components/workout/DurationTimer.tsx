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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="w-full max-w-sm bg-slate-800 rounded-2xl p-6">
        <div className="text-center mb-6">
          <p className="text-slate-400 text-sm mb-2">
            Target: {formatTimerDisplay(targetSeconds)}
          </p>
          <p
            className={`text-5xl font-mono font-bold ${isOverTarget ? 'text-green-400' : 'text-white'}`}
          >
            {formatTimerDisplay(seconds)}
          </p>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-slate-700 rounded-full mb-6 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${isOverTarget ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center gap-3 mb-6">
          <label
            htmlFor="duration-ring-interval"
            className="text-sm text-slate-400"
          >
            Ring every
          </label>
          <Input
            id="duration-ring-interval"
            type="number"
            min={0}
            inputMode="numeric"
            value={ringIntervalSeconds === 0 ? '' : ringIntervalSeconds}
            onChange={(event) => handleRingIntervalChange(event.target.value)}
            placeholder="Off"
            className="w-20 text-center"
          />
          <span className="text-sm text-slate-400">sec</span>
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              stopAlarm();
              setIsRunning(false);
              setSeconds(0);
              lastRingSecondRef.current = null;
            }}
          >
            <RotateCcw size={18} className="mr-2" />
            Reset
          </Button>

          {!isRunning ? (
            <Button className="flex-1" onClick={() => setIsRunning(true)}>
              <Play size={18} className="mr-2" />
              {seconds > 0 ? 'Resume' : 'Start'}
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIsRunning(false)}
            >
              <Pause size={18} className="mr-2" />
              Pause
            </Button>
          )}
        </div>

        <div className="flex gap-3 mt-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              stopAlarm();
              onCancel();
            }}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-green-600 hover:bg-green-700"
            onClick={() => {
              stopAlarm();
              setIsRunning(false);
              onComplete(seconds);
            }}
            disabled={seconds === 0}
          >
            <Check size={18} className="mr-2" />
            Complete
          </Button>
        </div>
      </div>
    </div>
  );
}
