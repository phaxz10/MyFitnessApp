import { ArrowRight } from 'lucide-react';
import type {
  AIWeeklyReviewResponse,
  UserProfile,
  WeeklyReviewData,
} from '../../types';
import { Button } from '../ui';
import { AIAssessment } from './AIAssessment';
import type { Macros } from './reviewTypes';
import { SummaryStats } from './SummaryStats';

interface SummaryStepProps {
  weeklyData: WeeklyReviewData;
  aiReview: AIWeeklyReviewResponse | null;
  profile: UserProfile;
  weeklyAvg: Macros | null;
  weekRange: { start: string; end: string };
  onClose: () => void;
  onContinue: () => void;
}

export function SummaryStep({
  weeklyData,
  aiReview,
  profile,
  weeklyAvg,
  weekRange,
  onClose,
  onContinue,
}: SummaryStepProps) {
  const rec = aiReview?.recommendations;
  const hasNextStep =
    rec?.updateMeasurements || rec?.adjustCalories || rec?.changeGoal;

  return (
    <div className="space-y-4">
      <SummaryStats
        weeklyData={weeklyData}
        weeklyAvg={weeklyAvg}
        weekRange={weekRange}
        profile={profile}
      />

      {aiReview && <AIAssessment review={aiReview} weeklyData={weeklyData} />}

      <div className="flex gap-2 pt-2">
        <Button
          variant="secondary"
          size="lg"
          onClick={onClose}
          className="flex-1"
        >
          Close
        </Button>
        <Button size="lg" onClick={onContinue} className="flex-1">
          {hasNextStep ? 'Continue' : 'Complete'}
          <ArrowRight size={18} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
