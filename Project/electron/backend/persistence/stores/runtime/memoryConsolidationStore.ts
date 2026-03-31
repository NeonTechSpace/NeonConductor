import type { Kysely } from 'kysely';

import { getPersistence } from '@/app/backend/persistence/db';
import type { DatabaseSchema } from '@/app/backend/persistence/schema';
import { parseEntityId, parseEnumValue, parseJsonArray } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { MemoryConsolidationRecord } from '@/app/backend/persistence/types';
import {
    memoryConsolidationSources,
    memoryConsolidationStates,
    memoryScopeKinds,
    memoryTypes,
    type EntityId,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

function mapMemoryConsolidationRecord(row: {
    id: string;
    profile_id: string;
    subject_key: string;
    target_memory_type: string;
    scope_kind: string;
    source_consolidation: string;
    state: string;
    candidate_title: string;
    candidate_summary_text: string | null;
    candidate_body_markdown: string;
    evidence_memory_ids_json: string;
    materialized_memory_id: string | null;
    source_digest: string;
    created_at: string;
    updated_at: string;
}): MemoryConsolidationRecord {
    return {
        id: parseEntityId(row.id, 'memory_consolidation_records.id', 'mcon'),
        profileId: row.profile_id,
        subjectKey: row.subject_key,
        targetMemoryType: parseEnumValue(row.target_memory_type, 'memory_consolidation_records.target_memory_type', [
            'semantic',
            'procedural',
        ] as const),
        scopeKind: parseEnumValue(row.scope_kind, 'memory_consolidation_records.scope_kind', memoryScopeKinds),
        sourceConsolidation: parseEnumValue(
            row.source_consolidation,
            'memory_consolidation_records.source_consolidation',
            memoryConsolidationSources
        ),
        state: parseEnumValue(row.state, 'memory_consolidation_records.state', memoryConsolidationStates),
        candidateTitle: row.candidate_title,
        ...(row.candidate_summary_text ? { candidateSummaryText: row.candidate_summary_text } : {}),
        candidateBodyMarkdown: row.candidate_body_markdown,
        evidenceMemoryIds: parseJsonArray(row.evidence_memory_ids_json)
            .filter((value): value is string => typeof value === 'string')
            .map((value) => parseEntityId(value, 'memory_consolidation_records.evidence_memory_ids_json[]', 'mem')),
        ...(row.materialized_memory_id
            ? {
                  materializedMemoryId: parseEntityId(
                      row.materialized_memory_id,
                      'memory_consolidation_records.materialized_memory_id',
                      'mem'
                  ),
              }
            : {}),
        sourceDigest: row.source_digest,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class MemoryConsolidationStore {
    private getDb(): Kysely<DatabaseSchema> {
        return getPersistence().db;
    }

    async upsert(input: {
        profileId: string;
        subjectKey: string;
        targetMemoryType: Extract<(typeof memoryTypes)[number], 'semantic' | 'procedural'>;
        scopeKind: MemoryConsolidationRecord['scopeKind'];
        sourceConsolidation: MemoryConsolidationRecord['sourceConsolidation'];
        state: MemoryConsolidationRecord['state'];
        candidateTitle: string;
        candidateSummaryText?: string;
        candidateBodyMarkdown: string;
        evidenceMemoryIds: EntityId<'mem'>[];
        materializedMemoryId?: EntityId<'mem'>;
        sourceDigest: string;
    }): Promise<MemoryConsolidationRecord> {
        const existing = await this.getLatestBySubject({
            profileId: input.profileId,
            subjectKey: input.subjectKey,
            targetMemoryType: input.targetMemoryType,
            scopeKind: input.scopeKind,
        });
        const timestamp = nowIso();

        if (existing) {
            const updated = await this.getDb()
                .updateTable('memory_consolidation_records')
                .set({
                    source_consolidation: input.sourceConsolidation,
                    state: input.state,
                    candidate_title: input.candidateTitle,
                    candidate_summary_text: input.candidateSummaryText ?? null,
                    candidate_body_markdown: input.candidateBodyMarkdown,
                    evidence_memory_ids_json: JSON.stringify(input.evidenceMemoryIds),
                    materialized_memory_id: input.materializedMemoryId ?? null,
                    source_digest: input.sourceDigest,
                    updated_at: timestamp,
                })
                .where('id', '=', existing.id)
                .returningAll()
                .executeTakeFirstOrThrow();

            return mapMemoryConsolidationRecord(updated);
        }

        const inserted = await this.getDb()
            .insertInto('memory_consolidation_records')
            .values({
                id: createEntityId('mcon'),
                profile_id: input.profileId,
                subject_key: input.subjectKey,
                target_memory_type: input.targetMemoryType,
                scope_kind: input.scopeKind,
                source_consolidation: input.sourceConsolidation,
                state: input.state,
                candidate_title: input.candidateTitle,
                candidate_summary_text: input.candidateSummaryText ?? null,
                candidate_body_markdown: input.candidateBodyMarkdown,
                evidence_memory_ids_json: JSON.stringify(input.evidenceMemoryIds),
                materialized_memory_id: input.materializedMemoryId ?? null,
                source_digest: input.sourceDigest,
                created_at: timestamp,
                updated_at: timestamp,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return mapMemoryConsolidationRecord(inserted);
    }

    async getLatestBySubject(input: {
        profileId: string;
        subjectKey: string;
        targetMemoryType: Extract<(typeof memoryTypes)[number], 'semantic' | 'procedural'>;
        scopeKind: MemoryConsolidationRecord['scopeKind'];
    }): Promise<MemoryConsolidationRecord | null> {
        const row = await this.getDb()
            .selectFrom('memory_consolidation_records')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('subject_key', '=', input.subjectKey)
            .where('target_memory_type', '=', input.targetMemoryType)
            .where('scope_kind', '=', input.scopeKind)
            .orderBy('updated_at', 'desc')
            .executeTakeFirst();

        return row ? mapMemoryConsolidationRecord(row) : null;
    }
}

export const memoryConsolidationStore = new MemoryConsolidationStore();
