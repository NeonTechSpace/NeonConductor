import { describe, expect, it, vi } from 'vitest';

import { submitSidebarWorkspaceLifecycle } from '@/web/components/conversation/sidebar/useSidebarWorkspaceCreateController';
import { browseSidebarWorkspaceDirectory } from '@/web/components/conversation/sidebar/useWorkspaceLifecycleDraftState';

describe('browseSidebarWorkspaceDirectory', () => {
    it('returns the selected path when the desktop picker succeeds', async () => {
        const onPickingWorkspaceDirectoryChange = vi.fn();
        const onWorkspaceCreateErrorChange = vi.fn();

        const result = await browseSidebarWorkspaceDirectory({
            desktopBridge: {
                pickDirectory: vi.fn(() =>
                    Promise.resolve({
                        canceled: false,
                        absolutePath: 'C:/workspace',
                    })
                ),
            } as typeof window.neonDesktop,
            isPickingWorkspaceDirectory: false,
            onPickingWorkspaceDirectoryChange,
            onWorkspaceCreateErrorChange,
        });

        expect(result).toBe('C:/workspace');
        expect(onWorkspaceCreateErrorChange).toHaveBeenNthCalledWith(1, undefined);
        expect(onPickingWorkspaceDirectoryChange).toHaveBeenNthCalledWith(1, true);
        expect(onPickingWorkspaceDirectoryChange).toHaveBeenNthCalledWith(2, false);
    });

    it('fails closed and reports browse errors through the dialog status channel', async () => {
        const onPickingWorkspaceDirectoryChange = vi.fn();
        const onWorkspaceCreateErrorChange = vi.fn();

        const result = await browseSidebarWorkspaceDirectory({
            desktopBridge: {
                pickDirectory: vi.fn(() => Promise.reject(new Error('Picker failed.'))),
            } as typeof window.neonDesktop,
            isPickingWorkspaceDirectory: false,
            onPickingWorkspaceDirectoryChange,
            onWorkspaceCreateErrorChange,
        });

        expect(result).toBeUndefined();
        expect(onWorkspaceCreateErrorChange).toHaveBeenNthCalledWith(1, undefined);
        expect(onWorkspaceCreateErrorChange).toHaveBeenNthCalledWith(2, 'Picker failed.');
        expect(onPickingWorkspaceDirectoryChange).toHaveBeenNthCalledWith(1, true);
        expect(onPickingWorkspaceDirectoryChange).toHaveBeenNthCalledWith(2, false);
    });
});

describe('submitSidebarWorkspaceLifecycle', () => {
    it('returns a created-with-starter-thread result when the starter thread succeeds', async () => {
        const registerWorkspaceRoot = vi.fn(() => Promise.resolve({
            workspaceRoot: {
                profileId: 'profile_default',
                fingerprint: 'ws_alpha',
                label: 'Workspace Alpha',
                absolutePath: 'C:/workspace',
                createdAt: '2026-03-26T10:00:00.000Z',
                updatedAt: '2026-03-26T10:00:00.000Z',
            },
        }));
        const setWorkspacePreference = vi.fn(() => Promise.resolve(undefined));
        const onCreateThread = vi.fn(() => Promise.resolve({
            kind: 'created_with_starter_session' as const,
            workspaceFingerprint: 'ws_alpha',
        }));

        const result = await submitSidebarWorkspaceLifecycle({
            profileId: 'profile_default',
            absolutePath: 'C:/workspace',
            label: 'Workspace Alpha',
            defaultTopLevelTab: 'agent',
            defaultProviderId: 'kilo',
            defaultModelId: 'kilo-auto/frontier',
            registerWorkspaceRoot,
            setWorkspacePreference,
            onCreateThread,
        });

        expect(result).toEqual({
            kind: 'created_with_starter_thread',
            workspaceRoot: {
                profileId: 'profile_default',
                fingerprint: 'ws_alpha',
                label: 'Workspace Alpha',
                absolutePath: 'C:/workspace',
                createdAt: '2026-03-26T10:00:00.000Z',
                updatedAt: '2026-03-26T10:00:00.000Z',
            },
            threadEntryResult: {
                kind: 'created_with_starter_session',
                workspaceFingerprint: 'ws_alpha',
            },
        });
        expect(setWorkspacePreference).toHaveBeenCalledWith({
            profileId: 'profile_default',
            workspaceFingerprint: 'ws_alpha',
            defaultTopLevelTab: 'agent',
            defaultProviderId: 'kilo',
            defaultModelId: 'kilo-auto/frontier',
        });
    });

    it('returns a created-without-starter-thread result when starter-thread creation fails', async () => {
        const result = await submitSidebarWorkspaceLifecycle({
            profileId: 'profile_default',
            absolutePath: 'C:/workspace',
            label: 'Workspace Alpha',
            defaultTopLevelTab: 'agent',
            defaultProviderId: 'kilo',
            defaultModelId: 'kilo-auto/frontier',
            registerWorkspaceRoot: () => Promise.resolve({
                workspaceRoot: {
                    profileId: 'profile_default',
                    fingerprint: 'ws_alpha',
                    label: 'Workspace Alpha',
                    absolutePath: 'C:/workspace',
                    createdAt: '2026-03-26T10:00:00.000Z',
                    updatedAt: '2026-03-26T10:00:00.000Z',
                },
            }),
            setWorkspacePreference: () => Promise.resolve(undefined),
            onCreateThread: () => Promise.resolve({
                kind: 'failed',
                workspaceFingerprint: 'ws_alpha',
                message: 'The starter thread failed.',
            }),
        });

        expect(result).toEqual({
            kind: 'created_without_starter_thread',
            workspaceRoot: {
                profileId: 'profile_default',
                fingerprint: 'ws_alpha',
                label: 'Workspace Alpha',
                absolutePath: 'C:/workspace',
                createdAt: '2026-03-26T10:00:00.000Z',
                updatedAt: '2026-03-26T10:00:00.000Z',
            },
            draftState: {
                workspaceFingerprint: 'ws_alpha',
                title: '',
                topLevelTab: 'agent',
                providerId: 'kilo',
                modelId: 'kilo-auto/frontier',
            },
            message: 'The starter thread failed.',
        });
    });

    it('returns a failed result when workspace registration throws', async () => {
        const result = await submitSidebarWorkspaceLifecycle({
            profileId: 'profile_default',
            absolutePath: 'C:/workspace',
            label: 'Workspace Alpha',
            defaultTopLevelTab: 'agent',
            defaultProviderId: 'kilo',
            defaultModelId: 'kilo-auto/frontier',
            registerWorkspaceRoot: () => Promise.reject(new Error('Workspace could not be registered.')),
            setWorkspacePreference: () => Promise.resolve(undefined),
            onCreateThread: () => Promise.resolve({
                kind: 'created_with_starter_session',
                workspaceFingerprint: 'ws_alpha',
            }),
        });

        expect(result).toEqual({
            kind: 'failed',
            message: 'Workspace could not be registered.',
        });
    });
});

