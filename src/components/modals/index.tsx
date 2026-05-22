import { MealEntryShell } from '../meal-entry/MealEntryShell';
import { WeightLogModal } from './WeightLogModal';

export function GlobalModalContainer() {
  return (
    <>
      <MealEntryShell />
      <WeightLogModal />
    </>
  );
}

export { WeightLogModal } from './WeightLogModal';
