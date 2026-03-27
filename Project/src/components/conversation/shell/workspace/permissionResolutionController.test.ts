import { describe, expect, it, vi } from 'vitest';

import { resolveConversationPermission } from '@/web/components/conversation/shell/workspace/permissionResolutionController';

describe('resolveConversationPermission', () => {
    it('resolves the permission request and returns a typed cache effect', async () => {
        const onResolvePermission = vi.fn();
        const mutateAsync = vi.fn(() => Promise.resolve(undefined));

        const result = await resolveConversationPermission({
            profileId: 'profile_test',
            onResolvePermission,
            mutateAsync,
            payload: {
                requestId: 'perm_test',
                resolution: 'allow_once',
                selectedApprovalResource: '/repo/src',
            },
        });

        expect(onResolvePermission).toHaveBeenCalledTimes(1);
        expect(mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_test',
            requestId: 'perm_test',
            resolution: 'allow_once',
            selectedApprovalResource: '/repo/src',
        });
        expect(result).toEqual({
            ok: true,
            action: 'permission_resolution',
            cacheEffect: {
                kind: 'permission_request_resolved',
                requestId: 'perm_test',
            },
        });
    });

    it('fails closed without surfacing execution-panel feedback', async () => {
        const result = await resolveConversationPermission({
            profileId: 'profile_test',
            onResolvePermission: vi.fn(),
            mutateAsync: vi.fn(() => Promise.reject(new Error('Denied'))),
            payload: {
                requestId: 'perm_test',
                resolution: 'deny',
            },
        });

        expect(result).toEqual({
            ok: false,
            action: 'permission_resolution',
            message: 'Denied',
        });
    });
});
