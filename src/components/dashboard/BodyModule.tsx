import { Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { UserProfile } from '../../types';
import { formatWeight, unitLabel, weightText } from '../../utils/units';
import { Button, Card } from '../ui';
import { ModuleHeading } from './ModuleHeading';

interface BodyModuleProps {
  profile: UserProfile | null;
  latestWeight: number | null;
  startWeight: number | null;
  onLogWeight: () => void;
}

function isOnTrack(goal: UserProfile['goal'], change: number): boolean {
  if (goal === 'cut') return change <= 0;
  if (goal === 'bulk' || goal === 'lean_bulk') return change >= 0;
  return true;
}

export function BodyModule({
  profile,
  latestWeight,
  startWeight,
  onLogWeight,
}: BodyModuleProps) {
  const unit = profile?.weight_unit ?? 'kg';
  const change =
    latestWeight !== null && startWeight !== null
      ? latestWeight - startWeight
      : null;
  const onTrack =
    profile && change !== null ? isOnTrack(profile.goal, change) : true;

  return (
    <Card>
      <div className="px-4 pt-1">
        <ModuleHeading
          discipline="body"
          action={
            <Link
              to="/weight"
              className="text-body-ink text-sm font-semibold hover:underline inline-flex items-center h-11"
            >
              History
            </Link>
          }
        >
          Body weight
        </ModuleHeading>
      </div>

      <div className="px-4 pb-4">
        {latestWeight === null ? (
          <p className="text-ink-2 text-sm">
            No weigh-ins yet. Log your first to start the trend.
          </p>
        ) : (
          <div className="flex items-end justify-between gap-3">
            <p className="num leading-none">
              <span className="text-5xl font-bold text-ink">
                {weightText(latestWeight, unit, 'body')}
              </span>
              <span className="text-ink-3 text-lg"> {unitLabel(unit)}</span>
            </p>
            {change !== null && change !== 0 && startWeight !== null && (
              <p
                className={`num inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ${
                  onTrack
                    ? 'bg-eat-soft text-eat-ink'
                    : 'bg-danger-soft text-danger'
                }`}
              >
                {change < 0 ? (
                  <TrendingDown size={14} aria-hidden="true" />
                ) : (
                  <TrendingUp size={14} aria-hidden="true" />
                )}
                {change > 0 ? '+' : ''}
                {formatWeight(change, unit, 'body')} since start
              </p>
            )}
          </div>
        )}
        {profile && startWeight !== null && latestWeight !== null && (
          <p className="text-ink-3 text-sm mt-2">
            <span className="num">
              Start {formatWeight(startWeight, unit, 'body')}
            </span>
            {' · Goal: '}
            <span className="capitalize">{profile.goal.replace('_', ' ')}</span>
          </p>
        )}
      </div>

      <div className="p-4 border-t border-line">
        <Button tone="body" size="lg" className="w-full" onClick={onLogWeight}>
          <Plus size={18} aria-hidden="true" />
          Log weight
        </Button>
      </div>
    </Card>
  );
}
