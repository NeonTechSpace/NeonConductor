import { sessionHistoryStore, sessionStore, threadStore } from '@/app/backend/persistence/stores';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import type { SessionSummaryRecord } from '@/app/backend/persistence/types';
import type { EntityId } from '@/app/backend/runtime/contracts';

export class SessionHistoryService {
    async truncateFromRun(
        profileId: string,
        sessionId: EntityId<'sess'>,
        runId: EntityId<'run'>
    ): Promise<
        | { truncated: false; reason: 'session_not_found' | 'run_not_found' | 'no_turns' }
        | { truncated: true; session: SessionSummaryRecord; deletedRunIds: EntityId<'run'>[] }
    > {
        const session = await sessionHistoryStore.getSessionRecord(profileId, sessionId);
        if (!session) {
            return { truncated: false, reason: 'session_not_found' };
        }

        const runs = await sessionHistoryStore.listRunsAscending(profileId, session.id);
        if (runs.length === 0) {
            return { truncated: false, reason: 'no_turns' };
        }

        const index = runs.findIndex((item) => item.id === runId);
        if (index < 0) {
            return { truncated: false, reason: 'run_not_found' };
        }

        const deletedRunIds = runs.slice(index).map((item) => parseEntityId(item.id, 'runs.id', 'run'));
        await sessionHistoryStore.deleteRuns(profileId, deletedRunIds);

        const refreshed = await sessionStore.refreshStatus(profileId, session.id);
        if (refreshed.isErr()) {
            return { truncated: false, reason: 'session_not_found' };
        }
        await threadStore.touchByThread(profileId, session.thread_id);

        return {
            truncated: true,
            session: refreshed.value,
            deletedRunIds,
        };
    }

    async createBranchFromRun(
        profileId: string,
        sessionId: EntityId<'sess'>,
        runId: EntityId<'run'>
    ): Promise<
        | { branched: false; reason: 'session_not_found' | 'run_not_found' }
        | {
              branched: true;
              session: SessionSummaryRecord;
              sourceRunCount: number;
              clonedRunCount: number;
              sourceThreadId: string;
              thread: {
                  id: string;
                  topLevelTab: 'chat' | 'agent' | 'orchestrator';
                  parentThreadId?: string;
                  rootThreadId: string;
              };
          }
    > {
        const sourceSession = await sessionHistoryStore.getSessionRecord(profileId, sessionId);
        if (!sourceSession) {
            return { branched: false, reason: 'session_not_found' };
        }

        const sourceThread = await threadStore.getById(profileId, sourceSession.thread_id);
        if (!sourceThread) {
            return { branched: false, reason: 'session_not_found' };
        }

        const branchThread = await threadStore.create({
            profileId,
            conversationId: sourceSession.conversation_id,
            title: `${sourceThread.title} (Branch)`,
            topLevelTab: sourceThread.topLevelTab,
            parentThreadId: sourceThread.id,
            rootThreadId: sourceThread.rootThreadId,
        });
        if (branchThread.isErr()) {
            return { branched: false, reason: 'session_not_found' };
        }

        const created = await sessionHistoryStore.createBranchFromRun({
            profileId,
            sourceSession,
            branchThreadId: branchThread.value.id,
            targetRunId: runId,
        });
        if (!created.created) {
            return { branched: false, reason: created.reason };
        }

        const summary = await sessionStore.refreshStatus(profileId, created.branchSessionId);
        if (summary.isErr()) {
            return { branched: false, reason: 'session_not_found' };
        }
        await threadStore.touchByThread(profileId, sourceSession.thread_id);
        await threadStore.touchByThread(profileId, branchThread.value.id);
        if (created.latestAssistantAt) {
            await threadStore.markAssistantActivity(profileId, branchThread.value.id, created.latestAssistantAt);
        }

        return {
            branched: true,
            session: summary.value,
            sourceRunCount: created.sourceRunCount,
            clonedRunCount: created.clonedRunCount,
            sourceThreadId: sourceThread.id,
            thread: {
                id: branchThread.value.id,
                topLevelTab: branchThread.value.topLevelTab,
                ...(branchThread.value.parentThreadId ? { parentThreadId: branchThread.value.parentThreadId } : {}),
                rootThreadId: branchThread.value.rootThreadId,
            },
        };
    }

    async createBranchThroughRun(
        profileId: string,
        sessionId: EntityId<'sess'>,
        runId: EntityId<'run'>
    ): Promise<
        | { branched: false; reason: 'session_not_found' | 'run_not_found' }
        | {
              branched: true;
              session: SessionSummaryRecord;
              sourceRunCount: number;
              clonedRunCount: number;
              sourceThreadId: string;
              thread: {
                  id: string;
                  topLevelTab: 'chat' | 'agent' | 'orchestrator';
                  parentThreadId?: string;
                  rootThreadId: string;
              };
          }
    > {
        const sourceSession = await sessionHistoryStore.getSessionRecord(profileId, sessionId);
        if (!sourceSession) {
            return { branched: false, reason: 'session_not_found' };
        }

        const sourceThread = await threadStore.getById(profileId, sourceSession.thread_id);
        if (!sourceThread) {
            return { branched: false, reason: 'session_not_found' };
        }

        const branchThread = await threadStore.create({
            profileId,
            conversationId: sourceSession.conversation_id,
            title: `${sourceThread.title} (Branch)`,
            topLevelTab: sourceThread.topLevelTab,
            parentThreadId: sourceThread.id,
            rootThreadId: sourceThread.rootThreadId,
        });
        if (branchThread.isErr()) {
            return { branched: false, reason: 'session_not_found' };
        }

        const created = await sessionHistoryStore.createBranchFromRun({
            profileId,
            sourceSession,
            branchThreadId: branchThread.value.id,
            targetRunId: runId,
            includeTargetRun: true,
        });
        if (!created.created) {
            return { branched: false, reason: created.reason };
        }

        const summary = await sessionStore.refreshStatus(profileId, created.branchSessionId);
        if (summary.isErr()) {
            return { branched: false, reason: 'session_not_found' };
        }
        await threadStore.touchByThread(profileId, sourceSession.thread_id);
        await threadStore.touchByThread(profileId, branchThread.value.id);
        if (created.latestAssistantAt) {
            await threadStore.markAssistantActivity(profileId, branchThread.value.id, created.latestAssistantAt);
        }

        return {
            branched: true,
            session: summary.value,
            sourceRunCount: created.sourceRunCount,
            clonedRunCount: created.clonedRunCount,
            sourceThreadId: sourceThread.id,
            thread: {
                id: branchThread.value.id,
                topLevelTab: branchThread.value.topLevelTab,
                ...(branchThread.value.parentThreadId ? { parentThreadId: branchThread.value.parentThreadId } : {}),
                rootThreadId: branchThread.value.rootThreadId,
            },
        };
    }

    async revert(
        profileId: string,
        sessionId: EntityId<'sess'>
    ): Promise<
        { reverted: false; reason: 'not_found' | 'no_turns' } | { reverted: true; session: SessionSummaryRecord }
    > {
        const session = await sessionHistoryStore.getSessionRecord(profileId, sessionId);
        if (!session) {
            return { reverted: false, reason: 'not_found' };
        }

        const latestRun = await sessionHistoryStore.getLatestRun(profileId, session.id);
        if (!latestRun) {
            return { reverted: false, reason: 'no_turns' };
        }

        await sessionHistoryStore.deleteRuns(profileId, [latestRun.id]);

        const refreshed = await sessionStore.refreshStatus(profileId, session.id);
        if (refreshed.isErr()) {
            return { reverted: false, reason: 'not_found' };
        }
        await threadStore.touchByThread(profileId, session.thread_id);

        return {
            reverted: true,
            session: refreshed.value,
        };
    }
}

export const sessionHistoryService = new SessionHistoryService();
