import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue, parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { MemoryCausalLinkRecord, MemoryGraphEdgeRecord, MemoryTemporalFactRecord } from '@/app/backend/persistence/types';
import {
    memoryCausalRelationTypes,
    memoryDerivedEntityKinds,
    memoryGraphEdgeKinds,
    memoryTemporalFactStatuses,
    type EntityId,
    type MemoryCausalRelationType,
    type MemoryDerivedEntityKind,
    type MemoryGraphEdgeKind,
    type MemoryTemporalFactStatus,
    type MemoryType,
    memoryTypes,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

function mapTemporalFact(row: {
    id: string;
    profile_id: string;
    subject_key: string;
    fact_kind: string;
    value_json: string;
    status: string;
    valid_from: string;
    valid_to: string | null;
    source_memory_id: string;
    source_run_id: string | null;
    derivation_version: number;
    confidence: number | null;
    created_at: string;
    updated_at: string;
}): MemoryTemporalFactRecord {
    return {
        id: parseEntityId(row.id, 'memory_temporal_facts.id', 'mfact'),
        profileId: row.profile_id,
        subjectKey: row.subject_key,
        factKind: parseEnumValue(row.fact_kind, 'memory_temporal_facts.fact_kind', memoryTypes),
        value: parseJsonRecord(row.value_json),
        status: parseEnumValue(row.status, 'memory_temporal_facts.status', memoryTemporalFactStatuses),
        validFrom: row.valid_from,
        ...(row.valid_to ? { validTo: row.valid_to } : {}),
        sourceMemoryId: parseEntityId(row.source_memory_id, 'memory_temporal_facts.source_memory_id', 'mem'),
        ...(row.source_run_id
            ? { sourceRunId: parseEntityId(row.source_run_id, 'memory_temporal_facts.source_run_id', 'run') }
            : {}),
        derivationVersion: row.derivation_version,
        ...(row.confidence !== null ? { confidence: row.confidence } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapCausalLink(row: {
    id: string;
    profile_id: string;
    source_entity_kind: string;
    source_entity_id: string;
    target_entity_kind: string;
    target_entity_id: string;
    relation_type: string;
    source_memory_id: string;
    source_run_id: string | null;
    created_at: string;
    updated_at: string;
}): MemoryCausalLinkRecord {
    return {
        id: parseEntityId(row.id, 'memory_causal_links.id', 'mlink'),
        profileId: row.profile_id,
        sourceEntityKind: parseEnumValue(
            row.source_entity_kind,
            'memory_causal_links.source_entity_kind',
            memoryDerivedEntityKinds
        ),
        sourceEntityId: row.source_entity_id,
        targetEntityKind: parseEnumValue(
            row.target_entity_kind,
            'memory_causal_links.target_entity_kind',
            memoryDerivedEntityKinds
        ),
        targetEntityId: row.target_entity_id,
        relationType: parseEnumValue(row.relation_type, 'memory_causal_links.relation_type', memoryCausalRelationTypes),
        sourceMemoryId: parseEntityId(row.source_memory_id, 'memory_causal_links.source_memory_id', 'mem'),
        ...(row.source_run_id
            ? { sourceRunId: parseEntityId(row.source_run_id, 'memory_causal_links.source_run_id', 'run') }
            : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapGraphEdge(row: {
    id: string;
    profile_id: string;
    source_memory_id: string;
    target_memory_id: string;
    edge_kind: string;
    weight: number;
    derivation_version: number;
    created_at: string;
    updated_at: string;
}): MemoryGraphEdgeRecord {
    return {
        id: parseEntityId(row.id, 'memory_graph_edges.id', 'medge'),
        profileId: row.profile_id,
        sourceMemoryId: parseEntityId(row.source_memory_id, 'memory_graph_edges.source_memory_id', 'mem'),
        targetMemoryId: parseEntityId(row.target_memory_id, 'memory_graph_edges.target_memory_id', 'mem'),
        edgeKind: parseEnumValue(row.edge_kind, 'memory_graph_edges.edge_kind', memoryGraphEdgeKinds),
        weight: row.weight,
        derivationVersion: row.derivation_version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

interface TemporalFactInsert {
    profileId: string;
    subjectKey: string;
    factKind: MemoryType;
    value: Record<string, unknown>;
    status: MemoryTemporalFactStatus;
    validFrom: string;
    validTo?: string;
    sourceMemoryId: EntityId<'mem'>;
    sourceRunId?: EntityId<'run'>;
    derivationVersion: number;
    confidence?: number;
}

interface CausalLinkInsert {
    profileId: string;
    sourceEntityKind: MemoryDerivedEntityKind;
    sourceEntityId: string;
    targetEntityKind: MemoryDerivedEntityKind;
    targetEntityId: string;
    relationType: MemoryCausalRelationType;
    sourceMemoryId: EntityId<'mem'>;
    sourceRunId?: EntityId<'run'>;
}

interface GraphEdgeInsert {
    profileId: string;
    sourceMemoryId: EntityId<'mem'>;
    targetMemoryId: EntityId<'mem'>;
    edgeKind: MemoryGraphEdgeKind;
    weight: number;
    derivationVersion: number;
}

export class MemoryDerivedStore {
    async listTemporalFactsBySourceMemoryIds(
        profileId: string,
        sourceMemoryIds: EntityId<'mem'>[]
    ): Promise<MemoryTemporalFactRecord[]> {
        if (sourceMemoryIds.length === 0) {
            return [];
        }

        const { db } = getPersistence();
        const rows = await db
            .selectFrom('memory_temporal_facts')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('source_memory_id', 'in', sourceMemoryIds)
            .orderBy('valid_from', 'desc')
            .execute();

        return rows.map(mapTemporalFact);
    }

    async listTemporalFactsBySubjectKeys(
        profileId: string,
        subjectKeys: string[]
    ): Promise<MemoryTemporalFactRecord[]> {
        if (subjectKeys.length === 0) {
            return [];
        }

        const { db } = getPersistence();
        const rows = await db
            .selectFrom('memory_temporal_facts')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('subject_key', 'in', subjectKeys)
            .orderBy('valid_from', 'desc')
            .execute();

        return rows.map(mapTemporalFact);
    }

    async listCausalLinksBySourceMemoryIds(
        profileId: string,
        sourceMemoryIds: EntityId<'mem'>[]
    ): Promise<MemoryCausalLinkRecord[]> {
        if (sourceMemoryIds.length === 0) {
            return [];
        }

        const { db } = getPersistence();
        const rows = await db
            .selectFrom('memory_causal_links')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('source_memory_id', 'in', sourceMemoryIds)
            .orderBy('created_at', 'desc')
            .execute();

        return rows.map(mapCausalLink);
    }

    async listCausalLinksByTargetEntities(input: {
        profileId: string;
        targetEntityKind: MemoryDerivedEntityKind;
        targetEntityIds: string[];
        relationTypes?: MemoryCausalRelationType[];
    }): Promise<MemoryCausalLinkRecord[]> {
        if (input.targetEntityIds.length === 0) {
            return [];
        }

        const { db } = getPersistence();
        let query = db
            .selectFrom('memory_causal_links')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('target_entity_kind', '=', input.targetEntityKind)
            .where('target_entity_id', 'in', input.targetEntityIds);

        if (input.relationTypes && input.relationTypes.length > 0) {
            query = query.where('relation_type', 'in', input.relationTypes);
        }

        const rows = await query.orderBy('created_at', 'desc').execute();
        return rows.map(mapCausalLink);
    }

    async listGraphEdgesBySourceMemoryIds(
        profileId: string,
        sourceMemoryIds: EntityId<'mem'>[]
    ): Promise<MemoryGraphEdgeRecord[]> {
        if (sourceMemoryIds.length === 0) {
            return [];
        }

        const { db } = getPersistence();
        const rows = await db
            .selectFrom('memory_graph_edges')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('source_memory_id', 'in', sourceMemoryIds)
            .orderBy('weight', 'desc')
            .orderBy('created_at', 'desc')
            .execute();

        return rows.map(mapGraphEdge);
    }

    async listGraphEdgesByTargetMemoryIds(
        profileId: string,
        targetMemoryIds: EntityId<'mem'>[]
    ): Promise<MemoryGraphEdgeRecord[]> {
        if (targetMemoryIds.length === 0) {
            return [];
        }

        const { db } = getPersistence();
        const rows = await db
            .selectFrom('memory_graph_edges')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('target_memory_id', 'in', targetMemoryIds)
            .orderBy('weight', 'desc')
            .orderBy('created_at', 'desc')
            .execute();

        return rows.map(mapGraphEdge);
    }

    async replaceForMemory(input: {
        profileId: string;
        sourceMemoryId: EntityId<'mem'>;
        temporalFact?: TemporalFactInsert;
        causalLinks: CausalLinkInsert[];
        graphEdges?: GraphEdgeInsert[];
    }): Promise<void> {
        const { db } = getPersistence();
        const timestamp = nowIso();

        await db.transaction().execute(async (transaction) => {
            await transaction
                .deleteFrom('memory_temporal_facts')
                .where('profile_id', '=', input.profileId)
                .where('source_memory_id', '=', input.sourceMemoryId)
                .execute();

            await transaction
                .deleteFrom('memory_causal_links')
                .where('profile_id', '=', input.profileId)
                .where('source_memory_id', '=', input.sourceMemoryId)
                .execute();

            await transaction
                .deleteFrom('memory_graph_edges')
                .where('profile_id', '=', input.profileId)
                .where(({ eb, or }) =>
                    or([
                        eb('source_memory_id', '=', input.sourceMemoryId),
                        eb('target_memory_id', '=', input.sourceMemoryId),
                    ])
                )
                .execute();

            if (input.temporalFact) {
                await transaction
                    .insertInto('memory_temporal_facts')
                    .values({
                        id: createEntityId('mfact'),
                        profile_id: input.temporalFact.profileId,
                        subject_key: input.temporalFact.subjectKey,
                        fact_kind: input.temporalFact.factKind,
                        value_json: JSON.stringify(input.temporalFact.value),
                        status: input.temporalFact.status,
                        valid_from: input.temporalFact.validFrom,
                        valid_to: input.temporalFact.validTo ?? null,
                        source_memory_id: input.temporalFact.sourceMemoryId,
                        source_run_id: input.temporalFact.sourceRunId ?? null,
                        derivation_version: input.temporalFact.derivationVersion,
                        confidence: input.temporalFact.confidence ?? null,
                        created_at: timestamp,
                        updated_at: timestamp,
                    })
                    .execute();
            }

            if (input.causalLinks.length > 0) {
                await transaction
                    .insertInto('memory_causal_links')
                    .values(
                        input.causalLinks.map((causalLink) => ({
                            id: createEntityId('mlink'),
                            profile_id: causalLink.profileId,
                            source_entity_kind: causalLink.sourceEntityKind,
                            source_entity_id: causalLink.sourceEntityId,
                            target_entity_kind: causalLink.targetEntityKind,
                            target_entity_id: causalLink.targetEntityId,
                            relation_type: causalLink.relationType,
                            source_memory_id: causalLink.sourceMemoryId,
                            source_run_id: causalLink.sourceRunId ?? null,
                            created_at: timestamp,
                            updated_at: timestamp,
                        }))
                    )
                    .execute();
            }

            if (input.graphEdges && input.graphEdges.length > 0) {
                await transaction
                    .insertInto('memory_graph_edges')
                    .values(
                        input.graphEdges.map((graphEdge) => ({
                            id: createEntityId('medge'),
                            profile_id: graphEdge.profileId,
                            source_memory_id: graphEdge.sourceMemoryId,
                            target_memory_id: graphEdge.targetMemoryId,
                            edge_kind: graphEdge.edgeKind,
                            weight: graphEdge.weight,
                            derivation_version: graphEdge.derivationVersion,
                            created_at: timestamp,
                            updated_at: timestamp,
                        }))
                    )
                    .execute();
            }
        });
    }

    async rebuildProfile(input: {
        profileId: string;
        temporalFacts: TemporalFactInsert[];
        causalLinks: CausalLinkInsert[];
        graphEdges: GraphEdgeInsert[];
    }): Promise<void> {
        const { db } = getPersistence();
        const timestamp = nowIso();

        await db.transaction().execute(async (transaction) => {
            await transaction.deleteFrom('memory_graph_edges').where('profile_id', '=', input.profileId).execute();
            await transaction.deleteFrom('memory_causal_links').where('profile_id', '=', input.profileId).execute();
            await transaction.deleteFrom('memory_temporal_facts').where('profile_id', '=', input.profileId).execute();

            if (input.temporalFacts.length > 0) {
                await transaction
                    .insertInto('memory_temporal_facts')
                    .values(
                        input.temporalFacts.map((temporalFact) => ({
                            id: createEntityId('mfact'),
                            profile_id: temporalFact.profileId,
                            subject_key: temporalFact.subjectKey,
                            fact_kind: temporalFact.factKind,
                            value_json: JSON.stringify(temporalFact.value),
                            status: temporalFact.status,
                            valid_from: temporalFact.validFrom,
                            valid_to: temporalFact.validTo ?? null,
                            source_memory_id: temporalFact.sourceMemoryId,
                            source_run_id: temporalFact.sourceRunId ?? null,
                            derivation_version: temporalFact.derivationVersion,
                            confidence: temporalFact.confidence ?? null,
                            created_at: timestamp,
                            updated_at: timestamp,
                        }))
                    )
                    .execute();
            }

            if (input.causalLinks.length > 0) {
                await transaction
                    .insertInto('memory_causal_links')
                    .values(
                        input.causalLinks.map((causalLink) => ({
                            id: createEntityId('mlink'),
                            profile_id: causalLink.profileId,
                            source_entity_kind: causalLink.sourceEntityKind,
                            source_entity_id: causalLink.sourceEntityId,
                            target_entity_kind: causalLink.targetEntityKind,
                            target_entity_id: causalLink.targetEntityId,
                            relation_type: causalLink.relationType,
                            source_memory_id: causalLink.sourceMemoryId,
                            source_run_id: causalLink.sourceRunId ?? null,
                            created_at: timestamp,
                            updated_at: timestamp,
                        }))
                    )
                    .execute();
            }

            if (input.graphEdges.length > 0) {
                await transaction
                    .insertInto('memory_graph_edges')
                    .values(
                        input.graphEdges.map((graphEdge) => ({
                            id: createEntityId('medge'),
                            profile_id: graphEdge.profileId,
                            source_memory_id: graphEdge.sourceMemoryId,
                            target_memory_id: graphEdge.targetMemoryId,
                            edge_kind: graphEdge.edgeKind,
                            weight: graphEdge.weight,
                            derivation_version: graphEdge.derivationVersion,
                            created_at: timestamp,
                            updated_at: timestamp,
                        }))
                    )
                    .execute();
            }
        });
    }
}

export const memoryDerivedStore = new MemoryDerivedStore();
