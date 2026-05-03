import { beforeEach, describe, expect, it, vi } from 'vitest';

const protocolHandleMock = vi.hoisted(() => vi.fn());
const protocolRegisterSchemesAsPrivilegedMock = vi.hoisted(() => vi.fn());
const resolveIconPayloadMock = vi.hoisted(() => vi.fn());

vi.mock('@/app/main/runtime/electronApi', () => ({
    protocol: {
        handle: protocolHandleMock,
        registerSchemesAsPrivileged: protocolRegisterSchemesAsPrivilegedMock,
    },
}));

vi.mock('@/app/backend/runtime/services/workspaceIcons/service', () => ({
    workspaceIconService: {
        resolveIconPayload: resolveIconPayloadMock,
    },
}));

import {
    buildWorkspaceIconUrl,
    handleWorkspaceIconProtocol,
    registerWorkspaceIconProtocol,
    WORKSPACE_ICON_PROTOCOL,
} from '@/app/main/window/workspaceIconProtocol';

describe('workspace icon protocol', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('registers the route-served workspace icon protocol as a secure image scheme', () => {
        registerWorkspaceIconProtocol();

        expect(protocolRegisterSchemesAsPrivilegedMock).toHaveBeenCalledWith([
            {
                scheme: WORKSPACE_ICON_PROTOCOL,
                privileges: {
                    standard: true,
                    secure: true,
                    supportFetchAPI: true,
                },
            },
        ]);
    });

    it('routes valid workspace icon requests to the backend icon service', async () => {
        resolveIconPayloadMock.mockResolvedValue({
            bytes: Uint8Array.from([1, 2, 3]),
            mimeType: 'image/png',
        });
        handleWorkspaceIconProtocol();
        const handler = protocolHandleMock.mock.calls[0]?.[1] as
            | ((request: { url: string }) => Promise<Response>)
            | undefined;
        if (!handler) {
            throw new Error('Expected protocol handler to be registered.');
        }

        const response = await handler({
            url: buildWorkspaceIconUrl({
                profileId: 'profile default',
                workspaceFingerprint: 'ws/alpha',
                version: '2026-01-01T00:00:00.000Z',
            }),
        });

        expect(resolveIconPayloadMock).toHaveBeenCalledWith({
            profileId: 'profile default',
            workspaceFingerprint: 'ws/alpha',
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('image/png');
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(Uint8Array.from([1, 2, 3]));
    });

    it('fails closed for malformed workspace icon URLs', async () => {
        handleWorkspaceIconProtocol();
        const handler = protocolHandleMock.mock.calls[0]?.[1] as
            | ((request: { url: string }) => Promise<Response>)
            | undefined;
        if (!handler) {
            throw new Error('Expected protocol handler to be registered.');
        }

        const response = await handler({ url: 'neon-workspace-icon://wrong-host/profile/ws' });

        expect(response.status).toBe(404);
        expect(resolveIconPayloadMock).not.toHaveBeenCalled();
    });
});
