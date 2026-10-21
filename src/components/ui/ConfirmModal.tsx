import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

// Two-button confirmation sheet used by the training pages.

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: string;
  onConfirm: () => void;
  danger?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  danger = false,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p className="text-ink-2 mb-6">{children}</p>
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          className="flex-1"
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
