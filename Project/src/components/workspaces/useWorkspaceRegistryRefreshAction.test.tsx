import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshActionTestState = vi.hoisted(() => {
    const listResolvedInvalidateMock = vi.fn().mockResolvedValue(undefined);
    const mutateAsyncMock = vi.fn().mockResolvedValue(undefined);
    const useUtilsMock = vi.fn(() => ({
        registry: {
            listResolved: {
                invalidate: listResolvedInvalidateMock,
            },
        },
    }));

    let mutationOptions:
        | {
              onSuccess?: (result: unknown, variables: { profileId: string; workspaceFingerprint: string }) => Promise<void> | void;
          }
        | undefined;

    const useMutationMock = vi.fn((options: typeof mutationOptions) => {
        mutationOptions = options;
        return {
            isPending: false,
            mutateAsync: async (variables: { profileId: string; workspaceFingerprint: string }) => {
                await options?.onSuccess?.({}, variables);
                return mutateAsyncMock(variables);
            },
        };
    });

    return {
        listResolvedInvalidateMock,
        mutateAsyncMock,
        useUtilsMock,
        useMutationMock,
    };
});

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: refreshActionTestState.useUtilsMock,
        registry: {
            refresh: {
                useMutation: refreshActionTestState.useMutationMock,
            },
        },
    },
}));

import { useWorkspaceRegistryRefreshAction } from '@/web/components/workspaces/useWorkspaceRegistryRefreshAction';

let lastRefreshAction: ReturnType<typeof useWorkspaceRegistryRefreshAction> | undefined;

function RefreshActionProbe() {
    lastRefreshAction = useWorkspaceRegistryRefreshAction({ profileId: 'profile_default' });
    return null;
}

describe('useWorkspaceRegistryRefreshAction', () => {
    beforeEach(() => {
        lastRefreshAction = undefined;
        refreshActionTestState.listResolvedInvalidateMock.mockClear();
        refreshActionTestState.mutateAsyncMock.mockClear();
        refreshActionTestState.useUtilsMock.mockClear();
        refreshActionTestState.useMutationMock.mockClear();
    });

    it('refreshes the targeted workspace registry and invalidates the resolved registry view', async () => {
        renderToStaticMarkup(<RefreshActionProbe />);

        await lastRefreshAction?.refreshRegistry('wsf_alpha');

        expect(refreshActionTestState.useMutationMock).toHaveBeenCalledTimes(1);
        expect(refreshActionTestState.mutateAsyncMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
            workspaceFingerprint: 'wsf_alpha',
        });
        expect(refreshActionTestState.listResolvedInvalidateMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
            workspaceFingerprint: 'wsf_alpha',
        });
    });
});
