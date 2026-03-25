import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { neonObservabilityService } from '@/app/backend/runtime/services/observability/service';
import { ToolExecutionService } from '@/app/backend/runtime/services/toolExecution/service';

const {
    buildBlockedToolResultMock,
    emitToolCompletedEventMock,
    emitToolFailedEventMock,
    findToolByIdMock,
    getExecutionPresetMock,
    invokeToolHandlerMock,
    resolveToolDecisionMock,
} = vi.hoisted(() => ({
    buildBlockedToolResultMock: vi.fn(),
    emitToolCompletedEventMock: vi.fn(),
    emitToolFailedEventMock: vi.fn(),
    findToolByIdMock: vi.fn(),
    getExecutionPresetMock: vi.fn(),
    invokeToolHandlerMock: vi.fn(),
    resolveToolDecisionMock: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/profile/executionPreset', () => ({
    getExecutionPreset: getExecutionPresetMock,
}));

vi.mock('@/app/backend/runtime/services/toolExecution/lookup', () => ({
    findToolById: findToolByIdMock,
}));

vi.mock('@/app/backend/runtime/services/toolExecution/decision', () => ({
    boundaryDefaultPolicy: vi.fn(),
    boundaryResource: vi.fn(),
    resolveToolDecision: resolveToolDecisionMock,
}));

vi.mock('@/app/backend/runtime/services/toolExecution/blocked', () => ({
    buildBlockedToolResult: buildBlockedToolResultMock,
}));

vi.mock('@/app/backend/runtime/services/toolExecution/handlers', () => ({
    invokeToolHandler: invokeToolHandlerMock,
}));

vi.mock('@/app/backend/runtime/services/toolExecution/events', () => ({
    emitPermissionRequestedEvent: vi.fn(),
    emitToolBlockedEvent: vi.fn(),
    emitToolCompletedEvent: emitToolCompletedEventMock,
    emitToolFailedEvent: emitToolFailedEventMock,
}));

vi.mock('@/app/backend/runtime/services/mcp/service', () => ({
    mcpService: {
        invokeTool: vi.fn(),
    },
}));

describe('ToolExecutionService observability', () => {
    beforeEach(() => {
        neonObservabilityService.resetForTests();
        getExecutionPresetMock.mockResolvedValue('standard');
        findToolByIdMock.mockResolvedValue({
            tool: {
                id: 'read_file',
                label: 'Read File',
                capabilities: ['filesystem_read'],
                requiresWorkspace: false,
                permissionPolicy: 'allow',
                allowsExternalPaths: false,
                allowsIgnoredPaths: false,
            },
            resource: 'tool:read_file',
            source: 'native',
        });
    });

    it('emits approval-required lifecycle state when the decision asks for permission', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'ask',
            resource: 'tool:read_file',
            scopeKind: 'tool',
            summary: { title: 'Need approval', detail: 'Need approval' },
            message: 'Need approval',
            policy: { effective: 'ask', source: 'profile' },
        });
        buildBlockedToolResultMock.mockResolvedValue({
            ok: false,
            toolId: 'read_file',
            error: 'permission_required',
            message: 'Need approval',
            args: {},
            at: '2026-03-25T10:00:00.000Z',
            requestId: 'perm_1',
            policy: { effective: 'ask', source: 'profile' },
        });

        const service = new ToolExecutionService();
        await service.invoke(
            {
                profileId: 'profile_default',
                toolId: 'read_file',
                topLevelTab: 'agent',
                modeKey: 'code',
                args: {},
            },
            {
                sessionId: 'sess_alpha',
                runId: 'run_alpha',
                providerId: 'openai',
                modelId: 'gpt-test',
                toolCallId: 'call_1',
                toolName: 'read_file',
                argumentsText: '{}',
            }
        );

        expect(neonObservabilityService.list({}, 10)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'tool_state_changed',
                    state: 'approval_required',
                    requestId: 'perm_1',
                }),
            ])
        );
    });

    it('emits approved, executing, and completed lifecycle states for successful execution', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'allow',
            resource: 'tool:read_file',
            policy: { effective: 'allow', source: 'mode' },
        });
        invokeToolHandlerMock.mockResolvedValue(ok({ text: 'hello' }));
        emitToolCompletedEventMock.mockResolvedValue(undefined);

        const service = new ToolExecutionService();
        await service.invoke(
            {
                profileId: 'profile_default',
                toolId: 'read_file',
                topLevelTab: 'agent',
                modeKey: 'code',
                args: {},
            },
            {
                sessionId: 'sess_alpha',
                runId: 'run_alpha',
                providerId: 'openai',
                modelId: 'gpt-test',
                toolCallId: 'call_1',
                toolName: 'read_file',
                argumentsText: '{}',
            }
        );

        expect(
            neonObservabilityService
                .list({}, 10)
                .filter((event) => event.kind === 'tool_state_changed')
                .map((event) => (event.kind === 'tool_state_changed' ? event.state : null))
        ).toEqual(['approved', 'executing', 'completed']);
    });

    it('emits failed lifecycle state when handler execution fails', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'allow',
            resource: 'tool:read_file',
            policy: { effective: 'allow', source: 'mode' },
        });
        invokeToolHandlerMock.mockResolvedValue(
            err({
                code: 'execution_failed',
                message: 'boom',
            })
        );
        emitToolFailedEventMock.mockResolvedValue(undefined);

        const service = new ToolExecutionService();
        await service.invoke(
            {
                profileId: 'profile_default',
                toolId: 'read_file',
                topLevelTab: 'agent',
                modeKey: 'code',
                args: {},
            },
            {
                sessionId: 'sess_alpha',
                runId: 'run_alpha',
                providerId: 'openai',
                modelId: 'gpt-test',
                toolCallId: 'call_1',
                toolName: 'read_file',
                argumentsText: '{}',
            }
        );

        expect(neonObservabilityService.list({}, 10)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'tool_state_changed',
                    state: 'failed',
                    error: 'boom',
                }),
            ])
        );
    });
});
