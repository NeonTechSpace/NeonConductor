import { supportsDirectAnthropicRuntimeContext } from '@/app/backend/providers/adapters/anthropicDirect';
import { supportsDirectGeminiRuntimeContext } from '@/app/backend/providers/adapters/geminiDirect';
import {
    resolveProviderNativeRuntimeSpecialization,
    supportsProviderNativeRuntimeContext,
} from '@/app/backend/providers/adapters/providerNative';
import { resolveProviderRuntimePathContext } from '@/app/backend/providers/runtimePathContext';
import type {
    NormalizedModelMetadata,
    ProviderApiFamily,
    ProviderModelCapabilities,
    ProviderRoutedApiFamily,
    ProviderRuntimeTransportFamily,
    ProviderToolProtocol,
} from '@/app/backend/providers/types';
import type { RuntimeProviderId, RuntimeRunOptions } from '@/app/backend/runtime/contracts';
import type { ProviderAuthMethod } from '@/app/backend/runtime/contracts';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionError,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import type { RunTransportResolution } from '@/app/backend/runtime/services/runExecution/types';

export type RuntimeFamilyExecutionPath = 'openai_compatible' | 'kilo_gateway' | 'provider_native' | 'direct_family';

export interface ResolvedRuntimeFamilyProtocol {
    toolProtocol: ProviderToolProtocol;
    apiFamily?: ProviderApiFamily;
    routedApiFamily?: ProviderRoutedApiFamily;
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
}): RunExecutionResult<never> {
    return errRunExecution('runtime_option_invalid', input.message, {
        action: {
            code: 'runtime_options_invalid',
            providerId: input.providerId,
            modelId: input.modelId,
            detail: 'generic',
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

function invalidRuntimeOptionFromError(
    error: RunExecutionError
): RunExecutionResult<never> {
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

function hasRunnableProviderNativeSettings(model: NormalizedModelMetadata): boolean {
    return typeof model.providerSettings === 'object' && model.providerSettings !== null && Object.keys(model.providerSettings).length > 0;
}

function isSupportedKiloRoutedFamily(value: ProviderRoutedApiFamily | undefined): value is Exclude<ProviderRoutedApiFamily, 'provider_native'> {
    return value === 'openai_compatible' || value === 'anthropic_messages' || value === 'google_generativeai';
}

const runtimeFamilyDefinitions: Record<ProviderToolProtocol, RuntimeFamilyDefinition> = {
    openai_responses: {
        toolProtocol: 'openai_responses',
        executionPath: 'openai_compatible',
        transportFamily: 'openai_responses',
        supportsCatalogModel: ({ providerId }) => providerId !== 'kilo',
        async resolveProtocol(input) {
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

            return okRunExecution({
                toolProtocol: 'openai_responses',
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
        supportsCatalogModel: ({ providerId }) => providerId !== 'kilo',
        async resolveProtocol(input) {
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
                toolProtocol: 'openai_chat_completions',
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
        supportsCatalogModel: ({ providerId, model, context }) =>
            providerId !== 'kilo' &&
            model.apiFamily === 'anthropic_messages' &&
            (!!context &&
                supportsDirectAnthropicRuntimeContext({
                    providerId,
                    resolvedBaseUrl: context.resolvedBaseUrl,
                })),
        async resolveProtocol(input) {
            if (input.modelCapabilities.apiFamily !== 'anthropic_messages') {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" declares direct Anthropic protocol metadata without matching Anthropic API family metadata.`,
                });
            }

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
                toolProtocol: 'anthropic_messages',
                apiFamily: 'anthropic_messages',
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
            model.apiFamily === 'google_generativeai' &&
            (!!context &&
                supportsDirectGeminiRuntimeContext({
                    providerId,
                    resolvedBaseUrl: context.resolvedBaseUrl,
                })),
        async resolveProtocol(input) {
            if (input.modelCapabilities.apiFamily !== 'google_generativeai') {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" declares direct Gemini protocol metadata without matching Gemini API family metadata.`,
                });
            }

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
                toolProtocol: 'google_generativeai',
                apiFamily: 'google_generativeai',
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
            model.apiFamily === 'kilo_gateway' &&
            isSupportedKiloRoutedFamily(model.routedApiFamily),
        async resolveProtocol(input) {
            if (input.providerId !== 'kilo') {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" declares protocol "kilo_gateway" but provider "${input.providerId}" cannot execute it.`,
                });
            }

            const transportError = invalidTransportOverride(input, 'protocol "kilo_gateway"');
            if (transportError) {
                return transportError;
            }

            const routedApiFamily = input.modelCapabilities.routedApiFamily;
            if (!routedApiFamily) {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" is missing required Kilo routed upstream family metadata.`,
                });
            }

            if (routedApiFamily === 'provider_native') {
                return errRunExecution(
                    'runtime_option_invalid',
                    `Model "${input.modelId}" requires a provider-native Kilo routed runtime specialization that is not registered.`,
                    {
                        action: {
                            code: 'provider_native_unsupported',
                            providerId: input.providerId,
                            modelId: input.modelId,
                        },
                    }
                );
            }

            if (!isSupportedKiloRoutedFamily(routedApiFamily)) {
                return invalidRuntimeOption({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    message: `Model "${input.modelId}" routes through unsupported Kilo upstream family "${routedApiFamily}".`,
                });
            }

            return okRunExecution({
                toolProtocol: 'kilo_gateway',
                apiFamily: 'kilo_gateway',
                routedApiFamily,
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
        supportsCatalogModel: ({ providerId, model, context }) =>
            hasRunnableProviderNativeSettings(model) &&
            !!context &&
            supportsProviderNativeRuntimeContext({
                providerId,
                modelId: model.modelId,
                optionProfileId: context.optionProfileId,
                resolvedBaseUrl: context.resolvedBaseUrl,
                ...(model.sourceProvider ? { sourceProvider: model.sourceProvider } : {}),
                ...(model.apiFamily ? { apiFamily: model.apiFamily } : {}),
                ...(model.providerSettings ? { providerSettings: model.providerSettings } : {}),
            }),
        async resolveProtocol(input) {
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
                toolProtocol: 'provider_native',
                ...(input.modelCapabilities.apiFamily ? { apiFamily: input.modelCapabilities.apiFamily } : {}),
                transport: buildTransport({
                    runtimeOptions: input.runtimeOptions,
                    selected: 'provider_native',
                }),
            });
        },
    },
};

export function getRuntimeFamilyDefinition(
    toolProtocol: ProviderToolProtocol
): RuntimeFamilyDefinition {
    return runtimeFamilyDefinitions[toolProtocol];
}

export function resolveRuntimeFamilyExecutionPath(
    toolProtocol: ProviderToolProtocol
): RuntimeFamilyExecutionPath {
    return getRuntimeFamilyDefinition(toolProtocol).executionPath;
}

export function supportsCatalogRuntimeFamily(input: RuntimeFamilyCatalogInput): boolean {
    const toolProtocol = input.model.toolProtocol;
    if (!toolProtocol) {
        return false;
    }

    const definition = runtimeFamilyDefinitions[toolProtocol];
    return definition.supportsCatalogModel(input);
}

export async function resolveRuntimeFamilyProtocol(
    input: ResolveRuntimeFamilyInput
): Promise<RunExecutionResult<ResolvedRuntimeFamilyProtocol>> {
    const toolProtocol = input.modelCapabilities.toolProtocol;
    if (!toolProtocol) {
        return invalidRuntimeOption({
            providerId: input.providerId,
            modelId: input.modelId,
            message: `Model "${input.modelId}" is missing required runtime protocol metadata.`,
        });
    }

    const definition = runtimeFamilyDefinitions[toolProtocol];
    return definition.resolveProtocol(input);
}
