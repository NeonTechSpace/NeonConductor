import { spawn } from 'node:child_process';

import type {
    WorkspaceEnvironmentCommandAvailability,
    WorkspaceEnvironmentCommandAvailabilityEntry,
} from '@/app/backend/runtime/contracts/types/runtime';
import type { SupportedPlatform } from '@/app/backend/runtime/services/environment/workspaceEnvironment.types';

const COMMAND_CACHE_TTL_MS = 5_000;
const TRACKED_COMMANDS = ['jj', 'git', 'node', 'python', 'python3', 'pnpm', 'npm', 'yarn', 'bun', 'tsx'] as const;

type TrackedCommand = (typeof TRACKED_COMMANDS)[number];

interface CommandLookupCacheEntry {
    expiresAt: number;
    availability: WorkspaceEnvironmentCommandAvailability;
}

export function resolveSupportedPlatform(): SupportedPlatform {
    if (process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux') {
        return process.platform;
    }

    return 'linux';
}

export function resolveWorkspaceShellFamily(platform: SupportedPlatform): 'powershell' | 'posix_sh' {
    return platform === 'win32' ? 'powershell' : 'posix_sh';
}

function createUnavailableEntry(): WorkspaceEnvironmentCommandAvailabilityEntry {
    return {
        available: false,
    };
}

async function lookupExecutable(
    command: TrackedCommand,
    platform: SupportedPlatform
): Promise<WorkspaceEnvironmentCommandAvailabilityEntry> {
    const lookupCommand = platform === 'win32' ? 'where.exe' : 'which';

    return await new Promise((resolve) => {
        const child = spawn(lookupCommand, [command], {
            windowsHide: true,
        });

        let stdout = '';

        child.stdout.on('data', (chunk: Buffer | string) => {
            stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        });

        child.on('error', () => {
            resolve(createUnavailableEntry());
        });

        child.on('close', (code) => {
            if (code !== 0) {
                resolve(createUnavailableEntry());
                return;
            }

            const executablePath = stdout
                .split(/\r?\n/)
                .map((line) => line.trim())
                .find((line) => line.length > 0);

            resolve(
                executablePath
                    ? {
                          available: true,
                          executablePath,
                      }
                    : createUnavailableEntry()
            );
        });
    });
}

export class WorkspaceCommandAvailabilityService {
    private readonly commandLookupCache = new Map<string, CommandLookupCacheEntry>();

    private createCommandCacheKey(platform: SupportedPlatform): string {
        return `${platform}::${process.env.PATH ?? ''}`;
    }

    async getAvailableCommands(platform: SupportedPlatform = resolveSupportedPlatform()): Promise<WorkspaceEnvironmentCommandAvailability> {
        const cacheKey = this.createCommandCacheKey(platform);
        const now = Date.now();
        const cached = this.commandLookupCache.get(cacheKey);

        if (cached && cached.expiresAt > now) {
            return cached.availability;
        }

        const entries = await Promise.all(
            TRACKED_COMMANDS.map(async (command) => [command, await lookupExecutable(command, platform)] as const)
        );

        const availability: WorkspaceEnvironmentCommandAvailability = {
            jj: entries.find(([command]) => command === 'jj')?.[1] ?? createUnavailableEntry(),
            git: entries.find(([command]) => command === 'git')?.[1] ?? createUnavailableEntry(),
            node: entries.find(([command]) => command === 'node')?.[1] ?? createUnavailableEntry(),
            python: entries.find(([command]) => command === 'python')?.[1] ?? createUnavailableEntry(),
            python3: entries.find(([command]) => command === 'python3')?.[1] ?? createUnavailableEntry(),
            pnpm: entries.find(([command]) => command === 'pnpm')?.[1] ?? createUnavailableEntry(),
            npm: entries.find(([command]) => command === 'npm')?.[1] ?? createUnavailableEntry(),
            yarn: entries.find(([command]) => command === 'yarn')?.[1] ?? createUnavailableEntry(),
            bun: entries.find(([command]) => command === 'bun')?.[1] ?? createUnavailableEntry(),
            tsx: entries.find(([command]) => command === 'tsx')?.[1] ?? createUnavailableEntry(),
        };

        this.commandLookupCache.set(cacheKey, {
            expiresAt: now + COMMAND_CACHE_TTL_MS,
            availability,
        });

        return availability;
    }
}

export const workspaceCommandAvailabilityService = new WorkspaceCommandAvailabilityService();
