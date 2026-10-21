import { ChevronLeft, Loader2, Minus, Plus, Sparkles, X } from 'lucide-react';
import { Button } from '../ui';
import type { EditableFoodItem } from './aiResults';

// Small pieces shared by the AI text and AI photo adapters.

export function BackLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 h-11 -ml-2 px-2 text-ink-2 hover:text-ink text-sm font-medium"
    >
      <ChevronLeft size={18} aria-hidden="true" />
      {children}
    </button>
  );
}

export function AnalyzingState({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12"
      role="status"
    >
      <Loader2
        size={40}
        className="text-ink animate-spin mb-4"
        aria-hidden="true"
      />
      <p className="text-ink font-semibold">{label}</p>
      <p className="text-ink-2 text-sm">This may take a few seconds</p>
    </div>
  );
}

const STEP_BUTTON =
  'grid place-items-center size-11 rounded-lg bg-surface border border-line-strong text-ink hover:bg-sunken-strong';

interface FoodItemListProps {
  items: EditableFoodItem[];
  onPortionChange: (index: number, grams: number) => void;
  onRemove: (index: number) => void;
}

// Editable AI results: name, macros in condensed numerals, 5 g portion stepper.
export function FoodItemList({
  items,
  onPortionChange,
  onRemove,
}: FoodItemListProps) {
  return (
    <ul className="rounded-xl bg-sunken divide-y divide-line">
      {items.map((item, index) => (
        <li key={item.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-ink font-semibold text-sm">{item.name}</p>
              <p className="num text-sm text-ink-2">
                <span className="font-bold text-ink">
                  {Math.round(item.calories)}
                </span>{' '}
                kcal · P {Math.round(item.protein_g)} · C{' '}
                {Math.round(item.carbs_g)} · F {Math.round(item.fat_g)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="grid place-items-center size-11 -mt-2 -mr-2 text-ink-2 hover:text-danger"
              aria-label={`Remove ${item.name}`}
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() =>
                onPortionChange(index, Math.max(5, item.portion_grams - 5))
              }
              className={STEP_BUTTON}
              aria-label={`Decrease ${item.name} portion`}
            >
              <Minus size={16} />
            </button>
            <span className="num text-ink font-bold min-w-[64px] text-center">
              {Math.round(item.portion_grams / 5) * 5}
              <span className="text-ink-3 font-normal text-sm"> g</span>
            </span>
            <button
              type="button"
              onClick={() => onPortionChange(index, item.portion_grams + 5)}
              className={STEP_BUTTON}
              aria-label={`Increase ${item.name} portion`}
            >
              <Plus size={16} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface AIActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: string;
}

// Primary AI action: neutral ink, never a discipline colour.
export function AIActionButton({
  onClick,
  disabled,
  children,
}: AIActionButtonProps) {
  return (
    <Button
      tone="ink"
      size="lg"
      className="w-full"
      onClick={onClick}
      disabled={disabled}
    >
      <Sparkles size={18} aria-hidden="true" />
      {children}
    </Button>
  );
}
