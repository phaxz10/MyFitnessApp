import { Play } from 'lucide-react';
import { ExerciseMark, Modal } from '../ui';

export interface ExerciseInfo {
  exerciseId: number;
  exerciseName: string;
  videoUrl: string | null;
  description: string;
  muscleGroups: string;
  equipment: string;
}

interface ExerciseInfoModalProps {
  info: ExerciseInfo | null;
  onClose: () => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="py-3">
      <h3 className="text-sm font-semibold text-ink-2">{label}</h3>
      <p className="mt-0.5 text-ink">{value}</p>
    </div>
  );
}

export function ExerciseInfoModal({ info, onClose }: ExerciseInfoModalProps) {
  const linkClass =
    'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 font-semibold transition';

  return (
    <Modal
      isOpen={!!info}
      onClose={onClose}
      title={info?.exerciseName || 'Exercise Info'}
    >
      {info && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <ExerciseMark
              name={info.exerciseName}
              muscleGroups={info.muscleGroups}
              size={56}
            />
            {info.equipment && (
              <p className="text-sm text-ink-2">{info.equipment}</p>
            )}
          </div>

          <div className="divide-y divide-line">
            <InfoRow label="Description" value={info.description} />
            <InfoRow label="Muscle Groups" value={info.muscleGroups} />
            <InfoRow label="Equipment" value={info.equipment} />
          </div>

          {info.videoUrl ? (
            <a
              href={info.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${linkClass} bg-train text-on-accent hover:brightness-110`}
            >
              <Play size={18} />
              Watch Tutorial
            </a>
          ) : (
            <a
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                `${info.exerciseName} exercise form tutorial`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${linkClass} border border-line-strong bg-surface text-ink hover:bg-sunken`}
            >
              <Play size={18} />
              Search on YouTube
            </a>
          )}
        </div>
      )}
    </Modal>
  );
}
