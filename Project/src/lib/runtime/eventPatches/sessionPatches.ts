

import { updateMatchingQueryData } from '@/web/lib/runtime/eventPatches/queryCache';
import {
    readMessagePartRecord,
    readMessageRecord,
    readRunRecord,
    resolveSessionActiveRunId,
    upsertMessagePartRecord,
    upsertRunRecord,
} from '@/web/lib/runtime/eventPatches/readers';
import type { SessionMessagesQueryData } from '@/web/lib/runtime/eventPatches/types';
import type { RuntimeEventContext, TrpcUtils } from '@/web/lib/runtime/invalidation/types';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

export function applyMessagePartRuntimeEventPatch(event: RuntimeEventRecordV1, context: RuntimeEventContext): boolean {
    const messagePart = readMessagePartRecord(event.payload['part']);
    if (!messagePart || !context.profileId || !context.sessionId) {
        return false;
    }

    updateMatchingQueryData<SessionMessagesQueryData>(
        ['session', 'listMessages', context.profileId, context.sessionId],
        (current) => {
            if (!current || !current.messages.some((message) => message.id === messagePart.messageId)) {
                return current;
            }

            return {
                ...current,
                messageParts: upsertMessagePartRecord(current.messageParts, messagePart),
            };
        }
    );
    return true;
}

export function applyMessageRuntimeEventPatch(event: RuntimeEventRecordV1, context: RuntimeEventContext): boolean {
    const message = readMessageRecord(event.payload['message']);
    if (!message || !context.profileId || !context.sessionId) {
        return false;
    }

    updateMatchingQueryData<SessionMessagesQueryData>(
        ['session', 'listMessages', context.profileId, context.sessionId],
        (current) => {
            if (!current) {
                return current;
            }

            return {
                ...current,
                messages: [...current.messages.filter((candidate) => candidate.id !== message.id), message].sort(
                    (left, right) => left.createdAt.localeCompare(right.createdAt)
                ),
            };
        }
    );
    return true;
}

export function applyRunRuntimeEventPatch(utils: TrpcUtils, event: RuntimeEventRecordV1): boolean {
    const run = readRunRecord(event.payload['run']);
    if (!run) {
        return false;
    }

    utils.session.listRuns.setData(
        {
            profileId: run.profileId,
            sessionId: run.sessionId,
        },
        (current) =>
            current
                ? {
                      runs: upsertRunRecord(current.runs, run),
                  }
                : current
    );

    utils.session.status.setData(
        {
            profileId: run.profileId,
            sessionId: run.sessionId,
        },
        (current) =>
            current && current.found
                ? {
                      ...current,
                      session: {
                          ...current.session,
                          runStatus: run.status,
                      },
                      activeRunId: resolveSessionActiveRunId(current.activeRunId, run),
                  }
                : current
    );

    utils.session.list.setData(
        {
            profileId: run.profileId,
        },
        (current) =>
            current
                ? {
                      sessions: current.sessions.map((session) =>
                          session.id === run.sessionId
                              ? {
                                    ...session,
                                    runStatus: run.status,
                                }
                              : session
                      ),
                  }
                : current
    );

    return true;
}

