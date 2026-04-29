import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readFileToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers/readFile';

const fileReadGuardServiceMock = vi.hoisted(() => ({
    enforceFile: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/fileReadGuard/service', () => ({
    fileReadGuardService: fileReadGuardServiceMock,
}));

const tempDirs: string[] = [];

function workspaceContext(rootPath: string) {
    return {
        executionRoot: {
            kind: 'workspace' as const,
            label: 'Test workspace',
            absolutePath: rootPath,
        },
    };
}

afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
        rmSync(tempDir, { recursive: true, force: true });
    }
});

beforeEach(() => {
    fileReadGuardServiceMock.enforceFile.mockReset();
    fileReadGuardServiceMock.enforceFile.mockResolvedValue({
        isErr: () => false,
    });
});

describe('readFileToolHandler', () => {
    it('fails closed when called without resolved execution-root authority', async () => {
        const result = await readFileToolHandler({ path: 'README.md' });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected read_file to reject missing execution-root authority.');
        }
        expect(result.error).toEqual({
            code: 'execution_failed',
            message: 'Tool "read_file" requires resolved execution-root authority.',
        });
    });

    it('keeps small files inline while still attaching the shared artifact candidate', async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-read-file-inline-'));
        tempDirs.push(tempDir);
        const filePath = path.join(tempDir, 'README.md');
        writeFileSync(filePath, 'small file body', 'utf8');

        const result = await readFileToolHandler({ path: filePath }, workspaceContext(tempDir));
        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value['content']).toBe('small file body');
        expect(result.value['truncated']).toBe(false);
        expect(result.value['artifactCandidate']).toMatchObject({
            kind: 'file_read',
            contentType: 'text/plain',
            rawText: 'small file body',
        });
    });

    it('preserves full raw text in the artifact candidate while previewing oversized files', async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-read-file-artifact-'));
        tempDirs.push(tempDir);
        const filePath = path.join(tempDir, 'big.log');
        const rawText = `header\n${'x'.repeat(40_000)}`;
        writeFileSync(filePath, rawText, 'utf8');

        const result = await readFileToolHandler({ path: filePath }, workspaceContext(tempDir));
        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(String(result.value['content']).length).toBeLessThan(rawText.length);
        expect(result.value['truncated']).toBe(true);
        expect(result.value['content']).not.toBe(rawText);
        expect(result.value['artifactCandidate']).toMatchObject({
            kind: 'file_read',
            rawText,
        });
    });

    it('keeps caller-requested preview truncation semantics while preserving the full raw text', async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-read-file-preview-limit-'));
        tempDirs.push(tempDir);
        const filePath = path.join(tempDir, 'notes.txt');
        const rawText = 'abcdefghijklmnopqrstuvwxyz';
        writeFileSync(filePath, rawText, 'utf8');

        const result = await readFileToolHandler(
            {
                path: filePath,
                maxBytes: 5,
            },
            workspaceContext(tempDir)
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(String(result.value['content'])).toContain('bytes omitted');
        expect(result.value['truncated']).toBe(true);
        expect(result.value['artifactCandidate']).toMatchObject({
            kind: 'file_read',
            rawText,
        });
    });

    it('applies the profile file read guard before returning model-visible file content', async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-read-file-guard-'));
        tempDirs.push(tempDir);
        const filePath = path.join(tempDir, '.env');
        writeFileSync(filePath, 'TOKEN=value', 'utf8');
        fileReadGuardServiceMock.enforceFile.mockResolvedValueOnce({
            isErr: () => true,
            error: {
                message: '".env" looks like a secret or credential file.',
            },
        });

        const result = await readFileToolHandler(
            { path: filePath },
            { ...workspaceContext(tempDir), profileId: 'profile_default' }
        );

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected read_file to reject a blocked path.');
        }
        expect(result.error.message).toContain('secret or credential');
        expect(fileReadGuardServiceMock.enforceFile).toHaveBeenCalledWith(
            expect.objectContaining({
                profileId: 'profile_default',
                fileNameOrPath: filePath,
            })
        );
    });

    it('honors profile read guard allow decisions for readable files', async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-read-file-guard-allow-'));
        tempDirs.push(tempDir);
        const filePath = path.join(tempDir, 'notes.txt');
        writeFileSync(filePath, 'allowed', 'utf8');

        const result = await readFileToolHandler(
            { path: filePath },
            { ...workspaceContext(tempDir), profileId: 'profile_default' }
        );

        expect(result.isOk()).toBe(true);
        expect(fileReadGuardServiceMock.enforceFile).toHaveBeenCalled();
    });
});
