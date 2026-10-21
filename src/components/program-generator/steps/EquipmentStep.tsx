import { Info } from 'lucide-react';
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_PRESETS,
} from '../../../constants/equipment';
import type { EquipmentType } from '../../../types';
import { ToggleChip } from '../../training/ToggleChip';
import { StepQuestion } from './OptionButton';

interface EquipmentStepProps {
  selectedEquipment: EquipmentType[];
  onPreset: (presetKey: keyof typeof EQUIPMENT_PRESETS) => void;
  onToggle: (equipment: EquipmentType) => void;
}

export function EquipmentStep({
  selectedEquipment,
  onPreset,
  onToggle,
}: EquipmentStepProps) {
  return (
    <div className="space-y-6">
      <section>
        <StepQuestion>Quick Setup</StepQuestion>
        <div className="grid grid-cols-2 gap-2">
          {(
            Object.entries(EQUIPMENT_PRESETS) as [
              keyof typeof EQUIPMENT_PRESETS,
              (typeof EQUIPMENT_PRESETS)[keyof typeof EQUIPMENT_PRESETS],
            ][]
          ).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              onClick={() => onPreset(key)}
              className="min-h-11 p-3 rounded-xl bg-sunken text-left hover:bg-sunken-strong transition-colors"
            >
              <span className="block font-semibold text-ink">
                {preset.label}
              </span>
              <span className="block text-ink-2 text-sm">
                {preset.description}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <StepQuestion>Available Equipment</StepQuestion>
        <p className="flex items-center gap-1.5 text-ink-2 text-sm mb-3">
          <Info size={14} aria-hidden="true" />
          Bodyweight and Resistance Bands are always available
        </p>

        <div className="space-y-4">
          {(
            Object.entries(EQUIPMENT_CATEGORIES) as [
              string,
              { label: string; items: EquipmentType[] },
            ][]
          ).map(([key, category]) => (
            <div key={key}>
              <p className="text-sm font-semibold text-ink-2 mb-2">
                {category.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {category.items.map((equipment) => (
                  <ToggleChip
                    key={equipment}
                    selected={selectedEquipment.includes(equipment)}
                    onToggle={() => onToggle(equipment)}
                  >
                    {equipment}
                  </ToggleChip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-ink-2" aria-live="polite">
        {selectedEquipment.length === 0 ? (
          'Using bodyweight exercises only'
        ) : (
          <>
            <span className="num font-semibold text-ink">
              {selectedEquipment.length}
            </span>{' '}
            equipment type{selectedEquipment.length > 1 ? 's' : ''} selected
          </>
        )}
      </p>
    </div>
  );
}
