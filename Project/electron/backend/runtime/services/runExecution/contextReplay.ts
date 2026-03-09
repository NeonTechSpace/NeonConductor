import type { MessagePartRecord, MessageRecord } from '@/app/backend/persistence/types';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';

export interface ReplayMessage {
    messageId: MessageRecord['id'];
    role: RunContextMessage['role'];
    text: string;
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
    return null;
}

function extractText(parts: MessagePartRecord[]): string {
    const segments: string[] = [];
    for (const part of parts) {
        const text = part.payload['text'];
        if (typeof text !== 'string') {
            continue;
        }
        const normalized = text.trim();
        if (normalized.length === 0) {
            continue;
        }
        segments.push(normalized);
    }

    return segments.join('\n\n').trim();
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
        const text = extractText(input.partsByMessageId.get(message.id) ?? []);
        if (!text) {
            continue;
        }
        replay.push({
            messageId: message.id,
            role,
            text,
        });
    }

    return replay;
}
