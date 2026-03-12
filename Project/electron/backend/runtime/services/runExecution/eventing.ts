import { messageStore } from '@/app/backend/persistence/stores';
import type { MessagePartRecord, MessageRecord, RunRecord } from '@/app/backend/persistence/types';
import type { ProviderRuntimePart, ProviderRuntimeTransportSelection } from '@/app/backend/providers/types';
import { isReasoningPart } from '@/app/backend/runtime/services/runExecution/parts';
import type { RunCacheResolution } from '@/app/backend/runtime/services/runExecution/types';
import {
    runtimeAppendEvent,
    runtimeStatusEvent,
    runtimeUpsertEvent,
} from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';

export async function emitCacheResolutionEvent(input: {
    runId: string;
    profileId: string;
    sessionId: string;
    cache: RunCacheResolution;
    run: RunRecord;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
        entityType: 'run',
        domain: 'run',
        entityId: input.runId,
        eventType: input.cache.applied ? 'run.cache.applied' : 'run.cache.skipped',
        payload: {
            runId: input.runId,
            profileId: input.profileId,
            sessionId: input.sessionId,
            cache: input.cache,
            run: input.run,
        },
        })
    );
}

export async function emitTransportSelectionEvent(input: {
    runId: string;
    profileId: string;
    sessionId: string;
    selection: ProviderRuntimeTransportSelection;
    run: RunRecord;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
        entityType: 'run',
        domain: 'run',
        entityId: input.runId,
        eventType: 'run.transport.selected',
        payload: {
            runId: input.runId,
            profileId: input.profileId,
            sessionId: input.sessionId,
            transport: input.selection,
            run: input.run,
        },
        })
    );
}

const extendablePartTypes = new Set<ProviderRuntimePart['partType']>(['text', 'reasoning', 'reasoning_summary']);

function readStreamingText(part: ProviderRuntimePart): string | null {
    if (!extendablePartTypes.has(part.partType)) {
        return null;
    }

    const text = part.payload['text'];
    return typeof text === 'string' && text.length > 0 ? text : null;
}

async function emitMessagePartAppendedEvent(input: {
    runId: string;
    profileId: string;
    sessionId: string;
    messageId: string;
    part: MessagePartRecord;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeAppendEvent({
            entityType: 'messagePart',
            domain: 'messagePart',
            entityId: input.part.id,
            eventType: 'messagePart.appended',
            payload: {
                runId: input.runId,
                profileId: input.profileId,
                sessionId: input.sessionId,
                messageId: input.messageId,
                part: input.part,
            },
        })
    );
}

async function emitMessagePartUpdatedEvent(input: {
    runId: string;
    profileId: string;
    sessionId: string;
    messageId: string;
    part: MessagePartRecord;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeUpsertEvent({
            entityType: 'messagePart',
            domain: 'messagePart',
            entityId: input.part.id,
            eventType: 'messagePart.updated',
            payload: {
                runId: input.runId,
                profileId: input.profileId,
                sessionId: input.sessionId,
                messageId: input.messageId,
                part: input.part,
            },
        })
    );
}

export async function emitMessageCreatedEvent(input: {
    runId: string;
    profileId: string;
    sessionId: string;
    message: MessageRecord;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeUpsertEvent({
            entityType: 'message',
            domain: 'message',
            entityId: input.message.id,
            eventType: 'message.created',
            payload: {
                runId: input.runId,
                profileId: input.profileId,
                sessionId: input.sessionId,
                message: input.message,
            },
        })
    );
}

export function createMessagePartRecorder(input: {
    runId: string;
    profileId: string;
    sessionId: string;
    messageId: string;
}) {
    const activeSegmentsByType = new Map<ProviderRuntimePart['partType'], MessagePartRecord>();
    let previousPartType: ProviderRuntimePart['partType'] | undefined;

    return {
        async recordPart(part: ProviderRuntimePart): Promise<void> {
            const streamingText = readStreamingText(part);
            if (streamingText !== null) {
                const activeSegment =
                    previousPartType === part.partType ? activeSegmentsByType.get(part.partType) : undefined;

                if (activeSegment) {
                    const updatedPart = await messageStore.extendTextPart({
                        partId: activeSegment.id,
                        appendText: streamingText,
                    });
                    activeSegmentsByType.set(part.partType, updatedPart);
                    previousPartType = part.partType;
                    await emitMessagePartUpdatedEvent({
                        runId: input.runId,
                        profileId: input.profileId,
                        sessionId: input.sessionId,
                        messageId: input.messageId,
                        part: updatedPart,
                    });
                    return;
                }
            }

            const appendedPart = await messageStore.createPart({
                messageId: input.messageId,
                partType: part.partType,
                payload: part.payload,
            });
            if (isReasoningPart(part.partType) || extendablePartTypes.has(part.partType)) {
                activeSegmentsByType.set(part.partType, appendedPart);
            }
            previousPartType = part.partType;

            await emitMessagePartAppendedEvent({
                runId: input.runId,
                profileId: input.profileId,
                sessionId: input.sessionId,
                messageId: input.messageId,
                part: appendedPart,
            });
        },
    };
}

export function createAssistantMessagePartRecorder(input: {
    runId: string;
    profileId: string;
    sessionId: string;
    messageId: string;
}) {
    return createMessagePartRecorder(input);
}
