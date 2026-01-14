import { Check, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui';

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const progress = Math.min((seconds / targetSeconds) * 100, 100);
  const isOverTarget = seconds >= targetSeconds;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="w-full max-w-sm bg-slate-800 rounded-2xl p-6">
        <div className="text-center mb-6">
          <p className="text-slate-400 text-sm mb-2">
            Target: {formatTime(targetSeconds)}
          </p>
          <p
            className={`text-5xl font-mono font-bold ${isOverTarget ? 'text-green-400' : 'text-white'}`}
          >
            {formatTime(seconds)}
          </p>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-slate-700 rounded-full mb-6 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${isOverTarget ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              setIsRunning(false);
              setSeconds(0);
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
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-green-600 hover:bg-green-700"
            onClick={() => {
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
