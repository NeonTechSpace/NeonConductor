import { supportsDirectAnthropicRuntimeContext } from '@/app/backend/providers/adapters/anthropicDirect';
import { supportsDirectGeminiRuntimeContext } from '@/app/backend/providers/adapters/geminiDirect';
import { isOfficialOpenAIBaseUrl } from '@/app/backend/providers/adapters/openai/endpoints';
import {
    resolveProviderNativeRuntimeSpecialization,
    supportsProviderNativeRuntimeContext,
} from '@/app/backend/providers/adapters/providerNative';
import { resolveProviderRuntimePathContext } from '@/app/backend/providers/runtimePathContext';
import type {
    NormalizedModelMetadata,
    OpenAIResponsesRuntimeDescriptor,
    KiloGatewayRuntimeDescriptor,
    ProviderModelCapabilities,
    ProviderNativeRuntimeDescriptor,
    ProviderRoutedApiFamily,
    ProviderRuntimeDescriptor,
    ProviderRuntimeTransportFamily,
    ProviderToolProtocol,
} from '@/app/backend/providers/types';
import type { RuntimeProviderId, RuntimeRunOptions } from '@/app/backend/runtime/contracts';
import type { ProviderAuthMethod } from '@/app/backend/runtime/contracts';
import type { OpenAIExecutionMode, TopLevelTab } from '@/app/backend/runtime/contracts';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionError,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import type { RunTransportResolution } from '@/app/backend/runtime/services/runExecution/types';

export type RuntimeFamilyExecutionPath = 'openai_compatible' | 'kilo_gateway' | 'provider_native' | 'direct_family';

export interface ResolvedRuntimeFamilyProtocol {
    runtime: ProviderRuntimeDescriptor;
    transport: RunTransportResolution;
}

interface RuntimeFamilyCatalogContext {
    providerId: RuntimeProviderId;
    optionProfileId: string;
    resolvedBaseUrl: string | null;
}

interface RuntimeFamilyCatalogInput {
    providerId: RuntimeProviderId;
    model: NormalizedModelMetadata;
    context?: RuntimeFamilyCatalogContext;
}

interface ResolveRuntimeFamilyInput {
    profileId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    modelCapabilities: ProviderModelCapabilities;
    authMethod: ProviderAuthMethod | 'none';
    runtimeOptions: RuntimeRunOptions;
    topLevelTab?: TopLevelTab;
    openAIExecutionMode?: OpenAIExecutionMode;
}

interface RuntimeFamilyDefinition {
    toolProtocol: ProviderToolProtocol;
    executionPath: RuntimeFamilyExecutionPath;
    transportFamily: ProviderRuntimeTransportFamily;
    supportsCatalogModel: (input: RuntimeFamilyCatalogInput) => boolean;
    resolveProtocol: (input: ResolveRuntimeFamilyInput) => Promise<RunExecutionResult<ResolvedRuntimeFamilyProtocol>>;
}

function buildTransport(input: {
    runtimeOptions: RuntimeRunOptions;
    selected: ProviderRuntimeTransportFamily;
}): RunTransportResolution {
    return {
        requested: input.runtimeOptions.transport.family,
        selected: input.selected,
        degraded: false,
    };
}

function invalidRuntimeOption(input: {
    providerId: RuntimeProviderId;
    modelId: string;
    message: string;
    detail?:
        | 'attachments_not_allowed'
        | 'generic'
        | 'chat_mode_not_supported'
        | 'model_not_realtime_capable'
        | 'api_key_required'
        | 'base_url_not_supported'
        | 'provider_not_supported';
}): RunExecutionResult<never> {
    return errRunExecution('runtime_option_invalid', input.message, {
        action: {
            code: 'runtime_options_invalid',
            providerId: input.providerId,
            modelId: input.modelId,
            detail: input.detail ?? 'generic',
        },
    });
}

function requireAutoRequestedTransportFamily(
    input: ResolveRuntimeFamilyInput,
    protocolLabel: string
): RunExecutionError | null {
    if (input.runtimeOptions.transport.family !== 'auto') {
        return {
            code: 'runtime_option_invalid',
            message: `Requested transport family "${input.runtimeOptions.transport.family}" is not supported for ${protocolLabel}.`,
            action: {
                code: 'runtime_options_invalid',
                providerId: input.providerId,
                modelId: input.modelId,
                detail: 'generic',
            },
        };
    }

    return null;
}

function invalidRuntimeOptionFromError(error: RunExecutionError): RunExecutionResult<never> {
    return errRunExecution(error.code, error.message, {
        ...(error.action ? { action: error.action } : {}),
    });
}

function invalidTransportOverride(
    input: ResolveRuntimeFamilyInput,
    protocolLabel: string
): RunExecutionResult<never> | null {
    const transportError = requireAutoRequestedTransportFamily(input, protocolLabel);
    if (!transportError) {
        return null;
    }

    return invalidRuntimeOptionFromError(transportError);
}

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

function isProviderNativeRuntimeDescriptor(
    runtime: ProviderRuntimeDescriptor
): runtime is ProviderNativeRuntimeDescriptor {
    return runtime.toolProtocol === 'provider_native';
}

const runtimeFamilyDefinitions: Record<ProviderToolProtocol, RuntimeFamilyDefinition> = {
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
        resolveProtocol(input) {
            const runtime = input.modelCapabilities.runtime;
            if (input.providerId === 'kilo') {
                return Promise.resolve(
                    invalidRuntimeOption({
                        providerId: input.providerId,
                        modelId: input.modelId,
                        message: `Model "${input.modelId}" declares protocol "openai_chat_completions" but provider "${input.providerId}" cannot execute it.`,
                    })
                );
            }

            if (input.runtimeOptions.transport.family === 'openai_responses') {
                return Promise.resolve(
                    invalidRuntimeOption({
                        providerId: input.providerId,
                        modelId: input.modelId,
                        message: `Model "${input.modelId}" requires the OpenAI chat completions protocol and cannot run with responses transport.`,
                    })
                );
            }

            return Promise.resolve(
                okRunExecution({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    runtime,
                    transport: buildTransport({
                        runtimeOptions: input.runtimeOptions,
                        selected: 'openai_chat_completions',
                    }),
                })
            );
        },
    },
    anthropic_messages: {
        toolProtocol: 'anthropic_messages',
        executionPath: 'direct_family',
        transportFamily: 'anthropic_messages',
        supportsCatalogModel: ({ providerId, model, context }) =>
            providerId !== 'kilo' &&
            model.runtime.toolProtocol === 'anthropic_messages' &&
            !!context &&
            supportsDirectAnthropicRuntimeContext({
                providerId,
                resolvedBaseUrl: context.resolvedBaseUrl,
            }),
        async resolveProtocol(input) {
            const runtime = input.modelCapabilities.runtime;

            if (input.providerId === 'kilo') {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" declares direct Anthropic protocol but provider "${input.providerId}" must use gateway routing instead.`,
                });
            }

            const transportError = invalidTransportOverride(input, 'protocol "anthropic_messages"');
            if (transportError) {
                return transportError;
            }

            if (input.authMethod !== 'api_key') {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" requires API key authentication for the direct Anthropic runtime path.`,
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

            if (
                !supportsDirectAnthropicRuntimeContext({
                    providerId: input.providerId,
                    resolvedBaseUrl: runtimePathResult.value.resolvedBaseUrl,
                })
            ) {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" requires an Anthropic-compatible base URL on provider "${input.providerId}".`,
                });
            }

            return okRunExecution({
                runtime,
                transport: buildTransport({
                    runtimeOptions: input.runtimeOptions,
                    selected: 'anthropic_messages',
                }),
            });
        },
    },
    google_generativeai: {
        toolProtocol: 'google_generativeai',
        executionPath: 'direct_family',
        transportFamily: 'google_generativeai',
        supportsCatalogModel: ({ providerId, model, context }) =>
            providerId !== 'kilo' &&
            model.runtime.toolProtocol === 'google_generativeai' &&
            !!context &&
            supportsDirectGeminiRuntimeContext({
                providerId,
                resolvedBaseUrl: context.resolvedBaseUrl,
            }),
        async resolveProtocol(input) {
            const runtime = input.modelCapabilities.runtime;

            if (input.providerId === 'kilo') {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" declares direct Gemini protocol but provider "${input.providerId}" must use gateway routing instead.`,
                });
            }

            const transportError = invalidTransportOverride(input, 'protocol "google_generativeai"');
            if (transportError) {
                return transportError;
            }

            if (input.authMethod !== 'api_key') {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" requires API key authentication for the direct Gemini runtime path.`,
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

            if (
                !supportsDirectGeminiRuntimeContext({
                    providerId: input.providerId,
                    resolvedBaseUrl: runtimePathResult.value.resolvedBaseUrl,
                })
            ) {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" requires a Gemini-compatible base URL on provider "${input.providerId}".`,
                });
            }

            return okRunExecution({
                runtime,
                transport: buildTransport({
                    runtimeOptions: input.runtimeOptions,
                    selected: 'google_generativeai',
                }),
            });
        },
    },
    kilo_gateway: {
        toolProtocol: 'kilo_gateway',
        executionPath: 'kilo_gateway',
        transportFamily: 'kilo_gateway',
        supportsCatalogModel: ({ providerId, model }) =>
            providerId === 'kilo' &&
            model.runtime.toolProtocol === 'kilo_gateway' &&
            isSupportedKiloRoutedFamily(model.runtime.routedApiFamily),
        resolveProtocol(input) {
            const runtime = input.modelCapabilities.runtime;
            if (!isKiloGatewayRuntimeDescriptor(runtime)) {
                return Promise.resolve(
                    invalidRuntimeOption({
                        providerId: input.providerId,
                        modelId: input.modelId,
                        message: `Model "${input.modelId}" is missing the Kilo gateway runtime descriptor.`,
                    })
                );
            }
            if (input.providerId !== 'kilo') {
                return Promise.resolve(
                    invalidRuntimeOption({
                        providerId: input.providerId,
                        modelId: input.modelId,
                        message: `Model "${input.modelId}" declares protocol "kilo_gateway" but provider "${input.providerId}" cannot execute it.`,
                    })
                );
            }

            const transportError = invalidTransportOverride(input, 'protocol "kilo_gateway"');
            if (transportError) {
                return Promise.resolve(transportError);
            }

            const routedApiFamily = runtime.routedApiFamily;
            if (!isSupportedKiloRoutedFamily(routedApiFamily)) {
                return Promise.resolve(
                    invalidRuntimeOption({
                        providerId: input.providerId,
                        modelId: input.modelId,
                        message: `Model "${input.modelId}" routes through an unsupported Kilo upstream family.`,
                    })
                );
            }

            return Promise.resolve(
                okRunExecution({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    runtime,
                    transport: buildTransport({
                        runtimeOptions: input.runtimeOptions,
                        selected: 'kilo_gateway',
                    }),
                })
            );
        },
    },
    provider_native: {
        toolProtocol: 'provider_native',
        executionPath: 'provider_native',
        transportFamily: 'provider_native',
        supportsCatalogModel: ({ providerId, model, context }) =>
            model.runtime.toolProtocol === 'provider_native' &&
            !!context &&
            supportsProviderNativeRuntimeContext({
                providerId,
                modelId: model.modelId,
                optionProfileId: context.optionProfileId,
                resolvedBaseUrl: context.resolvedBaseUrl,
                ...(model.sourceProvider ? { sourceProvider: model.sourceProvider } : {}),
                ...(model.runtime.apiFamily ? { apiFamily: model.runtime.apiFamily } : {}),
                providerNativeId: model.runtime.providerNativeId,
            }),
        async resolveProtocol(input) {
            const runtime = input.modelCapabilities.runtime;
            if (!isProviderNativeRuntimeDescriptor(runtime)) {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" is missing the provider-native runtime descriptor.`,
                });
            }
            const transportError = invalidTransportOverride(input, 'protocol "provider_native"');
            if (transportError) {
                return transportError;
            }

            const specialization = await resolveProviderNativeRuntimeSpecialization(
                input.providerId,
                input.modelId,
                input.profileId
            );
            if (!specialization) {
                return errRunExecution(
                    'runtime_option_invalid',
                    `Model "${input.modelId}" requires a provider-native runtime specialization that is not registered.`,
                    {
                        action: {
                            code: 'provider_native_unsupported',
                            providerId: input.providerId,
                            modelId: input.modelId,
                        },
                    }
                );
            }

            return okRunExecution({
                runtime,
                transport: buildTransport({
                    runtimeOptions: input.runtimeOptions,
                    selected: 'provider_native',
                }),
            });
        },
    },
};

export function getRuntimeFamilyDefinition(toolProtocol: ProviderToolProtocol): RuntimeFamilyDefinition {
    return runtimeFamilyDefinitions[toolProtocol];
}

export function resolveRuntimeFamilyExecutionPath(toolProtocol: ProviderToolProtocol): RuntimeFamilyExecutionPath {
    return getRuntimeFamilyDefinition(toolProtocol).executionPath;
}

export function supportsCatalogRuntimeFamily(input: RuntimeFamilyCatalogInput): boolean {
    const toolProtocol = input.model.runtime.toolProtocol;
    const definition = runtimeFamilyDefinitions[toolProtocol];
    return definition.supportsCatalogModel(input);
}

export async function resolveRuntimeFamilyProtocol(
    input: ResolveRuntimeFamilyInput
): Promise<RunExecutionResult<ResolvedRuntimeFamilyProtocol>> {
    const toolProtocol = input.modelCapabilities.runtime.toolProtocol;
    const definition = runtimeFamilyDefinitions[toolProtocol];
    return definition.resolveProtocol(input);
}
