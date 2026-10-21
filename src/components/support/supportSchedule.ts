// When to show the occasional "buy me a coffee" prompt. Pure logic over a
// small localStorage record so it is cheap and testable. Per-device on
// purpose: it is a courtesy, not state worth backing up.

export const COFFEE_URL = 'https://buymeacoffee.com/phaxz10';

const KEY = 'mypersonalfitness.supportPrompt.v1';
const DAY = 86_400_000;

/** Only ask people who have used the app on enough separate days. */
export const MIN_ACTIVE_DAYS = 10;
/** Never in the first two weeks. */
export const MIN_AGE_DAYS = 14;
/** "Maybe later" waits this long. */
export const SNOOZE_DAYS = 45;
/** After someone clicks through, leave them alone for longer. */
export const THANKED_DAYS = 180;

export interface SupportPromptState {
  firstSeen: number;
  activeDays: string[]; // YYYY-MM-DD, capped
  nextAskAt: number;
  never: boolean;
}

export function freshState(now: number): SupportPromptState {
  return { firstSeen: now, activeDays: [], nextAskAt: 0, never: false };
}

export function recordActiveDay(
  state: SupportPromptState,
  day: string,
): SupportPromptState {
  if (state.activeDays.includes(day)) return state;
  // ponytail: only the count matters, keep the list short.
  const activeDays = [...state.activeDays, day].slice(-MIN_ACTIVE_DAYS);
  return { ...state, activeDays };
}

export function shouldAsk(state: SupportPromptState, now: number): boolean {
  return (
    !state.never &&
    now - state.firstSeen >= MIN_AGE_DAYS * DAY &&
    state.activeDays.length >= MIN_ACTIVE_DAYS &&
    now >= state.nextAskAt
  );
}

export type SupportAnswer = 'later' | 'never' | 'thanks';

export function answer(
  state: SupportPromptState,
  choice: SupportAnswer,
  now: number,
): SupportPromptState {
  if (choice === 'never') return { ...state, never: true };
  const days = choice === 'thanks' ? THANKED_DAYS : SNOOZE_DAYS;
  return { ...state, nextAskAt: now + days * DAY };
}

export function loadState(now: number): SupportPromptState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as SupportPromptState;
  } catch {
    // Storage blocked or corrupt: start fresh.
  }
  return freshState(now);
}

export function saveState(state: SupportPromptState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Best effort.
  }
}
