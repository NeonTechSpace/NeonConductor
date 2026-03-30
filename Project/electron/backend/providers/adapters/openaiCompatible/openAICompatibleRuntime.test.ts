import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    streamDirectFamilyRuntimeMock,
    streamProviderNativeRuntimeMock,
    resolveOpenAICompatibleExecutionBranchMock,
    resolveOpenAICompatibleAuthTokenMock,
    executeOpenAICompatibleProtocolMock,
    streamOpenAIRealtimeWebSocketRuntimeMock,
} = vi.hoisted(() => ({
    streamDirectFamilyRuntimeMock: vi.fn(),
    streamProviderNativeRuntimeMock: vi.fn(),
    resolveOpenAICompatibleExecutionBranchMock: vi.fn(),
    resolveOpenAICompatibleAuthTokenMock: vi.fn(),
    executeOpenAICompatibleProtocolMock: vi.fn(),
    streamOpenAIRealtimeWebSocketRuntimeMock: vi.fn(),
}));

vi.mock('@/app/backend/providers/adapters/directFamily/runtime', () => ({
    streamDirectFamilyRuntime: streamDirectFamilyRuntimeMock,
}));

vi.mock('@/app/backend/providers/adapters/providerNative', () => ({
    streamProviderNativeRuntime: streamProviderNativeRuntimeMock,
}));

vi.mock('@/app/backend/providers/adapters/openaiCompatible/openAICompatibleExecutionBranchResolver', () => ({
    resolveOpenAICompatibleExecutionBranch: resolveOpenAICompatibleExecutionBranchMock,
}));

vi.mock('@/app/backend/providers/adapters/openaiCompatible/openAICompatibleAuthResolver', () => ({
    resolveOpenAICompatibleAuthToken: resolveOpenAICompatibleAuthTokenMock,
}));

vi.mock('@/app/backend/providers/adapters/openaiCompatible/openAICompatibleProtocolExecutor', () => ({
    executeOpenAICompatibleProtocol: executeOpenAICompatibleProtocolMock,
}));

vi.mock('@/app/backend/providers/adapters/openaiCompatible/realtimeWebsocket', () => ({
    streamOpenAIRealtimeWebSocketRuntime: streamOpenAIRealtimeWebSocketRuntimeMock,
}));

import { okProviderAdapter } from '@/app/backend/providers/adapters/errors';
import { streamOpenAICompatibleRuntime } from '@/app/backend/providers/adapters/openaiCompatible/runtime';
import type { OpenAICompatibleRuntimeConfig } from '@/app/backend/providers/adapters/openaiCompatible/openAICompatibleRuntime.types';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

function createRuntimeInput(overrides?: Partial<ProviderRuntimeInput>): ProviderRuntimeInput {
    return {
        profileId: 'profile_default',
        sessionId: 'sess_openai_compat',
        runId: 'run_openai_compat',
        providerId: 'openai',
        modelId: 'openai/gpt-5',
        runtime: {
            toolProtocol: 'openai_responses',
            apiFamily: 'openai_compatible',
        },
        promptText: 'Inspect the workspace',
        runtimeOptions: {
            reasoning: {
                effort: 'medium',
                summary: 'auto',
                includeEncrypted: false,
            },
            cache: {
                strategy: 'auto',
            },
            transport: {
                family: 'auto',
            },
            execution: {},
        },
        cache: {
            strategy: 'auto',
            applied: false,
        },
        authMethod: 'api_key',
        apiKey: 'test-key',
        signal: new AbortController().signal,
        ...overrides,
    };
}

function createConfig(overrides?: Partial<OpenAICompatibleRuntimeConfig>): OpenAICompatibleRuntimeConfig {
    return {
        providerId: 'openai',
        modelPrefix: 'openai/',
        label: 'OpenAI',
        resolveEndpoints: () => ({
            chatCompletionsUrl: 'https://api.openai.com/v1/chat/completions',
            responsesUrl: 'https://api.openai.com/v1/responses',
            baseUrl: 'https://api.openai.com/v1',
        }),
        ...overrides,
    };
}

describe('openAICompatible runtime', () => {
    beforeEach(() => {
        streamDirectFamilyRuntimeMock.mockReset();
        streamProviderNativeRuntimeMock.mockReset();
        resolveOpenAICompatibleExecutionBranchMock.mockReset();
        resolveOpenAICompatibleAuthTokenMock.mockReset();
        executeOpenAICompatibleProtocolMock.mockReset();
        streamOpenAIRealtimeWebSocketRuntimeMock.mockReset();

        streamDirectFamilyRuntimeMock.mockResolvedValue(okProviderAdapter(undefined));
        streamProviderNativeRuntimeMock.mockResolvedValue(okProviderAdapter(undefined));
        resolveOpenAICompatibleAuthTokenMock.mockReturnValue(okProviderAdapter('test-key'));
        executeOpenAICompatibleProtocolMock.mockResolvedValue(okProviderAdapter(undefined));
        streamOpenAIRealtimeWebSocketRuntimeMock.mockResolvedValue(okProviderAdapter(undefined));
    });

    it('delegates provider-native execution directly to the provider-native runtime', async () => {
        resolveOpenAICompatibleExecutionBranchMock.mockReturnValue('provider_native');

        const result = await streamOpenAICompatibleRuntime(createRuntimeInput(), { onPart: () => undefined }, createConfig());

        expect(result.isOk()).toBe(true);
        expect(streamProviderNativeRuntimeMock).toHaveBeenCalledTimes(1);
        expect(resolveOpenAICompatibleAuthTokenMock).not.toHaveBeenCalled();
        expect(executeOpenAICompatibleProtocolMock).not.toHaveBeenCalled();
    });

    it('delegates direct-family execution directly to the direct-family runtime', async () => {
        resolveOpenAICompatibleExecutionBranchMock.mockReturnValue('direct_family');

        const result = await streamOpenAICompatibleRuntime(createRuntimeInput(), { onPart: () => undefined }, createConfig());

        expect(result.isOk()).toBe(true);
        expect(streamDirectFamilyRuntimeMock).toHaveBeenCalledWith(
            expect.objectContaining({
                modelId: 'openai/gpt-5',
            }),
            expect.any(Object),
            {
                providerId: 'openai',
                modelPrefix: 'openai/',
                label: 'OpenAI',
            }
        );
        expect(resolveOpenAICompatibleAuthTokenMock).not.toHaveBeenCalled();
    });

    it('routes realtime execution through the websocket collaborator after lifecycle selection', async () => {
        resolveOpenAICompatibleExecutionBranchMock.mockReturnValue('realtime_websocket');

        const events: string[] = [];
        const result = await streamOpenAICompatibleRuntime(
            createRuntimeInput({
                runtimeOptions: {
                    reasoning: {
                        effort: 'medium',
                        summary: 'auto',
                        includeEncrypted: false,
                    },
                    cache: {
                        strategy: 'auto',
                    },
                    transport: {
                        family: 'auto',
                    },
                    execution: {
                        openAIExecutionMode: 'realtime_websocket',
                    },
                },
            }),
            {
                onPart: () => undefined,
                onTransportSelected: () => {
                    events.push('transport');
                },
                onCacheResolved: () => {
                    events.push('cache');
                },
            },
            createConfig()
        );

        expect(result.isOk()).toBe(true);
        expect(events).toEqual(['transport', 'cache']);
        expect(streamOpenAIRealtimeWebSocketRuntimeMock).toHaveBeenCalledWith(
            expect.objectContaining({
                baseUrl: 'https://api.openai.com/v1',
                token: 'test-key',
            })
        );
        expect(executeOpenAICompatibleProtocolMock).not.toHaveBeenCalled();
    });

    it('fails closed on unsupported execution branches', async () => {
        resolveOpenAICompatibleExecutionBranchMock.mockReturnValue(null);
        resolveOpenAICompatibleAuthTokenMock.mockReturnValue(okProviderAdapter('test-key'));

        const result = await streamOpenAICompatibleRuntime(createRuntimeInput(), { onPart: () => undefined }, createConfig());

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected unsupported branch to fail.');
        }
        expect(result.error.code).toBe('invalid_payload');
        expect(result.error.message).toContain('unsupported protocol');
    });
});
