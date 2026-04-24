import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchToolInvocation } from '@/app/backend/runtime/services/toolExecution/toolDispatchExecutor';
import type { ResolvedToolDefinition } from '@/app/backend/runtime/services/toolExecution/types';

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

const { invokeToolHandlerMock, mcpInvokeToolMock } = vi.hoisted(() => ({
    invokeToolHandlerMock: vi.fn(),
    mcpInvokeToolMock: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/toolExecution/handlers', () => ({
    invokeToolHandler: invokeToolHandlerMock,
}));

vi.mock('@/app/backend/runtime/services/mcp/service', () => ({
    mcpService: {
        invokeTool: mcpInvokeToolMock,
    },
}));

describe('dispatchToolInvocation', () => {
    beforeEach(() => {
        invokeToolHandlerMock.mockReset();
        mcpInvokeToolMock.mockReset();
    });

    function buildNativeToolDefinition(): ResolvedToolDefinition {
        return {
            tool: {
                id: 'read_file',
                label: 'Read File',
                description: 'Read a file from disk.',
                capabilities: ['filesystem_read'],
                requiresWorkspace: false,
                permissionPolicy: 'allow',
                allowsExternalPaths: false,
                allowsIgnoredPaths: false,
                mutability: 'read_only',
            },
            resource: 'tool:read_file',
            source: 'native' as const,
        };
    }

    function buildMcpToolDefinition(): ResolvedToolDefinition {
        return {
            tool: {
                id: 'mcp__server__tool',
                label: 'MCP Tool',
                description: 'MCP-backed tool.',
                capabilities: ['mcp'],
                requiresWorkspace: false,
                permissionPolicy: 'ask',
                allowsExternalPaths: false,
                allowsIgnoredPaths: false,
                mutability: 'read_only',
            },
            resource: 'mcp:server:tool',
            source: 'mcp' as const,
            mcpServerId: 'server',
            mcpToolName: 'tool',
        };
    }

    it('preserves policy metadata for native tool success', async () => {
        const nativeResult = createHandledOkResult({ text: 'native output' });
        nativeResult.match(
            () => undefined,
            () => undefined
        );
        invokeToolHandlerMock.mockResolvedValue(nativeResult);

        const outcome = await dispatchToolInvocation({
            context: {
                at: '2026-03-30T10:00:00.000Z',
                args: { path: 'README.md' },
                definition: buildNativeToolDefinition(),
                executionArgs: { path: 'README.md' },
                shellApprovalContext: null,
                executionRootRequirement: 'resolved',
                executionRoot: {
                    kind: 'workspace',
                    workspaceFingerprint: 'ws_alpha',
                    label: 'Test workspace',
                    absolutePath: '/workspace/project',
                },
            },
            allowed: {
                kind: 'allow',
                resource: 'tool:read_file',
                policy: {
                    effective: 'allow',
                    source: 'mode',
                },
            },
        });

        expect(outcome).toEqual({
            kind: 'executed',
            toolId: 'read_file',
            output: { text: 'native output' },
            at: '2026-03-30T10:00:00.000Z',
            policy: {
                effective: 'allow',
                source: 'mode',
            },
        });
        expect(invokeToolHandlerMock).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'read_file' }),
            { path: 'README.md' },
            {
                cwd: '/workspace/project',
                executionRoot: {
                    kind: 'workspace',
                    label: 'Test workspace',
                    absolutePath: '/workspace/project',
                },
            }
        );
    });

    it('strips supported artifact candidates from native tool output while preserving the semantic preview payload', async () => {
        const nativeResult = createHandledOkResult({
            path: 'README.md',
            content: 'preview body',
            truncated: true,
            artifactCandidate: {
                kind: 'file_read',
                contentType: 'text/plain',
                rawText: 'full file body',
                metadata: {
                    path: 'README.md',
                    byteLength: 50_000,
                    lineCount: 100,
                    omittedBytes: 38_000,
                    previewTruncated: true,
                },
            },
        });
        nativeResult.match(
            () => undefined,
            () => undefined
        );
        invokeToolHandlerMock.mockResolvedValue(nativeResult);

        const outcome = await dispatchToolInvocation({
            context: {
                at: '2026-03-30T10:00:00.000Z',
                args: { path: 'README.md' },
                definition: buildNativeToolDefinition(),
                executionArgs: { path: 'README.md' },
                shellApprovalContext: null,
                workspaceRequirement: 'resolved',
                workspaceRootPath: '/workspace/project',
            },
            allowed: {
                kind: 'allow',
                resource: 'tool:read_file',
                policy: {
                    effective: 'allow',
                    source: 'mode',
                },
            },
        });

        expect(outcome).toEqual({
            kind: 'executed',
            toolId: 'read_file',
            output: {
                path: 'README.md',
                content: 'preview body',
                truncated: true,
            },
            artifactCandidate: {
                kind: 'file_read',
                contentType: 'text/plain',
                rawText: 'full file body',
                metadata: {
                    path: 'README.md',
                    byteLength: 50_000,
                    lineCount: 100,
                    omittedBytes: 38_000,
                    previewTruncated: true,
                },
            },
            at: '2026-03-30T10:00:00.000Z',
            policy: {
                effective: 'allow',
                source: 'mode',
            },
        });
    });

    it('preserves policy metadata for native tool failure', async () => {
        const nativeResult = createHandledErrResult({
            code: 'execution_failed',
            message: 'native failure',
        });
        nativeResult.match(
            () => undefined,
            () => undefined
        );
        invokeToolHandlerMock.mockResolvedValue(nativeResult);

        const outcome = await dispatchToolInvocation({
            context: {
                at: '2026-03-30T10:00:00.000Z',
                args: {},
                definition: buildNativeToolDefinition(),
                executionArgs: {},
                shellApprovalContext: null,
                workspaceRequirement: 'not_required',
            },
            allowed: {
                kind: 'allow',
                resource: 'tool:read_file',
                policy: {
                    effective: 'allow',
                    source: 'profile',
                },
            },
        });

        expect(outcome).toEqual({
            kind: 'failed',
            toolId: 'read_file',
            error: 'execution_failed',
            message: 'native failure',
            args: {},
            at: '2026-03-30T10:00:00.000Z',
            policy: {
                effective: 'allow',
                source: 'profile',
            },
        });
    });

    it('preserves policy metadata for MCP tool success', async () => {
        const mcpResult = createHandledOkResult({ content: ['mcp output'] });
        mcpResult.match(
            () => undefined,
            () => undefined
        );
        mcpInvokeToolMock.mockResolvedValue(mcpResult);

        const outcome = await dispatchToolInvocation({
            context: {
                at: '2026-03-30T10:00:00.000Z',
                args: { query: 'status' },
                definition: buildMcpToolDefinition(),
                executionArgs: { query: 'status' },
                shellApprovalContext: null,
                workspaceRequirement: 'not_required',
            },
            allowed: {
                kind: 'allow',
                resource: 'mcp:server:tool',
                policy: {
                    effective: 'allow',
                    source: 'one_time_approval',
                },
            },
        });

        expect(outcome).toEqual({
            kind: 'executed',
            toolId: 'mcp__server__tool',
            output: { content: ['mcp output'] },
            at: '2026-03-30T10:00:00.000Z',
            policy: {
                effective: 'allow',
                source: 'one_time_approval',
            },
        });
        expect(mcpInvokeToolMock).toHaveBeenCalledWith({
            toolId: 'mcp__server__tool',
            args: { query: 'status' },
        });
    });

    it('maps MCP execution errors to failed outcomes while preserving policy metadata', async () => {
        const mcpResult = createHandledErrResult({
            code: 'request_failed',
            message: 'mcp failure',
        });
        mcpResult.match(
            () => undefined,
            () => undefined
        );
        mcpInvokeToolMock.mockResolvedValue(mcpResult);

        const outcome = await dispatchToolInvocation({
            context: {
                at: '2026-03-30T10:00:00.000Z',
                args: { query: 'status' },
                definition: buildMcpToolDefinition(),
                executionArgs: { query: 'status' },
                shellApprovalContext: null,
                workspaceRequirement: 'not_required',
            },
            allowed: {
                kind: 'allow',
                resource: 'mcp:server:tool',
                policy: {
                    effective: 'allow',
                    source: 'mode',
                },
            },
        });

        expect(outcome).toEqual({
            kind: 'failed',
            toolId: 'mcp__server__tool',
            error: 'execution_failed',
            message: 'mcp failure',
            args: { query: 'status' },
            at: '2026-03-30T10:00:00.000Z',
            policy: {
                effective: 'allow',
                source: 'mode',
            },
        });
    });
});
