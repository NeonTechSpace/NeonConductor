import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    resolveToolBoundaryDecision,
} from '@/app/backend/runtime/services/toolExecution/toolBoundaryPolicy';
import { boundaryResource } from '@/app/backend/runtime/services/toolExecution/decision';
import type { ToolRequestContext } from '@/app/backend/runtime/services/toolExecution/toolExecutionLifecycle.types';

const { buildBlockedToolOutcomeMock, buildDeniedToolOutcomeMock, resolveToolDecisionMock } = vi.hoisted(() => ({
    buildBlockedToolOutcomeMock: vi.fn(),
    buildDeniedToolOutcomeMock: vi.fn(),
    resolveToolDecisionMock: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/toolExecution/blocked', () => ({
    buildBlockedToolOutcome: buildBlockedToolOutcomeMock,
    buildDeniedToolOutcome: buildDeniedToolOutcomeMock,
}));

vi.mock('@/app/backend/runtime/services/toolExecution/decision', () => ({
    boundaryDefaultPolicy: vi.fn((executionPreset: 'privacy' | 'standard' | 'yolo') =>
        executionPreset === 'yolo' ? 'deny' : 'ask'
    ),
    boundaryResource: vi.fn((toolId: string, boundary: string) => `tool:${toolId}:boundary:${boundary}`),
    resolveToolDecision: resolveToolDecisionMock,
}));

function createContext(overrides: Partial<ToolRequestContext>): ToolRequestContext {
    return {
        at: '2026-03-30T10:00:00.000Z',
        args: {},
        executionArgs: {},
        definition: {
            tool: {
                id: 'read_file',
                label: 'Read File',
                description: 'Read a file.',
                capabilities: ['filesystem_read'],
                requiresWorkspace: true,
                permissionPolicy: 'allow',
                allowsExternalPaths: false,
                allowsIgnoredPaths: false,
            },
            resource: 'tool:read_file',
            source: 'native',
        },
        shellApprovalContext: null,
        workspaceRequirement: 'resolved',
        workspaceFingerprint: 'ws_alpha',
        workspaceLabel: 'Workspace Alpha',
        workspaceRootPath: 'C:/workspace-alpha',
        resolvedWorkspacePath: {
            absolutePath: 'C:/workspace-alpha/docs/readme.md',
            workspaceRootPath: 'C:/workspace-alpha',
        },
        ...overrides,
    };
}

describe('toolBoundaryPolicy', () => {
    beforeEach(() => {
        buildBlockedToolOutcomeMock.mockReset();
        buildDeniedToolOutcomeMock.mockReset();
        resolveToolDecisionMock.mockReset();
    });

    it('denies detached workspace-required tools', async () => {
        buildDeniedToolOutcomeMock.mockResolvedValue({
            kind: 'denied',
            toolId: 'read_file',
            message: 'Detached chat has no file authority.',
            args: {},
            at: '2026-03-30T10:00:00.000Z',
            policy: { effective: 'deny', source: 'detached_scope' },
            reason: 'detached_scope',
        });

        const outcome = await resolveToolBoundaryDecision({
            request: {
                profileId: 'profile_default',
                toolId: 'read_file',
                topLevelTab: 'agent',
                modeKey: 'code',
                args: {},
            },
            context: createContext({
                workspaceRequirement: 'detached_scope',
            }),
            executionPreset: 'standard',
        });

        expect(buildDeniedToolOutcomeMock).toHaveBeenCalledWith(
            expect.objectContaining({
                resource: boundaryResource('read_file', 'workspace_required'),
                reason: 'detached_scope',
            })
        );
        expect(outcome).toMatchObject({ kind: 'denied', reason: 'detached_scope' });
    });

    it('denies unresolved workspace-required tools', async () => {
        buildDeniedToolOutcomeMock.mockResolvedValue({
            kind: 'denied',
            toolId: 'read_file',
            message: 'Could not resolve workspace root.',
            args: {},
            at: '2026-03-30T10:00:00.000Z',
            policy: { effective: 'deny', source: 'workspace_unresolved' },
            reason: 'workspace_unresolved',
        });

        const outcome = await resolveToolBoundaryDecision({
            request: {
                profileId: 'profile_default',
                toolId: 'read_file',
                topLevelTab: 'agent',
                modeKey: 'code',
                args: {},
            },
            context: createContext({
                workspaceRequirement: 'workspace_unresolved',
            }),
            executionPreset: 'standard',
        });

        expect(buildDeniedToolOutcomeMock).toHaveBeenCalledWith(
            expect.objectContaining({
                resource: boundaryResource('read_file', 'workspace_required'),
                reason: 'workspace_unresolved',
            })
        );
        expect(outcome).toMatchObject({ kind: 'denied', reason: 'workspace_unresolved' });
    });

    it('asks for approval for outside-workspace access when policy resolves to ask', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'ask',
            resource: 'tool:read_file:boundary:outside_workspace',
            scopeKind: 'boundary',
            summary: {
                title: 'Outside Workspace Access',
                detail: 'Read File wants to access a path outside Workspace Alpha.',
            },
            message: 'Need approval',
            policy: { effective: 'ask', source: 'mode' },
        });
        buildBlockedToolOutcomeMock.mockResolvedValue({
            kind: 'approval_required',
            toolId: 'read_file',
            message: 'Need approval',
            args: {},
            at: '2026-03-30T10:00:00.000Z',
            requestId: 'perm_1',
            policy: { effective: 'ask', source: 'mode' },
        });

        const outcome = await resolveToolBoundaryDecision({
            request: {
                profileId: 'profile_default',
                toolId: 'read_file',
                topLevelTab: 'agent',
                modeKey: 'code',
                workspaceFingerprint: 'ws_alpha',
                args: {},
            },
            context: createContext({
                resolvedWorkspacePath: {
                    absolutePath: 'C:/outside/readme.md',
                    workspaceRootPath: 'C:/workspace-alpha',
                },
            }),
            executionPreset: 'standard',
        });

        expect(resolveToolDecisionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                resource: boundaryResource('read_file', 'outside_workspace'),
                scopeKind: 'boundary',
                toolDefaultPolicy: 'ask',
            })
        );
        expect(outcome).toMatchObject({ kind: 'approval_required', requestId: 'perm_1' });
    });

    it('denies outside-workspace access when policy resolves to deny', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'deny',
            resource: 'tool:read_file:boundary:outside_workspace',
            message: 'Denied',
            policy: { effective: 'deny', source: 'preset' },
            reason: 'outside_workspace',
        });
        buildBlockedToolOutcomeMock.mockResolvedValue({
            kind: 'denied',
            toolId: 'read_file',
            message: 'Denied',
            args: {},
            at: '2026-03-30T10:00:00.000Z',
            policy: { effective: 'deny', source: 'preset' },
            reason: 'outside_workspace',
        });

        const outcome = await resolveToolBoundaryDecision({
            request: {
                profileId: 'profile_default',
                toolId: 'read_file',
                topLevelTab: 'agent',
                modeKey: 'code',
                workspaceFingerprint: 'ws_alpha',
                args: {},
            },
            context: createContext({
                resolvedWorkspacePath: {
                    absolutePath: 'C:/outside/readme.md',
                    workspaceRootPath: 'C:/workspace-alpha',
                },
            }),
            executionPreset: 'yolo',
        });

        expect(resolveToolDecisionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                resource: boundaryResource('read_file', 'outside_workspace'),
                toolDefaultPolicy: 'deny',
            })
        );
        expect(outcome).toMatchObject({ kind: 'denied', reason: 'outside_workspace' });
    });

    it('asks for approval for ignored-path access when policy resolves to ask', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'ask',
            resource: 'tool:read_file:boundary:ignored_path',
            scopeKind: 'boundary',
            summary: {
                title: 'Ignored Path Access',
                detail: 'Read File wants to access an ignored path inside Workspace Alpha.',
            },
            message: 'Need approval',
            policy: { effective: 'ask', source: 'mode' },
        });
        buildBlockedToolOutcomeMock.mockResolvedValue({
            kind: 'approval_required',
            toolId: 'read_file',
            message: 'Need approval',
            args: {},
            at: '2026-03-30T10:00:00.000Z',
            requestId: 'perm_1',
            policy: { effective: 'ask', source: 'mode' },
        });

        const outcome = await resolveToolBoundaryDecision({
            request: {
                profileId: 'profile_default',
                toolId: 'read_file',
                topLevelTab: 'agent',
                modeKey: 'code',
                workspaceFingerprint: 'ws_alpha',
                args: {},
            },
            context: createContext({
                resolvedWorkspacePath: {
                    absolutePath: 'C:/workspace-alpha/.git/config',
                    workspaceRootPath: 'C:/workspace-alpha',
                },
            }),
            executionPreset: 'standard',
        });

        expect(resolveToolDecisionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                resource: boundaryResource('read_file', 'ignored_path'),
                scopeKind: 'boundary',
            })
        );
        expect(outcome).toMatchObject({ kind: 'approval_required', requestId: 'perm_1' });
    });

    it('denies ignored-path access when policy resolves to deny', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'deny',
            resource: 'tool:read_file:boundary:ignored_path',
            message: 'Denied',
            policy: { effective: 'deny', source: 'preset' },
            reason: 'ignored_path',
        });
        buildBlockedToolOutcomeMock.mockResolvedValue({
            kind: 'denied',
            toolId: 'read_file',
            message: 'Denied',
            args: {},
            at: '2026-03-30T10:00:00.000Z',
            policy: { effective: 'deny', source: 'preset' },
            reason: 'ignored_path',
        });

        const outcome = await resolveToolBoundaryDecision({
            request: {
                profileId: 'profile_default',
                toolId: 'read_file',
                topLevelTab: 'agent',
                modeKey: 'code',
                workspaceFingerprint: 'ws_alpha',
                args: {},
            },
            context: createContext({
                resolvedWorkspacePath: {
                    absolutePath: 'C:/workspace-alpha/.git/config',
                    workspaceRootPath: 'C:/workspace-alpha',
                },
            }),
            executionPreset: 'yolo',
        });

        expect(resolveToolDecisionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                resource: boundaryResource('read_file', 'ignored_path'),
                toolDefaultPolicy: 'deny',
            })
        );
        expect(outcome).toMatchObject({ kind: 'denied', reason: 'ignored_path' });
    });
});
