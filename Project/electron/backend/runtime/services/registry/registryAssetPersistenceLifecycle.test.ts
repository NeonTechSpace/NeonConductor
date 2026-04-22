import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import { modeStore, rulesetStore, skillfileStore } from '@/app/backend/persistence/stores';
import { createDefaultPreparedContextModeOverrides } from '@/app/backend/runtime/contracts';
import type {
    ParsedRegistryModeAsset,
    ParsedRegistryRulesetAsset,
    ParsedRegistrySkillAsset,
} from '@/app/backend/runtime/services/registry/registryLifecycle.types';
import {
    replaceDiscoveredModes,
    replaceDiscoveredRulesets,
    replaceDiscoveredSkillfiles,
} from '@/app/backend/runtime/services/registry/registryAssetPersistenceLifecycle';

describe('registryAssetPersistenceLifecycle', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    it('replaces discovered modes by scope without disturbing other scopes', async () => {
        const profileId = getDefaultProfileId();

        await replaceDiscoveredModes({
            profileId,
            scope: 'global',
            modes: [
                {
                    topLevelTab: 'agent',
                    modeKey: 'code',
                    label: 'Code',
                    assetKey: 'code',
                    prompt: { customInstructions: 'Global code mode' },
                    promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
                    executionPolicy: {},
                    source: 'global_file',
                    sourceKind: 'global_file',
                    scope: 'global',
                    originPath: '/global/code.md',
                    enabled: true,
                    precedence: 1,
                } satisfies ParsedRegistryModeAsset,
            ],
        });

        await replaceDiscoveredModes({
            profileId,
            scope: 'global',
            modes: [
                {
                    topLevelTab: 'agent',
                    modeKey: 'ask',
                    label: 'Ask',
                    assetKey: 'ask',
                    prompt: { customInstructions: 'Global ask mode' },
                    promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
                    executionPolicy: {},
                    source: 'global_file',
                    sourceKind: 'global_file',
                    scope: 'global',
                    originPath: '/global/ask.md',
                    enabled: true,
                    precedence: 2,
                } satisfies ParsedRegistryModeAsset,
            ],
        });

        const fileBackedModes = (await modeStore.listByProfile(profileId)).filter(
            (mode) => mode.sourceKind === 'global_file' && mode.scope === 'global'
        );
        expect(fileBackedModes).toHaveLength(1);
        expect(fileBackedModes[0]?.modeKey).toBe('ask');
    });

    it('replaces discovered rulesets and skillfiles independently by scope', async () => {
        const profileId = getDefaultProfileId();

        await replaceDiscoveredRulesets({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'ws_1',
            rulesets: [
                {
                    assetKey: 'workspace_rule',
                    targetKind: 'shared',
                    relativeRootPath: 'rules/shared/workspace-rule.md',
                    name: 'Workspace Rule',
                    bodyMarkdown: '# Workspace Rule',
                    source: 'workspace_file',
                    sourceKind: 'workspace_file',
                    scope: 'workspace',
                    workspaceFingerprint: 'ws_1',
                    originPath: '/workspace/rules/workspace-rule.md',
                    activationMode: 'manual',
                    enabled: true,
                    precedence: 3,
                } satisfies ParsedRegistryRulesetAsset,
            ],
        });

        await replaceDiscoveredSkillfiles({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'ws_1',
            skillfiles: [
                {
                    assetKey: 'workspace_skill',
                    targetKind: 'shared',
                    relativeRootPath: 'skills/shared/workspace-skill/SKILL.md',
                    name: 'Workspace Skill',
                    dynamicContextSources: [],
                    source: 'workspace_file',
                    sourceKind: 'workspace_file',
                    scope: 'workspace',
                    workspaceFingerprint: 'ws_1',
                    originPath: '/workspace/skills/workspace-skill.md',
                    enabled: true,
                    precedence: 4,
                } satisfies ParsedRegistrySkillAsset,
            ],
        });

        expect(
            (await rulesetStore.listByProfile(profileId))
                .filter((ruleset) => ruleset.sourceKind === 'workspace_file')
                .map((ruleset) => ruleset.assetKey)
        ).toEqual(['workspace_rule']);
        expect(
            (await skillfileStore.listByProfile(profileId))
                .filter((skillfile) => skillfile.sourceKind === 'workspace_file')
                .map((skillfile) => skillfile.assetKey)
        ).toEqual(['workspace_skill']);
    });
});
