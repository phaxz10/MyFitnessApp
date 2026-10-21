import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MacroLegend } from '../nutrition';
import { Button, Card } from '../ui';
import { ModuleHeading } from './ModuleHeading';

interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface NutritionModuleProps {
  consumed: Macros;
  targets: Macros;
  meals: { type: string; items: number; calories: number }[];
  onLogFood: () => void;
}

export function NutritionModule({
  consumed,
  targets,
  meals,
  onLogFood,
}: NutritionModuleProps) {
  const remaining = targets.calories - consumed.calories;
  const over = remaining < 0;

  return (
    <Card>
      <div className="px-4 pt-1">
        <ModuleHeading
          discipline="eat"
          action={
            <Link
              to="/calories"
              className="text-eat-ink text-sm font-semibold hover:underline inline-flex items-center h-11"
            >
              Details
            </Link>
          }
        >
          Nutrition
        </ModuleHeading>
      </div>

      <div className="px-4 pb-4 space-y-4">
        <div>
          <p className="num leading-none">
            <span
              className={`text-6xl font-bold ${over ? 'text-danger' : 'text-ink'}`}
            >
              {Math.abs(Math.round(remaining)).toLocaleString()}
            </span>
            <span className="text-ink-2 text-lg font-semibold">
              {' '}
              kcal {over ? 'over' : 'left'}
            </span>
          </p>
          <p className="num text-ink-3 text-sm mt-1.5">
            {Math.round(consumed.calories).toLocaleString()} of{' '}
            {Math.round(targets.calories).toLocaleString()} kcal eaten
          </p>
        </div>

        <MacroLegend
          consumed={consumed}
          targets={targets}
          showCalories={false}
        />
      </div>

      <div className="border-t border-line">
        {meals.length === 0 ? (
          <p className="px-4 py-3 text-ink-3 text-sm">
            No meals logged yet today.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {meals.map((meal) => (
              <li
                key={meal.type}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5"
              >
                <span className="text-ink capitalize">
                  {meal.type}
                  <span className="text-ink-3 text-sm">
                    {' '}
                    · {meal.items} {meal.items === 1 ? 'item' : 'items'}
                  </span>
                </span>
                <span className="num text-ink-2">
                  <span className="font-bold text-ink">
                    {Math.round(meal.calories)}
                  </span>{' '}
                  kcal
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4 border-t border-line">
        <Button tone="eat" size="lg" className="w-full" onClick={onLogFood}>
          <Plus size={18} aria-hidden="true" />
          Log food
        </Button>
      </div>
    </Card>
  );
}
