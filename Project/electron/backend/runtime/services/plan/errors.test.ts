import { describe, expect, it } from 'vitest';

import type { ModeDefinition } from '@/app/backend/runtime/contracts';
import { validatePlanStartInput } from '@/app/backend/runtime/services/plan/errors';

function buildPlanningMode(input?: {
    workflowCapabilities?: ModeDefinition['executionPolicy']['workflowCapabilities'];
    planningOnly?: boolean;
}): Pick<ModeDefinition, 'modeKey' | 'topLevelTab' | 'executionPolicy'> {
    return {
        modeKey: 'custom_plan',
        topLevelTab: 'agent',
        executionPolicy: {
            ...(input?.planningOnly ? { planningOnly: true } : {}),
            ...(input?.workflowCapabilities ? { workflowCapabilities: input.workflowCapabilities } : {}),
        },
    };
}

describe('validatePlanStartInput', () => {
    it('accepts capability-driven planning modes on supported tabs', () => {
        const result = validatePlanStartInput(
            {
                profileId: 'profile_default',
                sessionId: 'sess_1' as never,
                topLevelTab: 'agent',
                modeKey: 'custom_plan',
                prompt: 'Draft a migration plan',
            },
            buildPlanningMode({ workflowCapabilities: ['planning'] })
        );

        expect(result.isOk()).toBe(true);
    });

    it('accepts legacy planningOnly modes for compatibility', () => {
        const result = validatePlanStartInput(
            {
                profileId: 'profile_default',
                sessionId: 'sess_1' as never,
                topLevelTab: 'orchestrator',
                modeKey: 'plan',
                prompt: 'Plan the rollout',
            },
            buildPlanningMode({ planningOnly: true })
        );

        expect(result.isOk()).toBe(true);
    });

    it('rejects non-planning modes', () => {
        const result = validatePlanStartInput(
            {
                profileId: 'profile_default',
                sessionId: 'sess_1' as never,
                topLevelTab: 'agent',
                modeKey: 'custom_code',
                prompt: 'Execute the plan',
            },
            buildPlanningMode()
        );

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr().code).toBe('invalid_mode');
    });

    it('rejects chat tab planning flow', () => {
        const result = validatePlanStartInput(
            {
                profileId: 'profile_default',
                sessionId: 'sess_1' as never,
                topLevelTab: 'chat',
                modeKey: 'custom_plan',
                prompt: 'Draft a migration plan',
            },
            buildPlanningMode({ workflowCapabilities: ['planning'] })
        );

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr().code).toBe('invalid_tab');
    });
});
