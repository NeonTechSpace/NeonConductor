import { upsertThreadListRecord } from '@/web/components/conversation/sidebar/sidebarCache';
import { trpc } from '@/web/trpc/client';

import type {
    MessagePartRecord,
    MessageRecord,
    RunRecord,
    SessionSummaryRecord,
    ThreadListRecord,
} from '@/app/backend/persistence/types';

import type { EntityId } from '@/shared/contracts';

type TrpcUtils = ReturnType<typeof trpc.useUtils>;
type SessionListData = Awaited<ReturnType<TrpcUtils['session']['list']['fetch']>>;
type SessionStatusData = Awaited<ReturnType<TrpcUtils['session']['status']['fetch']>>;
type SessionRunsData = Awaited<ReturnType<TrpcUtils['session']['listRuns']['fetch']>>;
type SessionMessagesData = Awaited<ReturnType<TrpcUtils['session']['listMessages']['fetch']>>;
type ThreadListData = Awaited<ReturnType<TrpcUtils['conversation']['listThreads']['fetch']>>;

interface ThreadListInput {
    profileId: string;
    activeTab: 'chat' | 'agent' | 'orchestrator';
    showAllModes: boolean;
    groupView: 'workspace' | 'branch';
    scope?: 'detached' | 'workspace';
    workspaceFingerprint?: string;
    sort?: 'latest' | 'alphabetical';
}

function upsertSessionRecord(sessions: SessionSummaryRecord[], session: SessionSummaryRecord): SessionSummaryRecord[] {
    return [session, ...sessions.filter((candidate) => candidate.id !== session.id)].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
    );
}

function upsertRunRecord(runs: RunRecord[], run: RunRecord): RunRecord[] {
    return [run, ...runs.filter((candidate) => candidate.id !== run.id)].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
    );
}

function upsertMessageRecords(messages: MessageRecord[], incomingMessages: MessageRecord[]): MessageRecord[] {
    return [
        ...messages.filter((message) => !incomingMessages.some((incoming) => incoming.id === message.id)),
        ...incomingMessages,
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function upsertMessagePartRecords(
    messageParts: MessagePartRecord[],
    incomingMessageParts: MessagePartRecord[]
): MessagePartRecord[] {
    return [
        ...messageParts.filter((part) => !incomingMessageParts.some((incoming) => incoming.id === part.id)),
        ...incomingMessageParts,
    ].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
            return left.createdAt.localeCompare(right.createdAt);
        }

        return left.sequence - right.sequence;
    });
}

function matchesThreadListInput(thread: ThreadListRecord, input: ThreadListInput): boolean {
    if (!input.showAllModes && thread.topLevelTab !== input.activeTab) {
        return false;
    }
    if (input.scope && thread.scope !== input.scope) {
        return false;
    }
    if (input.workspaceFingerprint && thread.workspaceFingerprint !== input.workspaceFingerprint) {
        return false;
    }
    return true;
}

export function applyConversationSessionCacheUpdate(input: {
    utils: TrpcUtils;
    profileId: string;
    listThreadsInput: ThreadListInput;
    session: SessionSummaryRecord;
    run?: RunRecord;
    thread?: ThreadListRecord;
    initialMessagesForRun?: {
        runId: EntityId<'run'>;
        messages: MessageRecord[];
        messageParts: MessagePartRecord[];
    };
}) {
    const nextRun = input.run;
    const nextThread = input.thread;
    input.utils.session.list.setData(
        {
            profileId: input.profileId,
        },
        (current: SessionListData | undefined) => ({
            sessions: upsertSessionRecord(current?.sessions ?? [], input.session),
        })
    );

    input.utils.session.status.setData(
        {
            profileId: input.profileId,
            sessionId: input.session.id,
        },
        {
            found: true,
            session: input.session,
            activeRunId: nextRun?.id ?? null,
        } satisfies SessionStatusData
    );

    if (nextRun) {
        input.utils.session.listRuns.setData(
            {
                profileId: input.profileId,
                sessionId: input.session.id,
            },
            (current: SessionRunsData | undefined) => ({
                runs: upsertRunRecord(current?.runs ?? [], nextRun),
            })
        );
    }

    if (input.initialMessagesForRun) {
        const initialMessagesForRun = input.initialMessagesForRun;
        input.utils.session.listMessages.setData(
            {
                profileId: input.profileId,
                sessionId: input.session.id,
            },
            (current: SessionMessagesData | undefined): SessionMessagesData => ({
                messages: upsertMessageRecords(current?.messages ?? [], initialMessagesForRun.messages),
                messageParts: upsertMessagePartRecords(current?.messageParts ?? [], initialMessagesForRun.messageParts),
            })
        );
        input.utils.session.listMessages.setData(
            {
                profileId: input.profileId,
                sessionId: input.session.id,
                runId: initialMessagesForRun.runId,
            },
            (): SessionMessagesData => ({
                messages: initialMessagesForRun.messages,
                messageParts: initialMessagesForRun.messageParts,
            })
        );
    }

    if (nextThread) {
        input.utils.conversation.listThreads.setData(input.listThreadsInput, (current: ThreadListData | undefined) => {
            const existingThreads = current?.threads ?? [];
            const withoutThread = existingThreads.filter((candidate) => candidate.id !== nextThread.id);
            if (!matchesThreadListInput(nextThread, input.listThreadsInput)) {
                return {
                    sort: current?.sort ?? input.listThreadsInput.sort ?? 'latest',
                    showAllModes: current?.showAllModes ?? input.listThreadsInput.showAllModes,
                    groupView: current?.groupView ?? input.listThreadsInput.groupView,
                    threads: withoutThread,
                };
            }

            return {
                sort: current?.sort ?? input.listThreadsInput.sort ?? 'latest',
                showAllModes: current?.showAllModes ?? input.listThreadsInput.showAllModes,
                groupView: current?.groupView ?? input.listThreadsInput.groupView,
                threads: upsertThreadListRecord(withoutThread, nextThread, input.listThreadsInput.sort ?? 'latest'),
            };
        });
    }
}
