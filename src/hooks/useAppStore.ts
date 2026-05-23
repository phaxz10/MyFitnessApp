import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MealType, UserProfile } from '../types';

// Modal types for global modal management
export interface FoodLogModalState {
  isOpen: boolean;
  date: string;
  mealType?: MealType;
  mode: 'picker' | 'manual' | 'ai_text' | 'ai_image';
  onSuccess?: () => void;
}

export interface WeightLogModalState {
  isOpen: boolean;
  date: string;
  onSuccess?: () => void;
}

interface AppState {
  isOnboardingComplete: boolean;
  isOnline: boolean;
  userProfile: UserProfile | null;

  // Global modal states
  foodLogModal: FoodLogModalState;
  weightLogModal: WeightLogModalState;

  // Actions
  setOnboardingComplete: (complete: boolean) => void;
  setOnline: (online: boolean) => void;
  setUserProfile: (profile: UserProfile | null) => void;

  // Modal actions
  openFoodLogModal: (options?: {
    date?: string;
    mealType?: MealType;
    mode?: 'picker' | 'manual' | 'ai_text' | 'ai_image';
    onSuccess?: () => void;
  }) => void;
  closeFoodLogModal: () => void;
  setFoodLogModalMode: (
    mode: 'picker' | 'manual' | 'ai_text' | 'ai_image',
  ) => void;

  openWeightLogModal: (options?: {
    date?: string;
    onSuccess?: () => void;
  }) => void;
  closeWeightLogModal: () => void;
}

const getDefaultFoodLogModal = (): FoodLogModalState => ({
  isOpen: false,
  date: new Date().toISOString().split('T')[0],
  mealType: undefined,
  mode: 'picker',
  onSuccess: undefined,
});

const getDefaultWeightLogModal = (): WeightLogModalState => ({
  isOpen: false,
  date: new Date().toISOString().split('T')[0],
  onSuccess: undefined,
});

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isOnboardingComplete: false,
      isOnline: navigator.onLine,
      userProfile: null,

      // Modal states
      foodLogModal: getDefaultFoodLogModal(),
      weightLogModal: getDefaultWeightLogModal(),

      // Existing actions
      setOnboardingComplete: (complete) =>
        set({ isOnboardingComplete: complete }),
      setOnline: (online) => set({ isOnline: online }),
      setUserProfile: (profile) => set({ userProfile: profile }),

      // Food log modal actions
      openFoodLogModal: (options) =>
        set({
          foodLogModal: {
            isOpen: true,
            date: options?.date || new Date().toISOString().split('T')[0],
            mealType: options?.mealType,
            mode: options?.mode || 'picker',
            onSuccess: options?.onSuccess,
          },
        }),
      closeFoodLogModal: () => set({ foodLogModal: getDefaultFoodLogModal() }),
      setFoodLogModalMode: (mode) =>
        set((state) => ({
          foodLogModal: { ...state.foodLogModal, mode },
        })),

      // Weight log modal actions
      openWeightLogModal: (options) =>
        set({
          weightLogModal: {
            isOpen: true,
            date: options?.date || new Date().toISOString().split('T')[0],
            onSuccess: options?.onSuccess,
          },
        }),
      closeWeightLogModal: () =>
        set({ weightLogModal: getDefaultWeightLogModal() }),
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({
        isOnboardingComplete: state.isOnboardingComplete,
      }),
    },
  ),
);
