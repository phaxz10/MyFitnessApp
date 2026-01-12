import { FoodLogModal } from './FoodLogModal';
import { WeightLogModal } from './WeightLogModal';

export function GlobalModalContainer() {
  return (
    <>
      <FoodLogModal />
      <WeightLogModal />
    </>
  );
}

export { FoodLogModal } from './FoodLogModal';
export { WeightLogModal } from './WeightLogModal';
