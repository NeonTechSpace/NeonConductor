import { executionReceiptStore, messageStore } from '@/app/backend/persistence/stores';
import type { RunTerminalOutcome } from '@/app/backend/runtime/services/runExecution/types';

import type { BrowserCommentPacket, ExecutionReceipt, RunContractPreview } from '@/shared/contracts';
import type { EntityId } from '@/shared/contracts';

function countMemoryHits(contract: RunContractPreview): number {
    return contract.preparedContext.contributors.filter(
        (contributor) => contributor.kind === 'retrieved_memory' && contributor.inclusionState === 'included'
    ).length;
}

export async function createExecutionReceipt(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    contract: RunContractPreview;
    browserContext?: BrowserCommentPacket;
    outcome: RunTerminalOutcome;
}): Promise<ExecutionReceipt> {
    const toolsInvoked = await messageStore.summarizeToolInvocationsByRun(input.runId);
    return executionReceiptStore.create({
        profileId: input.profileId,
        sessionId: input.sessionId,
        runId: input.runId,
        contract: input.contract,
        ...(input.browserContext ? { browserContext: input.browserContext } : {}),
        approvalsUsed: [],
        toolsInvoked,
        memoryHitCount: countMemoryHits(input.contract),
        cacheResult: {
            applied: Boolean(input.contract.cache.key),
            ...(input.contract.cache.key ? { key: input.contract.cache.key } : {}),
        },
        usageSummary: input.outcome.kind === 'completed' ? input.outcome.usage : {},
        terminalOutcome:
            input.outcome.kind === 'completed'
                ? { kind: 'completed' }
                : input.outcome.kind === 'aborted'
                  ? { kind: 'aborted' }
                  : {
                        kind: 'failed',
                        errorCode: input.outcome.errorCode,
                        errorMessage: input.outcome.errorMessage,
                    },
    });
}
