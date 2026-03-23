import { createOpenAICompatibleRuntimeBehavior } from '@/app/backend/providers/behaviors/openaiCompatible/runtime';

export const openAICodexRuntimeBehavior = createOpenAICompatibleRuntimeBehavior({
    providerId: 'openai_codex',
    billedViaApiKey: 'openai_api',
    billedViaOAuth: 'openai_subscription',
});
