import { describe, expect, it } from 'vitest';

import { buildRunContextStrip } from '@/web/components/conversation/sessions/workspace/runContextStripModel';

import type { RunRecord, SessionSummaryRecord } from '@/app/backend/persistence/types';

import type { EntityId } from '@/shared/contracts';

function createSession(overrides: Partial<SessionSummaryRecord> = {}): SessionSummaryRecord {
    return {
        id: 'sess_default' as EntityId<'sess'>,
        profileId: 'profile_default',
        conversationId: 'conv_default',
        threadId: 'thr_default',
        kind: 'local',
        runStatus: 'completed',
        turnCount: 2,
        createdAt: '2026-03-12T09:00:00.000Z',
        updatedAt: '2026-03-12T09:00:00.000Z',
        ...overrides,
    };
}

function createRun(overrides: Partial<RunRecord> = {}): RunRecord {
    return {
        id: 'run_default' as EntityId<'run'>,
        sessionId: 'sess_default' as EntityId<'sess'>,
        profileId: 'profile_default',
        prompt: 'Prompt',
        status: 'completed',
        createdAt: '2026-03-12T09:00:00.000Z',
        updatedAt: '2026-03-12T09:30:00.000Z',
        ...overrides,
    };
}

describe('buildRunContextStrip', () => {
    it('summarizes a local workspace authority posture and selected run', () => {
        const strip = buildRunContextStrip({
            workspaceScope: {
                kind: 'workspace',
                label: 'Workspace Alpha',
                absolutePath: 'C:\\WorkspaceAlpha',
                executionEnvironmentMode: 'local',
            },
            executionPreset: 'standard',
            pendingPermissionCount: 0,
            selectedSession: createSession(),
            selectedRun: createRun(),
            selectedThreadContext: {
                threadId: 'thr_default' as EntityId<'thr'>,
                rootThreadId: 'thr_default',
                topLevelTab: 'agent',
                title: 'Main thread',
            },
        });

        expect(strip.items.map((item) => item.value)).toEqual([
            'Workspace Alpha',
            'Local workspace',
            'Standard preset',
            'Root thread',
            'completed',
        ]);
        expect(strip.items.find((item) => item.id === 'authority')?.detail).toBe('local workspace authority');
    });

    it('fails closed for detached and unresolved workspace projections', () => {
        const detached = buildRunContextStrip({
            workspaceScope: { kind: 'detached' },
            executionPreset: 'privacy',
            pendingPermissionCount: 0,
            selectedSession: undefined,
            selectedRun: undefined,
        });
        const unresolved = buildRunContextStrip({
            workspaceScope: {
                kind: 'workspace_unresolved',
                label: 'wsf_missing',
                workspaceFingerprint: 'wsf_missing',
                executionEnvironmentMode: 'new_sandbox',
            },
            executionPreset: 'standard',
            pendingPermissionCount: 0,
            selectedSession: createSession(),
            selectedRun: undefined,
        });

        expect(detached.items.find((item) => item.id === 'workspace')?.value).toBe('Detached');
        expect(detached.items.find((item) => item.id === 'execution-root')?.value).toBe('No filesystem root');
        expect(unresolved.items.find((item) => item.id === 'workspace')?.tone).toBe('attention');
        expect(unresolved.items.find((item) => item.id === 'authority')?.detail).toBe(
            'fails closed until workspace root resolves'
        );
    });

    it('prioritizes pending approvals in the authority item', () => {
        const strip = buildRunContextStrip({
            workspaceScope: {
                kind: 'workspace',
                label: 'Workspace Alpha',
                absolutePath: 'C:\\WorkspaceAlpha',
                executionEnvironmentMode: 'local',
            },
            executionPreset: 'standard',
            pendingPermissionCount: 2,
            selectedSession: createSession(),
            selectedRun: createRun(),
        });

        const authority = strip.items.find((item) => item.id === 'authority');

        expect(authority?.value).toBe('2 approvals waiting');
        expect(authority?.tone).toBe('attention');
        expect(authority?.inspectorSectionId).toBe('pending-permissions');
    });

    it('projects branched threads and scheduled sandbox worktrees without inspecting VCS status', () => {
        const strip = buildRunContextStrip({
            workspaceScope: {
                kind: 'workspace',
                label: 'Workspace Alpha',
                absolutePath: 'C:\\WorkspaceAlpha',
                executionEnvironmentMode: 'new_sandbox',
            },
            executionPreset: 'standard',
            pendingPermissionCount: 0,
            selectedSession: createSession({ runStatus: 'running' }),
            selectedRun: createRun({ status: 'running' }),
            selectedThreadContext: {
                threadId: 'thr_branch' as EntityId<'thr'>,
                rootThreadId: 'thr_root',
                parentThreadId: 'thr_root',
                topLevelTab: 'agent',
                title: 'Branch thread',
            },
        });

        expect(strip.items.find((item) => item.id === 'branch-worktree')?.value).toBe('Branched thread');
        expect(strip.items.find((item) => item.id === 'branch-worktree')?.detail).toBe(
            'new sandbox worktree scheduled'
        );
        expect(strip.items.find((item) => item.id === 'run')?.tone).toBe('success');
    });

    it('surfaces error selected runs as attention state', () => {
        const strip = buildRunContextStrip({
            workspaceScope: {
                kind: 'sandbox',
                label: 'Sandbox Alpha',
                absolutePath: 'C:\\SandboxAlpha',
                baseWorkspaceLabel: 'Workspace Alpha',
                baseWorkspacePath: 'C:\\WorkspaceAlpha',
                sandboxId: 'sb_default',
            },
            executionPreset: 'yolo',
            pendingPermissionCount: 0,
            selectedSession: createSession(),
            selectedRun: createRun({ status: 'error' }),
        });

        expect(strip.items.find((item) => item.id === 'execution-root')?.value).toBe('Managed sandbox');
        expect(strip.items.find((item) => item.id === 'run')?.value).toBe('error');
        expect(strip.items.find((item) => item.id === 'run')?.tone).toBe('attention');
    });
});
