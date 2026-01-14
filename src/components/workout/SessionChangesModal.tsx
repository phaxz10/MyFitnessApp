import { AlertTriangle, Check, RefreshCw } from 'lucide-react';
import type { SessionDiff } from '../../utils/sessionDiff';
import { generateChangeSummary } from '../../utils/sessionDiff';
import { Button, Modal } from '../ui';

interface SessionChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  diff: SessionDiff;
  onSaveThisSessionOnly: () => void;
  onUpdateProgram: () => void;
  isUpdating?: boolean;
}

export function SessionChangesModal({
  isOpen,
  onClose,
  diff,
  onSaveThisSessionOnly,
  onUpdateProgram,
  isUpdating = false,
}: SessionChangesModalProps) {
  const changeSummary = generateChangeSummary(diff);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Session Changes Detected">
      <div className="space-y-4">
        {/* Info message */}
        <div className="flex items-start gap-3 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg">
          <AlertTriangle
            size={20}
            className="text-amber-400 flex-shrink-0 mt-0.5"
          />
          <div>
            <p className="text-amber-200 text-sm font-medium">
              You made changes to this workout
            </p>
            <p className="text-amber-300/80 text-xs mt-1">
              Would you like to apply these changes to your program template for
              future workouts?
            </p>
          </div>
        </div>

        {/* Changes list */}
        <div className="bg-slate-800/50 rounded-lg p-3 max-h-48 overflow-y-auto">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">
            Changes made:
          </p>
          <ul className="space-y-1.5">
            {changeSummary.map((change) => (
              <li
                key={change}
                className="text-sm text-slate-300 flex items-start gap-2"
              >
                <span className="text-blue-400 mt-1">•</span>
                <span>{change}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          <Button
            onClick={onUpdateProgram}
            disabled={isUpdating}
            className="w-full flex items-center justify-center gap-2"
          >
            {isUpdating ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            {isUpdating ? 'Updating...' : 'Update Program Template'}
          </Button>

          <Button
            variant="secondary"
            onClick={onSaveThisSessionOnly}
            disabled={isUpdating}
            className="w-full flex items-center justify-center gap-2"
          >
            <Check size={16} />
            Save This Session Only
          </Button>
        </div>

        {/* Helper text */}
        <p className="text-slate-500 text-xs text-center">
          "Update Program Template" will apply these changes to all future
          workouts using this session.
        </p>
      </div>
    </Modal>
  );
}
