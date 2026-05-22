import { useAppStore } from '../../hooks/useAppStore';

export type AICapability =
  | { available: true }
  | { available: false; reason: 'no_key' };

function deriveCapability(apiKey: string | null | undefined): AICapability {
  if (apiKey && apiKey.length > 0) {
    return { available: true };
  }
  return { available: false, reason: 'no_key' };
}

export function useAICapability(): AICapability {
  const apiKey = useAppStore((state) => state.userProfile?.openai_api_key);
  return deriveCapability(apiKey);
}

export function getAICapability(): AICapability {
  const apiKey = useAppStore.getState().userProfile?.openai_api_key;
  return deriveCapability(apiKey);
}
