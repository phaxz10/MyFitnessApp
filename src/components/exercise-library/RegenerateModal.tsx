import { AlertTriangle, Check, Loader2, RefreshCw } from 'lucide-react';
import { Button, Modal } from '../ui';
import type { RegenerateProgress } from './constants';

interface RegenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel: () => void;
  onDone: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  progress: RegenerateProgress | null;
  exerciseCount: number;
  aiAvailable: boolean;
}

export function RegenerateModal({
  isOpen,
  onClose,
  onCancel,
  onDone,
  onRegenerate,
  isRegenerating,
  progress,
  exerciseCount,
  aiAvailable,
}: RegenerateModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Regenerate All Exercise Details"
    >
      <div className="space-y-4">
        {!isRegenerating && !progress?.current ? (
          <>
            <div className="flex items-start gap-3 p-3 bg-warn-soft border border-warn rounded-lg">
              <AlertTriangle
                size={20}
                className="text-warn flex-shrink-0 mt-0.5"
              />
              <div>
                <p className="text-warn font-medium">Warning</p>
                <p className="text-warn text-sm">
                  This will regenerate AI details for all {exerciseCount}{' '}
                  exercises in your library. Existing descriptions will be
                  overwritten with fresh AI-generated content.
                </p>
              </div>
            </div>
            <p className="text-ink-2 text-sm">
              This is useful when you've updated the AI prompts and want all
              exercises to benefit from the improvements.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                tone="ink"
                className="flex-1"
                onClick={onRegenerate}
                disabled={!aiAvailable}
              >
                <RefreshCw size={18} className="mr-2" />
                Regenerate All
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-ink-2">Progress</span>
                <span className="num text-ink">
                  {progress?.current || 0} / {progress?.total || exerciseCount}
                </span>
              </div>
              <div className="w-full bg-sunken rounded-full h-2">
                <div
                  className="bg-ink h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${((progress?.current || 0) / (progress?.total || 1)) * 100}%`,
                  }}
                />
              </div>
              {progress?.currentExercise && (
                <p className="text-ink-2 text-sm truncate">
                  {isRegenerating ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      {progress.currentExercise}
                    </span>
                  ) : (
                    progress.currentExercise
                  )}
                </p>
              )}
            </div>

            {progress && progress.completed.length > 0 && (
              <div className="max-h-32 overflow-y-auto">
                <p className="text-eat-ink text-sm font-medium mb-1">
                  Completed ({progress.completed.length})
                </p>
                <div className="text-ink-2 text-xs space-y-0.5">
                  {progress.completed.slice(-5).map((name) => (
                    <div key={name} className="flex items-center gap-1">
                      <Check size={12} className="text-eat-ink" />
                      {name}
                    </div>
                  ))}
                  {progress.completed.length > 5 && (
                    <div className="text-ink-3">
                      ...and {progress.completed.length - 5} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {progress && progress.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto">
                <p className="text-danger text-sm font-medium mb-1">
                  Errors ({progress.errors.length})
                </p>
                <div className="text-danger text-xs space-y-0.5">
                  {progress.errors.map((error) => (
                    <div key={error}>{error}</div>
                  ))}
                </div>
              </div>
            )}

            {!isRegenerating && progress?.current === progress?.total && (
              <Button className="w-full" onClick={onDone}>
                Done
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
