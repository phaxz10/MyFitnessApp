import type { CSSProperties, ReactNode } from 'react';

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

// Base skeleton with shimmer animation
export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-slate-700 rounded ${className}`}
      style={style}
    />
  );
}

// Text line skeleton
export function SkeletonText({ className = '' }: SkeletonProps) {
  return <Skeleton className={`h-4 ${className}`} />;
}

// Circle skeleton (for avatars, icons)
export function SkeletonCircle({ className = '' }: SkeletonProps) {
  return <Skeleton className={`rounded-full ${className}`} />;
}

// Card skeleton with customizable content
interface SkeletonCardProps {
  children?: ReactNode;
  className?: string;
}

export function SkeletonCard({ children, className = '' }: SkeletonCardProps) {
  return (
    <div
      className={`bg-slate-800 border border-slate-700 rounded-lg p-4 ${className}`}
    >
      {children || (
        <div className="space-y-3">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
    </div>
  );
}

// List item skeleton
export function SkeletonListItem({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg ${className}`}
    >
      <SkeletonCircle className="w-10 h-10 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

// Metric/stat skeleton (number with label)
export function SkeletonMetric({ className = '' }: SkeletonProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-8 w-20" />
    </div>
  );
}

// Chart skeleton
export function SkeletonChart({ className = '' }: SkeletonProps) {
  const bars = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const heights = [40, 60, 35, 80, 55, 70, 45];
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-end justify-between h-32 gap-2">
        {bars.map((id, idx) => (
          <Skeleton
            key={`bar-${id}`}
            className="flex-1 rounded-t"
            style={{ height: `${heights[idx]}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between">
        {bars.map((id) => (
          <Skeleton key={`label-${id}`} className="h-3 w-6" />
        ))}
      </div>
    </div>
  );
}

// Button skeleton
export function SkeletonButton({ className = '' }: SkeletonProps) {
  return <Skeleton className={`h-10 rounded-lg ${className}`} />;
}

// ============================================
// Page-specific skeleton layouts
// ============================================

// Dashboard page skeleton
export function DashboardSkeleton() {
  return (
    <div className="p-4 pb-20 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <div className="space-y-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-32" />
        </div>
        <SkeletonCircle className="w-10 h-10" />
      </div>

      {/* Today's Calories Card */}
      <SkeletonCard>
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <SkeletonMetric />
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="grid grid-cols-3 gap-4">
            <SkeletonMetric />
            <SkeletonMetric />
            <SkeletonMetric />
          </div>
        </div>
      </SkeletonCard>

      {/* Weight Card */}
      <SkeletonCard>
        <div className="space-y-3">
          <div className="flex justify-between">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex items-baseline gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </SkeletonCard>

      {/* Workout Summary Card */}
      <SkeletonCard>
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-4">
            <SkeletonMetric />
            <SkeletonMetric />
          </div>
          <SkeletonButton className="w-full" />
        </div>
      </SkeletonCard>
    </div>
  );
}

// Workout page skeleton
export function WorkoutSkeleton() {
  return (
    <div className="p-4 pb-20 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Today's Workout Card */}
      <SkeletonCard>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <SkeletonCircle className="w-5 h-5" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-6 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded" />
            <Skeleton className="h-6 w-24 rounded" />
            <Skeleton className="h-6 w-16 rounded" />
          </div>
          <SkeletonButton className="w-full" />
        </div>
      </SkeletonCard>

      {/* Programs Section */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-28" />
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Recent Workouts */}
      <SkeletonCard>
        <div className="space-y-4">
          <Skeleton className="h-6 w-36" />
          <div className="space-y-3">
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </div>
        </div>
      </SkeletonCard>
    </div>
  );
}

// Calorie Log page skeleton
export function CalorieLogSkeleton() {
  return (
    <div className="p-4 pb-20 space-y-4">
      {/* Header with date */}
      <div className="flex justify-between items-center mb-4">
        <Skeleton className="h-8 w-32" />
        <div className="flex items-center gap-2">
          <SkeletonCircle className="w-8 h-8" />
          <Skeleton className="h-6 w-24" />
          <SkeletonCircle className="w-8 h-8" />
        </div>
      </div>

      {/* Summary Card */}
      <SkeletonCard>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <SkeletonMetric />
            <Skeleton className="h-16 w-16 rounded-full" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="grid grid-cols-3 gap-4">
            <SkeletonMetric />
            <SkeletonMetric />
            <SkeletonMetric />
          </div>
        </div>
      </SkeletonCard>

      {/* Meal Sections */}
      {['Breakfast', 'Lunch', 'Dinner', 'Snacks'].map((meal) => (
        <SkeletonCard key={meal}>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}

// Weight Tracker page skeleton
export function WeightTrackerSkeleton() {
  return (
    <div className="p-4 pb-20 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>

      {/* Current Stats */}
      <SkeletonCard>
        <div className="grid grid-cols-2 gap-4">
          <SkeletonMetric />
          <SkeletonMetric />
          <SkeletonMetric />
          <SkeletonMetric />
        </div>
      </SkeletonCard>

      {/* Chart */}
      <SkeletonCard>
        <div className="space-y-4">
          <Skeleton className="h-5 w-24" />
          <SkeletonChart />
        </div>
      </SkeletonCard>

      {/* History */}
      <SkeletonCard>
        <div className="space-y-3">
          <Skeleton className="h-5 w-20" />
          <div className="space-y-2">
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </div>
        </div>
      </SkeletonCard>
    </div>
  );
}

// Progress page skeleton
export function ProgressSkeleton() {
  return (
    <div className="p-4 pb-20 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <SkeletonCircle className="w-10 h-10" />
        <Skeleton className="h-7 w-40" />
      </div>

      {/* Time range tabs */}
      <div className="flex gap-2 mb-4">
        <Skeleton className="h-8 w-12 rounded-full" />
        <Skeleton className="h-8 w-12 rounded-full" />
        <Skeleton className="h-8 w-12 rounded-full" />
        <Skeleton className="h-8 w-12 rounded-full" />
      </div>

      {/* Tab navigation */}
      <div className="flex gap-4 border-b border-slate-700 mb-4">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <SkeletonCard>
          <SkeletonMetric />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonMetric />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonMetric />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonMetric />
        </SkeletonCard>
      </div>

      {/* Chart */}
      <SkeletonCard>
        <div className="space-y-4">
          <Skeleton className="h-5 w-32" />
          <SkeletonChart />
        </div>
      </SkeletonCard>
    </div>
  );
}

// Exercise Library page skeleton
export function ExerciseLibrarySkeleton() {
  return (
    <div className="p-4 pb-20 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>

      {/* Search */}
      <Skeleton className="h-10 w-full rounded-lg" />

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Skeleton className="h-8 w-16 rounded-full flex-shrink-0" />
        <Skeleton className="h-8 w-20 rounded-full flex-shrink-0" />
        <Skeleton className="h-8 w-24 rounded-full flex-shrink-0" />
        <Skeleton className="h-8 w-16 rounded-full flex-shrink-0" />
      </div>

      {/* Exercise list */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonCard key={i}>
            <div className="flex items-center gap-3">
              <SkeletonCircle className="w-12 h-12" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}
