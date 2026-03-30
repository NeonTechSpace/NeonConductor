import { isOfficialOpenAIBaseUrl } from '@/app/backend/providers/adapters/openai/endpoints';
import type { RuntimeFamilyDefinition } from '@/app/backend/providers/runtimeFamilyPolicy.types';
import { resolveProviderRuntimePathContext } from '@/app/backend/providers/runtimePathContext';
import { buildTransport, invalidRuntimeOption } from '@/app/backend/providers/transportOverridePolicy';
import type {
    KiloGatewayRuntimeDescriptor,
    OpenAIResponsesRuntimeDescriptor,
    ProviderRoutedApiFamily,
    ProviderRuntimeDescriptor,
    ProviderToolProtocol,
} from '@/app/backend/providers/types';
import { okRunExecution } from '@/app/backend/runtime/services/runExecution/errors';

import { resolveDirectAnthropicRuntimeProtocol, resolveDirectGeminiRuntimeProtocol, supportsAnthropicCatalogRuntimeFamily, supportsGeminiCatalogRuntimeFamily } from '@/app/backend/providers/directRuntimeEligibilityPolicy';
import { resolveProviderNativeRuntimeProtocol, supportsProviderNativeCatalogRuntimeFamily } from '@/app/backend/providers/providerNativeEligibilityPolicy';

function isSupportedKiloRoutedFamily(
    value: ProviderRoutedApiFamily | undefined
): value is Exclude<ProviderRoutedApiFamily, 'provider_native'> {
    return value === 'openai_compatible' || value === 'anthropic_messages' || value === 'google_generativeai';
}

function isOpenAIResponsesRuntimeDescriptor(
    runtime: ProviderRuntimeDescriptor
): runtime is OpenAIResponsesRuntimeDescriptor {
    return runtime.toolProtocol === 'openai_responses';
}

function isKiloGatewayRuntimeDescriptor(runtime: ProviderRuntimeDescriptor): runtime is KiloGatewayRuntimeDescriptor {
    return runtime.toolProtocol === 'kilo_gateway';
}

export const runtimeProtocolSelectionDefinitions: Record<ProviderToolProtocol, RuntimeFamilyDefinition> = {
    openai_responses: {
        toolProtocol: 'openai_responses',
        executionPath: 'openai_compatible',
        transportFamily: 'openai_responses',
        supportsCatalogModel: ({ providerId, model }) =>
            providerId !== 'kilo' && model.runtime.toolProtocol === 'openai_responses',
        async resolveProtocol(input) {
            const runtime = input.modelCapabilities.runtime;
            if (!isOpenAIResponsesRuntimeDescriptor(runtime)) {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" is missing the OpenAI responses runtime descriptor.`,
                });
            }
            if (input.providerId === 'kilo') {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" declares protocol "openai_responses" but provider "${input.providerId}" cannot execute it.`,
                });
            }

            if (input.runtimeOptions.transport.family === 'openai_chat_completions') {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" requires the OpenAI responses protocol and cannot run with chat-completions transport.`,
                });
            }

            if (input.openAIExecutionMode === 'realtime_websocket') {
                if (input.providerId !== 'openai') {
                    return invalidRuntimeOption({
                        providerId: input.providerId,
                        modelId: input.modelId,
                        message: `Realtime WebSocket mode is only supported for the OpenAI provider.`,
                        detail: 'provider_not_supported',
                    });
                }

                if (input.topLevelTab === 'chat') {
                    return invalidRuntimeOption({
                        providerId: input.providerId,
                        modelId: input.modelId,
                        message: `Realtime WebSocket mode is not supported for chat runs.`,
                        detail: 'chat_mode_not_supported',
                    });
                }

                if (input.runtimeOptions.transport.family !== 'auto') {
                    return invalidRuntimeOption({
                        providerId: input.providerId,
                        modelId: input.modelId,
                        message: `Realtime WebSocket mode requires automatic transport selection.`,
                    });
                }

                if (input.authMethod !== 'api_key') {
                    return invalidRuntimeOption({
                        providerId: input.providerId,
                        modelId: input.modelId,
                        message: `Realtime WebSocket mode requires API key authentication.`,
                        detail: 'api_key_required',
                    });
                }

                const runtimePathResult = await resolveProviderRuntimePathContext(input.profileId, input.providerId);
                if (runtimePathResult.isErr()) {
                    return invalidRuntimeOption({
                        providerId: input.providerId,
                        modelId: input.modelId,
                        message: runtimePathResult.error.message,
                    });
                }

                if (!isOfficialOpenAIBaseUrl(runtimePathResult.value.resolvedBaseUrl)) {
                    return invalidRuntimeOption({
                        providerId: input.providerId,
                        modelId: input.modelId,
                        message: `Realtime WebSocket mode requires the official OpenAI base URL.`,
                        detail: 'base_url_not_supported',
                    });
                }

                if (runtime.supportsRealtimeWebSocket !== true) {
                    return invalidRuntimeOption({
                        providerId: input.providerId,
                        modelId: input.modelId,
                        message: `Model "${input.modelId}" is not marked as OpenAI Realtime WebSocket capable.`,
                        detail: 'model_not_realtime_capable',
                    });
                }

                return okRunExecution({
                    runtime,
                    transport: buildTransport({
                        runtimeOptions: input.runtimeOptions,
                        selected: 'openai_realtime_websocket',
                    }),
                });
            }

            return okRunExecution({
                runtime,
                transport: buildTransport({
                    runtimeOptions: input.runtimeOptions,
                    selected: 'openai_responses',
                }),
            });
        },
    },
    openai_chat_completions: {
        toolProtocol: 'openai_chat_completions',
        executionPath: 'openai_compatible',
        transportFamily: 'openai_chat_completions',
        supportsCatalogModel: ({ providerId, model }) =>
            providerId !== 'kilo' && model.runtime.toolProtocol === 'openai_chat_completions',
        async resolveProtocol(input) {
            const runtime = input.modelCapabilities.runtime;
            if (input.providerId === 'kilo') {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" declares protocol "openai_chat_completions" but provider "${input.providerId}" cannot execute it.`,
                });
            }

            if (input.runtimeOptions.transport.family === 'openai_responses') {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" requires the OpenAI chat completions protocol and cannot run with responses transport.`,
                });
            }

            return okRunExecution({
                providerId: input.providerId,
                modelId: input.modelId,
                runtime,
                transport: buildTransport({
                    runtimeOptions: input.runtimeOptions,
                    selected: 'openai_chat_completions',
                }),
            });
        },
    },
    anthropic_messages: {
        toolProtocol: 'anthropic_messages',
        executionPath: 'direct_family',
        transportFamily: 'anthropic_messages',
        supportsCatalogModel: supportsAnthropicCatalogRuntimeFamily,
        resolveProtocol: resolveDirectAnthropicRuntimeProtocol,
    },
    google_generativeai: {
        toolProtocol: 'google_generativeai',
        executionPath: 'direct_family',
        transportFamily: 'google_generativeai',
        supportsCatalogModel: supportsGeminiCatalogRuntimeFamily,
        resolveProtocol: resolveDirectGeminiRuntimeProtocol,
    },
    kilo_gateway: {
        toolProtocol: 'kilo_gateway',
        executionPath: 'kilo_gateway',
        transportFamily: 'kilo_gateway',
        supportsCatalogModel: ({ providerId, model }) =>
            providerId === 'kilo' &&
            model.runtime.toolProtocol === 'kilo_gateway' &&
            isSupportedKiloRoutedFamily(model.runtime.routedApiFamily),
        async resolveProtocol(input) {
            const runtime = input.modelCapabilities.runtime;
            if (!isKiloGatewayRuntimeDescriptor(runtime)) {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" is missing the Kilo gateway runtime descriptor.`,
                });
            }
            if (input.providerId !== 'kilo') {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" declares protocol "kilo_gateway" but provider "${input.providerId}" cannot execute it.`,
                });
            }

            if (input.runtimeOptions.transport.family !== 'auto') {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Requested transport family "${input.runtimeOptions.transport.family}" is not supported for protocol "kilo_gateway".`,
                });
            }

            if (!isSupportedKiloRoutedFamily(runtime.routedApiFamily)) {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" routes through an unsupported Kilo upstream family.`,
                });
            }

            return okRunExecution({
                providerId: input.providerId,
                modelId: input.modelId,
                runtime,
                transport: buildTransport({
                    runtimeOptions: input.runtimeOptions,
                    selected: 'kilo_gateway',
                }),
            });
        },
    },
    provider_native: {
        toolProtocol: 'provider_native',
        executionPath: 'provider_native',
        transportFamily: 'provider_native',
        supportsCatalogModel: supportsProviderNativeCatalogRuntimeFamily,
        resolveProtocol: resolveProviderNativeRuntimeProtocol,
    },
};
