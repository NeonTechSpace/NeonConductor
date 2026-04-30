import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export type HealthStepRequirement = 'required' | 'advisory';
export type HealthStepStatus = 'passed' | 'failed';

export interface HealthStep {
    id: string;
    label: string;
    requirement: HealthStepRequirement;
    command: string;
    args: string[];
}

export interface HealthStepResult extends HealthStep {
    status: HealthStepStatus;
    exitCode: number | null;
    elapsedMs: number;
}

export interface HealthRunResult {
    profile: string;
    results: HealthStepResult[];
    failedRequiredCount: number;
    failedAdvisoryCount: number;
    exitCode: number;
}

export type HealthCommandRunner = (step: HealthStep, options: SpawnOptionsWithoutStdio) => Promise<number | null>;

export interface CommandInvocation {
    command: string;
    argsPrefix: string[];
}

function splitPathEntries(env: NodeJS.ProcessEnv): string[] {
    const pathValue = env['PATH'] ?? env['Path'] ?? '';
    return pathValue
        .split(path.delimiter)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

function findPnpmCjsOnPath(env: NodeJS.ProcessEnv): string | null {
    for (const pathEntry of splitPathEntries(env)) {
        const pnpmCjsPath = path.resolve(pathEntry, '..', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
        if (existsSync(pnpmCjsPath)) {
            return pnpmCjsPath;
        }
    }

    return null;
}

export function resolvePnpmInvocation(
    platform: NodeJS.Platform = process.platform,
    env: NodeJS.ProcessEnv = process.env
): CommandInvocation {
    if (platform === 'win32') {
        const pnpmCjsPath = findPnpmCjsOnPath(env);
        if (pnpmCjsPath) {
            return {
                command: process.execPath,
                argsPrefix: [pnpmCjsPath],
            };
        }

        return {
            command: 'pnpm.cmd',
            argsPrefix: [],
        };
    }

    return {
        command: 'pnpm',
        argsPrefix: [],
    };
}

export function resolvePnpmCommand(platform: NodeJS.Platform = process.platform): string {
    return resolvePnpmInvocation(platform).command;
}

export const healthStep = (
    id: string,
    label: string,
    requirement: HealthStepRequirement,
    args: string[]
): HealthStep => {
    const pnpm = resolvePnpmInvocation();
    return {
        id,
        label,
        requirement,
        command: pnpm.command,
        args: [...pnpm.argsPrefix, ...args],
    };
};

export function defaultHealthCommandRunner(
    step: HealthStep,
    options: SpawnOptionsWithoutStdio
): Promise<number | null> {
    return new Promise((resolve, reject) => {
        const child = spawn(step.command, step.args, {
            ...options,
            stdio: 'inherit',
        });

        child.once('error', reject);
        child.once('exit', (code) => {
            resolve(code);
        });
    });
}

export async function runHealthSteps(input: {
    profile: string;
    steps: HealthStep[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    runner?: HealthCommandRunner;
    now?: () => number;
}): Promise<HealthRunResult> {
    const runner = input.runner ?? defaultHealthCommandRunner;
    const now = input.now ?? Date.now;
    const results: HealthStepResult[] = [];

    for (const step of input.steps) {
        const startedAt = now();
        let exitCode: number | null;
        try {
            exitCode = await runner(step, {
                cwd: input.cwd ?? process.cwd(),
                env: input.env ?? process.env,
            });
        } catch {
            exitCode = 1;
        }

        results.push({
            ...step,
            status: exitCode === 0 ? 'passed' : 'failed',
            exitCode,
            elapsedMs: Math.max(0, now() - startedAt),
        });
    }

    const failedRequiredCount = results.filter(
        (result) => result.requirement === 'required' && result.status === 'failed'
    ).length;
    const failedAdvisoryCount = results.filter(
        (result) => result.requirement === 'advisory' && result.status === 'failed'
    ).length;

    return {
        profile: input.profile,
        results,
        failedRequiredCount,
        failedAdvisoryCount,
        exitCode: failedRequiredCount > 0 ? 1 : 0,
    };
}

export function formatHealthRunResult(result: HealthRunResult): string {
    const lines = [
        `Health profile: ${result.profile}`,
        `required failures: ${String(result.failedRequiredCount)}`,
        `advisory failures: ${String(result.failedAdvisoryCount)}`,
        '',
    ];

    for (const step of result.results) {
        lines.push(
            `- ${step.status.toUpperCase()} [${step.requirement}] ${step.id} (${String(step.elapsedMs)}ms)` +
                (step.exitCode === 0 ? '' : ` exit=${String(step.exitCode)}`)
        );
    }

    return lines.join('\n');
}
