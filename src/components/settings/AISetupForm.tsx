import {
  DEFAULT_MODEL_BY_PROVIDER,
  MODELS_BY_PROVIDER,
  PROVIDER_OPTIONS,
} from '../../constants/aiProviders';
import type { AIProvider } from '../../types';
import { Input } from '../ui';

// Single source of truth for the provider+model+key+(advanced proxy) form.
// Reused by Onboarding (in-flow step) and Settings (collapsible card). Plain
// controlled component — callers wire it into their own form state.

export interface AISetupValue {
  provider: AIProvider | undefined;
  model: string | undefined;
  apiKey: string;
  proxyUrl: string;
}

interface AISetupFormProps {
  value: AISetupValue;
  onChange: (value: AISetupValue) => void;
  /** Hide the introductory copy; useful when embedded in Settings. */
  compact?: boolean;
}

export function AISetupForm({ value, onChange, compact }: AISetupFormProps) {
  const provider = value.provider;
  const activeProviderOption = provider
    ? PROVIDER_OPTIONS.find((p) => p.id === provider)
    : undefined;
  const models = provider ? MODELS_BY_PROVIDER[provider] : [];

  const setProvider = (next: AIProvider) => {
    onChange({
      ...value,
      provider: next,
      // Auto-fill the recommended model when switching providers.
      model: DEFAULT_MODEL_BY_PROVIDER[next],
    });
  };

  return (
    <div className="space-y-4">
      {!compact && (
        <p className="text-slate-400 text-sm">
          Pick an AI provider and paste an API key to enable AI features. You
          can change this any time in Settings.
        </p>
      )}

      <div>
        <p className="block text-sm font-medium text-slate-300 mb-2">
          Provider
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PROVIDER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setProvider(opt.id)}
              className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                provider === opt.id
                  ? 'border-blue-500 bg-blue-500/10 text-white'
                  : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {activeProviderOption && (
          <p className="text-slate-500 text-xs mt-2">
            {activeProviderOption.blurb}
          </p>
        )}
      </div>

      {provider && (
        <>
          <div>
            <label
              htmlFor="ai-model"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Model
            </label>
            <select
              id="ai-model"
              value={value.model ?? ''}
              onChange={(e) => onChange({ ...value, model: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Input
              label="API Key"
              type="password"
              value={value.apiKey}
              onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
              placeholder={
                provider === 'openai'
                  ? 'sk-...'
                  : provider === 'anthropic'
                    ? 'sk-ant-...'
                    : 'AIza...'
              }
              autoComplete="off"
            />
            {activeProviderOption && (
              <a
                href={activeProviderOption.apiKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 text-xs hover:underline mt-1 inline-block"
              >
                Get your {activeProviderOption.label} API key
              </a>
            )}
          </div>

          {provider === 'openai' && (
            <details className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
              <summary className="text-sm text-slate-300 cursor-pointer select-none">
                Advanced: OpenAI proxy URL
              </summary>
              <div className="mt-3 space-y-2">
                <Input
                  label="Proxy URL (optional)"
                  type="url"
                  value={value.proxyUrl}
                  onChange={(e) =>
                    onChange({ ...value, proxyUrl: e.target.value })
                  }
                  placeholder="https://your-worker.workers.dev"
                />
                <p className="text-slate-400 text-xs leading-relaxed">
                  OpenAI's <code className="text-slate-300">web_search</code>{' '}
                  tool requires the Responses API, which has CORS restrictions
                  in browsers. Deploy the included Cloudflare Worker (see{' '}
                  <code className="text-slate-300">worker/README.md</code>) and
                  paste its URL to enable web search for OpenAI. Without it,
                  OpenAI still works for everything else.
                </p>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
