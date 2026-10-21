import { Check, Loader2, Sparkles, X } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Button, Modal, TextArea } from '../ui';
import type { BatchExercise } from './constants';

interface BatchAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchInput: string;
  onBatchInputChange: (value: string) => void;
  batchExercises: BatchExercise[];
  setBatchExercises: Dispatch<SetStateAction<BatchExercise[]>>;
  isBatchGenerating: boolean;
  aiAvailable: boolean;
  loading: boolean;
  onParse: () => void;
  onRemove: (index: number) => void;
  onGenerate: () => void;
  onSave: () => void;
}

function DuplicateList({
  duplicates,
}: {
  duplicates: BatchExercise['duplicates'];
}) {
  if (!duplicates || duplicates.length === 0) return null;
  return (
    <div className="mt-1 text-warn text-xs">
      <p className="font-medium">Possible duplicates:</p>
      <ul className="list-disc list-inside space-y-0.5">
        {duplicates.map((dup) => {
          const parts: string[] = [];
          if (dup.muscle_groups) parts.push(dup.muscle_groups);
          if (dup.equipment) parts.push(dup.equipment);
          const meta = parts.length > 0 ? ` (${parts.join(', ')})` : '';
          return (
            <li key={dup.id} className="truncate">
              {dup.name}
              {meta}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusIndicator({ status }: { status: BatchExercise['status'] }) {
  if (status === 'pending')
    return <span className="text-ink-3 text-xs">Pending</span>;
  if (status === 'generating')
    return <Loader2 size={16} className="text-ink-2 animate-spin" />;
  if (status === 'ready') return <Check size={16} className="text-eat-ink" />;
  return <span className="text-danger text-xs">Error</span>;
}

export function BatchAddModal({
  isOpen,
  onClose,
  batchInput,
  onBatchInputChange,
  batchExercises,
  setBatchExercises,
  isBatchGenerating,
  aiAvailable,
  loading,
  onParse,
  onRemove,
  onGenerate,
  onSave,
}: BatchAddModalProps) {
  const readyCount = batchExercises.filter(
    (ex) => ex.status === 'ready',
  ).length;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Batch Add Exercises">
      <div className="space-y-4">
        {batchExercises.length === 0 ? (
          <>
            <p className="text-ink-2 text-sm">
              Enter exercise names (one per line). AI will generate details for
              each exercise.
            </p>
            <TextArea
              value={batchInput}
              onChange={(e) => onBatchInputChange(e.target.value)}
              placeholder={`Bench Press\nSquat\nDeadlift\nOverhead Press\nBarbell Row`}
              rows={8}
            />
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={onParse}
                disabled={!batchInput.trim()}
              >
                Continue
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-ink-2 text-sm">
              {readyCount} of {batchExercises.length} exercises ready
            </p>
            <ul className="max-h-64 overflow-y-auto bg-sunken rounded-xl divide-y divide-line">
              {batchExercises.map((exercise, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: AI batch preview items have no stable id and do not reorder
                  key={`${exercise.name}-${index}`}
                  className="flex items-start gap-2 p-2"
                >
                  <div className="pt-1">
                    <input
                      type="checkbox"
                      checked={exercise.includeForGeneration}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setBatchExercises((prev) =>
                          prev.map((ex, i) =>
                            i === index
                              ? { ...ex, includeForGeneration: checked }
                              : ex,
                          ),
                        );
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink text-sm truncate">
                      {exercise.details?.name || exercise.name}
                    </p>
                    {exercise.details && (
                      <p className="text-ink-3 text-xs truncate">
                        {exercise.details.muscle_groups.join(', ')}
                      </p>
                    )}
                    <DuplicateList duplicates={exercise.duplicates} />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusIndicator status={exercise.status} />
                    <button
                      type="button"
                      onClick={() => onRemove(index)}
                      aria-label={`Remove ${exercise.name}`}
                      className="text-ink-3 hover:text-danger transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setBatchExercises([])}
              >
                Back
              </Button>
              {batchExercises.some((ex) => ex.status === 'pending') && (
                <Button
                  type="button"
                  tone="ink"
                  className="flex-1"
                  onClick={onGenerate}
                  disabled={isBatchGenerating || !aiAvailable}
                >
                  {isBatchGenerating ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} className="mr-2" />
                      Generate Details
                    </>
                  )}
                </Button>
              )}
              {readyCount > 0 && (
                <Button
                  type="button"
                  className="flex-1"
                  onClick={onSave}
                  disabled={loading}
                >
                  Save {readyCount} Exercises
                </Button>
              )}
            </div>
            {!aiAvailable && (
              <p className="text-warn text-sm text-center">
                Set up your OpenRouter API key in Settings to use AI generation
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
