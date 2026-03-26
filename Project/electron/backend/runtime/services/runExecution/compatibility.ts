import { providerStore } from '@/app/backend/persistence/stores';
import type { ProviderServiceErrorCode } from '@/app/backend/providers/service/errors';
import { getExecutionPreferenceState } from '@/app/backend/providers/service/executionPreferences';
import { validateRunCapabilities } from '@/app/backend/runtime/services/runExecution/capabilities';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionError,
    type RunExecutionErrorCode,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import { resolveRuntimeProtocol } from '@/app/backend/runtime/services/runExecution/protocol';
import { resolveRunAuth } from '@/app/backend/runtime/services/runExecution/resolveRunAuth';
import type { PreparedRunnableCandidate } from '@/app/backend/runtime/services/runExecution/types';

import type {
    ComposerImageAttachmentInput,
    ModeDefinition,
    RuntimeProviderId,
    RuntimeRunOptions,
    TopLevelTab,
} from '@/shared/contracts';

function mapProviderServiceErrorCodeToRunExecutionCode(code: ProviderServiceErrorCode): RunExecutionErrorCode {
    if (code === 'request_failed') {
        return 'provider_request_failed';
    }

    if (code === 'request_unavailable') {
        return 'provider_request_unavailable';
    }

    if (code === 'provider_model_missing') {
        return 'provider_model_missing';
    }

    if (code === 'invalid_payload') {
        return 'invalid_payload';
    }

    return 'provider_not_supported';
}

export type RunnableCandidatePreparationResult =
    | {
          kind: 'prepared';
          candidate: PreparedRunnableCandidate;
      }
    | {
          kind: 'incompatible';
          error: RunExecutionError;
      };

interface PrepareRunnableCandidateInput {
    profileId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    topLevelTab: TopLevelTab;
    mode: ModeDefinition;
    runtimeOptions: RuntimeRunOptions;
    attachments?: ComposerImageAttachmentInput[];
}

function buildInvalidPersistedModelError(input: {
    providerId: RuntimeProviderId;
    modelId: string;
    detail: string;
    toolProtocol?: string;
    apiFamily?: string;
}) {
    const message = `Model "${input.modelId}" has invalid persisted runtime metadata and cannot be used until the provider catalog is refreshed or corrected.`;
    const isProviderNativeRow = input.toolProtocol === 'provider_native' || input.apiFamily === 'provider_native';

    return {
        code: 'runtime_option_invalid' as const,
        message,
        action: isProviderNativeRow
            ? {
                  code: 'provider_native_unsupported' as const,
                  providerId: input.providerId,
                  modelId: input.modelId,
              }
            : {
                  code: 'runtime_options_invalid' as const,
                  providerId: input.providerId,
                  modelId: input.modelId,
                  detail: 'generic' as const,
              },
    };
}

export async function prepareRunnableCandidate(
    input: PrepareRunnableCandidateInput
): Promise<RunExecutionResult<RunnableCandidatePreparationResult>> {
    const authResult = await resolveRunAuth({
        profileId: input.profileId,
        providerId: input.providerId,
    });
    if (authResult.isErr()) {
        return okRunExecution({
            kind: 'incompatible',
            error: authResult.error,
        });
    }

    const modelReadState = await providerStore.getModelReadState(input.profileId, input.providerId, input.modelId);
    if (!modelReadState) {
        return okRunExecution({
            kind: 'incompatible',
            error: {
                code: 'provider_model_missing',
                message: `Model "${input.modelId}" is missing runtime capabilities.`,
                action: {
                    code: 'model_unavailable',
                    providerId: input.providerId,
                    modelId: input.modelId,
                },
            },
        });
    }
    if (modelReadState.kind === 'invalid') {
        const diagnostic = modelReadState.diagnostic;
        return okRunExecution({
            kind: 'incompatible',
            error: buildInvalidPersistedModelError({
                providerId: input.providerId,
                modelId: input.modelId,
                detail: diagnostic.detail,
                ...(diagnostic.toolProtocol ? { toolProtocol: diagnostic.toolProtocol } : {}),
                ...(diagnostic.apiFamily ? { apiFamily: diagnostic.apiFamily } : {}),
            }),
        });
    }

    const modelCapabilities = {
        features: modelReadState.model.features,
        runtime: modelReadState.model.runtime,
        ...(modelReadState.model.promptFamily ? { promptFamily: modelReadState.model.promptFamily } : {}),
    };

    const capabilityValidation = validateRunCapabilities({
        providerId: input.providerId,
        modelId: input.modelId,
        modelCapabilities,
        runtimeOptions: input.runtimeOptions,
        topLevelTab: input.topLevelTab,
        mode: input.mode,
    });
    if (capabilityValidation.isErr()) {
        return okRunExecution({
            kind: 'incompatible',
            error: capabilityValidation.error,
        });
    }

    if (input.attachments && input.attachments.length > 0 && !modelCapabilities.features.supportsVision) {
        return okRunExecution({
            kind: 'incompatible',
            error: {
                code: 'runtime_option_invalid',
                message: `Model "${input.modelId}" does not support image input. Select a vision-capable model before attaching images.`,
                action: {
                    code: 'model_vision_required',
                    providerId: input.providerId,
                    modelId: input.modelId,
                },
            },
        });
    }

    const openAIExecutionPreferenceResult =
        input.providerId === 'openai' ? await getExecutionPreferenceState(input.profileId, input.providerId) : null;
    if (openAIExecutionPreferenceResult?.isErr()) {
        return errRunExecution(
            mapProviderServiceErrorCodeToRunExecutionCode(openAIExecutionPreferenceResult.error.code),
            openAIExecutionPreferenceResult.error.message
        );
    }

    const runtimeProtocolResult = await resolveRuntimeProtocol({
        profileId: input.profileId,
        providerId: input.providerId,
        modelId: input.modelId,
        modelCapabilities,
        authMethod: authResult.value.authMethod,
        runtimeOptions: input.runtimeOptions,
        topLevelTab: input.topLevelTab,
        ...(openAIExecutionPreferenceResult?.isOk()
            ? { openAIExecutionMode: openAIExecutionPreferenceResult.value.mode }
            : {}),
    });
    if (runtimeProtocolResult.isErr()) {
        return okRunExecution({
            kind: 'incompatible',
            error: runtimeProtocolResult.error,
        });
    }

    return okRunExecution({
        kind: 'prepared',
        candidate: {
            target: {
                providerId: input.providerId,
                modelId: input.modelId,
            },
            resolvedAuth: authResult.value,
            modelCapabilities,
            runtimeDescriptor: runtimeProtocolResult.value.runtime,
            initialTransport: runtimeProtocolResult.value.transport,
            ...(openAIExecutionPreferenceResult?.isOk()
                ? { openAIExecutionMode: openAIExecutionPreferenceResult.value.mode }
                : {}),
        },
    });
}

