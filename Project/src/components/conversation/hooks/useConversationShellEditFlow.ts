import { useState } from 'react';

import type { ConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import type { MessageFlowMessage } from '@/web/components/conversation/messages/messageFlowModel';
import {
    toBranchFailureMessage,
    toEditFailureMessage,
    type PendingMessageEdit,
} from '@/web/components/conversation/shell/editFlow';
import { createPendingMessageEdit } from '@/web/components/conversation/shell/pendingMessageEdit';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { RunRecord, SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';

import type {
    RuntimeProviderId,
    RuntimeRunOptions,
    SessionBranchFromMessageInput,
    SessionEditInput,
    TopLevelTab,
} from '@/shared/contracts';

interface UseConversationShellEditFlowInput {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    selectedSessionId: string | undefined;
    selectedThread: ThreadListRecord | undefined;
    resolvedRunTarget:
        | {
              providerId: RuntimeProviderId;
              modelId: string;
          }
        | undefined;
    runtimeOptions: RuntimeRunOptions;
    editSession: (input: SessionEditInput) => Promise<
        | { edited: false; reason: string }
        | {
              edited: true;
              sessionId: string;
              session: SessionSummaryRecord;
              sourceSessionId: string;
              editMode: 'truncate' | 'branch';
              started: boolean;
              runId?: string;
              run?: RunRecord;
              thread?: ThreadListRecord;
              threadId?: string;
              topLevelTab?: TopLevelTab;
          }
    >;
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
    setEditPreference: (input: { profileId: string; value: 'truncate' | 'branch' }) => Promise<void>;
    uiState: ConversationUiState;
    onTopLevelTabChange: (nextTab: TopLevelTab) => void;
    onClearError: () => void;
    onError: (message: string) => void;
    onPromptReset: () => void;
    onComposerFocusRequest: () => void;
    onSessionEdited: (input: {
        sessionId: string;
        session: SessionSummaryRecord;
        runId?: string;
        run?: RunRecord;
        thread?: ThreadListRecord;
    }) => void;
}

export function useConversationShellEditFlow(input: UseConversationShellEditFlowInput) {
    const [pendingMessageEdit, setPendingMessageEdit] = useState<PendingMessageEdit | undefined>(undefined);
    const utils = trpc.useUtils();
    const editPreferenceQuery = trpc.conversation.getEditPreference.useQuery(
        {
            profileId: input.profileId,
        },
        PROGRESSIVE_QUERY_OPTIONS
    );

    const editPreference: 'ask' | 'truncate' | 'branch' =
        editPreferenceQuery.data?.value === 'truncate' || editPreferenceQuery.data?.value === 'branch'
            ? editPreferenceQuery.data.value
            : 'ask';

    return {
        pendingMessageEdit,
        editPreference,
        resetEditFlow: () => {
            setPendingMessageEdit(undefined);
        },
        onEditMessage: (entry: MessageFlowMessage) => {
            const pendingEdit = createPendingMessageEdit(entry);
            if (pendingEdit) {
                setPendingMessageEdit(pendingEdit);
            }
        },
        onBranchFromMessage: (entry: MessageFlowMessage) => {
            if (!isEntityId(entry.id, 'msg')) {
                input.onError('Select a message before creating a branch.');
                return;
            }
            if (!isEntityId(input.selectedSessionId, 'sess')) {
                input.onError('Select a session before creating a branch.');
                return;
            }

            input.onClearError();
            void input
                .branchFromMessage({
                    profileId: input.profileId,
                    sessionId: input.selectedSessionId,
                    topLevelTab: input.topLevelTab,
                    messageId: entry.id,
                })
                .then((result) => {
                    if (!result.branched) {
                        input.onError(toBranchFailureMessage(result.reason));
                        return;
                    }

                    if (isEntityId(result.threadId, 'thr')) {
                        input.uiState.setSelectedThreadId(result.threadId);
                    }
                    if (result.topLevelTab !== input.topLevelTab) {
                        input.onTopLevelTabChange(result.topLevelTab);
                    }
                    input.uiState.setSelectedSessionId(result.sessionId);
                    input.uiState.setSelectedRunId(undefined);
                    input.onPromptReset();
                    input.onComposerFocusRequest();
                    input.onSessionEdited({
                        sessionId: result.sessionId,
                        session: result.session,
                        thread: result.thread,
                    });
                })
                .catch((error: unknown) => {
                    const message = error instanceof Error ? error.message : String(error);
                    input.onError(`Branch failed: ${message}`);
                });
        },
        dialogProps: {
            open: Boolean(pendingMessageEdit),
            initialText: pendingMessageEdit?.initialText ?? '',
            preferredResolution: editPreference,
            ...(pendingMessageEdit?.forcedMode ? { forcedMode: pendingMessageEdit.forcedMode } : {}),
            onCancel: () => {
                setPendingMessageEdit(undefined);
            },
            onSave: (dialogInput: {
                replacementText: string;
                editMode: 'truncate' | 'branch';
                rememberChoice: boolean;
            }) => {
                if (!pendingMessageEdit) {
                    return;
                }
                if (!isEntityId(input.selectedSessionId, 'sess')) {
                    input.onError('Select a session before editing a message.');
                    return;
                }

                input.onClearError();
                void input
                    .editSession({
                        profileId: input.profileId,
                        sessionId: input.selectedSessionId,
                        topLevelTab: input.topLevelTab,
                        modeKey: input.modeKey,
                        messageId: pendingMessageEdit.messageId,
                        replacementText: dialogInput.replacementText,
                        editMode: dialogInput.editMode,
                        autoStartRun: true,
                        runtimeOptions: input.runtimeOptions,
                        ...(input.resolvedRunTarget ? { providerId: input.resolvedRunTarget.providerId } : {}),
                        ...(input.resolvedRunTarget ? { modelId: input.resolvedRunTarget.modelId } : {}),
                        ...(input.selectedThread?.workspaceFingerprint
                            ? { workspaceFingerprint: input.selectedThread.workspaceFingerprint }
                            : {}),
                        ...(input.selectedThread?.worktreeId ? { worktreeId: input.selectedThread.worktreeId } : {}),
                    })
                    .then(async (result) => {
                        if (!result.edited) {
                            input.onError(toEditFailureMessage(result.reason));
                            return;
                        }

                        if (dialogInput.rememberChoice && editPreference === 'ask') {
                            await input.setEditPreference({
                                profileId: input.profileId,
                                value: dialogInput.editMode,
                            });
                            utils.conversation.getEditPreference.setData(
                                {
                                    profileId: input.profileId,
                                },
                                {
                                    value: dialogInput.editMode,
                                }
                            );
                        }

                        if (result.threadId && isEntityId(result.threadId, 'thr')) {
                            input.uiState.setSelectedThreadId(result.threadId);
                        }
                        if (result.topLevelTab && result.topLevelTab !== input.topLevelTab) {
                            input.onTopLevelTabChange(result.topLevelTab);
                        }
                        input.uiState.setSelectedSessionId(result.sessionId);
                        if (result.runId) {
                            input.uiState.setSelectedRunId(result.runId);
                        } else {
                            input.uiState.setSelectedRunId(undefined);
                        }
                        setPendingMessageEdit(undefined);
                        input.onPromptReset();
                        input.onSessionEdited({
                            sessionId: result.sessionId,
                            session: result.session,
                            ...(result.runId ? { runId: result.runId } : {}),
                            ...(result.run ? { run: result.run } : {}),
                            ...(result.thread ? { thread: result.thread } : {}),
                        });
                    })
                    .catch((error: unknown) => {
                        const message = error instanceof Error ? error.message : String(error);
                        input.onError(`Edit failed: ${message}`);
                    });
            },
        },
    };
}
