import { workspaceActionMutationFailure, workspacePermissionResolutionSuccess } from '@/web/components/conversation/shell/workspace/workspaceActionMutationResult';

import type { PermissionRecord } from '@/app/backend/persistence/types';

import type { PermissionResolution } from '@/shared/contracts';

interface ResolveConversationPermissionInput {
    profileId: string;
    onResolvePermission: () => void;
    mutateAsync: (input: {
        profileId: string;
        requestId: PermissionRecord['id'];
        resolution: PermissionResolution;
        selectedApprovalResource?: string;
    }) => Promise<unknown>;
    payload: {
        requestId: PermissionRecord['id'];
        resolution: PermissionResolution;
        selectedApprovalResource?: string;
    };
}

export async function resolveConversationPermission(
    input: ResolveConversationPermissionInput
) {
    try {
        input.onResolvePermission();
        await input.mutateAsync({
            profileId: input.profileId,
            requestId: input.payload.requestId,
            resolution: input.payload.resolution,
            ...(input.payload.selectedApprovalResource
                ? { selectedApprovalResource: input.payload.selectedApprovalResource }
                : {}),
        });
        return workspacePermissionResolutionSuccess(input.payload.requestId);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Permission resolution failed.';
        return workspaceActionMutationFailure({
            action: 'permission_resolution',
            message,
            includeFeedback: false,
        });
    }
}
