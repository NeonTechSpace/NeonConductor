import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveToolApprovalDecision } from '@/app/backend/runtime/services/toolExecution/toolApprovalLifecycle';
import type { ToolRequestContext } from '@/app/backend/runtime/services/toolExecution/toolExecutionLifecycle.types';

const { buildBlockedToolOutcomeMock, resolveToolDecisionMock } = vi.hoisted(() => ({
    buildBlockedToolOutcomeMock: vi.fn(),
    resolveToolDecisionMock: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/toolExecution/blocked', () => ({
    buildBlockedToolOutcome: buildBlockedToolOutcomeMock,
    buildDeniedToolOutcome: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/toolExecution/decision', () => ({
    boundaryDefaultPolicy: vi.fn(),
    boundaryResource: vi.fn(),
    resolveToolDecision: resolveToolDecisionMock,
}));

function createContext(overrides: Partial<ToolRequestContext> = {}): ToolRequestContext {
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
                requiresWorkspace: false,
                permissionPolicy: 'allow',
                allowsExternalPaths: false,
                allowsIgnoredPaths: false,
                mutability: 'read_only',
            },
            resource: 'tool:read_file',
            source: 'native',
        },
        shellApprovalContext: null,
        executeCodeApprovalContext: null,
        workspaceRequirement: 'not_required',
        ...overrides,
    };
}

describe('toolApprovalLifecycle', () => {
    beforeEach(() => {
        buildBlockedToolOutcomeMock.mockReset();
        resolveToolDecisionMock.mockReset();
    });

    it('passes shell approval resources and returns allow for one-time approvals', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'allow',
            resource: 'tool:run_command:command:abc123',
            policy: { effective: 'allow', source: 'one_time_approval' },
        });

        const result = await resolveToolApprovalDecision({
            request: {
                profileId: 'profile_default',
                toolId: 'run_command',
                topLevelTab: 'agent',
                modeKey: 'code',
                workspaceFingerprint: 'ws_alpha',
                args: { command: 'git status' },
            },
            context: createContext({
                definition: {
                    tool: {
                        id: 'run_command',
                        label: 'Run Command',
                        description: 'Run a shell command.',
                        capabilities: ['shell'],
                        requiresWorkspace: true,
                        permissionPolicy: 'ask',
                        allowsExternalPaths: false,
                        allowsIgnoredPaths: false,
                        mutability: 'mutating',
                    },
                    resource: 'tool:run_command',
                    source: 'native',
                },
                shellApprovalContext: {
                    commandText: 'git status',
                    commandResource: 'tool:run_command:command:abc123',
                    overrideResources: [],
                    approvalCandidates: [
                        {
                            label: 'git status',
                            resource: 'tool:run_command:command:abc123',
                            detail: 'Allow only this exact normalized command.',
                        },
                    ],
                },
                workspaceRequirement: 'resolved',
                workspaceRootPath: 'C:/workspace-alpha',
                workspaceLabel: 'Workspace Alpha',
            }),
            executionPreset: 'standard',
        });

        expect(resolveToolDecisionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                resource: 'tool:run_command:command:abc123',
                onceResource: 'tool:run_command:command:abc123',
                commandText: 'git status',
            })
        );
        expect(resolveToolDecisionMock.mock.calls[0]?.[0]).not.toHaveProperty('resourceCandidates');
        expect(buildBlockedToolOutcomeMock).not.toHaveBeenCalled();
        expect(result).toEqual({
            kind: 'allow',
            resource: 'tool:run_command:command:abc123',
            policy: { effective: 'allow', source: 'one_time_approval' },
        });
    });

    it('builds approval_required outcomes for shell commands that need permission', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'ask',
            resource: 'tool:run_command:command:abc123',
            scopeKind: 'tool',
            summary: {
                title: 'Shell Command Approval',
                detail: 'Need shell approval.',
            },
            commandText: 'git status',
            approvalCandidates: [
                {
                    label: 'git status',
                    resource: 'tool:run_command:command:abc123',
                    detail: 'Allow only this exact normalized command.',
                },
            ],
            message: 'Need approval',
            policy: { effective: 'ask', source: 'profile' },
        });
        buildBlockedToolOutcomeMock.mockResolvedValue({
            kind: 'approval_required',
            toolId: 'run_command',
            message: 'Need approval',
            args: { command: 'git status' },
            at: '2026-03-30T10:00:00.000Z',
            requestId: 'perm_1',
            policy: { effective: 'ask', source: 'profile' },
        });

        const result = await resolveToolApprovalDecision({
            request: {
                profileId: 'profile_default',
                toolId: 'run_command',
                topLevelTab: 'agent',
                modeKey: 'code',
                workspaceFingerprint: 'ws_alpha',
                args: { command: 'git status' },
            },
            context: createContext({
                args: { command: 'git status' },
                definition: {
                    tool: {
                        id: 'run_command',
                        label: 'Run Command',
                        description: 'Run a shell command.',
                        capabilities: ['shell'],
                        requiresWorkspace: true,
                        permissionPolicy: 'ask',
                        allowsExternalPaths: false,
                        allowsIgnoredPaths: false,
                        mutability: 'mutating',
                    },
                    resource: 'tool:run_command',
                    source: 'native',
                },
                shellApprovalContext: {
                    commandText: 'git status',
                    commandResource: 'tool:run_command:command:abc123',
                    overrideResources: [],
                    approvalCandidates: [
                        {
                            label: 'git status',
                            resource: 'tool:run_command:command:abc123',
                            detail: 'Allow only this exact normalized command.',
                        },
                    ],
                },
                workspaceRequirement: 'resolved',
                workspaceRootPath: 'C:/workspace-alpha',
                workspaceLabel: 'Workspace Alpha',
            }),
            executionPreset: 'privacy',
        });

        expect(resolveToolDecisionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                summary: expect.objectContaining({
                    title: 'Shell Command Approval',
                }),
                commandText: 'git status',
            })
        );
        expect(buildBlockedToolOutcomeMock).toHaveBeenCalledWith(
            expect.objectContaining({
                profileId: 'profile_default',
                toolId: 'run_command',
            })
        );
        expect(result).toMatchObject({
            kind: 'approval_required',
            requestId: 'perm_1',
        });
    });

    it('passes exact execute_code resources without broad approval candidates', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'ask',
            resource: 'tool:execute_code:code:abc123def456abc123def456',
            scopeKind: 'tool',
            summary: {
                title: 'JavaScript Code Approval',
                detail: 'Need JavaScript approval.',
            },
            message: 'Need approval',
            policy: { effective: 'ask', source: 'profile' },
        });
        buildBlockedToolOutcomeMock.mockResolvedValue({
            kind: 'approval_required',
            toolId: 'execute_code',
            message: 'Need approval',
            args: { code: 'return 42;' },
            at: '2026-03-30T10:00:00.000Z',
            requestId: 'perm_code',
            policy: { effective: 'ask', source: 'profile' },
        });

        const result = await resolveToolApprovalDecision({
            request: {
                profileId: 'profile_default',
                toolId: 'execute_code',
                topLevelTab: 'agent',
                modeKey: 'code',
                workspaceFingerprint: 'ws_alpha',
                args: { code: 'return 42;' },
            },
            context: createContext({
                args: { code: 'return 42;' },
                definition: {
                    tool: {
                        id: 'execute_code',
                        label: 'Execute Code',
                        description: 'Run JavaScript transform code.',
                        capabilities: ['code_runtime'],
                        requiresWorkspace: true,
                        permissionPolicy: 'ask',
                        allowsExternalPaths: false,
                        allowsIgnoredPaths: false,
                        mutability: 'mutating',
                    },
                    resource: 'tool:execute_code',
                    source: 'native',
                },
                executeCodeApprovalContext: {
                    codeText: 'return 42;',
                    codePreview: 'return 42;',
                    codeResource: 'tool:execute_code:code:abc123def456abc123def456',
                    codeDigest: 'abc123def456abc123def456',
                },
                workspaceRequirement: 'resolved',
                workspaceRootPath: 'C:/workspace-alpha',
                workspaceLabel: 'Workspace Alpha',
            }),
            executionPreset: 'standard',
        });

        const decisionInput = resolveToolDecisionMock.mock.calls[0]?.[0];
        expect(decisionInput).toMatchObject({
            resource: 'tool:execute_code:code:abc123def456abc123def456',
            onceResource: 'tool:execute_code:code:abc123def456abc123def456',
            summary: {
                title: 'JavaScript Code Approval',
                detail: expect.stringContaining('return 42;'),
            },
        });
        expect(decisionInput).not.toHaveProperty('resourceCandidates');
        expect(decisionInput).not.toHaveProperty('commandText');
        expect(result).toMatchObject({
            kind: 'approval_required',
            requestId: 'perm_code',
        });
    });

    it('returns denied outcomes when the generic decision denies the tool', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'deny',
            resource: 'tool:read_file',
            message: 'Denied by policy',
            policy: { effective: 'deny', source: 'mode' },
            reason: 'policy_denied',
        });
        buildBlockedToolOutcomeMock.mockResolvedValue({
            kind: 'denied',
            toolId: 'read_file',
            message: 'Denied by policy',
            args: {},
            at: '2026-03-30T10:00:00.000Z',
            reason: 'policy_denied',
            policy: { effective: 'deny', source: 'mode' },
        });

        const result = await resolveToolApprovalDecision({
            request: {
                profileId: 'profile_default',
                toolId: 'read_file',
                topLevelTab: 'agent',
                modeKey: 'ask',
                args: {},
            },
            context: createContext(),
            executionPreset: 'standard',
        });

        expect(buildBlockedToolOutcomeMock).toHaveBeenCalledOnce();
        expect(result).toMatchObject({
            kind: 'denied',
            reason: 'policy_denied',
        });
    });
});
