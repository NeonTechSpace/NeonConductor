import { describe, expect, it } from 'vitest';

import { buildConversationSidebarModel } from '@/web/components/conversation/sidebar/sidebarModel';

import type { ConversationRecord, TagRecord, ThreadListRecord } from '@/app/backend/persistence/types';

const buckets: ConversationRecord[] = [
    {
        id: 'conv_1',
        profileId: 'profile_default',
        scope: 'workspace',
        workspaceFingerprint: 'ws_b',
        title: 'Workspace B',
        createdAt: '2026-03-06T10:00:00.000Z',
        updatedAt: '2026-03-06T10:00:00.000Z',
    },
    {
        id: 'conv_2',
        profileId: 'profile_default',
        scope: 'workspace',
        workspaceFingerprint: 'ws_a',
        title: 'Workspace A',
        createdAt: '2026-03-06T10:00:00.000Z',
        updatedAt: '2026-03-06T10:00:00.000Z',
    },
];

const threads: ThreadListRecord[] = [
    {
        id: 'thr_root',
        profileId: 'profile_default',
        conversationId: 'conv_1',
        title: 'Root Thread',
        topLevelTab: 'chat',
        rootThreadId: 'thr_root',
        isFavorite: true,
        executionEnvironmentMode: 'local',
        scope: 'workspace',
        workspaceFingerprint: 'ws_b',
        anchorKind: 'workspace',
        anchorId: 'ws_b',
        sessionCount: 1,
        createdAt: '2026-03-06T10:00:00.000Z',
        updatedAt: '2026-03-06T10:00:00.000Z',
    },
    {
        id: 'thr_child',
        profileId: 'profile_default',
        conversationId: 'conv_1',
        title: 'Child Thread',
        topLevelTab: 'chat',
        parentThreadId: 'thr_root',
        rootThreadId: 'thr_root',
        isFavorite: false,
        executionEnvironmentMode: 'local',
        scope: 'workspace',
        workspaceFingerprint: 'ws_b',
        anchorKind: 'workspace',
        anchorId: 'ws_b',
        sessionCount: 1,
        createdAt: '2026-03-06T10:05:00.000Z',
        updatedAt: '2026-03-06T10:05:00.000Z',
    },
];

const tags: TagRecord[] = [
    {
        id: 'tag_1',
        profileId: 'profile_default',
        label: 'Pinned',
        createdAt: '2026-03-06T10:00:00.000Z',
        updatedAt: '2026-03-06T10:00:00.000Z',
    },
];

const workspaceRoots = [
    {
        fingerprint: 'ws_a',
        label: 'Workspace A',
    },
    {
        fingerprint: 'ws_b',
        label: 'Workspace B',
    },
];

describe('buildConversationSidebarModel', () => {
    it('builds sorted workspace options and selected thread lookup', () => {
        const model = buildConversationSidebarModel({
            buckets,
            threads,
            tags,
            workspaceRoots,
            selectedThreadId: 'thr_child',
            groupView: 'workspace',
        });

        expect(model.workspaceOptions).toEqual(['ws_a', 'ws_b']);
        expect(model.selectedThread?.id).toBe('thr_child');
        expect(model.tagLabelById.get('tag_1')).toBe('Pinned');
        expect(model.workspaceGroups).toHaveLength(2);
        expect(model.workspaceGroups[0]?.label).toBe('Workspace A');
        expect(model.workspaceGroups[0]?.workspaceFingerprint).toBe('ws_a');
        expect(model.workspaceGroups[0]?.threadCount).toBe(0);
        expect(model.workspaceGroups[0]?.rows).toEqual([]);
        expect(model.workspaceGroups[1]?.label).toBe('Workspace B');
        expect(model.workspaceGroups[1]?.workspaceFingerprint).toBe('ws_b');
        expect(model.workspaceGroups[1]?.favoriteCount).toBe(1);
        expect(model.workspaceGroups[1]?.rows.map((row) => row.thread.id)).toEqual(['thr_root', 'thr_child']);
    });

    it('builds branch rows when branch view is selected', () => {
        const model = buildConversationSidebarModel({
            buckets,
            threads,
            tags,
            workspaceRoots,
            groupView: 'branch',
        });

        const populatedGroup = model.workspaceGroups.find((group) => group.workspaceFingerprint === 'ws_b');
        expect(populatedGroup?.rows.map((row) => row.depth)).toEqual([0, 1]);
    });

    it('keeps workspace root order first and appends discovered workspaces after it', () => {
        const model = buildConversationSidebarModel({
            buckets,
            threads: [
                ...threads,
                {
                    ...(threads[0] ?? (() => {
                        throw new Error('Expected base workspace thread.');
                    })()),
                    id: 'thr_workspace_c',
                    conversationId: 'conv_3',
                    workspaceFingerprint: 'ws_c',
                    anchorId: 'ws_c',
                    title: 'Workspace C thread',
                },
            ],
            tags,
            workspaceRoots,
            groupView: 'workspace',
        });

        expect(model.workspaceGroups.map((group) => group.workspaceFingerprint)).toEqual(['ws_a', 'ws_b', 'ws_c']);
        expect(model.workspaceOptions).toEqual(['ws_a', 'ws_b', 'ws_c']);
    });

    it('keeps delegated orchestrator child lanes nested in workspace view', () => {
        const model = buildConversationSidebarModel({
            buckets,
            threads: [
                {
                    ...(threads[0] ?? (() => {
                        throw new Error('Expected root orchestrator thread.');
                    })()),
                    id: 'thr_orchestrator_root',
                    title: 'Root orchestrator thread',
                    topLevelTab: 'orchestrator',
                    rootThreadId: 'thr_orchestrator_root',
                },
                {
                    ...(threads[1] ?? (() => {
                        throw new Error('Expected delegated worker child thread.');
                    })()),
                    id: 'thr_worker_child',
                    title: 'Delegated worker child',
                    topLevelTab: 'agent',
                    parentThreadId: 'thr_orchestrator_root',
                    rootThreadId: 'thr_orchestrator_root',
                    delegatedFromOrchestratorRunId: 'orch_runtime',
                },
            ],
            tags,
            workspaceRoots,
            groupView: 'workspace',
        });

        const populatedGroup = model.workspaceGroups.find((group) => group.workspaceFingerprint === 'ws_b');
        expect(populatedGroup?.rows.map((row) => row.thread.id)).toEqual(['thr_orchestrator_root', 'thr_worker_child']);
        expect(populatedGroup?.rows.map((row) => row.depth)).toEqual([0, 1]);
    });
});
