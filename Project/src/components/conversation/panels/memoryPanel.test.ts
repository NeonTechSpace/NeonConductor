import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const {
    projectionStatusInvalidateMock,
    scanProjectionEditsInvalidateMock,
    memoryListInvalidateMock,
    syncProjectionMutateMock,
    applyProjectionEditMutateMock,
} = vi.hoisted(() => ({
    projectionStatusInvalidateMock: vi.fn(() => Promise.resolve(undefined)),
    scanProjectionEditsInvalidateMock: vi.fn(() => Promise.resolve(undefined)),
    memoryListInvalidateMock: vi.fn(() => Promise.resolve(undefined)),
    syncProjectionMutateMock: vi.fn(),
    applyProjectionEditMutateMock: vi.fn(),
}));

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: () => ({
            memory: {
                projectionStatus: { invalidate: projectionStatusInvalidateMock },
                scanProjectionEdits: { invalidate: scanProjectionEditsInvalidateMock },
                list: { invalidate: memoryListInvalidateMock },
            },
        }),
        memory: {
            projectionStatus: {
                useQuery: () => ({
                    data: {
                        paths: {
                            globalMemoryRoot: 'C:/memory/global',
                            workspaceMemoryRoot: 'C:/workspace/.neonconductor/memory',
                        },
                        projectedMemories: [
                            {
                                memory: {
                                    id: 'mem_1',
                                    profileId: 'profile_local_default',
                                    memoryType: 'procedural',
                                    scopeKind: 'thread',
                                    state: 'active',
                                    createdByKind: 'system',
                                    title: 'Editable memory',
                                    bodyMarkdown: 'Body',
                                    metadata: {
                                        source: 'runtime_run_outcome',
                                        runStatus: 'completed',
                                        runId: 'run_1',
                                    },
                                    threadId: 'thr_1',
                                    workspaceFingerprint: 'wsf_memory',
                                    createdAt: '2026-03-18T10:00:00.000Z',
                                    updatedAt: '2026-03-18T10:00:00.000Z',
                                },
                                projectionTarget: 'workspace',
                                absolutePath: 'C:/workspace/.neonconductor/memory/procedural/thread--mem_1.md',
                                relativePath: 'procedural/thread--mem_1.md',
                                syncState: 'edited',
                                fileExists: true,
                                observedContentHash: 'hash_1',
                                fileUpdatedAt: '2026-03-18T10:05:00.000Z',
                            },
                        ],
                    },
                    isFetching: false,
                }),
            },
            scanProjectionEdits: {
                useQuery: () => ({
                    data: {
                        paths: {
                            globalMemoryRoot: 'C:/memory/global',
                            workspaceMemoryRoot: 'C:/workspace/.neonconductor/memory',
                        },
                        proposals: [
                            {
                                memory: {
                                    id: 'mem_1',
                                    profileId: 'profile_local_default',
                                    memoryType: 'procedural',
                                    scopeKind: 'thread',
                                    state: 'active',
                                    createdByKind: 'system',
                                    title: 'Editable memory',
                                    bodyMarkdown: 'Body',
                                    metadata: {
                                        source: 'runtime_run_outcome',
                                        runStatus: 'completed',
                                        runId: 'run_1',
                                    },
                                    threadId: 'thr_1',
                                    workspaceFingerprint: 'wsf_memory',
                                    createdAt: '2026-03-18T10:00:00.000Z',
                                    updatedAt: '2026-03-18T10:00:00.000Z',
                                },
                                projectionTarget: 'workspace',
                                absolutePath: 'C:/workspace/.neonconductor/memory/procedural/thread--mem_1.md',
                                relativePath: 'procedural/thread--mem_1.md',
                                observedContentHash: 'hash_1',
                                fileUpdatedAt: '2026-03-18T10:05:00.000Z',
                                reviewAction: 'update',
                                proposedState: 'active',
                                proposedTitle: 'Editable memory v2',
                                proposedBodyMarkdown: 'Updated body.',
                                proposedSummaryText: 'Updated summary',
                                proposedMetadata: {
                                    revision: 2,
                                },
                            },
                        ],
                        parseErrors: [],
                    },
                    isFetching: false,
                    refetch: vi.fn(() => Promise.resolve(undefined)),
                }),
            },
            syncProjection: {
                useMutation: () => ({
                    isPending: false,
                    mutate: syncProjectionMutateMock,
                }),
            },
            applyProjectionEdit: {
                useMutation: () => ({
                    isPending: false,
                    mutate: applyProjectionEditMutateMock,
                }),
            },
        },
    },
}));

import { MemoryPanel } from '@/web/components/conversation/panels/memoryPanel';

describe('MemoryPanel', () => {
    it('renders projection roots, projected memory status, and pending review actions', () => {
        const html = renderToStaticMarkup(
            createElement(MemoryPanel, {
                profileId: 'profile_local_default',
                topLevelTab: 'agent',
                modeKey: 'code',
                workspaceFingerprint: 'wsf_memory',
                threadId: 'thr_1',
            })
        );

        expect(html).toContain('Memory Projection');
        expect(html).toContain('C:/memory/global');
        expect(html).toContain('Editable memory');
        expect(html).toContain('system');
        expect(html).toContain('completed run');
        expect(html).toContain('Pending File Edits');
        expect(html).toContain('Editable memory v2');
        expect(html).toContain('Apply');
        expect(html).toContain('Reject');
    });
});
