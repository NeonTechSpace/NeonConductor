import { memoryStore, threadStore } from '@/app/backend/persistence/stores';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import type { EntityId } from '@/app/backend/runtime/contracts';
import { uniquePromptTerms } from '@/app/backend/runtime/services/memory/memoryRetrievalHelpers';
import type {
    MemoryRetrievalStageInput,
    ResolvedMemoryRetrievalContext,
} from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';

export async function resolveMemoryRetrievalContext(
    input: MemoryRetrievalStageInput
): Promise<ResolvedMemoryRetrievalContext> {
    const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
    const threadId = sessionThread ? parseEntityId(sessionThread.thread.id, 'threads.id', 'thr') : undefined;
    const inheritedRootThreadId =
        sessionThread &&
        sessionThread.thread.delegatedFromOrchestratorRunId &&
        sessionThread.thread.rootThreadId !== sessionThread.thread.id
            ? parseEntityId(sessionThread.thread.rootThreadId, 'threads.root_thread_id', 'thr')
            : undefined;
    const threadIds = Array.from(
        new Set(
            [threadId, inheritedRootThreadId].filter(
                (value): value is EntityId<'thr'> => typeof value === 'string' && value.length > 0
            )
        )
    );
    const workspaceFingerprint = input.workspaceFingerprint ?? sessionThread?.workspaceFingerprint;

    return {
        profileId: input.profileId,
        sessionId: input.sessionId,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        prompt: input.prompt,
        promptTerms: uniquePromptTerms(input.prompt),
        activeMemories: await memoryStore.listByProfile({
            profileId: input.profileId,
            state: 'active',
        }),
        threadIds,
        ...(workspaceFingerprint !== undefined ? { workspaceFingerprint } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
    };
}
