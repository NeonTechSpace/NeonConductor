import type { CloudSessionAuthorityState } from '@/shared/contracts/enums';

export const cloudSessionAuthorityActionKinds = ['import', 'mirror', 'fork', 'continue'] as const;
export type CloudSessionAuthorityActionKind = (typeof cloudSessionAuthorityActionKinds)[number];

export interface CloudSessionTransitionMetadata {
    action: CloudSessionAuthorityActionKind;
    sourceCloudSessionId?: string;
    sourceAuthorityState?: CloudSessionAuthorityState;
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
