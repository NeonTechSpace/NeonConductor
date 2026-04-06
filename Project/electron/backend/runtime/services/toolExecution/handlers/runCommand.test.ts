import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({
    spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
    spawn: spawnMock,
}));

import { workspaceShellResolver } from '@/app/backend/runtime/services/environment/workspaceShellResolver';
import { runCommandToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers/runCommand';

function createSpawnedProcess(input?: {
    stdout?: string | Buffer;
    stderr?: string | Buffer;
    exitCode?: number;
}) {
    const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
        kill: () => void;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();

    process.nextTick(() => {
        if (input?.stdout) {
            child.stdout.write(input.stdout);
        }
        if (input?.stderr) {
            child.stderr.write(input.stderr);
        }
        child.stdout.end();
        child.stderr.end();
        child.emit('close', input?.exitCode ?? 0);
    });

    return child;
}

describe('runCommandToolHandler', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
        spawnMock.mockReset();
        workspaceShellResolver.clearCache();
    });

    afterAll(() => {
        Object.defineProperty(process, 'platform', {
            value: originalPlatform,
            configurable: true,
        });
    });

    it('uses pwsh.exe when the Windows shell resolver finds PowerShell 7 first', async () => {
        Object.defineProperty(process, 'platform', {
            value: 'win32',
            configurable: true,
        });
        spawnMock
            .mockImplementationOnce((_file: string, args: string[]) => {
                expect(args).toEqual(['pwsh.exe']);
                return createSpawnedProcess({
                    stdout: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe\n',
                });
            })
            .mockImplementationOnce((file: string, args: string[]) => {
                expect(file).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe');
                expect(args).toEqual(['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', 'echo hi']);
                return createSpawnedProcess({
                    stdout: 'hi\n',
                });
            });

        const result = await runCommandToolHandler(
            {
                command: 'echo hi',
            },
            {
                cwd: 'C:\\Repo',
            }
        );

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.exitCode).toBe(0);
        expect(result.value.stdout).toContain('hi');
    });

    it('falls back to cmd.exe when PowerShell executables cannot be resolved', async () => {
        Object.defineProperty(process, 'platform', {
            value: 'win32',
            configurable: true,
        });
        spawnMock
            .mockImplementationOnce((_file: string, args: string[]) => {
                expect(args).toEqual(['pwsh.exe']);
                return createSpawnedProcess({ exitCode: 1 });
            })
            .mockImplementationOnce((_file: string, args: string[]) => {
                expect(args).toEqual(['powershell.exe']);
                return createSpawnedProcess({ exitCode: 1 });
            })
            .mockImplementationOnce((_file: string, args: string[]) => {
                expect(args).toEqual(['cmd.exe']);
                return createSpawnedProcess({
                    stdout: 'C:\\Windows\\System32\\cmd.exe\n',
                });
            })
            .mockImplementationOnce((file: string, args: string[]) => {
                expect(file).toBe('C:\\Windows\\System32\\cmd.exe');
                expect(args).toEqual(['/d', '/c', 'echo hi']);
                return createSpawnedProcess({
                    stdout: 'hi\r\n',
                });
            });

        const result = await runCommandToolHandler(
            {
                command: 'echo hi',
            },
            {
                cwd: 'C:\\Repo',
            }
        );

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.exitCode).toBe(0);
        expect(result.value.stdout).toContain('hi');
        expect(spawnMock).toHaveBeenCalledTimes(4);
    });

    it('fails closed on Windows when no supported shell executable is resolved', async () => {
        Object.defineProperty(process, 'platform', {
            value: 'win32',
            configurable: true,
        });
        spawnMock
            .mockImplementationOnce(() => createSpawnedProcess({ exitCode: 1 }))
            .mockImplementationOnce(() => createSpawnedProcess({ exitCode: 1 }))
            .mockImplementationOnce(() => createSpawnedProcess({ exitCode: 1 }));

        const result = await runCommandToolHandler(
            {
                command: 'echo hi',
            },
            {
                cwd: 'C:\\Repo',
            }
        );

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected command execution to fail when no shell could be resolved.');
        }
        expect(result.error).toEqual({
            code: 'execution_failed',
            message: 'No supported shell executable could be resolved for command execution.',
        });
        expect(spawnMock).toHaveBeenCalledTimes(3);
    });

    it('decodes common Windows legacy command output encodings', async () => {
        Object.defineProperty(process, 'platform', {
            value: 'win32',
            configurable: true,
        });
        spawnMock
            .mockImplementationOnce((_file: string, args: string[]) => {
                expect(args).toEqual(['pwsh.exe']);
                return createSpawnedProcess({
                    stdout: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe\n',
                });
            })
            .mockImplementationOnce(() =>
                createSpawnedProcess({
                    stdout: Buffer.from([
                        0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x20, 0xe8, 0xe7, 0x20, 0x50, 0x6f, 0x77, 0x65, 0x72, 0x53,
                        0x68, 0x65, 0x6c, 0x6c,
                    ]),
                })
            );

        const result = await runCommandToolHandler(
            {
                command: 'Write-Output hello',
            },
            {
                cwd: 'C:\\Repo',
            }
        );

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.stdout).toContain('Привет');
    });
});
