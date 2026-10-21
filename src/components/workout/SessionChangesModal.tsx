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
        <div className="flex items-start gap-3 rounded-xl bg-warn-soft p-3">
          <AlertTriangle
            size={20}
            className="mt-0.5 shrink-0 text-warn"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-ink">
              You made changes to this workout
            </p>
            <p className="mt-1 text-sm text-ink-2">
              Would you like to apply these changes to your program template for
              future workouts?
            </p>
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold text-ink-2">Changes made</p>
          <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {changeSummary.map((change) => (
              <li key={change} className="px-3 py-2.5 text-sm text-ink">
                {change}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <Button
            size="lg"
            onClick={onUpdateProgram}
            isLoading={isUpdating}
            className="w-full"
          >
            {!isUpdating && <RefreshCw size={18} />}
            {isUpdating ? 'Updating...' : 'Update Program Template'}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={onSaveThisSessionOnly}
            disabled={isUpdating}
            className="w-full"
          >
            <Check size={18} />
            Save This Session Only
          </Button>
        </div>

        <p className="text-center text-sm text-ink-3">
          "Update Program Template" will apply these changes to all future
          workouts using this session.
        </p>
      </div>
    </Modal>
  );
}
