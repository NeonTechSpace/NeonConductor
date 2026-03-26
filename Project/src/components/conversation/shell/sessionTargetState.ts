import type { RuntimeProviderId } from '@/shared/contracts';
import type { EntityId } from '@/shared/contracts';

export interface SessionTargetOverride {
    providerId?: RuntimeProviderId;
    modelId?: string;
}

export type SessionTargetOverrides = Record<string, SessionTargetOverride>;

export function applySessionProviderOverride(
    current: SessionTargetOverrides,
    sessionId: EntityId<'sess'>,
    providerId: RuntimeProviderId,
    firstModelId?: string
): SessionTargetOverrides {
    return {
        ...current,
        [sessionId]: {
            providerId,
            ...(firstModelId ? { modelId: firstModelId } : {}),
        },
    };
}

export function applySessionModelOverride(
    current: SessionTargetOverrides,
    sessionId: EntityId<'sess'>,
    providerId: RuntimeProviderId,
    modelId: string
): SessionTargetOverrides {
    return {
        ...current,
        [sessionId]: {
            providerId,
            modelId,
        },
    };
}
