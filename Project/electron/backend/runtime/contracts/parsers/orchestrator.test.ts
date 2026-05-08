import { describe, expect, it } from 'vitest';

import {
    parseOrchestratorLazyCheckpointResolutionInput,
    parseOrchestratorLazyStartInput,
    parseOrchestratorStartInput,
} from '@/app/backend/runtime/contracts/parsers/orchestrator';

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
    it.each(['sequential', 'parallel', 'swarm', 'lazy'] as const)('accepts %s execution strategy', (executionStrategy) => {
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

    it('parses Lazy start objective policy', () => {
        expect(
            parseOrchestratorLazyStartInput({
                profileId: 'profile_default',
                sessionId: 'sess_1',
                objectiveMarkdown: 'Build the thing.',
                successCriteriaMarkdown: 'It works.',
                constraintsMarkdown: 'Do not add dependencies.',
                evidenceRequirementsMarkdown: 'Show tests.',
                allowedCapabilityGroups: ['repo_discovery', 'implementation', 'verification'],
                researchDepth: 'balanced',
                packagePolicy: 'avoid_new',
                runtimeOptions,
            })
        ).toMatchObject({
            objectiveMarkdown: 'Build the thing.',
            allowedCapabilityGroups: ['repo_discovery', 'implementation', 'verification'],
            researchDepth: 'balanced',
            packagePolicy: 'avoid_new',
        });
    });

    it('rejects invalid Lazy capability groups', () => {
        expect(() =>
            parseOrchestratorLazyStartInput({
                profileId: 'profile_default',
                sessionId: 'sess_1',
                objectiveMarkdown: 'Build the thing.',
                allowedCapabilityGroups: ['unbounded_shell'],
                researchDepth: 'balanced',
                packagePolicy: 'avoid_new',
                runtimeOptions,
            })
        ).toThrow(/allowedCapabilityGroups/);
    });

    it('parses Lazy checkpoint resolution only for terminal checkpoint actions', () => {
        expect(
            parseOrchestratorLazyCheckpointResolutionInput({
                profileId: 'profile_default',
                checkpointId: 'lchk_1',
                status: 'resolved',
                responseMarkdown: 'Use option A.',
            })
        ).toMatchObject({
            checkpointId: 'lchk_1',
            status: 'resolved',
            responseMarkdown: 'Use option A.',
        });
    });
});
