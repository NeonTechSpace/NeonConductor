import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getWorkspacePreferenceMock } = vi.hoisted(() => ({
    getWorkspacePreferenceMock: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/workspace/preferences', () => ({
    getWorkspacePreference: (...arguments_: unknown[]) => getWorkspacePreferenceMock(...arguments_),
}));

import { resolveWorkspaceEnvironmentInspectionTarget } from '@/app/backend/runtime/services/environment/workspaceEnvironmentInspectionResolver';

describe('workspaceEnvironmentInspectionResolver', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('fails closed when an explicit workspace fingerprint no longer exists', async () => {
        const result = await resolveWorkspaceEnvironmentInspectionTarget({
            request: {
                profileId: 'profile_default',
                workspaceFingerprint: 'ws_missing',
            },
            workspaceRoots: [],
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected a not_found error.');
        }

        expect(result.error.code).toBe('not_found');
        expect(result.error.message).toContain('ws_missing');
        expect(getWorkspacePreferenceMock).not.toHaveBeenCalled();
    });

    it('reuses registered workspace preference overrides when a raw path matches a known root', async () => {
        getWorkspacePreferenceMock.mockResolvedValue({
            profileId: 'profile_default',
            workspaceFingerprint: 'ws_alpha',
            preferredVcs: 'jj',
            preferredPackageManager: 'pnpm',
            updatedAt: '2026-03-30T10:00:00.000Z',
        });

        const result = await resolveWorkspaceEnvironmentInspectionTarget({
            request: {
                profileId: 'profile_default',
                absolutePath: '  C:\\Repo  ',
            },
            workspaceRoots: [
                {
                    fingerprint: 'ws_alpha',
                    profileId: 'profile_default',
                    absolutePath: 'c:\\repo',
                    label: 'Repo',
                    createdAt: '2026-03-30T09:00:00.000Z',
                    updatedAt: '2026-03-30T09:00:00.000Z',
                },
            ],
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value).toEqual({
            workspaceRootPath: 'c:\\repo',
            workspaceFingerprint: 'ws_alpha',
            overrides: {
                preferredVcs: 'jj',
                preferredPackageManager: 'pnpm',
            },
        });
        expect(getWorkspacePreferenceMock).toHaveBeenCalledWith('profile_default', 'ws_alpha');
    });
});
