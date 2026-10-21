import type { PhotoType } from '../../types';
import { CameraCapture, Modal, TextArea } from '../ui';

const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  front: 'Front',
  side: 'Side',
  back: 'Back',
};

interface PhotoCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  photoType: PhotoType;
  onPhotoTypeChange: (type: PhotoType) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  isSaving: boolean;
  error: string | null;
  onCapture: (data: { base64: string; mimeType: string }) => void;
}

export function PhotoCaptureModal({
  isOpen,
  onClose,
  photoType,
  onPhotoTypeChange,
  notes,
  onNotesChange,
  isSaving,
  error,
  onCapture,
}: PhotoCaptureModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add progress photo">
      <div className="space-y-4">
        <CameraCapture
          onCapture={onCapture}
          overlay={
            <div className="pointer-events-auto absolute bottom-3 left-3 right-3 flex items-end justify-between">
              <div className="flex gap-1.5">
                {(Object.keys(PHOTO_TYPE_LABELS) as PhotoType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onPhotoTypeChange(type)}
                    aria-pressed={photoType === type}
                    className={`h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
                      photoType === type
                        ? 'bg-body text-on-accent'
                        : 'bg-black/50 text-white/80 hover:bg-black/70'
                    }`}
                  >
                    {PHOTO_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
              {isSaving && (
                <span className="rounded bg-black/50 px-2 py-1 text-xs text-white">
                  Saving…
                </span>
              )}
            </div>
          }
        />

        <TextArea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Notes (optional), e.g. morning, flexed, after workout"
          rows={2}
          aria-label="Photo notes"
        />

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
