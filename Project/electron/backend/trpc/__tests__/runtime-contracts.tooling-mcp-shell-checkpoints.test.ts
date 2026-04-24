import { describe, expect, it, vi } from 'vitest';

import { resolveRuntimeToolsForMode } from '@/app/backend/runtime/services/runExecution/tools';
import type { EntityId } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';
import {
    runtimeContractProfileId,
    registerRuntimeContractHooks,
    createCaller,
    createGitWorkspace,
    defaultRuntimeOptions,
    getPersistence,
    mkdtempSync,
    os,
    path,
    readFileSync,
    requireEntityId,
    rmSync,
    waitForRunStatus,
    writeFileSync,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: permissions and tooling', () => {
    const profileId = runtimeContractProfileId;
    it('connects a stdio MCP server, exposes tools only for mcp-capable modes, and routes detached permissions through mcp resources', async () => {
        const caller = createCaller();
        const fixturePath = path.join(
            process.cwd(),
            'electron',
            'backend',
            'trpc',
            '__tests__',
            'fixtures',
            'mcp-stdio-server.cjs'
        );

        const createdServer = await caller.mcp.createServer({
            label: 'Fixture MCP',
            command: process.execPath,
            args: [fixturePath],
            workingDirectoryMode: 'inherit_process',
            enabled: true,
        });
        await caller.mcp.setEnvSecrets({
            serverId: createdServer.server.id,
            values: [{ key: 'MCP_TEST_SECRET', value: 'top-secret' }],
        });

        const connected = await caller.mcp.connect({
            profileId,
            serverId: createdServer.server.id,
        });
        expect(connected.connected).toBe(true);
        if (!connected.server) {
            throw new Error('Expected connected MCP server record.');
        }
        expect(connected.server.tools.map((tool) => [tool.name, tool.mutability])).toEqual([
            ['echo_text', 'mutating'],
            ['read_secret', 'mutating'],
        ]);

        const agentModes = await caller.mode.list({
            profileId,
            topLevelTab: 'agent',
        });
        const codeMode = agentModes.modes.find((mode) => mode.modeKey === 'code');
        const askMode = agentModes.modes.find((mode) => mode.modeKey === 'ask');
        const planMode = agentModes.modes.find((mode) => mode.modeKey === 'plan');
        if (!codeMode || !askMode || !planMode) {
            throw new Error('Expected seeded agent modes.');
        }

        const codeTools = await resolveRuntimeToolsForMode({ mode: codeMode });
        const askTools = await resolveRuntimeToolsForMode({ mode: askMode });
        const planToolsBeforeClassification = await resolveRuntimeToolsForMode({ mode: planMode });
        const mcpTool = codeTools.find((tool) => tool.id.startsWith('mcp__'));
        expect(mcpTool).toBeDefined();
        expect(askTools.some((tool) => tool.id.startsWith('mcp__'))).toBe(false);
        expect(planToolsBeforeClassification.some((tool) => tool.id.startsWith('mcp__'))).toBe(false);
        if (!mcpTool) {
            throw new Error('Expected MCP runtime tool exposure for agent.code.');
        }

        const classifiedReadOnly = await caller.mcp.setToolMutability({
            serverId: createdServer.server.id,
            toolName: 'echo_text',
            mutability: 'read_only',
        });
        expect(classifiedReadOnly.updated).toBe(true);
        const planToolsAfterClassification = await resolveRuntimeToolsForMode({ mode: planMode });
        const planMcpTool = planToolsAfterClassification.find((tool) => tool.id.startsWith('mcp__'));
        expect(planMcpTool?.id).toContain('mcp__');
        expect(planToolsAfterClassification.filter((tool) => tool.id.startsWith('mcp__'))).toHaveLength(1);

        const firstAttempt = await caller.tool.invoke({
            profileId,
            toolId: mcpTool.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            args: {
                text: 'hello',
            },
        });
        expect(firstAttempt.ok).toBe(false);
        if (firstAttempt.ok) {
            throw new Error('Expected first MCP tool call to require approval.');
        }
        expect(firstAttempt.error).toBe('permission_required');
        expect(firstAttempt.requestId).toBeDefined();

        const pending = await caller.permission.listPending();
        const mcpPermission = pending.requests.find((request) => request.id === firstAttempt.requestId);
        expect(mcpPermission?.resource).toMatch(/^mcp:/);
        expect(mcpPermission?.workspaceFingerprint).toBeUndefined();

        const allowed = await caller.permission.resolve({
            profileId,
            requestId: firstAttempt.requestId as EntityId<'perm'>,
            resolution: 'allow_once',
        });
        expect(allowed.updated).toBe(true);

        const secondAttempt = await caller.tool.invoke({
            profileId,
            toolId: mcpTool.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            args: {
                text: 'hello',
            },
        });
        expect(secondAttempt.ok).toBe(true);
        if (!secondAttempt.ok) {
            throw new Error('Expected approved MCP tool call to succeed.');
        }
        expect(secondAttempt.output).toMatchObject({
            content: [{ type: 'text', text: 'echo:hello' }],
        });

        const secretTool = codeTools.find((tool) => tool.id !== mcpTool.id && tool.id.startsWith('mcp__'));
        if (!secretTool) {
            throw new Error('Expected second MCP tool exposure for read_secret.');
        }

        const secretApproval = await caller.tool.invoke({
            profileId,
            toolId: secretTool.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            args: {},
        });
        if (secretApproval.ok || !secretApproval.requestId) {
            throw new Error('Expected MCP secret tool to require approval.');
        }
        await caller.permission.resolve({
            profileId,
            requestId: secretApproval.requestId as EntityId<'perm'>,
            resolution: 'allow_once',
        });
        const secretResult = await caller.tool.invoke({
            profileId,
            toolId: secretTool.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            args: {},
        });
        expect(secretResult.ok).toBe(true);
        if (!secretResult.ok) {
            throw new Error('Expected MCP secret tool call to succeed.');
        }
        expect(secretResult.output).toMatchObject({
            content: [{ type: 'text', text: 'top-secret' }],
        });

        const planReadOnlyTool = await caller.tool.invoke({
            profileId,
            toolId: planMcpTool?.id ?? '',
            topLevelTab: 'agent',
            modeKey: 'plan',
            args: {
                text: 'from-plan',
            },
        });
        expect(planReadOnlyTool.ok).toBe(true);
        if (!planReadOnlyTool.ok) {
            throw new Error('Expected read-only MCP tool to be allowed in agent.plan mode.');
        }
        expect(planReadOnlyTool.output).toMatchObject({
            content: [{ type: 'text', text: 'echo:from-plan' }],
        });

        await caller.mcp.disconnect({ serverId: createdServer.server.id });
        expect((await resolveRuntimeToolsForMode({ mode: codeMode })).some((tool) => tool.id.startsWith('mcp__'))).toBe(
            false
        );
    });

    it('fails closed for workspace_root MCP servers when no workspace fingerprint is supplied', async () => {
        const caller = createCaller();
        const fixturePath = path.join(
            process.cwd(),
            'electron',
            'backend',
            'trpc',
            '__tests__',
            'fixtures',
            'mcp-stdio-server.cjs'
        );

        const createdServer = await caller.mcp.createServer({
            label: 'Workspace Root MCP',
            command: process.execPath,
            args: [fixturePath],
            workingDirectoryMode: 'workspace_root',
            enabled: true,
        });
        await caller.mcp.setEnvSecrets({
            serverId: createdServer.server.id,
            values: [{ key: 'MCP_TEST_SECRET', value: 'still-there' }],
        });

        const connected = await caller.mcp.connect({
            profileId,
            serverId: createdServer.server.id,
        });
        expect(connected.connected).toBe(false);
        if (!connected.server) {
            throw new Error('Expected MCP connect failure to return the updated server.');
        }
        expect(connected.server.connectionState).toBe('error');
        expect(connected.server.lastError).toContain('requires a selected workspace root');
        expect(connected.server.envKeys).toEqual(['MCP_TEST_SECRET']);
    });

    it('executes run_command with exact-command approvals and bounded shell output', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();
        const generalWorkspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-shell-general-'));
        const specificWorkspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-shell-specific-'));
        const insertWorkspaceRoot = (targetProfileId: string, fingerprint: string, absolutePath: string) => {
            sqlite
                .prepare(
                    `
                        INSERT OR IGNORE INTO workspace_roots
                            (fingerprint, profile_id, absolute_path, path_key, label, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `
                )
                .run(
                    fingerprint,
                    targetProfileId,
                    absolutePath,
                    process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath,
                    path.basename(absolutePath),
                    now,
                    now
                );
        };
        const approveExactShellCommand = async (input: {
            targetProfileId: string;
            workspaceFingerprint: string;
            modeKey: 'code' | 'debug';
            command: string;
            resolution: 'allow_workspace' | 'allow_profile';
        }) => {
            const ask = await caller.tool.invoke({
                profileId: input.targetProfileId,
                toolId: 'run_command',
                topLevelTab: 'agent',
                modeKey: input.modeKey,
                workspaceFingerprint: input.workspaceFingerprint,
                args: {
                    command: input.command,
                },
            });
            expect(ask.ok).toBe(false);
            if (ask.ok) {
                throw new Error(`Expected "${input.command}" to require exact shell approval.`);
            }
            expect(ask.error).toBe('permission_required');
            const requestId = requireEntityId(ask.requestId, 'perm', 'Expected shell permission request id.');
            const request = (await caller.permission.listPending()).requests.find((item) => item.id === requestId);
            const exactResource = request?.approvalCandidates?.find(
                (candidate) => candidate.label === input.command
            )?.resource;
            if (!exactResource) {
                throw new Error(`Expected exact approval candidate for "${input.command}".`);
            }

            const resolved = await caller.permission.resolve({
                profileId: input.targetProfileId,
                requestId,
                resolution: input.resolution,
                selectedApprovalResource: exactResource,
            });
            expect(resolved.updated).toBe(true);
        };

        insertWorkspaceRoot(profileId, 'ws_run_command_general', generalWorkspacePath);
        insertWorkspaceRoot(profileId, 'ws_run_command_specific', specificWorkspacePath);

        const tools = await caller.tool.list();
        const runCommand = tools.tools.find((tool) => tool.id === 'run_command');
        expect(runCommand?.availability).toBe('available');
        expect(runCommand?.capabilities).toContain('shell');

        const detachedDenied = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            args: {
                command: 'node --version',
            },
        });
        expect(detachedDenied.ok).toBe(false);
        if (detachedDenied.ok) {
            throw new Error('Expected detached run_command invocation to be blocked.');
        }
        expect(detachedDenied.error).toBe('policy_denied');
        expect(detachedDenied.message).toContain('workspace-bound');

        const chatDenied = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'chat',
            modeKey: 'chat',
            workspaceFingerprint: 'ws_run_command_general',
            args: {
                command: 'node --version',
            },
        });
        expect(chatDenied.ok).toBe(false);
        if (chatDenied.ok) {
            throw new Error('Expected chat run_command invocation to be blocked.');
        }
        expect(chatDenied.error).toBe('policy_denied');

        const orchestratorDenied = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'orchestrator',
            modeKey: 'debug',
            workspaceFingerprint: 'ws_run_command_general',
            args: {
                command: 'node --version',
            },
        });
        expect(orchestratorDenied.ok).toBe(false);
        if (orchestratorDenied.ok) {
            throw new Error('Expected orchestrator run_command invocation to be blocked.');
        }
        expect(orchestratorDenied.error).toBe('policy_denied');

        const firstAsk = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_run_command_general',
            args: {
                command: 'node --version',
            },
        });
        expect(firstAsk.ok).toBe(false);
        if (firstAsk.ok) {
            throw new Error('Expected standard preset to ask before unseen shell execution.');
        }
        expect(firstAsk.error).toBe('permission_required');
        const firstPermissionRequestId = requireEntityId(
            firstAsk.requestId,
            'perm',
            'Expected permission request id for first shell request.'
        );

        const firstPendingRequest = (await caller.permission.listPending()).requests.find(
            (request) => request.id === firstPermissionRequestId
        );
        expect(firstPendingRequest?.commandText).toBe('node --version');
        expect(firstPendingRequest?.approvalCandidates?.map((candidate) => candidate.label)).toEqual([
            'node --version',
        ]);
        expect(firstPendingRequest?.approvalCandidates?.[0]?.detail).toBe('Allow only this exact normalized command.');

        const allowOnce = await caller.permission.resolve({
            profileId,
            requestId: firstPermissionRequestId,
            resolution: 'allow_once',
        });
        expect(allowOnce.updated).toBe(true);

        const onceAllowed = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_run_command_general',
            args: {
                command: 'node --version',
            },
        });
        expect(onceAllowed.ok).toBe(true);
        if (!onceAllowed.ok) {
            throw new Error('Expected allow_once shell approval to allow one invocation.');
        }
        expect(String(onceAllowed.output['stdout'])).toContain('v');

        const askedAgain = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_run_command_general',
            args: {
                command: 'node --version',
            },
        });
        expect(askedAgain.ok).toBe(false);
        if (askedAgain.ok) {
            throw new Error('Expected allow_once to expire after one shell invocation.');
        }
        expect(askedAgain.error).toBe('permission_required');
        const repeatedPermissionRequestId = requireEntityId(
            askedAgain.requestId,
            'perm',
            'Expected permission request id for repeated shell request.'
        );

        const askedAgainRequest = (await caller.permission.listPending()).requests.find(
            (request) => request.id === repeatedPermissionRequestId
        );
        const exactNodeVersionResource = askedAgainRequest?.approvalCandidates?.find(
            (candidate) => candidate.label === 'node --version'
        )?.resource;
        if (!exactNodeVersionResource) {
            throw new Error('Expected exact node --version approval candidate.');
        }

        const allowWorkspaceNodeVersion = await caller.permission.resolve({
            profileId,
            requestId: repeatedPermissionRequestId,
            resolution: 'allow_workspace',
            selectedApprovalResource: exactNodeVersionResource,
        });
        expect(allowWorkspaceNodeVersion.updated).toBe(true);

        const generalExactAllowed = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_run_command_general',
            args: {
                command: 'node --version',
            },
        });
        expect(generalExactAllowed.ok).toBe(true);
        if (!generalExactAllowed.ok) {
            throw new Error('Expected exact workspace approval to allow the same command.');
        }
        expect(String(generalExactAllowed.output['stdout'])).toContain('v');

        const broadenedCommandBlocked = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_run_command_general',
            args: {
                command: 'node --version && node -p "40+2"',
            },
        });
        expect(broadenedCommandBlocked.ok).toBe(false);
        if (broadenedCommandBlocked.ok) {
            throw new Error('Expected exact approval for node --version to reject chained variants.');
        }
        expect(broadenedCommandBlocked.error).toBe('permission_required');

        const arithmeticCommand = 'node -p "40+2"';
        await approveExactShellCommand({
            targetProfileId: profileId,
            workspaceFingerprint: 'ws_run_command_general',
            modeKey: 'code',
            command: arithmeticCommand,
            resolution: 'allow_workspace',
        });
        const arithmeticAllowed = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_run_command_general',
            args: {
                command: arithmeticCommand,
            },
        });
        expect(arithmeticAllowed.ok).toBe(true);
        if (!arithmeticAllowed.ok) {
            throw new Error('Expected exact workspace approval to allow arithmetic command.');
        }
        expect(String(arithmeticAllowed.output['stdout']).trim()).toBe('42');

        const largeOutputCommand = 'node -e "process.stdout.write(\'x\'.repeat(50000))"';
        await approveExactShellCommand({
            targetProfileId: profileId,
            workspaceFingerprint: 'ws_run_command_general',
            modeKey: 'code',
            command: largeOutputCommand,
            resolution: 'allow_workspace',
        });
        const largeOutput = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_run_command_general',
            args: {
                command: largeOutputCommand,
            },
        });
        expect(largeOutput.ok).toBe(true);
        if (!largeOutput.ok) {
            throw new Error('Expected large-output shell command to execute.');
        }
        expect(largeOutput.output['stdoutTruncated']).toBe(true);
        expect(String(largeOutput.output['stdout']).length).toBeLessThan(50_000);

        const timeoutCommand = 'node -e "setTimeout(() => {}, 2000)"';
        await approveExactShellCommand({
            targetProfileId: profileId,
            workspaceFingerprint: 'ws_run_command_general',
            modeKey: 'code',
            command: timeoutCommand,
            resolution: 'allow_workspace',
        });
        const timeoutOutput = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_run_command_general',
            args: {
                command: timeoutCommand,
                timeoutMs: 50,
            },
        });
        expect(timeoutOutput.ok).toBe(true);
        if (!timeoutOutput.ok) {
            throw new Error('Expected timed shell command to return bounded output.');
        }
        expect(timeoutOutput.output['timedOut']).toBe(true);

        const specificAsk = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'debug',
            workspaceFingerprint: 'ws_run_command_specific',
            args: {
                command: 'node --version',
            },
        });
        expect(specificAsk.ok).toBe(false);
        if (specificAsk.ok) {
            throw new Error('Expected specific workspace exact command to ask first.');
        }
        expect(specificAsk.error).toBe('permission_required');
        const specificPermissionRequestId = requireEntityId(
            specificAsk.requestId,
            'perm',
            'Expected permission request id for exact command request.'
        );

        const specificRequest = (await caller.permission.listPending()).requests.find(
            (request) => request.id === specificPermissionRequestId
        );
        const specificResource = specificRequest?.approvalCandidates?.find(
            (candidate) => candidate.label === 'node --version'
        )?.resource;
        if (!specificResource) {
            throw new Error('Expected specific node --version approval candidate.');
        }

        const allowSpecific = await caller.permission.resolve({
            profileId,
            requestId: specificPermissionRequestId,
            resolution: 'allow_workspace',
            selectedApprovalResource: specificResource,
        });
        expect(allowSpecific.updated).toBe(true);

        const specificAllowed = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'debug',
            workspaceFingerprint: 'ws_run_command_specific',
            args: {
                command: 'node --version',
            },
        });
        expect(specificAllowed.ok).toBe(true);

        const specificStillBlocked = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'debug',
            workspaceFingerprint: 'ws_run_command_specific',
            args: {
                command: 'node -p "1+1"',
            },
        });
        expect(specificStillBlocked.ok).toBe(false);
        if (specificStillBlocked.ok) {
            throw new Error('Expected exact approval to stay narrower than a different command.');
        }
        expect(specificStillBlocked.error).toBe('permission_required');

        const privacyProfile = await caller.profile.create({ name: 'Privacy Shell Profile' });
        const yoloProfile = await caller.profile.create({ name: 'Yolo Shell Profile' });
        const privacyWorkspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-shell-privacy-'));
        const yoloWorkspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-shell-yolo-'));
        insertWorkspaceRoot(privacyProfile.profile.id, 'ws_run_command_privacy', privacyWorkspacePath);
        insertWorkspaceRoot(yoloProfile.profile.id, 'ws_run_command_yolo', yoloWorkspacePath);

        await caller.profile.setExecutionPreset({
            profileId: privacyProfile.profile.id,
            preset: 'privacy',
        });

        const privacyAsk = await caller.tool.invoke({
            profileId: privacyProfile.profile.id,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_run_command_privacy',
            args: {
                command: 'node -p "5+5"',
            },
        });
        expect(privacyAsk.ok).toBe(false);
        if (privacyAsk.ok) {
            throw new Error('Expected privacy preset to ask before shell execution.');
        }
        expect(privacyAsk.error).toBe('permission_required');
        const privacyPermissionRequestId = requireEntityId(
            privacyAsk.requestId,
            'perm',
            'Expected privacy request id.'
        );

        const privacyRequest = (await caller.permission.listPending()).requests.find(
            (request) => request.id === privacyPermissionRequestId
        );
        const privacyExactResource = privacyRequest?.approvalCandidates?.find(
            (candidate) => candidate.label === 'node -p "5+5"'
        )?.resource;
        if (!privacyExactResource) {
            throw new Error('Expected exact command approval candidate for privacy profile.');
        }

        const privacyResolve = await caller.permission.resolve({
            profileId: privacyProfile.profile.id,
            requestId: privacyPermissionRequestId,
            resolution: 'allow_profile',
            selectedApprovalResource: privacyExactResource,
        });
        expect(privacyResolve.updated).toBe(true);

        const privacyAllowed = await caller.tool.invoke({
            profileId: privacyProfile.profile.id,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'debug',
            workspaceFingerprint: 'ws_run_command_privacy',
            args: {
                command: 'node -p "5+5"',
            },
        });
        expect(privacyAllowed.ok).toBe(true);
        if (!privacyAllowed.ok) {
            throw new Error('Expected matching exact profile shell override to bypass privacy ask.');
        }
        expect(String(privacyAllowed.output['stdout']).trim()).toBe('10');

        const privacyDifferentCommand = await caller.tool.invoke({
            profileId: privacyProfile.profile.id,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'debug',
            workspaceFingerprint: 'ws_run_command_privacy',
            args: {
                command: 'node -p "6+6"',
            },
        });
        expect(privacyDifferentCommand.ok).toBe(false);
        if (privacyDifferentCommand.ok) {
            throw new Error('Expected exact profile approval to reject a different command.');
        }
        expect(privacyDifferentCommand.error).toBe('permission_required');

        await caller.profile.setExecutionPreset({
            profileId: yoloProfile.profile.id,
            preset: 'yolo',
        });

        const yoloAsk = await caller.tool.invoke({
            profileId: yoloProfile.profile.id,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_run_command_yolo',
            args: {
                command: 'node --version',
            },
        });
        expect(yoloAsk.ok).toBe(false);
        if (yoloAsk.ok) {
            throw new Error('Expected yolo preset to still ask for unseen exact shell commands.');
        }
        expect(yoloAsk.error).toBe('permission_required');
    }, 30_000);

    it('captures git diff artifacts and rolls checkpoints back for mutating agent runs', async () => {
        const caller = createCaller();
        const workspacePath = createGitWorkspace('neonconductor-diff-checkpoint-');
        let resolveFetch: (() => void) | undefined;

        vi.stubGlobal(
            'fetch',
            vi.fn(
                () =>
                    new Promise((resolve) => {
                        resolveFetch = () => {
                            resolve({
                                ok: true,
                                status: 200,
                                statusText: 'OK',
                                json: () => ({
                                    choices: [
                                        {
                                            message: {
                                                content: 'mutation complete',
                                            },
                                        },
                                    ],
                                    usage: {
                                        prompt_tokens: 10,
                                        completion_tokens: 20,
                                        total_tokens: 30,
                                    },
                                }),
                            });
                        };
                    })
            )
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-diff-test-key',
        });
        expect(configured.success).toBe(true);

        const thread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'agent',
            scope: 'workspace',
            workspacePath,
            title: 'Diff Checkpoint Thread',
            executionEnvironmentMode: 'local',
        });
        const threadId = requireEntityId(thread.thread.id, 'thr', 'Expected workspace agent thread id.');
        const listedThreads = await caller.conversation.listThreads({
            profileId,
            activeTab: 'agent',
            showAllModes: true,
            groupView: 'workspace',
            scope: 'workspace',
            sort: 'latest',
        });
        const workspaceThread = listedThreads.threads.find((item) => item.id === threadId);
        if (!workspaceThread?.workspaceFingerprint) {
            throw new Error('Expected workspace fingerprint for git-backed thread.');
        }

        const created = await caller.session.create({
            profileId,
            threadId,
            kind: 'local',
        });
        expect(created.created).toBe(true);
        if (!created.created) {
            throw new Error(`Expected session creation success, received "${created.reason}".`);
        }

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Change README',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: workspaceThread.workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected mutating agent run to start.');
        }

        await vi.waitFor(() => {
            expect(resolveFetch).toBeTypeOf('function');
        });
        writeFileSync(path.join(workspacePath, 'README.md'), 'changed by checkpoint\n');
        resolveFetch?.();
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const diffs = await caller.diff.listByRun({
            profileId,
            runId: started.runId,
        });
        expect(diffs.diffs).toHaveLength(1);
        const diff = diffs.diffs[0];
        if (!diff) {
            throw new Error('Expected diff artifact for mutating run.');
        }
        expect(diffs.overview?.kind).toBe('git');
        if (diffs.overview?.kind !== 'git') {
            throw new Error('Expected git diff overview for mutating run.');
        }
        expect(diff.artifact.kind).toBe('git');
        if (diff.artifact.kind !== 'git') {
            throw new Error('Expected git diff artifact.');
        }
        expect(diff.artifact.totalAddedLines).toBeGreaterThanOrEqual(1);
        const readmePath = diff.artifact.files.find((file) => file.path.endsWith('README.md'))?.path;
        expect(Boolean(readmePath)).toBe(true);
        if (!readmePath) {
            throw new Error('Expected README diff entry.');
        }
        const readmeFile = diff.artifact.files.find((file) => file.path === readmePath);
        expect(readmeFile?.addedLines).toBeGreaterThanOrEqual(1);
        expect(diffs.overview.highlightedFiles.some((file) => file.path === readmePath)).toBe(true);

        const patch = await caller.diff.getFilePatch({
            profileId,
            diffId: diff.id,
            path: readmePath,
        });
        expect(patch.found).toBe(true);
        if (!patch.found) {
            throw new Error('Expected README patch preview.');
        }
        expect(patch.patch).toContain('+changed by checkpoint');

        const checkpoints = await caller.checkpoint.list({
            profileId,
            sessionId: created.session.id,
        });
        expect(checkpoints.checkpoints).toHaveLength(1);
        expect(checkpoints.storage.looseReferencedBlobCount).toBeGreaterThan(0);
        const checkpoint = checkpoints.checkpoints[0];
        if (!checkpoint) {
            throw new Error('Expected auto-created checkpoint for mutating run.');
        }
        expect(checkpoint.checkpointKind).toBe('auto');
        expect(checkpoint.executionTargetKind).toBe('workspace');

        const compacted = await caller.checkpoint.forceCompact({
            profileId,
            sessionId: created.session.id,
            confirm: true,
        });
        expect(compacted.compacted).toBe(true);
        expect(compacted.storage.packedReferencedBlobCount).toBeGreaterThan(0);
        expect(readFileSync(path.join(workspacePath, 'README.md'), 'utf8').replace(/\r\n/g, '\n')).toBe(
            'changed by checkpoint\n'
        );

        const preview = await caller.checkpoint.previewRollback({
            profileId,
            checkpointId: checkpoint.id,
        });
        expect(preview.found).toBe(true);
        if (!preview.found) {
            throw new Error('Expected rollback preview for checkpoint.');
        }
        expect(preview.preview.isSharedTarget).toBe(false);
        expect(preview.preview.hasLaterForeignChanges).toBe(false);
        expect(preview.preview.affectedSessions).toHaveLength(1);

        writeFileSync(path.join(workspacePath, 'README.md'), 'drifted\n');
        const rollback = await caller.checkpoint.rollback({
            profileId,
            checkpointId: checkpoint.id,
            confirm: true,
        });
        expect(rollback.rolledBack).toBe(true);
        expect(rollback.safetyCheckpoint?.id).toBeDefined();
        expect(readFileSync(path.join(workspacePath, 'README.md'), 'utf8').replace(/\r\n/g, '\n')).toBe('base\n');
        const checkpointsAfterRollback = await caller.checkpoint.list({
            profileId,
            sessionId: created.session.id,
        });
        expect(checkpointsAfterRollback.checkpoints).toHaveLength(2);
        expect(checkpointsAfterRollback.checkpoints.some((candidate) => candidate.checkpointKind === 'safety')).toBe(
            true
        );

        rmSync(workspacePath, { recursive: true, force: true });
    }, 15_000);
});
