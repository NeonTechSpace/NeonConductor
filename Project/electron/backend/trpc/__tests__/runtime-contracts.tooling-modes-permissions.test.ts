import { describe, expect, it } from 'vitest';

import { resolveRuntimeToolsForMode } from '@/app/backend/runtime/services/runExecution/tools';
import type { EntityId } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';
import {
    runtimeContractProfileId,
    registerRuntimeContractHooks,
    createCaller,
    getPersistence,
    isEntityId,
    mkdtempSync,
    os,
    path,
    writeFileSync,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: permissions and tooling', () => {
    const profileId = runtimeContractProfileId;
    it('resolves seeded mode capabilities and runtime tool exposure explicitly', async () => {
        const caller = createCaller();

        const chatModes = await caller.mode.list({
            profileId,
            topLevelTab: 'chat',
        });
        expect(chatModes.modes.map((mode) => [mode.modeKey, mode.executionPolicy.toolCapabilities ?? []])).toEqual([
            ['chat', []],
        ]);

        const agentModes = await caller.mode.list({
            profileId,
            topLevelTab: 'agent',
        });
        expect(agentModes.modes.map((mode) => [mode.modeKey, mode.executionPolicy.toolCapabilities ?? []])).toEqual([
            ['ask', ['filesystem_read']],
            ['code', ['filesystem_read', 'filesystem_write', 'shell', 'mcp', 'code_runtime']],
            ['debug', ['filesystem_read', 'filesystem_write', 'shell', 'mcp', 'code_runtime']],
            ['plan', ['filesystem_read', 'mcp']],
        ]);

        const orchestratorModes = await caller.mode.list({
            profileId,
            topLevelTab: 'orchestrator',
        });
        expect(
            orchestratorModes.modes.map((mode) => [mode.modeKey, mode.executionPolicy.toolCapabilities ?? []])
        ).toEqual([
            ['debug', ['filesystem_read']],
            ['orchestrate', ['filesystem_read']],
            ['plan', ['filesystem_read', 'mcp']],
        ]);

        const askMode = agentModes.modes.find((mode) => mode.modeKey === 'ask');
        const codeMode = agentModes.modes.find((mode) => mode.modeKey === 'code');
        const planMode = agentModes.modes.find((mode) => mode.modeKey === 'plan');
        const orchestrateMode = orchestratorModes.modes.find((mode) => mode.modeKey === 'orchestrate');
        const orchestratorDebugMode = orchestratorModes.modes.find((mode) => mode.modeKey === 'debug');
        const orchestratorPlanMode = orchestratorModes.modes.find((mode) => mode.modeKey === 'plan');
        if (!askMode || !codeMode || !planMode || !orchestrateMode || !orchestratorDebugMode || !orchestratorPlanMode) {
            throw new Error('Expected seeded modes to exist for runtime tool exposure checks.');
        }

        expect((await resolveRuntimeToolsForMode({ mode: askMode })).map((tool) => tool.id)).toEqual([
            'list_files',
            'read_file',
            'search_files',
        ]);
        expect((await resolveRuntimeToolsForMode({ mode: planMode })).map((tool) => tool.id)).toEqual([
            'list_files',
            'read_file',
            'search_files',
        ]);
        expect((await resolveRuntimeToolsForMode({ mode: codeMode })).map((tool) => tool.id)).toEqual([
            'list_files',
            'read_file',
            'search_files',
            'write_file',
            'run_command',
        ]);
        expect((await resolveRuntimeToolsForMode({ mode: orchestrateMode })).map((tool) => tool.id)).toEqual([
            'list_files',
            'read_file',
            'search_files',
        ]);
        expect((await resolveRuntimeToolsForMode({ mode: orchestratorDebugMode })).map((tool) => tool.id)).toEqual([
            'list_files',
            'read_file',
            'search_files',
        ]);
        expect((await resolveRuntimeToolsForMode({ mode: orchestratorPlanMode })).map((tool) => tool.id)).toEqual([
            'list_files',
            'read_file',
            'search_files',
        ]);
    });

    it('handles permission request, grant, deny, and idempotency', async () => {
        const caller = createCaller();

        const requested = await caller.permission.request({
            profileId,
            policy: 'ask',
            resource: 'tool:run_command',
            toolId: 'run_command',
            scopeKind: 'tool',
            summary: {
                title: 'Run Command Request',
                detail: 'Need shell command access',
            },
            rationale: 'Need shell command access',
        });
        const requestId = requested.request.id;

        const pending = await caller.permission.listPending();
        expect(pending.requests.some((item) => item.id === requestId)).toBe(true);

        const granted = await caller.permission.resolve({
            profileId,
            requestId,
            resolution: 'allow_once',
        });
        expect(granted.updated).toBe(true);

        const grantedAgain = await caller.permission.resolve({
            profileId,
            requestId,
            resolution: 'allow_once',
        });
        expect(grantedAgain.updated).toBe(false);
        expect(grantedAgain.reason).toBe('already_resolved');

        const deniedAgain = await caller.permission.resolve({
            profileId,
            requestId,
            resolution: 'deny',
        });
        expect(deniedAgain.updated).toBe(false);
        expect(deniedAgain.reason).toBe('already_resolved');
    });

    it('executes read-only tools and enforces mode-sensitive tool policies', async () => {
        const caller = createCaller();
        const tempDir = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-tool-test-'));
        const tempFile = path.join(tempDir, 'readme.txt');
        const workspaceFingerprint = 'ws_tool_runtime_contracts';
        const now = new Date().toISOString();
        const { sqlite } = getPersistence();
        writeFileSync(tempFile, 'hello from tool execution test', 'utf8');
        sqlite
            .prepare(
                `
                    INSERT OR IGNORE INTO workspace_roots
                        (fingerprint, profile_id, absolute_path, path_key, label, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                workspaceFingerprint,
                profileId,
                tempDir,
                process.platform === 'win32' ? tempDir.toLowerCase() : tempDir,
                path.basename(tempDir),
                now,
                now
            );

        const tools = await caller.tool.list();
        expect(tools.tools.map((item) => item.id)).toContain('read_file');
        expect(tools.tools.map((item) => item.id)).not.toContain('execute_code');
        const readTool = tools.tools.find((item) => item.id === 'read_file');
        expect(readTool?.requiresWorkspace).toBe(true);
        expect(readTool?.capabilities).toContain('filesystem_read');
        expect(readTool?.mutability).toBe('read_only');
        expect(tools.tools.map((item) => item.id)).toContain('search_files');
        expect(tools.tools.map((item) => item.id)).toContain('write_file');
        const writeTool = tools.tools.find((item) => item.id === 'write_file');
        expect(writeTool?.requiresWorkspace).toBe(true);
        expect(writeTool?.capabilities).toContain('filesystem_write');
        expect(writeTool?.mutability).toBe('mutating');

        const allowedRead = await caller.tool.invoke({
            profileId,
            toolId: 'read_file',
            topLevelTab: 'agent',
            modeKey: 'ask',
            workspaceFingerprint,
            args: {
                path: tempFile,
            },
        });
        expect(allowedRead.ok).toBe(true);
        if (!allowedRead.ok) {
            throw new Error('Expected read_file invocation to be allowed in agent.ask mode.');
        }
        const allowedReadContent = allowedRead.output['content'];
        const allowedReadText =
            typeof allowedReadContent === 'string'
                ? allowedReadContent
                : allowedReadContent === undefined
                  ? ''
                  : JSON.stringify(allowedReadContent);
        expect(allowedReadText).toContain('hello from tool execution test');

        const allowedReadInPlan = await caller.tool.invoke({
            profileId,
            toolId: 'read_file',
            topLevelTab: 'agent',
            modeKey: 'plan',
            workspaceFingerprint,
            args: {
                path: tempFile,
            },
        });
        expect(allowedReadInPlan.ok).toBe(true);
        if (!allowedReadInPlan.ok) {
            throw new Error('Expected read_file invocation to be allowed in agent.plan mode.');
        }

        const deniedMutation = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'ask',
            args: {
                command: 'echo blocked',
            },
        });
        expect(deniedMutation.ok).toBe(false);
        if (deniedMutation.ok) {
            throw new Error('Expected run_command to be blocked in agent.ask mode.');
        }
        expect(deniedMutation.error).toBe('policy_denied');

        const deniedPlanRunCommand = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'plan',
            workspaceFingerprint,
            args: {
                command: 'echo blocked',
            },
        });
        expect(deniedPlanRunCommand.ok).toBe(false);
        if (deniedPlanRunCommand.ok) {
            throw new Error('Expected run_command to be blocked in agent.plan mode.');
        }
        expect(deniedPlanRunCommand.error).toBe('policy_denied');

        const deniedWriteInAsk = await caller.tool.invoke({
            profileId,
            toolId: 'write_file',
            topLevelTab: 'agent',
            modeKey: 'ask',
            workspaceFingerprint,
            args: {
                path: path.join(tempDir, 'blocked.txt'),
                content: 'blocked',
            },
        });
        expect(deniedWriteInAsk.ok).toBe(false);
        if (deniedWriteInAsk.ok) {
            throw new Error('Expected write_file to be blocked in agent.ask mode.');
        }
        expect(deniedWriteInAsk.error).toBe('policy_denied');

        const deniedWriteInPlan = await caller.tool.invoke({
            profileId,
            toolId: 'write_file',
            topLevelTab: 'agent',
            modeKey: 'plan',
            workspaceFingerprint,
            args: {
                path: path.join(tempDir, 'blocked-plan.txt'),
                content: 'blocked',
            },
        });
        expect(deniedWriteInPlan.ok).toBe(false);
        if (deniedWriteInPlan.ok) {
            throw new Error('Expected write_file to be blocked in agent.plan mode.');
        }
        expect(deniedWriteInPlan.error).toBe('policy_denied');

        const deniedDetachedWrite = await caller.tool.invoke({
            profileId,
            toolId: 'write_file',
            topLevelTab: 'chat',
            modeKey: 'chat',
            args: {
                path: path.join(tempDir, 'detached.txt'),
                content: 'detached',
            },
        });
        expect(deniedDetachedWrite.ok).toBe(false);
        if (deniedDetachedWrite.ok) {
            throw new Error('Expected detached write_file invocation to be blocked.');
        }
        expect(deniedDetachedWrite.error).toBe('policy_denied');

        await caller.profile.setExecutionPreset({
            profileId,
            preset: 'yolo',
        });

        const deniedOutsideWorkspaceWrite = await caller.tool.invoke({
            profileId,
            toolId: 'write_file',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint,
            args: {
                path: path.join(tempDir, '..', 'outside-write.txt'),
                content: 'outside',
            },
        });
        expect(deniedOutsideWorkspaceWrite.ok).toBe(false);
        if (deniedOutsideWorkspaceWrite.ok) {
            throw new Error('Expected outside-workspace write_file invocation to be denied.');
        }
        expect(deniedOutsideWorkspaceWrite.error).toBe('policy_denied');

        const deniedIgnoredWrite = await caller.tool.invoke({
            profileId,
            toolId: 'write_file',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint,
            args: {
                path: path.join(tempDir, 'node_modules', 'blocked.txt'),
                content: 'ignored',
            },
        });
        expect(deniedIgnoredWrite.ok).toBe(false);
        if (deniedIgnoredWrite.ok) {
            throw new Error('Expected ignored-path write_file invocation to be blocked.');
        }
        expect(deniedIgnoredWrite.error).toBe('policy_denied');

        await caller.profile.setExecutionPreset({
            profileId,
            preset: 'privacy',
        });

        const askDecision = await caller.tool.invoke({
            profileId,
            toolId: 'read_file',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint,
            args: {
                path: tempFile,
            },
        });
        expect(askDecision.ok).toBe(false);
        if (askDecision.ok) {
            throw new Error('Expected read_file to require permission in agent.code mode by default policy.');
        }
        expect(askDecision.error).toBe('permission_required');
        expect(askDecision.requestId).toBeDefined();
        const permissionRequestId: EntityId<'perm'> = (() => {
            const requestId = askDecision.requestId;
            if (!isEntityId(requestId ?? '', 'perm')) {
                throw new Error('Expected permission request id with "perm_" prefix.');
            }

            return requestId as EntityId<'perm'>;
        })();

        const profileOverride = await caller.permission.resolve({
            profileId,
            requestId: permissionRequestId,
            resolution: 'allow_profile',
        });
        expect(profileOverride.updated).toBe(true);

        const allowedByOverride = await caller.tool.invoke({
            profileId,
            toolId: 'read_file',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint,
            args: {
                path: tempFile,
            },
        });
        expect(allowedByOverride.ok).toBe(true);
        if (!allowedByOverride.ok) {
            throw new Error('Expected profile override to allow read_file.');
        }

        const effectivePolicy = await caller.permission.getEffectivePolicy({
            profileId,
            resource: 'tool:read_file',
            topLevelTab: 'agent',
            modeKey: 'code',
        });
        expect(effectivePolicy.policy).toBe('allow');
        expect(effectivePolicy.source).toBe('profile_override');

        const mcpServers = await caller.mcp.listServers();
        expect(mcpServers.servers).toEqual([]);

        const createdServer = await caller.mcp.createServer({
            label: 'Invalid MCP',
            command: 'missing-mcp-command',
            args: [],
            workingDirectoryMode: 'inherit_process',
            enabled: true,
        });
        expect(createdServer.server.transport).toBe('stdio');

        const connected = await caller.mcp.connect({
            profileId,
            serverId: createdServer.server.id,
        });
        expect(connected.connected).toBe(false);
        if (!connected.server) {
            throw new Error('Expected MCP connect result to return the updated server.');
        }
        expect(connected.server.connectionState).toBe('error');
        expect(connected.server.toolDiscoveryState).toBe('error');

        const serverDetail = await caller.mcp.getServer({ serverId: createdServer.server.id });
        expect(serverDetail.found).toBe(true);
        if (!serverDetail.found) {
            throw new Error('Expected MCP getServer result.');
        }
        expect(serverDetail.server.envKeys).toEqual([]);

        const disconnected = await caller.mcp.disconnect({ serverId: createdServer.server.id });
        expect(disconnected.disconnected).toBe(true);
    });
});
