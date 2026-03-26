import {
    runtimeEventDomains,
    runtimeEventOperations,
    runtimeEntityTypes,
    type RuntimeEventRecordV1,
} from '@/app/backend/persistence/types';
import type { WindowStateEvent } from '@/app/backend/trpc/routers/system/windowControls';

import { neonObservabilityEventKinds, type NeonObservabilityEvent } from '@/shared/contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isOneOf<const T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
    return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

const subscriptionControlTypes = ['started', 'stopped', 'state'] as const;

function isSubscriptionDataEnvelope(value: unknown): value is { data: unknown; id?: number | string } {
    return (
        isRecord(value) &&
        'data' in value &&
        Object.keys(value).every(
            (key) =>
                key === 'data' || (key === 'id' && (typeof value['id'] === 'number' || typeof value['id'] === 'string'))
        )
    );
}

export function normalizeSubscriptionPayload(value: unknown): unknown {
    let nextValue = value;

    for (;;) {
        if (isRecord(nextValue) && isRecord(nextValue['result'])) {
            const result = nextValue['result'];
            if (isOneOf(result['type'], subscriptionControlTypes)) {
                nextValue = result;
                continue;
            }

            if ('data' in result) {
                nextValue = result['data'];
                continue;
            }
        }

        if (isSubscriptionDataEnvelope(nextValue)) {
            nextValue = nextValue.data;
            continue;
        }

        return nextValue;
    }
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

