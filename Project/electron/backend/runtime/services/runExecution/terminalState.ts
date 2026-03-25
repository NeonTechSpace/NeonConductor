import { runStore, sessionStore } from '@/app/backend/persistence/stores';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import { memoryRuntimeService } from '@/app/backend/runtime/services/memory/runtime';
import {
    publishRunAbortedObservabilityEvent,
    publishRunFailedObservabilityEvent,
} from '@/app/backend/runtime/services/observability/publishers';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { appLog } from '@/app/main/logging';

export async function moveRunToAbortedState(input: {
    profileId: string;
    sessionId: `sess_${string}`;
    runId: `run_${string}`;
    logMessage: string;
}): Promise<void> {
    const run = await runStore.finalize(input.runId, {
        status: 'aborted',
    });
    if (!run) {
        throw new InvariantError('Run abort persisted successfully but the updated run snapshot could not be reloaded.');
    }
    await sessionStore.markRunTerminal(input.profileId, input.sessionId, 'aborted');
    await runtimeEventLogService.append(
        runtimeStatusEvent({
        entityType: 'run',
        domain: 'run',
        entityId: input.runId,
        eventType: 'run.aborted',
        payload: {
            runId: input.runId,
            sessionId: input.sessionId,
            profileId: input.profileId,
            run,
        },
        })
    );
    if (run.providerId && run.modelId) {
        publishRunAbortedObservabilityEvent({
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: input.runId,
            providerId: run.providerId,
            modelId: run.modelId,
        });
    }
    appLog.info({
        tag: 'run-execution',
        message: input.logMessage,
        profileId: input.profileId,
        sessionId: input.sessionId,
        runId: input.runId,
    });
}

export async function moveRunToFailedState(input: {
    profileId: string;
    sessionId: `sess_${string}`;
    runId: `run_${string}`;
    errorCode: string;
    errorMessage: string;
    logMessage: string;
}): Promise<void> {
    const run = await runStore.finalize(input.runId, {
        status: 'error',
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
    });
    if (!run) {
        throw new InvariantError('Run failure persisted successfully but the updated run snapshot could not be reloaded.');
    }
    await sessionStore.markRunTerminal(input.profileId, input.sessionId, 'error');
    await runtimeEventLogService.append(
        runtimeStatusEvent({
        entityType: 'run',
        domain: 'run',
        entityId: input.runId,
        eventType: 'run.failed',
        payload: {
            runId: input.runId,
            sessionId: input.sessionId,
            profileId: input.profileId,
            errorCode: input.errorCode,
            errorMessage: input.errorMessage,
            run,
        },
        })
    );
    if (run.providerId && run.modelId) {
        publishRunFailedObservabilityEvent({
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: input.runId,
            providerId: run.providerId,
            modelId: run.modelId,
            errorCode: input.errorCode,
            errorMessage: input.errorMessage,
        });
    }
    appLog.warn({
        tag: 'run-execution',
        message: input.logMessage,
        profileId: input.profileId,
        sessionId: input.sessionId,
        runId: input.runId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
    });

    await memoryRuntimeService.captureFinishedRunMemorySafely({
        profileId: input.profileId,
        runId: input.runId,
    });
}
