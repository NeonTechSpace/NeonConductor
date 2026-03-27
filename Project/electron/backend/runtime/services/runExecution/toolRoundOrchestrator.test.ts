import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeToolRound } from '@/app/backend/runtime/services/runExecution/toolRoundOrchestrator';

const { invokeWithOutcomeMock, persistToolResultMessageMock, publishToolStateChangedObservabilityEventMock } =
    vi.hoisted(() => ({
        invokeWithOutcomeMock: vi.fn(),
        persistToolResultMessageMock: vi.fn(),
        publishToolStateChangedObservabilityEventMock: vi.fn(),
    }));

vi.mock('@/app/backend/runtime/services/toolExecution/service', () => ({
    toolExecutionService: {
        invokeWithOutcome: invokeWithOutcomeMock,
    },
}));

vi.mock('@/app/backend/runtime/services/runExecution/toolResultMessageRecorder', () => ({
    persistToolResultMessage: persistToolResultMessageMock,
}));

vi.mock('@/app/backend/runtime/services/observability/publishers', () => ({
    publishToolStateChangedObservabilityEvent: publishToolStateChangedObservabilityEventMock,
}));

describe('executeToolRound', () => {
    beforeEach(() => {
        invokeWithOutcomeMock.mockReset();
        persistToolResultMessageMock.mockReset();
        publishToolStateChangedObservabilityEventMock.mockReset();
    });

    it('fails closed when the provider emits an unsupported tool', async () => {
        const result = await executeToolRound({
            executeRunInput: {
                profileId: 'profile_default',
                sessionId: 'sess_alpha',
                runId: 'run_alpha',
                topLevelTab: 'agent',
                modeKey: 'code',
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                toolDefinitions: [
                    {
                        id: 'read_file',
                    },
                ],
            },
            toolCalls: [
                {
                    callId: 'call_1',
                    toolName: 'write_file',
                    argumentsText: '{"path":"README.md"}',
                    args: {
                        path: 'README.md',
                    },
                },
            ],
            allowedToolIds: new Set(['read_file']),
            conversationMessages: [],
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected unsupported tool to fail.');
        }
        expect(result.error.code).toBe('invalid_payload');
        expect(invokeWithOutcomeMock).not.toHaveBeenCalled();
        expect(persistToolResultMessageMock).not.toHaveBeenCalled();
    });
});
