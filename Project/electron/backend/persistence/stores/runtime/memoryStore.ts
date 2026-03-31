import type { Kysely, Transaction } from 'kysely';

import { getPersistence } from '@/app/backend/persistence/db';
import type { DatabaseSchema } from '@/app/backend/persistence/schema';
import { parseEntityId, parseEnumValue, parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { MemoryRecord } from '@/app/backend/persistence/types';
import {
    memoryCreatedByKinds,
    memoryScopeKinds,
    memoryStates,
    memoryTypes,
    type EntityId,
    type MemoryCreatedByKind,
    type MemoryRevisionReason,
    type MemoryScopeKind,
    type MemoryState,
    type MemoryType,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

type MemoryStoreDb = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

function mapMemoryRecord(row: {
    id: string;
    profile_id: string;
    memory_type: string;
    scope_kind: string;
    state: string;
    workspace_fingerprint: string | null;
    thread_id: string | null;
    run_id: string | null;
    created_by_kind: string;
    title: string;
    body_markdown: string;
    summary_text: string | null;
    metadata_json: string;
    temporal_subject_key: string | null;
    superseded_by_memory_id: string | null;
    created_at: string;
    updated_at: string;
}): MemoryRecord {
    return {
        id: parseEntityId(row.id, 'memory_records.id', 'mem'),
        profileId: row.profile_id,
        memoryType: parseEnumValue(row.memory_type, 'memory_records.memory_type', memoryTypes),
        scopeKind: parseEnumValue(row.scope_kind, 'memory_records.scope_kind', memoryScopeKinds),
        state: parseEnumValue(row.state, 'memory_records.state', memoryStates),
        createdByKind: parseEnumValue(row.created_by_kind, 'memory_records.created_by_kind', memoryCreatedByKinds),
        title: row.title,
        bodyMarkdown: row.body_markdown,
        metadata: parseJsonRecord(row.metadata_json),
        ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        ...(row.thread_id ? { threadId: parseEntityId(row.thread_id, 'memory_records.thread_id', 'thr') } : {}),
        ...(row.run_id ? { runId: parseEntityId(row.run_id, 'memory_records.run_id', 'run') } : {}),
        ...(row.summary_text ? { summaryText: row.summary_text } : {}),
        ...(row.temporal_subject_key ? { temporalSubjectKey: row.temporal_subject_key } : {}),
        ...(row.superseded_by_memory_id
            ? {
                  supersededByMemoryId: parseEntityId(
                      row.superseded_by_memory_id,
                      'memory_records.superseded_by_memory_id',
                      'mem'
                  ),
              }
            : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

interface CreateMemoryRecordInput {
    profileId: string;
    memoryType: MemoryType;
    scopeKind: MemoryScopeKind;
    state?: Extract<MemoryState, 'active' | 'disabled'>;
    createdByKind: MemoryCreatedByKind;
    title: string;
    bodyMarkdown: string;
    summaryText?: string;
    metadata?: Record<string, unknown>;
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
    temporalSubjectKey?: string;
}

interface UpdateMemoryEditableFieldsInput {
    profileId: string;
    memoryId: EntityId<'mem'>;
    title: string;
    bodyMarkdown: string;
    summaryText?: string;
    metadata?: Record<string, unknown>;
}

export class MemoryStore {
    private getDb(): Kysely<DatabaseSchema> {
        return getPersistence().db;
    }

    private async insertMemoryRecord(
        db: MemoryStoreDb,
        input: CreateMemoryRecordInput,
        options?: {
            memoryId?: EntityId<'mem'>;
            timestamp?: string;
        }
    ): Promise<MemoryRecord> {
        const timestamp = options?.timestamp ?? nowIso();
        const inserted = await db
            .insertInto('memory_records')
            .values({
                id: options?.memoryId ?? createEntityId('mem'),
                profile_id: input.profileId,
                memory_type: input.memoryType,
                scope_kind: input.scopeKind,
                state: input.state ?? 'active',
                workspace_fingerprint: input.workspaceFingerprint ?? null,
                thread_id: input.threadId ?? null,
                run_id: input.runId ?? null,
                created_by_kind: input.createdByKind,
                title: input.title,
                body_markdown: input.bodyMarkdown,
                summary_text: input.summaryText ?? null,
                metadata_json: JSON.stringify(input.metadata ?? {}),
                temporal_subject_key: input.temporalSubjectKey ?? null,
                superseded_by_memory_id: null,
                created_at: timestamp,
                updated_at: timestamp,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return mapMemoryRecord(inserted);
    }

    async getById(profileId: string, memoryId: EntityId<'mem'>): Promise<MemoryRecord | null> {
        const row = await this.getDb()
            .selectFrom('memory_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('id', '=', memoryId)
            .executeTakeFirst();

        return row ? mapMemoryRecord(row) : null;
    }

    async listByIds(profileId: string, memoryIds: EntityId<'mem'>[]): Promise<MemoryRecord[]> {
        const uniqueMemoryIds = Array.from(new Set(memoryIds));
        if (uniqueMemoryIds.length === 0) {
            return [];
        }

        const rows = await this.getDb()
            .selectFrom('memory_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('id', 'in', uniqueMemoryIds)
            .orderBy('updated_at', 'desc')
            .orderBy('id', 'desc')
            .execute();

        return rows.map(mapMemoryRecord);
    }

    async listByProfile(input: {
        profileId: string;
        memoryType?: MemoryType;
        scopeKind?: MemoryScopeKind;
        state?: MemoryState;
        workspaceFingerprint?: string;
        threadId?: EntityId<'thr'>;
        runId?: EntityId<'run'>;
    }): Promise<MemoryRecord[]> {
        let query = this.getDb().selectFrom('memory_records').selectAll().where('profile_id', '=', input.profileId);

        if (input.memoryType) {
            query = query.where('memory_type', '=', input.memoryType);
        }
        if (input.scopeKind) {
            query = query.where('scope_kind', '=', input.scopeKind);
        }
        if (input.state) {
            query = query.where('state', '=', input.state);
        }
        if (input.workspaceFingerprint) {
            query = query.where('workspace_fingerprint', '=', input.workspaceFingerprint);
        }
        if (input.threadId) {
            query = query.where('thread_id', '=', input.threadId);
        }
        if (input.runId) {
            query = query.where('run_id', '=', input.runId);
        }

        const rows = await query.orderBy('updated_at', 'desc').orderBy('id', 'desc').execute();
        return rows.map(mapMemoryRecord);
    }

    async create(input: CreateMemoryRecordInput): Promise<MemoryRecord> {
        return this.insertMemoryRecord(this.getDb(), input);
    }

    async createInTransaction(
        transaction: Transaction<DatabaseSchema>,
        input: CreateMemoryRecordInput
    ): Promise<MemoryRecord> {
        return this.insertMemoryRecord(transaction, input);
    }

    async disable(profileId: string, memoryId: EntityId<'mem'>): Promise<MemoryRecord | null> {
        const updated = await this.getDb()
            .updateTable('memory_records')
            .set({
                state: 'disabled',
                superseded_by_memory_id: null,
                updated_at: nowIso(),
            })
            .where('profile_id', '=', profileId)
            .where('id', '=', memoryId)
            .returningAll()
            .executeTakeFirst();

        return updated ? mapMemoryRecord(updated) : null;
    }

    async updateEditableFields(input: UpdateMemoryEditableFieldsInput): Promise<MemoryRecord | null> {
        const updated = await this.getDb()
            .updateTable('memory_records')
            .set({
                title: input.title,
                body_markdown: input.bodyMarkdown,
                summary_text: input.summaryText ?? null,
                metadata_json: JSON.stringify(input.metadata ?? {}),
                updated_at: nowIso(),
            })
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.memoryId)
            .returningAll()
            .executeTakeFirst();

        return updated ? mapMemoryRecord(updated) : null;
    }

    async supersede(input: {
        profileId: string;
        previousMemoryId: EntityId<'mem'>;
        revisionReason: MemoryRevisionReason;
        replacement: CreateMemoryRecordInput;
    }): Promise<{ previous: MemoryRecord; replacement: MemoryRecord } | null> {
        return this.getDb().transaction().execute(async (transaction) =>
            this.supersedeInTransaction(transaction, input)
        );
    }

    async supersedeInTransaction(
        transaction: Transaction<DatabaseSchema>,
        input: {
            profileId: string;
            previousMemoryId: EntityId<'mem'>;
            revisionReason: MemoryRevisionReason;
            replacement: CreateMemoryRecordInput;
        }
    ): Promise<{ previous: MemoryRecord; replacement: MemoryRecord } | null> {
        const existing = await transaction
            .selectFrom('memory_records')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.previousMemoryId)
            .executeTakeFirst();

        if (!existing) {
            return null;
        }

        const timestamp = nowIso();
        const replacementId = createEntityId('mem');
        const replacement = await this.insertMemoryRecord(transaction, input.replacement, {
            memoryId: replacementId,
            timestamp,
        });

        const updated = await transaction
            .updateTable('memory_records')
            .set({
                state: 'superseded',
                superseded_by_memory_id: replacementId,
                updated_at: timestamp,
            })
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.previousMemoryId)
            .returningAll()
            .executeTakeFirstOrThrow();

        await transaction
            .insertInto('memory_revision_records')
            .values({
                id: createEntityId('mrev'),
                profile_id: input.profileId,
                previous_memory_id: input.previousMemoryId,
                replacement_memory_id: replacementId,
                revision_reason: input.revisionReason,
                created_at: timestamp,
            })
            .execute();

        return {
            previous: mapMemoryRecord(updated),
            replacement,
        };
    }
}

export const memoryStore = new MemoryStore();
