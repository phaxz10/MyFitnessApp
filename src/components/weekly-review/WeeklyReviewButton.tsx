import { ChevronRight, ClipboardCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWeeklyReview } from '../../hooks/useWeeklyReview';
import type { UserProfile, WeeklyReviewSufficiency } from '../../types';
import { Card } from '../ui';

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
    <Card onClick={onStartReview}>
      <div className="flex items-center gap-3 p-4">
        <span
          aria-hidden="true"
          className="grid place-items-center size-11 rounded-xl bg-sunken text-ink shrink-0"
        >
          <ClipboardCheck size={22} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-ink font-bold text-lg">Weekly Check-In</p>
          <p className="text-ink-2 text-sm">
            Review your progress and get AI recommendations
          </p>
          {sufficiency && (
            <div className="flex flex-wrap gap-2 mt-2">
              {sufficiency.hasWeightData && (
                <span className="text-sm bg-body-soft text-body-ink px-2 py-0.5 rounded-lg">
                  <span className="num font-bold">
                    {sufficiency.weightDaysLogged}
                  </span>{' '}
                  weight logs
                </span>
              )}
              {sufficiency.hasCalorieData && (
                <span className="text-sm bg-eat-soft text-eat-ink px-2 py-0.5 rounded-lg">
                  <span className="num font-bold">
                    {sufficiency.calorieDaysLogged}
                  </span>{' '}
                  days tracked
                </span>
              )}
              {sufficiency.hasWorkoutData && (
                <span className="text-sm bg-train-soft text-train-ink px-2 py-0.5 rounded-lg">
                  <span className="num font-bold">
                    {sufficiency.workoutDaysLogged}
                  </span>{' '}
                  workouts
                </span>
              )}
            </div>
          )}
        </div>
        <ChevronRight
          size={20}
          className="text-ink-3 shrink-0"
          aria-hidden="true"
        />
      </div>
    </Card>
  );
}
