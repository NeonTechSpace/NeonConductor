import {
    providerAuthMethods,
    providerIds,
    runtimeCacheStrategies,
    runtimeRequestedTransportFamilies,
    runtimeReasoningEfforts,
    runtimeReasoningSummaries,
} from '@/app/backend/runtime/contracts/enums';
import type { ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts/enums';
import { isEntityId, type EntityId, type EntityIdPrefix } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput, RuntimeRunOptions } from '@/app/backend/runtime/contracts/types';

interface RuntimeParser<T> {
    parse: (input: unknown) => T;
}

export function createParser<T>(parse: (input: unknown) => T): RuntimeParser<T> {
    return { parse };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readObject(value: unknown, field: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new Error(`Invalid "${field}": expected object.`);
    }

    return value;
}

export function readString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Invalid "${field}": expected non-empty string.`);
    }

    return value.trim();
}

export function readOptionalString(value: unknown, field: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    return readString(value, field);
}

export function readBoolean(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') {
        throw new Error(`Invalid "${field}": expected boolean.`);
    }

    return value;
}

export function readOptionalBoolean(value: unknown, field: string): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }

    return readBoolean(value, field);
}

export function readOptionalNumber(value: unknown, field: string): number | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Invalid "${field}": expected number.`);
    }

    return value;
}

export function readStringArray(value: unknown, field: string): string[] {
    if (!Array.isArray(value)) {
        throw new Error(`Invalid "${field}": expected array of strings.`);
    }

    return value.map((item, index) => readString(item, `${field}[${String(index)}]`));
}

export function readArray(value: unknown, field: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(`Invalid "${field}": expected array.`);
    }

    return value;
}

function isAllowedString<const T extends readonly string[]>(value: string, allowedValues: T): value is T[number] {
    return allowedValues.some((allowedValue) => allowedValue === value);
}

export function readEnumValue<const T extends readonly string[]>(
    value: unknown,
    field: string,
    allowedValues: T
): T[number] {
    const text = readString(value, field);
    if (isAllowedString(text, allowedValues)) {
        return text;
    }

    throw new Error(`Invalid "${field}": expected one of ${allowedValues.join(', ')}.`);
}

export function readEntityId<P extends EntityIdPrefix>(value: unknown, field: string, prefix: P): EntityId<P> {
    const text = readString(value, field);
    if (!isEntityId(text, prefix)) {
        throw new Error(`Invalid "${field}": expected "${prefix}_..." ID.`);
    }

    return text;
}

export function readProfileId(source: Record<string, unknown>): ProfileInput['profileId'] {
    return readString(source.profileId, 'profileId');
}

export function readProviderId(value: unknown, field: string): RuntimeProviderId {
    return readEnumValue(value, field, providerIds);
}

export function readProviderAuthMethod(value: unknown, field: string): ProviderAuthMethod {
    return readEnumValue(value, field, providerAuthMethods);
}

export function parseRuntimeRunOptions(value: unknown): RuntimeRunOptions {
    const source = readObject(value, 'runtimeOptions');
    const reasoningSource = readObject(source.reasoning, 'runtimeOptions.reasoning');
    const cacheSource = readObject(source.cache, 'runtimeOptions.cache');
    const transportSource = readObject(source.transport, 'runtimeOptions.transport');
    if ('openai' in transportSource) {
        throw new Error(
            'Invalid "runtimeOptions.transport": legacy "openai" is no longer supported; use "family" instead.'
        );
    }

    const cacheStrategy = readEnumValue(cacheSource.strategy, 'runtimeOptions.cache.strategy', runtimeCacheStrategies);
    const cacheKey = readOptionalString(cacheSource.key, 'runtimeOptions.cache.key');
    if (cacheStrategy === 'manual' && !cacheKey) {
        throw new Error('Invalid "runtimeOptions.cache.key": required when strategy is "manual".');
    }
    if (cacheStrategy === 'auto' && cacheKey) {
        throw new Error('Invalid "runtimeOptions.cache.key": not allowed when strategy is "auto".');
    }
    const resolvedManualCacheKey = cacheStrategy === 'manual' ? cacheKey : undefined;

    return {
        reasoning: {
            effort: readEnumValue(reasoningSource.effort, 'runtimeOptions.reasoning.effort', runtimeReasoningEfforts),
            summary: readEnumValue(
                reasoningSource.summary,
                'runtimeOptions.reasoning.summary',
                runtimeReasoningSummaries
            ),
            includeEncrypted: readBoolean(
                reasoningSource.includeEncrypted,
                'runtimeOptions.reasoning.includeEncrypted'
            ),
        },
        cache:
            cacheStrategy === 'manual' && resolvedManualCacheKey
                ? {
                      strategy: cacheStrategy,
                      key: resolvedManualCacheKey,
                  }
                : {
                      strategy: cacheStrategy,
                  },
        transport: {
            family: readEnumValue(
                transportSource.family,
                'runtimeOptions.transport.family',
                runtimeRequestedTransportFamilies
            ),
        },
    };
}
