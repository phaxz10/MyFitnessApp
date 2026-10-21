import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  onClick: () => void;
  label: string;
}

export function BackButton({ onClick, label }: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition hover:bg-sunken active:scale-[0.98]"
    >
      <ArrowLeft size={20} />
    </button>
  );
}
