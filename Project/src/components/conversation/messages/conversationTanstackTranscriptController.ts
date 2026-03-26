import type { OptimisticConversationUserMessage } from '@/web/components/conversation/messages/optimisticUserMessage';
import {
    type ConversationTanstackMessage,
    projectOptimisticConversationUserMessage,
} from '@/web/components/conversation/messages/tanstackMessageBridge';
import {
    applyRuntimeEventToTanstackTranscriptState,
    projectTanstackTranscriptState,
    type TanstackTranscriptState,
} from '@/web/components/conversation/messages/tanstackTranscriptState';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

export interface ApplyRuntimeEventsToConversationTranscriptInput {
    currentState: TanstackTranscriptState;
    baselineState: TanstackTranscriptState;
    runtimeEvents: RuntimeEventRecordV1[];
    lastAppliedSequence: number;
}

export interface ApplyRuntimeEventsToConversationTranscriptResult {
    nextState: TanstackTranscriptState;
    lastAppliedSequence: number;
    didChange: boolean;
    resetToBaseline: boolean;
}

export function buildConversationTranscriptBaselineKey(state: TanstackTranscriptState): string {
    return `${state.sessionId ?? 'sess_detached'}:${state.digest}`;
}

export function applyRuntimeEventsToConversationTranscript(
    input: ApplyRuntimeEventsToConversationTranscriptInput
): ApplyRuntimeEventsToConversationTranscriptResult {
    const { baselineState, currentState, lastAppliedSequence: initialLastAppliedSequence, runtimeEvents } = input;

    if (
        baselineState.sessionId === null ||
        runtimeEvents.length === 0 ||
        currentState.sessionId !== baselineState.sessionId
    ) {
        return {
            nextState: currentState,
            lastAppliedSequence: initialLastAppliedSequence,
            didChange: false,
            resetToBaseline: false,
        };
    }

    let nextState = currentState;
    let lastAppliedSequence = initialLastAppliedSequence;

    for (const event of runtimeEvents) {
        if (event.sequence <= lastAppliedSequence) {
            continue;
        }

        if (lastAppliedSequence > 0 && event.sequence > lastAppliedSequence + 1) {
            return {
                nextState: baselineState,
                lastAppliedSequence: runtimeEvents.at(-1)?.sequence ?? lastAppliedSequence,
                didChange: baselineState !== currentState,
                resetToBaseline: true,
            };
        }

        const appliedState = applyRuntimeEventToTanstackTranscriptState(nextState, event);
        if (appliedState === 'resync') {
            return {
                nextState: baselineState,
                lastAppliedSequence: runtimeEvents.at(-1)?.sequence ?? event.sequence,
                didChange: baselineState !== currentState,
                resetToBaseline: true,
            };
        }

        nextState = appliedState;
        lastAppliedSequence = event.sequence;
    }

    if (lastAppliedSequence === initialLastAppliedSequence) {
        return {
            nextState: currentState,
            lastAppliedSequence,
            didChange: false,
            resetToBaseline: false,
        };
    }

    return {
        nextState,
        lastAppliedSequence,
        didChange: nextState !== currentState,
        resetToBaseline: false,
    };
}

export function projectConversationTranscriptMessages(input: {
    transcriptState: TanstackTranscriptState;
    requestedSessionId?: string;
    optimisticUserMessage?: OptimisticConversationUserMessage;
}): ConversationTanstackMessage[] {
    const projectedMessages = projectTanstackTranscriptState(input.transcriptState);
    const resolvedSessionId = input.transcriptState.sessionId ?? input.requestedSessionId ?? null;

    if (!input.optimisticUserMessage || resolvedSessionId !== input.optimisticUserMessage.sessionId) {
        return projectedMessages;
    }

    return [...projectedMessages, projectOptimisticConversationUserMessage(input.optimisticUserMessage)];
}
