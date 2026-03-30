import { beforeEach, describe, expect, it, vi } from 'vitest';

import { neonObservabilityService } from '@/app/backend/runtime/services/observability/service';
import type { ToolInvocationObservabilityContext, ToolInvokeInput } from '@/app/backend/runtime/contracts';
import {
    logBlockedOutcome,
    logDispatchOutcome,
    publishAllowedExecutionObservability,
    publishBlockedOutcomeObservability,
    publishDispatchOutcomeObservability,
} from '@/app/backend/runtime/services/toolExecution/toolExecutionObservability';

const { debugMock, infoMock, warnMock } = vi.hoisted(() => ({
    debugMock: vi.fn(),
    infoMock: vi.fn(),
    warnMock: vi.fn(),
}));

vi.mock('@/app/main/logging', () => ({
    appLog: {
        debug: debugMock,
        info: infoMock,
        warn: warnMock,
    },
}));

const request: ToolInvokeInput = {
    profileId: 'profile_default',
    toolId: 'read_file',
    topLevelTab: 'agent' as const,
    modeKey: 'code',
    args: {},
};

const observability: ToolInvocationObservabilityContext = {
    sessionId: 'sess_alpha',
    runId: 'run_alpha',
    providerId: 'openai',
    modelId: 'gpt-test',
    toolCallId: 'call_1',
    toolName: 'read_file',
    argumentsText: '{}',
};

describe('toolExecutionObservability', () => {
    beforeEach(() => {
        neonObservabilityService.resetForTests();
        debugMock.mockReset();
        infoMock.mockReset();
        warnMock.mockReset();
    });

    it('publishes approval_required blocked state and logs it', () => {
        publishBlockedOutcomeObservability({
            request,
            observability,
            outcome: {
                kind: 'approval_required',
                toolId: 'read_file',
                message: 'Need approval',
                args: {},
                at: '2026-03-30T10:00:00.000Z',
                requestId: 'perm_1',
                policy: { effective: 'ask', source: 'profile' },
            },
        });
        logBlockedOutcome({
            request,
            outcome: {
                kind: 'approval_required',
                toolId: 'read_file',
                message: 'Need approval',
                args: {},
                at: '2026-03-30T10:00:00.000Z',
                requestId: 'perm_1',
                policy: { effective: 'ask', source: 'profile' },
            },
        });

        expect(neonObservabilityService.list({}, 10)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'tool_state_changed',
                    state: 'approval_required',
                    requestId: 'perm_1',
                    policySource: 'profile',
                }),
            ])
        );
        expect(infoMock).toHaveBeenCalledWith(
            expect.objectContaining({
                tag: 'tool-execution',
                requestId: 'perm_1',
            })
        );
    });

    it('publishes approved and executing states from the allowed transition', () => {
        publishAllowedExecutionObservability({
            request,
            observability,
            allowed: {
                kind: 'allow',
                resource: 'tool:read_file',
                policy: { effective: 'allow', source: 'mode' },
            },
        });

        expect(
            neonObservabilityService
                .list({}, 10)
                .filter((event) => event.kind === 'tool_state_changed')
                .map((event) => event.state)
        ).toEqual(['approved', 'executing']);
    });

    it('publishes completed state and logs successful dispatch', () => {
        publishDispatchOutcomeObservability({
            request,
            observability,
            outcome: {
                kind: 'executed',
                toolId: 'read_file',
                output: { text: 'hello' },
                at: '2026-03-30T10:00:00.000Z',
                policy: { effective: 'allow', source: 'mode' },
            },
        });
        logDispatchOutcome({
            request,
            outcome: {
                kind: 'executed',
                toolId: 'read_file',
                output: { text: 'hello' },
                at: '2026-03-30T10:00:00.000Z',
                policy: { effective: 'allow', source: 'mode' },
            },
        });

        expect(neonObservabilityService.list({}, 10)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'tool_state_changed',
                    state: 'completed',
                    policySource: 'mode',
                }),
            ])
        );
        expect(debugMock).toHaveBeenCalledWith(
            expect.objectContaining({
                tag: 'tool-execution',
                toolId: 'read_file',
            })
        );
    });

    it('publishes failed state and logs failed dispatch', () => {
        publishDispatchOutcomeObservability({
            request,
            observability,
            outcome: {
                kind: 'failed',
                toolId: 'read_file',
                message: 'boom',
                args: {},
                at: '2026-03-30T10:00:00.000Z',
                error: 'execution_failed',
                policy: { effective: 'allow', source: 'mode' },
            },
        });
        logDispatchOutcome({
            request,
            outcome: {
                kind: 'failed',
                toolId: 'read_file',
                message: 'boom',
                args: {},
                at: '2026-03-30T10:00:00.000Z',
                error: 'execution_failed',
                policy: { effective: 'allow', source: 'mode' },
            },
        });

        expect(neonObservabilityService.list({}, 10)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'tool_state_changed',
                    state: 'failed',
                    error: 'boom',
                }),
            ])
        );
        expect(warnMock).toHaveBeenCalledWith(
            expect.objectContaining({
                tag: 'tool-execution',
                errorCode: 'execution_failed',
                errorMessage: 'boom',
            })
        );
    });
});
