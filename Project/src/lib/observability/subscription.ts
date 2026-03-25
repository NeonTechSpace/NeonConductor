import { log } from 'evlog';

import type { NeonObservabilityEvent } from '@/app/backend/runtime/contracts';
import {
    isNeonObservabilityEvent,
    isSubscriptionControlPayload,
    normalizeSubscriptionPayload,
} from '@/web/lib/providers/subscriptionPayloads';

export interface ApplyNeonObservabilitySubscriptionPayloadInput {
    payload: unknown;
    setLive: () => void;
    setError: (message: string) => void;
    pushEvent: (event: NeonObservabilityEvent) => void;
}

export function applyNeonObservabilitySubscriptionPayload(
    input: ApplyNeonObservabilitySubscriptionPayloadInput
): void {
    const normalizedPayload = normalizeSubscriptionPayload(input.payload);

    if (isSubscriptionControlPayload(normalizedPayload)) {
        input.setLive();
        return;
    }

    if (isNeonObservabilityEvent(normalizedPayload)) {
        input.pushEvent(normalizedPayload);
        return;
    }

    log.warn({
        tag: 'observability.stream',
        message: 'Received invalid Neon observability payload.',
    });
    input.setError('Received invalid Neon observability payload.');
}
