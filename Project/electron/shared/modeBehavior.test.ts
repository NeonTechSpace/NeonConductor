import { describe, expect, it } from 'vitest';

import {
    getModeBehaviorFlags,
    getModeToolCapabilities,
    getModeWorkflowCapabilities,
    modeAllowsToolCapabilities,
    modeCanExecuteRuns,
    modeIsCheckpointEligible,
    modeMutatesWorkspace,
    modeRequiresNativeTools,
    modeShowsPlanArtifactSurface,
    modeSupportsOrchestrationWorkflow,
    modeSupportsPlanningWorkflow,
    modeUsesReadOnlyExecution,
} from '@/shared/modeBehavior';

function buildMode(input?: {
    planningOnly?: boolean;
    toolCapabilities?: string[];
    workflowCapabilities?: string[];
    behaviorFlags?: string[];
}): {
    executionPolicy: {
        planningOnly?: boolean;
        toolCapabilities?: string[];
        workflowCapabilities?: string[];
        behaviorFlags?: string[];
    };
} {
    return {
        executionPolicy: {
            ...(input?.planningOnly ? { planningOnly: true } : {}),
            ...(input?.toolCapabilities ? { toolCapabilities: input.toolCapabilities } : {}),
            ...(input?.workflowCapabilities ? { workflowCapabilities: input.workflowCapabilities } : {}),
            ...(input?.behaviorFlags ? { behaviorFlags: input.behaviorFlags } : {}),
        },
    };
}

describe('modeBehavior', () => {
    it('derives capability metadata without duplicating repeated values', () => {
        const mode = buildMode({
            toolCapabilities: ['filesystem_read', 'shell', 'filesystem_read'],
            workflowCapabilities: ['planning', 'artifact_view', 'planning'],
            behaviorFlags: ['approval_gated', 'artifact_producing', 'approval_gated'],
        });

        expect(getModeToolCapabilities(mode.executionPolicy as never)).toEqual(['filesystem_read', 'shell']);
        expect(getModeWorkflowCapabilities(mode.executionPolicy as never)).toEqual(['planning', 'artifact_view']);
        expect(getModeBehaviorFlags(mode.executionPolicy as never)).toEqual(['approval_gated', 'artifact_producing']);
        expect(modeAllowsToolCapabilities(mode as never, ['filesystem_read'])).toBe(true);
        expect(modeAllowsToolCapabilities(mode as never, ['filesystem_write'])).toBe(false);
    });

    it('keeps planningOnly as a narrow compatibility fallback for legacy planning modes', () => {
        const mode = buildMode({
            planningOnly: true,
            toolCapabilities: ['filesystem_read', 'shell'],
        });

        expect(modeSupportsPlanningWorkflow(mode as never)).toBe(true);
        expect(modeUsesReadOnlyExecution(mode as never)).toBe(true);
        expect(modeCanExecuteRuns(mode as never)).toBe(false);
        expect(modeRequiresNativeTools(mode as never)).toBe(false);
    });

    it('treats planning workflow and read-only execution as separate declarations for new modes', () => {
        const mode = buildMode({
            workflowCapabilities: ['planning'],
            toolCapabilities: ['filesystem_read', 'shell'],
        });

        expect(modeSupportsPlanningWorkflow(mode as never)).toBe(true);
        expect(modeUsesReadOnlyExecution(mode as never)).toBe(false);
        expect(modeCanExecuteRuns(mode as never)).toBe(false);
        expect(modeRequiresNativeTools(mode as never)).toBe(false);
    });

    it('treats orchestration and checkpoint mutability as separate declarative behaviors', () => {
        const mode = buildMode({
            toolCapabilities: ['filesystem_read', 'shell'],
            workflowCapabilities: ['orchestration', 'artifact_view'],
            behaviorFlags: ['checkpoint_eligible', 'workspace_mutating'],
        });

        expect(modeSupportsPlanningWorkflow(mode as never)).toBe(false);
        expect(modeSupportsOrchestrationWorkflow(mode as never)).toBe(true);
        expect(modeShowsPlanArtifactSurface(mode as never)).toBe(true);
        expect(modeIsCheckpointEligible(mode as never)).toBe(true);
        expect(modeMutatesWorkspace(mode as never)).toBe(true);
        expect(modeRequiresNativeTools(mode as never)).toBe(true);
    });
});
