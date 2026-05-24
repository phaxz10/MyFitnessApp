import { Copy, Edit2, Trash2 } from 'lucide-react';
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

// Dense single-line row paired with DailySummaryCard's rings — the prototype
// confirmed this density read well even with many entries per meal.
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
    <div className="group flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-slate-700/30 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">
          {entry.food_description}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] tabular-nums">
          <span className="text-rose-400 font-semibold">
            {Math.round(entry.calories)}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-amber-300/80">
            P {Math.round(entry.protein_g)}
          </span>
          <span className="text-cyan-400/80">
            C {Math.round(entry.carbs_g)}
          </span>
          <span className="text-violet-400/80">
            F {Math.round(entry.fat_g)}
          </span>
        </div>
      </div>
      <div className="flex items-center opacity-50 group-hover:opacity-100 transition-opacity">
        <div className="relative">
          <button
            type="button"
            onClick={onToggleCopyMenu}
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-full"
            title="Copy to another meal"
          >
            <Copy size={14} />
          </button>
          {isCopyMenuOpen && (
            <div
              ref={copyMenuRef}
              className="absolute right-0 top-full mt-1 z-10 bg-slate-800 border border-slate-600 rounded-lg shadow-lg py-1 min-w-[140px]"
            >
              <p className="px-3 py-1 text-xs text-slate-400 border-b border-slate-700">
                Copy to:
              </p>
              {availableMealTargets.map((meal) => (
                <button
                  key={meal.value}
                  type="button"
                  onClick={() => onCopyToMeal(entry, meal.value)}
                  className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors"
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
          className="p-1.5 text-slate-400 hover:text-cyan-400 rounded-full"
        >
          <Edit2 size={14} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(entry)}
          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-full"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
