import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { MemoryRecord } from '@/app/backend/persistence/types';
import { createMemoryCanonicalBodyFromMarkdown } from '@/app/backend/runtime/services/memory/memoryCanonicalBody';
import {
    buildCandidateProjection,
    isMemoryRelevant,
    resolveMemoryProjectionPaths,
    selectProjectionTarget,
    sortProjectedMemories,
} from '@/app/backend/runtime/services/memory/memoryProjectionContextResolver';

function createMemory(overrides?: Partial<MemoryRecord>): MemoryRecord {
    return {
        id: 'mem_test' as MemoryRecord['id'],
        profileId: 'profile_test',
        memoryType: 'semantic',
        scopeKind: 'workspace',
        state: 'active',
        createdByKind: 'user',
        title: 'Workspace memory',
        canonicalBody: createMemoryCanonicalBodyFromMarkdown(overrides?.bodyMarkdown ?? 'Body.'),
        bodyMarkdown: 'Body.',
        metadata: {},
        workspaceFingerprint: 'ws_test',
        createdAt: '2026-03-27T10:00:00.000Z',
        updatedAt: '2026-03-27T10:10:00.000Z',
        ...overrides,
    };
}

describe('memoryProjectionContextResolver', () => {
    it('defaults the global memory root beneath the user home directory', async () => {
        const homeDirSpy = vi.spyOn(os, 'homedir').mockReturnValue('/home/tester');

        try {
            const paths = await resolveMemoryProjectionPaths({
                profileId: 'profile_test',
            });

            expect(paths.globalMemoryRoot).toBe(path.join('/home/tester', '.neonconductor', 'memory'));
        } finally {
            homeDirSpy.mockRestore();
        }
    });

    it('selects the workspace projection target when the workspace fingerprint matches', () => {
        const memory = createMemory();
        const candidate = selectProjectionTarget(
            memory,
            {
                globalMemoryRoot: '/tmp/global',
                workspaceMemoryRoot: '/tmp/workspace',
            },
            'ws_test'
        );

        expect(candidate).toBe('workspace');

        const projection = buildCandidateProjection(
            memory,
            {
                globalMemoryRoot: '/tmp/global',
                workspaceMemoryRoot: '/tmp/workspace',
            },
            'ws_test'
        );
        expect(projection.projectionTarget).toBe('workspace');
        expect(projection.relativePath).toBe('semantic/workspace--mem_test.md');
    });

    it('keeps broader-scope relevance explicit when resolving projection scope', () => {
        const memory = createMemory();

        expect(
            isMemoryRelevant(memory, {
                workspaceFingerprint: 'ws_test',
                includeBroaderScopes: false,
            })
        ).toBe(true);
        expect(
            isMemoryRelevant(memory, {
                workspaceFingerprint: 'ws_test',
                includeBroaderScopes: true,
            })
        ).toBe(true);
    });

    it('sorts newer memories first', () => {
        const older = createMemory({
            id: 'mem_older' as MemoryRecord['id'],
            updatedAt: '2026-03-27T10:00:00.000Z',
        });
        const newer = createMemory({
            id: 'mem_newer' as MemoryRecord['id'],
            updatedAt: '2026-03-27T10:20:00.000Z',
        });

        expect(sortProjectedMemories(older, newer)).toBe(1);
        expect(sortProjectedMemories(newer, older)).toBe(-1);
    });
});
