import { afterEach, describe, expect, it, vi } from 'vitest';

const { lookupMock } = vi.hoisted(() => ({
    lookupMock: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
    lookup: lookupMock,
}));

import { normalizeDevBrowserTargetDraft, validateLocalDevBrowserTarget } from '@/app/backend/runtime/services/devBrowser/localTargetPolicy';

describe('localTargetPolicy', () => {
    afterEach(() => {
        lookupMock.mockReset();
    });

    it('allows localhost targets', async () => {
        const validation = await validateLocalDevBrowserTarget({
            target: {
                scheme: 'http',
                host: 'localhost',
                port: 3000,
                path: '/app',
                sourceKind: 'manual',
            },
            source: 'input',
        });

        expect(validation.status).toBe('allowed');
        expect(validation.normalizedUrl).toBe('http://localhost:3000/app');
        expect(validation.resolvedAddresses).toEqual(['127.0.0.1', '::1']);
    });

    it('allows loopback ipv6 targets without requiring bracketed input', async () => {
        const validation = await validateLocalDevBrowserTarget({
            target: {
                scheme: 'http',
                host: '::1',
                port: 4173,
                path: '/',
                sourceKind: 'manual',
            },
            source: 'input',
        });

        expect(validation.status).toBe('allowed');
        expect(validation.normalizedUrl).toBe('http://[::1]:4173/');
        expect(validation.resolvedAddresses).toEqual(['::1']);
    });

    it('blocks public ip targets', async () => {
        const validation = await validateLocalDevBrowserTarget({
            target: {
                scheme: 'https',
                host: '8.8.8.8',
                path: '/',
                sourceKind: 'manual',
            },
            source: 'navigation',
        });

        expect(validation.status).toBe('blocked');
        expect(validation.blockedReasonCode).toBe('host_not_local');
    });

    it('blocks mixed local and public hostname resolution', async () => {
        lookupMock.mockResolvedValue([
            { address: '192.168.1.30', family: 4 },
            { address: '34.117.59.81', family: 4 },
        ]);

        const validation = await validateLocalDevBrowserTarget({
            target: {
                scheme: 'http',
                host: 'devbox.local',
                path: '/preview',
                sourceKind: 'manual',
            },
            source: 'redirect',
        });

        expect(validation.status).toBe('blocked');
        expect(validation.blockedReasonCode).toBe('mixed_resolution');
        expect(validation.resolvedAddresses).toEqual(['192.168.1.30', '34.117.59.81']);
    });

    it('normalizes empty paths to the root path', () => {
        expect(
            normalizeDevBrowserTargetDraft({
                scheme: 'http',
                host: 'localhost',
                path: '   ',
                sourceKind: 'manual',
            })
        ).toEqual({
            scheme: 'http',
            host: 'localhost',
            path: '/',
            sourceKind: 'manual',
        });
    });
});
