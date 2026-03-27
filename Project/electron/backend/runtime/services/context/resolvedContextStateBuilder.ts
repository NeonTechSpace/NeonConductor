import type {
    ResolvedContextPolicy,
    ResolvedContextState,
    RetrievedMemorySummary,
    TokenCountEstimate,
} from '@/app/backend/runtime/contracts';
import type { SessionContextCompactionRecord } from '@/app/backend/persistence/types';
import { tokenCountingService } from '@/app/backend/runtime/services/context/tokenCountingService';

export function buildResolvedContextState(input: {
    policy: ResolvedContextPolicy;
    estimate?: TokenCountEstimate;
    compaction?: SessionContextCompactionRecord | null;
    retrievedMemory?: RetrievedMemorySummary;
}): ResolvedContextState {
    return {
        policy: input.policy,
        countingMode: input.estimate?.mode ?? tokenCountingService.getPreferredMode(input.policy),
        ...(input.estimate ? { estimate: input.estimate } : {}),
        ...(input.compaction ? { compaction: input.compaction } : {}),
        ...(input.retrievedMemory ? { retrievedMemory: input.retrievedMemory } : {}),
        compactable:
            input.policy.enabled &&
            input.policy.disabledReason === undefined &&
            input.policy.limits.modelLimitsKnown &&
            input.policy.thresholdTokens !== undefined,
    };
}
