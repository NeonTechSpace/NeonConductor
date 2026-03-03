import { describe, expect, it } from 'vitest';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';
import { runtimeEventBus } from '@/app/backend/runtime/services/runtimeEventBus';

describe('runtimeEventBus', () => {
    it('delivers published events to active subscribers and stops after unsubscribe', () => {
        const received: RuntimeEventRecordV1[] = [];

        const unsubscribe = runtimeEventBus.subscribe((event) => {
            received.push(event);
        });

        const first: RuntimeEventRecordV1 = {
            sequence: 1,
            eventId: 'evt_first' as RuntimeEventRecordV1['eventId'],
            entityType: 'runtime',
            entityId: 'runtime',
            eventType: 'runtime.reset.applied',
            payload: {},
            createdAt: new Date().toISOString(),
        };

        runtimeEventBus.publish(first);
        unsubscribe();

        const second: RuntimeEventRecordV1 = {
            ...first,
            sequence: 2,
            eventId: 'evt_second' as RuntimeEventRecordV1['eventId'],
        };

        runtimeEventBus.publish(second);

        expect(received).toHaveLength(1);
        expect(received[0]?.sequence).toBe(1);
    });
});
