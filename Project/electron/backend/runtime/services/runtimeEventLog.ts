import { runtimeEventStore } from '@/app/backend/persistence/stores';
import type { RuntimeEntityType, RuntimeEventRecordV1 } from '@/app/backend/persistence/types';
import { runtimeEventBus } from '@/app/backend/runtime/services/runtimeEventBus';

export interface RuntimeEventLogService {
    append(event: {
        entityType: RuntimeEntityType;
        entityId: string;
        eventType: string;
        payload: Record<string, unknown>;
    }): Promise<RuntimeEventRecordV1>;
    getEvents(afterSequence: number | null, limit: number): Promise<RuntimeEventRecordV1[]>;
}

class RuntimeEventLogServiceImpl implements RuntimeEventLogService {
    async append(event: {
        entityType: RuntimeEntityType;
        entityId: string;
        eventType: string;
        payload: Record<string, unknown>;
    }): Promise<RuntimeEventRecordV1> {
        const appended = await runtimeEventStore.append(event);
        runtimeEventBus.publish(appended);
        return appended;
    }

    getEvents(afterSequence: number | null, limit: number): Promise<RuntimeEventRecordV1[]> {
        return runtimeEventStore.list(afterSequence, limit);
    }
}

export const runtimeEventLogService: RuntimeEventLogService = new RuntimeEventLogServiceImpl();
