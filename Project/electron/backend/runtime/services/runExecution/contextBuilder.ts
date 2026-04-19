import type { OperationalErrorCode } from '@/app/backend/runtime/services/common/operationalError';
import type { WorkspaceEnvironmentSnapshot } from '@/app/backend/runtime/contracts/types/runtime';
import { sessionContextService } from '@/app/backend/runtime/services/context/sessionContextService';
import { buildSessionSystemPrelude } from '@/app/backend/runtime/services/runExecution/contextPrelude';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
    type RunExecutionErrorCode,
} from '@/app/backend/runtime/services/runExecution/errors';
import type { RunContext, RuntimeToolGuidanceContext, StartRunInput } from '@/app/backend/runtime/services/runExecution/types';

import type { ModeDefinition, ResolvedWorkspaceContext, RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

function toRunExecutionErrorCode(code: OperationalErrorCode): RunExecutionErrorCode {
    switch (code) {
        case 'permission_required':
        case 'invalid_mode':
        case 'mode_not_available':
        case 'mode_policy_invalid':
        case 'runtime_option_invalid':
        case 'invalid_payload':
        case 'cache_resolution_failed':
        case 'provider_not_authenticated':
        case 'provider_auth_invalid_state':
        case 'provider_secret_missing':
        case 'provider_auth_unsupported':
        case 'provider_not_supported':
        case 'provider_model_not_available':
        case 'provider_model_missing':
        case 'provider_request_failed':
        case 'provider_request_unavailable':
            return code;
        default:
            return 'provider_request_failed';
    }
}

export async function buildRunContext(input: {
    profileId: string;
    sessionId: `sess_${string}`;
    prompt: string;
    attachments?: StartRunInput['attachments'];
    topLevelTab: TopLevelTab;
    providerId: RuntimeProviderId;
    modelId: string;
    workspaceFingerprint?: string;
    workspaceContext?: ResolvedWorkspaceContext;
    workspaceEnvironmentSnapshot?: WorkspaceEnvironmentSnapshot;
    runtimeToolGuidanceContext?: RuntimeToolGuidanceContext;
    resolvedMode: {
        mode: ModeDefinition;
    };
}): Promise<RunExecutionResult<RunContext | undefined>> {
    const systemPreludeResult = await buildSessionSystemPrelude({
        profileId: input.profileId,
        sessionId: input.sessionId,
        prompt: input.prompt,
        topLevelTab: input.topLevelTab,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
        ...(input.workspaceEnvironmentSnapshot ? { workspaceEnvironmentSnapshot: input.workspaceEnvironmentSnapshot } : {}),
        ...(input.runtimeToolGuidanceContext ? { runtimeToolGuidanceContext: input.runtimeToolGuidanceContext } : {}),
        resolvedMode: input.resolvedMode,
    });
    if (systemPreludeResult.isErr()) {
        return errRunExecution(systemPreludeResult.error.code, systemPreludeResult.error.message, {
            ...(systemPreludeResult.error.action ? { action: systemPreludeResult.error.action } : {}),
        });
    }

    const preparedContext = await sessionContextService.prepareSessionContext({
        profileId: input.profileId,
        sessionId: input.sessionId,
        providerId: input.providerId,
        modelId: input.modelId,
        systemContributorSpecs: systemPreludeResult.value.contributorSpecs,
        attachedSkillfiles: systemPreludeResult.value.attachedSkillfiles,
        preparedContextProfileDefaults: systemPreludeResult.value.preparedContextProfileDefaults,
        modePromptLayerOverrides: systemPreludeResult.value.modePromptLayerOverrides,
        prompt: input.prompt,
        topLevelTab: input.topLevelTab,
        modeKey: input.resolvedMode.mode.modeKey,
        sideEffectMode: 'execution',
        ...(systemPreludeResult.value.resolvedWorkspaceContext
            ? { workspaceContext: systemPreludeResult.value.resolvedWorkspaceContext }
            : {}),
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        ...(input.attachments ? { attachments: input.attachments } : {}),
    });
    if (preparedContext.isErr()) {
        return errRunExecution(toRunExecutionErrorCode(preparedContext.error.code), preparedContext.error.message, {
            ...(preparedContext.error.code === 'permission_required'
                ? {
                      action: {
                          code: 'permission_required' as const,
                          detail: 'dynamic_skill_context' as const,
                          ...(typeof preparedContext.error.details?.['requestId'] === 'string'
                              ? { requestId: preparedContext.error.details['requestId'] }
                              : {}),
                      },
                  }
                : {}),
        });
    }

    return okRunExecution({
        messages: preparedContext.value.messages,
        digest: preparedContext.value.digest,
        ...(preparedContext.value.retrievedMemory ? { retrievedMemory: preparedContext.value.retrievedMemory } : {}),
    });
}

