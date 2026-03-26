import { describe, expect, it, vi } from 'vitest';

import { createSelectModeAction } from '@/web/components/runtime/useWorkspaceModeState';
import { createSelectProfileAction } from '@/web/components/runtime/useWorkspaceProfileState';

describe('workspace switch actions', () => {
    it('fails closed when profile switching rejects', async () => {
        const mutateAsync = vi.fn(() => Promise.reject(new Error('profile switch failed')));
        const selectProfile = createSelectProfileAction({
            resolvedProfileId: 'profile_default',
            mutateAsync,
        });

        await expect(selectProfile('profile_next')).resolves.toBeUndefined();
        expect(mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_next',
        });
    });

    it('does not issue a profile mutation for the already-selected profile', async () => {
        const mutateAsync = vi.fn(() => Promise.resolve(undefined));
        const selectProfile = createSelectProfileAction({
            resolvedProfileId: 'profile_default',
            mutateAsync,
        });

        await expect(selectProfile('profile_default')).resolves.toBeUndefined();
        expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('fails closed when mode switching rejects', async () => {
        const mutateAsync = vi.fn(() => Promise.reject(new Error('mode switch failed')));
        const selectMode = createSelectModeAction({
            resolvedProfileId: 'profile_default',
            topLevelTab: 'chat',
            workspaceFingerprint: 'workspace_1',
            isPending: false,
            mutateAsync,
        });

        await expect(selectMode('plan')).resolves.toBeUndefined();
        expect(mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            topLevelTab: 'chat',
            modeKey: 'plan',
            workspaceFingerprint: 'workspace_1',
        });
    });

    it('does not issue a mode mutation while a mode update is already pending', async () => {
        const mutateAsync = vi.fn(() => Promise.resolve(undefined));
        const selectMode = createSelectModeAction({
            resolvedProfileId: 'profile_default',
            topLevelTab: 'chat',
            isPending: true,
            mutateAsync,
        });

        await expect(selectMode('plan')).resolves.toBeUndefined();
        expect(mutateAsync).not.toHaveBeenCalled();
    });
});

