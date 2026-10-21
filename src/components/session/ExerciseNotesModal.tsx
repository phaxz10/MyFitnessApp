import { Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Input, Modal } from '../ui';

export interface ExerciseNotesData {
  exerciseId: number;
  exerciseName: string;
  notes: Array<{ id: number; content: string; created_at: string }>;
  currentWeight: string;
}

interface ExerciseNotesModalProps {
  data: ExerciseNotesData | null;
  onClose: () => void;
  onAddNote: (content: string) => Promise<void>;
  onDeleteNote: (noteId: number) => void;
}

export function ExerciseNotesModal({
  data,
  onClose,
  onAddNote,
  onDeleteNote,
}: ExerciseNotesModalProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest note in view when the sheet opens or a note is added.
  useEffect(() => {
    if (data && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [data]);

  const submit = async () => {
    if (!draft.trim()) return;
    await onAddNote(draft);
    setDraft('');
  };

  return (
    <Modal
      isOpen={!!data}
      onClose={onClose}
      title={`Notes: ${data?.exerciseName || ''}`}
    >
      {data && (
        <div className="space-y-4">
          <div
            ref={listRef}
            className="max-h-60 divide-y divide-line overflow-y-auto"
          >
            {data.notes.length === 0 ? (
              <p className="py-4 text-center text-ink-2">
                No notes yet. Add a cue or setup detail below.
              </p>
            ) : (
              data.notes.map((note) => (
                <div key={note.id} className="flex items-start gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">{note.content}</p>
                    <p className="num mt-0.5 text-sm text-ink-3">
                      {new Date(note.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteNote(note.id)}
                    aria-label="Delete note"
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-danger hover:bg-danger-soft"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a note..."
              aria-label="New note"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <Button
              onClick={submit}
              disabled={!draft.trim()}
              aria-label="Add note"
              className="shrink-0"
            >
              <Send size={18} />
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
