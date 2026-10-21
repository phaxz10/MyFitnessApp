import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '../ui';
import { DISCIPLINE_SOFT, type Discipline } from '../ui/discipline';

// iOS-settings style grouping: a section label above one hairline module
// whose rows are separated by dividers.

interface SettingsSectionProps {
  title: string;
  /** Use for destructive groups: tints the label with the danger colour. */
  danger?: boolean;
  children: ReactNode;
}

export function SettingsSection({
  title,
  danger,
  children,
}: SettingsSectionProps) {
  return (
    <section className="space-y-2">
      <h2
        className={`px-1 text-sm font-semibold ${danger ? 'text-danger' : 'text-ink-2'}`}
      >
        {title}
      </h2>
      <Card className="divide-y divide-line overflow-hidden">{children}</Card>
    </section>
  );
}

interface IconChipProps {
  icon: ReactNode;
  discipline?: Discipline;
  /** Overrides the discipline tint, e.g. `bg-warn-soft text-warn`. */
  tone?: string;
}

function IconChip({ icon, discipline = 'neutral', tone }: IconChipProps) {
  return (
    <span
      aria-hidden="true"
      className={`grid place-items-center size-9 rounded-lg shrink-0 ${tone ?? DISCIPLINE_SOFT[discipline]}`}
    >
      {icon}
    </span>
  );
}

const ROW =
  'w-full min-h-14 px-4 py-2.5 flex items-center gap-3 text-left transition-colors hover:bg-sunken active:bg-sunken focus-within:bg-sunken';

interface SettingsRowProps extends IconChipProps {
  title: string;
  summary: string;
  /** Class for the summary line, e.g. `text-warn` for a problem state. */
  summaryClass?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

// Row that expands in place to reveal its form or panel.
export function SettingsRow({
  icon,
  discipline,
  tone,
  title,
  summary,
  summaryClass = 'text-ink-2',
  isOpen,
  onToggle,
  children,
}: SettingsRowProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={ROW}
      >
        <IconChip icon={icon} discipline={discipline} tone={tone} />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-ink">{title}</span>
          <span className={`block text-sm truncate ${summaryClass}`}>
            {summary}
          </span>
        </span>
        <ChevronRight
          size={20}
          aria-hidden="true"
          className={`text-ink-3 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-4 py-4 border-t border-line bg-canvas">
          {children}
        </div>
      )}
    </div>
  );
}

interface SettingsActionRowProps extends IconChipProps {
  label: string;
  hint?: string;
  danger?: boolean;
  onClick?: () => void;
  href?: string;
}

// Row that performs an action directly (no expansion).
export function SettingsActionRow({
  icon,
  discipline,
  tone,
  label,
  hint,
  danger,
  onClick,
  href,
}: SettingsActionRowProps) {
  const chipTone = danger ? 'bg-danger-soft text-danger' : tone;
  const content = (
    <>
      <IconChip icon={icon} discipline={discipline} tone={chipTone} />
      <span className="flex-1 min-w-0">
        <span
          className={`block font-semibold ${danger ? 'text-danger' : 'text-ink'}`}
        >
          {label}
        </span>
        {hint && <span className="block text-sm text-ink-2">{hint}</span>}
      </span>
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={ROW}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={ROW}>
      {content}
    </button>
  );
}

interface SettingsFileRowProps extends IconChipProps {
  label: string;
  hint?: string;
  accept: string;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// Row that opens the file picker. The input is visually hidden but stays
// keyboard-focusable; the row highlights while it has focus.
export function SettingsFileRow({
  icon,
  discipline,
  tone,
  label,
  hint,
  accept,
  onFile,
}: SettingsFileRowProps) {
  return (
    <label className={`${ROW} cursor-pointer`}>
      <IconChip icon={icon} discipline={discipline} tone={tone} />
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-ink">{label}</span>
        {hint && <span className="block text-sm text-ink-2">{hint}</span>}
      </span>
      <input
        type="file"
        accept={accept}
        onChange={onFile}
        className="sr-only"
      />
    </label>
  );
}
