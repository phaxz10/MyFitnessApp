import { Trophy } from 'lucide-react';
import type { ExercisePR } from '../../types';
import { formatDisplayDate } from '../../utils/date';
import { Card, CardHeader, CardTitle } from '../ui';
import { formatMaxWeightDetail } from './format';

function formatMaxVolume(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
}

function PRRow({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: string;
  unit: string;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="font-semibold text-ink">{label}</p>
        <p className="num text-sm text-ink-3">{detail}</p>
      </div>
      <p className="flex items-baseline gap-1">
        <span className="num text-2xl font-bold text-ink">{value}</span>
        <span className="text-sm text-ink-3">{unit}</span>
      </p>
    </div>
  );
}

export function PersonalRecordsCard({ prs }: { prs: ExercisePR }) {
  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <Trophy className="text-warn" size={18} />
        <CardTitle>Personal records</CardTitle>
      </CardHeader>
      <div className="divide-y divide-line">
        {prs.maxWeight && (
          <PRRow
            label="Max weight"
            value={String(prs.maxWeight.value)}
            unit="lbs"
            detail={formatMaxWeightDetail(prs.maxWeight.reps)}
          />
        )}
        {prs.max1RM && (
          <PRRow
            label="Est. 1RM"
            value={String(prs.max1RM.value)}
            unit="lbs"
            detail={formatDisplayDate(prs.max1RM.date)}
          />
        )}
        {prs.maxReps && (
          <PRRow
            label="Max reps"
            value={String(prs.maxReps.value)}
            unit="reps"
            detail={`@ ${prs.maxReps.weight} lbs`}
          />
        )}
        {prs.maxVolume && (
          <PRRow
            label="Max volume"
            value={formatMaxVolume(prs.maxVolume.value)}
            unit="lbs"
            detail="single session"
          />
        )}
      </div>
    </Card>
  );
}
