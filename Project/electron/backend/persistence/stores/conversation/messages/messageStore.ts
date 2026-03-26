import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue, parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { MessagePartRecord, MessageRecord } from '@/app/backend/persistence/types';
import type { EntityId } from '@/app/backend/runtime/contracts';
import { runtimeMessagePartTypes } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

const messageRoles = ['user', 'assistant', 'system', 'tool'] as const;
type MessageRole = (typeof messageRoles)[number];

function parseMessageRole(value: string): MessageRole {
    return parseEnumValue(value, 'message.role', messageRoles);
}

function parsePartType(value: string): (typeof runtimeMessagePartTypes)[number] {
    return parseEnumValue(value, 'message_part.part_type', runtimeMessagePartTypes);
}

function mapMessageRecord(row: {
    id: string;
    profile_id: string;
    session_id: string;
    run_id: string;
    role: string;
    created_at: string;
    updated_at: string;
}): MessageRecord {
    return {
        id: parseEntityId(row.id, 'messages.id', 'msg'),
        profileId: row.profile_id,
        sessionId: parseEntityId(row.session_id, 'messages.session_id', 'sess'),
        runId: parseEntityId(row.run_id, 'messages.run_id', 'run'),
        role: parseMessageRole(row.role),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapMessagePartRecord(row: {
    id: string;
    message_id: string;
    sequence: number;
    part_type: string;
    payload_json: string;
    created_at: string;
}): MessagePartRecord {
    return {
        id: parseEntityId(row.id, 'message_parts.id', 'part'),
        messageId: parseEntityId(row.message_id, 'message_parts.message_id', 'msg'),
        sequence: row.sequence,
        partType: parsePartType(row.part_type),
        payload: parseJsonRecord(row.payload_json),
        createdAt: row.created_at,
    };
}

export class MessageStore {
    private async readPartById(partId: string): Promise<MessagePartRecord> {
        const { db } = getPersistence();
        const row = await db.selectFrom('message_parts').selectAll().where('id', '=', partId).executeTakeFirstOrThrow();
        return mapMessagePartRecord(row);
    }

    async createMessage(input: {
        profileId: string;
        sessionId: string;
        runId: string;
        role: MessageRole;
    }): Promise<MessageRecord> {
        const { db } = getPersistence();
        const messageId = createEntityId('msg');
        const now = nowIso();

        await db
            .insertInto('messages')
            .values({
                id: messageId,
                profile_id: input.profileId,
                session_id: input.sessionId,
                run_id: input.runId,
                role: input.role,
                created_at: now,
                updated_at: now,
            })
            .execute();

        const row = await db.selectFrom('messages').selectAll().where('id', '=', messageId).executeTakeFirstOrThrow();

        return mapMessageRecord(row);
    }

    async createPart(input: {
        messageId: string;
        partType: (typeof runtimeMessagePartTypes)[number];
        payload: Record<string, unknown>;
    }): Promise<MessagePartRecord> {
        const { db } = getPersistence();
        const partId = createEntityId('part');
        const now = nowIso();

        const last = await db
            .selectFrom('message_parts')
            .select('sequence')
            .where('message_id', '=', input.messageId)
            .orderBy('sequence', 'desc')
            .executeTakeFirst();

        const sequence = (last?.sequence ?? -1) + 1;

        await db
            .insertInto('message_parts')
            .values({
                id: partId,
                message_id: input.messageId,
                sequence,
                part_type: input.partType,
                payload_json: JSON.stringify(input.payload),
                created_at: now,
            })
            .execute();

        const row = await db.selectFrom('message_parts').selectAll().where('id', '=', partId).executeTakeFirstOrThrow();

        return mapMessagePartRecord(row);
    }

    async appendPart(input: {
        messageId: string;
        partType: (typeof runtimeMessagePartTypes)[number];
        payload: Record<string, unknown>;
    }): Promise<MessagePartRecord> {
        return this.createPart(input);
    }

    async extendTextPart(input: { partId: EntityId<'part'>; appendText: string }): Promise<MessagePartRecord> {
        if (input.appendText.length === 0) {
            return this.readPartById(input.partId);
        }

        const { db } = getPersistence();
        const existing = await db
            .selectFrom('message_parts')
            .select(['id', 'payload_json'])
            .where('id', '=', input.partId)
            .executeTakeFirstOrThrow();
        const payload = parseJsonRecord(existing.payload_json);
        const currentText = typeof payload['text'] === 'string' ? payload['text'] : '';
        const nextPayload = {
            ...payload,
            text: `${currentText}${input.appendText}`,
        };

        await db
            .updateTable('message_parts')
            .set({
                payload_json: JSON.stringify(nextPayload),
            })
            .where('id', '=', input.partId)
            .executeTakeFirst();

        return this.readPartById(input.partId);
    }

    async listMessagesBySession(profileId: string, sessionId: string, runId?: string): Promise<MessageRecord[]> {
        const { db } = getPersistence();
        let query = db
            .selectFrom('messages')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc');

        if (runId) {
            query = query.where('run_id', '=', runId);
        }

        const rows = await query.execute();
        return rows.map(mapMessageRecord);
    }

    async listPartsBySession(profileId: string, sessionId: string, runId?: string): Promise<MessagePartRecord[]> {
        const { db } = getPersistence();
        let query = db
            .selectFrom('message_parts')
            .innerJoin('messages', 'messages.id', 'message_parts.message_id')
            .select([
                'message_parts.id as id',
                'message_parts.message_id as message_id',
                'message_parts.sequence as sequence',
                'message_parts.part_type as part_type',
                'message_parts.payload_json as payload_json',
                'message_parts.created_at as created_at',
            ])
            .where('messages.profile_id', '=', profileId)
            .where('messages.session_id', '=', sessionId)
            .orderBy('messages.created_at', 'asc')
            .orderBy('message_parts.sequence', 'asc');

        if (runId) {
            query = query.where('messages.run_id', '=', runId);
        }

        const rows = await query.execute();
        return rows.map(mapMessagePartRecord);
    }

    async listMessagesByProfile(profileId: string): Promise<MessageRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('messages')
            .selectAll()
            .where('profile_id', '=', profileId)
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .execute();

        return rows.map(mapMessageRecord);
    }

    async listPartsByProfile(profileId: string): Promise<MessagePartRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('message_parts')
            .innerJoin('messages', 'messages.id', 'message_parts.message_id')
            .select([
                'message_parts.id as id',
                'message_parts.message_id as message_id',
                'message_parts.sequence as sequence',
                'message_parts.part_type as part_type',
                'message_parts.payload_json as payload_json',
                'message_parts.created_at as created_at',
            ])
            .where('messages.profile_id', '=', profileId)
            .orderBy('messages.created_at', 'asc')
            .orderBy('message_parts.sequence', 'asc')
            .execute();

        return rows.map(mapMessagePartRecord);
    }

    async getEditableUserMessageTarget(input: {
        profileId: string;
        sessionId: string;
        messageId: EntityId<'msg'>;
    }): Promise<
        | { found: false; reason: 'not_found' | 'not_user_message' | 'text_part_missing' }
        | { found: true; runId: EntityId<'run'>; currentText: string }
    > {
        const { db } = getPersistence();
        const message = await db
            .selectFrom('messages')
            .select(['id', 'run_id', 'role'])
            .where('id', '=', input.messageId)
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .executeTakeFirst();
        if (!message) {
            return { found: false, reason: 'not_found' };
        }
        if (message.role !== 'user') {
            return { found: false, reason: 'not_user_message' };
        }

        const part = await db
            .selectFrom('message_parts')
            .select(['id', 'payload_json'])
            .where('message_id', '=', message.id)
            .where('part_type', '=', 'text')
            .orderBy('sequence', 'asc')
            .executeTakeFirst();
        if (!part) {
            return { found: false, reason: 'text_part_missing' };
        }
        const payload = parseJsonRecord(part.payload_json);
        const text = payload['text'];
        if (typeof text !== 'string' || text.trim().length === 0) {
            return { found: false, reason: 'text_part_missing' };
        }

        return {
            found: true,
            runId: parseEntityId(message.run_id, 'messages.run_id', 'run'),
            currentText: text,
        };
    }

    async getBranchMessageTarget(input: {
        profileId: string;
        sessionId: string;
        messageId: EntityId<'msg'>;
    }): Promise<
        | { found: false; reason: 'not_found' | 'not_branchable' }
        | { found: true; runId: EntityId<'run'>; role: MessageRole }
    > {
        const { db } = getPersistence();
        const message = await db
            .selectFrom('messages')
            .select(['run_id', 'role'])
            .where('id', '=', input.messageId)
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .executeTakeFirst();
        if (!message) {
            return { found: false, reason: 'not_found' };
        }

        const role = parseMessageRole(message.role);
        if (role !== 'user' && role !== 'assistant') {
            return { found: false, reason: 'not_branchable' };
        }

        return {
            found: true,
            runId: parseEntityId(message.run_id, 'messages.run_id', 'run'),
            role,
        };
    }
}

export const messageStore = new MessageStore();
