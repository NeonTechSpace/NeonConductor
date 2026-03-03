import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso, parseJsonValue } from '@/app/backend/persistence/stores/utils';
import type { RuntimeEntityType, RuntimeEventRecordV1 } from '@/app/backend/persistence/types';
import { createEntityId } from '@/app/backend/runtime/contracts';
import type { EntityId } from '@/app/backend/runtime/contracts';

export class RuntimeEventStore {
    async append(event: {
        entityType: RuntimeEntityType;
        entityId: string;
        eventType: string;
        payload: Record<string, unknown>;
    }): Promise<RuntimeEventRecordV1> {
        const { db } = getPersistence();
        const createdAt = nowIso();
        const eventId = createEntityId('evt');

        const inserted = await db
            .insertInto('runtime_events')
            .values({
                event_id: eventId,
                entity_type: event.entityType,
                entity_id: event.entityId,
                event_type: event.eventType,
                payload_json: JSON.stringify(event.payload),
                created_at: createdAt,
            })
            .returning(['sequence', 'event_id', 'entity_type', 'entity_id', 'event_type', 'payload_json', 'created_at'])
            .executeTakeFirstOrThrow();

        return {
            sequence: inserted.sequence,
            eventId: inserted.event_id as EntityId<'evt'>,
            entityType: inserted.entity_type as RuntimeEntityType,
            entityId: inserted.entity_id,
            eventType: inserted.event_type,
            payload: parseJsonValue(inserted.payload_json, {}),
            createdAt: inserted.created_at,
        };
    }

    async list(afterSequence: number | null, limit: number): Promise<RuntimeEventRecordV1[]> {
        const { db } = getPersistence();

        let query = db
            .selectFrom('runtime_events')
            .select(['sequence', 'event_id', 'entity_type', 'entity_id', 'event_type', 'payload_json', 'created_at'])
            .orderBy('sequence', 'asc')
            .limit(limit);

        if (typeof afterSequence === 'number') {
            query = query.where('sequence', '>', afterSequence);
        }

        const rows = await query.execute();

        return rows.map((row) => ({
            sequence: row.sequence,
            eventId: row.event_id as EntityId<'evt'>,
            entityType: row.entity_type as RuntimeEntityType,
            entityId: row.entity_id,
            eventType: row.event_type,
            payload: parseJsonValue(row.payload_json, {}),
            createdAt: row.created_at,
        }));
    }

    async getLastSequence(): Promise<number> {
        const { db } = getPersistence();

        const result = await db
            .selectFrom('runtime_events')
            .select((eb) => eb.fn.max<number>('sequence').as('last_sequence'))
            .executeTakeFirst();

        return result?.last_sequence ?? 0;
    }
}

export const runtimeEventStore = new RuntimeEventStore();
