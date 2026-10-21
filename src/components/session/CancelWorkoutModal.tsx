import { Button, Modal } from '../ui';

interface CancelWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function CancelWorkoutModal({
  isOpen,
  onClose,
  onConfirm,
}: CancelWorkoutModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cancel Workout" size="sm">
      <p className="mb-5 text-ink-2">
        Are you sure you want to cancel this workout? All progress will be lost.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="danger" size="lg" onClick={onConfirm}>
          Cancel Workout
        </Button>
        <Button size="lg" onClick={onClose}>
          Keep Going
        </Button>
      </div>
    </Modal>
  );
}
