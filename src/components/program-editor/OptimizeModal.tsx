import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import {
  ALL_EQUIPMENT,
  EQUIPMENT_CATEGORIES,
  EXPERIENCE_LEVELS,
  MUSCLE_GROUPS,
  TRAINING_SPLITS,
} from '../../constants/equipment';
import type { EquipmentType, ExperienceLevel } from '../../types';
import { ToggleChip } from '../training/ToggleChip';
import { Button, Input, Modal, Select, TextArea } from '../ui';
import type { OptimizePreferences } from './optimize';

interface OptimizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOptimizing: boolean;
  error: string | null;
  canOptimize: boolean;
  onOptimize: (prefs: OptimizePreferences) => void;
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

// Preferences live here so they persist between openings (the component
// stays mounted; Modal only hides its content).
export function OptimizeModal({
  isOpen,
  onClose,
  isOptimizing,
  error,
  canOptimize,
  onOptimize,
}: OptimizeModalProps) {
  const [experienceLevel, setExperienceLevel] =
    useState<ExperienceLevel>('intermediate');
  const [preferredSplit, setPreferredSplit] =
    useState<OptimizePreferences['preferredSplit']>('auto');
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(60);
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [injuries, setInjuries] = useState('');
  const [availableEquipment, setAvailableEquipment] =
    useState<EquipmentType[]>(ALL_EQUIPMENT);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Improve with AI">
      <div className="space-y-5">
        <p className="text-ink-2">
          AI rebalances your program for these preferences. You can review and
          undo the result before saving.
        </p>

        <Select
          id="optimize-experience"
          label="Experience Level"
          value={experienceLevel}
          onChange={(e) =>
            setExperienceLevel(e.target.value as ExperienceLevel)
          }
          options={Object.entries(EXPERIENCE_LEVELS).map(([key, val]) => ({
            value: key,
            label: `${val.label} - ${val.description}`,
          }))}
        />

        <Select
          id="optimize-split"
          label="Preferred Training Split"
          value={preferredSplit ?? 'auto'}
          onChange={(e) =>
            setPreferredSplit(
              e.target.value as OptimizePreferences['preferredSplit'],
            )
          }
          options={Object.entries(TRAINING_SPLITS).map(([key, val]) => ({
            value: key,
            label: `${val.label} - ${val.description}`,
          }))}
        />

        <Input
          id="optimize-duration"
          label="Session Duration (minutes)"
          type="number"
          inputMode="numeric"
          className="num"
          value={sessionDurationMinutes}
          onChange={(e) =>
            setSessionDurationMinutes(parseInt(e.target.value, 10) || 60)
          }
          min={20}
          max={180}
        />

        <fieldset>
          <legend className="text-sm font-semibold text-ink-2 mb-1.5">
            Focus Areas (optional)
          </legend>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_GROUPS.map((muscle) => (
              <ToggleChip
                key={muscle}
                selected={focusAreas.includes(muscle)}
                onToggle={() => setFocusAreas((prev) => toggle(prev, muscle))}
              >
                {muscle}
              </ToggleChip>
            ))}
          </div>
        </fieldset>

        <TextArea
          id="optimize-injuries"
          label="Injuries / Limitations (optional)"
          value={injuries}
          onChange={(e) => setInjuries(e.target.value)}
          placeholder="e.g., Bad lower back, shoulder impingement..."
          rows={2}
        />

        <fieldset>
          <legend className="text-sm font-semibold text-ink-2 mb-1.5">
            Available Equipment
          </legend>
          <div className="space-y-3">
            {Object.entries(EQUIPMENT_CATEGORIES).map(
              ([categoryKey, category]) => (
                <div key={categoryKey}>
                  <p className="text-sm text-ink-3 mb-1.5">{category.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {category.items.map((item) => (
                      <ToggleChip
                        key={item}
                        selected={availableEquipment.includes(item)}
                        onToggle={() =>
                          setAvailableEquipment((prev) => toggle(prev, item))
                        }
                      >
                        {item}
                      </ToggleChip>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        </fieldset>

        {error && (
          <p
            role="alert"
            className="p-3 bg-danger-soft rounded-lg text-danger text-sm"
          >
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={isOptimizing}
          >
            Cancel
          </Button>
          <Button
            tone="ink"
            type="button"
            className="flex-1"
            isLoading={isOptimizing}
            disabled={!canOptimize}
            onClick={() =>
              onOptimize({
                experienceLevel,
                preferredSplit,
                sessionDurationMinutes,
                focusAreas,
                injuries,
                availableEquipment,
              })
            }
          >
            {!isOptimizing && <Sparkles size={18} aria-hidden="true" />}
            {isOptimizing ? 'Improving...' : 'Improve program'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
