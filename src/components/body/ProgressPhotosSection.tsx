import { Camera } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { PhotoType, ProgressPhotoSummary } from '../../types';
import { formatDate, formatDisplayDate } from '../../utils/date';
import { Button, Card, CardContent, CardHeader, CardTitle } from '../ui';
import { compressBase64Image, makeThumbnail } from './compressImage';
import { PhotoCaptureModal } from './PhotoCaptureModal';
import { PhotoViewer } from './PhotoViewer';

interface NewPhoto {
  date: string;
  photo_data: string;
  thumb_data: string | null;
  photo_type: PhotoType;
  notes?: string;
}

interface ProgressPhotosSectionProps {
  photos: ProgressPhotoSummary[];
  addPhoto: (photo: NewPhoto) => Promise<unknown>;
  deletePhoto: (id: number, date: string) => Promise<unknown>;
  refreshPhotos: () => Promise<unknown>;
}

function groupByDate(photos: ProgressPhotoSummary[]) {
  return photos.reduce(
    (acc, photo) => {
      if (!acc[photo.date]) acc[photo.date] = [];
      acc[photo.date].push(photo);
      return acc;
    },
    {} as Record<string, ProgressPhotoSummary[]>,
  );
}

export function ProgressPhotosSection({
  photos,
  addPhoto,
  deletePhoto,
  refreshPhotos,
}: ProgressPhotosSectionProps) {
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] =
    useState<ProgressPhotoSummary | null>(null);
  const [photoType, setPhotoType] = useState<PhotoType>('front');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCapture = () => {
    setPhotoType('front');
    setNotes('');
    setError(null);
    setIsCaptureOpen(true);
  };

  const closeCapture = useCallback(() => {
    setIsCaptureOpen(false);
    setNotes('');
    setError(null);
  }, []);

  const handleCapture = useCallback(
    async (data: { base64: string; mimeType: string }) => {
      setIsSaving(true);
      setError(null);
      try {
        const compressed = await compressBase64Image(
          data.base64,
          data.mimeType,
        );
        // A failed thumbnail must not block saving; the lazy backfill retries.
        const thumb = await makeThumbnail(compressed).catch(() => null);
        await addPhoto({
          date: formatDate(new Date()),
          photo_data: compressed,
          thumb_data: thumb,
          photo_type: photoType,
          notes: notes || undefined,
        });
        await refreshPhotos();
        closeCapture();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save photo');
      } finally {
        setIsSaving(false);
      }
    },
    [addPhoto, refreshPhotos, notes, photoType, closeCapture],
  );

  const handleDelete = async () => {
    if (!selectedPhoto) return;
    try {
      await deletePhoto(selectedPhoto.id, selectedPhoto.date);
      await refreshPhotos();
      setSelectedPhoto(null);
    } catch {
      // Error handled by hook
    }
  };

  const selectedIndex = selectedPhoto
    ? photos.findIndex((p) => p.id === selectedPhoto.id)
    : -1;

  const navigate = (direction: 'prev' | 'next') => {
    if (selectedIndex === -1) return;
    const next =
      direction === 'prev'
        ? Math.max(0, selectedIndex - 1)
        : Math.min(photos.length - 1, selectedIndex + 1);
    setSelectedPhoto(photos[next]);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <CardTitle>Progress photos</CardTitle>
          <span className="num text-sm text-ink-3">{photos.length}</span>
        </CardHeader>

        {photos.length === 0 ? (
          <CardContent className="space-y-3 text-center">
            <p className="text-ink-3">
              No photos yet. Front, side and back shots make changes visible.
            </p>
            <Button variant="secondary" onClick={openCapture}>
              <Camera size={18} />
              Add photo
            </Button>
          </CardContent>
        ) : (
          <div className="divide-y divide-line">
            {Object.entries(groupByDate(photos))
              .slice(0, 5)
              .map(([date, datePhotos]) => (
                <div key={date} className="px-4 py-3">
                  <p className="num mb-2 text-sm font-semibold text-ink-2">
                    {formatDisplayDate(date)}
                  </p>
                  <div className="flex gap-2 overflow-x-auto">
                    {datePhotos.map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setSelectedPhoto(photo)}
                        className="relative size-24 shrink-0 overflow-hidden rounded-lg border border-line transition-colors hover:border-body"
                      >
                        {photo.thumb_data ? (
                          <img
                            src={photo.thumb_data}
                            alt={`${photo.photo_type} pose from ${formatDisplayDate(photo.date)}`}
                            className="size-full object-cover"
                          />
                        ) : (
                          <span
                            role="img"
                            aria-label={`${photo.photo_type} pose from ${formatDisplayDate(photo.date)}`}
                            className="block size-full bg-sunken"
                          />
                        )}
                        <span className="absolute inset-x-0 bottom-0 bg-ink py-0.5 text-center text-xs font-semibold capitalize text-canvas">
                          {photo.photo_type}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            <div className="p-4">
              <Button
                variant="secondary"
                onClick={openCapture}
                className="w-full"
              >
                <Camera size={18} />
                Add photo
              </Button>
            </div>
          </div>
        )}
      </Card>

      <PhotoCaptureModal
        isOpen={isCaptureOpen}
        onClose={closeCapture}
        photoType={photoType}
        onPhotoTypeChange={setPhotoType}
        notes={notes}
        onNotesChange={setNotes}
        isSaving={isSaving}
        error={error}
        onCapture={handleCapture}
      />

      {selectedPhoto && (
        <PhotoViewer
          photo={selectedPhoto}
          index={selectedIndex}
          total={photos.length}
          onClose={() => setSelectedPhoto(null)}
          onNavigate={navigate}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
