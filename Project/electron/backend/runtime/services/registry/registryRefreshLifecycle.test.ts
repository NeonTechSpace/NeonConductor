import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, getPersistenceStoragePaths, resetPersistenceForTests } from '@/app/backend/persistence/db';
import { modeStore, settingsStore, workspaceRootStore } from '@/app/backend/persistence/stores';
import { toActiveModeKey } from '@/app/backend/runtime/services/mode/selection';
import { refreshRegistry } from '@/app/backend/runtime/services/registry/registryRefreshLifecycle';

function ensureRegistryAssetDirectories(rootPath: string): void {
    for (const relativeDirectory of [
        'modes',
        'rules',
        'rules-ask',
        'rules-code',
        'rules-debug',
        'rules-orchestrator',
        'skills',
        'skills-ask',
        'skills-code',
        'skills-debug',
        'skills-orchestrator',
    ]) {
        mkdirSync(path.join(rootPath, relativeDirectory), { recursive: true });
    }
}

describe('registryRefreshLifecycle', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    it('refreshes global assets and resolves the active agent mode from persisted settings', async () => {
        const profileId = getDefaultProfileId();
        const { globalAssetsRoot } = getPersistenceStoragePaths();

        ensureRegistryAssetDirectories(globalAssetsRoot);
        writeFileSync(
            path.join(globalAssetsRoot, 'modes', 'code.md'),
            `---
modeKey: code
label: Code
topLevelTab: agent
description: Global code mode.
---
# Code

Global code mode.
`,
            'utf8'
        );
        await settingsStore.setString(profileId, toActiveModeKey('agent'), 'code');

        const result = await refreshRegistry({ profileId });

        expect(result.refreshed.global.modes).toBeGreaterThanOrEqual(1);
        expect(result.refreshed.workspace).toBeUndefined();
        expect(result.activeAgentMode.modeKey).toBe('code');
        expect((await modeStore.listByProfile(profileId)).some((mode) => mode.modeKey === 'code')).toBe(true);
    });

    it('refreshes workspace assets when a workspace fingerprint is provided', async () => {
        const profileId = getDefaultProfileId();
        const workspacePath = path.join(getPersistenceStoragePaths().globalAssetsRoot, '..', 'registry-refresh-workspace');
        mkdirSync(workspacePath, { recursive: true });
        const workspaceRoot = await workspaceRootStore.resolveOrCreate(profileId, workspacePath);
        const workspaceAssetsRoot = path.join(workspaceRoot.absolutePath, '.neonconductor');

        mkdirSync(path.join(workspaceAssetsRoot, 'modes'), { recursive: true });
        writeFileSync(
            path.join(workspaceAssetsRoot, 'modes', 'workspace-code.md'),
            `---
modeKey: workspace_code
label: Workspace Code
topLevelTab: agent
description: Workspace code mode.
---
# Workspace Code

Workspace code mode.
`,
            'utf8'
        );
        await settingsStore.setString(profileId, toActiveModeKey('agent', workspaceRoot.fingerprint), 'workspace_code');

        const result = await refreshRegistry({
            profileId,
            workspaceFingerprint: workspaceRoot.fingerprint,
        });

        expect(result.refreshed.workspace?.modes).toBe(1);
        expect(result.activeAgentMode.modeKey).toBe('workspace_code');
        expect(result.resolvedRegistry.discovered.workspace?.modes.some((mode) => mode.modeKey === 'workspace_code')).toBe(
            true
        );
    });
});
