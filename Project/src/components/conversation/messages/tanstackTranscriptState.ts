import {
    projectConversationTanstackMessage,
    type ConversationTanstackMessage,
} from '@/web/components/conversation/messages/tanstackMessageBridge';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';

import type {
    MessagePartRecord,
    MessageRecord,
    RuntimeEventRecordV1,
    RunRecord,
} from '@/app/backend/persistence/types';

interface TranscriptStateMaps {
    messagesById: Map<string, MessageRecord>;
    partsByMessageId: Map<string, MessagePartRecord[]>;
    projectedByMessageId: Map<string, ConversationTanstackMessage>;
}

export interface TanstackTranscriptState extends TranscriptStateMaps {
    sessionId: MessageRecord['sessionId'] | null;
    orderedMessageIds: string[];
    digest: string;
}

function sortMessages(messages: MessageRecord[]): MessageRecord[] {
    return [...messages].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
            return left.createdAt.localeCompare(right.createdAt);
        }

        return left.id.localeCompare(right.id);
    });
}

function sortMessageParts(messageParts: MessagePartRecord[]): MessagePartRecord[] {
    return [...messageParts].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
            return left.createdAt.localeCompare(right.createdAt);
        }

        if (left.sequence !== right.sequence) {
            return left.sequence - right.sequence;
        }

        return left.id.localeCompare(right.id);
    });
}

function buildDigest(state: {
    orderedMessageIds: string[];
    messagesById: Map<string, MessageRecord>;
    partsByMessageId: Map<string, MessagePartRecord[]>;
}): string {
    return state.orderedMessageIds
        .map((messageId) => {
            const message = state.messagesById.get(messageId);
            const messageParts = state.partsByMessageId.get(messageId) ?? [];

            return [
                messageId,
                message?.updatedAt ?? '',
                message?.createdAt ?? '',
                message?.role ?? '',
                ...messageParts.map((part) => `${part.id}:${String(part.sequence)}:${part.createdAt}:${part.partType}`),
            ].join('|');
        })
        .join('||');
}

function cloneStateMaps(state: TanstackTranscriptState): TranscriptStateMaps {
    return {
        messagesById: new Map(state.messagesById),
        partsByMessageId: new Map(state.partsByMessageId),
        projectedByMessageId: new Map(state.projectedByMessageId),
    };
}

function buildProjectedMessage(
    message: MessageRecord,
    partsByMessageId: Map<string, MessagePartRecord[]>
): ConversationTanstackMessage {
    return projectConversationTanstackMessage(message, partsByMessageId.get(message.id) ?? []);
}

function readMessageRecord(value: unknown): MessageRecord | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const candidate = value as Record<string, unknown>;
    const id = typeof candidate['id'] === 'string' ? candidate['id'] : undefined;
    const profileId = typeof candidate['profileId'] === 'string' ? candidate['profileId'] : undefined;
    const sessionId = typeof candidate['sessionId'] === 'string' ? candidate['sessionId'] : undefined;
    const runId = typeof candidate['runId'] === 'string' ? candidate['runId'] : undefined;
    const role = candidate['role'];
    const createdAt = typeof candidate['createdAt'] === 'string' ? candidate['createdAt'] : undefined;
    const updatedAt = typeof candidate['updatedAt'] === 'string' ? candidate['updatedAt'] : undefined;

    if (
        !id ||
        !isEntityId(id, 'msg') ||
        !profileId ||
        !sessionId ||
        !isEntityId(sessionId, 'sess') ||
        !runId ||
        !isEntityId(runId, 'run') ||
        (role !== 'assistant' && role !== 'user' && role !== 'system' && role !== 'tool') ||
        !createdAt ||
        !updatedAt
    ) {
        return undefined;
    }

    return {
        id,
        profileId,
        sessionId,
        runId,
        role,
        createdAt,
        updatedAt,
    };
}

function readMessagePartRecord(value: unknown): MessagePartRecord | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const candidate = value as Record<string, unknown>;
    const id = typeof candidate['id'] === 'string' ? candidate['id'] : undefined;
    const messageId = typeof candidate['messageId'] === 'string' ? candidate['messageId'] : undefined;
    const sequence = typeof candidate['sequence'] === 'number' ? candidate['sequence'] : undefined;
    const partType = candidate['partType'];
    const payload = candidate['payload'];
    const createdAt = typeof candidate['createdAt'] === 'string' ? candidate['createdAt'] : undefined;

    if (
        !id ||
        !messageId ||
        !isEntityId(messageId, 'msg') ||
        sequence === undefined ||
        typeof partType !== 'string' ||
        payload === null ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        !createdAt
    ) {
        return undefined;
    }

    return {
        id: id as MessagePartRecord['id'],
        messageId: messageId,
        sequence,
        partType: partType as MessagePartRecord['partType'],
        payload: payload as MessagePartRecord['payload'],
        createdAt,
    };
}

function readRunRecord(value: unknown): RunRecord | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const candidate = value as Record<string, unknown>;
    const id = typeof candidate['id'] === 'string' ? candidate['id'] : undefined;
    const sessionId = typeof candidate['sessionId'] === 'string' ? candidate['sessionId'] : undefined;
    const profileId = typeof candidate['profileId'] === 'string' ? candidate['profileId'] : undefined;
    const prompt = typeof candidate['prompt'] === 'string' ? candidate['prompt'] : undefined;
    const status = candidate['status'];
    const createdAt = typeof candidate['createdAt'] === 'string' ? candidate['createdAt'] : undefined;
    const updatedAt = typeof candidate['updatedAt'] === 'string' ? candidate['updatedAt'] : undefined;

    if (
        !id ||
        !isEntityId(id, 'run') ||
        !sessionId ||
        !isEntityId(sessionId, 'sess') ||
        !profileId ||
        prompt === undefined ||
        typeof status !== 'string' ||
        !createdAt ||
        !updatedAt
    ) {
        return undefined;
    }

    return {
        id,
        sessionId,
        profileId,
        prompt,
        status: status as RunRecord['status'],
        createdAt,
        updatedAt,
    };
}

export function hydrateTanstackTranscriptState(
    messages: MessageRecord[],
    partsByMessageId: Map<string, MessagePartRecord[]>
): TanstackTranscriptState {
    const sortedMessages = sortMessages(messages);
    const messagesById = new Map(sortedMessages.map((message) => [message.id, message]));
    const normalizedPartsByMessageId = new Map<string, MessagePartRecord[]>();

    for (const message of sortedMessages) {
        normalizedPartsByMessageId.set(message.id, sortMessageParts(partsByMessageId.get(message.id) ?? []));
    }

    const projectedByMessageId = new Map(
        sortedMessages.map((message) => [message.id, buildProjectedMessage(message, normalizedPartsByMessageId)])
    );
    const orderedMessageIds = sortedMessages.map((message) => message.id);

    return {
        sessionId: sortedMessages[0]?.sessionId ?? null,
        orderedMessageIds,
        messagesById,
        partsByMessageId: normalizedPartsByMessageId,
        projectedByMessageId,
        digest: buildDigest({
            orderedMessageIds,
            messagesById,
            partsByMessageId: normalizedPartsByMessageId,
        }),
    };
}

export function projectTanstackTranscriptState(state: TanstackTranscriptState): ConversationTanstackMessage[] {
    return state.orderedMessageIds
        .map((messageId) => state.projectedByMessageId.get(messageId))
        .filter((message): message is ConversationTanstackMessage => message !== undefined);
}

export function applyMessageUpsertToTanstackTranscriptState(
    state: TanstackTranscriptState,
    message: MessageRecord
): TanstackTranscriptState {
    const nextState = cloneStateMaps(state);
    nextState.messagesById.set(message.id, message);

    if (!nextState.partsByMessageId.has(message.id)) {
        nextState.partsByMessageId.set(message.id, []);
    }

    const orderedMessages = sortMessages([...nextState.messagesById.values()]);
    const orderedMessageIds = orderedMessages.map((candidate) => candidate.id);
    nextState.projectedByMessageId.set(message.id, buildProjectedMessage(message, nextState.partsByMessageId));

    return {
        sessionId: message.sessionId,
        orderedMessageIds,
        ...nextState,
        digest: buildDigest({
            orderedMessageIds,
            messagesById: nextState.messagesById,
            partsByMessageId: nextState.partsByMessageId,
        }),
    };
}

export function applyMessagePartUpsertToTanstackTranscriptState(
    state: TanstackTranscriptState,
    messagePart: MessagePartRecord
): TanstackTranscriptState {
    const message = state.messagesById.get(messagePart.messageId);
    if (!message) {
        return state;
    }

    const nextState = cloneStateMaps(state);
    const currentParts = nextState.partsByMessageId.get(messagePart.messageId) ?? [];
    const nextParts = sortMessageParts([...currentParts.filter((part) => part.id !== messagePart.id), messagePart]);
    nextState.partsByMessageId.set(messagePart.messageId, nextParts);
    nextState.projectedByMessageId.set(message.id, buildProjectedMessage(message, nextState.partsByMessageId));

    return {
        ...state,
        ...nextState,
        digest: buildDigest({
            orderedMessageIds: state.orderedMessageIds,
            messagesById: nextState.messagesById,
            partsByMessageId: nextState.partsByMessageId,
        }),
    };
}

export function applyRuntimeEventToTanstackTranscriptState(
    state: TanstackTranscriptState,
    event: RuntimeEventRecordV1
): TanstackTranscriptState | 'resync' {
    if (event.operation === 'reset') {
        return 'resync';
    }

    if (state.sessionId === null) {
        return state;
    }

    if (event.domain === 'message') {
        const message = readMessageRecord(event.payload['message']);
        if (!message) {
            return state;
        }

        return message.sessionId === state.sessionId
            ? applyMessageUpsertToTanstackTranscriptState(state, message)
            : state;
    }

    if (event.domain === 'messagePart') {
        const messagePart = readMessagePartRecord(event.payload['part']);
        if (!messagePart) {
            return state;
        }

        return applyMessagePartUpsertToTanstackTranscriptState(state, messagePart);
    }

    if (event.domain === 'run') {
        const run = readRunRecord(event.payload['run']);
        if (!run) {
            return state;
        }

        return run.sessionId === state.sessionId ? state : state;
    }

    return state;
}
