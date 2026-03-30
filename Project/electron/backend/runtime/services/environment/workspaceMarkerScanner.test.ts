import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { workspaceMarkerScanner } from '@/app/backend/runtime/services/environment/workspaceMarkerScanner';

describe('workspaceMarkerScanner', () => {
    afterEach(() => {
        // No shared process state to restore.
    });

    it('detects workspace markers from the filesystem and trims the input path', async () => {
        const workspaceRootPath = mkdtempSync(path.join(os.tmpdir(), 'nc-marker-'));
        mkdirSync(path.join(workspaceRootPath, '.jj'));
        mkdirSync(path.join(workspaceRootPath, '.git'));
        writeFileSync(path.join(workspaceRootPath, 'package.json'), '{}', 'utf8');
        writeFileSync(path.join(workspaceRootPath, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0', 'utf8');
        writeFileSync(path.join(workspaceRootPath, 'package-lock.json'), '{}', 'utf8');
        writeFileSync(path.join(workspaceRootPath, 'yarn.lock'), '', 'utf8');
        writeFileSync(path.join(workspaceRootPath, 'bun.lock'), '', 'utf8');
        writeFileSync(path.join(workspaceRootPath, 'tsconfig.json'), '{}', 'utf8');
        writeFileSync(path.join(workspaceRootPath, 'pyproject.toml'), '[project]\nname = "demo"', 'utf8');
        writeFileSync(path.join(workspaceRootPath, 'requirements.txt'), 'requests', 'utf8');

        const markers = await workspaceMarkerScanner.scanWorkspaceMarkers(`  ${workspaceRootPath}  `);

        expect(markers).toEqual({
            hasJjDirectory: true,
            hasGitDirectory: true,
            hasPackageJson: true,
            hasPnpmLock: true,
            hasPackageLock: true,
            hasYarnLock: true,
            hasBunLock: true,
            hasTsconfigJson: true,
            hasPyprojectToml: true,
            hasRequirementsTxt: true,
        });
    });

    it('treats bun.lockb as a bun workspace marker', async () => {
        const workspaceRootPath = mkdtempSync(path.join(os.tmpdir(), 'nc-bun-marker-'));
        writeFileSync(path.join(workspaceRootPath, 'bun.lockb'), 'binary-lock', 'utf8');

        const markers = await workspaceMarkerScanner.scanWorkspaceMarkers(workspaceRootPath);

        expect(markers.hasBunLock).toBe(true);
        expect(markers.hasJjDirectory).toBe(false);
        expect(markers.hasGitDirectory).toBe(false);
    });
});
