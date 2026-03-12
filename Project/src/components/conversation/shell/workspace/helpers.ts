import type { ProviderModelRecord, RunRecord } from '@/app/backend/persistence/types';

import { providerIds } from '@/shared/contracts';
import type {
    EntityId,
    EntityIdPrefix,
    RuntimeProviderId,
    RuntimeReasoningEffort,
    RuntimeRunOptions,
} from '@/shared/contracts';

export const DEFAULT_REASONING_EFFORT: RuntimeReasoningEffort = 'medium';

const DEFAULT_RUN_OPTION_BASE: Pick<RuntimeRunOptions, 'cache' | 'transport'> = {
    cache: {
        strategy: 'auto',
    },
    transport: {
        openai: 'auto',
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

export function modeRequiresNativeTools(input: {
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    modeKey: string;
}): boolean {
    if (input.topLevelTab === 'chat') {
        return false;
    }

    if (input.topLevelTab === 'agent') {
        return input.modeKey !== 'ask' && input.modeKey !== 'plan';
    }

    return input.modeKey !== 'plan';
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

export function isProviderRunnable(authState: string, authMethod: string): boolean {
    if (authMethod === 'none') {
        return false;
    }

    if (authMethod === 'api_key') {
        return authState === 'configured' || authState === 'authenticated';
    }

    return authState === 'authenticated';
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

export function toActionableRunError(message: string, providerLabel: string): string {
    const normalized = message.toLowerCase();
    if (
        normalized.includes('not authenticated') ||
        normalized.includes('auth state') ||
        normalized.includes('missing from secret store')
    ) {
        if (providerLabel.toLowerCase() === 'kilo') {
            return 'Kilo is not authenticated. Open Settings > Kilo and sign in before running.';
        }

        return `${providerLabel} is not authenticated. Open Settings > Providers and connect it before running.`;
    }

    if (normalized.includes('planning-only')) {
        return message;
    }

    return `Run failed: ${message}`;
}
