import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { listFilesToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers/listFiles';
import type { ToolOutputEntry } from '@/app/backend/runtime/services/toolExecution/types';

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

function createListingWorkspace(fileCount: number): string {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-list-files-'));
    tempDirs.push(tempDir);
    mkdirSync(path.join(tempDir, 'src'));
    for (let index = 0; index < fileCount; index += 1) {
        const indexText = String(index);
        writeFileSync(
            path.join(tempDir, 'src', `file-${indexText}.ts`),
            `export const value${indexText} = ${indexText};`,
            'utf8'
        );
    }

    return tempDir;
}

describe('listFilesToolHandler', () => {
    it('fails closed when called without resolved execution-root authority', async () => {
        const result = await listFilesToolHandler({ path: '.', recursive: false });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected list_files to reject missing execution-root authority.');
        }
        expect(result.error).toEqual({
            code: 'execution_failed',
            message: 'Tool "list_files" requires resolved execution-root authority.',
        });
    });

    it('keeps small directory listings inline while still attaching the shared artifact candidate', async () => {
        const workspacePath = createListingWorkspace(5);

        const result = await listFilesToolHandler(
            {
                path: workspacePath,
                recursive: true,
                maxEntries: 20,
            },
            workspaceContext(workspacePath)
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value['entries'] as ToolOutputEntry[]).toHaveLength(6);
        expect(result.value['artifactCandidate']).toMatchObject({
            kind: 'directory_listing',
            contentType: 'text/plain',
        });
    });

    it('stores full raw listing payloads while returning only a bounded preview for oversized listings', async () => {
        const workspacePath = createListingWorkspace(260);

        const result = await listFilesToolHandler(
            {
                path: workspacePath,
                recursive: true,
                maxEntries: 400,
            },
            workspaceContext(workspacePath)
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value['entries'] as ToolOutputEntry[]).toHaveLength(50);
        expect(result.value['truncated']).toBe(true);
        const artifactCandidate = result.value['artifactCandidate'] as {
            kind: string;
            rawText: string;
        };
        expect(artifactCandidate.kind).toBe('directory_listing');
        expect(artifactCandidate.rawText).toContain('file-259.ts');
    });
});
