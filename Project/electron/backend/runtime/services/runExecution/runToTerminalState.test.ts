import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runToTerminalState } from '@/app/backend/runtime/services/runExecution/runToTerminalState';

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
    applyRunTerminalOutcomeMock,
    ensureCheckpointForRunMock,
    executeRunMock,
} = vi.hoisted(() => ({
    applyRunTerminalOutcomeMock: vi.fn(),
    ensureCheckpointForRunMock: vi.fn(),
    executeRunMock: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/checkpoint/service', () => ({
    captureCheckpointDiffForRun: vi.fn(),
    ensureCheckpointForRun: ensureCheckpointForRunMock,
}));

vi.mock('@/app/backend/runtime/services/runExecution/executeRun', () => ({
    executeRun: executeRunMock,
    isAbortError: vi.fn(() => false),
}));

vi.mock('@/app/backend/runtime/services/runExecution/terminalState', () => ({
    applyRunTerminalOutcome: applyRunTerminalOutcomeMock,
    moveRunToAbortedState: vi.fn(),
    moveRunToFailedState: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/runtimeEventLog', () => ({
    runtimeEventLogService: {
        append: vi.fn(),
    },
}));

describe('runToTerminalState', () => {
    beforeEach(() => {
        ensureCheckpointForRunMock.mockResolvedValue({
            isErr: () => false,
            value: null,
        });
    });

    it('routes successful execution through the unified terminal outcome applier', async () => {
        executeRunMock.mockResolvedValue({
            isErr: () => false,
            value: {
                kind: 'completed',
                usage: {
                    totalTokens: 12,
                },
            },
        });

        await runToTerminalState({
            profileId: 'profile_default',
            sessionId: 'sess_alpha',
            threadId: 'thr_alpha',
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
            workspaceContext: {
                kind: 'workspace',
                absolutePath: 'C:\\repo',
                workspaceFingerprint: 'ws_alpha',
                label: 'repo',
                executionEnvironmentMode: 'local',
            },
            assistantMessageId: 'msg_assistant',
            signal: new AbortController().signal,
        });

        expect(applyRunTerminalOutcomeMock).toHaveBeenCalledWith(
            expect.objectContaining({
                profileId: 'profile_default',
                sessionId: 'sess_alpha',
                threadId: 'thr_alpha',
                runId: 'run_alpha',
                outcome: {
                    kind: 'completed',
                    usage: {
                        totalTokens: 12,
                    },
                },
            })
        );
    });
});
