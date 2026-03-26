import type { RuntimeEntityType, RuntimeEventDomain, RuntimeEventOperation } from '@/app/backend/persistence/types';

export interface RuntimeEventEnvelopeInput {
    entityType: RuntimeEntityType;
    domain: RuntimeEventDomain;
    operation: RuntimeEventOperation;
    entityId: string;
    eventType: string;
    payload: Record<string, unknown>;
    requestId?: string;
    correlationId?: string;
    origin?: string;
}

function createRuntimeEventEnvelope(
    operation: RuntimeEventOperation,
    input: Omit<RuntimeEventEnvelopeInput, 'operation'>
): RuntimeEventEnvelopeInput {
    return {
        ...input,
        operation,
    };
}

export function runtimeStatusEvent(input: Omit<RuntimeEventEnvelopeInput, 'operation'>): RuntimeEventEnvelopeInput {
    return createRuntimeEventEnvelope('status', input);
}

export function runtimeUpsertEvent(input: Omit<RuntimeEventEnvelopeInput, 'operation'>): RuntimeEventEnvelopeInput {
    return createRuntimeEventEnvelope('upsert', input);
}

export function runtimeRemoveEvent(input: Omit<RuntimeEventEnvelopeInput, 'operation'>): RuntimeEventEnvelopeInput {
    return createRuntimeEventEnvelope('remove', input);
}

export function runtimeAppendEvent(input: Omit<RuntimeEventEnvelopeInput, 'operation'>): RuntimeEventEnvelopeInput {
    return createRuntimeEventEnvelope('append', input);
}

export function runtimeResetEvent(input: Omit<RuntimeEventEnvelopeInput, 'operation'>): RuntimeEventEnvelopeInput {
    return createRuntimeEventEnvelope('reset', input);
}

export function runtimeSyncEvent(input: Omit<RuntimeEventEnvelopeInput, 'operation'>): RuntimeEventEnvelopeInput {
    return createRuntimeEventEnvelope('sync', input);
}
