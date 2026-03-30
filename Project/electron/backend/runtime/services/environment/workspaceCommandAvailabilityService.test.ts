import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({
    spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
    spawn: spawnMock,
}));

import { workspaceCommandAvailabilityService } from '@/app/backend/runtime/services/environment/workspaceCommandAvailabilityService';

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

describe('workspaceCommandAvailabilityService', () => {
    const originalPath = process.env.PATH;
    const originalPlatform = process.platform;

    afterEach(() => {
        spawnMock.mockReset();
        process.env.PATH = originalPath;
        Object.defineProperty(process, 'platform', {
            value: originalPlatform,
            configurable: true,
        });
        vi.restoreAllMocks();
    });

    it('uses platform-specific lookup commands and preserves resolved executable paths', async () => {
        Object.defineProperty(process, 'platform', {
            value: 'win32',
            configurable: true,
        });
        process.env.PATH = 'C:\\Tools';
        vi.spyOn(Date, 'now').mockReturnValue(1_000);
        queueSpawnResponses({
            jj: 'C:\\Tools\\jj.exe',
            node: 'C:\\Tools\\node.exe',
            tsx: 'C:\\Tools\\tsx.cmd',
        });

        const availability = await workspaceCommandAvailabilityService.getAvailableCommands('win32');

        expect(spawnMock).toHaveBeenCalled();
        expect(spawnMock.mock.calls.every(([file]) => file === 'where.exe')).toBe(true);
        expect(availability.jj).toEqual({
            available: true,
            executablePath: 'C:\\Tools\\jj.exe',
        });
        expect(availability.git.available).toBe(false);
        expect(availability.node).toEqual({
            available: true,
            executablePath: 'C:\\Tools\\node.exe',
        });
        expect(availability.tsx).toEqual({
            available: true,
            executablePath: 'C:\\Tools\\tsx.cmd',
        });
    });

    it('refreshes cached availability when PATH changes', async () => {
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true,
        });
        vi.spyOn(Date, 'now').mockReturnValue(1_000);
        process.env.PATH = '/opt/bin';
        queueSpawnResponses({
            git: '/opt/bin/git',
            node: '/opt/bin/node',
        });

        const firstAvailability = await workspaceCommandAvailabilityService.getAvailableCommands('linux');
        const firstCallCount = spawnMock.mock.calls.length;

        process.env.PATH = '/usr/local/bin';
        vi.spyOn(Date, 'now').mockReturnValue(1_500);
        queueSpawnResponses({
            git: '/usr/local/bin/git',
            node: '/usr/local/bin/node',
        });

        const refreshedAvailability = await workspaceCommandAvailabilityService.getAvailableCommands('linux');

        expect(firstAvailability.git).toEqual({
            available: true,
            executablePath: '/opt/bin/git',
        });
        expect(refreshedAvailability.git).toEqual({
            available: true,
            executablePath: '/usr/local/bin/git',
        });
        expect(spawnMock.mock.calls.length).toBeGreaterThan(firstCallCount);
    });
});
