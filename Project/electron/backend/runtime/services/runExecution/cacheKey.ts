import { buildAutoCacheKey } from '@/app/backend/providers/behaviors/cacheKey';
import type { ProviderModelCapabilities } from '@/app/backend/providers/types';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import type { RunCacheResolution } from '@/app/backend/runtime/services/runExecution/types';

import type { RuntimeRunOptions } from '@/shared/contracts';
import type { RuntimeProviderId } from '@/shared/contracts';

interface ResolveRunCacheInput {
    profileId: string;
    sessionId: string;
    cacheScopeKey?: string;
    providerId: RuntimeProviderId;
    modelId: string;
    modelCapabilities: ProviderModelCapabilities;
    runtimeOptions: RuntimeRunOptions;
}

function resolveCacheKey(input: ResolveRunCacheInput): string {
    if (input.runtimeOptions.cache.strategy === 'manual') {
        return input.runtimeOptions.cache.key ?? '';
    }

    return buildAutoCacheKey({
        profileId: input.profileId,
        scopeKey: input.cacheScopeKey ?? input.sessionId,
        providerId: input.providerId,
        modelId: input.modelId,
    });
}

export function resolveRunCache(input: ResolveRunCacheInput): RunExecutionResult<RunCacheResolution> {
    const key = resolveCacheKey(input);
    if (key.trim().length === 0) {
        return errRunExecution('cache_resolution_failed', 'Cache key resolution failed: cache key is empty.');
    }

    if (!input.modelCapabilities.features.supportsPromptCache) {
        return okRunExecution({
            strategy: input.runtimeOptions.cache.strategy,
            key,
            applied: false,
            reason: 'model_unsupported',
        });
    }

    if (input.modelCapabilities.runtime.toolProtocol === 'kilo_gateway') {
        return okRunExecution({
            strategy: input.runtimeOptions.cache.strategy,
            key,
            applied: true,
        });
    }

    return okRunExecution({
        strategy: input.runtimeOptions.cache.strategy,
        key,
        applied: false,
        reason: 'provider_managed',
    });
}

