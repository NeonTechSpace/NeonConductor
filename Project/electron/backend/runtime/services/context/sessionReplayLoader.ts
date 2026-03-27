import { messageStore, sessionContextCompactionStore } from '@/app/backend/persistence/stores';
import type { SessionContextCompactionRecord } from '@/app/backend/persistence/types';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';
import { buildReplayMessages, toPartsMap, type ReplayMessage } from '@/app/backend/runtime/services/runExecution/contextReplay';

export interface SessionReplaySnapshot {
    replayMessages: ReplayMessage[];
    compaction: SessionContextCompactionRecord | null;
    hasMultimodalContent: boolean;
}

export function applyPersistedCompaction(
    replayMessages: ReplayMessage[],
    compaction: SessionContextCompactionRecord | null
): { replayMessages: ReplayMessage[]; summaryMessage?: RunContextMessage } {
    if (!compaction) {
        return { replayMessages };
    }

    const cutoffIndex = replayMessages.findIndex((message) => message.messageId === compaction.cutoffMessageId);
    if (cutoffIndex < 0) {
        return { replayMessages };
    }

    return {
        replayMessages: replayMessages.slice(cutoffIndex + 1),
        summaryMessage: {
            role: 'system',
            parts: [
                {
                    type: 'text',
                    text: `Compacted conversation summary\n\n${compaction.summaryText}`,
                },
            ],
        },
    };
}

export async function loadSessionReplaySnapshot(input: {
    profileId: string;
    sessionId: string;
}): Promise<SessionReplaySnapshot> {
    const [messages, parts, compaction] = await Promise.all([
        messageStore.listMessagesBySession(input.profileId, input.sessionId),
        messageStore.listPartsBySession(input.profileId, input.sessionId),
        sessionContextCompactionStore.get(input.profileId, input.sessionId),
    ]);

    const replayMessages = buildReplayMessages({
        messages,
        partsByMessageId: toPartsMap(parts),
    });

    return {
        replayMessages,
        compaction,
        hasMultimodalContent: replayMessages.some((message) => message.parts.some((part) => part.type === 'image')),
    };
}
