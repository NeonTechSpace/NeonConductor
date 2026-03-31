import { advancedMemoryDerivationService } from '@/app/backend/runtime/services/memory/advancedDerivation';
import type {
    MemoryRetrievalCandidate,
    MemoryRetrievalExpansionCandidate,
    MemoryRetrievalExpansionResult,
    ResolvedMemoryRetrievalContext,
} from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';

export async function expandMemoryRetrievalCandidates(input: {
    context: ResolvedMemoryRetrievalContext;
    baseCandidates: MemoryRetrievalCandidate[];
}): Promise<MemoryRetrievalExpansionResult> {
    const baseCandidateIds = new Set(input.baseCandidates.map((candidate) => candidate.memory.id));
    const derivedExpansion = await advancedMemoryDerivationService.expandMatchedMemories({
        profileId: input.context.profileId,
        prompt: input.context.prompt,
        matchedMemories: input.baseCandidates.map((candidate) => candidate.memory),
    });

    const baseCandidates = input.baseCandidates.map((candidate) => ({
        ...candidate,
        ...(derivedExpansion.isOk() && derivedExpansion.value.summaries.has(candidate.memory.id)
            ? {
                  annotations:
                      derivedExpansion.value.summaries.get(candidate.memory.id)?.hasTemporalHistory
                          ? ['Current fact has temporal history.']
                          : [],
              }
            : {}),
    }));

    const derivedCandidates: MemoryRetrievalExpansionCandidate[] = derivedExpansion.isOk()
        ? derivedExpansion.value.candidates
              .filter((candidate) => !baseCandidateIds.has(candidate.memory.id))
              .map((candidate) => ({
                  ...candidate,
                  tier: 'derived',
              }))
        : [];

    return {
        baseCandidates,
        derivedCandidates,
    };
}
