import { memoryStore, threadStore } from '@/app/backend/persistence/stores';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import type { MemoryRecord } from '@/app/backend/persistence/types';
import type {
    EntityId,
    RetrievedMemoryMatchReason,
    RetrievedMemoryRecord,
    RetrievedMemorySummary,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import { advancedMemoryDerivationService } from '@/app/backend/runtime/services/memory/advancedDerivation';
import { createTextMessage } from '@/app/backend/runtime/services/runExecution/contextParts';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';

const MAX_RETRIEVED_MEMORY_RECORDS = 6;
const MAX_RETRIEVED_MEMORY_TEXT_LENGTH = 6_000;
const MEMORY_ENTRY_TEXT_LIMIT = 1_000;
const PROMPT_TERM_MIN_LENGTH = 4;
const PROMPT_STOP_WORDS = new Set([
    'about',
    'after',
    'again',
    'agent',
    'also',
    'because',
    'before',
    'between',
    'chat',
    'code',
    'debug',
    'from',
    'have',
    'into',
    'just',
    'mode',
    'more',
    'orchestrator',
    'over',
    'that',
    'their',
    'them',
    'then',
    'there',
    'these',
    'this',
    'those',
    'what',
    'when',
    'where',
    'which',
    'while',
    'with',
    'would',
]);

interface RetrieveRelevantMemoryInput {
    profileId: string;
    sessionId: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
    modeKey: string;
    prompt: string;
    workspaceFingerprint?: string;
    runId?: EntityId<'run'>;
}

interface RetrievedMemoryCandidate {
    memory: MemoryRecord;
    matchReason: RetrievedMemoryMatchReason;
    priority: number;
    sourceMemoryId?: EntityId<'mem'>;
    annotations?: string[];
}

interface RetrieveRelevantMemoryResult {
    summary?: RetrievedMemorySummary;
    messages: RunContextMessage[];
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeSearchText(value: string): string {
    return normalizeWhitespace(value).toLowerCase();
}

function uniquePromptTerms(prompt: string): string[] {
    const normalizedPrompt = normalizeSearchText(prompt);
    if (normalizedPrompt.length === 0) {
        return [];
    }

    return Array.from(
        new Set(
            normalizedPrompt
                .split(/[^a-z0-9_/-]+/i)
                .map((value) => value.trim())
                .filter((value) => value.length >= PROMPT_TERM_MIN_LENGTH)
                .filter((value) => !PROMPT_STOP_WORDS.has(value))
        )
    );
}

function collectMetadataStrings(value: unknown): string[] {
    if (typeof value === 'string') {
        const normalized = normalizeSearchText(value);
        return normalized.length > 0 ? [normalized] : [];
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return [String(value).toLowerCase()];
    }
    if (Array.isArray(value)) {
        return value.flatMap((item) => collectMetadataStrings(item));
    }
    if (value && typeof value === 'object') {
        return Object.values(value).flatMap((item) => collectMetadataStrings(item));
    }

    return [];
}

function scopePriority(scopeKind: MemoryRecord['scopeKind']): number {
    switch (scopeKind) {
        case 'run':
            return 0;
        case 'thread':
            return 1;
        case 'workspace':
            return 2;
        case 'global':
            return 3;
    }
}

function isExactScopeMatch(input: {
    memory: MemoryRecord;
    runId?: EntityId<'run'>;
    threadId?: EntityId<'thr'>;
    workspaceFingerprint?: string;
}): RetrievedMemoryMatchReason | null {
    if (input.runId && input.memory.runId === input.runId) {
        return 'exact_run';
    }
    if (input.threadId && input.memory.threadId === input.threadId) {
        return 'exact_thread';
    }
    if (input.workspaceFingerprint && input.memory.workspaceFingerprint === input.workspaceFingerprint) {
        return 'exact_workspace';
    }
    if (input.memory.scopeKind === 'global') {
        return 'exact_global';
    }

    return null;
}

function matchesStructuredContext(input: {
    memory: MemoryRecord;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
}): boolean {
    const contextualNeedles = [
        input.topLevelTab,
        input.modeKey,
        input.workspaceFingerprint,
        input.threadId,
        input.runId,
    ]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map((value) => normalizeSearchText(value));
    if (contextualNeedles.length === 0) {
        return false;
    }

    const title = normalizeSearchText(input.memory.title);
    const summary = normalizeSearchText(input.memory.summaryText ?? '');
    const metadataStrings = collectMetadataStrings(input.memory.metadata);

    return contextualNeedles.some(
        (needle) => title.includes(needle) || summary.includes(needle) || metadataStrings.some((value) => value === needle)
    );
}

function countPromptTermMatches(memory: MemoryRecord, promptTerms: string[]): number {
    if (promptTerms.length === 0) {
        return 0;
    }

    const haystacks = [
        normalizeSearchText(memory.title),
        normalizeSearchText(memory.summaryText ?? ''),
        normalizeSearchText(memory.bodyMarkdown),
    ].filter((value) => value.length > 0);

    return promptTerms.filter((term) => haystacks.some((haystack) => haystack.includes(term))).length;
}

function describeMemoryProvenance(memory: MemoryRecord): string {
    const segments = [
        `scope=${memory.scopeKind}`,
        ...(memory.runId ? [`run=${memory.runId}`] : []),
        ...(memory.threadId ? [`thread=${memory.threadId}`] : []),
        ...(memory.workspaceFingerprint ? [`workspace=${memory.workspaceFingerprint}`] : []),
    ];

    return segments.join(', ');
}

function formatMemoryBody(memory: MemoryRecord, remainingBudget: number): string {
    const normalizedSummary = normalizeWhitespace(memory.summaryText ?? '');
    const normalizedBody = normalizeWhitespace(memory.bodyMarkdown);
    const candidate = normalizedSummary.length > 0 ? `${normalizedSummary}\n\n${normalizedBody}` : normalizedBody;
    const boundedLength = Math.max(0, Math.min(MEMORY_ENTRY_TEXT_LIMIT, remainingBudget));
    if (candidate.length <= boundedLength) {
        return candidate;
    }
    if (boundedLength <= 3) {
        return candidate.slice(0, boundedLength);
    }

    return `${candidate.slice(0, boundedLength - 3)}...`;
}

function buildRetrievedMemoryMessage(records: RetrievedMemoryRecord[], memoriesById: Map<string, MemoryRecord>): {
    message: RunContextMessage;
    injectedTextLength: number;
} | null {
    const lines: string[] = ['Retrieved memory', ''];

    for (const record of records) {
        const memory = memoriesById.get(record.memoryId);
        if (!memory) {
            continue;
        }

        const currentText = lines.join('\n');
        const remainingBudget = MAX_RETRIEVED_MEMORY_TEXT_LENGTH - currentText.length;
        if (remainingBudget <= 0) {
            break;
        }

        const excerpt = formatMemoryBody(memory, remainingBudget);
        lines.push(
            `${record.order}. ${memory.title}`,
            `Type: ${memory.memoryType}`,
            `Scope: ${memory.scopeKind}`,
            `Match reason: ${record.matchReason}`,
            `Provenance: ${describeMemoryProvenance(memory)}`,
            ...(record.annotations && record.annotations.length > 0 ? [`Notes: ${record.annotations.join(' ')}`] : []),
            'Details:',
            excerpt,
            ''
        );
    }

    const text = lines.join('\n').trim();
    if (text === 'Retrieved memory') {
        return null;
    }

    return {
        message: createTextMessage('system', text),
        injectedTextLength: text.length,
    };
}

export class MemoryRetrievalService {
    async retrieveRelevantMemory(input: RetrieveRelevantMemoryInput): Promise<RetrieveRelevantMemoryResult> {
        const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
        const threadId = sessionThread
            ? parseEntityId(sessionThread.thread.id, 'threads.id', 'thr')
            : undefined;
        const workspaceFingerprint = input.workspaceFingerprint ?? sessionThread?.workspaceFingerprint;
        const promptTerms = uniquePromptTerms(input.prompt);
        const activeMemories = await memoryStore.listByProfile({
            profileId: input.profileId,
            state: 'active',
        });

        const candidates: RetrievedMemoryCandidate[] = [];
        for (const memory of activeMemories) {
            const exactMatchReason = isExactScopeMatch({
                memory,
                ...(input.runId ? { runId: input.runId } : {}),
                ...(threadId ? { threadId } : {}),
                ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
            });
            if (exactMatchReason) {
                candidates.push({
                    memory,
                    matchReason: exactMatchReason,
                    priority: scopePriority(memory.scopeKind),
                });
                continue;
            }

            if (
                matchesStructuredContext({
                    memory,
                    topLevelTab: input.topLevelTab,
                    modeKey: input.modeKey,
                    ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
                    ...(threadId ? { threadId } : {}),
                    ...(input.runId ? { runId: input.runId } : {}),
                })
            ) {
                candidates.push({
                    memory,
                    matchReason: 'structured',
                    priority: 10 + scopePriority(memory.scopeKind),
                });
            }
        }

        const baseCandidates = candidates
            .sort((left, right) => {
                if (left.priority !== right.priority) {
                    return left.priority - right.priority;
                }
                if (left.memory.updatedAt !== right.memory.updatedAt) {
                    return right.memory.updatedAt.localeCompare(left.memory.updatedAt);
                }

                return left.memory.id.localeCompare(right.memory.id);
            });
        const baseMemoryIds = Array.from(new Set(baseCandidates.map((candidate) => candidate.memory.id)));
        const derivedExpansion = await advancedMemoryDerivationService.expandMatchedMemories({
            profileId: input.profileId,
            prompt: input.prompt,
            matchedMemories: baseCandidates.map((candidate) => candidate.memory),
        });
        const derivedSummaryById = derivedExpansion.isOk() ? derivedExpansion.value.summaries : new Map();
        const candidateMemoryIds = new Set(baseMemoryIds);
        const combinedCandidates: RetrievedMemoryCandidate[] = [
            ...baseCandidates.map((candidate) => ({
                ...candidate,
                ...(derivedSummaryById.get(candidate.memory.id)
                    ? { annotations: derivedSummaryById.get(candidate.memory.id)?.hasTemporalHistory ? ['Current fact has temporal history.'] : [] }
                    : {}),
            })),
        ];

        if (derivedExpansion.isOk()) {
            for (const derivedCandidate of derivedExpansion.value.candidates) {
                if (candidateMemoryIds.has(derivedCandidate.memory.id)) {
                    continue;
                }

                combinedCandidates.push({
                    memory: derivedCandidate.memory,
                    matchReason: derivedCandidate.matchReason,
                    priority: derivedCandidate.matchReason === 'derived_temporal' ? 15 : 16,
                    sourceMemoryId: derivedCandidate.sourceMemoryId,
                    annotations: derivedCandidate.annotations,
                });
                candidateMemoryIds.add(derivedCandidate.memory.id);
            }
        }

        for (const memory of activeMemories) {
            if (candidateMemoryIds.has(memory.id)) {
                continue;
            }

            const promptMatchCount = countPromptTermMatches(memory, promptTerms);
            if (promptMatchCount <= 0) {
                continue;
            }

            combinedCandidates.push({
                memory,
                matchReason: 'prompt',
                priority: 20 + scopePriority(memory.scopeKind) * 10 - promptMatchCount,
            });
        }

        const orderedCandidates = combinedCandidates
            .sort((left, right) => {
                if (left.priority !== right.priority) {
                    return left.priority - right.priority;
                }
                if (left.memory.updatedAt !== right.memory.updatedAt) {
                    return right.memory.updatedAt.localeCompare(left.memory.updatedAt);
                }

                return left.memory.id.localeCompare(right.memory.id);
            })
            .slice(0, MAX_RETRIEVED_MEMORY_RECORDS);

        if (orderedCandidates.length === 0) {
            return {
                messages: [],
            };
        }

        const finalDerivedSummaries = await advancedMemoryDerivationService.getDerivedSummaries(
            input.profileId,
            orderedCandidates.map((candidate) => candidate.memory.id)
        );
        const finalDerivedSummaryById = finalDerivedSummaries.isOk() ? finalDerivedSummaries.value : new Map();

        const retrievedRecords: RetrievedMemoryRecord[] = orderedCandidates.map((candidate, index) => ({
            memoryId: candidate.memory.id,
            title: candidate.memory.title,
            memoryType: candidate.memory.memoryType,
            scopeKind: candidate.memory.scopeKind,
            matchReason: candidate.matchReason,
            order: index + 1,
            ...(candidate.sourceMemoryId ? { sourceMemoryId: candidate.sourceMemoryId } : {}),
            ...(candidate.annotations && candidate.annotations.length > 0 ? { annotations: candidate.annotations } : {}),
            ...(finalDerivedSummaryById.get(candidate.memory.id)
                ? { derivedSummary: finalDerivedSummaryById.get(candidate.memory.id) }
                : {}),
        }));
        const memoriesById = new Map(orderedCandidates.map((candidate) => [candidate.memory.id, candidate.memory] as const));
        const injectedMessage = buildRetrievedMemoryMessage(retrievedRecords, memoriesById);
        if (!injectedMessage) {
            return {
                messages: [],
            };
        }

        return {
            summary: {
                records: retrievedRecords,
                injectedTextLength: injectedMessage.injectedTextLength,
            },
            messages: [injectedMessage.message],
        };
    }
}

export const memoryRetrievalService = new MemoryRetrievalService();
