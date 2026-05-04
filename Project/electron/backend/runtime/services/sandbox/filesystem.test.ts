import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { closePersistence, resetPersistenceForTests } from '@/app/backend/persistence/db';
import {
    createManagedSandbox,
    removeManagedSandbox,
    toManagedSandboxRoot,
} from '@/app/backend/runtime/services/sandbox/filesystem';

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

describe('removeManagedSandbox', () => {
    it('refuses to remove a sandbox path outside the active managed sandbox root', async () => {
        const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-sandbox-remove-'));
        const dbPath = path.join(tempRoot, 'runtime', 'alpha', 'neonconductor.db');
        const externalSandboxPath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-external-sandbox-'));
        const externalFilePath = path.join(externalSandboxPath, 'keep.txt');
        writeFileSync(externalFilePath, 'do not delete\n', 'utf8');

        try {
            resetPersistenceForTests(dbPath);

            const removed = await removeManagedSandbox({
                sandboxPath: externalSandboxPath,
                removeFiles: true,
            });

            expect(removed.ok).toBe(false);
            if (removed.ok) {
                throw new Error('Expected external sandbox removal to fail closed.');
            }
            expect(removed.error.reason).toBe('unsafe_path');
            expect(readFileSync(externalFilePath, 'utf8')).toBe('do not delete\n');
        } finally {
            closePersistence();
            rmSync(tempRoot, { recursive: true, force: true });
            rmSync(externalSandboxPath, { recursive: true, force: true });
        }
    });

    it('refuses to remove the managed sandbox root itself', async () => {
        const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-sandbox-root-remove-'));
        const dbPath = path.join(tempRoot, 'runtime', 'alpha', 'neonconductor.db');

        try {
            resetPersistenceForTests(dbPath);
            const managedSandboxRoot = toManagedSandboxRoot();

            const removed = await removeManagedSandbox({
                sandboxPath: managedSandboxRoot,
                removeFiles: true,
            });

            expect(removed.ok).toBe(false);
            if (removed.ok) {
                throw new Error('Expected managed sandbox root removal to fail closed.');
            }
            expect(removed.error.reason).toBe('unsafe_path');
            expect(existsSync(path.dirname(managedSandboxRoot))).toBe(true);
        } finally {
            closePersistence();
            rmSync(tempRoot, { recursive: true, force: true });
        }
    });
});
