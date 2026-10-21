import { startOfWeek } from 'date-fns';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProgressPhotosSection } from '../components/body/ProgressPhotosSection';
import { WeightChart } from '../components/body/WeightChart';
import {
  EMPTY_WEIGHT_FORM,
  WeightEntryModal,
} from '../components/body/WeightEntryModal';
import { WeightHistory } from '../components/body/WeightHistory';
import { WeightSummary } from '../components/body/WeightSummary';
import {
  Button,
  type TimeRange,
  WeightTrackerSkeleton,
} from '../components/ui';
import { useProfile } from '../hooks/useProfile';
import { useProgressPhotos } from '../hooks/useProgressPhotos';
import { useWeight } from '../hooks/useWeight';
import { useWeightUnit } from '../hooks/useWeightUnit';
import type { WeightLogFormData } from '../schemas/forms';
import {
  calculateBodyFatPercentage,
  calculateWeeklyWeightChange,
  hasEnoughDataForWeeklyTrend,
  isOnTrackWithGoal,
} from '../utils/calculations';
import {
  formatDate,
  formatDisplayDate,
  formatShortDate,
  getDaysAgo,
} from '../utils/date';
import { pgDate } from '../utils/pgValues';
import { parseWeightInput, weightText } from '../utils/units';

export function WeightTracker() {
  const [searchParams] = useSearchParams();
  const { logs, fetchLogs, addLog } = useWeight();
  const { profile } = useProfile();
  const { photos, fetchAllPhotos, addPhoto, deletePhoto } = useProgressPhotos();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [isEditingToday, setIsEditingToday] = useState(false);
  const [formInitial, setFormInitial] =
    useState<WeightLogFormData>(EMPTY_WEIGHT_FORM);

  useEffect(() => {
    const loadData = async () => {
      setInitialLoading(true);
      try {
        await Promise.all([fetchLogs(), fetchAllPhotos()]);
      } finally {
        setInitialLoading(false);
      }
    };
    loadData();
  }, [fetchLogs, fetchAllPhotos]);

  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      setIsModalOpen(true);
    }
  }, [searchParams]);

  const unit = useWeightUnit();

  // Selected date from URL param, defaulting to today
  const selectedDate = searchParams.get('date') || formatDate(new Date());
  const selectedDateLog = logs.find((log) => pgDate(log.date) === selectedDate);

  // Pre-fill the form when the selected date already has an entry
  const handleOpenModal = useCallback(() => {
    if (selectedDateLog) {
      setFormInitial({
        weight: weightText(selectedDateLog.weight_kg, unit, 'body'),
        waist: selectedDateLog.waist_cm?.toString() || '',
        neck: selectedDateLog.neck_cm?.toString() || '',
        arm: selectedDateLog.arm_cm?.toString() || '',
      });
      setIsEditingToday(true);
    } else {
      setFormInitial(EMPTY_WEIGHT_FORM);
      setIsEditingToday(false);
    }
    setIsModalOpen(true);
  }, [selectedDateLog, unit]);

  const filteredLogs = useMemo(() => {
    if (timeRange === 'all') return [...logs].reverse();

    if (timeRange === '7d') {
      const startDate = formatDate(
        startOfWeek(new Date(), { weekStartsOn: 0 }),
      );
      return logs.filter((log) => pgDate(log.date) >= startDate).reverse();
    }

    const daysMap = { '30d': 30, '90d': 90 };
    const cutoffDate = getDaysAgo(daysMap[timeRange]);
    return logs.filter((log) => pgDate(log.date) >= cutoffDate).reverse();
  }, [logs, timeRange]);

  const latestLog = logs.length > 0 ? logs[0] : null;
  const weeklyChange = calculateWeeklyWeightChange(filteredLogs);
  const hasEnoughData = hasEnoughDataForWeeklyTrend(filteredLogs);
  const onTrack = profile
    ? isOnTrackWithGoal(profile.goal, weeklyChange)
    : true;

  const chartData = useMemo(
    () =>
      filteredLogs.map((log) => ({
        date: formatShortDate(pgDate(log.date)),
        weight: log.weight_kg,
      })),
    [filteredLogs],
  );

  const handleCloseModal = () => {
    setIsModalOpen(false);
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
        date: selectedDate,
        weight_kg: parseWeightInput(
          data.weight,
          unit,
          selectedDateLog?.weight_kg,
          'body',
        ),
        waist_cm: data.waist ? parseFloat(data.waist) : null,
        neck_cm: data.neck ? parseFloat(data.neck) : null,
        arm_cm: data.arm ? parseFloat(data.arm) : null,
        body_fat_pct: bodyFatPct,
      });

      handleCloseModal();
    } catch {
      setError('Failed to save weight log');
    } finally {
      setIsLoading(false);
    }
  };

  if (initialLoading) {
    return <WeightTrackerSkeleton />;
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <WeightSummary
        latestLog={latestLog}
        weeklyChange={weeklyChange}
        hasEnoughData={hasEnoughData}
        hasMultipleLogs={filteredLogs.length > 1}
        onTrack={onTrack}
      />

      <Button
        tone="body"
        size="lg"
        className="w-full"
        onClick={handleOpenModal}
      >
        <Plus size={20} />
        Log weight
      </Button>

      <WeightChart
        data={chartData}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      />

      <WeightHistory logs={logs} onLog={handleOpenModal} />

      <ProgressPhotosSection
        photos={photos}
        addPhoto={addPhoto}
        deletePhoto={deletePhoto}
        refreshPhotos={fetchAllPhotos}
      />

      <WeightEntryModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={`${isEditingToday ? 'Update' : 'Log'} weight, ${formatDisplayDate(selectedDate)}`}
        isEditing={isEditingToday}
        initialValues={formInitial}
        isSaving={isLoading}
        error={error}
        onSave={onSubmit}
      />
    </div>
  );
}
