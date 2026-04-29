import type { CloudSessionAuthorityState, CloudSessionRecordKind } from '@/shared/contracts/enums';

export const cloudSessionAuthorityActionKinds = ['import', 'mirror', 'fork', 'continue'] as const;
export type CloudSessionAuthorityActionKind = (typeof cloudSessionAuthorityActionKinds)[number];

export interface CloudSessionTransitionMetadata {
    action: CloudSessionAuthorityActionKind;
    sourceCloudSessionId?: string;
    sourceAuthorityState?: CloudSessionAuthorityState;
}

export type CloudSessionSyncBackExpectationState = 'not_applicable' | 'not_available';
export type CloudSessionSyncBackExpectationReason =
    | 'remote_snapshot_only'
    | 'local_fork'
    | 'kilo_owned_remote_workspace';

export interface CloudSessionSyncBackExpectation {
    state: CloudSessionSyncBackExpectationState;
    reason: CloudSessionSyncBackExpectationReason;
}

export function formatCloudSessionAuthorityState(value: CloudSessionAuthorityState): string {
    switch (value) {
        case 'remote_only':
            return 'Remote only';
        case 'mirrored':
            return 'Mirrored';
        case 'imported':
            return 'Imported';
        case 'forked':
            return 'Local fork';
        case 'continued':
            return 'Continued';
    }
}

export function canContinueCloudSessionAuthorityState(value: CloudSessionAuthorityState): boolean {
    return value === 'remote_only' || value === 'mirrored' || value === 'imported' || value === 'continued';
}

export function canRunKiloCloudHarnessAuthorityState(value: CloudSessionAuthorityState): boolean {
    return value === 'mirrored' || value === 'imported' || value === 'continued';
}

export function resolveCloudSessionSyncBackExpectation(input: {
    recordKind: CloudSessionRecordKind;
    authorityState: CloudSessionAuthorityState;
}): CloudSessionSyncBackExpectation {
    if (input.recordKind === 'remote_snapshot') {
        return {
            state: 'not_applicable',
            reason: 'remote_snapshot_only',
        };
    }

    if (input.authorityState === 'forked') {
        return {
            state: 'not_applicable',
            reason: 'local_fork',
        };
    }

    return {
        state: 'not_available',
        reason: 'kilo_owned_remote_workspace',
    };
}

export function formatCloudSessionSyncBackExpectationReason(reason: CloudSessionSyncBackExpectationReason): string {
    switch (reason) {
        case 'remote_snapshot_only':
            return 'Remote snapshot only';
        case 'local_fork':
            return 'Local fork';
        case 'kilo_owned_remote_workspace':
            return 'Kilo-owned remote workspace';
    }
}

export function formatCloudSessionSyncBackExpectation(value: CloudSessionSyncBackExpectation): string {
    const label = formatCloudSessionSyncBackExpectationReason(value.reason);
    if (value.state === 'not_available') {
        return `${label}: sync-back not available`;
    }
    return `${label}: sync-back not applicable`;
}

export function buildCloudSessionTransitionMetadata(input: CloudSessionTransitionMetadata): {
    cloudSessionTransition: CloudSessionTransitionMetadata;
} {
    return {
        cloudSessionTransition: {
            action: input.action,
            ...(input.sourceCloudSessionId ? { sourceCloudSessionId: input.sourceCloudSessionId } : {}),
            ...(input.sourceAuthorityState ? { sourceAuthorityState: input.sourceAuthorityState } : {}),
        },
    };
}

export function sanitizeCloudSessionProvenanceMetadata(
    metadata: Record<string, unknown> | undefined
): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata ?? {})) {
        if (
            key === 'cloudSessionTransition' ||
            key === 'forkedFromCloudSessionId' ||
            key === 'continuedFromCloudSessionId'
        ) {
            continue;
        }
        sanitized[key] = value;
    }
    return sanitized;
}
