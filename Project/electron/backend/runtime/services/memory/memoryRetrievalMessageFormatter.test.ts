import { describe, expect, it } from 'vitest';

import type { MemoryRecord } from '@/app/backend/persistence/types';
import type { RetrievedMemoryRecord } from '@/app/backend/runtime/contracts';
import { createMemoryCanonicalBodyFromMarkdown } from '@/app/backend/runtime/services/memory/memoryCanonicalBody';
import {
    formatRetrievedMemoryMessage,
    MAX_RETRIEVED_MEMORY_TEXT_LENGTH,
} from '@/app/backend/runtime/services/memory/memoryRetrievalMessageFormatter';

function createMemory(id: string, title: string, bodyMarkdown: string): MemoryRecord {
    return {
        id: id as MemoryRecord['id'],
        profileId: 'profile_test',
        memoryType: 'semantic',
        scopeKind: 'global',
        state: 'active',
        createdByKind: 'user',
        title,
        canonicalBody: createMemoryCanonicalBodyFromMarkdown(bodyMarkdown),
        bodyMarkdown,
        metadata: {},
        createdAt: '2026-03-31T10:00:00.000Z',
        updatedAt: '2026-03-31T10:00:00.000Z',
    };
}

function createRecord(memoryId: string, order: number): RetrievedMemoryRecord {
    return {
        memoryId: memoryId as RetrievedMemoryRecord['memoryId'],
        title: `Record ${String(order)}`,
        memoryType: 'semantic',
        scopeKind: 'global',
        matchReason: 'prompt',
        order,
        supportingEvidence: [],
    };
}

describe('formatRetrievedMemoryMessage', () => {
    it('keeps injected memory under the tightened overall budget and omits trailing overflow entries', () => {
        const memories = new Map<string, MemoryRecord>();
        const records: RetrievedMemoryRecord[] = [];

        for (let index = 1; index <= 5; index += 1) {
            const memoryId = `mem_${String(index)}`;
            memories.set(memoryId, createMemory(memoryId, `Memory ${String(index)}`, 'A'.repeat(2_000)));
            records.push(createRecord(memoryId, index));
        }

        const formatted = formatRetrievedMemoryMessage(records, memories);

        expect(formatted).not.toBeNull();
        if (!formatted) {
            throw new Error('Expected formatted retrieved-memory message.');
        }

        expect(formatted.injectedTextLength).toBeLessThanOrEqual(MAX_RETRIEVED_MEMORY_TEXT_LENGTH);
        const text = JSON.stringify(formatted.message);
        expect(text.includes('Memory 1')).toBe(true);
        expect(text.includes('Memory 5')).toBe(false);
    });
});
