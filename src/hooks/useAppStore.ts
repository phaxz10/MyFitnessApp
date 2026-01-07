import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile } from '../types';

interface AppState {
  isOnboardingComplete: boolean;
  isOnline: boolean;
  userProfile: UserProfile | null;
  setOnboardingComplete: (complete: boolean) => void;
  setOnline: (online: boolean) => void;
  setUserProfile: (profile: UserProfile | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isOnboardingComplete: false,
      isOnline: navigator.onLine,
      userProfile: null,
      setOnboardingComplete: (complete) =>
        set({ isOnboardingComplete: complete }),
      setOnline: (online) => set({ isOnline: online }),
      setUserProfile: (profile) => set({ userProfile: profile }),
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({
        isOnboardingComplete: state.isOnboardingComplete,
      }),
    },
  ),
);
