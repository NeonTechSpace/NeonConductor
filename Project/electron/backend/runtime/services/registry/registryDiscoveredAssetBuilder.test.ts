import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildDiscoveredAssets } from '@/app/backend/runtime/services/registry/registryDiscoveredAssetBuilder';

function createTempRegistryRoot(): string {
    const rootPath = path.join(os.tmpdir(), `registry-builder-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(rootPath, { recursive: true });
    return rootPath;
}

function writeMarkdownFile(rootPath: string, relativePath: string, content: string): void {
    const absolutePath = path.join(rootPath, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf8');
}

describe('registryDiscoveredAssetBuilder', () => {
    const createdRoots: string[] = [];

    afterEach(() => {
        for (const rootPath of createdRoots.splice(0)) {
            rmSync(rootPath, { recursive: true, force: true });
        }
    });

    it('builds discovered asset batches for global and workspace scopes', async () => {
        const rootPath = createTempRegistryRoot();
        createdRoots.push(rootPath);

        writeMarkdownFile(
            rootPath,
            'modes/agent-tools.md',
            `---
topLevelTab: agent
modeKey: agent_tools
label: Agent Tools
tags:
  - shared
  - core
---
# Mode body
`
        );
        writeMarkdownFile(
            rootPath,
            'modes/invalid.md',
            `---
topLevelTab: invalid
modeKey: ignored
---
# Broken mode
`
        );
        writeMarkdownFile(
            rootPath,
            'rules/presets/code/manual-rule.md',
            `---
assetKey: rules/code/manual_rule
name: Manual Rule
activationMode: manual
tags:
  - code
---
# Manual rule
`
        );
        writeMarkdownFile(
            rootPath,
            'skills/shared/overview/SKILL.md',
            `---
assetKey: skills/overview
name: Overview
tags:
  - docs
---
# Skill body
`
        );
        writeMarkdownFile(
            rootPath,
            'skills/presets/code/assistant/SKILL.md',
            `---
key: skills/code/assistant
name: Assistant
tags:
  - code
---
# Assistant skill
`
        );

        const globalBatch = await buildDiscoveredAssets({
            modeRootPath: rootPath,
            nativeRootPath: rootPath,
            scope: 'global',
        });
        expect(globalBatch).toMatchObject({
            modes: [
                {
                    topLevelTab: 'agent',
                    modeKey: 'agent_tools',
                    label: 'Agent Tools',
                    assetKey: 'agent-tools',
                    prompt: {
                        customInstructions: '# Mode body',
                    },
                    source: 'global_file',
                    sourceKind: 'global_file',
                    scope: 'global',
                    originPath: path.join(rootPath, 'modes', 'agent-tools.md'),
                    tags: ['shared', 'core'],
                    enabled: true,
                    precedence: 0,
                },
            ],
            rulesets: [
                {
                    assetKey: 'rules/code/manual_rule',
                    presetKey: 'code',
                    targetKind: 'preset',
                    relativeRootPath: 'rules/presets/code/manual-rule.md',
                    name: 'Manual Rule',
                    bodyMarkdown: '# Manual rule',
                    source: 'global_file',
                    sourceKind: 'global_file',
                    scope: 'global',
                    originPath: path.join(rootPath, 'rules', 'presets', 'code', 'manual-rule.md'),
                    tags: ['code'],
                    activationMode: 'manual',
                    enabled: true,
                    precedence: 0,
                },
            ],
            skillfiles: expect.arrayContaining([
                expect.objectContaining({
                    assetKey: 'skills/overview',
                    targetKind: 'shared',
                    relativeRootPath: 'skills/shared/overview/SKILL.md',
                    name: 'Overview',
                    source: 'global_file',
                    sourceKind: 'global_file',
                    scope: 'global',
                    originPath: path.join(rootPath, 'skills', 'shared', 'overview', 'SKILL.md'),
                    tags: ['docs'],
                    enabled: true,
                    precedence: 0,
                }),
                expect.objectContaining({
                    assetKey: 'skills/code/assistant',
                    presetKey: 'code',
                    targetKind: 'preset',
                    relativeRootPath: 'skills/presets/code/assistant/SKILL.md',
                    name: 'Assistant',
                    source: 'global_file',
                    sourceKind: 'global_file',
                    scope: 'global',
                    originPath: path.join(rootPath, 'skills', 'presets', 'code', 'assistant', 'SKILL.md'),
                    tags: ['code'],
                    enabled: true,
                    precedence: 0,
                }),
            ]),
        });

        const workspaceBatch = await buildDiscoveredAssets({
            modeRootPath: rootPath,
            nativeRootPath: rootPath,
            scope: 'workspace',
            workspaceFingerprint: 'ws_123',
        });

        expect(workspaceBatch.modes[0]).toMatchObject({
            scope: 'workspace',
            source: 'workspace_file',
            sourceKind: 'workspace_file',
            workspaceFingerprint: 'ws_123',
        });
        expect(workspaceBatch.rulesets[0]).toMatchObject({
            scope: 'workspace',
            source: 'workspace_file',
            sourceKind: 'workspace_file',
            workspaceFingerprint: 'ws_123',
        });
        expect(workspaceBatch.skillfiles[0]).toMatchObject({
            scope: 'workspace',
            source: 'workspace_file',
            sourceKind: 'workspace_file',
            workspaceFingerprint: 'ws_123',
        });
    });
});
