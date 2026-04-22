import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, getPersistenceStoragePaths, resetPersistenceForTests } from '@/app/backend/persistence/db';
import { builtInModePromptOverrideStore } from '@/app/backend/persistence/stores';
import { createDefaultPreparedContextModeOverrides } from '@/app/backend/runtime/contracts';
import { registryResolvedQueryService } from '@/app/backend/runtime/services/registry/registryResolvedQueryService';
import { refreshRegistry } from '@/app/backend/runtime/services/registry/service';

function writeRegistryMarkdownFile(absolutePath: string, contents: string): void {
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents, 'utf8');
}

function resetRegistryAssetDirectories(rootPath: string): void {
    rmSync(path.join(rootPath, 'modes'), { recursive: true, force: true });
}

function ensureRegistryAssetDirectories(rootPath: string): void {
    mkdirSync(path.join(rootPath, 'modes'), { recursive: true });
}

describe('registryResolvedQueryService', () => {
    beforeEach(() => {
        resetPersistenceForTests();
        const { globalAssetsRoot } = getPersistenceStoragePaths();
        resetRegistryAssetDirectories(globalAssetsRoot);
        ensureRegistryAssetDirectories(globalAssetsRoot);
    });

    it('projects discovered and resolved registry views from persisted assets', async () => {
        const profileId = getDefaultProfileId();
        const { globalAssetsRoot } = getPersistenceStoragePaths();
        const nativeGlobalRoot = path.join(os.homedir(), '.neonconductor');

        writeRegistryMarkdownFile(
            path.join(globalAssetsRoot, 'modes', 'registry-query-6-10-code.md'),
            `---
topLevelTab: agent
modeKey: code
label: Registry Query Code
assetKey: registry-query-6-10-code-mode
enabled: true
precedence: 9999
tags:
  - modern-tag
groups:
  - legacy-tag
---
Base instructions for the registry query mode.
`
        );
        writeRegistryMarkdownFile(
            path.join(nativeGlobalRoot, 'rules', 'shared', 'registry-query-6-10-shared-rule.md'),
            `---
key: registry-query-6-10-shared-rule
name: Registry Query Shared Rule
activationMode: manual
description: Shared rule for registry query tests.
tags:
  - registry-query-6-10
---
# Shared Rule
`
        );
        writeRegistryMarkdownFile(
            path.join(nativeGlobalRoot, 'rules', 'presets', 'code', 'registry-query-6-10-code-rule.md'),
            `---
key: registry-query-6-10-code-rule
name: Registry Query Code Rule
activationMode: manual
description: Code-only rule for registry query tests.
tags:
  - registry-query-6-10
---
# Code Rule
`
        );
        writeRegistryMarkdownFile(
            path.join(nativeGlobalRoot, 'skills', 'shared', 'registry-query-6-10-shared-skill', 'SKILL.md'),
            `---
key: registry-query-6-10-shared-skill
name: Registry Query Shared Skill
description: Shared skill for registry query tests.
tags:
  - registry-query-6-10
---
# Shared Skill
`
        );
        writeRegistryMarkdownFile(
            path.join(nativeGlobalRoot, 'skills', 'presets', 'code', 'registry-query-6-10-code-skill', 'SKILL.md'),
            `---
key: registry-query-6-10-code-skill
name: Registry Query Code Skill
description: Code-only skill for registry query tests.
tags:
  - registry-query-6-10
---
# Code Skill
`
        );

        await refreshRegistry({ profileId });

        const resolvedRegistry = await registryResolvedQueryService.listResolvedRegistry({ profileId });
        const discoveredMode = resolvedRegistry.discovered.global.modes.find(
            (mode) => mode.assetKey === 'registry-query-6-10-code-mode'
        );
        expect(discoveredMode).toBeDefined();
        expect(discoveredMode?.tags).toEqual(expect.arrayContaining(['modern-tag', 'legacy-tag']));

        const resolvedMode = resolvedRegistry.resolved.modes.find(
            (mode) => mode.assetKey === 'registry-query-6-10-code-mode'
        );
        expect(resolvedMode).toBeDefined();
        expect(resolvedMode?.label).toBe('Registry Query Code');

        const contextualSkillSearch = await registryResolvedQueryService.searchResolvedSkillfiles({
            profileId,
            query: 'registry-query-6-10',
            topLevelTab: 'agent',
            modeKey: 'code',
        });
        expect(contextualSkillSearch).toHaveLength(2);
        expect(contextualSkillSearch.map((skillfile) => skillfile.assetKey)).toEqual(
            expect.arrayContaining(['registry-query-6-10-shared-skill', 'registry-query-6-10-code-skill'])
        );

        const contextualRuleSearch = await registryResolvedQueryService.searchResolvedRulesets({
            profileId,
            query: 'registry-query-6-10',
            topLevelTab: 'agent',
            modeKey: 'code',
        });
        expect(contextualRuleSearch).toHaveLength(2);
        expect(contextualRuleSearch.map((ruleset) => ruleset.assetKey)).toEqual(
            expect.arrayContaining(['registry-query-6-10-shared-rule', 'registry-query-6-10-code-rule'])
        );

        const resolvedSkillsByKey = await registryResolvedQueryService.resolveSkillfilesByAssetKeys({
            profileId,
            assetKeys: ['registry-query-6-10-code-skill', 'missing-skill'],
            topLevelTab: 'agent',
            modeKey: 'code',
        });
        expect(resolvedSkillsByKey.skillfiles.map((skillfile) => skillfile.assetKey)).toEqual([
            'registry-query-6-10-code-skill',
        ]);
        expect(resolvedSkillsByKey.missingAssetKeys).toEqual(['missing-skill']);

        const resolvedRulesByKey = await registryResolvedQueryService.resolveRulesetsByAssetKeys({
            profileId,
            assetKeys: ['registry-query-6-10-code-rule', 'missing-rule'],
            topLevelTab: 'agent',
            modeKey: 'code',
        });
        expect(resolvedRulesByKey.rulesets.map((ruleset) => ruleset.assetKey)).toEqual([
            'registry-query-6-10-code-rule',
        ]);
        expect(resolvedRulesByKey.missingAssetKeys).toEqual(['missing-rule']);
    });

    it('applies built-in prompt overrides when resolving modes for a tab', async () => {
        const profileId = getDefaultProfileId();

        await builtInModePromptOverrideStore.setPrompt({
            profileId,
            topLevelTab: 'agent',
            modeKey: 'code',
            prompt: {
                customInstructions: 'Override instructions for the built-in mode.',
                roleDefinition: 'Override role definition.',
            },
            promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
        });

        await refreshRegistry({ profileId });

        const resolvedModes = await registryResolvedQueryService.resolveModesForTab({
            profileId,
            topLevelTab: 'agent',
        });
        const codeMode = resolvedModes.find((mode) => mode.modeKey === 'code');

        expect(codeMode).toBeDefined();
        expect(codeMode?.prompt).toMatchObject({
            customInstructions: 'Override instructions for the built-in mode.',
            roleDefinition: 'Override role definition.',
        });
    });
});
