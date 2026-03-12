import { describe, expect, it, vi } from 'vitest';

import type { EntityId } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';
import {
    runtimeContractProfileId,
    registerRuntimeContractHooks,
    createCaller,
    createGitWorkspace,
    defaultRuntimeOptions,
    getPersistence,
    isEntityId,
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
        const readTool = tools.tools.find((item) => item.id === 'read_file');
        expect(readTool?.requiresWorkspace).toBe(true);
        expect(readTool?.capabilities).toContain('filesystem_read');

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
        expect(mcpServers.servers.map((item) => item.id)).toContain('github');

        const connected = await caller.mcp.connect({ serverId: 'github' });
        expect(connected.connected).toBe(false);
        expect(connected.reason).toBe('not_implemented');

        const authStatus = await caller.mcp.authStatus({ serverId: 'github' });
        expect(authStatus.found).toBe(true);
        if (!authStatus.found) {
            throw new Error('Expected MCP auth status result.');
        }
        expect(authStatus.connectionState).toBe('disconnected');

        const disconnected = await caller.mcp.disconnect({ serverId: 'github' });
        expect(disconnected.disconnected).toBe(false);
        expect(disconnected.reason).toBe('not_implemented');
    });


    it('executes run_command with prefix-scoped approvals and bounded shell output', async () => {
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
            'node',
        ]);

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
        const generalNodeResource = askedAgainRequest?.approvalCandidates?.find(
            (candidate) => candidate.label === 'node'
        )?.resource;
        if (!generalNodeResource) {
            throw new Error('Expected general node approval candidate.');
        }

        const allowWorkspaceNode = await caller.permission.resolve({
            profileId,
            requestId: repeatedPermissionRequestId,
            resolution: 'allow_workspace',
            selectedApprovalResource: generalNodeResource,
        });
        expect(allowWorkspaceNode.updated).toBe(true);

        const generalPrefixAllowed = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_run_command_general',
            args: {
                command: 'node -p "40+2"',
            },
        });
        expect(generalPrefixAllowed.ok).toBe(true);
        if (!generalPrefixAllowed.ok) {
            throw new Error('Expected executable-prefix approval to allow another node command.');
        }
        expect(String(generalPrefixAllowed.output['stdout']).trim()).toBe('42');

        const largeOutput = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_run_command_general',
            args: {
                command: 'node -e "process.stdout.write(\'x\'.repeat(50000))"',
            },
        });
        expect(largeOutput.ok).toBe(true);
        if (!largeOutput.ok) {
            throw new Error('Expected large-output shell command to execute.');
        }
        expect(largeOutput.output['stdoutTruncated']).toBe(true);
        expect(String(largeOutput.output['stdout']).length).toBeLessThan(50_000);

        const timeoutOutput = await caller.tool.invoke({
            profileId,
            toolId: 'run_command',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_run_command_general',
            args: {
                command: 'node -e "setTimeout(() => {}, 2000)"',
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
            throw new Error('Expected specific-prefix workspace to ask first.');
        }
        expect(specificAsk.error).toBe('permission_required');
        const specificPermissionRequestId = requireEntityId(
            specificAsk.requestId,
            'perm',
            'Expected permission request id for specific-prefix request.'
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
            throw new Error('Expected verb-prefix approval to stay narrower than executable approval.');
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
                command: 'node --version',
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
        const privacyNodeResource = privacyRequest?.approvalCandidates?.find(
            (candidate) => candidate.label === 'node'
        )?.resource;
        if (!privacyNodeResource) {
            throw new Error('Expected general node approval candidate for privacy profile.');
        }

        const privacyResolve = await caller.permission.resolve({
            profileId: privacyProfile.profile.id,
            requestId: privacyPermissionRequestId,
            resolution: 'allow_profile',
            selectedApprovalResource: privacyNodeResource,
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
            throw new Error('Expected matching profile shell override to bypass privacy ask.');
        }
        expect(String(privacyAllowed.output['stdout']).trim()).toBe('10');

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
            throw new Error('Expected yolo preset to still ask for unseen shell prefixes.');
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
        const checkpoint = checkpoints.checkpoints[0];
        if (!checkpoint) {
            throw new Error('Expected auto-created checkpoint for mutating run.');
        }

        writeFileSync(path.join(workspacePath, 'README.md'), 'drifted\n');
        const rollback = await caller.checkpoint.rollback({
            profileId,
            checkpointId: checkpoint.id,
            confirm: true,
        });
        expect(rollback.rolledBack).toBe(true);
        expect(readFileSync(path.join(workspacePath, 'README.md'), 'utf8').replace(/\r\n/g, '\n')).toBe(
            'changed by checkpoint\n'
        );

        rmSync(workspacePath, { recursive: true, force: true });
    }, 15_000);

    it('executes native provider tool calls through the run loop and persists tool results', async () => {
        const caller = createCaller();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-native-tool-loop-'));
        writeFileSync(path.join(workspacePath, 'README.md'), 'native tool loop\n', 'utf8');

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: () => ({
                    output: [
                        {
                            type: 'function_call',
                            call_id: 'call_readme',
                            name: 'read_file',
                            arguments: '{"path":"README.md"}',
                        },
                    ],
                    usage: {
                        input_tokens: 20,
                        output_tokens: 5,
                        total_tokens: 25,
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: () => ({
                    output: [
                        {
                            type: 'message',
                            content: [
                                {
                                    type: 'output_text',
                                    text: 'File inspected successfully.',
                                },
                            ],
                        },
                    ],
                    usage: {
                        input_tokens: 30,
                        output_tokens: 8,
                        total_tokens: 38,
                    },
                }),
            });
        vi.stubGlobal('fetch', fetchMock);

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-native-tool-key',
        });
        expect(configured.success).toBe(true);

        await caller.profile.setExecutionPreset({
            profileId,
            preset: 'yolo',
        });

        const thread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'agent',
            scope: 'workspace',
            workspacePath,
            title: 'Native Tool Loop Thread',
        });
        const listedThreads = await caller.conversation.listThreads({
            profileId,
            activeTab: 'agent',
            showAllModes: true,
            groupView: 'workspace',
            scope: 'workspace',
            sort: 'latest',
        });
        const workspaceThread = listedThreads.threads.find((item) => item.id === thread.thread.id);
        if (!workspaceThread?.workspaceFingerprint) {
            throw new Error('Expected workspace fingerprint for native tool loop test.');
        }

        const created = await caller.session.create({
            profileId,
            threadId: requireEntityId(thread.thread.id, 'thr', 'Expected workspace thread id.'),
            kind: 'local',
        });
        expect(created.created).toBe(true);
        if (!created.created) {
            throw new Error(`Expected session creation success, received "${created.reason}".`);
        }

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Read the README',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: workspaceThread.workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected native tool loop run to start.');
        }

        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const messages = await caller.session.listMessages({
            profileId,
            sessionId: created.session.id,
            runId: started.runId,
        });
        expect(messages.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
        expect(
            messages.messageParts.some(
                (part) =>
                    part.partType === 'tool_call' &&
                    part.payload['toolName'] === 'read_file' &&
                    part.payload['callId'] === 'call_readme'
            )
        ).toBe(true);
        expect(
            messages.messageParts.some(
                (part) =>
                    part.partType === 'tool_result' &&
                    typeof part.payload['outputText'] === 'string' &&
                    String(part.payload['outputText']).includes('native tool loop')
            )
        ).toBe(true);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const secondCallInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
        expect(secondCallInit).toBeDefined();
        const secondCallBody =
            secondCallInit && typeof secondCallInit.body === 'string'
                ? JSON.parse(secondCallInit.body)
                : undefined;
        expect(JSON.stringify(secondCallBody)).toContain('function_call_output');
        expect(JSON.stringify(secondCallBody)).toContain('call_readme');

        rmSync(workspacePath, { recursive: true, force: true });
    }, 15_000);


    it('records unsupported diff artifacts for non-git mutation runs and skips checkpoints', async () => {
        const caller = createCaller();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-diff-unsupported-'));
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
            apiKey: 'openai-diff-unsupported-key',
        });
        expect(configured.success).toBe(true);

        const thread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'agent',
            scope: 'workspace',
            workspacePath,
            title: 'Unsupported Diff Thread',
        });
        const threadId = requireEntityId(thread.thread.id, 'thr', 'Expected unsupported workspace thread id.');
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
            throw new Error('Expected workspace fingerprint for non-git thread.');
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
            prompt: 'Change notes',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: workspaceThread.workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected non-git mutating run to start.');
        }

        writeFileSync(path.join(workspacePath, 'notes.txt'), 'new content\n');
        resolveFetch?.();
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const diffs = await caller.diff.listByRun({
            profileId,
            runId: started.runId,
        });
        expect(diffs.diffs).toHaveLength(1);
        const diff = diffs.diffs[0];
        if (!diff) {
            throw new Error('Expected diff artifact even when git capture is unsupported.');
        }
        expect(diffs.overview?.kind).toBe('unsupported');
        expect(diff.artifact.kind).toBe('unsupported');
        if (diff.artifact.kind !== 'unsupported') {
            throw new Error('Expected unsupported diff artifact.');
        }
        expect(diff.artifact.reason).toBe('workspace_not_git');

        const checkpoints = await caller.checkpoint.list({
            profileId,
            sessionId: created.session.id,
        });
        expect(checkpoints.checkpoints).toEqual([]);

        rmSync(workspacePath, { recursive: true, force: true });
    });

});
