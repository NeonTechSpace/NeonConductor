import { memoryRetrievalUsageStore } from '@/app/backend/persistence/stores';
import { formatRetrievedMemoryMessage } from '@/app/backend/runtime/services/memory/memoryRetrievalMessageFormatter';
import type {
    MemoryRetrievalAssemblyInput,
    MemoryRetrievalAssemblyResult,
} from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';
import { appLog } from '@/app/main/logging';

export async function assembleMemoryRetrievalResult(
    input: MemoryRetrievalAssemblyInput
): Promise<MemoryRetrievalAssemblyResult> {
    if (input.decisions.length === 0) {
        return {
            records: [],
            messages: [],
        };
    }

    const records = input.decisions.map((candidate, index) => {
        const derivedSummary = input.derivedSummaryByMemoryId.get(candidate.memory.id);
        const supportingEvidence = input.evidenceByMemoryId.get(candidate.memory.id) ?? [];
        return {
            memoryId: candidate.memory.id,
            title: candidate.memory.title,
            memoryType: candidate.memory.memoryType,
            scopeKind: candidate.memory.scopeKind,
            matchReason: candidate.matchReason,
            order: index + 1,
            supportingEvidence,
            ...(candidate.sourceMemoryId ? { sourceMemoryId: candidate.sourceMemoryId } : {}),
            ...(candidate.annotations && candidate.annotations.length > 0
                ? { annotations: candidate.annotations }
                : {}),
            ...(derivedSummary ? { derivedSummary } : {}),
        };
    });
    const memoriesById = new Map(input.decisions.map((candidate) => [candidate.memory.id, candidate.memory] as const));
    const injectedMessage = formatRetrievedMemoryMessage(records, memoriesById);
    if (!injectedMessage) {
        return {
            records: [],
            messages: [],
        };
    }

    const includedMemoryIdSet = new Set(injectedMessage.includedMemoryIds);
    const includedRecords = records
        .filter((record) => includedMemoryIdSet.has(record.memoryId))
        .map((record, index) => ({
            ...record,
            order: index + 1,
        }));

    await memoryRetrievalUsageStore
        .incrementMany({
            profileId: input.profileId,
            memoryIds: includedRecords.map((record) => record.memoryId),
        })
        .catch((error: unknown) => {
            appLog.warn({
                tag: 'memory.retrieval.usage',
                message: 'Memory retrieval usage tracking failed softly.',
                profileId: input.profileId,
                detail: error instanceof Error ? error.message : 'Unknown error.',
            });
        });

    return {
        summary: {
            records: includedRecords,
            injectedTextLength: injectedMessage.injectedTextLength,
        },
        records: includedRecords,
        messages: [injectedMessage.message],
    };
}
