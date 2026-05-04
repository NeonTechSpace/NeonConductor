import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolvePnpmInvocation } from '@/scripts/healthRunner';

export type AlphaEvalStatus = 'passed' | 'failed';

export interface AlphaEvalScenario {
    id: string;
    title: string;
    command: string;
    args: string[];
}

export interface AlphaEvalScenarioResult extends AlphaEvalScenario {
    status: AlphaEvalStatus;
    exitCode: number | null;
    elapsedMs: number;
}

export interface AlphaEvalReport {
    status: AlphaEvalStatus;
    scenarios: AlphaEvalScenarioResult[];
}

export type AlphaEvalCommandRunner = (
    scenario: AlphaEvalScenario,
    options: SpawnOptionsWithoutStdio
) => Promise<number | null>;

function createVitestScenario(id: string, title: string, testFiles: string[]): AlphaEvalScenario {
    const pnpm = resolvePnpmInvocation();
    return {
        id,
        title,
        command: pnpm.command,
        args: [...pnpm.argsPrefix, 'exec', 'vitest', 'run', ...testFiles, '--fileParallelism=false'],
    };
}

export function buildAlphaEvalScenarios(): AlphaEvalScenario[] {
    return [
        createVitestScenario('run-contracts-and-receipts', 'Run contracts and execution receipts stay inspectable', [
            'electron/backend/runtime/services/runContract/service.test.ts',
            'src/components/conversation/panels/sessionOutboxPanel.test.tsx',
            'src/components/conversation/sessions/sessionWorkspacePanel.test.ts',
        ]),
        createVitestScenario(
            'dynamic-skill-context',
            'Dynamic skill context resolves safely and stays approval-gated',
            ['electron/backend/runtime/services/sessionSkills/dynamicContextResolver.test.ts']
        ),
        createVitestScenario('memory-retrieval-retention-promotion', 'Memory retrieval and promotion remain bounded', [
            'electron/backend/runtime/services/memory/retrieval.test.ts',
            'electron/backend/trpc/__tests__/runtime-contracts.memory.test.ts',
        ]),
        createVitestScenario('rule-skill-promotion', 'Rule and skill promotions preserve provenance', [
            'electron/backend/trpc/__tests__/runtime-contracts.registry.test.ts',
        ]),
        createVitestScenario('cloud-session-boundaries', 'Cloud-session authority boundaries remain explicit', [
            'electron/backend/trpc/__tests__/runtime-contracts.core.test.ts',
            'electron/backend/trpc/__tests__/runtime-contracts.provider-auth.test.ts',
            'src/components/conversation/panels/cloudSessionsPanel.test.tsx',
        ]),
        createVitestScenario(
            'repo-research-acceptance',
            'Repo-research checkout awareness remains backend-owned and replayable',
            [
                'electron/backend/runtime/services/researchCheckouts/service.test.ts',
                'electron/backend/trpc/__tests__/runtime-contracts.repo-research.test.ts',
            ]
        ),
        createVitestScenario(
            'prompt-orchestration-hardening',
            'Prompt orchestration remains runtime-owned, typed, and eval-gated',
            [
                'electron/backend/runtime/services/runExecution/contextPrelude.test.ts',
                'electron/shared/workerPresetCatalog.test.ts',
                'src/components/settings/modesSettings/modesInstructionsControllerShared.test.ts',
            ]
        ),
    ];
}

export function defaultAlphaEvalCommandRunner(
    scenario: AlphaEvalScenario,
    options: SpawnOptionsWithoutStdio
): Promise<number | null> {
    return new Promise((resolve, reject) => {
        const child = spawn(scenario.command, scenario.args, {
            ...options,
            stdio: 'inherit',
        });

        child.once('error', reject);
        child.once('exit', (code) => {
            resolve(code);
        });
    });
}

export async function runAlphaEvalScenarios(
    input: {
        scenarios?: AlphaEvalScenario[];
        runner?: AlphaEvalCommandRunner;
        cwd?: string;
        env?: NodeJS.ProcessEnv;
        now?: () => number;
    } = {}
): Promise<AlphaEvalReport> {
    const scenarios = input.scenarios ?? buildAlphaEvalScenarios();
    const runner = input.runner ?? defaultAlphaEvalCommandRunner;
    const now = input.now ?? Date.now;
    const results: AlphaEvalScenarioResult[] = [];

    for (const scenario of scenarios) {
        const startedAt = now();
        let exitCode: number | null;
        try {
            exitCode = await runner(scenario, {
                cwd: input.cwd ?? process.cwd(),
                env: input.env ?? process.env,
            });
        } catch {
            exitCode = 1;
        }

        results.push({
            ...scenario,
            status: exitCode === 0 ? 'passed' : 'failed',
            exitCode,
            elapsedMs: Math.max(0, now() - startedAt),
        });
    }

    return {
        status: results.some((result) => result.status === 'failed') ? 'failed' : 'passed',
        scenarios: results,
    };
}

export function formatAlphaEvalReport(report: AlphaEvalReport): string {
    return [
        'First-alpha internal eval report',
        `status: ${report.status}`,
        '',
        ...report.scenarios.map(
            (scenario) =>
                `- ${scenario.status.toUpperCase()} [${scenario.id}] ${scenario.title} (${String(
                    scenario.elapsedMs
                )}ms)` + (scenario.exitCode === 0 ? '' : ` exit=${String(scenario.exitCode)}`)
        ),
    ].join('\n');
}

function isDirectExecution(importMetaUrl: string): boolean {
    const entryPath = process.argv[1];
    if (!entryPath) {
        return false;
    }

    return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

if (isDirectExecution(import.meta.url)) {
    const report = await runAlphaEvalScenarios();
    if (process.argv.includes('--json')) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatAlphaEvalReport(report)}\n`);
    }

    if (process.argv.includes('--check') && report.status !== 'passed') {
        process.exitCode = 1;
    }
}
