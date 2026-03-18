import type { ModeDefinitionRecord, ProviderModelRecord, RunRecord } from '@/app/backend/persistence/types';

import type {
    EntityId,
    EntityIdPrefix,
    RuntimeProviderId,
    RuntimeReasoningEffort,
    RuntimeRunOptions,
} from '@/shared/contracts';
import { providerIds } from '@/shared/contracts';
import { formatRuntimeCapabilityIssue, type RunStartRejectedResultLike } from '@/web/lib/runtimeCapabilityIssue';

export const DEFAULT_REASONING_EFFORT: RuntimeReasoningEffort = 'medium';

const DEFAULT_RUN_OPTION_BASE: Pick<RuntimeRunOptions, 'cache' | 'transport'> = {
    cache: {
        strategy: 'auto',
    },
    transport: {
        family: 'auto',
    },
};

export function buildRuntimeRunOptions(input: {
    supportsReasoning: boolean;
    reasoningEffort: RuntimeReasoningEffort;
}): RuntimeRunOptions {
    const effectiveReasoningEffort = input.supportsReasoning ? input.reasoningEffort : 'none';
    const shouldRequestReasoning = input.supportsReasoning && effectiveReasoningEffort !== 'none';

    return {
        reasoning: {
            effort: effectiveReasoningEffort,
            summary: shouldRequestReasoning ? 'auto' : 'none',
            includeEncrypted: false,
        },
        ...DEFAULT_RUN_OPTION_BASE,
    };
}

export const DEFAULT_RUN_OPTIONS = buildRuntimeRunOptions({
    supportsReasoning: true,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
});

export interface RunTargetSelection {
    providerId: RuntimeProviderId;
    modelId: string;
}

export type ConversationModeOption = Pick<ModeDefinitionRecord, 'id' | 'modeKey' | 'label' | 'executionPolicy'>;

export function modeRequiresNativeTools(mode: ConversationModeOption | undefined): boolean {
    if (!mode || mode.executionPolicy.planningOnly) {
        return false;
    }

    return (mode.executionPolicy.toolCapabilities?.length ?? 0) > 0;
}

export function isEntityId<P extends EntityIdPrefix>(value: string | undefined, prefix: P): value is EntityId<P> {
    return typeof value === 'string' && value.startsWith(`${prefix}_`) && value.length > prefix.length + 1;
}

export function isProviderId(value: string | undefined): value is RuntimeProviderId {
    if (!value) {
        return false;
    }

    return providerIds.some((providerId) => providerId === value);
}

export function modelExists(
    modelsByProvider: Map<RuntimeProviderId, ProviderModelRecord[]>,
    providerId: RuntimeProviderId,
    modelId: string,
    options?: {
        requiresTools?: boolean;
    }
): boolean {
    return (modelsByProvider.get(providerId) ?? []).some(
        (model) => model.id === modelId && (!options?.requiresTools || model.supportsTools)
    );
}

export function resolveLatestRunTarget(
    runs: RunRecord[],
    modelsByProvider: Map<RuntimeProviderId, ProviderModelRecord[]>,
    options?: {
        requiresTools?: boolean;
    }
): RunTargetSelection | undefined {
    for (const run of runs) {
        if (!isProviderId(run.providerId) || typeof run.modelId !== 'string') {
            continue;
        }

        if (!modelExists(modelsByProvider, run.providerId, run.modelId, options)) {
            continue;
        }

        return {
            providerId: run.providerId,
            modelId: run.modelId,
        };
    }

    return undefined;
}

export function formatRunStartRejection(input: {
    rejection: RunStartRejectedResultLike;
    providerById: Map<RuntimeProviderId, { label: string }>;
}): string {
    const formatInput = {
        surface: 'run_rejection' as const,
        providerById: input.providerById,
        ...(input.rejection.action ? { issue: input.rejection.action } : {}),
        ...(input.rejection.message ? { message: input.rejection.message } : {}),
    };

    return formatRuntimeCapabilityIssue(formatInput);
}
