import {
  AlertCircle,
  Battery,
  BatteryLow,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Minus,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { AIWeeklyReviewResponse, WeeklyReviewData } from '../../types';
import { goalLabel } from './reviewTypes';

type MetabolicType = NonNullable<
  AIWeeklyReviewResponse['metabolicResponse']
>['type'];

const METABOLIC_COPY: Record<
  MetabolicType,
  { title: string; Icon: typeof Battery; tone: string }
> = {
  thrifty: {
    title: 'Thrifty Metabolism Detected',
    Icon: BatteryLow,
    tone: 'text-body-ink',
  },
  spendthrift: {
    title: 'Spendthrift Metabolism',
    Icon: Zap,
    tone: 'text-train-ink',
  },
  normal: {
    title: 'Normal Metabolic Response',
    Icon: Battery,
    tone: 'text-eat-ink',
  },
};

// AI panels are neutral wells (bg-sunken) with a leading status icon.
function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 bg-sunken rounded-xl p-4">
      <span className="shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-ink font-semibold mb-1">{title}</p>
        {children}
      </div>
    </div>
  );
}

function ProgressLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span className="text-ink-2 text-sm">{text}</span>
    </li>
  );
}

function WeightTrendIcon({ change }: { change: number | null }) {
  if (change !== null && change > 0)
    return <TrendingUp size={16} className="text-eat-ink" />;
  if (change !== null && change < 0)
    return <TrendingDown size={16} className="text-danger" />;
  return <Minus size={16} className="text-ink-2" />;
}

interface AIAssessmentProps {
  review: AIWeeklyReviewResponse;
  weeklyData: WeeklyReviewData;
}

export function AIAssessment({ review, weeklyData }: AIAssessmentProps) {
  const { recommendations: rec, metabolicResponse: metabolic } = review;
  const metabolicCopy = metabolic ? METABOLIC_COPY[metabolic.type] : null;
  const hasChanges =
    rec.updateMeasurements || rec.adjustCalories || rec.changeGoal;

  return (
    <>
      <Panel
        icon={
          review.onTrack ? (
            <CheckCircle2 size={22} className="text-eat-ink" />
          ) : (
            <AlertCircle size={22} className="text-warn" />
          )
        }
        title={review.onTrack ? 'On Track!' : 'Needs Attention'}
      >
        <p className="text-ink-2 text-sm">{review.summary}</p>
      </Panel>

      {metabolic && metabolicCopy && (
        <Panel
          icon={<metabolicCopy.Icon size={22} className={metabolicCopy.tone} />}
          title={metabolicCopy.title}
        >
          <p className="text-ink-2 text-sm mb-2">{metabolic.analysis}</p>
          <p className="text-ink-2 text-sm">{metabolic.recommendation}</p>
        </Panel>
      )}

      {rec.dietBreakRecommended && (
        <div className="flex items-start gap-2 bg-body-soft border border-body rounded-xl p-3">
          <AlertCircle
            size={18}
            className="text-body-ink shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div>
            <p className="text-body-ink font-semibold text-sm">
              Diet Break Recommended
            </p>
            <p className="text-body-ink text-sm mt-1">{rec.dietBreakReason}</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-ink-2">
          Progress assessment
        </h4>
        <ul className="space-y-2">
          <ProgressLine
            icon={<WeightTrendIcon change={weeklyData.weightChange} />}
            text={review.progressAssessment.weightProgress}
          />
          <ProgressLine
            icon={<Target size={16} className="text-eat-ink" />}
            text={review.progressAssessment.calorieAdherence}
          />
          <ProgressLine
            icon={<Dumbbell size={16} className="text-train-ink" />}
            text={review.progressAssessment.workoutConsistency}
          />
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-ink-2">Recommendations</h4>
        <ul className="space-y-1">
          {rec.updateMeasurements && (
            <RecLine>Update body measurements</RecLine>
          )}
          {rec.adjustCalories && (
            <RecLine>
              Adjust calorie target to{' '}
              <span className="num">{rec.newCalorieTarget}</span> kcal
            </RecLine>
          )}
          {rec.changeGoal && (
            <RecLine>
              Consider switching to{' '}
              {rec.suggestedGoal ? goalLabel(rec.suggestedGoal) : 'a new goal'}
            </RecLine>
          )}
          {!hasChanges && (
            <li className="flex items-center gap-2 text-eat-ink text-sm">
              <CheckCircle2 size={14} aria-hidden="true" />
              Keep up the good work! No changes needed.
            </li>
          )}
        </ul>
      </div>

      <div className="flex items-start gap-2 bg-sunken rounded-xl p-4">
        <Sparkles
          size={16}
          className="text-ink-2 shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <p className="text-ink text-sm italic">
          "{review.motivationalMessage}"
        </p>
      </div>
    </>
  );
}

function RecLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-ink-2 text-sm">
      <ChevronRight
        size={14}
        className="text-ink shrink-0"
        aria-hidden="true"
      />
      <span>{children}</span>
    </li>
  );
}
