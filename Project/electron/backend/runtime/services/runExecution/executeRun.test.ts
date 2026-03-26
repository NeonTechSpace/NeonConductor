import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeRun } from '@/app/backend/runtime/services/runExecution/executeRun';

const defaultRuntimeOptions = {
    reasoning: {
        effort: 'medium' as const,
        summary: 'auto' as const,
        includeEncrypted: true,
    },
    cache: {
        strategy: 'auto' as const,
    },
    transport: {
        family: 'auto' as const,
    },
};

const {
    createMessagePartRecorderMock,
    emitTransportSelectionEventMock,
    emitToolResultObservabilityEventMock,
    getProviderAdapterMock,
    publishProviderPartObservabilityEventMock,
    publishToolStateChangedObservabilityEventMock,
    publishUsageObservabilityEventMock,
} = vi.hoisted(() => ({
    createMessagePartRecorderMock: vi.fn(),
    emitTransportSelectionEventMock: vi.fn(),
    emitToolResultObservabilityEventMock: vi.fn(),
    getProviderAdapterMock: vi.fn(),
    publishProviderPartObservabilityEventMock: vi.fn(),
    publishToolStateChangedObservabilityEventMock: vi.fn(),
    publishUsageObservabilityEventMock: vi.fn(),
}));

vi.mock('@/app/backend/providers/adapters', () => ({
    getProviderAdapter: getProviderAdapterMock,
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    messageMediaStore: {
        getPayload: vi.fn(),
    },
    messageStore: {
        createMessage: vi.fn(),
    },
    runStore: {
        updateRuntimeMetadata: vi.fn(),
    },
}));

vi.mock('@/app/backend/runtime/services/runExecution/eventing', () => ({
    createMessagePartRecorder: createMessagePartRecorderMock,
    emitMessageCreatedEvent: vi.fn(),
    emitToolResultObservabilityEvent: emitToolResultObservabilityEventMock,
    emitTransportSelectionEvent: emitTransportSelectionEventMock,
}));

vi.mock('@/app/backend/runtime/services/observability/publishers', () => ({
    publishProviderPartObservabilityEvent: publishProviderPartObservabilityEventMock,
    publishToolStateChangedObservabilityEvent: publishToolStateChangedObservabilityEventMock,
    publishUsageObservabilityEvent: publishUsageObservabilityEventMock,
}));

vi.mock('@/app/backend/runtime/services/toolExecution/service', () => ({
    toolExecutionService: {
        invokeWithOutcome: vi.fn(),
    },
}));

describe('executeRun', () => {
    beforeEach(() => {
        createMessagePartRecorderMock.mockReturnValue({
            recordPart: vi.fn().mockResolvedValue(undefined),
        });
    });

    it('returns a completed loop outcome instead of finalizing the run directly', async () => {
        getProviderAdapterMock.mockReturnValue({
            streamCompletion: vi.fn(async (_runtimeInput: unknown, callbacks: { onPart: (part: unknown) => Promise<void> }) => {
                await callbacks.onPart({
                    partType: 'text',
                    payload: {
                        text: 'hello',
                    },
                });
                return {
                    isErr: () => false,
                    value: undefined,
                };
            }),
        });

        const result = await executeRun({
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
            runtimeOptions: defaultRuntimeOptions,
            cache: {
                strategy: 'auto',
                applied: false,
            },
            transportSelection: {
                requested: 'auto',
                selected: 'openai_chat_completions',
                degraded: false,
            },
            toolDefinitions: [],
            assistantMessageId: 'msg_assistant',
            signal: new AbortController().signal,
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error('Expected completed execution loop outcome.');
        }
        expect(result.value).toEqual({
            kind: 'completed',
            usage: {},
        });
    });

    it('fails closed when a provider emits an unsupported tool', async () => {
        getProviderAdapterMock.mockReturnValue({
            streamCompletion: vi.fn(async (_runtimeInput: unknown, callbacks: { onPart: (part: unknown) => Promise<void> }) => {
                await callbacks.onPart({
                    partType: 'tool_call',
                    payload: {
                        callId: 'call_1',
                        toolName: 'write_file',
                        argumentsText: '{"path":"README.md"}',
                        args: {
                            path: 'README.md',
                        },
                    },
                });
                return {
                    isErr: () => false,
                    value: undefined,
                };
            }),
        });

        const result = await executeRun({
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
            runtimeOptions: defaultRuntimeOptions,
            cache: {
                strategy: 'auto',
                applied: false,
            },
            transportSelection: {
                requested: 'auto',
                selected: 'openai_chat_completions',
                degraded: false,
            },
            toolDefinitions: [
                {
                    id: 'read_file',
                    description: 'Read file contents',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                    },
                },
            ],
            assistantMessageId: 'msg_assistant',
            signal: new AbortController().signal,
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected unsupported tool emission to fail.');
        }
        expect(result.error.code).toBe('invalid_payload');
    });
});
