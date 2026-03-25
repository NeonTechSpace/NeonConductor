import { messageMediaStore, messageStore, runStore, sessionStore } from '@/app/backend/persistence/stores';
import { createAssistantStatusPartPayload } from '@/app/backend/runtime/contracts/types/messagePart';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { eventMetadata } from '@/app/backend/runtime/services/common/logContext';
import { publishRunStartedObservabilityEvent } from '@/app/backend/runtime/services/observability/publishers';
import { decodeAttachmentBytes } from '@/app/backend/runtime/services/runExecution/contextParts';
import {
    emitCacheResolutionEvent,
    emitMessageCreatedEvent,
    emitMessagePartAppendedEvent,
    emitTransportSelectionEvent,
} from '@/app/backend/runtime/services/runExecution/eventing';
import type { PreparedRunStart, StartRunInput } from '@/app/backend/runtime/services/runExecution/types';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import type { EntityId } from '@/app/backend/runtime/contracts';

export async function persistRunStart(input: {
    input: StartRunInput;
    prepared: PreparedRunStart;
}): Promise<{
    run: Awaited<ReturnType<typeof runStore.create>>;
    assistantMessageId: EntityId<'msg'>;
}> {
    const run = await runStore.create({
        profileId: input.input.profileId,
        sessionId: input.input.sessionId,
        prompt: input.input.prompt,
        providerId: input.prepared.activeTarget.providerId,
        modelId: input.prepared.activeTarget.modelId,
        authMethod: input.prepared.resolvedAuth.authMethod,
        runtimeOptions: input.input.runtimeOptions,
        cache: input.prepared.resolvedCache,
        transport: {
            selected: input.prepared.initialTransport.selected,
            ...(input.prepared.initialTransport.degraded
                ? {
                      degradedReason: input.prepared.initialTransport.degradedReason,
                  }
                : {}),
        },
    });

    await sessionStore.markRunPending(input.input.profileId, input.input.sessionId, run.id);

    const userMessage = await messageStore.createMessage({
        profileId: input.input.profileId,
        sessionId: input.input.sessionId,
        runId: run.id,
        role: 'user',
    });
    await emitMessageCreatedEvent({
        runId: run.id,
        profileId: input.input.profileId,
        sessionId: input.input.sessionId,
        message: userMessage,
    });
    if (input.input.prompt.trim().length > 0) {
        const userTextPart = await messageStore.appendPart({
            messageId: userMessage.id,
            partType: 'text',
            payload: {
                text: input.input.prompt,
            },
        });
        await emitMessagePartAppendedEvent({
            runId: run.id,
            profileId: input.input.profileId,
            sessionId: input.input.sessionId,
            messageId: userMessage.id,
            part: userTextPart,
        });
    }

    for (const attachment of input.input.attachments ?? []) {
        const mediaId = createEntityId('media');
        const imagePart = await messageStore.appendPart({
            messageId: userMessage.id,
            partType: 'image',
            payload: {
                mediaId,
                mimeType: attachment.mimeType,
                width: attachment.width,
                height: attachment.height,
                sha256: attachment.sha256,
            },
        });
        await messageMediaStore.create({
            mediaId,
            messagePartId: imagePart.id,
            mimeType: attachment.mimeType,
            width: attachment.width,
            height: attachment.height,
            sha256: attachment.sha256,
            bytes: decodeAttachmentBytes(attachment),
        });
        await emitMessagePartAppendedEvent({
            runId: run.id,
            profileId: input.input.profileId,
            sessionId: input.input.sessionId,
            messageId: userMessage.id,
            part: imagePart,
        });
    }

    const assistantMessage = await messageStore.createMessage({
        profileId: input.input.profileId,
        sessionId: input.input.sessionId,
        runId: run.id,
        role: 'assistant',
    });
    await emitMessageCreatedEvent({
        runId: run.id,
        profileId: input.input.profileId,
        sessionId: input.input.sessionId,
        message: assistantMessage,
    });
    const assistantReceivedStatusPart = await messageStore.appendPart({
        messageId: assistantMessage.id,
        partType: 'status',
        payload: createAssistantStatusPartPayload({
            code: 'received',
            label: 'Agent received message',
        }),
    });
    await emitMessagePartAppendedEvent({
        runId: run.id,
        profileId: input.input.profileId,
        sessionId: input.input.sessionId,
        messageId: assistantMessage.id,
        part: assistantReceivedStatusPart,
    });

    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'run',
            domain: 'run',
            entityId: run.id,
            eventType: 'run.mode.context',
            payload: {
                runId: run.id,
                sessionId: input.input.sessionId,
                profileId: input.input.profileId,
                topLevelTab: input.input.topLevelTab,
                modeKey: input.input.modeKey,
                workspaceFingerprint: input.input.workspaceFingerprint ?? null,
                mode: {
                    id: input.prepared.resolvedMode.mode.id,
                    label: input.prepared.resolvedMode.mode.label,
                    executionPolicy: input.prepared.resolvedMode.mode.executionPolicy,
                },
            },
            ...eventMetadata({
                requestId: input.input.requestId,
                correlationId: input.input.correlationId,
                origin: 'runtime.runExecution.startRun',
            }),
        })
    );

    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'run',
            domain: 'run',
            entityId: run.id,
            eventType: 'run.started',
            payload: {
                run,
                sessionId: input.input.sessionId,
                profileId: input.input.profileId,
            },
            ...eventMetadata({
                requestId: input.input.requestId,
                correlationId: input.input.correlationId,
                origin: 'runtime.runExecution.startRun',
            }),
        })
    );

    if (run.providerId && run.modelId) {
        publishRunStartedObservabilityEvent({
            profileId: input.input.profileId,
            sessionId: input.input.sessionId,
            runId: run.id,
            providerId: run.providerId,
            modelId: run.modelId,
            topLevelTab: input.input.topLevelTab,
            modeKey: input.input.modeKey,
        });
    }

    await emitCacheResolutionEvent({
        runId: run.id,
        profileId: input.input.profileId,
        sessionId: input.input.sessionId,
        cache: input.prepared.resolvedCache,
        run,
    });
    await emitTransportSelectionEvent({
        runId: run.id,
        profileId: input.input.profileId,
        sessionId: input.input.sessionId,
        selection: {
            selected: input.prepared.initialTransport.selected,
            requested: input.prepared.initialTransport.requested,
            degraded: input.prepared.initialTransport.degraded,
            ...(input.prepared.initialTransport.degradedReason
                ? { degradedReason: input.prepared.initialTransport.degradedReason }
                : {}),
        },
        run,
    });

    return {
        run,
        assistantMessageId: assistantMessage.id,
    };
}

