import {
  Camera,
  ChevronRight,
  type LucideIcon,
  PenLine,
  Sparkles,
} from 'lucide-react';
import { useMemo } from 'react';
import { useAppStore } from '../../hooks/useAppStore';
import { useAICapability } from '../../services/ai/useAICapability';
import { formatDisplayDate } from '../../utils/date';
import { Modal } from '../ui';
import { AIImageEntryAdapter } from './AIImageEntryAdapter';
import { AITextEntryAdapter } from './AITextEntryAdapter';
import { ManualEntryAdapter } from './ManualEntryAdapter';

type AdapterId = 'manual' | 'ai_text' | 'ai_image';

export function MealEntryShell() {
  const { foodLogModal, closeFoodLogModal, setFoodLogModalMode, isOnline } =
    useAppStore();
  const capability = useAICapability();

  const aiAvailable = capability.available && isOnline;

  const availableAdapters = useMemo<AdapterId[]>(() => {
    const list: AdapterId[] = ['manual'];
    if (aiAvailable) list.push('ai_text', 'ai_image');
    return list;
  }, [aiAvailable]);

  const adapterToRender = resolveAdapter(foodLogModal.mode, availableAdapters);

  const handleSubmitted = () => {
    foodLogModal.onSuccess?.();
    closeFoodLogModal();
  };

  const handleBack =
    availableAdapters.length > 1
      ? () => setFoodLogModalMode('picker')
      : undefined;

  const title = titleFor(adapterToRender, foodLogModal.date);
  const isResultsSize =
    adapterToRender === 'ai_text' || adapterToRender === 'ai_image';

  return (
    <Modal
      isOpen={foodLogModal.isOpen}
      onClose={closeFoodLogModal}
      title={title}
      size={isResultsSize ? 'md' : 'sm'}
    >
      {adapterToRender === 'picker' && (
        <PickerView aiAvailable={aiAvailable} onPick={setFoodLogModalMode} />
      )}
      {adapterToRender === 'manual' && (
        <ManualEntryAdapter
          date={foodLogModal.date}
          initialMealType={foodLogModal.mealType}
          onSubmitted={handleSubmitted}
          onBack={handleBack}
        />
      )}
      {adapterToRender === 'ai_text' && (
        <AITextEntryAdapter
          date={foodLogModal.date}
          initialMealType={foodLogModal.mealType}
          onSubmitted={handleSubmitted}
          onBack={handleBack}
        />
      )}
      {adapterToRender === 'ai_image' && (
        <AIImageEntryAdapter
          date={foodLogModal.date}
          initialMealType={foodLogModal.mealType}
          onSubmitted={handleSubmitted}
          onBack={handleBack}
        />
      )}
    </Modal>
  );
}

function resolveAdapter(
  mode: 'picker' | AdapterId,
  available: AdapterId[],
): 'picker' | AdapterId {
  if (mode === 'picker') {
    if (available.length === 1) return available[0];
    return 'picker';
  }
  if (available.includes(mode)) return mode;
  return available[0];
}

function titleFor(adapter: 'picker' | AdapterId, date: string): string {
  const dateStr = formatDisplayDate(date);
  switch (adapter) {
    case 'manual':
      return `Manual entry - ${dateStr}`;
    case 'ai_text':
      return `Log food - ${dateStr}`;
    case 'ai_image':
      return `Scan meal - ${dateStr}`;
    default:
      return `Log food - ${dateStr}`;
  }
}

interface PickerViewProps {
  aiAvailable: boolean;
  onPick: (mode: AdapterId) => void;
}

function PickerView({ aiAvailable, onPick }: PickerViewProps) {
  return (
    <div className="space-y-3">
      <p className="text-ink-2 text-sm">How would you like to log your meal?</p>

      {aiAvailable && (
        <>
          <PickerRow
            icon={Sparkles}
            tile="bg-sunken text-ink"
            title="Log by text"
            hint="Describe your meal for AI analysis"
            onClick={() => onPick('ai_text')}
          />
          <PickerRow
            icon={Camera}
            tile="bg-sunken text-ink"
            title="Scan meal"
            hint="Take a photo for AI analysis"
            onClick={() => onPick('ai_image')}
          />
        </>
      )}

      <PickerRow
        icon={PenLine}
        tile="bg-eat-soft text-eat-ink"
        title="Manual entry"
        hint="Enter macros directly (works offline)"
        onClick={() => onPick('manual')}
      />
    </div>
  );
}

interface PickerRowProps {
  icon: LucideIcon;
  tile: string;
  title: string;
  hint: string;
  onClick: () => void;
}

function PickerRow({ icon: Icon, tile, title, hint, onClick }: PickerRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-4 p-3 rounded-xl border border-line hover:border-line-strong hover:bg-sunken transition-colors"
    >
      <span
        className={`grid place-items-center size-12 rounded-lg shrink-0 ${tile}`}
      >
        <Icon size={24} aria-hidden="true" />
      </span>
      <span className="text-left flex-1">
        <span className="block text-ink font-semibold">{title}</span>
        <span className="block text-ink-2 text-sm">{hint}</span>
      </span>
      <ChevronRight size={20} className="text-ink-3" aria-hidden="true" />
    </button>
  );
}
