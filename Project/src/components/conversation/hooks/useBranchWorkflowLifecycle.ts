import { useState } from 'react';

import type { ConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import type { MessageFlowMessage } from '@/web/components/conversation/messages/messageFlowModel';
import { toBranchFailureMessage } from '@/web/components/conversation/shell/editFlow';
import { buildBranchSelectionTransition } from '@/web/components/conversation/shell/editFlowSelection';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { trpc } from '@/web/trpc/client';

import type { SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';

import type {
    SessionBranchFromMessageInput,
    SessionBranchFromMessageWithBranchWorkflowInput,
    TopLevelTab,
} from '@/shared/contracts';
import type { EntityId } from '@/shared/contracts';

interface PendingBranchWorkflowSelection {
    messageId: EntityId<'msg'>;
    workspaceFingerprint: string;
}

export interface BranchWorkflowDialogState {
    open: boolean;
    profileId: string;
    workspaceFingerprint: string;
    onClose: () => void;
    onBranch: (branchWorkflowId?: string) => Promise<void>;
}

interface UseBranchWorkflowLifecycleInput {
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
    branchFromMessageWithBranchWorkflow: (input: SessionBranchFromMessageWithBranchWorkflowInput) => Promise<
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
              branchWorkflowExecution:
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
    onSessionEdited: (input: { sessionId: string; session: SessionSummaryRecord; thread?: ThreadListRecord }) => void;
}

type BranchWorkflowExecutionStatus =
    | { status: 'not_requested' }
    | { status: 'succeeded' }
    | { status: 'approval_required'; requestId: string; message: string }
    | { status: 'failed'; message: string };

export function shouldUseBranchWorkflowChooser(input: {
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

export function interpretBranchWorkflowExecutionStatus(branchWorkflowExecution: BranchWorkflowExecutionStatus): {
    message: string | undefined;
    shouldInvalidatePendingPermissions: boolean;
} {
    if (branchWorkflowExecution.status === 'approval_required') {
        return {
            message: `Branch created. ${branchWorkflowExecution.message}`,
            shouldInvalidatePendingPermissions: true,
        };
    }
    if (branchWorkflowExecution.status === 'failed') {
        return {
            message: `Branch created, but the branch workflow failed: ${branchWorkflowExecution.message}`,
            shouldInvalidatePendingPermissions: false,
        };
    }

    return {
        message: undefined,
        shouldInvalidatePendingPermissions: false,
    };
}

function createClosedBranchWorkflowDialogState(profileId: string): BranchWorkflowDialogState {
    return {
        open: false,
        profileId,
        workspaceFingerprint: '',
        onClose: () => undefined,
        onBranch: () => Promise.resolve(),
    };
}

export function useBranchWorkflowLifecycle(input: UseBranchWorkflowLifecycleInput) {
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

    const selectedBranchWorkflowSessionId = isEntityId(input.selectedSessionId, 'sess')
        ? input.selectedSessionId
        : undefined;
    const dialogProps =
        pendingBranchSelection && selectedBranchWorkflowSessionId
            ? {
                  open: true,
                  profileId: input.profileId,
                  workspaceFingerprint: pendingBranchSelection.workspaceFingerprint,
                  onClose: () => {
                      setPendingBranchSelection(undefined);
                  },
                  onBranch: async (branchWorkflowId?: string) => {
                      input.onClearError();
                      const result = await input.branchFromMessageWithBranchWorkflow({
                          profileId: input.profileId,
                          sessionId: selectedBranchWorkflowSessionId,
                          topLevelTab: input.topLevelTab,
                          messageId: pendingBranchSelection.messageId,
                          modeKey: input.modeKey,
                          ...(branchWorkflowId ? { branchWorkflowId } : {}),
                      });
                      if (!result.branched) {
                          input.onError(toBranchFailureMessage(result.reason));
                          return;
                      }

                      setPendingBranchSelection(undefined);
                      applyBranchSelection(result);
                      const branchWorkflowOutcome = interpretBranchWorkflowExecutionStatus(
                          result.branchWorkflowExecution
                      );
                      if (branchWorkflowOutcome.shouldInvalidatePendingPermissions) {
                          await utils.permission.listPending.invalidate();
                      }
                      if (branchWorkflowOutcome.message) {
                          input.onError(branchWorkflowOutcome.message);
                          return;
                      }
                      input.onClearError();
                  },
              }
            : createClosedBranchWorkflowDialogState(input.profileId);

    return {
        onBranchFromMessage: (entry: MessageFlowMessage) => {
            if (!isEntityId(entry.id, 'msg')) {
                input.onError('Select a message before creating a branch.');
                return;
            }
            const messageId = entry.id;
            if (!isEntityId(input.selectedSessionId, 'sess')) {
                input.onError('Select a session before creating a branch.');
                return;
            }

            const selectedThread = input.selectedThread;
            if (
                selectedThread &&
                shouldUseBranchWorkflowChooser({
                    topLevelTab: input.topLevelTab,
                    selectedThread,
                })
            ) {
                const workspaceFingerprint = selectedThread.workspaceFingerprint;
                if (typeof workspaceFingerprint !== 'string' || workspaceFingerprint.length === 0) {
                    input.onError('Select a workspace-backed thread before branching with a branch workflow.');
                    return;
                }
                setPendingBranchSelection({
                    messageId,
                    workspaceFingerprint,
                });
                input.onClearError();
                return;
            }

            void runPlainBranch(messageId);
        },
        dialogProps,
    };
}
