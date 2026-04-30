import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { formatHealthRunResult, healthStep, runHealthSteps, type HealthStep } from '@/scripts/healthRunner';

export type HealthProfile = 'baseline' | 'quick' | 'ci' | 'full' | 'alpha-exit';

export function parseHealthProfile(argv: string[] = process.argv.slice(2)): HealthProfile {
    const explicitProfile = argv.find((argument) => argument.startsWith('--profile='))?.slice('--profile='.length);
    const profile = explicitProfile ?? argv[0] ?? 'quick';
    if (
        profile === 'baseline' ||
        profile === 'quick' ||
        profile === 'ci' ||
        profile === 'full' ||
        profile === 'alpha-exit'
    ) {
        return profile;
    }

    throw new Error(`Unsupported health profile "${profile}".`);
}

export function buildHealthSteps(profile: HealthProfile): HealthStep[] {
    const baseline = [
        healthStep('health-baseline', 'Durable health baseline', 'required', [
            'exec',
            'tsx',
            'scripts/health-baseline.ts',
            '--check',
            '--worklist',
        ]),
    ];
    const quick = [
        healthStep('generated-check', 'Generated artifacts are current', 'required', [
            'exec',
            'tsx',
            'scripts/generated-artifacts.ts',
            '--check',
        ]),
        healthStep('format-check', 'Formatting is current', 'required', ['run', 'format:check']),
        healthStep('lint', 'ESLint passes', 'required', ['run', 'lint']),
        healthStep('typecheck-renderer', 'Renderer TypeScript passes', 'required', [
            'exec',
            'tsc',
            '--noEmit',
            '-p',
            'tsconfig.renderer.json',
        ]),
        healthStep('typecheck-node', 'Node/Electron TypeScript passes', 'required', [
            'exec',
            'tsc',
            '--noEmit',
            '-p',
            'tsconfig.node.json',
        ]),
        healthStep('test', 'Vitest suite passes', 'required', ['run', 'test']),
        ...baseline,
    ];
    const ci = [
        ...quick,
        healthStep('build-app', 'Application build passes', 'required', ['run', 'build:app']),
        healthStep('agents-audit', 'Blocking AGENTS conformance passes', 'required', [
            'exec',
            'tsx',
            'scripts/audit-agents-conformance.ts',
        ]),
    ];
    const full = [
        ...ci,
        healthStep('desktop-doctor-packaged', 'Packaged desktop runtime doctor passes', 'required', [
            'exec',
            'tsx',
            'scripts/doctor-desktop.ts',
        ]),
        healthStep('desktop-doctor-dev', 'Development desktop runtime doctor passes', 'required', [
            'exec',
            'tsx',
            'scripts/doctor-desktop.ts',
            '--scope=development',
        ]),
    ];
    const alphaExit = [
        ...full,
        healthStep('alpha-acceptance', 'First-alpha exit criteria are complete', 'required', [
            'exec',
            'tsx',
            'scripts/alpha-acceptance.ts',
            '--check',
        ]),
    ];

    switch (profile) {
        case 'baseline':
            return baseline;
        case 'quick':
            return quick;
        case 'ci':
            return ci;
        case 'full':
            return full;
        case 'alpha-exit':
            return alphaExit;
    }
}

function isDirectExecution(importMetaUrl: string): boolean {
    const entryPath = process.argv[1];
    if (!entryPath) {
        return false;
    }

    return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

if (isDirectExecution(import.meta.url)) {
    const profile = parseHealthProfile();
    try {
        const result = await runHealthSteps({
            profile,
            steps: buildHealthSteps(profile),
        });
        process.stdout.write(`${formatHealthRunResult(result)}\n`);
        process.exitCode = result.exitCode;
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
