import { conversationAttachmentStore, messageStore, runStore, sessionStore } from '@/app/backend/persistence/stores';
import { eventMetadata } from '@/app/backend/runtime/services/common/logContext';
import { publishRunStartedObservabilityEvent } from '@/app/backend/runtime/services/observability/publishers';
import { buildBrowserContextParts } from '@/app/backend/runtime/services/runExecution/browserContextMessage';
import {
    emitCacheResolutionEvent,
    emitMessageCreatedEvent,
    emitMessagePartAppendedEvent,
    emitTransportSelectionEvent,
} from '@/app/backend/runtime/services/runExecution/eventing';
import type { PreparedRunStart, StartRunInput } from '@/app/backend/runtime/services/runExecution/types';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';

import type { EntityId } from '@/shared/contracts';
import { createAssistantStatusPartPayload } from '@/shared/contracts/types/messagePart';

async function appendBrowserContextTranscriptParts(input: {
    runId: EntityId<'run'>;
    profileId: string;
    sessionId: EntityId<'sess'>;
    messageId: EntityId<'msg'>;
    browserContext: NonNullable<StartRunInput['browserContext']>;
}): Promise<void> {
    for (const part of await buildBrowserContextParts(input.browserContext)) {
        if (part.type === 'text') {
            const textPart = await messageStore.appendPart({
                messageId: input.messageId,
                partType: 'text',
                payload: {
                    text: part.text,
                },
            });
            await emitMessagePartAppendedEvent({
                runId: input.runId,
                profileId: input.profileId,
                sessionId: input.sessionId,
                messageId: input.messageId,
                part: textPart,
            });
            continue;
        }

        if (part.type !== 'image' || !part.attachmentId) {
            continue;
        }

        const imagePart = await messageStore.appendPart({
            messageId: input.messageId,
            partType: 'image',
            payload: {
                attachmentId: part.attachmentId,
                mimeType: part.mimeType,
                width: part.width,
                height: part.height,
                ...(part.sha256 ? { sha256: part.sha256 } : {}),
            },
        });
        await conversationAttachmentStore.attachToMessagePart({
            attachmentId: part.attachmentId as EntityId<'att'>,
            messagePartId: imagePart.id,
        });
        await emitMessagePartAppendedEvent({
            runId: input.runId,
            profileId: input.profileId,
            sessionId: input.sessionId,
            messageId: input.messageId,
            part: imagePart,
        });
    }
}

export async function persistRunStart(input: { input: StartRunInput; prepared: PreparedRunStart }): Promise<{
    run: Awaited<ReturnType<typeof runStore.create>>;
    assistantMessageId: EntityId<'msg'>;
}> {
    const run = await runStore.create({
        profileId: input.input.profileId,
        sessionId: input.input.sessionId,
        ...(input.input.planId ? { planId: input.input.planId } : {}),
        ...(input.input.planRevisionId ? { planRevisionId: input.input.planRevisionId } : {}),
        ...(input.input.planPhaseId ? { planPhaseId: input.input.planPhaseId } : {}),
        ...(input.input.planPhaseRevisionId ? { planPhaseRevisionId: input.input.planPhaseRevisionId } : {}),
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
        if (attachment.kind !== 'text_file_attachment') {
            const attachmentSummary = await conversationAttachmentStore.createSnapshot({
                profileId: input.input.profileId,
                sessionId: input.input.sessionId,
                attachment,
            });
            const imagePart = await messageStore.appendPart({
                messageId: userMessage.id,
                partType: 'image',
                payload: {
                    attachmentId: attachmentSummary.id,
                    mimeType: attachment.mimeType,
                    width: attachment.width,
                    height: attachment.height,
                    sha256: attachment.sha256,
                    ...(attachment.fileName ? { fileName: attachment.fileName } : {}),
                },
            });
            await conversationAttachmentStore.attachToMessagePart({
                attachmentId: attachmentSummary.id,
                messagePartId: imagePart.id,
            });
            await emitMessagePartAppendedEvent({
                runId: run.id,
                profileId: input.input.profileId,
                sessionId: input.input.sessionId,
                messageId: userMessage.id,
                part: imagePart,
            });
            continue;
        }

        const attachmentSummary = await conversationAttachmentStore.createSnapshot({
            profileId: input.input.profileId,
            sessionId: input.input.sessionId,
            attachment,
        });
        const textFilePart = await messageStore.appendPart({
            messageId: userMessage.id,
            partType: 'text_file_attachment',
            payload: {
                attachmentId: attachmentSummary.id,
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                text: attachment.text,
                sha256: attachment.sha256,
                byteSize: attachment.byteSize,
                encoding: attachment.encoding,
            },
        });
        await conversationAttachmentStore.attachToMessagePart({
            attachmentId: attachmentSummary.id,
            messagePartId: textFilePart.id,
        });
        await emitMessagePartAppendedEvent({
            runId: run.id,
            profileId: input.input.profileId,
            sessionId: input.input.sessionId,
            messageId: userMessage.id,
            part: textFilePart,
        });
    }

    if (input.input.browserContext) {
        await appendBrowserContextTranscriptParts({
            runId: run.id,
            profileId: input.input.profileId,
            sessionId: input.input.sessionId,
            messageId: userMessage.id,
            browserContext: input.input.browserContext,
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
                planId: input.input.planId ?? null,
                planRevisionId: input.input.planRevisionId ?? null,
                planPhaseId: input.input.planPhaseId ?? null,
                planPhaseRevisionId: input.input.planPhaseRevisionId ?? null,
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
                planId: input.input.planId ?? null,
                planRevisionId: input.input.planRevisionId ?? null,
                planPhaseId: input.input.planPhaseId ?? null,
                planPhaseRevisionId: input.input.planPhaseRevisionId ?? null,
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

