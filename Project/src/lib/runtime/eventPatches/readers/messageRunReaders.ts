import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { isRecord, readBoolean, readLiteral, readNumber, readString } from '@/web/lib/runtime/eventPatches/readers/shared';

import type { MessagePartRecord, MessageRecord, RunRecord } from '@/app/backend/persistence/types';

import {
    providerAuthMethods,
    providerIds,
    runStatuses,
    runtimeReasoningEfforts,
    runtimeReasoningSummaries,
    runtimeRequestedTransportFamilies,
} from '@/shared/contracts';

export function readMessagePartRecord(value: unknown): MessagePartRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const messageId = readString(value['messageId']);
    const sequence = readNumber(value['sequence']);
    const partType = readLiteral(value['partType'], [
        'text',
        'image',
        'reasoning',
        'reasoning_summary',
        'reasoning_encrypted',
        'tool_call',
        'tool_result',
        'error',
        'status',
    ] as const);
    const payload = isRecord(value['payload']) ? value['payload'] : undefined;
    const createdAt = readString(value['createdAt']);

    if (
        !id ||
        !isEntityId(id, 'part') ||
        !messageId ||
        !isEntityId(messageId, 'msg') ||
        sequence === undefined ||
        !partType ||
        !payload ||
        !createdAt
    ) {
        return undefined;
    }

    return {
        id,
        messageId,
        sequence,
        partType,
        payload,
        createdAt,
    };
}

export function readMessageRecord(value: unknown): MessageRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const profileId = readString(value['profileId']);
    const sessionId = readString(value['sessionId']);
    const runId = readString(value['runId']);
    const role = readLiteral(value['role'], ['user', 'assistant', 'system', 'tool'] as const);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    if (
        !id ||
        !isEntityId(id, 'msg') ||
        !profileId ||
        !sessionId ||
        !isEntityId(sessionId, 'sess') ||
        !runId ||
        !isEntityId(runId, 'run') ||
        !role ||
        !createdAt ||
        !updatedAt
    ) {
        return undefined;
    }

    return {
        id,
        profileId,
        sessionId,
        runId,
        role,
        createdAt,
        updatedAt,
    };
}

export function readRunRecord(value: unknown): RunRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const sessionId = readString(value['sessionId']);
    const profileId = readString(value['profileId']);
    const promptValue = value['prompt'];
    const prompt = typeof promptValue === 'string' ? promptValue : undefined;
    const status = readLiteral(value['status'], runStatuses);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    if (
        !id ||
        !isEntityId(id, 'run') ||
        !sessionId ||
        !isEntityId(sessionId, 'sess') ||
        !profileId ||
        prompt === undefined ||
        !status ||
        !createdAt ||
        !updatedAt
    ) {
        return undefined;
    }

    const providerId = readLiteral(value['providerId'], providerIds);
    const modelId = readString(value['modelId']);
    const authMethod = readLiteral(value['authMethod'], [...providerAuthMethods, 'none'] as const);
    const startedAt = readString(value['startedAt']);
    const completedAt = readString(value['completedAt']);
    const abortedAt = readString(value['abortedAt']);
    const errorCode = readString(value['errorCode']);
    const errorMessage = readString(value['errorMessage']);
    const reasoningValue = value['reasoning'];
    const cacheValue = value['cache'];
    const transportValue = value['transport'];

    const reasoningEffort = isRecord(reasoningValue)
        ? readLiteral(reasoningValue['effort'], runtimeReasoningEfforts)
        : undefined;
    const reasoningSummary = isRecord(reasoningValue)
        ? readLiteral(reasoningValue['summary'], runtimeReasoningSummaries)
        : undefined;
    const includeEncrypted = isRecord(reasoningValue) ? readBoolean(reasoningValue['includeEncrypted']) : undefined;
    const reasoning =
        reasoningEffort && reasoningSummary && includeEncrypted !== undefined
            ? {
                  effort: reasoningEffort,
                  summary: reasoningSummary,
                  includeEncrypted,
              }
            : undefined;

    const cacheRecord = isRecord(cacheValue) ? cacheValue : undefined;
    const cacheStrategy = cacheRecord ? readLiteral(cacheRecord['strategy'], ['auto', 'manual'] as const) : undefined;
    const cacheApplied = cacheRecord ? readBoolean(cacheRecord['applied']) : undefined;
    const cache =
        cacheStrategy && cacheApplied !== undefined
            ? (() => {
                  const key = cacheRecord ? readString(cacheRecord['key']) : undefined;
                  const reason = cacheRecord ? readString(cacheRecord['reason']) : undefined;
                  return {
                      strategy: cacheStrategy,
                      applied: cacheApplied,
                      ...(key ? { key } : {}),
                      ...(reason ? { reason } : {}),
                  };
              })()
            : undefined;

    const transportRecord = isRecord(transportValue) ? transportValue : undefined;
    const requestedFamily = transportRecord
        ? readLiteral(transportRecord['requestedFamily'], runtimeRequestedTransportFamilies)
        : undefined;
    const transport =
        requestedFamily
            ? (() => {
                  const selected = transportRecord
                      ? readLiteral(transportRecord['selected'], [
                            'openai_responses',
                            'openai_chat_completions',
                            'openai_realtime_websocket',
                            'kilo_gateway',
                            'provider_native',
                            'anthropic_messages',
                            'google_generativeai',
                        ] as const)
                      : undefined;
                  const degradedReason = transportRecord ? readString(transportRecord['degradedReason']) : undefined;
                  return {
                      requestedFamily,
                      ...(selected ? { selected } : {}),
                      ...(degradedReason ? { degradedReason } : {}),
                  };
              })()
            : undefined;

    return {
        id,
        sessionId,
        profileId,
        prompt,
        status,
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
        ...(authMethod ? { authMethod } : {}),
        ...(reasoning ? { reasoning } : {}),
        ...(cache ? { cache } : {}),
        ...(transport ? { transport } : {}),
        ...(startedAt ? { startedAt } : {}),
        ...(completedAt ? { completedAt } : {}),
        ...(abortedAt ? { abortedAt } : {}),
        ...(errorCode ? { errorCode } : {}),
        ...(errorMessage ? { errorMessage } : {}),
        createdAt,
        updatedAt,
    };
}

export function upsertMessagePartRecord(
    messageParts: MessagePartRecord[],
    nextPart: MessagePartRecord
): MessagePartRecord[] {
    return [...messageParts.filter((candidate) => candidate.id !== nextPart.id), nextPart].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
            return left.createdAt.localeCompare(right.createdAt);
        }

        return left.sequence - right.sequence;
    });
}

export function upsertRunRecord(runs: RunRecord[], nextRun: RunRecord): RunRecord[] {
    return [nextRun, ...runs.filter((candidate) => candidate.id !== nextRun.id)].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
    );
}

export function resolveSessionActiveRunId(
    currentActiveRunId: RunRecord['id'] | null,
    run: RunRecord
): RunRecord['id'] | null {
    if (run.status === 'running') {
        return run.id;
    }

    return currentActiveRunId === run.id ? null : currentActiveRunId;
}

