import { describe, expect, it } from 'vitest';

import { parseOrchestratorStartInput } from '@/app/backend/runtime/contracts/parsers/orchestrator';

const runtimeOptions = {
    reasoning: {
        effort: 'medium',
        summary: 'auto',
        includeEncrypted: false,
    },
    cache: {
        strategy: 'auto',
    },
    transport: {
        family: 'auto',
    },
};

describe('orchestrator parsers', () => {
    it.each(['sequential', 'parallel', 'swarm'] as const)('accepts %s execution strategy', (executionStrategy) => {
        expect(
            parseOrchestratorStartInput({
                profileId: 'profile_default',
                planId: 'plan_1',
                runtimeOptions,
                executionStrategy,
            }).executionStrategy
        ).toBe(executionStrategy);
    });

    it('normalizes legacy delegate execution strategy to sequential', () => {
        expect(
            parseOrchestratorStartInput({
                profileId: 'profile_default',
                planId: 'plan_1',
                runtimeOptions,
                executionStrategy: 'delegate',
            }).executionStrategy
        ).toBe('sequential');
    });

    it('rejects unknown execution strategies', () => {
        expect(() =>
            parseOrchestratorStartInput({
                profileId: 'profile_default',
                planId: 'plan_1',
                runtimeOptions,
                executionStrategy: 'serial',
            })
        ).toThrow(/executionStrategy/);
    });
});
