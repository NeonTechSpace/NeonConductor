import { formatRuntimeCapabilityIssue, type RunStartRejectedResultLike } from '@/web/lib/runtimeCapabilityIssue';

import type { ModeDefinitionRecord } from '@/app/backend/persistence/types';

import type {
    EntityId,
    EntityIdPrefix,
    RuntimeProviderId,
    RuntimeReasoningEffort,
    RuntimeRunOptions,
} from '@/shared/contracts';
import { providerIds } from '@/shared/contracts';
import {
    getModeBehaviorFlags as getModeBehaviorFlagsForPolicy,
    getModeWorkflowCapabilities as getModeWorkflowCapabilitiesForPolicy,
    modeCanExecuteRuns,
    modeHasBehaviorFlag,
    modeHasWorkflowCapability,
    modeIsCheckpointEligible,
    modeMutatesWorkspace,
    modeRequiresNativeTools,
    modeShowsPlanArtifactSurface,
    modeSupportsOrchestrationWorkflow,
    modeSupportsPlanningWorkflow,
    modeUsesReadOnlyExecution,
} from '@/shared/modeBehavior';

export {
    modeCanExecuteRuns,
    modeHasBehaviorFlag,
    modeHasWorkflowCapability,
    modeIsCheckpointEligible,
    modeMutatesWorkspace,
    modeRequiresNativeTools,
    modeShowsPlanArtifactSurface,
    modeSupportsOrchestrationWorkflow,
    modeSupportsPlanningWorkflow,
    modeUsesReadOnlyExecution,
};

export const DEFAULT_REASONING_EFFORT: RuntimeReasoningEffort = 'medium';

const DEFAULT_RUN_OPTION_BASE: Pick<RuntimeRunOptions, 'cache' | 'transport'> = {
    cache: {
        strategy: 'auto',
    },
    transport: {
        family: 'auto',
    },
};

export function buildRuntimeRunOptions(input: {
    supportsReasoning: boolean;
    reasoningEffort: RuntimeReasoningEffort;
}): RuntimeRunOptions {
    const effectiveReasoningEffort = input.supportsReasoning ? input.reasoningEffort : 'none';
    const shouldRequestReasoning = input.supportsReasoning && effectiveReasoningEffort !== 'none';

    return {
        reasoning: {
            effort: effectiveReasoningEffort,
            summary: shouldRequestReasoning ? 'auto' : 'none',
            includeEncrypted: false,
        },
        ...DEFAULT_RUN_OPTION_BASE,
    };
}

export const DEFAULT_RUN_OPTIONS = buildRuntimeRunOptions({
    supportsReasoning: true,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
});

export interface RunTargetSelection {
    providerId: RuntimeProviderId;
    modelId: string;
}

export type ConversationModeOption = Pick<ModeDefinitionRecord, 'id' | 'modeKey' | 'label' | 'executionPolicy'>;

export function getModeWorkflowCapabilities(mode: ConversationModeOption | undefined) {
    return mode ? getModeWorkflowCapabilitiesForPolicy(mode.executionPolicy) : [];
}

export function getModeBehaviorFlags(mode: ConversationModeOption | undefined) {
    return mode ? getModeBehaviorFlagsForPolicy(mode.executionPolicy) : [];
}

export function isEntityId<P extends EntityIdPrefix>(value: string | undefined, prefix: P): value is EntityId<P> {
    return typeof value === 'string' && value.startsWith(`${prefix}_`) && value.length > prefix.length + 1;
}

export function isProviderId(value: string | undefined): value is RuntimeProviderId {
    if (!value) {
        return false;
    }

    return providerIds.some((providerId) => providerId === value);
}

export function formatRunStartRejection(input: {
    rejection: RunStartRejectedResultLike;
    providerById: Map<RuntimeProviderId, { label: string }>;
}): string {
    const formatInput = {
        surface: 'run_rejection' as const,
        providerById: input.providerById,
        ...(input.rejection.action ? { issue: input.rejection.action } : {}),
        ...(input.rejection.message ? { message: input.rejection.message } : {}),
    };

    return formatRuntimeCapabilityIssue(formatInput);
}
