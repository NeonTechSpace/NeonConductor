import { describe, expect, it } from 'vitest';

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
        ...(input.presetKey ? { presetKey: input.presetKey } : {}),
        parsed: input.parsed,
    };
}

describe('registryAssetParser', () => {
    it('normalizes mode assets and fails closed on invalid rows', () => {
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
            executionPolicy: {
                planningOnly: true,
                toolCapabilities: ['filesystem_write', 'filesystem_read'],
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
    });

    it('normalizes ruleset and skill assets', () => {
        const ruleset = parseRegistryRulesetAsset(
            buildAssetFile({
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
            presetKey: 'code',
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
            presetKey: 'ask',
            name: 'Review',
            bodyMarkdown: '# Skill body',
            source: 'global_file',
            sourceKind: 'global_file',
            scope: 'global',
            originPath: '/registry/assets/example.md',
            tags: ['docs'],
            enabled: true,
            precedence: 0,
        });
    });

    it('keeps mode execution policy shaping predictable', () => {
        expect(buildModeExecutionPolicy({ readOnly: true })).toEqual({
            toolCapabilities: ['filesystem_read'],
        });
        expect(buildModeExecutionPolicy({ planningOnly: false, toolCapabilities: ['shell', 'shell'] })).toEqual(
            {
                planningOnly: false,
                toolCapabilities: ['shell'],
            }
        );
    });
});
