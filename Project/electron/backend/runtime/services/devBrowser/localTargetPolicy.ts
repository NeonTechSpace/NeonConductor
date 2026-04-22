import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import type {
    DevBrowserBlockedReasonCode,
    DevBrowserTargetDraft,
    DevBrowserValidation,
    DevBrowserValidationSource,
} from '@/app/backend/runtime/contracts';

function isLoopbackIpv4(address: string): boolean {
    return address.startsWith('127.');
}

function isPrivateIpv4(address: string): boolean {
    const parts = address.split('.').map((segment) => Number.parseInt(segment, 10));
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
        return false;
    }

    const first = parts[0] ?? -1;
    const second = parts[1] ?? -1;
    return (
        first === 10 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 169 && second === 254)
    );
}

function normalizeIpv6(address: string): string {
    return address.toLowerCase();
}

function isLocalIpv6(address: string): boolean {
    const normalized = normalizeIpv6(address);
    return (
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb')
    );
}

function isLocalAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) {
        return isLoopbackIpv4(address) || isPrivateIpv4(address);
    }
    if (family === 6) {
        return isLocalIpv6(address);
    }
    return false;
}

function normalizePath(path: string): string {
    const trimmed = path.trim();
    if (trimmed.length === 0) {
        return '/';
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function unwrapIpv6Host(host: string): string {
    return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function normalizeHostForUrl(host: string): string {
    const trimmedHost = host.trim();
    if (trimmedHost.length === 0) {
        return trimmedHost;
    }
    const unwrappedHost = unwrapIpv6Host(trimmedHost);
    return isIP(unwrappedHost) === 6 ? `[${unwrappedHost}]` : trimmedHost;
}

function blockedValidation(input: {
    code: DevBrowserBlockedReasonCode;
    message: string;
    source: DevBrowserValidationSource;
    attemptedUrl?: string;
    normalizedUrl?: string;
    resolvedAddresses?: string[];
}): DevBrowserValidation {
    return {
        status: 'blocked',
        ...(input.normalizedUrl ? { normalizedUrl: input.normalizedUrl } : {}),
        resolvedAddresses: input.resolvedAddresses ?? [],
        blockedReasonCode: input.code,
        blockedReasonMessage: input.message,
        source: input.source,
        ...(input.attemptedUrl ? { attemptedUrl: input.attemptedUrl } : {}),
    };
}

function allowedValidation(normalizedUrl: string, resolvedAddresses: string[]): DevBrowserValidation {
    return {
        status: 'allowed',
        normalizedUrl,
        resolvedAddresses,
    };
}

export async function validateLocalDevBrowserTarget(input: {
    target: DevBrowserTargetDraft;
    source: DevBrowserValidationSource;
}): Promise<DevBrowserValidation> {
    const attemptedPath = normalizePath(input.target.path);
    let normalizedUrl: string;
    let url: URL;
    try {
        const normalizedHost = normalizeHostForUrl(input.target.host);
        url = new URL(
            `${input.target.scheme}://${normalizedHost}${input.target.port ? `:${String(input.target.port)}` : ''}${attemptedPath}`
        );
        normalizedUrl = url.toString();
    } catch {
        return blockedValidation({
            code: 'empty_host',
            message: 'The dev browser target is not a valid local URL.',
            source: input.source,
        });
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return blockedValidation({
            code: 'unsupported_scheme',
            message: 'Only http and https targets are allowed in the dev browser.',
            source: input.source,
            normalizedUrl,
            attemptedUrl: normalizedUrl,
        });
    }
    if (url.username.length > 0 || url.password.length > 0) {
        return blockedValidation({
            code: 'credentials_not_allowed',
            message: 'Credentials in the browser target URL are not allowed.',
            source: input.source,
            normalizedUrl,
            attemptedUrl: normalizedUrl,
        });
    }
    if (url.hostname.trim().length === 0) {
        return blockedValidation({
            code: 'empty_host',
            message: 'The dev browser target must include a host.',
            source: input.source,
            normalizedUrl,
            attemptedUrl: normalizedUrl,
        });
    }

    const resolvedAddresses = new Set<string>();
    const resolvedHostname = unwrapIpv6Host(url.hostname);
    if (resolvedHostname === 'localhost') {
        resolvedAddresses.add('127.0.0.1');
        resolvedAddresses.add('::1');
    } else if (isIP(resolvedHostname) !== 0) {
        resolvedAddresses.add(resolvedHostname);
    } else {
        try {
            const records = await lookup(resolvedHostname, { all: true, verbatim: true });
            for (const record of records) {
                resolvedAddresses.add(record.address);
            }
        } catch {
            return blockedValidation({
                code: 'resolution_failed',
                message: 'The dev browser target host could not be resolved.',
                source: input.source,
                normalizedUrl,
                attemptedUrl: normalizedUrl,
            });
        }
    }

    const addresses = Array.from(resolvedAddresses).sort();
    if (addresses.length === 0) {
        return blockedValidation({
            code: 'resolution_failed',
            message: 'The dev browser target host did not resolve to any addresses.',
            source: input.source,
            normalizedUrl,
            attemptedUrl: normalizedUrl,
        });
    }

    const localAddresses = addresses.filter(isLocalAddress);
    if (localAddresses.length === 0) {
        return blockedValidation({
            code: 'host_not_local',
            message: 'The dev browser only allows localhost or private local-network targets.',
            source: input.source,
            normalizedUrl,
            attemptedUrl: normalizedUrl,
            resolvedAddresses: addresses,
        });
    }
    if (localAddresses.length !== addresses.length) {
        return blockedValidation({
            code: 'mixed_resolution',
            message: 'The dev browser target resolves to a mix of local and non-local addresses.',
            source: input.source,
            normalizedUrl,
            attemptedUrl: normalizedUrl,
            resolvedAddresses: addresses,
        });
    }

    return allowedValidation(normalizedUrl, addresses);
}

export function normalizeDevBrowserTargetDraft(target: DevBrowserTargetDraft): DevBrowserTargetDraft {
    return {
        scheme: target.scheme,
        host: target.host.trim(),
        ...(target.port !== undefined ? { port: target.port } : {}),
        path: normalizePath(target.path),
        sourceKind: target.sourceKind,
    };
}
