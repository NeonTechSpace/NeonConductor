import { describe, expect, it } from 'vitest';

import type { MemoryRecord } from '@/app/backend/persistence/types';
import {
    parseMemoryProposal,
    readParsedState,
    renderProjectedMemoryFile,
} from '@/app/backend/runtime/services/memory/memoryProjectionFileCodec';
import { requireEntityId } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

function createMemory(overrides?: Partial<MemoryRecord>): MemoryRecord {
    const baseMemory: MemoryRecord = {
        id: requireEntityId('mem_test', 'mem', 'Expected memory id.'),
        profileId: 'profile_test',
        memoryType: 'procedural',
        scopeKind: 'thread',
        state: 'active',
        createdByKind: 'user',
        title: 'Original title',
        bodyMarkdown: 'Original body.',
        metadata: { source: 'manual' },
        workspaceFingerprint: 'ws_test',
        threadId: requireEntityId('thr_test', 'thr', 'Expected thread id.'),
        runId: requireEntityId('run_test', 'run', 'Expected run id.'),
        createdAt: '2026-03-27T10:00:00.000Z',
        updatedAt: '2026-03-27T10:00:00.000Z',
    };

    const memory: MemoryRecord = {
        ...baseMemory,
        ...overrides,
    };

    if (overrides && 'threadId' in overrides && overrides.threadId === undefined) {
        delete memory.threadId;
    }
    if (overrides && 'runId' in overrides && overrides.runId === undefined) {
        delete memory.runId;
    }
    if (overrides && 'workspaceFingerprint' in overrides && overrides.workspaceFingerprint === undefined) {
        delete memory.workspaceFingerprint;
    }
    if (overrides && 'summaryText' in overrides && overrides.summaryText === undefined) {
        delete memory.summaryText;
    }
    if (overrides && 'supersededByMemoryId' in overrides && overrides.supersededByMemoryId === undefined) {
        delete memory.supersededByMemoryId;
    }

    return memory;
}

describe('memoryProjectionFileCodec', () => {
    it('renders and parses projected memory files without changing canonical fields', () => {
        const memory = createMemory();
        const rendered = renderProjectedMemoryFile(memory);

        expect(rendered).toContain('id: "mem_test"');
        expect(rendered).toContain('state: "active"');
        expect(rendered).toContain('metadata: {"source":"manual"}');

        const parsed = parseMemoryProposal(memory, rendered);
        expect(parsed.title).toBe('Original title');
        expect(parsed.bodyMarkdown).toBe('Original body.');
        expect(parsed.metadata).toEqual({ source: 'manual' });
        expect(parsed.proposedState).toBe('active');
    });

    it('parses memory state enums and rejects invalid states', () => {
        expect(readParsedState({ state: 'disabled' })).toBe('disabled');
        expect(() => readParsedState({ state: 'not-a-state' })).toThrow('Invalid "state"');
    });
});
