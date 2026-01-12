import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  X,
  Volume2,
  VolumeX,
  Timer,
} from 'lucide-react';
import { Button } from '../ui';

interface RestTimerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  // External state control
  seconds: number;
  setSeconds: (seconds: number | ((prev: number) => number)) => void;
  isRunning: boolean;
  setIsRunning: (running: boolean) => void;
  initialSeconds: number;
  setInitialSeconds: (seconds: number) => void;
}

const PRESET_TIMES = [30, 60, 90, 120, 180];

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

  const playBeep = useCallback(() => {
    try {
      const audioContext = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.3);

      // Play 3 beeps
      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        osc2.connect(gainNode);
        osc2.frequency.value = 800;
        osc2.type = 'sine';
        osc2.start();
        osc2.stop(audioContext.currentTime + 0.3);
      }, 400);

      setTimeout(() => {
        const osc3 = audioContext.createOscillator();
        osc3.connect(gainNode);
        osc3.frequency.value = 1000;
        osc3.type = 'sine';
        osc3.start();
        osc3.stop(audioContext.currentTime + 0.5);
      }, 800);
    } catch {
      // Audio not supported
    }
  }, []);

  // Use ref for playBeep to avoid re-running effect when it changes
  const playBeepRef = useRef(playBeep);
  playBeepRef.current = playBeep;

  // Use timestamp-based timing to handle background/sleep
  const startTimeRef = useRef<number | null>(null);
  const remainingAtStartRef = useRef<number>(seconds);

  useEffect(() => {
    if (isRunning && startTimeRef.current === null) {
      // Timer just started
      startTimeRef.current = Date.now();
      remainingAtStartRef.current = seconds;
    } else if (!isRunning) {
      // Timer paused/stopped
      startTimeRef.current = null;
    }
  }, [isRunning, seconds]);

  useEffect(() => {
    let animationFrame: number;
    let lastUpdate = Date.now();

    const tick = () => {
      if (!isRunning || startTimeRef.current === null) return;

      const now = Date.now();
      const elapsed = Math.floor((now - startTimeRef.current) / 1000);
      const newSeconds = Math.max(0, remainingAtStartRef.current - elapsed);

      // Only update if second changed (avoid unnecessary renders)
      if (now - lastUpdate >= 1000 || newSeconds === 0) {
        lastUpdate = now;
        setSeconds(newSeconds);

        if (newSeconds === 0) {
          setIsRunning(false);
          startTimeRef.current = null;
          // Play sound notification
          if (soundEnabled) {
            playBeepRef.current();
          }
          // Vibrate if supported
          if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 200]);
          }
          return;
        }
      }

      animationFrame = requestAnimationFrame(tick);
    };

    if (isRunning) {
      animationFrame = requestAnimationFrame(tick);
    }

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [isRunning, soundEnabled, setSeconds, setIsRunning]);

  const toggleTimer = () => {
    if (!isRunning) {
      // Starting timer - set new start time
      startTimeRef.current = Date.now();
      remainingAtStartRef.current = seconds;
    }
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setSeconds(initialSeconds);
    startTimeRef.current = null;
  };

  const setPresetTime = (time: number) => {
    setSeconds(time);
    setInitialSeconds(time);
    startTimeRef.current = Date.now();
    remainingAtStartRef.current = time;
    setIsRunning(true);
  };

  const dismissTimer = () => {
    setIsRunning(false);
    setSeconds(initialSeconds);
    startTimeRef.current = null;
    onOpenChange(false);
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = initialSeconds > 0 ? (seconds / initialSeconds) * 100 : 0;
  const isFinished = seconds === 0 && !isRunning;
  const isActive = isRunning || (seconds !== initialSeconds && seconds > 0);

  // Calculate stroke dasharray for circular progress
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress / 100);

  return (
    <>
      {/* Floating Action Button - Always visible */}
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className={`fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
          isFinished
            ? 'bg-green-600 animate-pulse'
            : isRunning
              ? 'bg-blue-600'
              : isActive
                ? 'bg-slate-700'
                : 'bg-slate-700 hover:bg-slate-600'
        }`}
      >
        {isRunning || isActive ? (
          // Show timer countdown with circular progress
          <div className="relative w-12 h-12 flex items-center justify-center">
            <svg
              className="absolute inset-0 w-12 h-12 -rotate-90"
              role="img"
              aria-label={`Rest timer: ${formatTime(seconds)} remaining`}
            >
              {/* Background circle */}
              <circle
                cx="24"
                cy="24"
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="3"
              />
              {/* Progress circle */}
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
              {formatTime(seconds)}
            </span>
          </div>
        ) : (
          // Show timer icon when idle
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
                  {/* Background circle */}
                  <svg
                    className="w-full h-full transform -rotate-90"
                    role="img"
                    aria-label={`Rest timer: ${formatTime(seconds)} remaining`}
                  >
                    <circle
                      cx="64"
                      cy="64"
                      r="58"
                      fill="none"
                      stroke="#334155"
                      strokeWidth="8"
                    />
                    {/* Progress circle */}
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
                      {formatTime(seconds)}
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
                      : `${time / 60}m${time % 60 > 0 ? ` ${time % 60}s` : ''}`}
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
