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
    captureCheckpointDiffForRunMock,
    ensureCheckpointForRunMock,
    executeRunMock,
    moveRunToAbortedStateMock,
    moveRunToFailedStateMock,
} = vi.hoisted(() => ({
    applyRunTerminalOutcomeMock: vi.fn(),
    captureCheckpointDiffForRunMock: vi.fn(),
    ensureCheckpointForRunMock: vi.fn(),
    executeRunMock: vi.fn(),
    moveRunToAbortedStateMock: vi.fn(),
    moveRunToFailedStateMock: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/checkpoint/service', () => ({
    captureCheckpointDiffForRun: captureCheckpointDiffForRunMock,
    ensureCheckpointForRun: ensureCheckpointForRunMock,
}));

vi.mock('@/app/backend/runtime/services/runExecution/executeRun', () => ({
    executeRun: executeRunMock,
    isAbortError: vi.fn(() => false),
}));

vi.mock('@/app/backend/runtime/services/runExecution/terminalState', () => ({
    applyRunTerminalOutcome: applyRunTerminalOutcomeMock,
    moveRunToAbortedState: moveRunToAbortedStateMock,
    moveRunToFailedState: moveRunToFailedStateMock,
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

    it('moves to failed terminal state when checkpoint creation fails', async () => {
        ensureCheckpointForRunMock.mockResolvedValue({
            isErr: () => true,
            error: {
                code: 'provider_request_failed',
                message: 'checkpoint failed',
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

        expect(moveRunToFailedStateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                profileId: 'profile_default',
                sessionId: 'sess_alpha',
                runId: 'run_alpha',
                errorCode: 'provider_request_failed',
                errorMessage: 'checkpoint failed',
            })
        );
    });

    it('moves to aborted terminal state when execution aborts before completion', async () => {
        executeRunMock.mockRejectedValue(new DOMException('Run aborted.', 'AbortError'));

        const abortController = new AbortController();
        abortController.abort();

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
            signal: abortController.signal,
        });

        expect(moveRunToAbortedStateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                profileId: 'profile_default',
                sessionId: 'sess_alpha',
                runId: 'run_alpha',
            })
        );
    });

    it('allows checkpoint diff capture failures without blocking terminal completion', async () => {
        captureCheckpointDiffForRunMock.mockRejectedValue(new Error('diff failed'));
        executeRunMock.mockImplementation(async (input: { onBeforeFinalize?: () => Promise<void> }) => {
            await input.onBeforeFinalize?.();
            return {
                isErr: () => false,
                value: {
                    kind: 'completed',
                    usage: {
                        totalTokens: 12,
                    },
                },
            };
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
