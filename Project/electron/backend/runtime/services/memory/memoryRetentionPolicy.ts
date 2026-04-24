import type {
    MemoryCreatedByKind,
    MemoryRetentionClass,
    MemoryRevisionReason,
    MemoryScopeKind,
} from '@/app/backend/runtime/contracts';

const EPHEMERAL_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export interface MemoryRetentionInput {
    scopeKind: MemoryScopeKind;
    createdByKind: MemoryCreatedByKind;
    memoryRetentionClass?: MemoryRetentionClass;
    retentionExpiresAt?: string;
    retentionPinnedAt?: string;
    now?: string;
}

export interface ResolvedMemoryRetention {
    memoryRetentionClass: MemoryRetentionClass;
    retentionExpiresAt?: string;
    retentionPinnedAt?: string;
}

function addMilliseconds(isoTimestamp: string, milliseconds: number): string {
    return new Date(Date.parse(isoTimestamp) + milliseconds).toISOString();
}

function isValidIsoTimestamp(value: string): boolean {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export function validateMemoryRetentionInput(input: {
    memoryRetentionClass?: MemoryRetentionClass;
    retentionExpiresAt?: string;
    retentionPinnedAt?: string;
}): string | undefined {
    if (input.retentionExpiresAt && !isValidIsoTimestamp(input.retentionExpiresAt)) {
        return '"retentionExpiresAt" must be an ISO timestamp.';
    }
    if (input.retentionPinnedAt && !isValidIsoTimestamp(input.retentionPinnedAt)) {
        return '"retentionPinnedAt" must be an ISO timestamp.';
    }
    if (input.memoryRetentionClass === 'pinned' && input.retentionExpiresAt) {
        return 'Pinned memory cannot include "retentionExpiresAt".';
    }
    if (input.memoryRetentionClass && input.memoryRetentionClass !== 'pinned' && input.retentionPinnedAt) {
        return 'Only pinned memory can include "retentionPinnedAt".';
    }

    return undefined;
}

export function defaultMemoryRetentionClass(input: {
    scopeKind: MemoryScopeKind;
    createdByKind: MemoryCreatedByKind;
}): MemoryRetentionClass {
    if (input.scopeKind === 'run' && input.createdByKind === 'system') {
        return 'ephemeral';
    }
    if (input.scopeKind === 'run' || input.scopeKind === 'thread') {
        return 'task';
    }
    if (input.scopeKind === 'workspace') {
        return 'workspace';
    }

    return 'profile';
}

export function resolveMemoryRetention(input: MemoryRetentionInput): ResolvedMemoryRetention {
    const validationError = validateMemoryRetentionInput(input);
    if (validationError) {
        throw new Error(validationError);
    }

    const now = input.now ?? new Date().toISOString();
    const memoryRetentionClass =
        input.memoryRetentionClass ?? defaultMemoryRetentionClass({
            scopeKind: input.scopeKind,
            createdByKind: input.createdByKind,
        });
    if (memoryRetentionClass === 'pinned' && input.retentionExpiresAt) {
        throw new Error('Pinned memory cannot include "retentionExpiresAt".');
    }
    if (memoryRetentionClass !== 'pinned' && input.retentionPinnedAt) {
        throw new Error('Only pinned memory can include "retentionPinnedAt".');
    }

    if (memoryRetentionClass === 'pinned') {
        return {
            memoryRetentionClass,
            retentionPinnedAt: input.retentionPinnedAt ?? now,
        };
    }

    return {
        memoryRetentionClass,
        ...(memoryRetentionClass === 'ephemeral'
            ? { retentionExpiresAt: input.retentionExpiresAt ?? addMilliseconds(now, EPHEMERAL_RETENTION_MS) }
            : input.retentionExpiresAt
              ? { retentionExpiresAt: input.retentionExpiresAt }
              : {}),
    };
}

export function resolveReplacementMemoryRetention(input: {
    previous: ResolvedMemoryRetention;
    scopeKind: MemoryScopeKind;
    createdByKind: MemoryCreatedByKind;
    memoryRetentionClass?: MemoryRetentionClass;
    retentionExpiresAt?: string;
    retentionPinnedAt?: string;
    now?: string;
}): ResolvedMemoryRetention {
    if (
        input.memoryRetentionClass === undefined &&
        input.retentionExpiresAt === undefined &&
        input.retentionPinnedAt === undefined
    ) {
        return input.previous;
    }

    return resolveMemoryRetention(input);
}

export function defaultRetentionSupersedenceRationale(revisionReason: MemoryRevisionReason): string {
    return `Superseded by ${revisionReason.replace(/_/g, ' ')} revision.`;
}
