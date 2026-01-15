import { useCallback, useEffect, useRef, useState } from 'react';

type AlarmToneOptions = {
  volume?: number;
  loopIntervalMs?: number;
};

type WebkitAudioContextWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function useAlarmTone(options: AlarmToneOptions = {}) {
  const { volume = 0.4, loopIntervalMs = 1500 } = options;
  const [isAlarming, setIsAlarming] = useState(false);
  const alarmIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (
      !audioContextRef.current ||
      audioContextRef.current.state === 'closed'
    ) {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as WebkitAudioContextWindow).webkitAudioContext;
      if (!AudioContextConstructor) return null;
      audioContextRef.current = new AudioContextConstructor();
    }
    return audioContextRef.current;
  }, []);

  const playTone = useCallback(
    (
      audioContext: AudioContext,
      frequency: number,
      startOffset: number,
      duration: number,
      gainLevel: number,
    ) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      const startTime = audioContext.currentTime + startOffset;
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(gainLevel, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    },
    [],
  );

  const playAlarmBeep = useCallback(() => {
    try {
      const audioContext = getAudioContext();
      if (!audioContext) return;
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      playTone(audioContext, 1174, 0, 0.18, volume);
      playTone(audioContext, 1568, 0.22, 0.18, volume * 0.9);
      playTone(audioContext, 1976, 0.44, 0.24, volume * 0.8);
    } catch {
      // Audio not supported
    }
  }, [getAudioContext, playTone, volume]);

  const startAlarm = useCallback(() => {
    if (alarmIntervalRef.current) return;

    setIsAlarming(true);
    playAlarmBeep();

    alarmIntervalRef.current = window.setInterval(() => {
      playAlarmBeep();
    }, loopIntervalMs);

    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 300]);
    }
  }, [loopIntervalMs, playAlarmBeep]);

  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }

    setIsAlarming(false);

    if (navigator.vibrate) {
      navigator.vibrate(0);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
      }
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== 'closed'
      ) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return { isAlarming, playAlarmBeep, startAlarm, stopAlarm };
}
