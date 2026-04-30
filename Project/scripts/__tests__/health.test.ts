import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildHealthSteps, parseHealthProfile } from '@/scripts/health';
import { resolvePnpmInvocation, runHealthSteps, type HealthStep } from '@/scripts/healthRunner';

describe('health runner', () => {
    it('builds ordered quick and ci profiles from canonical health steps', () => {
        expect(buildHealthSteps('quick').map((step) => step.id)).toEqual([
            'generated-check',
            'format-check',
            'lint',
            'typecheck-renderer',
            'typecheck-node',
            'test',
            'health-baseline',
        ]);

        expect(buildHealthSteps('ci').map((step) => step.id)).toEqual([
            'generated-check',
            'format-check',
            'lint',
            'typecheck-renderer',
            'typecheck-node',
            'test',
            'health-baseline',
            'build-app',
            'agents-audit',
        ]);
    });

    it('parses explicit profile arguments', () => {
        expect(parseHealthProfile(['--profile=full'])).toBe('full');
        expect(parseHealthProfile(['baseline'])).toBe('baseline');
        expect(() => parseHealthProfile(['legacy'])).toThrow(/Unsupported health profile/);
    });

    it('resolves Windows pnpm through the Node entrypoint instead of spawning cmd shims directly', () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'health-runner-pnpm-'));
        const binDir = path.join(tempDir, 'tools', 'pnpm', '10.28.2', 'bin');
        const pnpmCjsPath = path.join(tempDir, 'tools', 'pnpm', '10.28.2', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
        try {
            mkdirSync(binDir, { recursive: true });
            mkdirSync(path.dirname(pnpmCjsPath), { recursive: true });
            writeFileSync(pnpmCjsPath, 'module.exports = {};\n', 'utf8');

            const invocation = resolvePnpmInvocation('win32', { PATH: binDir });

            expect(invocation).toEqual({
                command: process.execPath,
                argsPrefix: [pnpmCjsPath],
            });
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('fails only when required steps fail', async () => {
        const steps: HealthStep[] = [
            {
                id: 'required-pass',
                label: 'Required pass',
                requirement: 'required',
                command: 'pnpm',
                args: [],
            },
            {
                id: 'advisory-fail',
                label: 'Advisory fail',
                requirement: 'advisory',
                command: 'pnpm',
                args: [],
            },
        ];

        const advisoryOnly = await runHealthSteps({
            profile: 'test',
            steps,
            runner: (step) => Promise.resolve(step.id === 'advisory-fail' ? 1 : 0),
            now: () => 0,
        });

        expect(advisoryOnly.exitCode).toBe(0);
        expect(advisoryOnly.failedAdvisoryCount).toBe(1);

        const requiredFailure = await runHealthSteps({
            profile: 'test',
            steps,
            runner: (step) => Promise.resolve(step.id === 'required-pass' ? 1 : 0),
            now: () => 0,
        });

        expect(requiredFailure.exitCode).toBe(1);
        expect(requiredFailure.failedRequiredCount).toBe(1);
    });
});
