import { X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    full: 'max-w-full mx-4',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm w-full h-full cursor-default"
        onClick={onClose}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div
        className={`relative bg-slate-800 rounded-xl border border-slate-700 w-full ${sizeStyles[size]} max-h-[90vh] overflow-hidden flex flex-col`}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-700">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">{children}</div>
      </div>
    </div>
  );
}
