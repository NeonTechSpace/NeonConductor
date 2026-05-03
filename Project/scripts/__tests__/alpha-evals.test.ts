import { describe, expect, it } from 'vitest';

import { buildAlphaEvalScenarios, formatAlphaEvalReport, runAlphaEvalScenarios } from '@/scripts/alpha-evals';

describe('alpha eval report', () => {
    it('keeps first-alpha internal eval scenarios explicit and replayable', () => {
        const scenarios = buildAlphaEvalScenarios();

        expect(scenarios.map((scenario) => scenario.id)).toEqual([
            'run-contracts-and-receipts',
            'dynamic-skill-context',
            'memory-retrieval-retention-promotion',
            'rule-skill-promotion',
            'cloud-session-boundaries',
        ]);
        expect(scenarios.every((scenario) => scenario.args.includes('vitest'))).toBe(true);
        expect(scenarios.every((scenario) => scenario.args.includes('--fileParallelism=false'))).toBe(true);
    });

    it('formats a passing eval report', async () => {
        let now = 0;
        const report = await runAlphaEvalScenarios({
            scenarios: [
                {
                    id: 'alpha',
                    title: 'Alpha scenario',
                    command: 'pnpm',
                    args: [],
                },
            ],
            runner: () => Promise.resolve(0),
            now: () => {
                now += 7;
                return now;
            },
        });

        expect(report.status).toBe('passed');
        expect(formatAlphaEvalReport(report)).toContain('PASSED [alpha] Alpha scenario');
    });

    it('fails when any eval scenario fails', async () => {
        const report = await runAlphaEvalScenarios({
            scenarios: [
                {
                    id: 'passes',
                    title: 'Passing scenario',
                    command: 'pnpm',
                    args: [],
                },
                {
                    id: 'fails',
                    title: 'Failing scenario',
                    command: 'pnpm',
                    args: [],
                },
            ],
            runner: (scenario) => Promise.resolve(scenario.id === 'fails' ? 1 : 0),
            now: () => 0,
        });

        expect(report.status).toBe('failed');
        expect(report.scenarios.find((scenario) => scenario.id === 'fails')?.status).toBe('failed');
    });
});
