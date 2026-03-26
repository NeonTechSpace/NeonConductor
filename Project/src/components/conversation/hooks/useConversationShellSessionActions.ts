import { useState } from 'react';

import {
    applySessionModelOverride,
    applySessionProviderOverride,
} from '@/web/components/conversation/shell/sessionTargetState';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';

import type { SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';

import type { SessionCreateInput, RuntimeProviderId } from '@/shared/contracts';
import type { EntityId } from '@/shared/contracts';

interface UseConversationShellSessionActionsInput {
    profileId: string;
    selectedThreadId: string | undefined;
    selectedSessionId: string | undefined;
    createSession: (input: SessionCreateInput) => Promise<
        | { created: false; reason: string }
        | {
              created: true;
              session: SessionSummaryRecord;
              thread?: ThreadListRecord;
          }
    >;
    onClearError: () => void;
    onError: (message: string) => void;
    onSelectSessionId: (sessionId: string | undefined) => void;
    onSelectRunId: (runId: string | undefined) => void;
    onSessionCreated: (result: {
        sessionId: EntityId<'sess'>;
        session: SessionSummaryRecord;
        thread?: ThreadListRecord;
    }) => void;
}

function readSessionCreationErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Session could not be created.';
}

export async function submitConversationSessionCreate(input: {
    profileId: string;
    selectedThreadId: EntityId<'thr'>;
    createSession: UseConversationShellSessionActionsInput['createSession'];
    onClearError: () => void;
    onError: (message: string) => void;
    onSelectSessionId: (sessionId: string | undefined) => void;
    onSelectRunId: (runId: string | undefined) => void;
    onSessionCreated: UseConversationShellSessionActionsInput['onSessionCreated'];
}): Promise<void> {
    try {
        const result = await input.createSession({
            profileId: input.profileId,
            threadId: input.selectedThreadId,
            kind: 'local',
        });
        if (!result.created) {
            input.onError('Selected thread no longer exists.');
            return;
        }

        input.onSelectSessionId(result.session.id);
        input.onSelectRunId(undefined);
        input.onClearError();
        input.onSessionCreated({
            sessionId: result.session.id,
            session: result.session,
            ...(result.thread ? { thread: result.thread } : {}),
        });
    } catch (error) {
        input.onError(readSessionCreationErrorMessage(error));
    }
}

export function useConversationShellSessionActions(input: UseConversationShellSessionActionsInput) {
    const [sessionTargetBySessionId, setSessionTargetBySessionId] = useState<
        Record<string, { providerId?: RuntimeProviderId; modelId?: string }>
    >({});

    return {
        sessionOverride: input.selectedSessionId ? sessionTargetBySessionId[input.selectedSessionId] : undefined,
        setSessionTarget: (sessionId: EntityId<'sess'>, providerId: RuntimeProviderId, modelId: string) => {
            if (modelId.trim().length === 0) {
                return;
            }

            setSessionTargetBySessionId((current) =>
                applySessionModelOverride(current, sessionId, providerId, modelId)
            );
            input.onClearError();
        },
        resetSessionActions: () => {
            setSessionTargetBySessionId({});
        },
        onSelectSession: (sessionId: string) => {
            input.onClearError();
            input.onSelectSessionId(sessionId);
        },
        onProviderChange: (providerId: RuntimeProviderId, firstModelId?: string) => {
            if (!isEntityId(input.selectedSessionId, 'sess')) {
                return;
            }

            const sessionId = input.selectedSessionId;
            setSessionTargetBySessionId((current) =>
                applySessionProviderOverride(current, sessionId, providerId, firstModelId)
            );
            input.onClearError();
        },
        onModelChange: (providerId: RuntimeProviderId | undefined, modelId: string) => {
            if (!isEntityId(input.selectedSessionId, 'sess') || !providerId || modelId.trim().length === 0) {
                return;
            }

            const sessionId = input.selectedSessionId;
            setSessionTargetBySessionId((current) =>
                applySessionModelOverride(current, sessionId, providerId, modelId)
            );
            input.onClearError();
        },
        onCreateSession: () => {
            if (!isEntityId(input.selectedThreadId, 'thr')) {
                return;
            }

            void submitConversationSessionCreate({
                profileId: input.profileId,
                selectedThreadId: input.selectedThreadId,
                createSession: input.createSession,
                onClearError: input.onClearError,
                onError: input.onError,
                onSelectSessionId: input.onSelectSessionId,
                onSelectRunId: input.onSelectRunId,
                onSessionCreated: input.onSessionCreated,
            });
        },
    };
}
