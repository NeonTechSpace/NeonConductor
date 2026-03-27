import { patchSandboxCaches } from '@/web/components/conversation/shell/workspace/sandboxCache';
import type {
    ThreadListInput,
    WorkspaceSandboxCacheUtils,
} from '@/web/components/conversation/shell/workspace/sandboxCache';
import type { WorkspaceActionFeedback, WorkspaceActionMutationResult } from '@/web/components/conversation/shell/workspace/workspaceActionMutationResult';
import { trpc } from '@/web/trpc/client';


type TrpcUtils = ReturnType<typeof trpc.useUtils>;
type PendingPermissionListData = Awaited<ReturnType<TrpcUtils['permission']['listPending']['fetch']>>;

export interface WorkspaceActionOutcomeUtils extends WorkspaceSandboxCacheUtils {
    permission: {
        listPending: {
            setData: (
                input: undefined,
                updater: (current: PendingPermissionListData | undefined) => PendingPermissionListData | undefined
            ) => unknown;
        };
    };
}

function removeResolvedPermissionRequest(
    utils: WorkspaceActionOutcomeUtils,
    requestId: string
) {
    utils.permission.listPending.setData(undefined, (current) => {
        if (!current) {
            return current;
        }

        return {
            requests: current.requests.filter((request) => request.id !== requestId),
        };
    });
}

export function applyWorkspaceActionOutcome(input: {
    utils: WorkspaceActionOutcomeUtils;
    profileId: string;
    listThreadsInput: ThreadListInput;
    result: WorkspaceActionMutationResult;
}): WorkspaceActionFeedback | undefined {
    if (input.result.ok) {
        switch (input.result.cacheEffect.kind) {
            case 'none':
                break;
            case 'permission_request_resolved':
                removeResolvedPermissionRequest(input.utils, input.result.cacheEffect.requestId);
                break;
            case 'thread_execution_configured':
                patchSandboxCaches({
                    utils: input.utils,
                    profileId: input.profileId,
                    listThreadsInput: input.listThreadsInput,
                    thread: input.result.cacheEffect.thread,
                    ...(input.result.cacheEffect.sandbox ? { sandbox: input.result.cacheEffect.sandbox } : {}),
                });
                break;
            case 'sandbox_refreshed':
                patchSandboxCaches({
                    utils: input.utils,
                    profileId: input.profileId,
                    listThreadsInput: input.listThreadsInput,
                    sandbox: input.result.cacheEffect.sandbox,
                });
                break;
            case 'sandboxes_removed':
                if (input.result.cacheEffect.removedSandboxIds.length > 0) {
                    patchSandboxCaches({
                        utils: input.utils,
                        profileId: input.profileId,
                        listThreadsInput: input.listThreadsInput,
                        removedSandboxIds: input.result.cacheEffect.removedSandboxIds,
                    });
                }
                break;
        }
    }

    return input.result.feedback;
}
