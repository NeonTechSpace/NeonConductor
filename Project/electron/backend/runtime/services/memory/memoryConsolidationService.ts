import { createHash } from 'node:crypto';

import { memoryConsolidationStore, memoryEvidenceStore, memoryStore } from '@/app/backend/persistence/stores';
import type { MemoryEvidenceRecord } from '@/app/backend/persistence/types';
import type { EntityId, MemoryConsolidationRecord, MemoryEvidenceCreateInput, MemoryRecord as RuntimeMemoryRecord } from '@/app/backend/runtime/contracts';
import { createTextMessage } from '@/app/backend/runtime/services/runExecution/contextParts';
import { utilityModelService } from '@/app/backend/runtime/services/profile/utilityModel';
import { generatePlainTextFromMessages } from '@/app/backend/runtime/services/common/plainTextGeneration';
import { memoryService } from '@/app/backend/runtime/services/memory/service';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';
import { appLog } from '@/app/main/logging';

const MAX_CLUSTER_MEMORIES = 8;
const MAX_SOURCE_EVIDENCE_PER_MEMORY = 2;
const MIN_CLUSTER_EVIDENCE_COUNT = 3;
const CONSOLIDATION_SYSTEM_PROMPT = [
    'You convert repeated episodic agent memories into one durable canonical memory.',
    'Return strict JSON only.',
    'Choose targetMemoryType = "semantic" for stable facts or "procedural" for repeatable workflows/preferences.',
    'Reject weak synthesis by setting confidenceLabel to "low".',
    'Required JSON keys: targetMemoryType, title, summaryText, bodyMarkdown, temporalSubjectKey, confidenceLabel.',
].join(' ');

interface ConsolidationCandidateOutput {
    targetMemoryType: 'semantic' | 'procedural';
    title: string;
    bodyMarkdown: string;
    summaryText?: string;
    temporalSubjectKey: string;
    confidenceLabel: 'low' | 'medium' | 'high';
}

interface ConsolidationCluster {
    subjectKey: string;
    scopeKind: 'thread' | 'workspace';
    memories: RuntimeMemoryRecord[];
    evidenceByMemoryId: Map<EntityId<'mem'>, MemoryEvidenceRecord[]>;
    targetMemoryTypeHint: 'semantic' | 'procedural';
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function normalizePattern(value: string): string {
    return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function truncateText(value: string, maxLength: number): string {
    const normalized = normalizeWhitespace(value);
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function tryParseJsonObject(value: string): Record<string, unknown> | null {
    const trimmed = value.trim();
    const candidates = [trimmed, trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1)].filter(
        (candidate) => candidate.startsWith('{') && candidate.endsWith('}')
    );
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            continue;
        }
    }

    return null;
}

function readPromptSection(memory: RuntimeMemoryRecord): string {
    const promptSection = memory.bodyMarkdown.match(/## Prompt\s+([\s\S]*?)(?:\n## |\s*$)/);
    return promptSection?.[1] ? truncateText(promptSection[1], 180) : '';
}

function readToolPattern(memory: RuntimeMemoryRecord): string {
    const toolSection = memory.bodyMarkdown.match(/- Tools used:([^\n]+)/);
    return toolSection?.[1] ? normalizePattern(toolSection[1]) : '';
}

function buildPatternKey(memory: RuntimeMemoryRecord): string {
    const promptPattern = normalizePattern(readPromptSection(memory));
    if (promptPattern.length > 0) {
        return `prompt::${promptPattern.slice(0, 120)}`;
    }

    const toolPattern = readToolPattern(memory);
    return toolPattern.length > 0 ? `tool::${toolPattern}` : `title::${normalizePattern(memory.title).slice(0, 120)}`;
}

function inferTargetMemoryType(cluster: RuntimeMemoryRecord[]): 'semantic' | 'procedural' {
    const hasPreferenceLanguage = cluster.some((memory) =>
        normalizePattern(`${memory.title} ${memory.summaryText ?? ''} ${memory.bodyMarkdown}`).match(
            /\b(always|prefer|workflow|steps|instruction|procedure|use |should |avoid )\b/
        )
    );
    return hasPreferenceLanguage ? 'procedural' : 'semantic';
}

function buildSourceDigest(input: { candidate: ConsolidationCandidateOutput; memoryIds: EntityId<'mem'>[] }): string {
    return createHash('sha256')
        .update(
            JSON.stringify({
                targetMemoryType: input.candidate.targetMemoryType,
                title: normalizeWhitespace(input.candidate.title),
                summaryText: normalizeWhitespace(input.candidate.summaryText ?? ''),
                bodyMarkdown: normalizeWhitespace(input.candidate.bodyMarkdown),
                temporalSubjectKey: normalizeWhitespace(input.candidate.temporalSubjectKey),
                memoryIds: [...input.memoryIds].sort(),
            })
        )
        .digest('hex');
}

function buildEvidenceCreateInputs(cluster: ConsolidationCluster): MemoryEvidenceCreateInput[] {
    const evidence: MemoryEvidenceCreateInput[] = [];
    for (const memory of cluster.memories) {
        const records = (cluster.evidenceByMemoryId.get(memory.id) ?? []).slice(0, MAX_SOURCE_EVIDENCE_PER_MEMORY);
        for (const record of records) {
            evidence.push({
                kind: record.kind,
                label: `${memory.title}: ${record.label}`,
                ...(record.excerptText ? { excerptText: truncateText(record.excerptText, 180) } : {}),
                ...(record.sourceRunId ? { sourceRunId: record.sourceRunId } : {}),
                ...(record.sourceMessageId ? { sourceMessageId: record.sourceMessageId } : {}),
                ...(record.sourceMessagePartId ? { sourceMessagePartId: record.sourceMessagePartId } : {}),
                metadata: {
                    ...record.metadata,
                    sourceMemoryId: memory.id,
                    sourceMemoryTitle: memory.title,
                },
            });
        }
    }

    return evidence;
}

function buildConsolidationMessages(cluster: ConsolidationCluster): RunContextMessage[] {
    const evidenceLines = cluster.memories.flatMap((memory) => {
        const evidenceRecords = (cluster.evidenceByMemoryId.get(memory.id) ?? []).slice(0, MAX_SOURCE_EVIDENCE_PER_MEMORY);
        return [
            `Memory: ${memory.title}`,
            `Scope: ${memory.scopeKind}`,
            `Summary: ${memory.summaryText ?? '_none_'}`,
            `Prompt pattern: ${readPromptSection(memory) || '_none_'}`,
            `Tool pattern: ${readToolPattern(memory) || '_none_'}`,
            ...evidenceRecords.map(
                (record) => `Evidence: ${record.label}${record.excerptText ? ` | ${truncateText(record.excerptText, 160)}` : ''}`
            ),
        ].join('\n');
    });

    return [
        createTextMessage('system', CONSOLIDATION_SYSTEM_PROMPT),
        createTextMessage(
            'user',
            [
                `Resolved subject key: ${cluster.subjectKey}`,
                `Preferred target type hint: ${cluster.targetMemoryTypeHint}`,
                'Clustered episodic memories:',
                evidenceLines.join('\n\n---\n\n'),
            ].join('\n\n')
        ),
    ];
}

function parseConsolidationOutput(rawText: string): ConsolidationCandidateOutput | null {
    const parsed = tryParseJsonObject(rawText);
    if (!parsed) {
        return null;
    }

    const targetMemoryType = parsed['targetMemoryType'];
    const title = parsed['title'];
    const bodyMarkdown = parsed['bodyMarkdown'];
    const summaryText = parsed['summaryText'];
    const temporalSubjectKey = parsed['temporalSubjectKey'];
    const confidenceLabel = parsed['confidenceLabel'];
    if (
        (targetMemoryType !== 'semantic' && targetMemoryType !== 'procedural') ||
        typeof title !== 'string' ||
        typeof bodyMarkdown !== 'string' ||
        typeof temporalSubjectKey !== 'string' ||
        (confidenceLabel !== 'low' && confidenceLabel !== 'medium' && confidenceLabel !== 'high')
    ) {
        return null;
    }

    return {
        targetMemoryType,
        title: title.trim(),
        bodyMarkdown: bodyMarkdown.trim(),
        ...(typeof summaryText === 'string' && summaryText.trim().length > 0 ? { summaryText: summaryText.trim() } : {}),
        temporalSubjectKey: temporalSubjectKey.trim(),
        confidenceLabel,
    };
}

export class MemoryConsolidationService {
    private async collectCandidateWindow(memory: RuntimeMemoryRecord): Promise<RuntimeMemoryRecord[]> {
        const episodicRunMemories = (await memoryStore.listByProfile({
            profileId: memory.profileId,
            memoryType: 'episodic',
            scopeKind: 'run',
        })).filter((candidate) => candidate.state === 'active' || candidate.state === 'superseded');

        const threadCandidates = memory.threadId
            ? episodicRunMemories
                  .filter((candidate) => candidate.threadId === memory.threadId)
                  .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
                  .slice(0, MAX_CLUSTER_MEMORIES)
            : [];
        if (threadCandidates.length >= 2) {
            return threadCandidates;
        }

        if (!memory.workspaceFingerprint) {
            return threadCandidates;
        }

        const workspaceCandidates = episodicRunMemories
            .filter((candidate) => candidate.workspaceFingerprint === memory.workspaceFingerprint)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .slice(0, MAX_CLUSTER_MEMORIES);

        return workspaceCandidates;
    }

    private async buildCluster(memory: RuntimeMemoryRecord): Promise<ConsolidationCluster | null> {
        const candidateWindow = await this.collectCandidateWindow(memory);
        if (candidateWindow.length < 2) {
            return null;
        }

        const evidenceRecords = await memoryEvidenceStore.listByMemoryIds(
            memory.profileId,
            candidateWindow.map((candidate) => candidate.id)
        );
        const evidenceByMemoryId = new Map<EntityId<'mem'>, MemoryEvidenceRecord[]>();
        for (const evidenceRecord of evidenceRecords) {
            evidenceByMemoryId.set(evidenceRecord.memoryId, [
                ...(evidenceByMemoryId.get(evidenceRecord.memoryId) ?? []),
                evidenceRecord,
            ]);
        }

        const groupedByKey = new Map<string, RuntimeMemoryRecord[]>();
        for (const candidate of candidateWindow) {
            const groupKey = candidate.temporalSubjectKey
                ? `subject::${candidate.temporalSubjectKey}`
                : `pattern::${buildPatternKey(candidate)}`;
            groupedByKey.set(groupKey, [...(groupedByKey.get(groupKey) ?? []), candidate]);
        }

        const bestCluster = [...groupedByKey.entries()]
            .map(([groupKey, memories]) => ({
                groupKey,
                memories,
                evidenceCount: memories.reduce(
                    (total, candidate) => total + (evidenceByMemoryId.get(candidate.id)?.length ?? 0),
                    0
                ),
            }))
            .filter((cluster) => cluster.memories.length >= 2 && cluster.evidenceCount >= MIN_CLUSTER_EVIDENCE_COUNT)
            .sort((left, right) => {
                if (left.memories.length !== right.memories.length) {
                    return right.memories.length - left.memories.length;
                }
                if (left.evidenceCount !== right.evidenceCount) {
                    return right.evidenceCount - left.evidenceCount;
                }
                return right.memories[0]!.updatedAt.localeCompare(left.memories[0]!.updatedAt);
            })[0];

        if (!bestCluster) {
            return null;
        }

        const scopeKind =
            bestCluster.memories.every((candidate) => candidate.threadId && candidate.threadId === memory.threadId) &&
            memory.threadId
                ? 'thread'
                : 'workspace';

        const subjectKey = bestCluster.groupKey.startsWith('subject::')
            ? bestCluster.groupKey.slice('subject::'.length)
            : bestCluster.groupKey;

        return {
            subjectKey,
            scopeKind,
            memories: bestCluster.memories.slice(0, MAX_CLUSTER_MEMORIES),
            evidenceByMemoryId,
            targetMemoryTypeHint: inferTargetMemoryType(bestCluster.memories),
        };
    }

    private async synthesizeCluster(cluster: ConsolidationCluster): Promise<ConsolidationCandidateOutput | null> {
        const utilityPreference = await utilityModelService.getUtilityModelPreference(cluster.memories[0]!.profileId);
        if (!utilityPreference.selection) {
            return null;
        }

        const generated = await generatePlainTextFromMessages({
            profileId: cluster.memories[0]!.profileId,
            providerId: utilityPreference.selection.providerId,
            modelId: utilityPreference.selection.modelId,
            messages: buildConsolidationMessages(cluster),
            timeoutMs: 20_000,
        });
        if (generated.isErr()) {
            return null;
        }

        return parseConsolidationOutput(generated.value);
    }

    private async findExistingConsolidatedMemory(input: {
        profileId: string;
        temporalSubjectKey: string;
        targetMemoryType: 'semantic' | 'procedural';
        scopeKind: 'thread' | 'workspace';
        threadId?: EntityId<'thr'>;
        workspaceFingerprint?: string;
    }): Promise<RuntimeMemoryRecord | null> {
        const candidates = await memoryStore.listByProfile({
            profileId: input.profileId,
            memoryType: input.targetMemoryType,
            scopeKind: input.scopeKind,
            state: 'active',
            ...(input.scopeKind === 'thread' && input.threadId ? { threadId: input.threadId } : {}),
            ...(input.scopeKind === 'workspace' && input.workspaceFingerprint
                ? { workspaceFingerprint: input.workspaceFingerprint }
                : {}),
        });

        return (
            candidates.find(
                (candidate) =>
                    candidate.createdByKind === 'system' &&
                    candidate.temporalSubjectKey === input.temporalSubjectKey &&
                    candidate.metadata['source'] === 'memory_consolidation'
            ) ?? null
        );
    }

    async consolidateFromRunMemory(input: {
        profileId: string;
        memoryId: EntityId<'mem'>;
    }): Promise<MemoryConsolidationRecord | null> {
        const sourceMemory = await memoryStore.getById(input.profileId, input.memoryId);
        if (!sourceMemory || sourceMemory.memoryType !== 'episodic' || sourceMemory.scopeKind !== 'run') {
            return null;
        }

        const cluster = await this.buildCluster(sourceMemory);
        if (!cluster) {
            return null;
        }

        const synthesized = await this.synthesizeCluster(cluster);
        if (!synthesized || synthesized.confidenceLabel === 'low') {
            return memoryConsolidationStore.upsert({
                profileId: input.profileId,
                subjectKey: cluster.subjectKey,
                targetMemoryType: cluster.targetMemoryTypeHint,
                scopeKind: cluster.scopeKind,
                sourceConsolidation: 'episodic_pattern',
                state: 'rejected',
                candidateTitle: synthesized?.title ?? 'Rejected consolidation',
                ...(synthesized?.summaryText ? { candidateSummaryText: synthesized.summaryText } : {}),
                candidateBodyMarkdown: synthesized?.bodyMarkdown ?? 'Low-confidence consolidation candidate.',
                evidenceMemoryIds: cluster.memories.map((memory) => memory.id),
                sourceDigest: synthesized
                    ? buildSourceDigest({
                          candidate: synthesized,
                          memoryIds: cluster.memories.map((memory) => memory.id),
                      })
                    : createHash('sha256').update(cluster.memories.map((memory) => memory.id).join('|')).digest('hex'),
            });
        }

        const sourceDigest = buildSourceDigest({
            candidate: synthesized,
            memoryIds: cluster.memories.map((memory) => memory.id),
        });
        const latestRecord = await memoryConsolidationStore.getLatestBySubject({
            profileId: input.profileId,
            subjectKey: synthesized.temporalSubjectKey || cluster.subjectKey,
            targetMemoryType: synthesized.targetMemoryType,
            scopeKind: cluster.scopeKind,
        });
        if (latestRecord?.sourceDigest === sourceDigest && latestRecord.materializedMemoryId) {
            return memoryConsolidationStore.upsert({
                profileId: input.profileId,
                subjectKey: synthesized.temporalSubjectKey || cluster.subjectKey,
                targetMemoryType: synthesized.targetMemoryType,
                scopeKind: cluster.scopeKind,
                sourceConsolidation: 'episodic_pattern',
                state: 'materialized',
                candidateTitle: synthesized.title,
                ...(synthesized.summaryText ? { candidateSummaryText: synthesized.summaryText } : {}),
                candidateBodyMarkdown: synthesized.bodyMarkdown,
                evidenceMemoryIds: cluster.memories.map((memory) => memory.id),
                materializedMemoryId: latestRecord.materializedMemoryId,
                sourceDigest,
            });
        }

        const evidence = buildEvidenceCreateInputs(cluster);
        const existingConsolidatedMemory = await this.findExistingConsolidatedMemory({
            profileId: input.profileId,
            temporalSubjectKey: synthesized.temporalSubjectKey || cluster.subjectKey,
            targetMemoryType: synthesized.targetMemoryType,
            scopeKind: cluster.scopeKind,
            ...(cluster.scopeKind === 'thread' ? { threadId: sourceMemory.threadId } : {}),
            ...(cluster.scopeKind === 'workspace' ? { workspaceFingerprint: sourceMemory.workspaceFingerprint } : {}),
        });
        const placeholderRecord = await memoryConsolidationStore.upsert({
            profileId: input.profileId,
            subjectKey: synthesized.temporalSubjectKey || cluster.subjectKey,
            targetMemoryType: synthesized.targetMemoryType,
            scopeKind: cluster.scopeKind,
            sourceConsolidation: 'episodic_pattern',
            state: 'candidate',
            candidateTitle: synthesized.title,
            ...(synthesized.summaryText ? { candidateSummaryText: synthesized.summaryText } : {}),
            candidateBodyMarkdown: synthesized.bodyMarkdown,
            evidenceMemoryIds: cluster.memories.map((memory) => memory.id),
            sourceDigest,
        });

        const metadata = {
            source: 'memory_consolidation',
            sourceConsolidationId: placeholderRecord.id,
            sourceDigest,
            clusterMemoryIds: cluster.memories.map((memory) => memory.id),
            targetMemoryType: synthesized.targetMemoryType,
        } satisfies Record<string, unknown>;

        let materializedMemory: RuntimeMemoryRecord | null = null;
        if (existingConsolidatedMemory) {
            const superseded = await memoryService.supersedeMemory({
                profileId: input.profileId,
                memoryId: existingConsolidatedMemory.id,
                createdByKind: 'system',
                title: synthesized.title,
                bodyMarkdown: synthesized.bodyMarkdown,
                ...(synthesized.summaryText ? { summaryText: synthesized.summaryText } : {}),
                metadata,
                revisionReason: 'refinement',
                evidence,
            });
            if (superseded.isErr()) {
                return null;
            }
            materializedMemory = superseded.value.replacement;
        } else {
            const created = await memoryService.createMemory({
                profileId: input.profileId,
                memoryType: synthesized.targetMemoryType,
                scopeKind: cluster.scopeKind,
                createdByKind: 'system',
                title: synthesized.title,
                bodyMarkdown: synthesized.bodyMarkdown,
                ...(synthesized.summaryText ? { summaryText: synthesized.summaryText } : {}),
                metadata,
                ...(cluster.scopeKind === 'thread' && sourceMemory.threadId ? { threadId: sourceMemory.threadId } : {}),
                ...(cluster.scopeKind === 'workspace' && sourceMemory.workspaceFingerprint
                    ? { workspaceFingerprint: sourceMemory.workspaceFingerprint }
                    : {}),
                temporalSubjectKey: synthesized.temporalSubjectKey || cluster.subjectKey,
                evidence,
            });
            if (created.isErr()) {
                return null;
            }
            materializedMemory = created.value;
        }

        if (!materializedMemory) {
            return null;
        }

        return memoryConsolidationStore.upsert({
            profileId: input.profileId,
            subjectKey: synthesized.temporalSubjectKey || cluster.subjectKey,
            targetMemoryType: synthesized.targetMemoryType,
            scopeKind: cluster.scopeKind,
            sourceConsolidation: 'episodic_pattern',
            state: 'materialized',
            candidateTitle: synthesized.title,
            ...(synthesized.summaryText ? { candidateSummaryText: synthesized.summaryText } : {}),
            candidateBodyMarkdown: synthesized.bodyMarkdown,
            evidenceMemoryIds: cluster.memories.map((memory) => memory.id),
            materializedMemoryId: materializedMemory.id,
            sourceDigest,
        });
    }

    async consolidateFromRunMemorySafely(input: { profileId: string; memoryId: EntityId<'mem'> }): Promise<void> {
        try {
            await this.consolidateFromRunMemory(input);
        } catch (error) {
            appLog.warn({
                tag: 'memory.consolidation',
                message: 'Memory consolidation failed softly after finished-run capture.',
                profileId: input.profileId,
                memoryId: input.memoryId,
                detail: error instanceof Error ? error.message : 'Unknown error.',
            });
        }
    }
}

export const memoryConsolidationService = new MemoryConsolidationService();
