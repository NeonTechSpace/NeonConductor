import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeProviderTurn } from '@/app/backend/runtime/services/runExecution/providerTurnExecutor';

const {
    createMessagePartRecorderMock,
    getProviderAdapterMock,
    publishProviderPartObservabilityEventMock,
    publishUsageObservabilityEventMock,
    recordTransportSelectionIfChangedMock,
} = vi.hoisted(() => ({
    createMessagePartRecorderMock: vi.fn(),
    getProviderAdapterMock: vi.fn(),
    publishProviderPartObservabilityEventMock: vi.fn(),
    publishUsageObservabilityEventMock: vi.fn(),
    recordTransportSelectionIfChangedMock: vi.fn(),
}));

vi.mock('@/app/backend/providers/adapters', () => ({
    getProviderAdapter: getProviderAdapterMock,
}));

vi.mock('@/app/backend/runtime/services/runExecution/eventing', () => ({
    createMessagePartRecorder: createMessagePartRecorderMock,
}));

vi.mock('@/app/backend/runtime/services/observability/publishers', () => ({
    publishProviderPartObservabilityEvent: publishProviderPartObservabilityEventMock,
    publishUsageObservabilityEvent: publishUsageObservabilityEventMock,
}));

vi.mock('@/app/backend/runtime/services/runExecution/transportSelectionRecorder', () => ({
    recordTransportSelectionIfChanged: recordTransportSelectionIfChangedMock,
}));

describe('executeProviderTurn', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        createMessagePartRecorderMock.mockReturnValue({
            recordPart: vi.fn().mockResolvedValue(undefined),
        });
        recordTransportSelectionIfChangedMock.mockResolvedValue({
            selected: 'openai_chat_completions',
            degraded: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('maps a first-output timeout to provider_first_output_timeout', async () => {
        getProviderAdapterMock.mockReturnValue({
            streamCompletion: vi.fn(async () => {
                await new Promise((resolve) => {
                    globalThis.setTimeout(resolve, 31_000);
                });
                return {
                    isErr: () => true,
                    error: {
                        code: 'provider_request_failed',
                        message: 'stream timed out',
                    },
                };
            }),
        });

        const executionPromise = executeProviderTurn({
            executeRunInput: {
                profileId: 'profile_default',
                sessionId: 'sess_alpha',
                runId: 'run_alpha',
                prompt: 'hello',
                topLevelTab: 'agent',
                modeKey: 'code',
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                runtime: {
                    toolProtocol: 'openai_chat_completions',
                    apiFamily: 'openai_compatible',
                },
                authMethod: 'api_key',
                runtimeOptions: {
                    reasoning: {
                        effort: 'medium',
                        summary: 'auto',
                        includeEncrypted: true,
                    },
                    cache: {
                        strategy: 'auto',
                    },
                    transport: {
                        family: 'auto',
                    },
                },
                cache: {
                    strategy: 'auto',
                    applied: false,
                },
                transportSelection: {
                    selected: 'openai_chat_completions',
                    requested: 'auto',
                    degraded: false,
                },
                toolDefinitions: [],
                assistantMessageId: 'msg_assistant',
                signal: new AbortController().signal,
            },
            state: {
                usage: {},
                transportSelection: {
                    selected: 'openai_chat_completions',
                    requested: 'auto',
                    degraded: false,
                },
                firstRenderableOutputReceived: false,
                firstOutputTimedOut: false,
            },
            conversationMessages: [],
            assistantMessageId: 'msg_assistant',
        });

        await vi.advanceTimersByTimeAsync(31_000);
        const result = await executionPromise;

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected first-output timeout to fail.');
        }
        expect(result.error.code).toBe('provider_first_output_timeout');
    });
});
