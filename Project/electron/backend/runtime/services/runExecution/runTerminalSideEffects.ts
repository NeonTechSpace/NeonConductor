import { threadStore } from '@/app/backend/persistence/stores';
import type { RunTerminalOutcome } from '@/app/backend/runtime/services/runExecution/types';
import { memoryRuntimeService } from '@/app/backend/runtime/services/memory/runtime';
import {
    publishRunAbortedObservabilityEvent,
    publishRunCompletedObservabilityEvent,
    publishRunFailedObservabilityEvent,
} from '@/app/backend/runtime/services/observability/publishers';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { threadTitleService } from '@/app/backend/runtime/services/threadTitle/service';
import { appLog } from '@/app/main/logging';

import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import type { RunTerminalPersistenceResult } from '@/app/backend/runtime/services/runExecution/runTerminalPersistence';

import type { EntityId, ProviderAuthMethod, RuntimeProviderId } from '@/shared/contracts';

async function markThreadAssistantActivity(input: { profileId: string; threadId: EntityId<'thr'> }): Promise<void> {
    await threadStore.markAssistantActivity(input.profileId, input.threadId, new Date().toISOString());
}

async function emitTerminalEvent(input: {
    entityType: 'run';
    eventType: 'run.completed' | 'run.aborted' | 'run.failed' | 'run.usage.recorded';
    payload: Record<string, unknown>;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: input.entityType,
            domain: 'run',
            entityId: input.payload['runId'] as string,
            eventType: input.eventType,
            payload: input.payload,
        })
    );
}

export async function applyRunTerminalSideEffects(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    outcome: RunTerminalOutcome;
    logMessage: string;
    run: RunTerminalPersistenceResult['run'];
    usageRecord?: RunTerminalPersistenceResult['usageRecord'];
    threadId?: EntityId<'thr'>;
    prompt?: string;
    providerId?: RuntimeProviderId;
    modelId?: string;
    authMethod?: ProviderAuthMethod | 'none';
}): Promise<void> {
    if (input.outcome.kind === 'completed') {
        if (!input.threadId || !input.providerId || !input.modelId) {
            throw new InvariantError('Completed terminal outcome requires thread, provider, and model context.');
        }
        if (!input.usageRecord) {
            throw new InvariantError('Completed terminal outcome requires usage context.');
        }

        await markThreadAssistantActivity({
            profileId: input.profileId,
            threadId: input.threadId,
        });
        await threadTitleService.maybeApply({
            profileId: input.profileId,
            sessionId: input.sessionId,
            prompt: input.prompt ?? '',
            providerId: input.providerId,
            modelId: input.modelId,
        });

        await emitTerminalEvent({
            entityType: 'run',
            eventType: 'run.completed',
            payload: {
                runId: input.runId,
                sessionId: input.sessionId,
                profileId: input.profileId,
                run: input.run,
            },
        });
        publishRunCompletedObservabilityEvent({
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: input.runId,
            providerId: input.providerId,
            modelId: input.modelId,
        });

        await emitTerminalEvent({
            entityType: 'run',
            eventType: 'run.usage.recorded',
            payload: {
                runId: input.runId,
                usage: input.usageRecord,
            },
        });

        appLog.info({
            tag: 'run-execution',
            message: input.logMessage,
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: input.runId,
        });

        await memoryRuntimeService.captureFinishedRunMemorySafely({
            profileId: input.profileId,
            runId: input.runId,
        });
        return;
    }

    if (input.outcome.kind === 'aborted') {
        await emitTerminalEvent({
            entityType: 'run',
            eventType: 'run.aborted',
            payload: {
                runId: input.runId,
                sessionId: input.sessionId,
                profileId: input.profileId,
                run: input.run,
            },
        });
        if (input.run.providerId && input.run.modelId) {
            publishRunAbortedObservabilityEvent({
                profileId: input.profileId,
                sessionId: input.sessionId,
                runId: input.runId,
                providerId: input.run.providerId,
                modelId: input.run.modelId,
            });
        }
        appLog.info({
            tag: 'run-execution',
            message: input.logMessage,
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: input.runId,
        });
        return;
    }

    await emitTerminalEvent({
        entityType: 'run',
        eventType: 'run.failed',
        payload: {
            runId: input.runId,
            sessionId: input.sessionId,
            profileId: input.profileId,
            errorCode: input.outcome.errorCode,
            errorMessage: input.outcome.errorMessage,
            run: input.run,
        },
    });
    if (input.run.providerId && input.run.modelId) {
        publishRunFailedObservabilityEvent({
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: input.runId,
            providerId: input.run.providerId,
            modelId: input.run.modelId,
            errorCode: input.outcome.errorCode,
            errorMessage: input.outcome.errorMessage,
        });
    }
    appLog.warn({
        tag: 'run-execution',
        message: input.logMessage,
        profileId: input.profileId,
        sessionId: input.sessionId,
        runId: input.runId,
        errorCode: input.outcome.errorCode,
        errorMessage: input.outcome.errorMessage,
    });

    await memoryRuntimeService.captureFinishedRunMemorySafely({
        profileId: input.profileId,
        runId: input.runId,
    });
}
