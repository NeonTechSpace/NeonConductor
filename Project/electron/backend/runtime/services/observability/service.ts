import type {
    NeonObservabilityEvent,
    NeonObservabilitySubscriptionInput,
} from '@/app/backend/runtime/contracts';
import { isNeonObservabilityEnabled } from '@/app/backend/runtime/services/observability/enabled';

type Listener = (event: NeonObservabilityEvent) => void;

type PublishableNeonObservabilityEvent = Omit<
    NeonObservabilityEvent,
    'sequence' | 'at' | 'kind'
> & {
    kind: NeonObservabilityEvent['kind'];
    at?: string;
    [key: string]: unknown;
};

const MAX_BUFFERED_OBSERVABILITY_EVENTS = 500;

function matchesFilter(
    event: NeonObservabilityEvent,
    filter: Pick<NeonObservabilitySubscriptionInput, 'profileId' | 'sessionId' | 'runId'>
): boolean {
    if (filter.profileId && event.profileId !== filter.profileId) {
        return false;
    }

    if (filter.sessionId && event.sessionId !== filter.sessionId) {
        return false;
    }

    if (filter.runId && event.runId !== filter.runId) {
        return false;
    }

    return true;
}

export interface NeonObservabilityService {
    isEnabled(): boolean;
    publish(event: PublishableNeonObservabilityEvent): NeonObservabilityEvent | null;
    list(input: NeonObservabilitySubscriptionInput, limit: number): NeonObservabilityEvent[];
    subscribe(
        listener: Listener,
        filter?: Pick<NeonObservabilitySubscriptionInput, 'profileId' | 'sessionId' | 'runId'>
    ): () => void;
    resetForTests(): void;
}

class NeonObservabilityServiceImpl implements NeonObservabilityService {
    private nextSequence = 1;
    private bufferedEvents: NeonObservabilityEvent[] = [];
    private readonly listeners = new Map<
        Listener,
        Pick<NeonObservabilitySubscriptionInput, 'profileId' | 'sessionId' | 'runId'>
    >();

    isEnabled(): boolean {
        return isNeonObservabilityEnabled();
    }

    publish(event: PublishableNeonObservabilityEvent): NeonObservabilityEvent | null {
        if (!this.isEnabled()) {
            return null;
        }

        const publishedEvent = {
            ...event,
            sequence: this.nextSequence,
            at: event.at ?? new Date().toISOString(),
        } as NeonObservabilityEvent;
        this.nextSequence += 1;
        this.bufferedEvents = [...this.bufferedEvents, publishedEvent].slice(-MAX_BUFFERED_OBSERVABILITY_EVENTS);

        for (const [listener, filter] of this.listeners.entries()) {
            if (!matchesFilter(publishedEvent, filter)) {
                continue;
            }

            listener(publishedEvent);
        }

        return publishedEvent;
    }

    list(input: NeonObservabilitySubscriptionInput, limit: number): NeonObservabilityEvent[] {
        if (!this.isEnabled()) {
            return [];
        }

        const afterSequence = input.afterSequence ?? 0;
        return this.bufferedEvents
            .filter((event) => event.sequence > afterSequence)
            .filter((event) => matchesFilter(event, input))
            .slice(0, limit);
    }

    subscribe(
        listener: Listener,
        filter: Pick<NeonObservabilitySubscriptionInput, 'profileId' | 'sessionId' | 'runId'> = {}
    ): () => void {
        if (!this.isEnabled()) {
            return () => undefined;
        }

        this.listeners.set(listener, filter);
        return () => {
            this.listeners.delete(listener);
        };
    }

    resetForTests(): void {
        this.nextSequence = 1;
        this.bufferedEvents = [];
        this.listeners.clear();
    }
}

export const neonObservabilityService: NeonObservabilityService = new NeonObservabilityServiceImpl();
