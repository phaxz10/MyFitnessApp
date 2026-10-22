import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Modal, TextArea } from '../ui';

interface FillSessionModalProps {
  /** The session being filled, or null when closed. */
  sessionName: string | null;
  isFilling: boolean;
  error: string | null;
  onClose: () => void;
  onFill: (instruction: string) => void;
}

export function FillSessionModal({
  sessionName,
  isFilling,
  error,
  onClose,
  onFill,
}: FillSessionModalProps) {
  const [instruction, setInstruction] = useState('');

  // Prefill with the session name each time the sheet opens.
  useEffect(() => {
    if (sessionName !== null) setInstruction(sessionName);
  }, [sessionName]);

  return (
    <Modal
      isOpen={sessionName !== null}
      onClose={() => !isFilling && onClose()}
      title="Fill with AI"
    >
      <div className="space-y-4">
        <TextArea
          id="fill-session-instruction"
          label="What should this session cover?"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={isFilling}
          rows={3}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button
          tone="ink"
          size="lg"
          className="w-full"
          isLoading={isFilling}
          onClick={() => onFill(instruction)}
        >
          {!isFilling && <Sparkles size={20} aria-hidden="true" />}
          Add exercises
        </Button>
      </div>
    </Modal>
  );
}
