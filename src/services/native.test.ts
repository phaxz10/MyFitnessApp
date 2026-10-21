import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  schedule: vi.fn(async () => undefined),
  cancel: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNative },
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    requestPermissions: mocks.requestPermissions,
    schedule: mocks.schedule,
    cancel: mocks.cancel,
  },
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: {},
  ImpactStyle: {},
  NotificationType: {},
}));
vi.mock('@capacitor-community/keep-awake', () => ({ KeepAwake: {} }));

const { scheduleRestAlarm } = await import('./native');

describe('scheduleRestAlarm (native)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('replaces the pending alarm with one at the exact end time', async () => {
    const endAt = Date.UTC(2026, 9, 21, 10, 0, 0);
    await scheduleRestAlarm(endAt);
    expect(mocks.cancel).toHaveBeenCalledBefore(mocks.schedule);
    const [{ notifications }] = mocks.schedule.mock.calls[0] as unknown as [
      { notifications: { id: number; schedule: { at: Date } }[] },
    ];
    expect(notifications[0].schedule.at.getTime()).toBe(endAt);
  });

  it('does nothing when notification permission is denied', async () => {
    mocks.requestPermissions.mockResolvedValueOnce({ display: 'denied' });
    await scheduleRestAlarm(Date.now() + 60_000);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
});
