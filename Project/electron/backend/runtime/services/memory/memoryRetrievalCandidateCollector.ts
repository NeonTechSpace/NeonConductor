import {
    countStructuredContextHits,
    isExactScopeMatch,
    scopePriority,
} from '@/app/backend/runtime/services/memory/memoryRetrievalHelpers';
import type {
    MemoryRetrievalCandidate,
    ResolvedMemoryRetrievalContext,
} from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';

export interface MemoryRetrievalCollectedState {
    baseCandidates: MemoryRetrievalCandidate[];
}

export async function collectMemoryRetrievalCandidates(
    input: ResolvedMemoryRetrievalContext
): Promise<MemoryRetrievalCollectedState> {
    const baseCandidates: MemoryRetrievalCandidate[] = [];
    for (const memory of input.activeMemories) {
        const exactMatchReason = isExactScopeMatch({
            memory,
            ...(input.runId ? { runId: input.runId } : {}),
            ...(input.threadIds.length > 0 ? { threadIds: input.threadIds } : {}),
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });
        if (exactMatchReason) {
            baseCandidates.push({
                memory,
                matchReason: exactMatchReason,
                tier: 'exact',
                priority: scopePriority(memory.scopeKind),
            });
            continue;
        }

        const structuredHitCount = countStructuredContextHits({
            memory,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            ...(input.threadIds.length > 0 ? { threadIds: input.threadIds } : {}),
            ...(input.runId ? { runId: input.runId } : {}),
        });
        if (structuredHitCount > 0) {
            baseCandidates.push({
                memory,
                matchReason: 'structured',
                tier: 'structured',
                priority: 10 + scopePriority(memory.scopeKind),
                structuredHitCount,
            });
        }
    }

    return {
        baseCandidates: baseCandidates.sort((left, right) => {
            if (left.priority !== right.priority) {
                return left.priority - right.priority;
            }
            if (left.memory.updatedAt !== right.memory.updatedAt) {
                return right.memory.updatedAt.localeCompare(left.memory.updatedAt);
            }

            return left.memory.id.localeCompare(right.memory.id);
        }),
    };
}
