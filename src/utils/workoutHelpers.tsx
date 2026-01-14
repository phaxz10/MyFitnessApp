/**
 * Shared workout UI helper functions
 * Consolidates duplicate utility functions across workout components
 */

import { ChevronDown, ChevronUp, Clock, Dumbbell } from 'lucide-react';
import type { ExerciseType, ProgressionDirection } from '../types';

/**
 * Get the appropriate icon for an exercise type
 * Used by: ExerciseCard, SupersetCard
 */
export const getExerciseTypeIcon = (type: ExerciseType) => {
  if (type === 'duration' || type === 'duration_weight') {
    return <Clock size={14} className="text-slate-400" />;
  }
  return <Dumbbell size={14} className="text-slate-400" />;
};

/**
 * Get the progression arrow indicator for weight/rep changes
 * Used by: ExerciseCard, SupersetCard
 */
export const getProgressionArrow = (
  direction: ProgressionDirection | undefined,
) => {
  if (!direction || direction === 'maintain') return null;
  if (direction === 'increase') {
    return <ChevronUp size={14} className="text-green-400" />;
  }
  return <ChevronDown size={14} className="text-red-400" />;
};
