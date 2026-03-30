import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deletionActionTestState = vi.hoisted(() => {
    const listBucketsInvalidateMock = vi.fn().mockResolvedValue(undefined);
    const listThreadsInvalidateMock = vi.fn().mockResolvedValue(undefined);
    const sessionListInvalidateMock = vi.fn().mockResolvedValue(undefined);
    const mutateAsyncMock = vi.fn().mockResolvedValue(undefined);
    const useUtilsMock = vi.fn(() => ({
        conversation: {
            listBuckets: {
                invalidate: listBucketsInvalidateMock,
            },
            listThreads: {
                invalidate: listThreadsInvalidateMock,
            },
        },
        session: {
            list: {
                invalidate: sessionListInvalidateMock,
            },
        },
    }));

    const useMutationMock = vi.fn((options: {
        onSuccess?: () => Promise<void> | void;
    }) => ({
        isPending: false,
        mutateAsync: async (variables: { profileId: string; workspaceFingerprint: string; includeFavorites: boolean }) => {
            await options?.onSuccess?.();
            return mutateAsyncMock(variables);
        },
    }));

    return {
        listBucketsInvalidateMock,
        listThreadsInvalidateMock,
        sessionListInvalidateMock,
        mutateAsyncMock,
        useUtilsMock,
        useMutationMock,
    };
});

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: deletionActionTestState.useUtilsMock,
        conversation: {
            deleteWorkspaceThreads: {
                useMutation: deletionActionTestState.useMutationMock,
            },
        },
    },
}));

import { useWorkspaceConversationDeletionAction } from '@/web/components/workspaces/useWorkspaceConversationDeletionAction';

let lastDeletionAction: ReturnType<typeof useWorkspaceConversationDeletionAction> | undefined;

function DeletionActionProbe() {
    lastDeletionAction = useWorkspaceConversationDeletionAction({ profileId: 'profile_default' });
    return null;
}

describe('useWorkspaceConversationDeletionAction', () => {
    beforeEach(() => {
        lastDeletionAction = undefined;
        deletionActionTestState.listBucketsInvalidateMock.mockClear();
        deletionActionTestState.listThreadsInvalidateMock.mockClear();
        deletionActionTestState.sessionListInvalidateMock.mockClear();
        deletionActionTestState.mutateAsyncMock.mockClear();
        deletionActionTestState.useUtilsMock.mockClear();
        deletionActionTestState.useMutationMock.mockClear();
    });

    it('deletes workspace conversations and invalidates the dependent conversation caches', async () => {
        renderToStaticMarkup(<DeletionActionProbe />);

        await lastDeletionAction?.deleteWorkspaceConversations('wsf_alpha');

        expect(deletionActionTestState.useMutationMock).toHaveBeenCalledTimes(1);
        expect(deletionActionTestState.mutateAsyncMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
            workspaceFingerprint: 'wsf_alpha',
            includeFavorites: false,
        });
        expect(deletionActionTestState.listBucketsInvalidateMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
        expect(deletionActionTestState.listThreadsInvalidateMock).toHaveBeenCalledTimes(1);
        expect(deletionActionTestState.sessionListInvalidateMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
    });
});
