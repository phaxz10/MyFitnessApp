import { Camera, ChevronRight, FileText, PenLine } from 'lucide-react';
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

  const adapterToRender = resolveAdapter(
    foodLogModal.mode,
    availableAdapters,
  );

  const handleSubmitted = () => {
    foodLogModal.onSuccess?.();
    closeFoodLogModal();
  };

  const handleBack =
    availableAdapters.length > 1
      ? () => setFoodLogModalMode('picker')
      : undefined;

  const title = titleFor(adapterToRender, foodLogModal.date);
  const isResultsSize = adapterToRender === 'ai_text' || adapterToRender === 'ai_image';

  return (
    <Modal
      isOpen={foodLogModal.isOpen}
      onClose={closeFoodLogModal}
      title={title}
      size={isResultsSize ? 'md' : 'sm'}
    >
      {adapterToRender === 'picker' && (
        <PickerView
          aiAvailable={aiAvailable}
          onPick={setFoodLogModalMode}
        />
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

function titleFor(
  adapter: 'picker' | AdapterId,
  date: string,
): string {
  const dateStr = formatDisplayDate(date);
  switch (adapter) {
    case 'manual':
      return `Manual Entry — ${dateStr}`;
    case 'ai_text':
      return `Log Food — ${dateStr}`;
    case 'ai_image':
      return `Scan Meal — ${dateStr}`;
    default:
      return `Log Food — ${dateStr}`;
  }
}

interface PickerViewProps {
  aiAvailable: boolean;
  onPick: (mode: AdapterId) => void;
}

function PickerView({ aiAvailable, onPick }: PickerViewProps) {
  return (
    <div className="space-y-3">
      <p className="text-slate-400 text-sm text-center mb-4">
        How would you like to log your meal?
      </p>

      {aiAvailable && (
        <>
          <button
            type="button"
            onClick={() => onPick('ai_text')}
            className="w-full flex items-center gap-4 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <div className="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText size={24} className="text-blue-400" />
            </div>
            <div className="text-left flex-1">
              <p className="text-white font-medium">Log by Text</p>
              <p className="text-slate-400 text-sm">
                Describe your meal for AI analysis
              </p>
            </div>
            <ChevronRight size={20} className="text-slate-500" />
          </button>

          <button
            type="button"
            onClick={() => onPick('ai_image')}
            className="w-full flex items-center gap-4 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <div className="w-12 h-12 bg-purple-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Camera size={24} className="text-purple-400" />
            </div>
            <div className="text-left flex-1">
              <p className="text-white font-medium">Scan Meal</p>
              <p className="text-slate-400 text-sm">
                Take a photo for AI analysis
              </p>
            </div>
            <ChevronRight size={20} className="text-slate-500" />
          </button>
        </>
      )}

      <button
        type="button"
        onClick={() => onPick('manual')}
        className="w-full flex items-center gap-4 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
      >
        <div className="w-12 h-12 bg-green-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <PenLine size={24} className="text-green-400" />
        </div>
        <div className="text-left flex-1">
          <p className="text-white font-medium">Manual Entry</p>
          <p className="text-slate-400 text-sm">
            Enter macros directly (works offline)
          </p>
        </div>
        <ChevronRight size={20} className="text-slate-500" />
      </button>
    </div>
  );
}
