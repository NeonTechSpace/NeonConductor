import { describe, expect, it } from 'vitest';

import {
    normalizeDevBrowserTargetDraft,
    validateLocalDevBrowserTarget,
} from '@/app/backend/runtime/services/devBrowser/localTargetPolicy';

describe('localTargetPolicy', () => {
    it('allows localhost targets', () => {
        const validation = validateLocalDevBrowserTarget({
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
        expect(validation.binding).toEqual({
            normalizedUrl: 'http://localhost:3000/app',
            host: 'localhost',
            port: 3000,
            resolvedAddresses: ['127.0.0.1', '::1'],
        });
    });

    it('allows loopback ipv6 targets without requiring bracketed input', () => {
        const validation = validateLocalDevBrowserTarget({
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
        expect(validation.binding).toEqual({
            normalizedUrl: 'http://[::1]:4173/',
            host: '::1',
            port: 4173,
            resolvedAddresses: ['::1'],
        });
    });

    it('blocks public ip targets', () => {
        const validation = validateLocalDevBrowserTarget({
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

    it('blocks DNS hostnames that cannot be pinned safely at navigation time', () => {
        const validation = validateLocalDevBrowserTarget({
            target: {
                scheme: 'http',
                host: 'devbox.local',
                path: '/preview',
                sourceKind: 'manual',
            },
            source: 'redirect',
        });

        expect(validation.status).toBe('blocked');
        expect(validation.blockedReasonCode).toBe('dns_hostname_not_pinned');
        expect(validation.resolvedAddresses).toEqual([]);
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
