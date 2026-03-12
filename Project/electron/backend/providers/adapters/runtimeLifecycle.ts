import {
    errProviderAdapter,
    type ProviderAdapterErrorCode,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import type { HttpFallbackFailureStage } from '@/app/backend/providers/adapters/httpFallback';
import type {
    ProviderRuntimeCacheApplication,
    ProviderRuntimeHandlers,
    ProviderRuntimeInput,
    ProviderRuntimeTransportSelection,
} from '@/app/backend/providers/types';
import { appLog } from '@/app/main/logging';

export type RuntimeAdapterFailureStage = 'request' | 'request fallback' | 'stream parse' | 'payload parse';

interface EmitRuntimeLifecycleSelectionInput {
    handlers: ProviderRuntimeHandlers;
    transportSelection: ProviderRuntimeTransportSelection;
    cacheResult: ProviderRuntimeCacheApplication;
}

interface FailRuntimeAdapterInput {
    input: Pick<ProviderRuntimeInput, 'runId' | 'profileId' | 'sessionId' | 'modelId'>;
    logTag: string;
    runtimeLabel: string;
    context: string;
    code: string;
    error: string;
    logFields?: Record<string, unknown>;
}

export async function emitRuntimeLifecycleSelection(input: EmitRuntimeLifecycleSelectionInput): Promise<void> {
    if (input.handlers.onTransportSelected) {
        await input.handlers.onTransportSelected(input.transportSelection);
    }

    if (input.handlers.onCacheResolved) {
        await input.handlers.onCacheResolved(input.cacheResult);
    }
}

export function mapHttpFallbackFailureStage(stage: HttpFallbackFailureStage): RuntimeAdapterFailureStage {
    if (stage === 'request') {
        return 'request';
    }

    if (stage === 'request_fallback') {
        return 'request fallback';
    }

    if (stage === 'stream_parse') {
        return 'stream parse';
    }

    return 'payload parse';
}

export function failRuntimeAdapter(input: FailRuntimeAdapterInput): ProviderAdapterResult<never> {
    appLog.warn({
        tag: input.logTag,
        message: `${input.runtimeLabel} ${input.context} failed.`,
        runId: input.input.runId,
        profileId: input.input.profileId,
        sessionId: input.input.sessionId,
        modelId: input.input.modelId,
        code: input.code,
        error: input.error,
        ...input.logFields,
    });

    return errProviderAdapter(normalizeRuntimeAdapterErrorCode(input.code), input.error);
}

function normalizeRuntimeAdapterErrorCode(code: string): ProviderAdapterErrorCode {
    if (
        code === 'auth_missing' ||
        code === 'invalid_payload' ||
        code === 'provider_request_failed' ||
        code === 'provider_request_unavailable'
    ) {
        return code;
    }

    return 'provider_request_failed';
}
