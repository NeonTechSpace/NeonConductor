import { describe, expect, it } from 'vitest';

import {
    buildRuntimeRunOptions,
    getModeBehaviorFlags,
    getModeWorkflowCapabilities,
    modeHasBehaviorFlag,
    modeHasWorkflowCapability,
    modeIsCheckpointEligible,
    modeMutatesWorkspace,
    modeRequiresNativeTools,
    modeShowsPlanArtifactSurface,
    modeSupportsOrchestrationWorkflow,
    modeSupportsPlanningWorkflow,
    modeUsesReadOnlyExecution,
    type ConversationModeOption,
} from '@/web/components/conversation/shell/workspace/helpers';

function createMode(input: {
    modeKey: string;
    planningOnly?: boolean;
    toolCapabilities?: ConversationModeOption['executionPolicy']['toolCapabilities'];
    workflowCapabilities?: ConversationModeOption['executionPolicy']['workflowCapabilities'];
    behaviorFlags?: ConversationModeOption['executionPolicy']['behaviorFlags'];
}): ConversationModeOption {
    return {
        id: `mode_${input.modeKey}`,
        modeKey: input.modeKey,
        label: input.modeKey,
        executionPolicy: {
            ...(input.planningOnly !== undefined ? { planningOnly: input.planningOnly } : {}),
            ...(input.toolCapabilities ? { toolCapabilities: input.toolCapabilities } : {}),
            ...(input.workflowCapabilities ? { workflowCapabilities: input.workflowCapabilities } : {}),
            ...(input.behaviorFlags ? { behaviorFlags: input.behaviorFlags } : {}),
        },
    };
}

describe('runtime run options', () => {
    it('keeps reasoning enabled when the model supports it', () => {
        expect(
            buildRuntimeRunOptions({
                supportsReasoning: true,
                reasoningEffort: 'high',
            })
        ).toEqual({
            reasoning: {
                effort: 'high',
                summary: 'auto',
                includeEncrypted: false,
            },
            cache: {
                strategy: 'auto',
            },
            transport: {
                family: 'auto',
            },
        });
    });

    it('turns reasoning fully off when the model does not support it', () => {
        expect(
            buildRuntimeRunOptions({
                supportsReasoning: false,
                reasoningEffort: 'high',
            })
        ).toEqual({
            reasoning: {
                effort: 'none',
                summary: 'none',
                includeEncrypted: false,
            },
            cache: {
                strategy: 'auto',
            },
            transport: {
                family: 'auto',
            },
        });
    });
});

describe('conversation shell mode helpers', () => {
    it('derives workflow and behavior capability metadata from the mode policy', () => {
        const mode = createMode({
            modeKey: 'custom_plan',
            workflowCapabilities: ['planning', 'artifact_view', 'planning'],
            behaviorFlags: ['approval_gated', 'artifact_producing', 'approval_gated'],
        });

        expect(getModeWorkflowCapabilities(mode)).toEqual(['planning', 'artifact_view']);
        expect(modeHasWorkflowCapability(mode, 'planning')).toBe(true);
        expect(modeSupportsPlanningWorkflow(mode)).toBe(true);
        expect(modeSupportsOrchestrationWorkflow(mode)).toBe(false);
        expect(getModeBehaviorFlags(mode)).toEqual(['approval_gated', 'artifact_producing']);
        expect(modeHasBehaviorFlag(mode, 'approval_gated')).toBe(true);
        expect(modeUsesReadOnlyExecution(mode)).toBe(false);
        expect(modeIsCheckpointEligible(mode)).toBe(false);
        expect(modeMutatesWorkspace(mode)).toBe(false);
        expect(modeShowsPlanArtifactSurface(mode)).toBe(true);
    });

    it('keeps planningOnly as a compatibility fallback for legacy plan modes', () => {
        expect(modeSupportsPlanningWorkflow(createMode({ modeKey: 'plan', planningOnly: true }))).toBe(true);
        expect(modeRequiresNativeTools(createMode({ modeKey: 'plan', planningOnly: true }))).toBe(false);
    });

    it('treats a mode as tool-capable when the backend mode metadata allows tools', () => {
        expect(modeRequiresNativeTools(createMode({ modeKey: 'chat', toolCapabilities: [] }))).toBe(false);
        expect(modeRequiresNativeTools(createMode({ modeKey: 'ask', toolCapabilities: ['filesystem_read'] }))).toBe(
            true
        );
        expect(
            modeRequiresNativeTools(createMode({ modeKey: 'orchestrate', toolCapabilities: ['filesystem_read'] }))
        ).toBe(true);
        expect(
            modeRequiresNativeTools(createMode({ modeKey: 'code', toolCapabilities: ['filesystem_read', 'shell'] }))
        ).toBe(true);
    });

    it('recognizes orchestration-capable modes without relying on built-in names', () => {
        const mode = createMode({
            modeKey: 'custom_orchestrator',
            workflowCapabilities: ['orchestration', 'artifact_view'],
            behaviorFlags: ['checkpoint_eligible', 'workspace_mutating'],
            toolCapabilities: ['filesystem_read', 'shell'],
        });

        expect(modeSupportsOrchestrationWorkflow(mode)).toBe(true);
        expect(modeSupportsPlanningWorkflow(mode)).toBe(false);
        expect(modeRequiresNativeTools(mode)).toBe(true);
    });
});
