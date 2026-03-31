import { createTextMessage } from '@/app/backend/runtime/services/runExecution/contextParts';
import type { RankedMemoryRetrievalDecision } from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';

import type { MemoryRecord } from '@/app/backend/persistence/types';
import type { RetrievedMemoryRecord } from '@/app/backend/runtime/contracts';

export const MAX_RETRIEVED_MEMORY_TEXT_LENGTH = 3_500;
export const MAX_SELECTED_RETRIEVED_MEMORY_RECORDS = 4;
export const MEMORY_ENTRY_TEXT_LIMIT = 900;
const MAX_EVIDENCE_LINES_PER_MEMORY = 2;
const MAX_EVIDENCE_EXCERPT_LENGTH = 180;
const ASSUMED_EVIDENCE_LINE_LENGTH = 96;
const MINIMUM_ENTRY_BLOCK_LENGTH = 120;

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function formatMemoryBody(memory: MemoryRecord): string {
    const normalizedSummary = normalizeWhitespace(memory.summaryText ?? '');
    const normalizedBody = normalizeWhitespace(memory.bodyMarkdown);
    const candidate = normalizedSummary.length > 0 ? `${normalizedSummary}\n\n${normalizedBody}` : normalizedBody;
    const boundedLength = MEMORY_ENTRY_TEXT_LIMIT;
    if (candidate.length <= boundedLength) {
        return candidate;
    }
    if (boundedLength <= 3) {
        return candidate.slice(0, boundedLength);
    }

    return `${candidate.slice(0, boundedLength - 3)}...`;
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

function formatEvidenceExcerpt(value: string): string {
    const normalized = normalizeWhitespace(value);
    if (normalized.length <= MAX_EVIDENCE_EXCERPT_LENGTH) {
        return normalized;
    }

    return `${normalized.slice(0, MAX_EVIDENCE_EXCERPT_LENGTH - 3)}...`;
}

function buildRetrievedMemoryEntryText(record: RetrievedMemoryRecord, memory: MemoryRecord): string {
    const excerpt = formatMemoryBody(memory);
    return [
        `${String(record.order)}. ${memory.title}`,
        `Type: ${memory.memoryType}`,
        `Scope: ${memory.scopeKind}`,
        `Match reason: ${record.matchReason}`,
        `Provenance: ${describeMemoryProvenance(memory)}`,
        ...record.supportingEvidence.slice(0, MAX_EVIDENCE_LINES_PER_MEMORY).map((evidence) => {
            const excerpt = evidence.excerptText ? ` - ${formatEvidenceExcerpt(evidence.excerptText)}` : '';
            return `Evidence: ${evidence.label}${excerpt}`;
        }),
        ...(record.annotations && record.annotations.length > 0 ? [`Notes: ${record.annotations.join(' ')}`] : []),
        'Details:',
        excerpt,
        '',
    ].join('\n');
}

export function estimateRetrievedMemoryEntryLength(decision: RankedMemoryRetrievalDecision): number {
    const estimatedBodyLength = Math.min(
        MEMORY_ENTRY_TEXT_LIMIT,
        normalizeWhitespace([decision.memory.summaryText ?? '', decision.memory.bodyMarkdown].join(' ')).length
    );
    return [
        decision.memory.title.length + 6,
        `Type: ${decision.memory.memoryType}`.length,
        `Scope: ${decision.memory.scopeKind}`.length,
        `Match reason: ${decision.matchReason}`.length,
        `Provenance: ${describeMemoryProvenance(decision.memory)}`.length,
        Math.min(MAX_EVIDENCE_LINES_PER_MEMORY, 2) * ASSUMED_EVIDENCE_LINE_LENGTH,
        decision.annotations && decision.annotations.length > 0 ? `Notes: ${decision.annotations.join(' ')}`.length : 0,
        'Details:'.length,
        estimatedBodyLength,
        8,
    ].reduce((total, value) => total + value, 0);
}

export function canFitRetrievedMemoryEntry(currentTextLength: number, estimatedEntryLength: number): boolean {
    if (estimatedEntryLength < MINIMUM_ENTRY_BLOCK_LENGTH) {
        return false;
    }

    return currentTextLength + estimatedEntryLength <= MAX_RETRIEVED_MEMORY_TEXT_LENGTH;
}

export function formatRetrievedMemoryMessage(
    records: RetrievedMemoryRecord[],
    memoriesById: Map<string, MemoryRecord>
): {
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
        if (remainingBudget < MINIMUM_ENTRY_BLOCK_LENGTH) {
            break;
        }

        const entryText = buildRetrievedMemoryEntryText(record, memory);
        if (currentText.length + entryText.length > MAX_RETRIEVED_MEMORY_TEXT_LENGTH) {
            continue;
        }

        lines.push(entryText);
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
