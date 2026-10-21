import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
}

const SIZE = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  full: 'sm:max-w-2xl',
};

// Bottom sheet on phones (thumb reach), centred dialog from sm up.
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/50 w-full h-full cursor-default"
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`relative bg-surface w-full ${SIZE[size]} max-h-[92dvh] rounded-t-2xl sm:rounded-2xl shadow-[0_-8px_32px_rgb(0_0_0/0.18)] overflow-hidden flex flex-col pb-[env(safe-area-inset-bottom)]`}
      >
        {title && (
          <div className="flex items-center justify-between pl-4 pr-1.5 h-14 border-b border-line shrink-0">
            <h2 id={titleId} className="text-lg font-bold text-ink">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="grid place-items-center size-11 rounded-full text-ink-2 hover:bg-sunken hover:text-ink transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
