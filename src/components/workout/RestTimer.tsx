import {
  Pause,
  Play,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAlarmTone } from '../../hooks/useAlarmTone';
import { formatTimerDisplay } from '../../utils/formatters';
import { Button } from '../ui';

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

function sendToSW(message: { type: string; endAt?: number }) {
  navigator.serviceWorker?.ready.then((reg) => {
    reg.active?.postMessage(message);
  });
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

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  const scheduleNotification = useCallback((endAt: number) => {
    sendToSW({ type: 'schedule-notification', endAt });
  }, []);

  const cancelNotification = useCallback(() => {
    sendToSW({ type: 'cancel-notification' });
  }, []);

  const startCountdown = useCallback(
    (durationSeconds: number) => {
      const endAt = Date.now() + durationSeconds * 1000;
      endAtRef.current = endAt;

      requestNotificationPermission();
      scheduleNotification(endAt);

      const worker = getWorker();
      worker.postMessage({ type: 'start', endAt });
    },
    [getWorker, requestNotificationPermission, scheduleNotification],
  );

  const stopCountdown = useCallback(() => {
    endAtRef.current = null;
    cancelNotification();
    workerRef.current?.postMessage({ type: 'stop' });
  }, [cancelNotification]);

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
        } else if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200, 100, 200]);
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
      } else if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
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

  const progress = initialSeconds > 0 ? (seconds / initialSeconds) * 100 : 0;
  const isFinished = seconds === 0 && !isRunning;
  const isActive = isRunning || (seconds !== initialSeconds && seconds > 0);

  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress / 100);

  const handleFabClick = () => {
    if (isAlarming) {
      dismissTimer();
    } else {
      onOpenChange(true);
    }
  };

  return (
    <>
      {/* Floating Action Button - Always visible */}
      <button
        type="button"
        onClick={handleFabClick}
        className={`fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
          isAlarming
            ? 'bg-green-600 animate-pulse ring-4 ring-green-400/50'
            : isFinished
              ? 'bg-green-600 animate-pulse'
              : isRunning
                ? 'bg-blue-600'
                : isActive
                  ? 'bg-slate-700'
                  : 'bg-slate-700 hover:bg-slate-600'
        }`}
      >
        {isAlarming ? (
          <span className="text-white font-bold text-xs">TAP</span>
        ) : isRunning || isActive ? (
          <div className="relative w-12 h-12 flex items-center justify-center">
            <svg
              className="absolute inset-0 w-12 h-12 -rotate-90"
              viewBox="-1 -1 50.5 50.5"
              role="img"
              aria-label={`Rest timer: ${formatTimerDisplay(seconds)} remaining`}
            >
              <circle
                cx="24"
                cy="24"
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="3"
              />
              <circle
                cx="24"
                cy="24"
                r={radius}
                fill="none"
                stroke={isFinished ? '#22c55e' : '#ffffff'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000"
              />
            </svg>
            <span className="text-white font-mono text-xs font-bold">
              {formatTimerDisplay(seconds)}
            </span>
          </div>
        ) : (
          <Timer size={24} className="text-white" />
        )}
      </button>

      {/* Full Timer Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm">
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">Rest Timer</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className="p-2 text-slate-400 hover:text-white transition-colors"
                  >
                    {soundEnabled ? (
                      <Volume2 size={18} />
                    ) : (
                      <VolumeX size={18} />
                    )}
                  </button>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="p-2 text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Timer Display */}
              <div
                className={`relative flex items-center justify-center mb-4 ${isFinished ? 'animate-pulse' : ''}`}
              >
                <div className="w-32 h-32 relative">
                  <svg
                    className="w-full h-full transform -rotate-90"
                    viewBox="0 0 128 128"
                    role="img"
                    aria-label={`Rest timer: ${formatTimerDisplay(seconds)} remaining`}
                  >
                    <circle
                      cx="64"
                      cy="64"
                      r="58"
                      fill="none"
                      stroke="#334155"
                      strokeWidth="8"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="58"
                      fill="none"
                      stroke={isFinished ? '#22c55e' : '#3b82f6'}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 58}`}
                      strokeDashoffset={`${2 * Math.PI * 58 * (1 - progress / 100)}`}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className={`text-3xl font-mono font-bold ${isFinished ? 'text-green-400' : 'text-white'}`}
                    >
                      {formatTimerDisplay(seconds)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex justify-center gap-3 mb-4">
                {isFinished ? (
                  <Button
                    onClick={dismissTimer}
                    variant="primary"
                    className="w-32"
                  >
                    Done
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={toggleTimer}
                      variant={isRunning ? 'secondary' : 'primary'}
                      className="w-24"
                    >
                      {isRunning ? <Pause size={18} /> : <Play size={18} />}
                      <span className="ml-2">
                        {isRunning ? 'Pause' : 'Start'}
                      </span>
                    </Button>
                    <Button onClick={resetTimer} variant="secondary">
                      <RotateCcw size={18} />
                    </Button>
                  </>
                )}
              </div>

              {/* Presets */}
              <div className="flex flex-wrap justify-center gap-2">
                {PRESET_TIMES.map((time) => (
                  <button
                    key={time}
                    onClick={() => setPresetTime(time)}
                    className={`px-3 py-1 rounded-full text-sm transition-colors
                      ${
                        initialSeconds === time && !isFinished
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                  >
                    {time < 60
                      ? `${time}s`
                      : `${Math.floor(time / 60)}m${time % 60 > 0 ? ` ${time % 60}s` : ''}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
