import { getPersistence } from '@/app/backend/persistence/db';
import type { DatabaseSchema } from '@/app/backend/persistence/schema';
import { parseEntityId, parseEnumValue, parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { MemoryRecord } from '@/app/backend/persistence/types';
import {
    memoryCreatedByKinds,
    memoryRetentionClasses,
    memoryScopeKinds,
    memoryStates,
    memoryTypes,
    type EntityId,
    type MemoryCanonicalBody,
    type MemoryCreatedByKind,
    type MemoryRetentionClass,
    type MemoryRevisionReason,
    type MemoryScopeKind,
    type MemoryState,
    type MemoryType,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import {
    createMemoryCanonicalBodyFromMarkdown,
    normalizeMemoryCanonicalBody,
    renderMemoryCanonicalBodyMarkdown,
} from '@/app/backend/runtime/services/memory/memoryCanonicalBody';
import {
    defaultRetentionSupersedenceRationale,
    resolveMemoryRetention,
} from '@/app/backend/runtime/services/memory/memoryRetentionPolicy';

import type { Kysely, Transaction } from 'kysely';

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
    canonical_body_json: string;
    body_markdown_projection: string;
    summary_text: string | null;
    metadata_json: string;
    retention_class: string;
    retention_expires_at: string | null;
    retention_pinned_at: string | null;
    retention_supersedence_rationale: string | null;
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
        canonicalBody: normalizeMemoryCanonicalBody(parseJsonRecord(row.canonical_body_json) as unknown as MemoryCanonicalBody),
        bodyMarkdown: row.body_markdown_projection,
        metadata: parseJsonRecord(row.metadata_json),
        memoryRetentionClass: parseEnumValue(
            row.retention_class,
            'memory_records.retention_class',
            memoryRetentionClasses
        ),
        ...(row.retention_expires_at ? { retentionExpiresAt: row.retention_expires_at } : {}),
        ...(row.retention_pinned_at ? { retentionPinnedAt: row.retention_pinned_at } : {}),
        ...(row.retention_supersedence_rationale
            ? { retentionSupersedenceRationale: row.retention_supersedence_rationale }
            : {}),
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
    canonicalBody?: MemoryCanonicalBody;
    bodyMarkdown?: string;
    bodyMarkdownProjection?: string;
    summaryText?: string;
    metadata?: Record<string, unknown>;
    memoryRetentionClass?: MemoryRetentionClass;
    retentionExpiresAt?: string;
    retentionPinnedAt?: string;
    retentionSupersedenceRationale?: string;
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
    temporalSubjectKey?: string;
}

interface UpdateMemoryEditableFieldsInput {
    profileId: string;
    memoryId: EntityId<'mem'>;
    title: string;
    canonicalBody?: MemoryCanonicalBody;
    bodyMarkdown?: string;
    bodyMarkdownProjection?: string;
    summaryText?: string;
    metadata?: Record<string, unknown>;
    memoryRetentionClass?: MemoryRetentionClass;
    retentionExpiresAt?: string;
    retentionPinnedAt?: string;
    retentionSupersedenceRationale?: string;
}

function resolveStoredBody(input: {
    canonicalBody?: MemoryCanonicalBody;
    bodyMarkdown?: string;
    bodyMarkdownProjection?: string;
}): { canonicalBody: MemoryCanonicalBody; bodyMarkdownProjection: string } {
    const canonicalBody = input.canonicalBody
        ? normalizeMemoryCanonicalBody(input.canonicalBody)
        : createMemoryCanonicalBodyFromMarkdown(input.bodyMarkdown ?? '');
    return {
        canonicalBody,
        bodyMarkdownProjection: input.bodyMarkdownProjection ?? renderMemoryCanonicalBodyMarkdown(canonicalBody),
    };
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
        const storedBody = resolveStoredBody(input);
        const retention = resolveMemoryRetention({
            scopeKind: input.scopeKind,
            createdByKind: input.createdByKind,
            ...(input.memoryRetentionClass ? { memoryRetentionClass: input.memoryRetentionClass } : {}),
            ...(input.retentionExpiresAt ? { retentionExpiresAt: input.retentionExpiresAt } : {}),
            ...(input.retentionPinnedAt ? { retentionPinnedAt: input.retentionPinnedAt } : {}),
            now: timestamp,
        });
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
                canonical_body_json: JSON.stringify(storedBody.canonicalBody),
                body_markdown_projection: storedBody.bodyMarkdownProjection,
                summary_text: input.summaryText ?? null,
                metadata_json: JSON.stringify(input.metadata ?? {}),
                retention_class: retention.memoryRetentionClass,
                retention_expires_at: retention.retentionExpiresAt ?? null,
                retention_pinned_at: retention.retentionPinnedAt ?? null,
                retention_supersedence_rationale: input.retentionSupersedenceRationale ?? null,
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
        memoryRetentionClass?: MemoryRetentionClass;
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
        if (input.memoryRetentionClass) {
            query = query.where('retention_class', '=', input.memoryRetentionClass);
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
        const storedBody = resolveStoredBody(input);
        const updated = await this.getDb()
            .updateTable('memory_records')
            .set({
                title: input.title,
                canonical_body_json: JSON.stringify(storedBody.canonicalBody),
                body_markdown_projection: storedBody.bodyMarkdownProjection,
                summary_text: input.summaryText ?? null,
                metadata_json: JSON.stringify(input.metadata ?? {}),
                ...(input.memoryRetentionClass ? { retention_class: input.memoryRetentionClass } : {}),
                ...(input.retentionExpiresAt !== undefined ? { retention_expires_at: input.retentionExpiresAt } : {}),
                ...(input.retentionPinnedAt !== undefined ? { retention_pinned_at: input.retentionPinnedAt } : {}),
                ...(input.retentionSupersedenceRationale !== undefined
                    ? { retention_supersedence_rationale: input.retentionSupersedenceRationale }
                    : {}),
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
        retentionSupersedenceRationale?: string;
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
            retentionSupersedenceRationale?: string;
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
                retention_supersedence_rationale:
                    input.retentionSupersedenceRationale ??
                    defaultRetentionSupersedenceRationale(input.revisionReason),
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
