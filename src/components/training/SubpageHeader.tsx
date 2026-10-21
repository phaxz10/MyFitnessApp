import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

// Training-blue band for full-screen training pages (no app Header there).

interface SubpageHeaderProps {
  title: string;
  subtitle?: string | null;
  onBack: () => void;
  actions?: ReactNode;
}

export function SubpageHeader({
  title,
  subtitle,
  onBack,
  actions,
}: SubpageHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-train text-on-accent pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-1 pl-1 pr-1 min-h-14">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid place-items-center size-11 shrink-0 rounded-full hover:bg-white/15 transition"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 min-w-0 py-2">
          <h1 className="text-xl font-bold tracking-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-sm opacity-90 truncate">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

/** Icon button sized for the band. */
export function BandIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid place-items-center size-11 rounded-full hover:bg-white/15 transition"
    >
      {children}
    </button>
  );
}
