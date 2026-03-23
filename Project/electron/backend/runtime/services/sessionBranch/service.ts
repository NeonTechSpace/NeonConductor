import { messageStore, sessionStore, threadStore } from '@/app/backend/persistence/stores';
import type { SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';
import type {
    EntityId,
    SessionBranchFromMessageInput,
    SessionBranchFromMessageWithWorkflowInput,
} from '@/app/backend/runtime/contracts';
import { sandboxService } from '@/app/backend/runtime/services/sandbox/service';
import { sessionHistoryService } from '@/app/backend/runtime/services/sessionHistory/service';
import { workflowService } from '@/app/backend/runtime/services/workflows/service';
import {
    workflowExecutionService,
    type BranchWorkflowExecutionResult,
} from '@/app/backend/runtime/services/workflows/execution';

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

export type SessionBranchFromMessageWithWorkflowResult =
    | {
          branched: false;
          reason:
              | 'message_not_found'
              | 'message_not_branchable'
              | 'session_not_found'
              | 'thread_tab_mismatch'
              | 'workspace_required'
              | 'workflow_not_found'
              | 'workflow_disabled';
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
          workflowExecution: BranchWorkflowExecutionResult;
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

    async branchFromMessageWithWorkflow(
        input: SessionBranchFromMessageWithWorkflowInput
    ): Promise<SessionBranchFromMessageWithWorkflowResult> {
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
        if (sessionThread.scope !== 'workspace' || !sessionThread.workspaceFingerprint) {
            return {
                branched: false,
                reason: 'workspace_required',
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

        const selectedWorkflow = input.workflowId
            ? await workflowService.getProjectWorkflow({
                  profileId: input.profileId,
                  workspaceFingerprint: sessionThread.workspaceFingerprint,
                  workflowId: input.workflowId,
              })
            : null;
        if (input.workflowId && !selectedWorkflow) {
            return {
                branched: false,
                reason: 'workflow_not_found',
            };
        }
        if (selectedWorkflow && !selectedWorkflow.enabled) {
            return {
                branched: false,
                reason: 'workflow_disabled',
            };
        }

        const branched = await sessionHistoryService.createBranchThroughRun(input.profileId, input.sessionId, target.runId, {
            branchExecutionEnvironmentMode: 'new_sandbox',
            branchSessionKind: 'local',
            branchSessionSandboxId: null,
        });
        if (!branched.branched) {
            return {
                branched: false,
                reason: 'session_not_found',
            };
        }

        let branchThread = await threadStore.getById(input.profileId, branched.thread.id);
        let branchSession = branched.session;
        if (branchThread) {
            const materializedSandbox = await sandboxService.materializeThreadSandbox({
                profileId: input.profileId,
                thread: branchThread,
                workspaceFingerprint: sessionThread.workspaceFingerprint,
            });
            if (materializedSandbox.isOk() && materializedSandbox.value) {
                branchThread =
                    (await threadStore.getById(input.profileId, branched.thread.id)) ?? {
                        ...branchThread,
                        executionEnvironmentMode: 'sandbox',
                        sandboxId: materializedSandbox.value.id,
                    };
                branchSession =
                    (await sessionStore.setSandboxBinding({
                        profileId: input.profileId,
                        sessionId: branched.session.id,
                        sandboxId: materializedSandbox.value.id,
                    })) ?? branchSession;
            }
        }

        const thread = await threadStore.getListRecordById(input.profileId, branched.thread.id);
        if (!thread) {
            return {
                branched: false,
                reason: 'session_not_found',
            };
        }

        const workflowExecution =
            selectedWorkflow && thread.workspaceFingerprint
                ? await workflowExecutionService.executeBranchWorkflow({
                      profileId: input.profileId,
                      workspaceFingerprint: thread.workspaceFingerprint,
                      ...(thread.sandboxId ? { sandboxId: thread.sandboxId } : {}),
                      command: selectedWorkflow.command,
                  })
                : { status: 'not_requested' as const };

        return {
            branched: true,
            sourceSessionId: input.sessionId,
            sessionId: branched.session.id,
            session: branchSession,
            sourceThreadId: branched.sourceThreadId,
            threadId: branched.thread.id,
            thread,
            topLevelTab: branched.thread.topLevelTab,
            workflowExecution,
        };
    }
}

export const sessionBranchService = new SessionBranchService();
