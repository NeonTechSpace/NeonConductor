import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { resolveTabSwitchNotice } from '@/web/components/conversation/shell/workspace/tabSwitch';
import { trpc } from '@/web/trpc/client';

import type { useConversationShellComposer } from '@/web/components/conversation/hooks/useConversationShellComposer';
import type { useConversationShellSessionActions } from '@/web/components/conversation/hooks/useConversationShellSessionActions';
import type { ConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import type { useConversationMutations } from '@/web/components/conversation/shell/actions/useConversationMutations';
import type { useConversationQueries } from '@/web/components/conversation/shell/queries/useConversationQueries';

import type { SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

interface CreateConversationThreadInput {
    profileId: string;
    topLevelTab: TopLevelTab;
    utils: ReturnType<typeof trpc.useUtils>;
    listThreadsInput: ReturnType<typeof useConversationQueries>['listThreadsInput'];
    uiState: ConversationUiState;
    composer: ReturnType<typeof useConversationShellComposer>;
    mutations: ReturnType<typeof useConversationMutations>;
    sessionActions: ReturnType<typeof useConversationShellSessionActions>;
    onTopLevelTabChange: (nextTab: TopLevelTab) => void;
    onSelectedWorkspaceFingerprintChange: ((workspaceFingerprint: string | undefined) => void) | undefined;
    onApplySessionWorkspaceUpdate: (input: {
        session: SessionSummaryRecord;
        thread?: ThreadListRecord;
    }) => void;
    onSetTabSwitchNotice: (notice: string | undefined) => void;
    onFocusComposerRequest: () => void;
}

interface CreateConversationThreadRequest {
    workspaceFingerprint: string;
    workspaceAbsolutePath: string;
    title: string;
    topLevelTab: TopLevelTab;
    providerId?: RuntimeProviderId;
    modelId?: string;
}

export async function createConversationThread(
    input: CreateConversationThreadInput,
    request: CreateConversationThreadRequest
): Promise<void> {
    const generatedTitle =
        request.title.trim().length > 0 ? request.title.trim() : `New ${request.topLevelTab.toLowerCase()} thread`;
    const switchState = resolveTabSwitchNotice(input.topLevelTab, request.topLevelTab);
    if (switchState.shouldSwitch) {
        input.onTopLevelTabChange(request.topLevelTab);
        input.onSetTabSwitchNotice(switchState.notice);
        window.setTimeout(() => {
            input.onSetTabSwitchNotice(undefined);
        }, 2200);
    } else {
        input.onSetTabSwitchNotice(undefined);
    }

    const result = await input.mutations.createThreadMutation.mutateAsync({
        profileId: input.profileId,
        topLevelTab: request.topLevelTab,
        scope: 'workspace',
        workspacePath: request.workspaceAbsolutePath,
        title: generatedTitle,
        ...(request.providerId && request.modelId
            ? { providerId: request.providerId, modelId: request.modelId }
            : {}),
    });
    const createdThread: ThreadListRecord = {
        ...result.thread,
        scope: 'workspace',
        workspaceFingerprint: request.workspaceFingerprint,
        anchorKind: 'workspace',
        anchorId: request.workspaceFingerprint,
        sessionCount: 0,
    };

    input.utils.conversation.listBuckets.setData({ profileId: input.profileId }, (current) =>
        current
            ? {
                  buckets: [result.bucket, ...current.buckets.filter((bucket) => bucket.id !== result.bucket.id)],
              }
            : current
    );
    input.utils.conversation.listThreads.setData(input.listThreadsInput, (current) =>
        current
            ? {
                  ...current,
                  threads: [createdThread, ...current.threads.filter((thread) => thread.id !== createdThread.id)],
              }
            : current
    );

    if (!isEntityId(result.thread.id, 'thr')) {
        input.uiState.setSelectedThreadId(result.thread.id);
        input.uiState.setSelectedSessionId(undefined);
        input.uiState.setSelectedRunId(undefined);
        return;
    }

    input.onSelectedWorkspaceFingerprintChange?.(request.workspaceFingerprint);
    input.uiState.setSelectedThreadId(result.thread.id);
    input.uiState.setSelectedRunId(undefined);
    const starterSession = await input.mutations.createSessionMutation.mutateAsync({
        profileId: input.profileId,
        threadId: result.thread.id,
        kind: 'local',
    });
    if (!starterSession.created) {
        input.uiState.setSelectedSessionId(undefined);
        input.composer.setRunSubmitError('The starter session could not be created automatically.');
        return;
    }

    input.utils.session.listRuns.setData(
        {
            profileId: input.profileId,
            sessionId: starterSession.session.id,
        },
        {
            runs: [],
        }
    );
    input.onApplySessionWorkspaceUpdate({
        session: starterSession.session,
        thread: createdThread,
    });
    if (request.providerId && request.modelId) {
        input.sessionActions.setSessionTarget(starterSession.session.id, request.providerId, request.modelId);
    }
    input.uiState.setSelectedSessionId(starterSession.session.id);
    input.onFocusComposerRequest();
}
