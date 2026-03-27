import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import {
    workspaceActionMutationFailure,
    workspaceOrphanedSandboxesRemovedSuccess,
    workspaceSandboxRefreshedSuccess,
    workspaceSandboxRemovedSuccess,
    workspaceThreadExecutionConfiguredSuccess,
} from '@/web/components/conversation/shell/workspace/workspaceActionMutationResult';

import type { SandboxRecord, ThreadRecord } from '@/app/backend/persistence/types';

import type {
    ConversationSetThreadExecutionEnvironmentInput,
    EntityId,
} from '@/shared/contracts';

interface ConfigureThreadExecutionInput {
    profileId: string;
    threadId: EntityId<'thr'>;
    executionInput: Pick<ConversationSetThreadExecutionEnvironmentInput, 'mode' | 'sandboxId'>;
    mutateAsync: (input: {
        profileId: string;
        threadId: EntityId<'thr'>;
        mode: ConversationSetThreadExecutionEnvironmentInput['mode'];
        sandboxId?: EntityId<'sb'>;
    }) => Promise<{
        thread: ThreadRecord;
        sandbox?: SandboxRecord;
    }>;
}

interface RefreshSandboxInput {
    profileId: string;
    sandboxId: `sb_${string}`;
    mutateAsync: (input: { profileId: string; sandboxId: `sb_${string}` }) => Promise<{
        refreshed: boolean;
        reason?: 'not_found' | 'error';
        sandbox?: SandboxRecord;
    }>;
}

interface RemoveSandboxInput {
    profileId: string;
    sandboxId: `sb_${string}`;
    mutateAsync: (input: {
        profileId: string;
        sandboxId: `sb_${string}`;
        removeFiles: boolean;
    }) => Promise<{
        removed: boolean;
        sandboxId?: string;
        message?: string;
    }>;
}

interface RemoveOrphanedSandboxesInput {
    profileId: string;
    workspaceFingerprint?: string;
    mutateAsync: (input: {
        profileId: string;
        workspaceFingerprint?: string;
    }) => Promise<{
        removedSandboxIds: string[];
    }>;
}

export async function configureConversationThreadExecution(
    input: ConfigureThreadExecutionInput
) {
    const selectedSandboxId =
        input.executionInput.mode === 'sandbox' && isEntityId(input.executionInput.sandboxId, 'sb')
            ? input.executionInput.sandboxId
            : undefined;

    try {
        const result = await input.mutateAsync({
            profileId: input.profileId,
            threadId: input.threadId,
            mode: input.executionInput.mode,
            ...(selectedSandboxId ? { sandboxId: selectedSandboxId } : {}),
        });
        return workspaceThreadExecutionConfiguredSuccess({
            threadId: input.threadId,
            executionMode: input.executionInput.mode,
            thread: result.thread,
            ...(result.sandbox ? { sandbox: result.sandbox } : {}),
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Execution environment update failed.';
        return workspaceActionMutationFailure({
            action: 'thread_execution_configuration',
            message,
        });
    }
}

export async function refreshManagedSandbox(input: RefreshSandboxInput) {
    try {
        const result = await input.mutateAsync({
            profileId: input.profileId,
            sandboxId: input.sandboxId,
        });
        if (!result.refreshed || !result.sandbox) {
            return workspaceActionMutationFailure({
                action: 'sandbox_refresh',
                message:
                    result.reason === 'not_found'
                        ? 'Managed sandbox no longer exists.'
                        : 'Managed sandbox refresh failed.',
            });
        }
        return workspaceSandboxRefreshedSuccess(result.sandbox);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Managed sandbox refresh failed.';
        return workspaceActionMutationFailure({
            action: 'sandbox_refresh',
            message,
        });
    }
}

export async function removeManagedSandbox(input: RemoveSandboxInput) {
    try {
        const result = await input.mutateAsync({
            profileId: input.profileId,
            sandboxId: input.sandboxId,
            removeFiles: true,
        });
        if (!result.removed || !result.sandboxId) {
            return workspaceActionMutationFailure({
                action: 'sandbox_removal',
                message: result.message ?? 'Managed sandbox removal failed.',
            });
        }
        if (!isEntityId(result.sandboxId, 'sb')) {
            return workspaceActionMutationFailure({
                action: 'sandbox_removal',
                message: 'Managed sandbox removal failed.',
            });
        }
        return workspaceSandboxRemovedSuccess(result.sandboxId);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Managed sandbox removal failed.';
        return workspaceActionMutationFailure({
            action: 'sandbox_removal',
            message,
        });
    }
}

export async function removeOrphanedManagedSandboxes(input: RemoveOrphanedSandboxesInput) {
    try {
        const result = await input.mutateAsync({
            profileId: input.profileId,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });
        const removedSandboxIds = result.removedSandboxIds.filter(
            (sandboxId): sandboxId is `sb_${string}` => isEntityId(sandboxId, 'sb')
        );
        return workspaceOrphanedSandboxesRemovedSuccess({
            removedSandboxIds,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Orphaned sandbox cleanup failed.';
        return workspaceActionMutationFailure({
            action: 'orphaned_sandbox_cleanup',
            message,
        });
    }
}
