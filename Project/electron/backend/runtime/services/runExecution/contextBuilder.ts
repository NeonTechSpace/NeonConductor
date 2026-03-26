import type { OperationalErrorCode } from '@/app/backend/runtime/services/common/operationalError';
import { sessionContextService } from '@/app/backend/runtime/services/context/sessionContextService';
import { buildSessionSystemPrelude } from '@/app/backend/runtime/services/runExecution/contextPrelude';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
    type RunExecutionErrorCode,
} from '@/app/backend/runtime/services/runExecution/errors';
import type { RunContext, StartRunInput } from '@/app/backend/runtime/services/runExecution/types';

import type { ModeDefinition, RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

function toRunExecutionErrorCode(code: OperationalErrorCode): RunExecutionErrorCode {
    switch (code) {
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
        systemMessages: systemPreludeResult.value,
        prompt: input.prompt,
        topLevelTab: input.topLevelTab,
        modeKey: input.resolvedMode.mode.modeKey,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        ...(input.attachments ? { attachments: input.attachments } : {}),
    });
    if (preparedContext.isErr()) {
        return errRunExecution(toRunExecutionErrorCode(preparedContext.error.code), preparedContext.error.message);
    }

    return okRunExecution({
        messages: preparedContext.value.messages,
        digest: preparedContext.value.digest,
        ...(preparedContext.value.retrievedMemory ? { retrievedMemory: preparedContext.value.retrievedMemory } : {}),
    });
}

