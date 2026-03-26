import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolExecutionService } from '@/app/backend/runtime/services/toolExecution/service';

function createHandledErrResult(error: { code: string; message: string }) {
    const result = err(error);
    result.match(
        () => undefined,
        () => undefined
    );
    return result;
}

function createHandledOkResult<T>(value: T) {
    const result = ok(value);
    result.match(
        () => undefined,
        () => undefined
    );
    return result;
}

const {
    buildBlockedToolOutcomeMock,
    buildDeniedToolOutcomeMock,
    findToolByIdMock,
    getExecutionPresetMock,
    invokeToolHandlerMock,
    resolveToolDecisionMock,
} = vi.hoisted(() => ({
    buildBlockedToolOutcomeMock: vi.fn(),
    buildDeniedToolOutcomeMock: vi.fn(),
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
    boundaryDefaultPolicy: vi.fn(() => 'ask'),
    boundaryResource: vi.fn((toolId: string, boundary: string) => `tool:${toolId}:boundary:${boundary}`),
    resolveToolDecision: resolveToolDecisionMock,
}));

vi.mock('@/app/backend/runtime/services/toolExecution/blocked', () => ({
    buildBlockedToolOutcome: buildBlockedToolOutcomeMock,
    buildDeniedToolOutcome: buildDeniedToolOutcomeMock,
}));

vi.mock('@/app/backend/runtime/services/toolExecution/handlers', () => ({
    invokeToolHandler: invokeToolHandlerMock,
}));

vi.mock('@/app/backend/runtime/services/toolExecution/events', () => ({
    emitPermissionRequestedEvent: vi.fn(),
    emitToolBlockedEvent: vi.fn(),
    emitToolCompletedEvent: vi.fn(),
    emitToolFailedEvent: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/mcp/service', () => ({
    mcpService: {
        invokeTool: vi.fn(),
    },
}));

vi.mock('@/app/backend/runtime/services/workspaceContext/service', () => ({
    workspaceContextService: {
        resolveExplicit: vi.fn(),
    },
}));

describe('ToolExecutionService outcomes', () => {
    beforeEach(() => {
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

    it('returns approval_required as a first-class outcome', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'ask',
            resource: 'tool:read_file',
            scopeKind: 'tool',
            summary: { title: 'Need approval', detail: 'Need approval' },
            message: 'Need approval',
            policy: { effective: 'ask', source: 'profile' },
        });
        buildBlockedToolOutcomeMock.mockResolvedValue({
            kind: 'approval_required',
            toolId: 'read_file',
            message: 'Need approval',
            args: {},
            at: '2026-03-26T10:00:00.000Z',
            requestId: 'perm_1',
            policy: { effective: 'ask', source: 'profile' },
        });

        const service = new ToolExecutionService();
        const outcome = await service.invokeWithOutcome({
            profileId: 'profile_default',
            toolId: 'read_file',
            topLevelTab: 'agent',
            modeKey: 'code',
            args: {},
        });

        expect(outcome).toMatchObject({
            kind: 'approval_required',
            requestId: 'perm_1',
        });
    });

    it('returns denied for detached workspace-required tools', async () => {
        findToolByIdMock.mockResolvedValue({
            tool: {
                id: 'read_file',
                label: 'Read File',
                capabilities: ['filesystem_read'],
                requiresWorkspace: true,
                permissionPolicy: 'allow',
                allowsExternalPaths: false,
                allowsIgnoredPaths: false,
            },
            resource: 'tool:read_file',
            source: 'native',
        });
        buildDeniedToolOutcomeMock.mockResolvedValue({
            kind: 'denied',
            toolId: 'read_file',
            message: 'Detached chat has no file authority.',
            args: {},
            at: '2026-03-26T10:00:00.000Z',
            policy: { effective: 'deny', source: 'detached_scope' },
            reason: 'detached_scope',
        });

        const service = new ToolExecutionService();
        const outcome = await service.invokeWithOutcome({
            profileId: 'profile_default',
            toolId: 'read_file',
            topLevelTab: 'agent',
            modeKey: 'code',
            args: {},
        });

        expect(outcome).toMatchObject({
            kind: 'denied',
            reason: 'detached_scope',
        });
    });

    it('returns failed when the handler errors after approval', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'allow',
            resource: 'tool:read_file',
            policy: { effective: 'allow', source: 'mode' },
        });
        invokeToolHandlerMock.mockImplementation(() =>
            Promise.resolve(
                createHandledErrResult({
                    code: 'execution_failed',
                    message: 'boom',
                })
            )
        );

        const service = new ToolExecutionService();
        const outcome = await service.invokeWithOutcome({
            profileId: 'profile_default',
            toolId: 'read_file',
            topLevelTab: 'agent',
            modeKey: 'code',
            args: {},
        });

        expect(outcome).toMatchObject({
            kind: 'failed',
            error: 'execution_failed',
            message: 'boom',
        });
    });

    it('serializes the stable public tool.invoke shape from the internal outcome', async () => {
        resolveToolDecisionMock.mockResolvedValue({
            kind: 'allow',
            resource: 'tool:read_file',
            policy: { effective: 'allow', source: 'mode' },
        });
        invokeToolHandlerMock.mockImplementation(() => Promise.resolve(createHandledOkResult({ text: 'hello' })));

        const service = new ToolExecutionService();
        const result = await service.invoke({
            profileId: 'profile_default',
            toolId: 'read_file',
            topLevelTab: 'agent',
            modeKey: 'code',
            args: {},
        });

        expect(result).toMatchObject({
            ok: true,
            toolId: 'read_file',
            output: { text: 'hello' },
        });
    });
});
