import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getDB } from '../../services/db';
import { photoData } from '../../services/queries/progressPhotos';
import type { ProgressPhotoSummary } from '../../types';
import { formatDisplayDate } from '../../utils/date';

interface PhotoViewerProps {
  photo: ProgressPhotoSummary;
  index: number;
  total: number;
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onDelete: () => void;
}

const ICON_BUTTON =
  'grid size-11 place-items-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-sunken disabled:pointer-events-none disabled:opacity-30';

export function PhotoViewer({
  photo,
  index,
  total,
  onClose,
  onNavigate,
  onDelete,
}: PhotoViewerProps) {
  const [image, setImage] = useState<{ id: number; src: string | null } | null>(
    null,
  );
  const photoId = photo.id;

  // Load the full image only for the photo on screen; prev/next changes the id.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let src: string | null = null;
      try {
        src = await photoData(await getDB(), photoId);
      } catch {
        src = null;
      }
      if (!cancelled) setImage({ id: photoId, src });
    })();
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  const loaded = image?.id === photoId;
  const alt = `${photo.photo_type} pose from ${formatDisplayDate(photo.date)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-canvas"
      role="dialog"
      aria-modal="true"
      aria-label="Progress photo"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-2">
        <div>
          <p className="num font-semibold text-ink">
            {formatDisplayDate(photo.date)}
          </p>
          <p className="text-sm capitalize text-ink-2">
            {photo.photo_type} view
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={ICON_BUTTON}
          aria-label="Close photo"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {loaded && image.src ? (
          <img
            src={image.src}
            alt={alt}
            className="max-h-full max-w-full object-contain"
          />
        ) : loaded ? (
          <p className="text-ink-3">Could not load photo.</p>
        ) : (
          <p className="text-ink-3" role="status">
            Loading photo...
          </p>
        )}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => onNavigate('prev')}
              disabled={index === 0}
              className={`${ICON_BUTTON} absolute left-2 top-1/2 -translate-y-1/2`}
              aria-label="Previous photo"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('next')}
              disabled={index === total - 1}
              className={`${ICON_BUTTON} absolute right-2 top-1/2 -translate-y-1/2`}
              aria-label="Next photo"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {photo.notes && (
          <p className="mb-2 text-sm text-ink-2">{photo.notes}</p>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="flex h-11 items-center gap-2 text-sm font-semibold text-danger"
        >
          <Trash2 size={18} />
          Delete photo
        </button>
      </div>
    </div>
  );
}
