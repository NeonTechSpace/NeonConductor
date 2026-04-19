import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadRegistryAssetFiles } from '@/app/backend/runtime/services/registry/filesystem';

describe('registry filesystem frontmatter parsing', () => {
    const tempDirectories: string[] = [];

    afterEach(async () => {
        await Promise.all(
            tempDirectories.splice(0).map(async (directoryPath) => {
                await rm(directoryPath, { recursive: true, force: true });
            })
        );
    });

    it('parses YAML object-list frontmatter for skill dynamic context sources', async () => {
        const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'neon-registry-filesystem-'));
        tempDirectories.push(tempRoot);

        const skillDirectory = path.join(tempRoot, 'skills', 'review');
        await mkdir(skillDirectory, { recursive: true });
        await writeFile(
            path.join(skillDirectory, 'SKILL.md'),
            `---
name: Review
dynamicContextSources:
  - id: repo_status
    label: Repo status
    command: git status
    declaredSafetyClass: safe
    required: true
  - id: repo_diff
    label: Repo diff
    command: git diff
    declaredSafetyClass: safe
    required: false
---
# Review skill
Inspect the repository before responding.
`,
            'utf8'
        );

        const files = await loadRegistryAssetFiles({
            rootPath: tempRoot,
            relativeDirectory: 'skills',
            assetKind: 'skills',
        });

        expect(files).toHaveLength(1);
        expect(files[0]?.assetPath).toBe('review');
        expect(files[0]?.parsed.bodyMarkdown).toBe('# Review skill\nInspect the repository before responding.');
        expect(files[0]?.parsed.attributes['dynamicContextSources']).toEqual([
            {
                id: 'repo_status',
                label: 'Repo status',
                command: 'git status',
                declaredSafetyClass: 'safe',
                required: true,
            },
            {
                id: 'repo_diff',
                label: 'Repo diff',
                command: 'git diff',
                declaredSafetyClass: 'safe',
                required: false,
            },
        ]);
    });
});
