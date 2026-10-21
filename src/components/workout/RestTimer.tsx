import { Pause, Play, RotateCcw, Timer, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAlarmTone } from '../../hooks/useAlarmTone';
import {
  alarmHaptic,
  cancelRestAlarm,
  scheduleRestAlarm,
} from '../../services/native';
import { formatTimerDisplay } from '../../utils/formatters';
import { Button, Modal } from '../ui';
import { reconcileCountdown } from './restCountdown';

interface RestTimerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  seconds: number;
  setSeconds: (seconds: number | ((prev: number) => number)) => void;
  isRunning: boolean;
  setIsRunning: (running: boolean) => void;
  initialSeconds: number;
  setInitialSeconds: (seconds: number) => void;
}

const PRESET_TIMES = [30, 60, 90, 120, 180];
const EXTEND_SECONDS = 30;

function formatPreset(time: number): string {
  if (time < 60) return `${time}s`;
  const rest = time % 60;
  return `${Math.floor(time / 60)}m${rest > 0 ? ` ${rest}s` : ''}`;
}

export function RestTimer({
  isOpen,
  onOpenChange,
  seconds,
  setSeconds,
  isRunning,
  setIsRunning,
  initialSeconds,
  setInitialSeconds,
}: RestTimerProps) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { isAlarming, startAlarm, stopAlarm } = useAlarmTone();

  const workerRef = useRef<Worker | null>(null);
  const endAtRef = useRef<number | null>(null);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../../workers/timerWorker.ts', import.meta.url),
        { type: 'module' },
      );
    }
    return workerRef.current;
  }, []);

  const scheduleNotification = useCallback((endAt: number) => {
    void scheduleRestAlarm(endAt);
  }, []);

  const cancelNotification = useCallback(() => {
    void cancelRestAlarm();
  }, []);

  const startCountdown = useCallback(
    (durationSeconds: number) => {
      const endAt = Date.now() + durationSeconds * 1000;
      endAtRef.current = endAt;

      scheduleNotification(endAt);

      const worker = getWorker();
      worker.postMessage({ type: 'start', endAt });
    },
    [getWorker, scheduleNotification],
  );

  const stopCountdown = useCallback(() => {
    endAtRef.current = null;
    cancelNotification();
    workerRef.current?.postMessage({ type: 'stop' });
  }, [cancelNotification]);

  // Keep the worker in step with the controlled props: the session page starts
  // a rest by setting isRunning/seconds from outside, which no handler here sees.
  useEffect(() => {
    const command = reconcileCountdown({
      isRunning,
      seconds,
      endAt: endAtRef.current,
      now: Date.now(),
    });
    if (command?.type === 'start') startCountdown(seconds);
    else if (command?.type === 'stop') stopCountdown();
  }, [isRunning, seconds, startCountdown, stopCountdown]);

  // Handle worker messages
  useEffect(() => {
    const worker = getWorker();

    const onMessage = (e: MessageEvent) => {
      if (e.data.type === 'tick') {
        setSeconds(e.data.remaining);
      }

      if (e.data.type === 'finished') {
        endAtRef.current = null;
        cancelNotification();
        setIsRunning(false);
        setSeconds(0);

        if (soundEnabled) {
          startAlarm();
        } else {
          alarmHaptic();
        }
      }
    };

    worker.addEventListener('message', onMessage);
    return () => worker.removeEventListener('message', onMessage);
  }, [
    cancelNotification,
    getWorker,
    setIsRunning,
    setSeconds,
    soundEnabled,
    startAlarm,
  ]);

  // Handle SW notification click → ring in-app
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'rest-timer-ring') return;
      onOpenChange(true);
      if (soundEnabled) {
        startAlarm();
      } else {
        alarmHaptic();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [onOpenChange, soundEnabled, startAlarm]);

  // Catch up when returning from background
  useEffect(() => {
    const handleVisibility = () => {
      if (!endAtRef.current) return;
      if (document.visibilityState !== 'visible') return;

      if (Date.now() >= endAtRef.current && seconds > 0) {
        stopCountdown();
        setIsRunning(false);
        setSeconds(0);
        if (soundEnabled) {
          startAlarm();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    seconds,
    setIsRunning,
    setSeconds,
    soundEnabled,
    startAlarm,
    stopCountdown,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const toggleTimer = () => {
    if (!isRunning) {
      startCountdown(seconds);
    } else {
      stopCountdown();
    }
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    stopAlarm();
    stopCountdown();
    setIsRunning(false);
    setSeconds(initialSeconds);
  };

  const setPresetTime = (time: number) => {
    stopAlarm();
    setSeconds(time);
    setInitialSeconds(time);
    setIsRunning(true);
    startCountdown(time);
  };

  const dismissTimer = () => {
    stopAlarm();
    stopCountdown();
    setIsRunning(false);
    setSeconds(initialSeconds);
    onOpenChange(false);
  };

  // +30s: extend the current rest; restarts the countdown from the new total.
  const extendTimer = () => {
    stopAlarm();
    const next = seconds + EXTEND_SECONDS;
    setSeconds(next);
    if (isRunning || seconds === 0) {
      setIsRunning(true);
      startCountdown(next);
    }
  };

  const progress =
    initialSeconds > 0 ? Math.min(100, (seconds / initialSeconds) * 100) : 0;
  const isFinished = seconds === 0 && !isRunning;
  const isActive = isRunning || (seconds !== initialSeconds && seconds > 0);
  const isOver = isAlarming || isFinished;

  return (
    <>
      {/* Docked rest bar: always in thumb reach at the bottom edge */}
      <div className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
        <div
          className={`relative mx-auto max-w-lg border-t ${
            isOver
              ? 'border-train bg-train text-on-accent'
              : 'border-line bg-surface text-ink'
          }`}
        >
          {isActive && !isOver && (
            <div
              className="absolute inset-x-0 top-0 h-1 bg-sunken-strong"
              aria-hidden="true"
            >
              <div
                className="h-full bg-train transition-[width] duration-1000 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              type="button"
              onClick={() => onOpenChange(true)}
              className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
              aria-label={`Rest timer, ${formatTimerDisplay(seconds)}. Open timer settings`}
            >
              <Timer
                size={22}
                className={isOver ? '' : 'text-train-ink'}
                aria-hidden="true"
              />
              {isOver ? (
                <span className="text-xl font-bold">Rest over</span>
              ) : (
                <span className="flex items-baseline gap-2">
                  <span
                    className={`num text-4xl font-bold leading-none ${
                      isActive ? 'text-ink' : 'text-ink-3'
                    }`}
                    role="timer"
                  >
                    {formatTimerDisplay(seconds)}
                  </span>
                  <span className="text-sm text-ink-2">
                    {isRunning ? 'Rest' : isActive ? 'Paused' : 'Rest timer'}
                  </span>
                </span>
              )}
            </button>

            {isOver ? (
              <>
                <button
                  type="button"
                  onClick={extendTimer}
                  className="num h-12 rounded-xl px-3 text-lg font-bold hover:bg-white/15"
                >
                  +30s
                </button>
                <button
                  type="button"
                  onClick={dismissTimer}
                  className="h-12 rounded-xl bg-surface px-5 text-base font-semibold text-ink"
                >
                  Done
                </button>
              </>
            ) : isActive ? (
              <>
                <Button
                  variant="secondary"
                  onClick={extendTimer}
                  className="num h-12 text-lg"
                >
                  +30s
                </Button>
                <Button onClick={dismissTimer} className="h-12 px-5">
                  Skip
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                onClick={toggleTimer}
                className="h-12"
              >
                <Play size={18} />
                Start
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Timer sheet: presets, pause, reset, sound */}
      <Modal
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        title="Rest Timer"
        size="sm"
      >
        <div className="space-y-5">
          <div className="text-center">
            <p
              className={`num text-7xl font-bold leading-none ${
                isOver ? 'text-train-ink' : 'text-ink'
              }`}
              role="timer"
            >
              {formatTimerDisplay(seconds)}
            </p>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-sunken-strong"
              aria-hidden="true"
            >
              <div
                className="h-full bg-train transition-[width] duration-1000 ease-linear"
                style={{ width: `${isOver ? 100 : progress}%` }}
              />
            </div>
          </div>

          {isFinished ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="lg"
                onClick={extendTimer}
                className="num"
              >
                +30s
              </Button>
              <Button size="lg" onClick={dismissTimer}>
                Done
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                size="lg"
                onClick={extendTimer}
                className="num"
              >
                +30s
              </Button>
              <Button
                size="lg"
                variant={isRunning ? 'secondary' : 'primary'}
                onClick={toggleTimer}
              >
                {isRunning ? (
                  <Pause
                    size={20}
                    fill="currentColor"
                    strokeWidth={0}
                    className="shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <Play size={20} className="shrink-0" aria-hidden="true" />
                )}
                {isRunning ? 'Pause' : 'Start'}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={resetTimer}
                aria-label="Reset timer"
              >
                <RotateCcw size={20} aria-hidden="true" />
              </Button>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold text-ink-2">Rest length</p>
            <div className="grid grid-cols-5 gap-1 rounded-xl bg-sunken p-1">
              {PRESET_TIMES.map((time) => {
                const selected = initialSeconds === time && !isFinished;
                return (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setPresetTime(time)}
                    aria-pressed={selected}
                    className={`num h-11 rounded-lg text-base font-semibold transition-colors ${
                      selected
                        ? 'bg-train text-on-accent'
                        : 'text-ink-2 hover:bg-surface hover:text-ink'
                    }`}
                  >
                    {formatPreset(time)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-3">
            <Button
              variant="ghost"
              onClick={() => setSoundEnabled(!soundEnabled)}
              aria-pressed={soundEnabled}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              {soundEnabled ? 'Sound on' : 'Sound off'}
            </Button>
            {isActive && !isFinished && (
              <Button variant="ghost" onClick={dismissTimer}>
                Skip rest
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
