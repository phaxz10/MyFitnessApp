import { type ReactNode, useEffect, useState } from 'react';

// Small anchored action menu with its own click-outside layer.

interface MenuProps {
  label: string;
  trigger: ReactNode;
  triggerClassName: string;
  children: (close: () => void) => ReactNode;
  minWidth?: string;
}

export function Menu({
  label,
  trigger,
  triggerClassName,
  children,
  minWidth = 'min-w-44',
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 w-full h-full cursor-default"
            onClick={close}
            aria-label="Close menu"
            tabIndex={-1}
          />
          <div
            role="menu"
            className={`absolute right-0 top-full mt-1 z-30 bg-surface border border-line rounded-xl shadow-lg overflow-hidden divide-y divide-line ${minWidth}`}
          >
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}

interface MenuItemProps {
  icon: ReactNode;
  onSelect: () => void;
  children: ReactNode;
  description?: string;
  danger?: boolean;
}

export function MenuItem({
  icon,
  onSelect,
  children,
  description,
  danger = false,
}: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`w-full min-h-11 px-4 py-2.5 text-left flex items-center gap-3 hover:bg-sunken transition-colors ${
        danger ? 'text-danger' : 'text-ink'
      }`}
    >
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className="block font-medium">{children}</span>
        {description && (
          <span className="block text-sm text-ink-3">{description}</span>
        )}
      </span>
    </button>
  );
}
