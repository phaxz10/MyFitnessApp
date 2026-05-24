import { ChevronRight, ClipboardCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWeeklyReview } from '../../hooks/useWeeklyReview';
import type { UserProfile, WeeklyReviewSufficiency } from '../../types';
import { Card, CardContent } from '../ui';

interface WeeklyReviewButtonProps {
  profile: UserProfile | null;
  onStartReview: () => void;
}

export function WeeklyReviewButton({
  profile,
  onStartReview,
}: WeeklyReviewButtonProps) {
  const { shouldShowReviewButton, loading } = useWeeklyReview();
  const [showButton, setShowButton] = useState(false);
  const [sufficiency, setSufficiency] =
    useState<WeeklyReviewSufficiency | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkReviewEligibility() {
      if (!profile) {
        setChecking(false);
        return;
      }

      const result = await shouldShowReviewButton(profile);
      if (mounted) {
        setShowButton(result.show);
        setSufficiency(result.sufficiency);
        setChecking(false);
      }
    }

    checkReviewEligibility();

    return () => {
      mounted = false;
    };
  }, [profile, shouldShowReviewButton]);

  // ?forceReview=true is documented as a debug shortcut — honor it fully
  // (the existing isReviewDay check already respects it, but the data
  // sufficiency gate did not, blocking the documented testing path).
  const forceReview =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('forceReview') === 'true';

  // Don't render anything while checking or if shouldn't show
  if (!forceReview && (checking || loading || !showButton)) {
    return null;
  }

  return (
    <Card
      className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 border-purple-500/30 hover:border-purple-400/50 transition-all cursor-pointer"
      onClick={onStartReview}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-600/30 rounded-xl flex items-center justify-center">
              <ClipboardCheck size={24} className="text-purple-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-lg">
                Weekly Check-In
              </p>
              <p className="text-slate-300 text-sm">
                Review your progress and get AI recommendations
              </p>
              {sufficiency && (
                <div className="flex gap-2 mt-1">
                  {sufficiency.hasWeightData && (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
                      {sufficiency.weightDaysLogged} weight logs
                    </span>
                  )}
                  {sufficiency.hasCalorieData && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                      {sufficiency.calorieDaysLogged} days tracked
                    </span>
                  )}
                  {sufficiency.hasWorkoutData && (
                    <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">
                      {sufficiency.workoutDaysLogged} workouts
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <ChevronRight size={24} className="text-purple-400" />
        </div>
      </CardContent>
    </Card>
  );
}
