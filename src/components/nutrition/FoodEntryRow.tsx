import { Copy, Pencil, Trash2 } from 'lucide-react';
import type { RefObject } from 'react';
import type { FoodEntry, MealType } from '../../types';

export interface FoodEntryRowProps {
  entry: FoodEntry;
  onEdit: (entry: FoodEntry) => void;
  onDelete: (entry: FoodEntry) => void;
  onCopyToMeal: (entry: FoodEntry, target: MealType) => void;
  isCopyMenuOpen: boolean;
  onToggleCopyMenu: () => void;
  copyMenuRef: RefObject<HTMLDivElement | null>;
  availableMealTargets: { value: MealType; label: string }[];
}

const ICON_BUTTON =
  'grid place-items-center size-11 rounded-lg text-ink-2 hover:bg-sunken hover:text-ink transition-colors';

// Ruled row: description, then kcal and macros in condensed numerals. Actions
// stay visible (touch devices have no hover).
export function FoodEntryRow({
  entry,
  onEdit,
  onDelete,
  onCopyToMeal,
  isCopyMenuOpen,
  onToggleCopyMenu,
  copyMenuRef,
  availableMealTargets,
}: FoodEntryRowProps) {
  return (
    <div className="flex items-center gap-1 py-1 pl-4 pr-1">
      <div className="flex-1 min-w-0 py-1">
        <p className="text-ink text-sm font-medium truncate">
          {entry.food_description}
        </p>
        <p className="num mt-0.5 flex items-baseline gap-2.5 text-sm">
          <span className="font-bold text-ink">
            {Math.round(entry.calories)}
            <span className="text-ink-3 font-normal"> kcal</span>
          </span>
          <span className="text-macro-protein">
            P {Math.round(entry.protein_g)}
          </span>
          <span className="text-macro-carbs">
            C {Math.round(entry.carbs_g)}
          </span>
          <span className="text-macro-fat">F {Math.round(entry.fat_g)}</span>
        </p>
      </div>
      <div className="flex items-center">
        <div className="relative">
          <button
            type="button"
            onClick={onToggleCopyMenu}
            className={ICON_BUTTON}
            aria-label="Copy to another meal"
            aria-expanded={isCopyMenuOpen}
          >
            <Copy size={16} />
          </button>
          {isCopyMenuOpen && (
            <div
              ref={copyMenuRef}
              className="absolute right-0 top-full mt-1 z-10 bg-surface border border-line-strong rounded-xl py-1 min-w-[160px]"
            >
              <p className="px-3 py-1.5 text-sm font-semibold text-ink-2 border-b border-line">
                Copy to
              </p>
              {availableMealTargets.map((meal) => (
                <button
                  key={meal.value}
                  type="button"
                  onClick={() => onCopyToMeal(entry, meal.value)}
                  className="w-full h-11 px-3 text-left text-sm text-ink hover:bg-sunken transition-colors"
                >
                  {meal.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onEdit(entry)}
          className={ICON_BUTTON}
          aria-label={`Edit ${entry.food_description}`}
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(entry)}
          className={`${ICON_BUTTON} hover:text-danger`}
          aria-label={`Delete ${entry.food_description}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
