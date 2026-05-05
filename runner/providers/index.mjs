import {
  GOOGLE_AI_MODE_PROVIDER,
  googleAiModeProvider,
} from "./google-ai-mode.mjs";
import { MISTRAL_PROVIDER, mistralProvider } from "./mistral.mjs";
import { OPENAI_PROVIDER, openaiProvider } from "./openai.mjs";

export { GOOGLE_AI_MODE_PROVIDER, MISTRAL_PROVIDER, OPENAI_PROVIDER };
export {
  classifyChatGptPageState,
  detectAccessBlocker,
  dismissChatGptLoggedOutUpsell,
  getAccessBlockerReason,
  isOpenAiGenerationErrorResponse,
  snapshotPageGateState,
} from "./openai.mjs";

const PROVIDERS = new Map([
  [openaiProvider.slug, openaiProvider],
  [googleAiModeProvider.slug, googleAiModeProvider],
  [mistralProvider.slug, mistralProvider],
]);

export const RUNNABLE_PROVIDER_SLUGS = [...PROVIDERS.keys()];

export function getProviderAdapter(providerSlug) {
  return PROVIDERS.get(String(providerSlug ?? OPENAI_PROVIDER).trim()) ?? null;
}

export function isRunnableProvider(providerSlug) {
  return Boolean(getProviderAdapter(providerSlug)?.runnable);
}

export function providerDefaultsFor(providerSlug) {
  return getProviderAdapter(providerSlug)?.defaults ?? {};
}
