import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveRuntimeToolsForMode } from '@/app/backend/runtime/services/runExecution/tools';
import { createDefaultPreparedContextModeOverrides } from '@/app/backend/runtime/contracts';
import type { RuntimeToolGuidanceContext } from '@/app/backend/runtime/services/runExecution/types';

import type { ModeDefinition } from '@/shared/contracts';

const { toolStoreListMock, mcpListRuntimeToolsMock } = vi.hoisted(() => ({
    toolStoreListMock: vi.fn(),
    mcpListRuntimeToolsMock: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    toolStore: {
        list: toolStoreListMock,
    },
}));

vi.mock('@/app/backend/runtime/services/mcp/service', () => ({
    mcpService: {
        listRuntimeTools: mcpListRuntimeToolsMock,
    },
}));

function buildMode(input: {
    toolCapabilities: NonNullable<ModeDefinition['executionPolicy']['toolCapabilities']>;
    planningOnly?: boolean;
    workflowCapabilities?: NonNullable<ModeDefinition['executionPolicy']['workflowCapabilities']>;
    behaviorFlags?: NonNullable<ModeDefinition['executionPolicy']['behaviorFlags']>;
}): ModeDefinition {
    return {
        id: 'mode_test_agent_code',
        profileId: 'profile_default',
        topLevelTab: 'agent',
        modeKey: 'code',
        authoringRole: 'single_task_agent',
        roleTemplate:
            input.planningOnly || input.workflowCapabilities?.includes('planning')
                ? 'single_task_agent/plan'
                : 'single_task_agent/apply',
        internalModelRole:
            input.planningOnly || input.workflowCapabilities?.includes('planning') ? 'planner' : 'apply',
        delegatedOnly: false,
        sessionSelectable: true,
        label: 'Agent Code',
        assetKey: 'agent.code',
        prompt: {},
        promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
        executionPolicy: {
            authoringRole: 'single_task_agent',
            roleTemplate:
                input.planningOnly || input.workflowCapabilities?.includes('planning')
                    ? 'single_task_agent/plan'
                    : 'single_task_agent/apply',
            internalModelRole:
                input.planningOnly || input.workflowCapabilities?.includes('planning') ? 'planner' : 'apply',
            delegatedOnly: false,
            sessionSelectable: true,
            toolCapabilities: input.toolCapabilities,
            ...(input.planningOnly ? { planningOnly: true } : {}),
            ...(input.workflowCapabilities ? { workflowCapabilities: input.workflowCapabilities } : {}),
            ...(input.behaviorFlags ? { behaviorFlags: input.behaviorFlags } : {}),
        },
        source: 'test',
        sourceKind: 'system_seed',
        scope: 'system',
        enabled: true,
        precedence: 0,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
    };
}

function buildGuidanceContext(): RuntimeToolGuidanceContext {
    return {
        platform: process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux',
        shellFamily: process.platform === 'win32' ? 'powershell' : 'posix_sh',
        shellExecutable: process.platform === 'win32' ? 'pwsh.exe' : '/bin/sh',
        shellResolved: true,
        vendoredRipgrepAvailable: true,
    };
}

describe('resolveRuntimeToolsForMode', () => {
    beforeEach(() => {
        toolStoreListMock.mockReset();
        mcpListRuntimeToolsMock.mockReset();
        toolStoreListMock.mockResolvedValue([
            {
                id: 'write_file',
                label: 'Write File',
                description: 'Write a file.',
                permissionPolicy: 'ask',
                mutability: 'mutating',
                capabilities: ['filesystem_write'],
                requiresWorkspace: true,
                allowsExternalPaths: false,
                allowsIgnoredPaths: false,
            },
            {
                id: 'run_command',
                label: 'Run Command',
                description: 'Run a command.',
                permissionPolicy: 'ask',
                mutability: 'mutating',
                capabilities: ['shell'],
                requiresWorkspace: true,
                allowsExternalPaths: false,
                allowsIgnoredPaths: false,
            },
            {
                id: 'execute_code',
                label: 'Execute Code',
                description: 'Run approved JavaScript transform code.',
                permissionPolicy: 'ask',
                mutability: 'mutating',
                capabilities: ['code_runtime'],
                requiresWorkspace: true,
                allowsExternalPaths: false,
                allowsIgnoredPaths: false,
            },
            {
                id: 'list_files',
                label: 'List Files',
                description: 'List files.',
                permissionPolicy: 'ask',
                mutability: 'read_only',
                capabilities: ['filesystem_read'],
                requiresWorkspace: true,
                allowsExternalPaths: false,
                allowsIgnoredPaths: false,
            },
            {
                id: 'search_files',
                label: 'Search Files',
                description: 'Search files.',
                permissionPolicy: 'ask',
                mutability: 'read_only',
                capabilities: ['filesystem_read'],
                requiresWorkspace: true,
                allowsExternalPaths: false,
                allowsIgnoredPaths: false,
            },
            {
                id: 'read_file',
                label: 'Read File',
                description: 'Read a file.',
                permissionPolicy: 'ask',
                mutability: 'read_only',
                capabilities: ['filesystem_read'],
                requiresWorkspace: true,
                allowsExternalPaths: false,
                allowsIgnoredPaths: false,
            },
        ]);
        mcpListRuntimeToolsMock.mockResolvedValue([]);
    });

    it('orders the built-in core deliberately for write-capable modes', async () => {
        const tools = await resolveRuntimeToolsForMode({
            mode: buildMode({ toolCapabilities: ['filesystem_read', 'filesystem_write', 'shell', 'code_runtime'] }),
        });

        expect(tools.map((tool) => tool.id)).toEqual([
            'list_files',
            'read_file',
            'search_files',
            'write_file',
            'run_command',
            'execute_code',
        ]);
    });

    it('exposes write_file to custom modes that already declare filesystem_write', async () => {
        const tools = await resolveRuntimeToolsForMode({
            mode: buildMode({ toolCapabilities: ['filesystem_read', 'filesystem_write', 'code_runtime'] }),
        });

        expect(tools.map((tool) => tool.id)).toEqual([
            'list_files',
            'read_file',
            'search_files',
            'write_file',
            'execute_code',
        ]);
    });

    it('keeps edited base descriptions while appending runtime guidance', async () => {
        toolStoreListMock.mockResolvedValue([
            {
                id: 'write_file',
                label: 'Write File',
                description: 'Base editable write description.',
                permissionPolicy: 'ask',
                mutability: 'mutating',
                capabilities: ['filesystem_write'],
                requiresWorkspace: true,
                allowsExternalPaths: false,
                allowsIgnoredPaths: false,
            },
        ]);

        const tools = await resolveRuntimeToolsForMode({
            mode: buildMode({ toolCapabilities: ['filesystem_write'] }),
            guidanceContext: buildGuidanceContext(),
        });

        expect(tools[0]?.description).toContain('Base editable write description.');
        expect(tools[0]?.description).toContain('Prefer this tool for ordinary whole-file creation or replacement');
    });

    it('filters mutating tools out of planning-only modes while keeping read-only tools', async () => {
        mcpListRuntimeToolsMock.mockResolvedValue([
            {
                id: 'mcp__read_only',
                description: 'Read-only MCP tool.',
                inputSchema: { type: 'object', properties: {} },
                mutability: 'read_only',
                serverId: 'mcp_alpha',
                toolName: 'read_only_tool',
                resource: 'mcp:mcp_alpha:read_only_tool',
            },
            {
                id: 'mcp__mutating',
                description: 'Mutating MCP tool.',
                inputSchema: { type: 'object', properties: {} },
                mutability: 'mutating',
                serverId: 'mcp_alpha',
                toolName: 'mutating_tool',
                resource: 'mcp:mcp_alpha:mutating_tool',
            },
        ]);

        const tools = await resolveRuntimeToolsForMode({
            mode: buildMode({ toolCapabilities: ['filesystem_read', 'shell', 'mcp'], planningOnly: true }),
        });

        expect(tools.map((tool) => tool.id)).toEqual(['list_files', 'read_file', 'search_files', 'mcp__read_only']);
    });

    it('filters mutating tools out of capability-driven read-only planning modes while keeping read-only tools', async () => {
        mcpListRuntimeToolsMock.mockResolvedValue([
            {
                id: 'mcp__read_only',
                description: 'Read-only MCP tool.',
                inputSchema: { type: 'object', properties: {} },
                mutability: 'read_only',
                serverId: 'mcp_alpha',
                toolName: 'read_only_tool',
                resource: 'mcp:mcp_alpha:read_only_tool',
            },
            {
                id: 'mcp__mutating',
                description: 'Mutating MCP tool.',
                inputSchema: { type: 'object', properties: {} },
                mutability: 'mutating',
                serverId: 'mcp_alpha',
                toolName: 'mutating_tool',
                resource: 'mcp:mcp_alpha:mutating_tool',
            },
        ]);

        const tools = await resolveRuntimeToolsForMode({
            mode: buildMode({
                toolCapabilities: ['filesystem_read', 'shell', 'mcp'],
                workflowCapabilities: ['planning'],
                behaviorFlags: ['read_only_execution'],
            }),
        });

        expect(tools.map((tool) => tool.id)).toEqual(['list_files', 'read_file', 'search_files', 'mcp__read_only']);
    });

    it('exposes execute_code only to modes that include code_runtime', async () => {
        const tools = await resolveRuntimeToolsForMode({
            mode: buildMode({ toolCapabilities: ['filesystem_read', 'filesystem_write', 'shell', 'code_runtime'] }),
        });
        const toolsWithoutCodeRuntime = await resolveRuntimeToolsForMode({
            mode: buildMode({ toolCapabilities: ['filesystem_read', 'filesystem_write', 'shell'] }),
        });

        expect(tools.map((tool) => tool.id)).toContain('execute_code');
        expect(toolsWithoutCodeRuntime.map((tool) => tool.id)).not.toContain('execute_code');
    });
});
