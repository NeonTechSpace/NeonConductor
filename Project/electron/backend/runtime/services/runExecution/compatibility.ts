import { providerStore } from '@/app/backend/persistence/stores';
import type {
    ComposerImageAttachmentInput,
    ModeDefinition,
    RuntimeProviderId,
    RuntimeRunOptions,
    TopLevelTab,
    RunStartRejectionAction,
} from '@/app/backend/runtime/contracts';
import { validateRunCapabilities } from '@/app/backend/runtime/services/runExecution/capabilities';
import { resolveRuntimeProtocol } from '@/app/backend/runtime/services/runExecution/protocol';
import { resolveRunAuth } from '@/app/backend/runtime/services/runExecution/resolveRunAuth';
import type { ResolvedRunAuth } from '@/app/backend/runtime/services/runExecution/types';

function toFallbackIssue(input: {
    providerId: RuntimeProviderId;
    modelId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
}): RunStartRejectionAction {
    return {
        code: 'runtime_options_invalid',
        providerId: input.providerId,
        modelId: input.modelId,
        modeKey: input.modeKey,
        detail: 'generic',
    };
}

export type RunTargetCompatibilityAssessment =
    | {
          compatible: true;
          auth: ResolvedRunAuth;
      }
    | {
          compatible: false;
          issue: RunStartRejectionAction;
      };

interface AssessRunTargetCompatibilityInput {
    profileId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    topLevelTab: TopLevelTab;
    mode: ModeDefinition;
    runtimeOptions: RuntimeRunOptions;
    attachments?: ComposerImageAttachmentInput[];
}

export async function assessRunTargetCompatibility(
    input: AssessRunTargetCompatibilityInput
): Promise<RunTargetCompatibilityAssessment> {
    const authResult = await resolveRunAuth({
        profileId: input.profileId,
        providerId: input.providerId,
    });
    if (authResult.isErr()) {
        return {
            compatible: false,
            issue: authResult.error.action ?? {
                code: 'provider_not_runnable',
                providerId: input.providerId,
            },
        };
    }

    const modelCapabilities = await providerStore.getModelCapabilities(input.profileId, input.providerId, input.modelId);
    if (!modelCapabilities) {
        return {
            compatible: false,
            issue: {
                code: 'model_unavailable',
                providerId: input.providerId,
                modelId: input.modelId,
            },
        };
    }

    const capabilityValidation = validateRunCapabilities({
        providerId: input.providerId,
        modelId: input.modelId,
        modelCapabilities,
        runtimeOptions: input.runtimeOptions,
        topLevelTab: input.topLevelTab,
        mode: input.mode,
    });
    if (capabilityValidation.isErr()) {
        return {
            compatible: false,
            issue:
                capabilityValidation.error.action ??
                toFallbackIssue({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    topLevelTab: input.topLevelTab,
                    modeKey: input.mode.modeKey,
                }),
        };
    }

    if (input.attachments && input.attachments.length > 0 && !modelCapabilities.supportsVision) {
        return {
            compatible: false,
            issue: {
                code: 'model_vision_required',
                providerId: input.providerId,
                modelId: input.modelId,
            },
        };
    }

    const runtimeProtocolResult = await resolveRuntimeProtocol({
        profileId: input.profileId,
        providerId: input.providerId,
        modelId: input.modelId,
        modelCapabilities,
        authMethod: authResult.value.authMethod,
        runtimeOptions: input.runtimeOptions,
    });
    if (runtimeProtocolResult.isErr()) {
        return {
            compatible: false,
            issue:
                runtimeProtocolResult.error.action ??
                toFallbackIssue({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    topLevelTab: input.topLevelTab,
                    modeKey: input.mode.modeKey,
                }),
        };
    }

    return {
        compatible: true,
        auth: authResult.value,
    };
}
