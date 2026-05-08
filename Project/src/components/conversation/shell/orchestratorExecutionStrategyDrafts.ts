import type { ThreadListRecord } from '@/app/backend/persistence/types';

import type { OrchestratorExecutionStrategy, TopLevelTab } from '@/shared/contracts';

type StrategyDraftsByRootThreadId = Record<string, OrchestratorExecutionStrategy>;

interface ResolveStrategyDraftInput {
    topLevelTab: TopLevelTab;
    selectedThread: ThreadListRecord | undefined;
    draftsByRootThreadId: StrategyDraftsByRootThreadId;
}

export function resolveOrchestratorStrategyRootThreadId(input: {
    topLevelTab: TopLevelTab;
    selectedThread: ThreadListRecord | undefined;
}): string | undefined {
    if (input.topLevelTab !== 'orchestrator') {
        return undefined;
    }

    if (!input.selectedThread || input.selectedThread.topLevelTab !== 'orchestrator') {
        return undefined;
    }

    if (input.selectedThread.delegatedFromOrchestratorRunId) {
        return undefined;
    }

    return input.selectedThread.rootThreadId;
}

export function resolveOrchestratorExecutionStrategyDraft(
    input: ResolveStrategyDraftInput
): OrchestratorExecutionStrategy {
    const rootThreadId = resolveOrchestratorStrategyRootThreadId({
        topLevelTab: input.topLevelTab,
        selectedThread: input.selectedThread,
    });

    if (!rootThreadId) {
        return 'sequential';
    }

    return input.draftsByRootThreadId[rootThreadId] ?? 'sequential';
}

export function updateOrchestratorExecutionStrategyDraft(input: {
    draftsByRootThreadId: StrategyDraftsByRootThreadId;
    rootThreadId: string | undefined;
    executionStrategy: OrchestratorExecutionStrategy;
}): StrategyDraftsByRootThreadId {
    if (!input.rootThreadId) {
        return input.draftsByRootThreadId;
    }

    return {
        ...input.draftsByRootThreadId,
        [input.rootThreadId]: input.executionStrategy,
    };
}
