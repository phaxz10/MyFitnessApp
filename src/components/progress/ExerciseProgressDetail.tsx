import {
  ArrowLeft,
  Calendar,
  Dumbbell,
  Minus,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  type TimeRange,
  useAllExercisesProgress,
  useExercisePRs,
  useExerciseSessionData,
} from '../../hooks/useStrengthProgress';
import { formatDisplayDate } from '../../utils/date';
import { Button, Card, CardContent } from '../ui';
import { OneRMChart } from './OneRMChart';

interface ExerciseProgressDetailProps {
  exerciseId: number;
  exerciseName: string;
  timeRange: TimeRange;
  onBack: () => void;
}

export function ExerciseProgressDetail({
  exerciseId,
  exerciseName,
  timeRange,
  onBack,
}: ExerciseProgressDetailProps) {
  const { data: sessions = [], isLoading: sessionsLoading } =
    useExerciseSessionData(exerciseId, timeRange);

  const { data: prs, isLoading: prsLoading } = useExercisePRs(exerciseId);

  const { data: allExercises = [] } = useAllExercisesProgress(timeRange);

  const summary = allExercises.find((p) => p.exerciseId === exerciseId) ?? null;

  const isLoading = sessionsLoading || prsLoading;

  const getTrendInfo = () => {
    if (!summary)
      return { icon: null, label: 'Unknown', color: 'text-slate-400' };
    switch (summary.trend) {
      case 'progressing':
        return {
          icon: <TrendingUp className="text-green-400" size={20} />,
          label: 'Progressing',
          color: 'text-green-400',
        };
      case 'regressing':
        return {
          icon: <TrendingDown className="text-red-400" size={20} />,
          label: 'Regressing',
          color: 'text-red-400',
        };
      default:
        return {
          icon: <Minus className="text-slate-400" size={20} />,
          label: 'Plateau',
          color: 'text-slate-400',
        };
    }
  };

  const trendInfo = getTrendInfo();

  if (isLoading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={onBack} className="p-2">
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white">{exerciseName}</h2>
          <div className="flex items-center gap-2 mt-1">
            {trendInfo.icon}
            <span className={`text-sm ${trendInfo.color}`}>
              {trendInfo.label}
            </span>
            {summary && (
              <span className="text-slate-500 text-sm">
                - {summary.totalSessions} sessions
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 1RM Chart */}
      <OneRMChart data={sessions} title="Strength Progress" height={200} />

      {/* Personal Records */}
      {prs && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Trophy className="text-yellow-400" size={20} />
              Personal Records
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {prs.maxWeight && (
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-slate-400 text-sm">Max Weight</p>
                  <p className="text-white text-xl font-bold">
                    {prs.maxWeight.value} lbs
                  </p>
                  <p className="text-slate-500 text-xs">
                    {prs.maxWeight.reps} reps
                  </p>
                </div>
              )}
              {prs.max1RM && (
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-slate-400 text-sm">Est. 1RM</p>
                  <p className="text-white text-xl font-bold">
                    {prs.max1RM.value} lbs
                  </p>
                  <p className="text-slate-500 text-xs">
                    {formatDisplayDate(prs.max1RM.date)}
                  </p>
                </div>
              )}
              {prs.maxReps && (
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-slate-400 text-sm">Max Reps</p>
                  <p className="text-white text-xl font-bold">
                    {prs.maxReps.value} reps
                  </p>
                  <p className="text-slate-500 text-xs">
                    @ {prs.maxReps.weight} lbs
                  </p>
                </div>
              )}
              {prs.maxVolume && (
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-slate-400 text-sm">Max Volume</p>
                  <p className="text-white text-xl font-bold">
                    {prs.maxVolume.value >= 1000
                      ? `${(prs.maxVolume.value / 1000).toFixed(1)}K`
                      : prs.maxVolume.value}{' '}
                    lbs
                  </p>
                  <p className="text-slate-500 text-xs">single session</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session History */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Calendar size={20} className="text-slate-400" />
            Session History
          </h3>
          {sessions.length === 0 ? (
            <p className="text-slate-500 text-center py-4">
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mr-2" />
                  Loading...
                </span>
              ) : (
                'No sessions in this time range'
              )}
            </p>
          ) : (
            <div className="space-y-3">
              {sessions
                .slice()
                .reverse()
                .slice(0, 10)
                .map((session) => (
                  <div
                    key={session.date}
                    className="border-b border-slate-700 last:border-0 pb-3 last:pb-0"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-white font-medium">
                        {formatDisplayDate(session.date)}
                      </p>
                      <div className="text-right">
                        {session.estimated1RM && (
                          <p className="text-blue-400 text-sm">
                            1RM: {session.estimated1RM} lbs
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {session.sets.map((set, setIndex) => (
                        <span
                          key={`${session.date}-set-${setIndex}-${set.weight}-${set.reps}`}
                          className="bg-slate-700 text-slate-300 text-sm px-2 py-1 rounded"
                        >
                          {set.weight ?? 0} x {set.reps ?? 0}
                        </span>
                      ))}
                    </div>
                    <p className="text-slate-500 text-sm mt-1">
                      Volume: {session.totalVolume.toLocaleString()} lbs
                    </p>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Empty State */}
      {sessions.length === 0 && !prs && !isLoading && (
        <Card>
          <CardContent className="p-8 text-center">
            <Dumbbell className="mx-auto mb-3 text-slate-600" size={48} />
            <p className="text-slate-400 mb-2">No data for this exercise</p>
            <p className="text-slate-500 text-sm">
              Start tracking this exercise in your workouts
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
