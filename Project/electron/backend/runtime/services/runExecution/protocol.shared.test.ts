import { beforeEach, vi } from 'vitest';

const { resolveProviderNativeRuntimeSpecializationMock, resolveProviderRuntimePathContextMock } = vi.hoisted(() => ({
    resolveProviderNativeRuntimeSpecializationMock: vi.fn(),
    resolveProviderRuntimePathContextMock: vi.fn(),
}));

vi.mock('@/app/backend/providers/adapters/providerNative', () => ({
    resolveProviderNativeRuntimeSpecialization: resolveProviderNativeRuntimeSpecializationMock,
}));

vi.mock('@/app/backend/providers/runtimePathContext', () => ({
    resolveProviderRuntimePathContext: resolveProviderRuntimePathContextMock,
}));

export type ResolveRuntimeProtocolInput = Parameters<
    (typeof import('@/app/backend/runtime/services/runExecution/protocol'))['resolveRuntimeProtocol']
>[0];

export type ProtocolTestModelCapabilities = ResolveRuntimeProtocolInput['modelCapabilities'];

export function createProtocolModelCapabilities(
    input: ProtocolTestModelCapabilities['features'] & {
        toolProtocol: ProtocolTestModelCapabilities['runtime']['toolProtocol'];
        apiFamily?: ProtocolTestModelCapabilities['runtime']['apiFamily'];
        routedApiFamily?: Extract<
            ProtocolTestModelCapabilities['runtime'],
            { toolProtocol: 'kilo_gateway' }
        >['routedApiFamily'];
        supportsRealtimeWebSocket?: Extract<
            ProtocolTestModelCapabilities['runtime'],
            { toolProtocol: 'openai_responses' }
        >['supportsRealtimeWebSocket'];
        providerNativeId?: Extract<
            ProtocolTestModelCapabilities['runtime'],
            { toolProtocol: 'provider_native' }
        >['providerNativeId'];
    }
): ProtocolTestModelCapabilities {
    const features = {
        supportsTools: input.supportsTools,
        supportsReasoning: input.supportsReasoning,
        supportsVision: input.supportsVision,
        supportsAudioInput: input.supportsAudioInput,
        supportsAudioOutput: input.supportsAudioOutput,
        ...(input.supportsPromptCache !== undefined ? { supportsPromptCache: input.supportsPromptCache } : {}),
        inputModalities: input.inputModalities,
        outputModalities: input.outputModalities,
    };

    if (input.toolProtocol === 'openai_responses') {
        return {
            features,
            runtime: {
                toolProtocol: 'openai_responses',
                apiFamily: 'openai_compatible',
                ...(input.supportsRealtimeWebSocket !== undefined
                    ? { supportsRealtimeWebSocket: input.supportsRealtimeWebSocket }
                    : {}),
            },
        };
    }

    if (input.toolProtocol === 'openai_chat_completions') {
        return {
            features,
            runtime: {
                toolProtocol: 'openai_chat_completions',
                apiFamily: 'openai_compatible',
            },
        };
    }

    if (input.toolProtocol === 'anthropic_messages') {
        return {
            features,
            runtime: {
                toolProtocol: 'anthropic_messages',
                apiFamily: 'anthropic_messages',
            },
        };
    }

    if (input.toolProtocol === 'google_generativeai') {
        return {
            features,
            runtime: {
                toolProtocol: 'google_generativeai',
                apiFamily: 'google_generativeai',
            },
        };
    }

    if (input.toolProtocol === 'kilo_gateway') {
        return {
            features,
            runtime: {
                toolProtocol: 'kilo_gateway',
                apiFamily: 'kilo_gateway',
                routedApiFamily: input.routedApiFamily ?? 'openai_compatible',
            },
        };
    }

    return {
        features,
        runtime: {
            toolProtocol: 'provider_native',
            ...(input.apiFamily ? { apiFamily: input.apiFamily } : {}),
            providerNativeId: input.providerNativeId ?? 'provider_native_test',
        },
    };
}

export const protocolTestProfileId = 'profile_local_default';

export function createProtocolRuntimeOptions(): ResolveRuntimeProtocolInput['runtimeOptions'] {
    return {
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
    };
}

export async function resolveRuntimeProtocolForTest(input: ResolveRuntimeProtocolInput) {
    const { resolveRuntimeProtocol } = await import('@/app/backend/runtime/services/runExecution/protocol');
    return resolveRuntimeProtocol(input);
}

beforeEach(() => {
    resolveProviderNativeRuntimeSpecializationMock.mockReset();
    resolveProviderRuntimePathContextMock.mockReset();
    resolveProviderRuntimePathContextMock.mockResolvedValue({
        isOk: () => true,
        isErr: () => false,
        value: {
            profileId: protocolTestProfileId,
            providerId: 'openai',
            optionProfileId: 'default',
            resolvedBaseUrl: 'https://api.anthropic.com/v1',
        },
    });
});

export { resolveProviderNativeRuntimeSpecializationMock, resolveProviderRuntimePathContextMock };
