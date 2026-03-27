import type { RunTerminalOutcome } from '@/app/backend/runtime/services/runExecution/types';
import { persistRunTerminalOutcome } from '@/app/backend/runtime/services/runExecution/runTerminalPersistence';
import { applyRunTerminalSideEffects } from '@/app/backend/runtime/services/runExecution/runTerminalSideEffects';

import type { EntityId, ProviderAuthMethod, RuntimeProviderId } from '@/shared/contracts';

export async function applyRunTerminalOutcome(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    outcome: RunTerminalOutcome;
    logMessage: string;
    threadId?: EntityId<'thr'>;
    prompt?: string;
    providerId?: RuntimeProviderId;
    modelId?: string;
    authMethod?: ProviderAuthMethod | 'none';
}): Promise<void> {
    const persisted = await persistRunTerminalOutcome(input);
    await applyRunTerminalSideEffects({
        ...input,
        run: persisted.run,
        ...(persisted.usageRecord ? { usageRecord: persisted.usageRecord } : {}),
    });
}

export async function moveRunToAbortedState(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    logMessage: string;
}): Promise<void> {
    await applyRunTerminalOutcome({
        profileId: input.profileId,
        sessionId: input.sessionId,
        runId: input.runId,
        outcome: {
            kind: 'aborted',
        },
        logMessage: input.logMessage,
    });
}

export async function moveRunToFailedState(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    errorCode: string;
    errorMessage: string;
    logMessage: string;
}): Promise<void> {
    await applyRunTerminalOutcome({
        profileId: input.profileId,
        sessionId: input.sessionId,
        runId: input.runId,
        outcome: {
            kind: 'failed',
            errorCode: input.errorCode,
            errorMessage: input.errorMessage,
        },
        logMessage: input.logMessage,
    });
}

