import type { MemoryRecord } from '@/app/backend/persistence/types';
import type { EntityId, RetrievedMemoryMatchReason, TopLevelTab } from '@/app/backend/runtime/contracts';

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

export function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export function normalizeSearchText(value: string): string {
    return normalizeWhitespace(value).toLowerCase();
}

export function uniquePromptTerms(prompt: string): string[] {
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

export function collectMetadataStrings(value: unknown): string[] {
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

export function scopePriority(scopeKind: MemoryRecord['scopeKind']): number {
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

export function isExactScopeMatch(input: {
    memory: MemoryRecord;
    runId?: EntityId<'run'>;
    threadIds?: EntityId<'thr'>[];
    workspaceFingerprint?: string;
}): RetrievedMemoryMatchReason | null {
    if (input.runId && input.memory.runId === input.runId) {
        return 'exact_run';
    }
    if (input.threadIds?.some((threadId) => input.memory.threadId === threadId)) {
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

export function matchesStructuredContext(input: {
    memory: MemoryRecord;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
    threadIds?: EntityId<'thr'>[];
    runId?: EntityId<'run'>;
}): boolean {
    return countStructuredContextHits(input) > 0;
}

export function countStructuredContextHits(input: {
    memory: MemoryRecord;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
    threadIds?: EntityId<'thr'>[];
    runId?: EntityId<'run'>;
}): number {
    const contextualNeedles = [
        input.topLevelTab,
        input.modeKey,
        input.workspaceFingerprint,
        ...(input.threadIds ?? []),
        input.runId,
    ]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map((value) => normalizeSearchText(value));
    if (contextualNeedles.length === 0) {
        return 0;
    }

    const title = normalizeSearchText(input.memory.title);
    const summary = normalizeSearchText(input.memory.summaryText ?? '');
    const metadataStrings = collectMetadataStrings(input.memory.metadata);

    return contextualNeedles.filter(
        (needle) =>
            title.includes(needle) || summary.includes(needle) || metadataStrings.some((value) => value === needle)
    ).length;
}

export function countPromptTermMatches(memory: MemoryRecord, promptTerms: string[]): number {
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
