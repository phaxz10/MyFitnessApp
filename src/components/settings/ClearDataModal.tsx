import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Input, Modal } from '../ui';

interface ClearDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

const CONFIRM_WORD = 'DELETE';

// Destructive confirmation: the user must type DELETE before the button arms.
export function ClearDataModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}: ClearDataModalProps) {
  const [confirmText, setConfirmText] = useState('');

  // Always start disarmed, however the modal was dismissed.
  useEffect(() => {
    if (!isOpen) setConfirmText('');
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Clear All Data">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-danger-soft border border-danger rounded-xl">
          <AlertTriangle
            className="text-danger mt-0.5 shrink-0"
            size={20}
            aria-hidden="true"
          />
          <div>
            <p className="text-danger font-semibold">
              This action cannot be undone
            </p>
            <p className="text-ink-2 text-sm mt-1">
              All your data including profile, weight logs, food entries,
              exercises, workout programs, and workout history will be
              permanently deleted. Export a backup first if you want to keep a
              copy.
            </p>
          </div>
        </div>

        <Input
          label={`Type ${CONFIRM_WORD} to confirm`}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={CONFIRM_WORD}
          autoComplete="off"
          autoCapitalize="characters"
        />

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={confirmText !== CONFIRM_WORD || isLoading}
            isLoading={isLoading}
            className="flex-1"
          >
            Clear All Data
          </Button>
        </div>
      </div>
    </Modal>
  );
}
