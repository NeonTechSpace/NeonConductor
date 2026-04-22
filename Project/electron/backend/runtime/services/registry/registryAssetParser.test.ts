import { describe, expect, it } from 'vitest';

import { createDefaultPreparedContextModeOverrides } from '@/app/backend/runtime/contracts';
import type { RegistryAssetFile } from '@/app/backend/runtime/services/registry/filesystem';
import {
    buildModeExecutionPolicy,
    createRegistryAssetParserContext,
    parseRegistryModeAsset,
    parseRegistryRulesetAsset,
    parseRegistrySkillAsset,
} from '@/app/backend/runtime/services/registry/registryAssetParser';

function buildAssetFile(input: Partial<RegistryAssetFile> & { parsed: RegistryAssetFile['parsed'] }): RegistryAssetFile {
    return {
        absolutePath: input.absolutePath ?? '/registry/assets/example.md',
        relativePath: input.relativePath ?? 'example.md',
        assetPath: input.assetPath ?? 'example.md',
        ...(input.relativeRootPath ? { relativeRootPath: input.relativeRootPath } : {}),
        ...(input.targetKind ? { targetKind: input.targetKind } : {}),
        ...(input.presetKey ? { presetKey: input.presetKey } : {}),
        ...(input.targetMode ? { targetMode: input.targetMode } : {}),
        parsed: input.parsed,
    };
}

describe('registryAssetParser', () => {
    it('normalizes mode assets into canonical role-template execution metadata', () => {
        const parsedMode = parseRegistryModeAsset(
            buildAssetFile({
                parsed: {
                    attributes: {
                        topLevelTab: 'agent',
                        modeKey: '  Agent Tools  ',
                        label: 'Agent Tools',
                        planningOnly: true,
                        readOnly: true,
                        toolCapabilities: ['filesystem_write', 'filesystem_read', 'filesystem_read'],
                        workflowCapabilities: ['planning', 'artifact_view', 'planning'],
                        behaviorFlags: ['approval_gated', 'artifact_producing', 'approval_gated'],
                        runtimeProfile: 'planner',
                        tags: ['alpha', 'beta'],
                        groups: ['legacy', 'beta'],
                        enabled: false,
                        precedence: 7,
                        description: ' Useful tools ',
                        whenToUse: ' Use this mode when tools matter ',
                        customInstructions: '  ',
                    },
                    bodyMarkdown: '# Guidance\nUse the tools wisely.',
                },
            }),
            createRegistryAssetParserContext({ scope: 'global' })
        );

        expect(parsedMode).toEqual({
            topLevelTab: 'agent',
            modeKey: 'agent_tools',
            label: 'Agent Tools',
            assetKey: 'example',
            prompt: {
                customInstructions: '# Guidance\nUse the tools wisely.',
            },
            promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
            executionPolicy: {
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/plan',
                internalModelRole: 'planner',
                delegatedOnly: false,
                sessionSelectable: true,
                planningOnly: true,
                toolCapabilities: ['filesystem_write', 'filesystem_read'],
                workflowCapabilities: ['planning', 'artifact_view'],
                behaviorFlags: ['approval_gated', 'artifact_producing'],
                runtimeProfile: 'planner',
            },
            source: 'global_file',
            sourceKind: 'global_file',
            scope: 'global',
            originPath: '/registry/assets/example.md',
            description: 'Useful tools',
            whenToUse: 'Use this mode when tools matter',
            tags: ['alpha', 'beta', 'legacy'],
            enabled: false,
            precedence: 7,
        });
    });

    it('fails closed on invalid mode rows', () => {
        expect(
            parseRegistryModeAsset(
                buildAssetFile({
                    parsed: {
                        attributes: {
                            topLevelTab: 'invalid-tab',
                            modeKey: 'agent-tools',
                        },
                        bodyMarkdown: '# Broken',
                    },
                }),
                createRegistryAssetParserContext({ scope: 'workspace', workspaceFingerprint: 'ws_123' })
            )
        ).toBeNull();

        expect(
            parseRegistryModeAsset(
                buildAssetFile({
                    parsed: {
                        attributes: {
                            modeKey: 'agent-tools',
                            groups: 'legacy-group',
                        },
                        bodyMarkdown: '# Broken',
                    },
                }),
                createRegistryAssetParserContext({ scope: 'workspace', workspaceFingerprint: 'ws_123' })
            )
        ).toBeNull();

        expect(
            parseRegistryModeAsset(
                buildAssetFile({
                    parsed: {
                        attributes: {
                            modeKey: 'agent-tools',
                            workflowCapabilities: ['invalid_capability'],
                        },
                        bodyMarkdown: '# Broken',
                    },
                }),
                createRegistryAssetParserContext({ scope: 'global' })
            )
        ).toBeNull();
    });

    it('normalizes ruleset and skill assets', () => {
        const ruleset = parseRegistryRulesetAsset(
            buildAssetFile({
                targetKind: 'preset',
                relativeRootPath: 'rules/presets/code/manual-rule.md',
                presetKey: 'code',
                parsed: {
                    attributes: {
                        assetKey: ' rules/code/manual_rule ',
                        name: ' Manual Rule ',
                        activationMode: 'manual',
                        tags: [' alpha ', 'beta', ''],
                        description: ' Attach me ',
                        enabled: false,
                        precedence: 3,
                    },
                    bodyMarkdown: '# Manual rule body',
                },
            }),
            createRegistryAssetParserContext({ scope: 'workspace', workspaceFingerprint: 'ws_123' })
        );
        expect(ruleset).toEqual({
            assetKey: 'rules/code/manual_rule',
            targetKind: 'preset',
            presetKey: 'code',
            relativeRootPath: 'rules/presets/code/manual-rule.md',
            name: 'Manual Rule',
            bodyMarkdown: '# Manual rule body',
            source: 'workspace_file',
            sourceKind: 'workspace_file',
            scope: 'workspace',
            workspaceFingerprint: 'ws_123',
            originPath: '/registry/assets/example.md',
            description: 'Attach me',
            tags: ['alpha', 'beta'],
            activationMode: 'manual',
            enabled: false,
            precedence: 3,
        });

        const skill = parseRegistrySkillAsset(
            buildAssetFile({
                targetKind: 'preset',
                relativeRootPath: 'skills/presets/ask/review/SKILL.md',
                presetKey: 'ask',
                parsed: {
                    attributes: {
                        key: 'skills/ask/review',
                        name: ' Review ',
                        tags: ['docs'],
                        enabled: true,
                    },
                    bodyMarkdown: '# Skill body',
                },
            }),
            createRegistryAssetParserContext({ scope: 'global' })
        );
        expect(skill).toEqual({
            assetKey: 'skills/ask/review',
            targetKind: 'preset',
            presetKey: 'ask',
            relativeRootPath: 'skills/presets/ask/review/SKILL.md',
            name: 'Review',
            dynamicContextSources: [],
            source: 'global_file',
            sourceKind: 'global_file',
            scope: 'global',
            originPath: '/registry/assets/example.md',
            tags: ['docs'],
            enabled: true,
            precedence: 0,
        });
    });

    it('keeps valid and invalid dynamic skill declarations inspectable', () => {
        const skill = parseRegistrySkillAsset(
            buildAssetFile({
                parsed: {
                    attributes: {
                        key: 'skills/agent/review',
                        name: 'Review',
                        dynamicContextSources: [
                            {
                                id: 'repo_status',
                                label: 'Repo status',
                                command: 'git status',
                                declaredSafetyClass: 'safe',
                                required: true,
                            },
                            {
                                id: 'bad_chain',
                                label: 'Bad chain',
                                command: 'git status && git diff',
                                declaredSafetyClass: 'safe',
                                required: false,
                            },
                        ],
                    },
                    bodyMarkdown: '# Skill body',
                },
            }),
            createRegistryAssetParserContext({ scope: 'workspace', workspaceFingerprint: 'ws_123' })
        );

        expect(skill?.dynamicContextSources).toEqual([
            {
                id: 'repo_status',
                label: 'Repo status',
                command: 'git status',
                declaredSafetyClass: 'safe',
                required: true,
                validationState: 'valid',
                effectiveSafetyClass: 'safe',
            },
            {
                id: 'bad_chain',
                label: 'Bad chain',
                command: 'git status && git diff',
                declaredSafetyClass: 'safe',
                required: false,
                validationState: 'invalid',
                validationMessage:
                    'Dynamic context source command must be a single shell command without chaining or redirection operators.',
            },
        ]);
    });

    it('keeps execution-policy derivation predictable', () => {
        expect(buildModeExecutionPolicy({ readOnly: true })).toEqual({
            authoringRole: 'single_task_agent',
            roleTemplate: 'single_task_agent/ask',
            internalModelRole: 'apply',
            delegatedOnly: false,
            sessionSelectable: true,
            toolCapabilities: ['filesystem_read'],
            workflowCapabilities: [],
            behaviorFlags: ['read_only_execution'],
            runtimeProfile: 'read_only_agent',
        });

        expect(
            buildModeExecutionPolicy({
                topLevelTab: 'agent',
                modeKey: 'plan',
                planningOnly: false,
                toolCapabilities: ['shell', 'shell'],
                workflowCapabilities: ['planning', 'planning'],
                behaviorFlags: ['approval_gated', 'approval_gated'],
                runtimeProfile: 'planner',
            })
        ).toEqual({
            authoringRole: 'single_task_agent',
            roleTemplate: 'single_task_agent/plan',
            internalModelRole: 'planner',
            delegatedOnly: false,
            sessionSelectable: true,
            planningOnly: false,
            toolCapabilities: ['shell'],
            workflowCapabilities: ['planning'],
            behaviorFlags: ['approval_gated'],
            runtimeProfile: 'planner',
        });
    });
});
