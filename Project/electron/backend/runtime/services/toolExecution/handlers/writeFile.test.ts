import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { writeFileToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers/writeFile';

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

describe('writeFileToolHandler', () => {
    it('fails closed when called without resolved execution-root authority', async () => {
        const result = await writeFileToolHandler({
            path: 'notes.txt',
            content: 'body',
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected write_file to reject missing execution-root authority.');
        }
        expect(result.error).toEqual({
            code: 'execution_failed',
            message: 'Tool "write_file" requires resolved execution-root authority.',
        });
    });

    it('creates a new UTF-8 file and reports deterministic metadata', async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-write-file-create-'));
        tempDirs.push(tempDir);
        const filePath = path.join(tempDir, 'notes.txt');

        const result = await writeFileToolHandler(
            {
                path: filePath,
                content: 'line 1\nline 2',
            },
            workspaceContext(tempDir)
        );

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(readFileSync(filePath, 'utf8')).toBe('line 1\nline 2');
        expect(result.value).toEqual({
            path: filePath,
            byteLength: Buffer.byteLength('line 1\nline 2', 'utf8'),
            lineCount: 2,
            overwroteExisting: false,
            createdParentDirectories: false,
        });
    });

    it('auto-creates missing parent directories', async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-write-file-parents-'));
        tempDirs.push(tempDir);
        const filePath = path.join(tempDir, 'nested', 'deeper', 'created.txt');

        const result = await writeFileToolHandler(
            {
                path: filePath,
                content: 'created',
            },
            workspaceContext(tempDir)
        );

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(existsSync(filePath)).toBe(true);
        expect(result.value['createdParentDirectories']).toBe(true);
    });

    it('fails when the target exists and overwrite is not enabled', async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-write-file-existing-'));
        tempDirs.push(tempDir);
        const filePath = path.join(tempDir, 'existing.txt');
        writeFileSync(filePath, 'original', 'utf8');

        const result = await writeFileToolHandler(
            {
                path: filePath,
                content: 'replacement',
            },
            workspaceContext(tempDir)
        );

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected write_file to fail without overwrite.');
        }

        expect(result.error).toEqual({
            code: 'execution_failed',
            message: 'Target file already exists. Set "overwrite" to true to replace it.',
        });
        expect(readFileSync(filePath, 'utf8')).toBe('original');
    });

    it('replaces an existing file only when overwrite is true', async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-write-file-overwrite-'));
        tempDirs.push(tempDir);
        const filePath = path.join(tempDir, 'existing.txt');
        writeFileSync(filePath, 'original', 'utf8');

        const result = await writeFileToolHandler(
            {
                path: filePath,
                content: 'replacement',
                overwrite: true,
            },
            workspaceContext(tempDir)
        );

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(readFileSync(filePath, 'utf8')).toBe('replacement');
        expect(result.value['overwroteExisting']).toBe(true);
    });

    it('fails when the target path is a directory', async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-write-file-directory-'));
        tempDirs.push(tempDir);

        const result = await writeFileToolHandler(
            {
                path: tempDir,
                content: 'invalid',
            },
            workspaceContext(tempDir)
        );

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected write_file to reject directory targets.');
        }

        expect(result.error).toEqual({
            code: 'execution_failed',
            message: 'write_file cannot replace a directory path.',
        });
    });
});
