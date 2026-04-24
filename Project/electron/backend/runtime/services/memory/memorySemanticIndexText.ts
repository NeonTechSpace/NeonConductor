import { createHash } from 'node:crypto';

import type { MemoryRecord } from '@/app/backend/persistence/types';

function stripMarkdown(value: string): string {
    return value
        .replace(/\r\n?/g, '\n')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^>\s?/gm, '')
        .replace(/^[-*+]\s+/gm, '')
        .replace(/^\d+\.\s+/gm, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/[*_~]+/g, ' ')
        .replace(/\|/g, ' ');
}

export function normalizeSemanticIndexText(value: string): string {
    return stripMarkdown(value).replace(/\s+/g, ' ').trim();
}

export function buildMemorySemanticIndexedText(memory: Pick<MemoryRecord, 'title' | 'summaryText' | 'bodyMarkdown'>): string {
    return normalizeSemanticIndexText([memory.title, memory.summaryText ?? '', memory.bodyMarkdown].join('\n\n'));
}

export function createMemorySemanticSourceDigest(indexedText: string): string {
    return createHash('sha256').update(indexedText).digest('hex');
}

export function normalizeEmbeddingVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
        return [];
    }

    return vector.map((value) => value / magnitude);
}

export function computeCosineSimilarity(left: number[], right: number[]): number {
    if (left.length === 0 || right.length === 0 || left.length !== right.length) {
        return -1;
    }

    let total = 0;
    for (let index = 0; index < left.length; index += 1) {
        const leftValue = left[index];
        const rightValue = right[index];
        if (leftValue === undefined || rightValue === undefined) {
            return -1;
        }
        total += leftValue * rightValue;
    }

    return total;
}
