import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock, vendoredRipgrepResolverResolveMock } = vi.hoisted(() => ({
    spawnMock: vi.fn(),
    vendoredRipgrepResolverResolveMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
    spawn: spawnMock,
}));

vi.mock('@/app/backend/runtime/services/environment/vendoredRipgrepResolver', () => ({
    vendoredRipgrepResolver: {
        resolve: vendoredRipgrepResolverResolveMock,
    },
}));

import { searchFilesToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers/searchFiles';

const tempDirs: string[] = [];

function createWorkspace(): string {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neon-search-files-'));
    tempDirs.push(tempDir);
    return tempDir;
}

function workspaceContext(rootPath: string) {
    return {
        executionRoot: {
            kind: 'workspace' as const,
            label: 'Test workspace',
            absolutePath: rootPath,
        },
    };
}

function createMockChildProcess() {
    const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
        kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn(() => {
        process.nextTick(() => {
            child.emit('close', null, 'SIGTERM');
        });
    });
    return child;
}

describe('searchFilesToolHandler', () => {
    beforeEach(() => {
        spawnMock.mockReset();
        vendoredRipgrepResolverResolveMock.mockReset();
        for (const tempDir of tempDirs.splice(0)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('fails closed when called without resolved execution-root authority', async () => {
        const result = await searchFilesToolHandler({
            query: 'value',
            path: '.',
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected search_files to reject missing execution-root authority.');
        }
        expect(result.error).toEqual({
            code: 'execution_failed',
            message: 'Tool "search_files" requires resolved execution-root authority.',
        });
    });

    it('returns structured fixed-string matches from ripgrep json output', async () => {
        const workspacePath = createWorkspace();
        vendoredRipgrepResolverResolveMock.mockResolvedValue({
            available: true,
            executablePath: 'C:/vendor/rg.exe',
        });
        spawnMock.mockImplementation(() => {
            const child = createMockChildProcess();
            process.nextTick(() => {
                child.stdout.write(
                    `${JSON.stringify({
                        type: 'match',
                        data: {
                            path: { text: 'C:/workspace/src/example.ts' },
                            lines: { text: 'const ExampleValue = value;\n' },
                            line_number: 12,
                            submatches: [{ start: 6, end: 13 }],
                        },
                    })}\n`
                );
                child.stdout.end();
                child.stderr.end();
                child.emit('close', 0, null);
            });
            return child;
        });

        const result = await searchFilesToolHandler(
            {
                query: 'Example',
                path: workspacePath,
            },
            workspaceContext(workspacePath)
        );

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value['searchedPath']).toBe(path.normalize(workspacePath));
        expect(result.value['matchCount']).toBe(1);
        expect(result.value['truncated']).toBe(false);
        expect(result.value['matches']).toEqual([
            {
                path: 'C:/workspace/src/example.ts',
                lineNumber: 12,
                columnNumber: 7,
                lineText: 'const ExampleValue = value;',
            },
        ]);
        expect(result.value['artifactCandidate']).toMatchObject({
            kind: 'search_results',
            contentType: 'text/plain',
        });
        expect(spawnMock).toHaveBeenCalledWith(
            'C:/vendor/rg.exe',
            expect.arrayContaining(['--json', '--fixed-strings', '--no-config', '--ignore-case', '--', 'Example']),
            expect.objectContaining({
                windowsHide: true,
            })
        );
    });

    it('enforces the hard match limit and marks results as truncated', async () => {
        const workspacePath = createWorkspace();
        vendoredRipgrepResolverResolveMock.mockResolvedValue({
            available: true,
            executablePath: '/vendor/rg',
        });
        const child = createMockChildProcess();
        spawnMock.mockReturnValue(child);

        const resultPromise = searchFilesToolHandler(
            {
                query: 'value',
                path: workspacePath,
                maxMatches: 1,
            },
            workspaceContext(workspacePath)
        );

        process.nextTick(() => {
            child.stdout.write(
                `${JSON.stringify({
                    type: 'match',
                    data: {
                        path: { text: '/workspace/a.ts' },
                        lines: { text: 'value value\\n' },
                        line_number: 1,
                        submatches: [
                            { start: 0, end: 5 },
                            { start: 6, end: 11 },
                        ],
                    },
                })}\n`
            );
        });

        const result = await resultPromise;
        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value['matchCount']).toBe(1);
        expect(result.value['truncated']).toBe(true);
        expect(child.kill).toHaveBeenCalledTimes(1);
    });

    it('fails clearly when the vendored ripgrep binary is missing', async () => {
        const workspacePath = createWorkspace();
        vendoredRipgrepResolverResolveMock.mockResolvedValue({
            available: false,
            reason: 'missing_asset',
        });

        const result = await searchFilesToolHandler(
            {
                query: 'value',
                path: workspacePath,
            },
            workspaceContext(workspacePath)
        );

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected a failed result.');
        }

        expect(result.error).toEqual({
            code: 'execution_failed',
            message: 'The vendored ripgrep binary is missing. Run the ripgrep vendor step before using search_files.',
        });
    });
});
