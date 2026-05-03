import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';

import type { ResearchRepoLocator } from '@/shared/contracts';

const SCP_LIKE_REMOTE_PATTERN = /^(?<user>[^@\s:]+)@(?<host>[^:\s]+):(?<path>.+)$/u;

function stripGitSuffix(input: string): string {
    return input.endsWith('.git') ? input.slice(0, -4) : input;
}

function normalizeRepoPathSegments(input: string): { owner?: string; name: string } {
    const segments = input
        .split(/[\\/]/u)
        .map((segment) => segment.trim())
        .filter(Boolean);
    const name = stripGitSuffix(segments.at(-1) ?? 'repo') || 'repo';
    const owner = segments.length > 1 ? segments.at(-2) : undefined;
    return {
        ...(owner ? { owner } : {}),
        name,
    };
}

function safeRepoName(input: string): string {
    const normalized = stripGitSuffix(input)
        .replace(/[^a-z0-9._-]+/giu, '-')
        .replace(/^-+|-+$/gu, '');
    return normalized.length > 0 ? normalized.slice(0, 80) : 'repo';
}

function locatorFromUrl(url: URL): OperationalResult<ResearchRepoLocator> {
    if (url.username || url.password) {
        return errOp('invalid_input', 'Repo URL credentials are not allowed in repo-research targets.');
    }

    if (url.protocol === 'file:') {
        const absolutePath = path.resolve(fileURLToPath(url));
        const repoName = safeRepoName(path.basename(absolutePath));
        return okOp({
            canonicalKey: `file:${process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath}`,
            sanitizedUrl: url.toString(),
            name: repoName,
        });
    }

    if (url.protocol !== 'https:' && url.protocol !== 'ssh:') {
        return errOp('invalid_input', 'Repo-research targets support https, ssh, file, scp-like, and local paths.');
    }

    const segments = normalizeRepoPathSegments(url.pathname);
    const host = url.hostname.toLowerCase();
    const ownerKey = segments.owner ? `/${segments.owner.toLowerCase()}` : '';
    const nameKey = segments.name.toLowerCase();
    const sanitizedUrl = `${url.protocol}//${host}${url.pathname}`;
    return okOp({
        canonicalKey: `${url.protocol}//${host}${ownerKey}/${nameKey}`,
        sanitizedUrl,
        host,
        ...(segments.owner ? { owner: segments.owner } : {}),
        name: safeRepoName(segments.name),
    });
}

export function canonicalizeResearchRepoLocator(repoUrl: string): OperationalResult<ResearchRepoLocator> {
    const trimmed = repoUrl.trim();
    if (!trimmed) {
        return errOp('invalid_input', 'Repo-research target URL must be non-empty.');
    }

    const scpMatch = SCP_LIKE_REMOTE_PATTERN.exec(trimmed);
    if (scpMatch?.groups?.user && scpMatch.groups.host && scpMatch.groups.path) {
        const segments = normalizeRepoPathSegments(scpMatch.groups.path);
        const host = scpMatch.groups.host.toLowerCase();
        const ownerKey = segments.owner ? `/${segments.owner.toLowerCase()}` : '';
        const nameKey = segments.name.toLowerCase();
        return okOp({
            canonicalKey: `ssh://${host}${ownerKey}/${nameKey}`,
            sanitizedUrl: `${scpMatch.groups.user}@${host}:${scpMatch.groups.path}`,
            host,
            ...(segments.owner ? { owner: segments.owner } : {}),
            name: safeRepoName(segments.name),
        });
    }

    try {
        return locatorFromUrl(new URL(trimmed));
    } catch {
        if (!path.isAbsolute(trimmed)) {
            return errOp('invalid_input', 'Repo-research local targets must be absolute paths.');
        }

        const absolutePath = path.resolve(trimmed);
        return okOp({
            canonicalKey: `file:${process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath}`,
            sanitizedUrl: absolutePath,
            name: safeRepoName(path.basename(absolutePath)),
        });
    }
}
