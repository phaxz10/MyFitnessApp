import { useAppStore } from '../../hooks/useAppStore';
import type { AIProvider } from '../../types';

// Capability is a configuration concept (ADR-0001, amended for multi-provider
// in ADR-0005). It answers: is the active provider+model+key triple set?
export type AICapability =
  | { available: true; provider: AIProvider; model: string }
  | { available: false; reason: 'no_key' };

function deriveCapability(
  provider: AIProvider | undefined,
  model: string | undefined,
  apiKey: string | null | undefined,
): AICapability {
  if (provider && model && apiKey && apiKey.length > 0) {
    return { available: true, provider, model };
  }
  return { available: false, reason: 'no_key' };
}

export function useAICapability(): AICapability {
  const provider = useAppStore((state) => state.userProfile?.ai_provider);
  const model = useAppStore((state) => state.userProfile?.ai_model);
  const apiKey = useAppStore((state) => state.userProfile?.ai_api_key);
  return deriveCapability(provider, model, apiKey);
}

export function getAICapability(): AICapability {
  const profile = useAppStore.getState().userProfile;
  return deriveCapability(
    profile?.ai_provider,
    profile?.ai_model,
    profile?.ai_api_key,
  );
}
