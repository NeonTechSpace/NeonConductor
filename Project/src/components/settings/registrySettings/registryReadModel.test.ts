import { describe, expect, it } from 'vitest';

import { buildRegistryReadModel } from '@/web/components/settings/registrySettings/registryReadModel';

describe('buildRegistryReadModel', () => {
    it('projects workspace selection and filtered skill matches from registry data', () => {
        const readModel = buildRegistryReadModel({
            workspaceRoots: [
                {
                    fingerprint: 'wsf_1',
                    profileId: 'prof_1',
                    label: 'Workspace One',
                    absolutePath: '/workspace-one',
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
            ],
            selectedWorkspaceFingerprint: 'wsf_1',
            registryData: {
                paths: {
                    globalAssetsRoot: '/global-assets',
                },
                resolved: {
                    modes: [
                        {
                            id: 'mode_1',
                            profileId: 'prof_1',
                            assetKey: 'modes/code',
                            label: 'Code',
                            modeKey: 'code',
                            topLevelTab: 'agent',
                            executionPolicy: {},
                            source: 'seed',
                            scope: 'system',
                            enabled: true,
                            sourceKind: 'system_seed',
                            precedence: 1,
                            prompt: {},
                            createdAt: '2026-01-01T00:00:00.000Z',
                            updatedAt: '2026-01-01T00:00:00.000Z',
                        },
                    ],
                    rulesets: [],
                    skillfiles: [
                        {
                            id: 'skill_1',
                            profileId: 'prof_1',
                            assetKey: 'skills/review',
                            name: 'Review',
                            bodyMarkdown: '',
                            source: 'workspace',
                            enabled: true,
                            sourceKind: 'workspace_file',
                            precedence: 1,
                            scope: 'workspace',
                            createdAt: '2026-01-01T00:00:00.000Z',
                            updatedAt: '2026-01-01T00:00:00.000Z',
                        },
                    ],
                },
                discovered: {
                    global: {
                        modes: [],
                        rulesets: [],
                        skillfiles: [],
                    },
                    workspace: {
                        modes: [],
                        rulesets: [],
                        skillfiles: [],
                    },
                },
            },
            deferredSkillQuery: 'review',
        });

        expect(readModel.selectedWorkspaceRoot?.absolutePath).toBe('/workspace-one');
        expect(readModel.globalAssetsRoot).toBe('/global-assets');
        expect(readModel.resolvedAgentModes).toHaveLength(1);
        expect(readModel.skillMatches).toHaveLength(1);
        expect(readModel.skillMatches[0]?.name).toBe('Review');
    });
});
