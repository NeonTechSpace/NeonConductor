import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PermissionRecord, ToolRecord } from '@/app/backend/persistence/types';
import type { PreparedContextContributorSpec } from '@/app/backend/runtime/services/context/preparedContextLedger';
import type { SkillfileDefinition } from '@/shared/contracts';

const {
    toolListMock,
    permissionConsumeGrantedOnceMock,
    permissionCreateMock,
    resolveEffectivePermissionPolicyMock,
    getExecutionPresetMock,
    runtimeEventAppendMock,
    invokeToolHandlerMock,
} = vi.hoisted(() => ({
    toolListMock: vi.fn(),
    permissionConsumeGrantedOnceMock: vi.fn(),
    permissionCreateMock: vi.fn(),
    resolveEffectivePermissionPolicyMock: vi.fn(),
    getExecutionPresetMock: vi.fn(),
    runtimeEventAppendMock: vi.fn(),
    invokeToolHandlerMock: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    permissionStore: {
        consumeGrantedOnce: permissionConsumeGrantedOnceMock,
        create: permissionCreateMock,
    },
    toolStore: {
        list: toolListMock,
    },
}));

vi.mock('@/app/backend/runtime/services/permissions/policyResolver', () => ({
    resolveEffectivePermissionPolicy: resolveEffectivePermissionPolicyMock,
}));

vi.mock('@/app/backend/runtime/services/profile/executionPreset', () => ({
    getExecutionPreset: getExecutionPresetMock,
}));

vi.mock('@/app/backend/runtime/services/runtimeEventLog', () => ({
    runtimeEventLogService: {
        append: runtimeEventAppendMock,
    },
}));

vi.mock('@/app/backend/runtime/services/toolExecution/handlers', () => ({
    invokeToolHandler: invokeToolHandlerMock,
}));

import {
    appendDynamicContributors,
    resolveDynamicSkillContextContributors,
} from '@/app/backend/runtime/services/sessionSkills/dynamicContextResolver';

function createRunCommandTool(permissionPolicy: ToolRecord['permissionPolicy'] = 'ask'): ToolRecord {
    return {
        id: 'run_command',
        label: 'Run command',
        description: 'Runs a shell command.',
        permissionPolicy,
        mutability: 'mutating',
        capabilities: ['shell'],
        requiresWorkspace: true,
        allowsExternalPaths: false,
        allowsIgnoredPaths: false,
    };
}

function createSkillfile(input?: Partial<SkillfileDefinition>): SkillfileDefinition {
    return {
        id: 'skill_review',
        profileId: 'profile_test',
        assetKey: 'skills/review',
        name: 'Review',
        bodyMarkdown: '# Review skill',
        dynamicContextSources: [],
        source: 'workspace',
        sourceKind: 'workspace_file',
        scope: 'workspace',
        enabled: true,
        precedence: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...input,
    };
}

describe('dynamicContextResolver', () => {
    beforeEach(() => {
        toolListMock.mockReset();
        permissionConsumeGrantedOnceMock.mockReset();
        permissionCreateMock.mockReset();
        resolveEffectivePermissionPolicyMock.mockReset();
        getExecutionPresetMock.mockReset();
        runtimeEventAppendMock.mockReset();
        invokeToolHandlerMock.mockReset();

        toolListMock.mockResolvedValue([createRunCommandTool()]);
        permissionConsumeGrantedOnceMock.mockResolvedValue(undefined);
        permissionCreateMock.mockResolvedValue({
            id: 'perm_dynamic_skill',
            profileId: 'profile_test',
            policy: 'ask',
            resource: 'tool:run_command:command:test',
            toolId: 'run_command',
            scopeKind: 'tool',
            summary: {
                title: 'Dynamic Skill Context Approval',
                detail: 'approval needed',
            },
            decision: 'pending',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        } satisfies PermissionRecord);
        resolveEffectivePermissionPolicyMock.mockResolvedValue({
            policy: 'allow',
            source: 'tool_default',
            resource: 'tool:run_command:command:test',
        });
        getExecutionPresetMock.mockResolvedValue('standard');
        runtimeEventAppendMock.mockResolvedValue(undefined);
    });

    it('does not execute dynamic commands in preview mode', async () => {
        const result = await resolveDynamicSkillContextContributors({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            topLevelTab: 'agent',
            modeKey: 'code',
            skillfiles: [
                createSkillfile({
                    dynamicContextSources: [
                        {
                            id: 'repo_status',
                            label: 'Repo status',
                            command: 'git status',
                            declaredSafetyClass: 'safe',
                            required: true,
                            validationState: 'valid',
                            effectiveSafetyClass: 'safe',
                        },
                    ],
                }),
            ],
            workspaceFingerprint: 'ws_1',
            workspaceContext: {
                kind: 'workspace',
                workspaceFingerprint: 'ws_1',
                label: 'Workspace',
                absolutePath: '/workspace',
                executionEnvironmentMode: 'local',
            },
            sideEffectMode: 'preview',
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(invokeToolHandlerMock).not.toHaveBeenCalled();
        expect(result.value.contributors[0]?.spec.fixedInclusionState).toBe('excluded');
        expect(result.value.contributors[0]?.spec.dynamicExpansion?.resolutionState).toBe('preview_only');
    });

    it('resolves safe dynamic sources during execution', async () => {
        invokeToolHandlerMock.mockResolvedValue(
            ok({
                stdout: 'On branch main',
                stderr: '',
                exitCode: 0,
                stdoutTruncated: false,
                stderrTruncated: false,
            })
        );

        const result = await resolveDynamicSkillContextContributors({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            topLevelTab: 'agent',
            modeKey: 'code',
            skillfiles: [
                createSkillfile({
                    dynamicContextSources: [
                        {
                            id: 'repo_status',
                            label: 'Repo status',
                            command: 'git status',
                            declaredSafetyClass: 'safe',
                            required: true,
                            validationState: 'valid',
                            effectiveSafetyClass: 'safe',
                        },
                    ],
                }),
            ],
            workspaceFingerprint: 'ws_1',
            workspaceContext: {
                kind: 'workspace',
                workspaceFingerprint: 'ws_1',
                label: 'Workspace',
                absolutePath: '/workspace',
                executionEnvironmentMode: 'local',
            },
            sideEffectMode: 'execution',
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(invokeToolHandlerMock).toHaveBeenCalledOnce();
        expect(result.value.contributors[0]?.spec.fixedInclusionState).toBe('included');
        expect(result.value.contributors[0]?.spec.dynamicExpansion?.resolutionState).toBe('resolved');
    });

    it('blocks execution and opens a permission request for unsafe ask-mode sources', async () => {
        resolveEffectivePermissionPolicyMock.mockResolvedValue({
            policy: 'ask',
            source: 'tool_default',
            resource: 'tool:run_command:command:test',
        });

        const result = await resolveDynamicSkillContextContributors({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            topLevelTab: 'agent',
            modeKey: 'code',
            skillfiles: [
                createSkillfile({
                    dynamicContextSources: [
                        {
                            id: 'custom_report',
                            label: 'Custom report',
                            command: 'node scripts/report.js',
                            declaredSafetyClass: 'safe',
                            required: true,
                            validationState: 'valid',
                            effectiveSafetyClass: 'unsafe',
                        },
                    ],
                }),
            ],
            workspaceFingerprint: 'ws_1',
            workspaceContext: {
                kind: 'workspace',
                workspaceFingerprint: 'ws_1',
                label: 'Workspace',
                absolutePath: '/workspace',
                executionEnvironmentMode: 'local',
            },
            sideEffectMode: 'execution',
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected permission gate to block execution.');
        }

        expect(result.error.code).toBe('permission_required');
        expect(result.error.details?.['requestId']).toBe('perm_dynamic_skill');
        expect(permissionCreateMock).toHaveBeenCalledOnce();
        expect(invokeToolHandlerMock).not.toHaveBeenCalled();
    });

    it('allows retry after approval by consuming a granted-once decision', async () => {
        resolveEffectivePermissionPolicyMock.mockResolvedValue({
            policy: 'ask',
            source: 'tool_default',
            resource: 'tool:run_command:command:test',
        });
        permissionConsumeGrantedOnceMock.mockResolvedValue({
            id: 'perm_granted',
        });
        invokeToolHandlerMock.mockResolvedValue(
            ok({
                stdout: 'dynamic output',
                stderr: '',
                exitCode: 0,
                stdoutTruncated: false,
                stderrTruncated: false,
            })
        );

        const result = await resolveDynamicSkillContextContributors({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            topLevelTab: 'agent',
            modeKey: 'code',
            skillfiles: [
                createSkillfile({
                    dynamicContextSources: [
                        {
                            id: 'custom_report',
                            label: 'Custom report',
                            command: 'node scripts/report.js',
                            declaredSafetyClass: 'unsafe',
                            required: true,
                            validationState: 'valid',
                            effectiveSafetyClass: 'unsafe',
                        },
                    ],
                }),
            ],
            workspaceFingerprint: 'ws_1',
            workspaceContext: {
                kind: 'workspace',
                workspaceFingerprint: 'ws_1',
                label: 'Workspace',
                absolutePath: '/workspace',
                executionEnvironmentMode: 'local',
            },
            sideEffectMode: 'execution',
        });

        expect(result.isOk()).toBe(true);
        expect(permissionCreateMock).not.toHaveBeenCalled();
        expect(invokeToolHandlerMock).toHaveBeenCalledOnce();
    });

    it('blocks run start when a required dynamic source fails', async () => {
        invokeToolHandlerMock.mockResolvedValue(err(new Error('command failed')));

        const result = await resolveDynamicSkillContextContributors({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            topLevelTab: 'agent',
            modeKey: 'code',
            skillfiles: [
                createSkillfile({
                    dynamicContextSources: [
                        {
                            id: 'repo_status',
                            label: 'Repo status',
                            command: 'git status',
                            declaredSafetyClass: 'safe',
                            required: true,
                            validationState: 'valid',
                            effectiveSafetyClass: 'safe',
                        },
                    ],
                }),
            ],
            workspaceFingerprint: 'ws_1',
            workspaceContext: {
                kind: 'workspace',
                workspaceFingerprint: 'ws_1',
                label: 'Workspace',
                absolutePath: '/workspace',
                executionEnvironmentMode: 'local',
            },
            sideEffectMode: 'execution',
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected required dynamic source failure to block execution.');
        }

        expect(result.error.code).toBe('runtime_option_invalid');
        expect(result.error.message).toContain('failed');
    });

    it('keeps dynamic contributors adjacent to their parent attached skill', () => {
        const baseContributors: PreparedContextContributorSpec[] = [
            {
                id: 'skill:review',
                kind: 'attached_skill',
                group: 'attached_skill',
                label: 'Review',
                source: {
                    kind: 'skill',
                    key: 'skills/review',
                    label: 'Review',
                },
                messages: [],
                fixedCheckpoint: 'bootstrap',
                inclusionReason: 'Included from attached skills.',
            },
            {
                id: 'prompt:app',
                kind: 'prompt_layer',
                group: 'shared_prompt_layer',
                label: 'App instructions',
                source: {
                    kind: 'prompt_layer',
                    key: 'app_global_instructions',
                    label: 'App instructions',
                },
                messages: [],
                fixedCheckpoint: 'bootstrap',
                inclusionReason: 'Included by defaults.',
            },
        ];

        const combined = appendDynamicContributors({
            baseContributorSpecs: baseContributors,
            dynamicContributors: [
                {
                    parentSkillAssetKey: 'skills/review',
                    spec: {
                        id: 'dynamic_skill_context:skills/review:repo_status',
                        kind: 'dynamic_skill_context',
                        group: 'dynamic_skill_context',
                        label: 'Dynamic skill context: Review / Repo status',
                        source: {
                            kind: 'skill_dynamic_context',
                            key: 'skills/review:repo_status',
                            label: 'Review / Repo status',
                        },
                        messages: [],
                        fixedCheckpoint: 'bootstrap',
                        inclusionReason: 'Included from attached skill dynamic context.',
                    },
                },
            ],
        });

        expect(combined.map((contributor) => contributor.id)).toEqual([
            'skill:review',
            'dynamic_skill_context:skills/review:repo_status',
            'prompt:app',
        ]);
    });
});
