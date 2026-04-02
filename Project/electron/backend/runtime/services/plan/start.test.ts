import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    planStore: {
        create: vi.fn(),
        getProjectionById: vi.fn(),
    },
    resolveModesForTab: vi.fn(),
    appendPlanStartedEvent: vi.fn(),
    appendPlanQuestionRequestedEvents: vi.fn(),
    createInitialPlanSummary: vi.fn(),
    createPlanIntakeQuestions: vi.fn(),
    requirePlanView: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    planStore: mocks.planStore,
}));

vi.mock('@/app/backend/runtime/services/registry/service', () => ({
    resolveModesForTab: mocks.resolveModesForTab,
}));

vi.mock('@/app/backend/runtime/services/plan/events', () => ({
    appendPlanStartedEvent: mocks.appendPlanStartedEvent,
    appendPlanQuestionRequestedEvents: mocks.appendPlanQuestionRequestedEvents,
}));

vi.mock('@/app/backend/runtime/services/plan/intake', () => ({
    createInitialPlanSummary: mocks.createInitialPlanSummary,
    createPlanIntakeQuestions: mocks.createPlanIntakeQuestions,
}));

vi.mock('@/app/backend/runtime/services/plan/views', () => ({
    requirePlanView: mocks.requirePlanView,
}));

import { startPlanFlow } from '@/app/backend/runtime/services/plan/start';

function buildPlanningMode(modeKey: string, workflowCapabilities?: string[]) {
    return {
        id: `mode_${modeKey}`,
        profileId: 'profile_default',
        topLevelTab: 'agent',
        modeKey,
        label: modeKey,
        assetKey: `agent.${modeKey}`,
        prompt: {},
        executionPolicy: {
            ...(workflowCapabilities ? { workflowCapabilities } : {}),
        },
        source: 'test',
        sourceKind: 'system_seed',
        scope: 'system',
        enabled: true,
        precedence: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

describe('startPlanFlow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.createInitialPlanSummary.mockReturnValue('summary');
        mocks.createPlanIntakeQuestions.mockReturnValue([{ id: 'q1', question: 'Question', required: true }]);
        mocks.planStore.create.mockResolvedValue({
            id: 'plan_1',
            currentRevisionId: 'prev_1',
            currentRevisionNumber: 1,
            currentVariantId: 'var_1',
            topLevelTab: 'agent',
            modeKey: 'custom_plan',
        });
        mocks.planStore.getProjectionById.mockResolvedValue({ projection: 'plan' });
        mocks.requirePlanView.mockReturnValue({ id: 'plan_1' });
        mocks.appendPlanStartedEvent.mockResolvedValue(undefined);
        mocks.appendPlanQuestionRequestedEvents.mockResolvedValue(undefined);
    });

    it('accepts capability-driven planning modes', async () => {
        mocks.resolveModesForTab.mockResolvedValue([buildPlanningMode('custom_plan', ['planning'])]);

        const result = await startPlanFlow({
            profileId: 'profile_default',
            sessionId: 'sess_1' as never,
            topLevelTab: 'agent',
            modeKey: 'custom_plan',
            prompt: 'Draft a migration plan',
        });

        expect(result.isOk()).toBe(true);
        expect(mocks.planStore.create).toHaveBeenCalled();
    });

    it('rejects non-planning modes', async () => {
        mocks.resolveModesForTab.mockResolvedValue([buildPlanningMode('custom_code')]);

        const result = await startPlanFlow({
            profileId: 'profile_default',
            sessionId: 'sess_1' as never,
            topLevelTab: 'agent',
            modeKey: 'custom_code',
            prompt: 'Execute the plan',
        });

        expect(result.isErr()).toBe(true);
        expect(mocks.planStore.create).not.toHaveBeenCalled();
    });
});
