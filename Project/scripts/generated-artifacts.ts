import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolvePnpmInvocation } from '@/scripts/healthRunner';

type GeneratedArtifactRunner = (command: string, args: string[], options: { cwd: string }) => Promise<number>;

export interface GeneratedArtifactsResult {
    status: 'current' | 'stale' | 'failed';
    staleArtifacts: string[];
    failedStep?: string;
}

async function defaultRunner(command: string, args: string[], options: { cwd: string }): Promise<number> {
    const { spawn } = await import('node:child_process');
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            stdio: 'inherit',
        });
        child.once('error', reject);
        child.once('exit', (code) => {
            resolve(code ?? 1);
        });
    });
}

function readOptionalFile(filePath: string): string | null {
    return existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;
}

function restoreFile(filePath: string, content: string | null): void {
    if (content === null) {
        rmSync(filePath, { force: true });
        return;
    }

    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
}

export async function checkGeneratedArtifacts(
    options: {
        cwd?: string;
        runner?: GeneratedArtifactRunner;
        routeTreePath?: string;
    } = {}
): Promise<GeneratedArtifactsResult> {
    const cwd = options.cwd ?? process.cwd();
    const runner = options.runner ?? defaultRunner;
    const staleArtifacts: string[] = [];
    const pnpm = resolvePnpmInvocation();

    const migrationExit = await runner(
        pnpm.command,
        [...pnpm.argsPrefix, 'exec', 'tsx', 'scripts/generate-migrations.ts', '--check'],
        {
            cwd,
        }
    );
    if (migrationExit !== 0) {
        staleArtifacts.push('electron/backend/persistence/generatedMigrations.ts');
        staleArtifacts.push('electron/backend/persistence/generatedSchemaMetadata.ts');
    }

    const routeTreePath = options.routeTreePath ?? path.join(cwd, 'src', 'routeTree.gen.ts');
    const routeTreeBefore = readOptionalFile(routeTreePath);
    const routeExit = await runner(pnpm.command, [...pnpm.argsPrefix, 'exec', 'tsr', 'generate'], { cwd });
    const routeTreeAfter = readOptionalFile(routeTreePath);
    restoreFile(routeTreePath, routeTreeBefore);

    if (routeExit !== 0) {
        return {
            status: 'failed',
            staleArtifacts,
            failedStep: 'route-tree',
        };
    }

    if (routeTreeBefore !== routeTreeAfter) {
        staleArtifacts.push('src/routeTree.gen.ts');
    }

    return {
        status: staleArtifacts.length > 0 ? 'stale' : 'current',
        staleArtifacts,
    };
}

export async function updateGeneratedArtifacts(
    options: {
        cwd?: string;
        runner?: GeneratedArtifactRunner;
    } = {}
): Promise<GeneratedArtifactsResult> {
    const cwd = options.cwd ?? process.cwd();
    const runner = options.runner ?? defaultRunner;
    const pnpm = resolvePnpmInvocation();

    const migrationExit = await runner(
        pnpm.command,
        [...pnpm.argsPrefix, 'exec', 'tsx', 'scripts/generate-migrations.ts'],
        { cwd }
    );
    if (migrationExit !== 0) {
        return {
            status: 'failed',
            staleArtifacts: [],
            failedStep: 'migrations',
        };
    }

    const routeExit = await runner(pnpm.command, [...pnpm.argsPrefix, 'exec', 'tsr', 'generate'], { cwd });
    if (routeExit !== 0) {
        return {
            status: 'failed',
            staleArtifacts: [],
            failedStep: 'route-tree',
        };
    }

    return {
        status: 'current',
        staleArtifacts: [],
    };
}

export function formatGeneratedArtifactsResult(result: GeneratedArtifactsResult): string {
    const lines = ['Generated artifacts check', `status: ${result.status}`];
    if (result.failedStep) {
        lines.push(`failed-step: ${result.failedStep}`);
    }
    if (result.staleArtifacts.length > 0) {
        lines.push('', '## Stale artifacts');
        for (const artifact of result.staleArtifacts) {
            lines.push(`- ${artifact}`);
        }
    }
    return lines.join('\n');
}

function isDirectExecution(importMetaUrl: string): boolean {
    const entryPath = process.argv[1];
    if (!entryPath) {
        return false;
    }

    return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

if (isDirectExecution(import.meta.url)) {
    const command = process.argv.includes('--check') ? checkGeneratedArtifacts : updateGeneratedArtifacts;
    command()
        .then((result) => {
            process.stdout.write(`${formatGeneratedArtifactsResult(result)}\n`);
            if (result.status !== 'current') {
                process.exitCode = 1;
            }
        })
        .catch((error: unknown) => {
            process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
            process.exitCode = 1;
        });
}
