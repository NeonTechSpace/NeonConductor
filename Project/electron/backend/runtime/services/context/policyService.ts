import { appContextSettingsStore, profileContextSettingsStore } from '@/app/backend/persistence/stores';
import type { ResolvedContextPolicy } from '@/app/backend/runtime/contracts';
import { modelLimitResolverService } from '@/app/backend/runtime/services/context/modelLimitResolverService';

const MIN_SAFETY_BUFFER_TOKENS = 8_000;
const SAFETY_BUFFER_PERCENT = 0.1;

class ContextPolicyService {
    async resolvePolicy(input: {
        profileId: string;
        providerId: ResolvedContextPolicy['providerId'];
        modelId: string;
    }): Promise<ResolvedContextPolicy> {
        const [globalSettings, profileSettings, limits] = await Promise.all([
            appContextSettingsStore.get(),
            profileContextSettingsStore.get(input.profileId),
            modelLimitResolverService.resolve(input),
        ]);

        if (!globalSettings.enabled) {
            return {
                enabled: false,
                profileId: input.profileId,
                providerId: input.providerId,
                modelId: input.modelId,
                limits,
                mode: 'percent',
                disabledReason: 'feature_disabled',
            };
        }

        if (!limits.modelLimitsKnown || limits.contextLength === undefined) {
            return {
                enabled: true,
                profileId: input.profileId,
                providerId: input.providerId,
                modelId: input.modelId,
                limits,
                mode: profileSettings.overrideMode === 'fixed_tokens' ? 'fixed_tokens' : 'percent',
                disabledReason: 'missing_model_limits',
            };
        }

        const safetyBufferTokens = Math.max(
            Math.floor(limits.contextLength * SAFETY_BUFFER_PERCENT),
            MIN_SAFETY_BUFFER_TOKENS
        );
        const usableInputBudgetTokens = Math.max(limits.contextLength - safetyBufferTokens, 1);

        if (profileSettings.overrideMode === 'fixed_tokens') {
            const fixedInputTokens = Math.min(
                profileSettings.fixedInputTokens ?? usableInputBudgetTokens,
                usableInputBudgetTokens
            );
            return {
                enabled: true,
                profileId: input.profileId,
                providerId: input.providerId,
                modelId: input.modelId,
                limits,
                mode: 'fixed_tokens',
                safetyBufferTokens,
                usableInputBudgetTokens,
                thresholdTokens: fixedInputTokens,
                fixedInputTokens,
            };
        }

        const percent =
            profileSettings.overrideMode === 'percent'
                ? (profileSettings.percent ?? globalSettings.percent)
                : globalSettings.percent;

        return {
            enabled: true,
            profileId: input.profileId,
            providerId: input.providerId,
            modelId: input.modelId,
            limits,
            mode: 'percent',
            safetyBufferTokens,
            usableInputBudgetTokens,
            thresholdTokens: Math.floor((usableInputBudgetTokens * percent) / 100),
            percent,
        };
    }
}

export const contextPolicyService = new ContextPolicyService();
