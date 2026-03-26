import { runStore, runUsageStore, sessionStore, threadStore } from '@/app/backend/persistence/stores';
import { getProviderRuntimeBehavior } from '@/app/backend/providers/behaviors';
import type { EntityId, ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import { memoryRuntimeService } from '@/app/backend/runtime/services/memory/runtime';
import {
    publishRunAbortedObservabilityEvent,
    publishRunCompletedObservabilityEvent,
    publishRunFailedObservabilityEvent,
} from '@/app/backend/runtime/services/observability/publishers';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { threadTitleService } from '@/app/backend/runtime/services/threadTitle/service';
import type { RunTerminalOutcome } from '@/app/backend/runtime/services/runExecution/types';
import { appLog } from '@/app/main/logging';

async function markThreadAssistantActivity(input: {
    profileId: string;
    threadId: EntityId<'thr'>;
}): Promise<void> {
    await threadStore.markAssistantActivity(input.profileId, input.threadId, new Date().toISOString());
}

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
    if (input.outcome.kind === 'completed') {
        if (!input.threadId || !input.providerId || !input.modelId) {
            throw new InvariantError('Completed terminal outcome requires thread, provider, and model context.');
        }
        const run = await runStore.finalize(input.runId, {
            status: 'completed',
        });
        if (!run) {
            throw new InvariantError('Run completion persisted successfully but the updated run snapshot could not be reloaded.');
        }

        await sessionStore.markRunTerminal(input.profileId, input.sessionId, 'completed');
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

        await runtimeEventLogService.append(
            runtimeStatusEvent({
                entityType: 'run',
                domain: 'run',
                entityId: input.runId,
                eventType: 'run.completed',
                payload: {
                    runId: input.runId,
                    sessionId: input.sessionId,
                    profileId: input.profileId,
                    run,
                },
            })
        );
        publishRunCompletedObservabilityEvent({
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: input.runId,
            providerId: input.providerId,
            modelId: input.modelId,
        });

        const behavior = getProviderRuntimeBehavior(input.providerId);
        const usageRecord = await runUsageStore.upsert({
            runId: input.runId,
            providerId: input.providerId,
            modelId: input.modelId,
            billedVia: behavior.resolveBilledVia(input.authMethod ?? 'none'),
            ...input.outcome.usage,
        });

        await runtimeEventLogService.append(
            runtimeStatusEvent({
                entityType: 'run',
                domain: 'run',
                entityId: input.runId,
                eventType: 'run.usage.recorded',
                payload: {
                    runId: input.runId,
                    usage: usageRecord,
                },
            })
        );

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
        return;
    }

    const run = await runStore.finalize(input.runId, {
        status: 'error',
        errorCode: input.outcome.errorCode,
        errorMessage: input.outcome.errorMessage,
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
                errorCode: input.outcome.errorCode,
                errorMessage: input.outcome.errorMessage,
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
