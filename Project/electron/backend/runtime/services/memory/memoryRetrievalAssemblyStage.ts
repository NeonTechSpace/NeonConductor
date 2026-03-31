import { advancedMemoryDerivationService } from '@/app/backend/runtime/services/memory/advancedDerivation';
import { formatRetrievedMemoryMessage } from '@/app/backend/runtime/services/memory/memoryRetrievalMessageFormatter';
import type {
    MemoryRetrievalAssemblyInput,
    MemoryRetrievalAssemblyResult,
} from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';

export async function assembleMemoryRetrievalResult(
    input: MemoryRetrievalAssemblyInput
): Promise<MemoryRetrievalAssemblyResult> {
    if (input.decisions.length === 0) {
        return {
            records: [],
            messages: [],
        };
    }

    const finalDerivedSummaries = await advancedMemoryDerivationService.getDerivedSummaries(
        input.profileId,
        input.decisions.map((candidate) => candidate.memory.id)
    );
    const finalDerivedSummaryById = finalDerivedSummaries.isOk() ? finalDerivedSummaries.value : undefined;

    const records = input.decisions.map((candidate, index) => {
        const derivedSummary = finalDerivedSummaryById?.get(candidate.memory.id);
        return {
            memoryId: candidate.memory.id,
            title: candidate.memory.title,
            memoryType: candidate.memory.memoryType,
            scopeKind: candidate.memory.scopeKind,
            matchReason: candidate.matchReason,
            order: index + 1,
            ...(candidate.sourceMemoryId ? { sourceMemoryId: candidate.sourceMemoryId } : {}),
            ...(candidate.annotations && candidate.annotations.length > 0
                ? { annotations: candidate.annotations }
                : {}),
            ...(derivedSummary ? { derivedSummary } : {}),
        };
    });
    const memoriesById = new Map(input.decisions.map((candidate) => [candidate.memory.id, candidate.memory] as const));
    const injectedMessage = formatRetrievedMemoryMessage(records, memoriesById);

    return injectedMessage
        ? {
              summary: {
                  records,
                  injectedTextLength: injectedMessage.injectedTextLength,
              },
              records,
              messages: [injectedMessage.message],
          }
        : {
              records: [],
              messages: [],
          };
}
