import { useEffect, useRef, useState } from 'react';

import {
    applyRuntimeEventsToConversationTranscript,
    buildConversationTranscriptBaselineKey,
    projectConversationTranscriptMessages,
} from '@/web/components/conversation/messages/conversationTanstackTranscriptController';
import type { OptimisticConversationUserMessage } from '@/web/components/conversation/messages/optimisticUserMessage';
import type { ConversationTanstackMessage } from '@/web/components/conversation/messages/tanstackMessageBridge';
import { hydrateTanstackTranscriptState } from '@/web/components/conversation/messages/tanstackTranscriptState';
import { useRuntimeEventStreamStore } from '@/web/lib/runtime/eventStream';

import type { MessagePartRecord, MessageRecord } from '@/app/backend/persistence/types';

export function useConversationTanstackMessages(input: {
    sessionId?: string;
    messages: MessageRecord[];
    partsByMessageId: Map<string, MessagePartRecord[]>;
    optimisticUserMessage?: OptimisticConversationUserMessage;
}): ConversationTanstackMessage[] {
    const runtimeEvents = useRuntimeEventStreamStore((state) => state.events);
    const baselineState = hydrateTanstackTranscriptState(input.messages, input.partsByMessageId);
    const baselineKey = buildConversationTranscriptBaselineKey(baselineState);
    const [transcriptState, setTranscriptState] = useState(baselineState);
    const appliedBaselineKeyRef = useRef(baselineKey);
    const lastAppliedSequenceRef = useRef(0);

    useEffect(() => {
        if (appliedBaselineKeyRef.current !== baselineKey) {
            appliedBaselineKeyRef.current = baselineKey;
            lastAppliedSequenceRef.current = useRuntimeEventStreamStore.getState().lastSequence;
            setTranscriptState(baselineState);
        }
    }, [baselineKey, baselineState]);

    useEffect(() => {
        const appliedEvents = applyRuntimeEventsToConversationTranscript({
            currentState: transcriptState,
            baselineState,
            runtimeEvents,
            lastAppliedSequence: lastAppliedSequenceRef.current,
        });

        if (!appliedEvents.didChange) {
            return;
        }

        lastAppliedSequenceRef.current = appliedEvents.lastAppliedSequence;
        if (appliedEvents.resetToBaseline) {
            appliedBaselineKeyRef.current = baselineKey;
        }
        setTranscriptState(appliedEvents.nextState);
    }, [baselineKey, baselineState, runtimeEvents, transcriptState]);

    return projectConversationTranscriptMessages({
        transcriptState,
        ...(input.sessionId ? { requestedSessionId: input.sessionId } : {}),
        ...(input.optimisticUserMessage ? { optimisticUserMessage: input.optimisticUserMessage } : {}),
    });
}
