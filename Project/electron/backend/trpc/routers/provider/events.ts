import {
    runtimeStatusEvent,
    runtimeSyncEvent,
    runtimeUpsertEvent,
} from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';

export async function emitProviderStatusEvent(input: {
    providerId: string;
    eventType: string;
    payload: Record<string, unknown>;
}) {
    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'provider',
            domain: 'provider',
            entityId: input.providerId,
            eventType: input.eventType,
            payload: input.payload,
        })
    );
}

export async function emitProviderUpsertEvent(input: {
    providerId: string;
    eventType: string;
    payload: Record<string, unknown>;
}) {
    await runtimeEventLogService.append(
        runtimeUpsertEvent({
            entityType: 'provider',
            domain: 'provider',
            entityId: input.providerId,
            eventType: input.eventType,
            payload: input.payload,
        })
    );
}

export async function emitProviderSyncEvent(input: {
    providerId: string;
    eventType: string;
    payload: Record<string, unknown>;
}) {
    await runtimeEventLogService.append(
        runtimeSyncEvent({
            entityType: 'provider',
            domain: 'provider',
            entityId: input.providerId,
            eventType: input.eventType,
            payload: input.payload,
        })
    );
}
