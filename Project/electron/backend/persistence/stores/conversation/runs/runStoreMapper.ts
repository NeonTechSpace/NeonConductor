import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import type { RunRecord } from '@/app/backend/persistence/types';
import { assertSupportedProviderId } from '@/app/backend/providers/registry';
import type { ProviderRuntimeTransportFamily } from '@/app/backend/providers/types';
import {
    providerAuthMethods,
    runStatuses,
    runtimeCacheStrategies,
    runtimeRequestedTransportFamilies,
    runtimeReasoningEfforts,
    runtimeReasoningSummaries,
} from '@/app/backend/runtime/contracts';
import type { ProviderAuthMethod, RunStatus, RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { DataCorruptionError } from '@/app/backend/runtime/services/common/fatalErrors';

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
    return allowed.some((candidate) => candidate === value);
}

function parseRunStatus(value: string): RunStatus {
    if (isOneOf(value, runStatuses)) {
        return value;
    }

    throw new DataCorruptionError(`Invalid run status in persistence row: "${value}".`);
}

function parseAuthMethod(value: string | null): ProviderAuthMethod | 'none' | undefined {
    if (!value) {
        return undefined;
    }

    if (value === 'none') {
        return 'none';
    }

    if (isOneOf(value, providerAuthMethods)) {
        return value;
    }

    throw new DataCorruptionError(`Invalid run auth method in persistence row: "${value}".`);
}

function parseProviderId(value: string | null): RuntimeProviderId | undefined {
    if (!value) {
        return undefined;
    }

    return assertSupportedProviderId(value);
}

function parseReasoningEffort(value: string | null) {
    if (!value) {
        return undefined;
    }

    if (isOneOf(value, runtimeReasoningEfforts)) {
        return value;
    }

    throw new DataCorruptionError(`Invalid run reasoning effort in persistence row: "${value}".`);
}

function parseReasoningSummary(value: string | null) {
    if (!value) {
        return undefined;
    }

    if (isOneOf(value, runtimeReasoningSummaries)) {
        return value;
    }

    throw new DataCorruptionError(`Invalid run reasoning summary in persistence row: "${value}".`);
}

function parseCacheStrategy(value: string | null): 'auto' | 'manual' | undefined {
    if (!value) {
        return undefined;
    }

    if (isOneOf(value, runtimeCacheStrategies)) {
        return value;
    }

    throw new DataCorruptionError(`Invalid run cache strategy in persistence row: "${value}".`);
}

function parseRequestedTransportFamily(value: string | null) {
    if (!value) {
        return undefined;
    }

    if (isOneOf(value, runtimeRequestedTransportFamilies)) {
        return value;
    }

    throw new DataCorruptionError(`Invalid requested transport family in persistence row: "${value}".`);
}

function parseSelectedTransport(value: string | null): ProviderRuntimeTransportFamily | undefined {
    if (!value) {
        return undefined;
    }

    if (
        value === 'openai_responses' ||
        value === 'openai_chat_completions' ||
        value === 'openai_realtime_websocket' ||
        value === 'kilo_gateway' ||
        value === 'provider_native' ||
        value === 'anthropic_messages' ||
        value === 'google_generativeai'
    ) {
        return value;
    }

    throw new DataCorruptionError(`Invalid run selected transport in persistence row: "${value}".`);
}

function parseOptionalBoolean(value: number | null): boolean | undefined {
    if (value === null) {
        return undefined;
    }

    if (value === 0) {
        return false;
    }

    if (value === 1) {
        return true;
    }

    throw new DataCorruptionError(`Invalid boolean integer in persistence row: "${String(value)}".`);
}

export interface RunRow {
    id: string;
    session_id: string;
    profile_id: string;
    plan_id: string | null;
    plan_revision_id: string | null;
    plan_phase_id: string | null;
    plan_phase_revision_id: string | null;
    prompt: string;
    status: string;
    provider_id: string | null;
    model_id: string | null;
    auth_method: string | null;
    reasoning_effort: string | null;
    reasoning_summary: string | null;
    reasoning_include_encrypted: number | null;
    cache_strategy: string | null;
    cache_key: string | null;
    cache_applied: number | null;
    cache_skip_reason: string | null;
    transport_requested_family: string | null;
    transport_selected: string | null;
    transport_degraded_reason: string | null;
    started_at: string | null;
    completed_at: string | null;
    aborted_at: string | null;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}

export function mapRunRecord(row: RunRow): RunRecord {
    const providerId = parseProviderId(row.provider_id);
    const authMethod = parseAuthMethod(row.auth_method);
    const reasoningEffort = parseReasoningEffort(row.reasoning_effort);
    const reasoningSummary = parseReasoningSummary(row.reasoning_summary);
    const reasoningIncludeEncrypted = parseOptionalBoolean(row.reasoning_include_encrypted);
    const cacheStrategy = parseCacheStrategy(row.cache_strategy);
    const cacheApplied = parseOptionalBoolean(row.cache_applied);
    const transportPreference = parseRequestedTransportFamily(row.transport_requested_family);
    const transportSelected = parseSelectedTransport(row.transport_selected);

    return {
        id: parseEntityId(row.id, 'runs.id', 'run'),
        sessionId: parseEntityId(row.session_id, 'runs.session_id', 'sess'),
        profileId: row.profile_id,
        ...(row.plan_id ? { planId: parseEntityId(row.plan_id, 'runs.plan_id', 'plan') } : {}),
        ...(row.plan_revision_id
            ? { planRevisionId: parseEntityId(row.plan_revision_id, 'runs.plan_revision_id', 'prev') }
            : {}),
        ...(row.plan_phase_id ? { planPhaseId: row.plan_phase_id } : {}),
        ...(row.plan_phase_revision_id ? { planPhaseRevisionId: row.plan_phase_revision_id } : {}),
        prompt: row.prompt,
        status: parseRunStatus(row.status),
        ...(providerId ? { providerId } : {}),
        ...(row.model_id ? { modelId: row.model_id } : {}),
        ...(authMethod ? { authMethod } : {}),
        ...(reasoningEffort && reasoningSummary && reasoningIncludeEncrypted !== undefined
            ? {
                  reasoning: {
                      effort: reasoningEffort,
                      summary: reasoningSummary,
                      includeEncrypted: reasoningIncludeEncrypted,
                  },
              }
            : {}),
        ...(cacheStrategy && cacheApplied !== undefined
            ? {
                  cache: {
                      strategy: cacheStrategy,
                      ...(row.cache_key ? { key: row.cache_key } : {}),
                      applied: cacheApplied,
                      ...(row.cache_skip_reason ? { reason: row.cache_skip_reason } : {}),
                  },
              }
            : {}),
        ...(transportPreference
            ? {
                  transport: {
                      requestedFamily: transportPreference,
                      ...(transportSelected ? { selected: transportSelected } : {}),
                      ...(row.transport_degraded_reason ? { degradedReason: row.transport_degraded_reason } : {}),
                  },
              }
            : {}),
        ...(row.started_at ? { startedAt: row.started_at } : {}),
        ...(row.completed_at ? { completedAt: row.completed_at } : {}),
        ...(row.aborted_at ? { abortedAt: row.aborted_at } : {}),
        ...(row.error_code ? { errorCode: row.error_code } : {}),
        ...(row.error_message ? { errorMessage: row.error_message } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
