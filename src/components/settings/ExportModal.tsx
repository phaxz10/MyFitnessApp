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
    <Modal isOpen={isOpen} onClose={onClose} title="Export Data">
      <div className="space-y-4">
        <p className="text-slate-400 text-sm">
          Select the data you want to include in the export:
        </p>

        {/* Quick actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Select All
          </button>
          <span className="text-slate-600">|</span>
          <button
            type="button"
            onClick={handleSelectNone}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Select None
          </button>
        </div>

        {/* Checkboxes */}
        <div className="space-y-2">
          {(Object.keys(options) as (keyof ExportOptions)[]).map((key) => (
            <label
              key={key}
              className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors"
            >
              <input
                type="checkbox"
                checked={options[key]}
                onChange={() => handleToggle(key)}
                className="w-5 h-5 rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-white">{EXPORT_OPTION_LABELS[key]}</span>
              {key === 'workoutPrograms' && (
                <span className="text-slate-500 text-xs ml-auto">
                  includes sessions
                </span>
              )}
              {key === 'workoutHistory' && (
                <span className="text-slate-500 text-xs ml-auto">
                  includes sets
                </span>
              )}
            </label>
          ))}
        </div>

        {/* Selected count */}
        <p className="text-slate-500 text-sm">
          {selectedCount} of {totalCount} categories selected
        </p>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="secondary"
            onClick={onClose}
            className="flex-1"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            className="flex-1"
            isLoading={isLoading}
            disabled={selectedCount === 0}
          >
            <Download size={18} className="mr-2" />
            Export
          </Button>
        </div>
      </div>
    </Modal>
  );
}
