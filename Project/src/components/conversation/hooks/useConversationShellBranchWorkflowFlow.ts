import { useState } from 'react';

import type { ConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import type { MessageFlowMessage } from '@/web/components/conversation/messages/messageFlowModel';
import { buildBranchSelectionTransition } from '@/web/components/conversation/shell/editFlowSelection';
import { toBranchFailureMessage } from '@/web/components/conversation/shell/editFlow';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { trpc } from '@/web/trpc/client';

import type {
    SessionBranchFromMessageInput,
    SessionBranchFromMessageWithWorkflowInput,
} from '@/app/backend/runtime/contracts';
import type { SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';

import type { EntityId, TopLevelTab } from '@/shared/contracts';

interface PendingBranchWorkflowSelection {
    messageId: EntityId<'msg'>;
    workspaceFingerprint: string;
}

interface UseConversationShellBranchWorkflowFlowInput {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    selectedSessionId: string | undefined;
    selectedThread: ThreadListRecord | undefined;
    uiState: ConversationUiState;
    branchFromMessage: (input: SessionBranchFromMessageInput) => Promise<
        | { branched: false; reason: string }
        | {
              branched: true;
              sourceSessionId: string;
              sessionId: string;
              session: SessionSummaryRecord;
              sourceThreadId: string;
              threadId: string;
              thread: ThreadListRecord;
              topLevelTab: TopLevelTab;
          }
    >;
    branchFromMessageWithWorkflow: (input: SessionBranchFromMessageWithWorkflowInput) => Promise<
        | { branched: false; reason: string }
        | {
              branched: true;
              sourceSessionId: string;
              sessionId: string;
              session: SessionSummaryRecord;
              sourceThreadId: string;
              threadId: string;
              thread: ThreadListRecord;
              topLevelTab: TopLevelTab;
              workflowExecution:
                  | { status: 'not_requested' }
                  | { status: 'succeeded' }
                  | { status: 'approval_required'; requestId: string; message: string }
                  | { status: 'failed'; message: string };
          }
    >;
    onTopLevelTabChange: (nextTab: TopLevelTab) => void;
    onClearError: () => void;
    onError: (message: string) => void;
    onPromptReset: () => void;
    onComposerFocusRequest: () => void;
    onSessionEdited: (input: {
        sessionId: string;
        session: SessionSummaryRecord;
        thread?: ThreadListRecord;
    }) => void;
}

export function shouldUseWorkflowBranchChooser(input: {
    topLevelTab: TopLevelTab;
    selectedThread: ThreadListRecord | undefined;
}): input is {
    topLevelTab: 'agent' | 'orchestrator';
    selectedThread: ThreadListRecord & {
        scope: 'workspace';
        workspaceFingerprint: string;
    };
} {
    return (
        (input.topLevelTab === 'agent' || input.topLevelTab === 'orchestrator') &&
        input.selectedThread?.scope === 'workspace' &&
        typeof input.selectedThread.workspaceFingerprint === 'string' &&
        input.selectedThread.workspaceFingerprint.length > 0
    );
}

function toWorkflowExecutionMessage(result: {
    workflowExecution:
        | { status: 'not_requested' }
        | { status: 'succeeded' }
        | { status: 'approval_required'; requestId: string; message: string }
        | { status: 'failed'; message: string };
}): string | undefined {
    if (result.workflowExecution.status === 'approval_required') {
        return `Branch created. ${result.workflowExecution.message}`;
    }
    if (result.workflowExecution.status === 'failed') {
        return `Branch created, but the workflow failed: ${result.workflowExecution.message}`;
    }

    return undefined;
}

export function useConversationShellBranchWorkflowFlow(input: UseConversationShellBranchWorkflowFlowInput) {
    const [pendingBranchSelection, setPendingBranchSelection] = useState<PendingBranchWorkflowSelection | undefined>(
        undefined
    );
    const utils = trpc.useUtils();

    const applyBranchSelection = (result: {
        sessionId: string;
        threadId: string;
        topLevelTab: TopLevelTab;
        session: SessionSummaryRecord;
        thread: ThreadListRecord;
    }) => {
        const selectionTransition = buildBranchSelectionTransition({
            currentTopLevelTab: input.topLevelTab,
            result,
        });

        if (selectionTransition.selectedThreadId) {
            input.uiState.setSelectedThreadId(selectionTransition.selectedThreadId);
        }
        if (selectionTransition.nextTopLevelTab) {
            input.onTopLevelTabChange(selectionTransition.nextTopLevelTab);
        }
        input.uiState.setSelectedSessionId(selectionTransition.selectedSessionId);
        input.uiState.setSelectedRunId(undefined);
        input.onPromptReset();
        input.onComposerFocusRequest();
        input.onSessionEdited({
            sessionId: result.sessionId,
            session: result.session,
            thread: result.thread,
        });
    };

    const runPlainBranch = async (messageId: EntityId<'msg'>) => {
        if (!isEntityId(input.selectedSessionId, 'sess')) {
            input.onError('Select a session before creating a branch.');
            return;
        }

        input.onClearError();
        try {
            const result = await input.branchFromMessage({
                profileId: input.profileId,
                sessionId: input.selectedSessionId,
                topLevelTab: input.topLevelTab,
                messageId,
            });
            if (!result.branched) {
                input.onError(toBranchFailureMessage(result.reason));
                return;
            }

            applyBranchSelection(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            input.onError(`Branch failed: ${message}`);
        }
    };

    const selectedWorkflowSessionId = isEntityId(input.selectedSessionId, 'sess') ? input.selectedSessionId : undefined;
    const workflowDialogProps =
        pendingBranchSelection && selectedWorkflowSessionId
            ? {
                  open: true,
                  profileId: input.profileId,
                  workspaceFingerprint: pendingBranchSelection.workspaceFingerprint,
                  onClose: () => {
                      setPendingBranchSelection(undefined);
                  },
                  onBranch: async (workflowId?: string) => {
                      input.onClearError();
                      const result = await input.branchFromMessageWithWorkflow({
                          profileId: input.profileId,
                          sessionId: selectedWorkflowSessionId,
                          topLevelTab: input.topLevelTab,
                          messageId: pendingBranchSelection.messageId,
                          modeKey: input.modeKey,
                          ...(workflowId ? { workflowId } : {}),
                      });
                      if (!result.branched) {
                          input.onError(toBranchFailureMessage(result.reason));
                          return;
                      }

                      setPendingBranchSelection(undefined);
                      applyBranchSelection(result);
                      const workflowExecutionMessage = toWorkflowExecutionMessage(result);
                      if (workflowExecutionMessage) {
                          input.onError(workflowExecutionMessage);
                          if (result.workflowExecution.status === 'approval_required') {
                              await utils.permission.listPending.invalidate();
                          }
                          return;
                      }
                      input.onClearError();
                  },
              }
            : {
                  open: false,
                  profileId: input.profileId,
                  workspaceFingerprint: '',
                  onClose: () => undefined,
                  onBranch: async () => undefined,
              };

    return {
        onBranchFromMessage: (entry: MessageFlowMessage) => {
            if (!isEntityId(entry.id, 'msg')) {
                input.onError('Select a message before creating a branch.');
                return;
            }
            if (!isEntityId(input.selectedSessionId, 'sess')) {
                input.onError('Select a session before creating a branch.');
                return;
            }

            const selectedThread = input.selectedThread;
            if (
                selectedThread &&
                shouldUseWorkflowBranchChooser({
                    topLevelTab: input.topLevelTab,
                    selectedThread,
                })
            ) {
                const workspaceFingerprint = selectedThread.workspaceFingerprint;
                if (!workspaceFingerprint) {
                    input.onError('Select a workspace-bound session before creating a workflow branch.');
                    return;
                }
                setPendingBranchSelection({
                    messageId: entry.id,
                    workspaceFingerprint,
                });
                input.onClearError();
                return;
            }

            void runPlainBranch(entry.id);
        },
        dialogProps: workflowDialogProps,
    };
}
