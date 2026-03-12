import { messageStore, threadStore } from '@/app/backend/persistence/stores';
import type { SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';
import type { EntityId, SessionBranchFromMessageInput } from '@/app/backend/runtime/contracts';
import { sessionHistoryService } from '@/app/backend/runtime/services/sessionHistory/service';

export type SessionBranchFromMessageResult =
    | {
          branched: false;
          reason: 'message_not_found' | 'message_not_branchable' | 'session_not_found' | 'thread_tab_mismatch';
      }
    | {
          branched: true;
          sourceSessionId: EntityId<'sess'>;
          sessionId: EntityId<'sess'>;
          session: SessionSummaryRecord;
          sourceThreadId: string;
          threadId: string;
          thread: ThreadListRecord;
          topLevelTab: 'chat' | 'agent' | 'orchestrator';
      };

export class SessionBranchService {
    async branchFromMessage(input: SessionBranchFromMessageInput): Promise<SessionBranchFromMessageResult> {
        const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
        if (!sessionThread) {
            return {
                branched: false,
                reason: 'session_not_found',
            };
        }
        if (sessionThread.thread.topLevelTab !== input.topLevelTab) {
            return {
                branched: false,
                reason: 'thread_tab_mismatch',
            };
        }

        const target = await messageStore.getBranchMessageTarget({
            profileId: input.profileId,
            sessionId: input.sessionId,
            messageId: input.messageId,
        });
        if (!target.found) {
            return {
                branched: false,
                reason: target.reason === 'not_branchable' ? 'message_not_branchable' : 'message_not_found',
            };
        }

        const branched = await sessionHistoryService.createBranchThroughRun(
            input.profileId,
            input.sessionId,
            target.runId
        );
        if (!branched.branched) {
            return {
                branched: false,
                reason: 'session_not_found',
            };
        }

        const thread = await threadStore.getListRecordById(input.profileId, branched.thread.id);
        if (!thread) {
            return {
                branched: false,
                reason: 'session_not_found',
            };
        }

        return {
            branched: true,
            sourceSessionId: input.sessionId,
            sessionId: branched.session.id,
            session: branched.session,
            sourceThreadId: branched.sourceThreadId,
            threadId: branched.thread.id,
            thread,
            topLevelTab: branched.thread.topLevelTab,
        };
    }
}

export const sessionBranchService = new SessionBranchService();
