import type { MessagePartRecord, MessageRecord } from '@/app/backend/persistence/types';
import {
    createReasoningEncryptedPart,
    createReasoningTextPart,
    createTextPart,
    createToolCallPart,
    createToolResultPart,
} from '@/app/backend/runtime/services/runExecution/contextParts';
import type { RunContextMessage, RunContextPart } from '@/app/backend/runtime/services/runExecution/types';
import { readImageMimeType } from '@/app/shared/imageMimeType';

export interface ReplayMessage {
    messageId: MessageRecord['id'];
    role: RunContextMessage['role'];
    parts: RunContextPart[];
}

export function toPartsMap(parts: MessagePartRecord[]): Map<string, MessagePartRecord[]> {
    const map = new Map<string, MessagePartRecord[]>();
    for (const part of parts) {
        const existing = map.get(part.messageId) ?? [];
        existing.push(part);
        map.set(part.messageId, existing);
    }
    return map;
}

function mapRole(role: MessageRecord['role']): RunContextMessage['role'] | null {
    if (role === 'user') {
        return 'user';
    }
    if (role === 'assistant') {
        return 'assistant';
    }
    if (role === 'system') {
        return 'system';
    }
    return 'tool';
}

function extractReplayParts(parts: MessagePartRecord[]): RunContextPart[] {
    const replayParts: RunContextPart[] = [];
    for (const part of parts) {
        if (part.partType === 'image') {
            const mediaId = part.payload['mediaId'];
            const attachmentId = part.payload['attachmentId'];
            const mimeType = part.payload['mimeType'];
            const width = part.payload['width'];
            const height = part.payload['height'];
            const normalizedMimeType = readImageMimeType(mimeType);
            if (
                (typeof mediaId === 'string' || typeof attachmentId === 'string') &&
                normalizedMimeType &&
                typeof width === 'number' &&
                typeof height === 'number'
            ) {
                replayParts.push({
                    type: 'image',
                    ...(typeof mediaId === 'string' ? { mediaId } : {}),
                    ...(typeof attachmentId === 'string' ? { attachmentId } : {}),
                    mimeType: normalizedMimeType,
                    width,
                    height,
                });
            }
            continue;
        }

        if (part.partType === 'text') {
            const text = typeof part.payload['text'] === 'string' ? part.payload['text'] : '';
            const textPart = createTextPart(text);
            if (textPart) {
                replayParts.push(textPart);
            }
            continue;
        }

        if (part.partType === 'reasoning' || part.partType === 'reasoning_summary') {
            const text = typeof part.payload['text'] === 'string' ? part.payload['text'] : '';
            const reasoningPart = createReasoningTextPart({
                type: part.partType,
                text,
                ...(typeof part.payload['detailType'] === 'string' ? { detailType: part.payload['detailType'] } : {}),
                ...(typeof part.payload['detailId'] === 'string' ? { detailId: part.payload['detailId'] } : {}),
                ...(typeof part.payload['detailFormat'] === 'string'
                    ? { detailFormat: part.payload['detailFormat'] }
                    : {}),
                ...(typeof part.payload['detailSignature'] === 'string'
                    ? { detailSignature: part.payload['detailSignature'] }
                    : {}),
                ...(typeof part.payload['detailIndex'] === 'number'
                    ? { detailIndex: part.payload['detailIndex'] }
                    : {}),
            });
            if (reasoningPart) {
                replayParts.push(reasoningPart);
            }
            continue;
        }

        if (part.partType === 'reasoning_encrypted') {
            const encryptedPart = createReasoningEncryptedPart({
                opaque: part.payload['opaque'],
                ...(typeof part.payload['detailType'] === 'string' ? { detailType: part.payload['detailType'] } : {}),
                ...(typeof part.payload['detailId'] === 'string' ? { detailId: part.payload['detailId'] } : {}),
                ...(typeof part.payload['detailFormat'] === 'string'
                    ? { detailFormat: part.payload['detailFormat'] }
                    : {}),
                ...(typeof part.payload['detailSignature'] === 'string'
                    ? { detailSignature: part.payload['detailSignature'] }
                    : {}),
                ...(typeof part.payload['detailIndex'] === 'number'
                    ? { detailIndex: part.payload['detailIndex'] }
                    : {}),
            });
            if (encryptedPart) {
                replayParts.push(encryptedPart);
            }
            continue;
        }

        if (part.partType === 'tool_call') {
            const callId = part.payload['callId'];
            const toolName = part.payload['toolName'];
            const argumentsText = part.payload['argumentsText'];
            if (typeof callId === 'string' && typeof toolName === 'string' && typeof argumentsText === 'string') {
                replayParts.push(
                    createToolCallPart({
                        callId,
                        toolName,
                        argumentsText,
                    })
                );
            }
            continue;
        }

        if (part.partType === 'tool_result') {
            const callId = part.payload['callId'];
            const toolName = part.payload['toolName'];
            const outputText = part.payload['outputText'];
            const isError = part.payload['isError'];
            if (
                typeof callId === 'string' &&
                typeof toolName === 'string' &&
                typeof outputText === 'string' &&
                typeof isError === 'boolean'
            ) {
                replayParts.push(
                    createToolResultPart({
                        callId,
                        toolName,
                        outputText,
                        isError,
                    })
                );
            }
        }
    }

    return replayParts;
}

export function buildReplayMessages(input: {
    messages: MessageRecord[];
    partsByMessageId: Map<string, MessagePartRecord[]>;
}): ReplayMessage[] {
    const replay: ReplayMessage[] = [];
    for (const message of input.messages) {
        const role = mapRole(message.role);
        if (!role) {
            continue;
        }
        const parts = extractReplayParts(input.partsByMessageId.get(message.id) ?? []);
        if (parts.length === 0) {
            continue;
        }
        replay.push({
            messageId: message.id,
            role,
            parts,
        });
    }

    return replay;
}
