import { Download } from 'lucide-react';
import { useState } from 'react';
import {
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_OPTION_LABELS,
  type ExportOptions,
} from '../../services/backup';
import { Button, Modal } from '../ui';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => Promise<void>;
  isLoading: boolean;
}

export function ExportModal({
  isOpen,
  onClose,
  onExport,
  isLoading,
}: ExportModalProps) {
  const [options, setOptions] = useState<ExportOptions>({
    ...DEFAULT_EXPORT_OPTIONS,
  });

  const handleToggle = (key: keyof ExportOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectAll = () => {
    setOptions({ ...DEFAULT_EXPORT_OPTIONS });
  };

  const handleSelectNone = () => {
    setOptions({
      userProfile: false,
      weightLogs: false,
      calorieLogs: false,
      exercises: false,
      workoutPrograms: false,
      workoutHistory: false,
      aiReviews: false,
      progressPhotos: false,
    });
  };

  const selectedCount = Object.values(options).filter(Boolean).length;
  const totalCount = Object.keys(options).length;

  const handleExport = async () => {
    await onExport(options);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export backup">
      <div className="space-y-4">
        <p className="text-ink-2 text-sm">
          Choose what to include. Your backup downloads as a .zip file with your
          data and progress photos. API keys are never included.
        </p>

        <div className="flex gap-1 -mx-3">
          <Button variant="ghost" size="sm" onClick={handleSelectAll}>
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSelectNone}>
            Select None
          </Button>
        </div>

        <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
          {(Object.keys(options) as (keyof ExportOptions)[]).map((key) => (
            <label
              key={key}
              className="flex items-center gap-3 min-h-12 px-4 py-2 cursor-pointer hover:bg-sunken transition-colors"
            >
              <input
                type="checkbox"
                checked={options[key]}
                onChange={() => handleToggle(key)}
                className="size-5 shrink-0 accent-[var(--train)]"
              />
              <span className="text-ink flex-1">
                {EXPORT_OPTION_LABELS[key]}
              </span>
              {key === 'workoutPrograms' && (
                <span className="text-ink-3 text-sm">includes sessions</span>
              )}
              {key === 'workoutHistory' && (
                <span className="text-ink-3 text-sm">includes sets</span>
              )}
            </label>
          ))}
        </div>

        {/* Selected count */}
        <p className="text-ink-3 text-sm">
          <span className="num font-bold">{selectedCount}</span> of{' '}
          <span className="num font-bold">{totalCount}</span> categories
          selected
        </p>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={onClose}
            size="lg"
            className="flex-1"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            size="lg"
            className="flex-1"
            isLoading={isLoading}
            disabled={selectedCount === 0}
          >
            <Download size={18} aria-hidden="true" />
            Download .zip
          </Button>
        </div>
      </div>
    </Modal>
  );
}
