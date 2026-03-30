import { describe, expect, it, vi } from 'vitest';

import {
    patchWorkspacePreferenceCache,
    patchWorkspaceRootCaches,
} from '@/web/components/workspaces/workspacesSurfaceCacheProjector';

describe('workspacesSurfaceCacheProjector', () => {
    it('patches workspace roots into the list and shell bootstrap caches', () => {
        const listWorkspaceRootsSetData = vi.fn();
        const shellBootstrapSetData = vi.fn();

        patchWorkspaceRootCaches({
            utils: {
                runtime: {
                    listWorkspaceRoots: {
                        setData: listWorkspaceRootsSetData,
                    },
                    getShellBootstrap: {
                        setData: shellBootstrapSetData,
                    },
                },
            } as never,
            profileId: 'profile_default',
            workspaceRoot: {
                profileId: 'profile_default',
                fingerprint: 'ws_123',
                label: 'Workspace Alpha',
                absolutePath: 'C:/workspace',
                createdAt: '2026-03-26T10:00:00.000Z',
                updatedAt: '2026-03-26T10:00:00.000Z',
            },
        });

        const nextWorkspaceRootsUpdater = listWorkspaceRootsSetData.mock.calls[0]?.[1];
        if (!nextWorkspaceRootsUpdater) {
            throw new Error('Expected workspace roots cache updater to be registered.');
        }
        const nextWorkspaceRoots = nextWorkspaceRootsUpdater({
            workspaceRoots: [
                {
                    profileId: 'profile_default',
                    fingerprint: 'ws_old',
                    label: 'Workspace Old',
                    absolutePath: 'C:/old',
                    createdAt: '2026-03-25T10:00:00.000Z',
                    updatedAt: '2026-03-25T10:00:00.000Z',
                },
            ],
        });
        expect(nextWorkspaceRoots).toEqual({
            workspaceRoots: [
                {
                    profileId: 'profile_default',
                    fingerprint: 'ws_123',
                    label: 'Workspace Alpha',
                    absolutePath: 'C:/workspace',
                    createdAt: '2026-03-26T10:00:00.000Z',
                    updatedAt: '2026-03-26T10:00:00.000Z',
                },
                {
                    profileId: 'profile_default',
                    fingerprint: 'ws_old',
                    label: 'Workspace Old',
                    absolutePath: 'C:/old',
                    createdAt: '2026-03-25T10:00:00.000Z',
                    updatedAt: '2026-03-25T10:00:00.000Z',
                },
            ],
        });

        const nextShellBootstrapUpdater = shellBootstrapSetData.mock.calls[0]?.[1];
        if (!nextShellBootstrapUpdater) {
            throw new Error('Expected shell bootstrap cache updater to be registered.');
        }
        const nextShellBootstrap = nextShellBootstrapUpdater({
            workspaceRoots: [
                {
                    profileId: 'profile_default',
                    fingerprint: 'ws_old',
                    label: 'Workspace Old',
                    absolutePath: 'C:/old',
                    createdAt: '2026-03-25T10:00:00.000Z',
                    updatedAt: '2026-03-25T10:00:00.000Z',
                },
            ],
            workspacePreferences: [],
        });
        expect(nextShellBootstrap.workspaceRoots).toHaveLength(2);
        expect(nextShellBootstrap.workspaceRoots[0].fingerprint).toBe('ws_123');
    });

    it('patches workspace preferences into shell bootstrap without disturbing roots', () => {
        const shellBootstrapSetData = vi.fn();

        patchWorkspacePreferenceCache({
            utils: {
                runtime: {
                    getShellBootstrap: {
                        setData: shellBootstrapSetData,
                    },
                },
            } as never,
            profileId: 'profile_default',
            workspacePreference: {
                profileId: 'profile_default',
                workspaceFingerprint: 'ws_123',
                preferredVcs: 'jj',
                preferredPackageManager: 'pnpm',
                updatedAt: '2026-03-26T10:00:00.000Z',
            },
        });

        const nextShellBootstrapUpdater = shellBootstrapSetData.mock.calls[0]?.[1];
        if (!nextShellBootstrapUpdater) {
            throw new Error('Expected shell bootstrap preference cache updater to be registered.');
        }
        const nextShellBootstrap = nextShellBootstrapUpdater({
            workspaceRoots: [],
            workspacePreferences: [
                {
                    profileId: 'profile_default',
                    workspaceFingerprint: 'ws_old',
                    preferredVcs: 'git',
                    preferredPackageManager: 'npm',
                    updatedAt: '2026-03-25T10:00:00.000Z',
                },
            ],
        });

        expect(nextShellBootstrap.workspacePreferences).toEqual([
            {
                profileId: 'profile_default',
                workspaceFingerprint: 'ws_123',
                preferredVcs: 'jj',
                preferredPackageManager: 'pnpm',
                updatedAt: '2026-03-26T10:00:00.000Z',
            },
            {
                profileId: 'profile_default',
                workspaceFingerprint: 'ws_old',
                preferredVcs: 'git',
                preferredPackageManager: 'npm',
                updatedAt: '2026-03-25T10:00:00.000Z',
            },
        ]);
    });
});
