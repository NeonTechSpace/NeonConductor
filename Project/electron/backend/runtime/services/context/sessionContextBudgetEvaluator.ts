import type { ResolvedContextPolicy, TokenCountEstimate } from '@/app/backend/runtime/contracts';
import { tokenCountingService } from '@/app/backend/runtime/services/context/tokenCountingService';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';

export interface ContextBudgetAssessment {
    overThreshold: boolean;
    overUsableBudget: boolean;
    fixedOverheadDominates: boolean;
}

export async function estimatePreparedContextMessages(input: {
    profileId: string;
    policy: ResolvedContextPolicy;
    messages: RunContextMessage[];
}): Promise<{ messages: RunContextMessage[]; estimate?: TokenCountEstimate }> {
    if (!input.policy.limits.modelLimitsKnown || input.policy.disabledReason === 'multimodal_counting_unavailable') {
        return { messages: input.messages };
    }

    const estimate = await tokenCountingService.estimate({
        profileId: input.profileId,
        providerId: input.policy.providerId,
        modelId: input.policy.modelId,
        messages: input.messages,
    });

    return {
        messages: input.messages,
        estimate,
    };
}

export function assessContextBudget(input: {
    policy: ResolvedContextPolicy;
    estimate?: TokenCountEstimate;
}): ContextBudgetAssessment {
    const overThreshold =
        Boolean(input.policy.enabled) &&
        input.policy.limits.modelLimitsKnown &&
        input.policy.thresholdTokens !== undefined &&
        Boolean(input.estimate) &&
        input.estimate!.totalTokens > input.policy.thresholdTokens;
    const overUsableBudget =
        Boolean(input.policy.limits.modelLimitsKnown) &&
        input.policy.usableInputBudgetTokens !== undefined &&
        Boolean(input.estimate) &&
        input.estimate!.totalTokens > input.policy.usableInputBudgetTokens;

    return {
        overThreshold,
        overUsableBudget,
        fixedOverheadDominates:
            input.policy.mode === 'fixed_tokens' &&
            input.policy.fixedInputTokens !== undefined &&
            input.policy.usableInputBudgetTokens !== undefined &&
            input.policy.fixedInputTokens >= input.policy.usableInputBudgetTokens,
    };
}
