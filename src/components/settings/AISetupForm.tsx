import {
  API_KEY_URL,
  PROVIDER_BLURB,
  PROVIDER_LABEL,
} from '../../constants/aiProviders';
import { Input } from '../ui';
import { ModelCombobox } from './ModelCombobox';

// Single source of truth for the OpenRouter model+key setup form (ADR-0007).
// Reused by Onboarding (in-flow step) and Settings (collapsible card). Plain
// controlled component — callers wire it into their own form state. The
// provider is no longer selectable: OpenRouter is the one transport.

export interface AISetupValue {
  /** OpenRouter model id (e.g. `openai/gpt-4o-mini`). */
  model: string | undefined;
  apiKey: string;
}

interface AISetupFormProps {
  value: AISetupValue;
  onChange: (value: AISetupValue) => void;
  /** Hide the introductory copy; useful when embedded in Settings. */
  compact?: boolean;
}

const API_KEY_PLACEHOLDER = 'sk-or-...';

export function AISetupForm({ value, onChange, compact }: AISetupFormProps) {
  return (
    <div className="space-y-4">
      {!compact && (
        <p className="text-slate-400 text-sm">
          Paste your OpenRouter API key and pick a model to enable AI features.
          You can change this any time in Settings.
        </p>
      )}

      <div>
        <label
          htmlFor="ai-model"
          className="block text-sm font-medium text-slate-300 mb-2"
        >
          Model
        </label>
        <ModelCombobox
          value={value.model ?? ''}
          onChange={(next) => onChange({ ...value, model: next })}
        />
        {!compact && (
          <p className="text-slate-500 text-xs mt-1">{PROVIDER_BLURB}</p>
        )}
      </div>

      <div>
        <Input
          label={`${PROVIDER_LABEL} API Key`}
          type="password"
          value={value.apiKey}
          onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
          placeholder={API_KEY_PLACEHOLDER}
          autoComplete="off"
        />
        <a
          href={API_KEY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 text-xs hover:underline mt-1 inline-block"
        >
          Get your {PROVIDER_LABEL} API key
        </a>
      </div>
    </div>
  );
}
