import { zodResolver } from '@hookform/resolvers/zod';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Image,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Button,
  Card,
  CardContent,
  getTrendDirection,
  Input,
  Modal,
  type TimeRange,
  TimeRangeSelector,
  TrendIndicator,
  WeightTrackerSkeleton,
} from '../components/ui';
import { useProfile } from '../hooks/useProfile';
import { useProgressPhotos } from '../hooks/useProgressPhotos';
import { useWeight } from '../hooks/useWeight';
import { type WeightLogFormData, weightLogSchema } from '../schemas/forms';
import type { PhotoType, ProgressPhoto } from '../types';
import {
  calculateBodyFatPercentage,
  calculateWeeklyWeightChange,
  formatWeight,
  hasEnoughDataForWeeklyTrend,
  isOnTrackWithGoal,
} from '../utils/calculations';
import {
  formatDate,
  formatDisplayDate,
  formatShortDate,
  getDaysAgo,
} from '../utils/date';

export function WeightTracker() {
  const [searchParams] = useSearchParams();
  const { logs, fetchLogs, addLog } = useWeight();
  const { profile, fetchProfile } = useProfile();
  const { photos, fetchAllPhotos, addPhoto, deletePhoto } = useProgressPhotos();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [isEditingToday, setIsEditingToday] = useState(false);

  // Photo states
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<ProgressPhoto | null>(
    null,
  );
  const [selectedPhotoType, setSelectedPhotoType] =
    useState<PhotoType>('front');
  const [photoNotes, setPhotoNotes] = useState('');
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const loadData = async () => {
      setInitialLoading(true);
      try {
        await Promise.all([fetchProfile(), fetchLogs(), fetchAllPhotos()]);
      } finally {
        setInitialLoading(false);
      }
    };
    loadData();
  }, [fetchProfile, fetchLogs, fetchAllPhotos]);

  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      setIsModalOpen(true);
    }
  }, [searchParams]);

  // Get selected date from URL param or default to today
  const selectedDate = searchParams.get('date') || formatDate(new Date());

  // Check if there's already an entry for the selected date
  const selectedDateLog = logs.find(
    (log) => formatDate(log.date) === selectedDate,
  );

  // Auto-populate form when modal opens if there's an entry for selected date
  const handleOpenModal = useCallback(() => {
    if (selectedDateLog) {
      reset({
        weight: selectedDateLog.weight_kg.toString(),
        waist: selectedDateLog.waist_cm?.toString() || '',
        neck: selectedDateLog.neck_cm?.toString() || '',
        arm: selectedDateLog.arm_cm?.toString() || '',
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
  }, [selectedDateLog, reset]);

  const getFilteredLogs = () => {
    if (timeRange === 'all') return [...logs].reverse();

    const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
    const cutoffDate = getDaysAgo(daysMap[timeRange]);

    return logs.filter((log) => formatDate(log.date) >= cutoffDate).reverse();
  };

  const filteredLogs = getFilteredLogs();
  const latestLog = logs.length > 0 ? logs[0] : null;
  const weeklyChange = calculateWeeklyWeightChange(filteredLogs);
  const hasEnoughData = hasEnoughDataForWeeklyTrend(filteredLogs);
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
        date: selectedDate,
        weight_kg: parseFloat(data.weight),
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

  // Trend direction for weekly change (using 0.1 threshold for significance)
  const trendDirection = getTrendDirection(weeklyChange, 0.1);

  // Photo handlers
  const handleOpenPhotoModal = () => {
    setSelectedPhotoType('front');
    setPhotoNotes('');
    setPhotoError(null);
    setIsPhotoModalOpen(true);
  };

  const handleClosePhotoModal = () => {
    setIsPhotoModalOpen(false);
    setPhotoNotes('');
    setPhotoError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Image must be less than 5MB');
      return;
    }

    setIsPhotoLoading(true);
    setPhotoError(null);

    try {
      // Compress and convert to base64
      const base64 = await compressAndConvertToBase64(file);

      await addPhoto({
        date: formatDate(new Date()),
        photo_data: base64,
        photo_type: selectedPhotoType,
        notes: photoNotes || undefined,
      });

      await fetchAllPhotos();
      handleClosePhotoModal();
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : 'Failed to save photo',
      );
    } finally {
      setIsPhotoLoading(false);
    }
  };

  const compressAndConvertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = document.createElement('img');

      img.onload = () => {
        // Max dimensions
        const maxWidth = 1200;
        const maxHeight = 1200;

        let { width, height } = img;

        // Calculate new dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        canvas.width = width;
        canvas.height = height;

        ctx?.drawImage(img, 0, 0, width, height);

        // Convert to JPEG with 0.8 quality
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        resolve(base64);
      };

      img.onerror = () => reject(new Error('Failed to load image'));

      // Read file as data URL
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleViewPhoto = (photo: ProgressPhoto) => {
    setSelectedPhoto(photo);
    setIsPhotoViewerOpen(true);
  };

  const handleClosePhotoViewer = () => {
    setIsPhotoViewerOpen(false);
    setSelectedPhoto(null);
  };

  const handleDeletePhoto = async () => {
    if (!selectedPhoto) return;

    try {
      await deletePhoto(selectedPhoto.id, selectedPhoto.date);
      await fetchAllPhotos();
      handleClosePhotoViewer();
    } catch {
      // Error handled by hook
    }
  };

  const navigatePhoto = (direction: 'prev' | 'next') => {
    if (!selectedPhoto) return;
    const currentIndex = photos.findIndex((p) => p.id === selectedPhoto.id);
    if (currentIndex === -1) return;

    const newIndex =
      direction === 'prev'
        ? Math.max(0, currentIndex - 1)
        : Math.min(photos.length - 1, currentIndex + 1);

    setSelectedPhoto(photos[newIndex]);
  };

  // Group photos by date
  const photosByDate = photos.reduce(
    (acc, photo) => {
      const date = photo.date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(photo);
      return acc;
    },
    {} as Record<string, ProgressPhoto[]>,
  );

  const photoTypeLabels: Record<PhotoType, string> = {
    front: 'Front',
    side: 'Side',
    back: 'Back',
  };

  if (initialLoading) {
    return <WeightTrackerSkeleton />;
  }

  return (
    <div className="p-4 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-white">Body Tracking</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleOpenPhotoModal}>
            <Camera size={18} className="mr-1" />
            Photo
          </Button>
          <Button onClick={handleOpenModal}>
            <Plus size={18} className="mr-1" />
            Log Weight
          </Button>
        </div>
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
              <p className="text-slate-400 text-sm">
                {hasEnoughData ? 'Weekly Change' : 'Recent Change'}
              </p>
              <div className="flex items-center gap-2">
                <TrendIndicator direction={trendDirection} size={20} iconOnly />
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
                  {formatWeight(weeklyChange)} kg{hasEnoughData ? '/week' : ''}
                </span>
              </div>
              {!hasEnoughData && filteredLogs.length > 1 && (
                <p className="text-slate-500 text-xs mt-1">
                  Log for 3+ days for weekly trend
                </p>
              )}
            </div>
            {hasEnoughData && (
              <div
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  onTrack
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {onTrack ? 'On Track' : 'Off Track'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white">Weight Trend</h3>
            <TimeRangeSelector
              value={timeRange}
              onChange={setTimeRange}
              allLabel="All"
              compact
            />
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
      <Card className="mb-4">
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

      {/* Progress Photos Gallery */}
      <Card>
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white">
              Progress Photos
            </h3>
            <span className="text-slate-400 text-sm">
              {photos.length} photos
            </span>
          </div>

          {photos.length === 0 ? (
            <div className="text-center py-8">
              <Image className="mx-auto mb-3 text-slate-600" size={48} />
              <p className="text-slate-500 mb-2">No progress photos yet</p>
              <p className="text-slate-600 text-sm">
                Track your visual progress by adding photos
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(photosByDate)
                .slice(0, 5)
                .map(([date, datePhotos]) => (
                  <div key={date}>
                    <p className="text-slate-400 text-sm mb-2">
                      {formatDisplayDate(date)}
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {datePhotos.map((photo) => (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => handleViewPhoto(photo)}
                          className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 border-slate-700 hover:border-blue-500 transition-colors"
                        >
                          <img
                            src={photo.photo_data}
                            alt={`${photo.photo_type} pose from ${formatDisplayDate(photo.date)}`}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs py-0.5 text-center capitalize">
                            {photo.photo_type}
                          </span>
                        </button>
                      ))}
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
        title={
          isEditingToday
            ? `Update Weight - ${formatDisplayDate(selectedDate)}`
            : `Log Weight - ${formatDisplayDate(selectedDate)}`
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {isEditingToday && (
            <p className="text-slate-400 text-sm bg-slate-700/50 p-2 rounded">
              You already logged weight for this day. This will update your
              existing entry.
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

      {/* Add Photo Modal */}
      <Modal
        isOpen={isPhotoModalOpen}
        onClose={handleClosePhotoModal}
        title="Add Progress Photo"
      >
        <div className="space-y-4">
          <p className="text-slate-400 text-sm">
            Take a photo to track your visual progress over time.
          </p>

          {/* Photo Type Selection */}
          <div>
            <p className="block text-sm font-medium text-slate-300 mb-2">
              Photo Type
            </p>
            <div className="flex gap-2">
              {(['front', 'side', 'back'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedPhotoType(type)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    selectedPhotoType === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {photoTypeLabels[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="block text-sm font-medium text-slate-300 mb-2">
              Notes (optional)
            </p>
            <textarea
              value={photoNotes}
              onChange={(e) => setPhotoNotes(e.target.value)}
              placeholder="E.g., morning, flexed, after workout..."
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
            />
          </div>

          {/* File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          {photoError && <p className="text-red-400 text-sm">{photoError}</p>}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClosePhotoModal}
              className="flex-1"
              disabled={isPhotoLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1"
              isLoading={isPhotoLoading}
            >
              <Camera size={18} className="mr-1" />
              Take Photo
            </Button>
          </div>
        </div>
      </Modal>

      {/* Photo Viewer Modal */}
      {selectedPhoto && (
        <div
          className={`fixed inset-0 z-50 bg-black/95 ${isPhotoViewerOpen ? 'block' : 'hidden'}`}
        >
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent z-10">
            <div>
              <p className="text-white font-medium">
                {formatDisplayDate(selectedPhoto.date)}
              </p>
              <p className="text-slate-400 text-sm capitalize">
                {selectedPhoto.photo_type} view
              </p>
            </div>
            <button
              type="button"
              onClick={handleClosePhotoViewer}
              className="p-2 rounded-full bg-slate-800/50 hover:bg-slate-700 text-white"
            >
              <X size={24} />
            </button>
          </div>

          {/* Photo */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <img
              src={selectedPhoto.photo_data}
              alt={`${selectedPhoto.photo_type} pose from ${formatDisplayDate(selectedPhoto.date)}`}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* Navigation Arrows */}
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => navigatePhoto('prev')}
                disabled={
                  photos.findIndex((p) => p.id === selectedPhoto.id) === 0
                }
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-800/50 hover:bg-slate-700 text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={28} />
              </button>
              <button
                type="button"
                onClick={() => navigatePhoto('next')}
                disabled={
                  photos.findIndex((p) => p.id === selectedPhoto.id) ===
                  photos.length - 1
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-800/50 hover:bg-slate-700 text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={28} />
              </button>
            </>
          )}

          {/* Footer with notes and delete */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent">
            {selectedPhoto.notes && (
              <p className="text-slate-300 text-sm mb-3">
                {selectedPhoto.notes}
              </p>
            )}
            <button
              type="button"
              onClick={handleDeletePhoto}
              className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm"
            >
              <Trash2 size={16} />
              Delete Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
