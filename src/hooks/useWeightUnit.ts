import type { WeightUnit } from '../utils/units';
import { useAppStore } from './useAppStore';

/** The user's weight display unit (profile is mirrored in useAppStore). */
export function useWeightUnit(): WeightUnit {
  return useAppStore((s) => s.userProfile?.weight_unit ?? 'kg');
}
