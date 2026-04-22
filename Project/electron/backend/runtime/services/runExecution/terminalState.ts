import type { RunTerminalOutcome } from '@/app/backend/runtime/services/runExecution/types';
import { persistRunTerminalOutcome } from '@/app/backend/runtime/services/runExecution/runTerminalPersistence';
import { applyRunTerminalSideEffects } from '@/app/backend/runtime/services/runExecution/runTerminalSideEffects';

import type { BrowserContextPacket, EntityId, ProviderAuthMethod, RunContractPreview, RuntimeProviderId } from '@/shared/contracts';

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
    contract?: RunContractPreview;
    browserContext?: BrowserContextPacket;
    sourceOutboxEntryId?: EntityId<'outbox'>;
}): Promise<void> {
    const persisted = await persistRunTerminalOutcome(input);
    await applyRunTerminalSideEffects({
        ...input,
        run: persisted.run,
        ...(persisted.usageRecord ? { usageRecord: persisted.usageRecord } : {}),
        ...(input.contract ? { contract: input.contract } : {}),
        ...(input.browserContext ? { browserContext: input.browserContext } : {}),
        ...(input.sourceOutboxEntryId ? { sourceOutboxEntryId: input.sourceOutboxEntryId } : {}),
    });
}

export async function moveRunToAbortedState(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    logMessage: string;
    contract?: RunContractPreview;
    browserContext?: BrowserContextPacket;
    sourceOutboxEntryId?: EntityId<'outbox'>;
}): Promise<void> {
    await applyRunTerminalOutcome({
        profileId: input.profileId,
        sessionId: input.sessionId,
        runId: input.runId,
        outcome: {
            kind: 'aborted',
        },
        logMessage: input.logMessage,
        ...(input.contract ? { contract: input.contract } : {}),
        ...(input.browserContext ? { browserContext: input.browserContext } : {}),
        ...(input.sourceOutboxEntryId ? { sourceOutboxEntryId: input.sourceOutboxEntryId } : {}),
    });
}

export async function moveRunToFailedState(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    errorCode: string;
    errorMessage: string;
    logMessage: string;
    contract?: RunContractPreview;
    browserContext?: BrowserContextPacket;
    sourceOutboxEntryId?: EntityId<'outbox'>;
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
        ...(input.contract ? { contract: input.contract } : {}),
        ...(input.browserContext ? { browserContext: input.browserContext } : {}),
        ...(input.sourceOutboxEntryId ? { sourceOutboxEntryId: input.sourceOutboxEntryId } : {}),
    });
}

