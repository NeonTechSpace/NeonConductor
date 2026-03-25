import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({
    spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
    spawn: spawnMock,
}));

import { workspaceEnvironmentService } from '@/app/backend/runtime/services/environment/service';

function queueSpawnResponses(responses: Partial<Record<string, string>>) {
    spawnMock.mockImplementation((_file: string, args: string[]) => {
        const child = new EventEmitter() as EventEmitter & {
            stdout: PassThrough;
            stderr: PassThrough;
        };
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();

        process.nextTick(() => {
            const command = args[0] ?? '';
            const resolvedPath = responses[command];
            if (resolvedPath) {
                child.stdout.write(`${resolvedPath}\n`);
                child.stdout.end();
                child.emit('close', 0);
                return;
            }

            child.stdout.end();
            child.emit('close', 1);
        });

        return child;
    });
}

describe('workspaceEnvironmentService', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
        spawnMock.mockReset();
    });

    afterAll(() => {
        Object.defineProperty(process, 'platform', {
            value: originalPlatform,
            configurable: true,
        });
    });

    it('detects jj and pnpm-oriented workspaces on Windows-shaped execution', async () => {
        Object.defineProperty(process, 'platform', {
            value: 'win32',
            configurable: true,
        });
        queueSpawnResponses({
            jj: 'C:\\Tools\\jj.exe',
            git: 'C:\\Tools\\git.exe',
            node: 'C:\\Tools\\node.exe',
            pnpm: 'C:\\Tools\\pnpm.cmd',
            tsx: 'C:\\Tools\\tsx.cmd',
        });

        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'nc-env-win-'));
        mkdirSync(path.join(workspacePath, '.jj'));
        mkdirSync(path.join(workspacePath, '.git'));
        writeFileSync(path.join(workspacePath, 'package.json'), '{}', 'utf8');
        writeFileSync(path.join(workspacePath, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0', 'utf8');
        writeFileSync(path.join(workspacePath, 'tsconfig.json'), '{}', 'utf8');

        const result = await workspaceEnvironmentService.inspectWorkspaceEnvironment({
            workspaceRootPath: workspacePath,
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value.platform).toBe('win32');
        expect(result.value.shellFamily).toBe('powershell');
        expect(result.value.detectedPreferences.vcs).toBe('jj');
        expect(result.value.effectivePreferences.vcs.family).toBe('jj');
        expect(result.value.detectedPreferences.packageManager).toBe('pnpm');
        expect(result.value.effectivePreferences.packageManager.family).toBe('pnpm');
        expect(result.value.effectivePreferences.scriptRunner).toBe('tsx');
        expect(result.value.notes).toContain(
            'This workspace appears to be jj-managed. Prefer jj for repo inspection and history operations.'
        );
        expect(result.value.notes).toContain('This workspace prefers pnpm.');
    });

    it('surfaces override mismatches without fabricating command availability', async () => {
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true,
        });
        queueSpawnResponses({
            git: '/usr/bin/git',
            node: '/usr/bin/node',
            npm: '/usr/bin/npm',
        });

        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'nc-env-linux-'));
        mkdirSync(path.join(workspacePath, '.git'));
        writeFileSync(path.join(workspacePath, 'package.json'), '{}', 'utf8');
        writeFileSync(path.join(workspacePath, 'package-lock.json'), '{}', 'utf8');

        const result = await workspaceEnvironmentService.inspectWorkspaceEnvironment({
            workspaceRootPath: workspacePath,
            overrides: {
                preferredVcs: 'jj',
                preferredPackageManager: 'pnpm',
            },
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value.platform).toBe('linux');
        expect(result.value.detectedPreferences.vcs).toBe('git');
        expect(result.value.effectivePreferences.vcs.family).toBe('jj');
        expect(result.value.effectivePreferences.vcs.mismatch).toBe(true);
        expect(result.value.detectedPreferences.packageManager).toBe('npm');
        expect(result.value.effectivePreferences.packageManager.family).toBe('pnpm');
        expect(result.value.effectivePreferences.packageManager.mismatch).toBe(true);
        expect(result.value.notes).toContain('The pinned VCS preference "jj" is not available on this machine.');
        expect(result.value.notes).toContain(
            'The pinned package manager preference "pnpm" is not available on this machine.'
        );
    });
});
