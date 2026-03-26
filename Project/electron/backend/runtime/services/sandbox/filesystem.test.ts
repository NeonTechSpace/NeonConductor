import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createManagedSandbox } from '@/app/backend/runtime/services/sandbox/filesystem';

describe('createManagedSandbox', () => {
    it('fails closed when the target sandbox path already exists', async () => {
        const workspaceRootPath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-sandbox-workspace-'));
        const targetPath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-sandbox-target-'));
        const targetFilePath = path.join(targetPath, 'keep.txt');

        writeFileSync(path.join(workspaceRootPath, 'source.txt'), 'workspace source\n', 'utf8');
        writeFileSync(targetFilePath, 'do not delete\n', 'utf8');

        try {
            const created = await createManagedSandbox({
                workspaceRootPath,
                targetPath,
            });

            expect(created.ok).toBe(false);
            if (created.ok) {
                throw new Error('Expected sandbox creation to fail for an existing target path.');
            }
            expect(created.error.reason).toBe('create_failed');
            expect(readFileSync(targetFilePath, 'utf8')).toBe('do not delete\n');
        } finally {
            rmSync(workspaceRootPath, { recursive: true, force: true });
            rmSync(targetPath, { recursive: true, force: true });
        }
    });
});
