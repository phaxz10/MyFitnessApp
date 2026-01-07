import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Card, CardContent, Button, Modal, Input } from '../components/ui';
import { useWeight } from '../hooks/useWeight';
import { useProfile } from '../hooks/useProfile';
import { formatDate, formatShortDate, formatDisplayDate } from '../utils/date';
import {
  calculateBodyFatPercentage,
  calculateWeeklyWeightChange,
  isOnTrackWithGoal,
  formatWeight,
} from '../utils/calculations';
import { weightLogSchema, type WeightLogFormData } from '../schemas/forms';

export function WeightTracker() {
  const [searchParams] = useSearchParams();
  const { logs, fetchLogs, addLog } = useWeight();
  const { profile, fetchProfile } = useProfile();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>(
    '30d',
  );
  const [isEditingToday, setIsEditingToday] = useState(false);

  // React Hook Form
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WeightLogFormData>({
    resolver: zodResolver(weightLogSchema),
    defaultValues: {
      weight: '',
      waist: '',
      neck: '',
      arm: '',
    },
  });

  useEffect(() => {
    fetchProfile();
    fetchLogs();
  }, [fetchProfile, fetchLogs]);

  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      setIsModalOpen(true);
    }
  }, [searchParams]);

  // Check if there's already an entry for today
  const todayStr = formatDate(new Date());
  const todayLog = logs.find((log) => log.date === todayStr);

  // Auto-populate form when modal opens if there's a today entry
  const handleOpenModal = useCallback(() => {
    if (todayLog) {
      reset({
        weight: todayLog.weight_kg.toString(),
        waist: todayLog.waist_cm?.toString() || '',
        neck: todayLog.neck_cm?.toString() || '',
        arm: todayLog.arm_cm?.toString() || '',
      });
      setIsEditingToday(true);
    } else {
      reset({
        weight: '',
        waist: '',
        neck: '',
        arm: '',
      });
      setIsEditingToday(false);
    }
    setIsModalOpen(true);
  }, [todayLog, reset]);

  const getFilteredLogs = () => {
    if (timeRange === 'all') return [...logs].reverse();

    const now = new Date();
    const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
    const cutoff = new Date(
      now.getTime() - daysMap[timeRange] * 24 * 60 * 60 * 1000,
    );

    return logs.filter((log) => new Date(log.date) >= cutoff).reverse();
  };

  const filteredLogs = getFilteredLogs();
  const latestLog = logs.length > 0 ? logs[0] : null;
  const weeklyChange = calculateWeeklyWeightChange(filteredLogs);
  const onTrack = profile
    ? isOnTrackWithGoal(profile.goal, weeklyChange)
    : true;

  const chartData = filteredLogs.map((log) => ({
    date: formatShortDate(log.date),
    weight: log.weight_kg,
    bodyFat: log.body_fat_pct,
  }));

  const handleCloseModal = () => {
    setIsModalOpen(false);
    reset({
      weight: '',
      waist: '',
      neck: '',
      arm: '',
    });
    setError(null);
  };

  const onSubmit = async (data: WeightLogFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      let bodyFatPct: number | null = null;

      if (data.waist && data.neck && profile?.height_cm) {
        bodyFatPct = calculateBodyFatPercentage(
          profile.gender,
          parseFloat(data.waist),
          parseFloat(data.neck),
          profile.height_cm,
        );
      }

      await addLog({
        date: formatDate(new Date()),
        weight_kg: parseFloat(data.weight),
        waist_cm: data.waist ? parseFloat(data.waist) : null,
        neck_cm: data.neck ? parseFloat(data.neck) : null,
        arm_cm: data.arm ? parseFloat(data.arm) : null,
        body_fat_pct: bodyFatPct,
      });

      handleCloseModal();
    } catch (err) {
      setError('Failed to save weight log');
    } finally {
      setIsLoading(false);
    }
  };

  const getTrendIcon = () => {
    if (weeklyChange > 0.1)
      return <TrendingUp className="text-green-400" size={20} />;
    if (weeklyChange < -0.1)
      return <TrendingDown className="text-red-400" size={20} />;
    return <Minus className="text-slate-400" size={20} />;
  };

  return (
    <div className="p-4 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Weight Tracker</h1>
        <Button onClick={handleOpenModal}>
          <Plus size={18} className="mr-1" />
          Log Weight
        </Button>
      </div>

      {/* Current Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-slate-400 text-sm">Current Weight</p>
            <p className="text-2xl font-bold text-white">
              {latestLog ? `${formatWeight(latestLog.weight_kg)} kg` : '--'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-slate-400 text-sm">Body Fat</p>
            <p className="text-2xl font-bold text-white">
              {latestLog?.body_fat_pct
                ? `${latestLog.body_fat_pct.toFixed(1)}%`
                : '--'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Change */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-slate-400 text-sm">Weekly Change</p>
              <div className="flex items-center gap-2">
                {getTrendIcon()}
                <span
                  className={`text-xl font-semibold ${
                    weeklyChange > 0
                      ? 'text-green-400'
                      : weeklyChange < 0
                        ? 'text-red-400'
                        : 'text-white'
                  }`}
                >
                  {weeklyChange > 0 ? '+' : ''}
                  {formatWeight(weeklyChange)} kg/week
                </span>
              </div>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                onTrack
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {onTrack ? 'On Track' : 'Off Track'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white">Weight Trend</h3>
            <div className="flex gap-1">
              {(['7d', '30d', '90d', 'all'] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 rounded text-sm ${
                    timeRange === range
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {range === 'all' ? 'All' : range}
                </button>
              ))}
            </div>
          </div>

          {chartData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis
                    dataKey="date"
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    domain={['dataMin - 1', 'dataMax + 1']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-500">
              No data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Logs */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Logs</h3>
          {logs.length === 0 ? (
            <p className="text-slate-500 text-center py-4">
              No weight logs yet
            </p>
          ) : (
            <div className="space-y-2">
              {logs.slice(0, 10).map((log) => (
                <div
                  key={log.id}
                  className="flex justify-between items-center py-2 border-b border-slate-700 last:border-0"
                >
                  <div>
                    <p className="text-white">{formatDisplayDate(log.date)}</p>
                    <p className="text-slate-400 text-sm">
                      {log.body_fat_pct &&
                        `BF: ${log.body_fat_pct.toFixed(1)}%`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-semibold">
                      {formatWeight(log.weight_kg)} kg
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Weight Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={isEditingToday ? "Update Today's Weight" : 'Log Weight'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {isEditingToday && (
            <p className="text-slate-400 text-sm bg-slate-700/50 p-2 rounded">
              You already logged weight today. This will update your existing
              entry.
            </p>
          )}
          <Input
            label="Weight (kg)"
            type="number"
            step="0.1"
            {...register('weight')}
            placeholder="Enter your weight"
            error={errors.weight?.message}
          />

          <div className="border-t border-slate-700 pt-4">
            <p className="text-slate-400 text-sm mb-3">
              Body Measurements (optional)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Waist (cm)"
                type="number"
                step="0.1"
                {...register('waist')}
                placeholder="cm"
              />
              <Input
                label="Neck (cm)"
                type="number"
                step="0.1"
                {...register('neck')}
                placeholder="cm"
              />
              <Input
                label="Arm (cm)"
                type="number"
                step="0.1"
                {...register('arm')}
                placeholder="cm"
              />
            </div>
            <p className="text-slate-500 text-xs mt-2">
              Body fat % will be calculated if waist and neck are provided.
            </p>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseModal}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading} className="flex-1">
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
