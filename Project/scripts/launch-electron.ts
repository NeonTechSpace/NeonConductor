import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveElectronChildEnv } from '@/app/main/runtime/electronChildEnv';

import { scriptLog } from '@/scripts/logger';

const requireFromLaunchElectron = createRequire(import.meta.url);

type ElectronSpawn = (
    command: string,
    args: string[],
    options: {
        cwd: string;
        env: NodeJS.ProcessEnv;
        stdio: 'inherit';
    }
) => ChildProcess;

export interface LaunchElectronOptions {
    argv?: string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    spawnElectron?: ElectronSpawn;
}

export function resolveElectronExecutablePath(): string {
    const electronExecutablePath: unknown = requireFromLaunchElectron('electron');
    if (typeof electronExecutablePath !== 'string' || electronExecutablePath.trim().length === 0) {
        throw new Error('Expected the local electron package to resolve to an executable path.');
    }

    return electronExecutablePath;
}

export function resolveLaunchElectronEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    return resolveElectronChildEnv(baseEnv);
}

export function resolveLaunchElectronArgs(argv: string[] = process.argv.slice(2)): string[] {
    return ['.', ...argv];
}

export async function launchElectron(options: LaunchElectronOptions = {}): Promise<number> {
    const child = (options.spawnElectron ?? spawn)(
        resolveElectronExecutablePath(),
        resolveLaunchElectronArgs(options.argv),
        {
            cwd: options.cwd ?? process.cwd(),
            env: resolveLaunchElectronEnv(options.env),
            stdio: 'inherit',
        }
    );

    return new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (typeof code === 'number') {
                resolve(code);
                return;
            }

            scriptLog.warn({
                tag: 'desktop.launch',
                message: 'Electron exited without a numeric code.',
                signal,
            });
            resolve(1);
        });
    });
}

function isDirectExecution(importMetaUrl: string): boolean {
    const entryPath = process.argv[1];
    if (!entryPath) {
        return false;
    }

    return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

if (isDirectExecution(import.meta.url)) {
    launchElectron()
        .then((exitCode) => {
            process.exitCode = exitCode;
        })
        .catch((error: unknown) => {
            scriptLog.error({
                tag: 'desktop.launch',
                message: 'Failed to launch Electron.',
                ...(error instanceof Error ? { error: error.message } : { error: String(error) }),
            });
            process.exitCode = 1;
        });
}
