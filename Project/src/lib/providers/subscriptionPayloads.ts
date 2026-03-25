import {
    runtimeEventDomains,
    runtimeEventOperations,
    runtimeEntityTypes,
    type RuntimeEventRecordV1,
} from '@/app/backend/persistence/types';
import { neonObservabilityEventKinds, type NeonObservabilityEvent } from '@/app/backend/runtime/contracts';
import type { WindowStateEvent } from '@/app/backend/trpc/routers/system/windowControls';

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isOneOf<const T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
    return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

const subscriptionControlTypes = ['started', 'stopped', 'state'] as const;

export function normalizeSubscriptionPayload(value: unknown): unknown {
    if (!isRecord(value) || !isRecord(value['result'])) {
        return value;
    }

    const result = value['result'];
    if (isOneOf(result['type'], subscriptionControlTypes)) {
        return result;
    }

    if ('data' in result) {
        return result['data'];
    }

    return value;
}

export function isSubscriptionControlPayload(value: unknown): value is null | undefined | { type: string } {
    return value == null || (isRecord(value) && isOneOf(value['type'], subscriptionControlTypes));
}

export function isRuntimeEventRecord(value: unknown): value is RuntimeEventRecordV1 {
    if (!isRecord(value) || !isRecord(value['payload'])) {
        return false;
    }

    return (
        typeof value['sequence'] === 'number' &&
        typeof value['eventId'] === 'string' &&
        isOneOf(value['entityType'], runtimeEntityTypes) &&
        isOneOf(value['domain'], runtimeEventDomains) &&
        isOneOf(value['operation'], runtimeEventOperations) &&
        typeof value['entityId'] === 'string' &&
        typeof value['eventType'] === 'string' &&
        typeof value['createdAt'] === 'string'
    );
}

export function isWindowStateEvent(value: unknown): value is WindowStateEvent {
    if (!isRecord(value) || !isRecord(value['state'])) {
        return false;
    }

    const state = value['state'];
    return (
        typeof value['sequence'] === 'number' &&
        typeof state['isMaximized'] === 'boolean' &&
        typeof state['isFullScreen'] === 'boolean' &&
        typeof state['canMaximize'] === 'boolean' &&
        typeof state['canMinimize'] === 'boolean' &&
        typeof state['platform'] === 'string'
    );
}

export function isNeonObservabilityEvent(value: unknown): value is NeonObservabilityEvent {
    if (!isRecord(value) || !isOneOf(value['kind'], neonObservabilityEventKinds)) {
        return false;
    }

    return (
        typeof value['sequence'] === 'number' &&
        typeof value['at'] === 'string' &&
        typeof value['profileId'] === 'string' &&
        typeof value['sessionId'] === 'string' &&
        typeof value['runId'] === 'string' &&
        typeof value['providerId'] === 'string' &&
        typeof value['modelId'] === 'string' &&
        typeof value['source'] === 'string'
    );
}
