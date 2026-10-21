import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { KeepAwake } from '@capacitor-community/keep-awake';

// Native capabilities behind one seam. In the iOS/Android shell these use
// Capacitor plugins (OS-scheduled alarms that fire with the app locked or
// killed, real haptics, screen wake lock). In the browser/PWA every call
// falls back to the web equivalent, so callers never branch on platform.

export const isNative = () => Capacitor.isNativePlatform();

const REST_ALARM_ID = 1001;

function postToSW(message: { type: string; endAt?: number }) {
  navigator.serviceWorker?.ready.then((reg) =>
    reg.active?.postMessage(message),
  );
}

/** Schedules the "rest over" alarm for `endAt` (epoch ms), replacing any pending one. */
export async function scheduleRestAlarm(endAt: number): Promise<void> {
  if (!isNative()) {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    postToSW({ type: 'schedule-notification', endAt });
    return;
  }
  const { display } = await LocalNotifications.requestPermissions();
  if (display !== 'granted') return;
  await LocalNotifications.cancel({ notifications: [{ id: REST_ALARM_ID }] });
  await LocalNotifications.schedule({
    notifications: [
      {
        id: REST_ALARM_ID,
        title: 'Rest over',
        body: 'Time for your next set.',
        schedule: { at: new Date(endAt), allowWhileIdle: true },
        sound: undefined, // platform default alert sound
      },
    ],
  });
}

export async function cancelRestAlarm(): Promise<void> {
  if (!isNative()) {
    postToSW({ type: 'cancel-notification' });
    return;
  }
  await LocalNotifications.cancel({ notifications: [{ id: REST_ALARM_ID }] });
}

/** Strong buzz when rest ends with the app open. */
export function alarmHaptic(): void {
  if (isNative()) {
    void Haptics.notification({ type: NotificationType.Warning });
    return;
  }
  navigator.vibrate?.([200, 100, 200, 100, 200]);
}

/** Light tap for completing a set. */
export function setDoneHaptic(): void {
  if (isNative()) {
    void Haptics.impact({ style: ImpactStyle.Medium });
    return;
  }
  navigator.vibrate?.(30);
}

let webWakeLock: WakeLockSentinel | null = null;

/** Keeps the screen on during a workout session. */
export async function setKeepAwake(on: boolean): Promise<void> {
  try {
    if (isNative()) {
      await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep());
      return;
    }
    if (on && !webWakeLock && 'wakeLock' in navigator) {
      webWakeLock = await navigator.wakeLock.request('screen');
      webWakeLock.addEventListener('release', () => {
        webWakeLock = null;
      });
    } else if (!on && webWakeLock) {
      await webWakeLock.release();
      webWakeLock = null;
    }
  } catch {
    // Wake lock is best-effort (denied, low battery, tab hidden).
  }
}
