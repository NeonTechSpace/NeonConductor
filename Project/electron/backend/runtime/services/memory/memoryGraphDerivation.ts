import type { MemoryEvidenceRecord, MemoryRevisionRecord } from '@/app/backend/persistence/types';
import {
    isEntityId,
    type EntityId,
    type MemoryGraphEdgeKind,
    type MemoryRecord as RuntimeMemoryRecord,
} from '@/app/backend/runtime/contracts';
import { MEMORY_DERIVATION_VERSION } from '@/app/backend/runtime/services/memory/memoryDerivationConstants';

export interface MemoryGraphEdgeInsert {
    profileId: string;
    sourceMemoryId: EntityId<'mem'>;
    targetMemoryId: EntityId<'mem'>;
    edgeKind: MemoryGraphEdgeKind;
    weight: number;
    derivationVersion: number;
}

interface BuildMemoryGraphEdgesInput {
    profileId: string;
    memories: RuntimeMemoryRecord[];
    subjectKeyByMemoryId: Map<EntityId<'mem'>, string>;
    revisionRecords: MemoryRevisionRecord[];
    evidenceByMemoryId: Map<EntityId<'mem'>, MemoryEvidenceRecord[]>;
}

function normalizeSearchText(value: string): string {
    return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeSubjectSegment(value: string): string {
    const normalized = normalizeSearchText(value)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized.length > 0 ? normalized : 'memory';
}

function buildFallbackSubjectKey(memory: RuntimeMemoryRecord): string {
    const provenanceKey = memory.runId ?? memory.threadId ?? memory.workspaceFingerprint ?? 'global';
    return [memory.memoryType, memory.scopeKind, provenanceKey, normalizeSubjectSegment(memory.title)].join('::');
}

function buildTemporalGroupKey(memoryType: RuntimeMemoryRecord['memoryType'], temporalSubjectKey: string): string {
    return `${memoryType}::${temporalSubjectKey}`;
}

function dedupeEntityIds<T extends string>(values: T[]): T[] {
    return Array.from(new Set(values));
}

function clampScore(value: number): number {
    return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function addDirectedGraphEdge(
    edgeMap: Map<string, MemoryGraphEdgeInsert>,
    input: {
        profileId: string;
        sourceMemoryId: EntityId<'mem'>;
        targetMemoryId: EntityId<'mem'>;
        edgeKind: MemoryGraphEdgeKind;
        weight: number;
    }
): void {
    if (input.sourceMemoryId === input.targetMemoryId) {
        return;
    }

    const key = [input.sourceMemoryId, input.targetMemoryId, input.edgeKind].join('::');
    const existing = edgeMap.get(key);
    if (existing && existing.weight >= input.weight) {
        return;
    }

    edgeMap.set(key, {
        profileId: input.profileId,
        sourceMemoryId: input.sourceMemoryId,
        targetMemoryId: input.targetMemoryId,
        edgeKind: input.edgeKind,
        weight: clampScore(input.weight),
        derivationVersion: MEMORY_DERIVATION_VERSION,
    });
}

function addUndirectedGraphEdge(
    edgeMap: Map<string, MemoryGraphEdgeInsert>,
    input: {
        profileId: string;
        leftMemoryId: EntityId<'mem'>;
        rightMemoryId: EntityId<'mem'>;
        edgeKind: MemoryGraphEdgeKind;
        weight: number;
    }
): void {
    addDirectedGraphEdge(edgeMap, {
        profileId: input.profileId,
        sourceMemoryId: input.leftMemoryId,
        targetMemoryId: input.rightMemoryId,
        edgeKind: input.edgeKind,
        weight: input.weight,
    });
    addDirectedGraphEdge(edgeMap, {
        profileId: input.profileId,
        sourceMemoryId: input.rightMemoryId,
        targetMemoryId: input.leftMemoryId,
        edgeKind: input.edgeKind,
        weight: input.weight,
    });
}

function addCompleteGroupEdges(
    edgeMap: Map<string, MemoryGraphEdgeInsert>,
    input: {
        profileId: string;
        memoryIds: EntityId<'mem'>[];
        edgeKind: MemoryGraphEdgeKind;
        weight: number;
    }
): void {
    for (let index = 0; index < input.memoryIds.length; index += 1) {
        const leftMemoryId = input.memoryIds[index];
        if (!leftMemoryId) {
            continue;
        }
        for (let targetIndex = index + 1; targetIndex < input.memoryIds.length; targetIndex += 1) {
            const rightMemoryId = input.memoryIds[targetIndex];
            if (!rightMemoryId) {
                continue;
            }
            addUndirectedGraphEdge(edgeMap, {
                profileId: input.profileId,
                leftMemoryId,
                rightMemoryId,
                edgeKind: input.edgeKind,
                weight: input.weight,
            });
        }
    }
}

function readActiveConsolidationSourceMemoryIds(input: {
    memory: RuntimeMemoryRecord;
    activeMemoryIds: Set<EntityId<'mem'>>;
}): EntityId<'mem'>[] {
    if (input.memory.state !== 'active' || input.memory.metadata['source'] !== 'memory_consolidation') {
        return [];
    }

    const rawClusterMemoryIds = input.memory.metadata['clusterMemoryIds'];
    if (!Array.isArray(rawClusterMemoryIds)) {
        return [];
    }

    return dedupeEntityIds(
        rawClusterMemoryIds.filter(
            (value): value is EntityId<'mem'> =>
                typeof value === 'string' &&
                isEntityId(value, 'mem') &&
                value !== input.memory.id &&
                input.activeMemoryIds.has(value)
        )
    );
}

export function buildMemoryGraphEdges(input: BuildMemoryGraphEdgesInput): MemoryGraphEdgeInsert[] {
    const edgeMap = new Map<string, MemoryGraphEdgeInsert>();
    const memoryIdsBySubjectGroup = new Map<string, EntityId<'mem'>[]>();
    const memoryIdsByRunId = new Map<EntityId<'run'>, EntityId<'mem'>[]>();
    const memoryIdsByThreadId = new Map<EntityId<'thr'>, EntityId<'mem'>[]>();
    const memoryIdsByWorkspaceFingerprint = new Map<string, EntityId<'mem'>[]>();
    const evidenceKeyToMemoryIds = new Map<string, EntityId<'mem'>[]>();
    const activeMemoryIds = new Set(
        input.memories.filter((memory) => memory.state === 'active').map((memory) => memory.id)
    );

    for (const memory of input.memories) {
        const temporalSubjectKey = input.subjectKeyByMemoryId.get(memory.id) ?? buildFallbackSubjectKey(memory);
        const subjectGroupKey = buildTemporalGroupKey(memory.memoryType, temporalSubjectKey);
        memoryIdsBySubjectGroup.set(subjectGroupKey, [
            ...(memoryIdsBySubjectGroup.get(subjectGroupKey) ?? []),
            memory.id,
        ]);
        if (memory.runId) {
            memoryIdsByRunId.set(memory.runId, [...(memoryIdsByRunId.get(memory.runId) ?? []), memory.id]);
        }
        if (memory.threadId) {
            memoryIdsByThreadId.set(memory.threadId, [...(memoryIdsByThreadId.get(memory.threadId) ?? []), memory.id]);
        }
        if (memory.workspaceFingerprint) {
            memoryIdsByWorkspaceFingerprint.set(memory.workspaceFingerprint, [
                ...(memoryIdsByWorkspaceFingerprint.get(memory.workspaceFingerprint) ?? []),
                memory.id,
            ]);
        }

        for (const sourceMemoryId of readActiveConsolidationSourceMemoryIds({ memory, activeMemoryIds })) {
            addUndirectedGraphEdge(edgeMap, {
                profileId: input.profileId,
                leftMemoryId: memory.id,
                rightMemoryId: sourceMemoryId,
                edgeKind: 'consolidation_source',
                weight: 0.96,
            });
        }

        const evidenceRecords = input.evidenceByMemoryId.get(memory.id) ?? [];
        for (const evidenceRecord of evidenceRecords) {
            const evidenceKeys = [
                ...(evidenceRecord.sourceRunId ? [`run:${evidenceRecord.sourceRunId}`] : []),
                ...(evidenceRecord.sourceMessageId ? [`message:${evidenceRecord.sourceMessageId}`] : []),
                ...(evidenceRecord.sourceMessagePartId ? [`message_part:${evidenceRecord.sourceMessagePartId}`] : []),
            ];
            for (const evidenceKey of evidenceKeys) {
                evidenceKeyToMemoryIds.set(evidenceKey, [
                    ...(evidenceKeyToMemoryIds.get(evidenceKey) ?? []),
                    memory.id,
                ]);
            }
        }
    }

    for (const memoryIds of memoryIdsBySubjectGroup.values()) {
        addCompleteGroupEdges(edgeMap, {
            profileId: input.profileId,
            memoryIds: dedupeEntityIds(memoryIds),
            edgeKind: 'same_subject',
            weight: 0.92,
        });
    }
    for (const memoryIds of memoryIdsByRunId.values()) {
        addCompleteGroupEdges(edgeMap, {
            profileId: input.profileId,
            memoryIds: dedupeEntityIds(memoryIds),
            edgeKind: 'same_run',
            weight: 0.84,
        });
    }
    for (const memoryIds of memoryIdsByThreadId.values()) {
        addCompleteGroupEdges(edgeMap, {
            profileId: input.profileId,
            memoryIds: dedupeEntityIds(memoryIds),
            edgeKind: 'same_thread',
            weight: 0.72,
        });
    }
    for (const memoryIds of memoryIdsByWorkspaceFingerprint.values()) {
        addCompleteGroupEdges(edgeMap, {
            profileId: input.profileId,
            memoryIds: dedupeEntityIds(memoryIds),
            edgeKind: 'same_workspace',
            weight: 0.44,
        });
    }

    for (const revisionRecord of input.revisionRecords) {
        addDirectedGraphEdge(edgeMap, {
            profileId: input.profileId,
            sourceMemoryId: revisionRecord.previousMemoryId,
            targetMemoryId: revisionRecord.replacementMemoryId,
            edgeKind: 'revision_successor',
            weight: 1,
        });
        addDirectedGraphEdge(edgeMap, {
            profileId: input.profileId,
            sourceMemoryId: revisionRecord.replacementMemoryId,
            targetMemoryId: revisionRecord.previousMemoryId,
            edgeKind: 'revision_predecessor',
            weight: 1,
        });
    }

    for (const memoryIds of evidenceKeyToMemoryIds.values()) {
        const uniqueMemoryIds = dedupeEntityIds(memoryIds);
        if (uniqueMemoryIds.length < 2) {
            continue;
        }
        addCompleteGroupEdges(edgeMap, {
            profileId: input.profileId,
            memoryIds: uniqueMemoryIds,
            edgeKind: 'evidence_overlap',
            weight: Math.min(0.9, 0.58 + uniqueMemoryIds.length * 0.06),
        });
    }

    return Array.from(edgeMap.values());
}
