import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue, parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type {
    RuntimeEntityType,
    RuntimeEventDomain,
    RuntimeEventOperation,
    RuntimeEventRecordV1,
} from '@/app/backend/persistence/types';
import { runtimeEntityTypes, runtimeEventDomains, runtimeEventOperations } from '@/app/backend/persistence/types';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

export class RuntimeEventStore {
    async append(event: {
        entityType: RuntimeEntityType;
        domain: RuntimeEventDomain;
        operation: RuntimeEventOperation;
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
                domain: event.domain,
                operation: event.operation,
                entity_id: event.entityId,
                event_type: event.eventType,
                payload_json: JSON.stringify(event.payload),
                created_at: createdAt,
            })
            .returning([
                'sequence',
                'event_id',
                'entity_type',
                'domain',
                'operation',
                'entity_id',
                'event_type',
                'payload_json',
                'created_at',
            ])
            .executeTakeFirstOrThrow();

        const entityType = parseEnumValue(inserted.entity_type, 'runtime_events.entity_type', runtimeEntityTypes);

        return {
            sequence: inserted.sequence,
            eventId: parseEntityId(inserted.event_id, 'runtime_events.event_id', 'evt'),
            entityType,
            domain: parseEnumValue(inserted.domain, 'runtime_events.domain', runtimeEventDomains),
            operation: parseEnumValue(inserted.operation, 'runtime_events.operation', runtimeEventOperations),
            entityId: inserted.entity_id,
            eventType: inserted.event_type,
            payload: parseJsonRecord(inserted.payload_json),
            createdAt: inserted.created_at,
        };
    }

    async list(afterSequence: number | null, limit: number): Promise<RuntimeEventRecordV1[]> {
        const { db } = getPersistence();

        let query = db
            .selectFrom('runtime_events')
            .select([
                'sequence',
                'event_id',
                'entity_type',
                'domain',
                'operation',
                'entity_id',
                'event_type',
                'payload_json',
                'created_at',
            ])
            .orderBy('sequence', 'asc')
            .limit(limit);

        if (typeof afterSequence === 'number') {
            query = query.where('sequence', '>', afterSequence);
        }

        const rows = await query.execute();

        return rows.map((row) => {
            const entityType = parseEnumValue(row.entity_type, 'runtime_events.entity_type', runtimeEntityTypes);

            return {
                sequence: row.sequence,
                eventId: parseEntityId(row.event_id, 'runtime_events.event_id', 'evt'),
                entityType,
                domain: parseEnumValue(row.domain, 'runtime_events.domain', runtimeEventDomains),
                operation: parseEnumValue(row.operation, 'runtime_events.operation', runtimeEventOperations),
                entityId: row.entity_id,
                eventType: row.event_type,
                payload: parseJsonRecord(row.payload_json),
                createdAt: row.created_at,
            };
        });
    }

    async listByEntity(input: {
        entityType: RuntimeEntityType;
        entityId: string;
        afterSequence?: number | null;
        limit?: number;
    }): Promise<RuntimeEventRecordV1[]> {
        const { db } = getPersistence();

        let query = db
            .selectFrom('runtime_events')
            .select([
                'sequence',
                'event_id',
                'entity_type',
                'domain',
                'operation',
                'entity_id',
                'event_type',
                'payload_json',
                'created_at',
            ])
            .where('entity_type', '=', input.entityType)
            .where('entity_id', '=', input.entityId)
            .orderBy('sequence', 'asc');

        if (typeof input.afterSequence === 'number') {
            query = query.where('sequence', '>', input.afterSequence);
        }
        if (typeof input.limit === 'number') {
            query = query.limit(input.limit);
        }

        const rows = await query.execute();
        return rows.map((row) => {
            const entityType = parseEnumValue(row.entity_type, 'runtime_events.entity_type', runtimeEntityTypes);

            return {
                sequence: row.sequence,
                eventId: parseEntityId(row.event_id, 'runtime_events.event_id', 'evt'),
                entityType,
                domain: parseEnumValue(row.domain, 'runtime_events.domain', runtimeEventDomains),
                operation: parseEnumValue(row.operation, 'runtime_events.operation', runtimeEventOperations),
                entityId: row.entity_id,
                eventType: row.event_type,
                payload: parseJsonRecord(row.payload_json),
                createdAt: row.created_at,
            };
        });
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
