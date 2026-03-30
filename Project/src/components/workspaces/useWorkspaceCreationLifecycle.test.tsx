import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    registerWorkspaceRootMutation,
    setWorkspacePreferenceMutation,
    utilsMock,
    mutationConfigs,
} = vi.hoisted(() => {
    type MutationConfig = {
        onSuccess?: (...args: any[]) => void;
    };

    const mutationConfigs: Record<string, MutationConfig | undefined> = {};

    const createSetDataMock = () => vi.fn();

    return {
        registerWorkspaceRootMutation: {
            mutateAsync: vi.fn(async (input: { profileId: string; absolutePath: string; label: string }) => ({
                workspaceRoot: {
                    profileId: input.profileId,
                    fingerprint: 'ws_123',
                    label: input.label,
                    absolutePath: input.absolutePath,
                    createdAt: '2026-03-26T10:00:00.000Z',
                    updatedAt: '2026-03-26T10:00:00.000Z',
                },
            })),
            isPending: false,
            error: null,
        },
        setWorkspacePreferenceMutation: {
            mutateAsync: vi.fn(async (input: {
                profileId: string;
                workspaceFingerprint: string;
                defaultTopLevelTab: 'chat' | 'agent' | 'orchestrator';
                defaultProviderId?: string;
                defaultModelId?: string;
            }) => {
                const result = {
                    workspacePreference: {
                        profileId: input.profileId,
                        workspaceFingerprint: input.workspaceFingerprint,
                        preferredVcs: 'jj' as const,
                        preferredPackageManager: 'pnpm' as const,
                        updatedAt: '2026-03-26T10:05:00.000Z',
                    },
                };
                mutationConfigs.setWorkspacePreference?.onSuccess?.(result, input);
                return result;
            }),
            isPending: false,
            error: null,
        },
        utilsMock: {
            runtime: {
                listWorkspaceRoots: {
                    setData: createSetDataMock(),
                },
                getShellBootstrap: {
                    setData: createSetDataMock(),
                },
            },
        },
        mutationConfigs,
    };
});

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: () => utilsMock as never,
        runtime: {
            registerWorkspaceRoot: {
                useMutation: (config: { onSuccess?: (...args: any[]) => void }) => {
                    mutationConfigs.registerWorkspaceRoot = config;
                    return registerWorkspaceRootMutation;
                },
            },
            setWorkspacePreference: {
                useMutation: (config: { onSuccess?: (...args: any[]) => void }) => {
                    mutationConfigs.setWorkspacePreference = config;
                    return setWorkspacePreferenceMutation;
                },
            },
        },
    },
}));

import { useWorkspaceCreationLifecycle } from '@/web/components/workspaces/useWorkspaceCreationLifecycle';

function renderLifecycleProbe() {
    let returnedValue: ReturnType<typeof useWorkspaceCreationLifecycle> | undefined;

    function Probe() {
        returnedValue = useWorkspaceCreationLifecycle({ profileId: 'profile_default' });
        return null;
    }

    renderToStaticMarkup(<Probe />);
    return returnedValue;
}

describe('useWorkspaceCreationLifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mutationConfigs.registerWorkspaceRoot = undefined;
        mutationConfigs.setWorkspacePreference = undefined;
    });

    it('patches the workspace root and preference caches when creating a workspace', async () => {
        const lifecycle = renderLifecycleProbe();
        expect(lifecycle).toBeDefined();
        if (!lifecycle) {
            throw new Error('Expected workspace creation lifecycle to resolve.');
        }
        expect(lifecycle.isCreatingWorkspace).toBe(false);

        const result = await lifecycle.createWorkspaceRecord({
            profileId: 'profile_default',
            absolutePath: 'C:/workspace',
            label: 'Workspace Alpha',
            defaultTopLevelTab: 'agent',
            defaultProviderId: 'kilo',
            defaultModelId: 'kilo-auto/frontier',
        });

        expect(result.workspaceRoot.fingerprint).toBe('ws_123');
        expect(registerWorkspaceRootMutation.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            absolutePath: 'C:/workspace',
            label: 'Workspace Alpha',
        });
        expect(setWorkspacePreferenceMutation.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            workspaceFingerprint: 'ws_123',
            defaultTopLevelTab: 'agent',
            defaultProviderId: 'kilo',
            defaultModelId: 'kilo-auto/frontier',
        });
        expect(utilsMock.runtime.listWorkspaceRoots.setData).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            expect.any(Function)
        );
        expect(utilsMock.runtime.getShellBootstrap.setData).toHaveBeenCalledTimes(2);

        const nextRootsUpdater = utilsMock.runtime.listWorkspaceRoots.setData.mock.calls[0]?.[1];
        if (!nextRootsUpdater) {
            throw new Error('Expected listWorkspaceRoots cache updater to be registered.');
        }
        const nextRoots = nextRootsUpdater({
            workspaceRoots: [],
        });
        expect(nextRoots.workspaceRoots[0].fingerprint).toBe('ws_123');

        const nextShellBootstrapAfterRootPatch = utilsMock.runtime.getShellBootstrap.setData.mock.calls[0]?.[1];
        if (!nextShellBootstrapAfterRootPatch) {
            throw new Error('Expected workspaceRoots shell bootstrap cache updater to be registered.');
        }
        const patchedShellBootstrapAfterRoot = nextShellBootstrapAfterRootPatch({
            workspaceRoots: [],
            workspacePreferences: [],
        });
        expect(patchedShellBootstrapAfterRoot.workspaceRoots[0].fingerprint).toBe('ws_123');

        const nextShellBootstrapAfterPreferencePatch = utilsMock.runtime.getShellBootstrap.setData.mock.calls[1]?.[1];
        if (!nextShellBootstrapAfterPreferencePatch) {
            throw new Error('Expected workspacePreferences shell bootstrap cache updater to be registered.');
        }
        const patchedShellBootstrapAfterPreference = nextShellBootstrapAfterPreferencePatch({
            workspaceRoots: [],
            workspacePreferences: [],
        });
        expect(patchedShellBootstrapAfterPreference.workspacePreferences[0].workspaceFingerprint).toBe('ws_123');
    });
});
