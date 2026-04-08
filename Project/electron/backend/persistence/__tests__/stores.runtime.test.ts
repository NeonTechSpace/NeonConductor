import { describe, expect, it } from 'vitest';

import {
    registerPersistenceStoreHooks,
    accountSnapshotStore,
    appPromptLayerSettingsStore,
    builtInModePromptOverrideStore,
    conversationStore,
    getPersistence,
    getDefaultProfileId,
    marketplaceStore,
    messageStore,
    memoryStore,
    memoryEvidenceStore,
    memoryRevisionStore,
    mcpStore,
    modeStore,
    permissionStore,
    providerSecretStore,
    runStore,
    sessionStore,
    skillfileStore,
    threadStore,
    toolStore,
} from '@/app/backend/persistence/__tests__/stores.shared';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';

registerPersistenceStoreHooks();

describe('persistence stores: runtime domain', () => {
    it('supports app prompt-layer singleton settings', async () => {
        const initial = await appPromptLayerSettingsStore.get();
        expect(initial.globalInstructions).toBe('');

        const updated = await appPromptLayerSettingsStore.setGlobalInstructions('Global instructions');
        expect(updated.globalInstructions).toBe('Global instructions');

        const persisted = await appPromptLayerSettingsStore.get();
        expect(persisted.globalInstructions).toBe('Global instructions');
    });

    it('supports built-in mode prompt override persistence', async () => {
        const profileId = getDefaultProfileId();

        const initial = await builtInModePromptOverrideStore.listByProfile(profileId);
        expect(initial).toEqual([]);

        const saved = await builtInModePromptOverrideStore.setPrompt({
            profileId,
            topLevelTab: 'agent',
            modeKey: 'code',
            prompt: {
                roleDefinition: 'Override role',
                customInstructions: 'Override instructions',
            },
        });
        expect(saved.prompt).toEqual({
            roleDefinition: 'Override role',
            customInstructions: 'Override instructions',
        });

        const persisted = await builtInModePromptOverrideStore.getByProfileTabMode(profileId, 'agent', 'code');
        expect(persisted?.prompt).toEqual({
            roleDefinition: 'Override role',
            customInstructions: 'Override instructions',
        });

        await builtInModePromptOverrideStore.delete(profileId, 'agent', 'code');
        const removed = await builtInModePromptOverrideStore.getByProfileTabMode(profileId, 'agent', 'code');
        expect(removed).toBeNull();
    });

    it('supports permission store decision transitions', async () => {
        const profileId = getDefaultProfileId();
        const created = await permissionStore.create({
            profileId,
            policy: 'ask',
            resource: 'tool:run_command',
            toolId: 'run_command',
            scopeKind: 'tool',
            summary: {
                title: 'Run Command Request',
                detail: 'Need shell command access.',
            },
            commandText: 'node --version',
            approvalCandidates: [
                {
                    label: 'node --version',
                    resource: 'tool:run_command:prefix:node --version',
                },
                {
                    label: 'node',
                    resource: 'tool:run_command:prefix:node',
                },
            ],
        });
        expect(created.decision).toBe('pending');
        expect(created.commandText).toBe('node --version');
        expect(created.approvalCandidates?.map((candidate) => candidate.label)).toEqual(['node --version', 'node']);

        const granted = await permissionStore.resolve(created.id, 'allow_once');
        expect(granted?.decision).toBe('granted');
        expect(granted?.resolvedScope).toBe('once');

        const denied = await permissionStore.resolve(created.id, 'deny');
        expect(denied?.decision).toBe('denied');
    });

    it('supports memory record persistence, filters, and lifecycle transitions', async () => {
        const profileId = getDefaultProfileId();
        const workspaceFingerprint = 'wsf_memory_store_runtime';
        const workspaceConversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory Workspace',
        });
        expect(workspaceConversation.isOk()).toBe(true);
        if (workspaceConversation.isErr()) {
            throw new Error(workspaceConversation.error.message);
        }

        const thread = await threadStore.create({
            profileId,
            conversationId: workspaceConversation.value.id,
            title: 'Memory Thread',
            topLevelTab: 'agent',
        });
        expect(thread.isOk()).toBe(true);
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }
        const threadId = parseEntityId(thread.value.id, 'threads.id', 'thr');

        const session = await sessionStore.create(profileId, thread.value.id, 'local');
        expect(session.created).toBe(true);
        if (!session.created) {
            throw new Error(session.reason);
        }

        const run = await runStore.create({
            profileId,
            sessionId: session.session.id,
            prompt: 'Memory run',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'medium',
                    summary: 'auto',
                    includeEncrypted: true,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
            cache: {
                applied: false,
            },
            transport: {},
        });
        const message = await messageStore.createMessage({
            profileId,
            sessionId: session.session.id,
            runId: run.id,
            role: 'assistant',
        });

        const globalMemory = await memoryStore.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'global',
            createdByKind: 'user',
            title: 'Global Memory',
            bodyMarkdown: 'Global body',
        });
        const workspaceMemory = await memoryStore.create({
            profileId,
            memoryType: 'episodic',
            scopeKind: 'workspace',
            createdByKind: 'system',
            title: 'Workspace Memory',
            bodyMarkdown: 'Workspace body',
            workspaceFingerprint,
        });
        const threadMemory = await memoryStore.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            title: 'Thread Memory',
            bodyMarkdown: 'Thread body',
            workspaceFingerprint,
            threadId,
            temporalSubjectKey: 'subject::thread-memory',
        });
        const runMemory = await memoryStore.create({
            profileId,
            memoryType: 'episodic',
            scopeKind: 'run',
            createdByKind: 'system',
            title: 'Run Memory',
            bodyMarkdown: 'Run body',
            workspaceFingerprint,
            threadId,
            runId: run.id,
        });
        await getPersistence().db.transaction().execute(async (transaction) => {
            await memoryEvidenceStore.createManyInTransaction(transaction, {
                profileId,
                memoryId: globalMemory.id,
                evidence: [
                    {
                        kind: 'run',
                        label: `Run ${run.id}`,
                        sourceRunId: run.id,
                    },
                    {
                        kind: 'message',
                        label: 'Captured user prompt',
                        sourceRunId: run.id,
                        sourceMessageId: message.id,
                    },
                ],
            });
        });

        const listed = await memoryStore.listByProfile({ profileId });
        expect(new Set(listed.map((memory) => memory.id))).toEqual(
            new Set([globalMemory.id, workspaceMemory.id, threadMemory.id, runMemory.id])
        );

        const workspaceFiltered = await memoryStore.listByProfile({
            profileId,
            scopeKind: 'workspace',
            workspaceFingerprint,
        });
        expect(workspaceFiltered.map((memory) => memory.id)).toEqual([workspaceMemory.id]);
        expect(await memoryEvidenceStore.listByMemoryId(profileId, globalMemory.id)).toHaveLength(2);

        const disabled = await memoryStore.disable(profileId, workspaceMemory.id);
        expect(disabled?.state).toBe('disabled');

        const superseded = await memoryStore.supersede({
            profileId,
            previousMemoryId: threadMemory.id,
            revisionReason: 'refinement',
            replacement: {
                profileId,
                memoryType: threadMemory.memoryType,
                scopeKind: threadMemory.scopeKind,
                createdByKind: 'system',
                title: 'Thread Memory v2',
                bodyMarkdown: 'Updated thread body',
                workspaceFingerprint,
                threadId,
                ...(threadMemory.temporalSubjectKey ? { temporalSubjectKey: threadMemory.temporalSubjectKey } : {}),
            },
        });
        expect(superseded?.previous.state).toBe('superseded');
        expect(superseded?.previous.supersededByMemoryId).toBe(superseded?.replacement.id);
        expect(superseded?.replacement.state).toBe('active');
        expect(superseded?.replacement.title).toBe('Thread Memory v2');
        expect(superseded?.replacement.temporalSubjectKey).toBe('subject::thread-memory');

        if (!superseded) {
            throw new Error('Expected superseded memory result.');
        }
        const createdRevision = await memoryRevisionStore.getByPreviousMemoryId(profileId, superseded.previous.id);
        expect(createdRevision?.revisionReason).toBe('refinement');
        expect(createdRevision?.previousMemoryId).toBe(superseded.previous.id);
        expect(createdRevision?.replacementMemoryId).toBe(superseded.replacement.id);
    });

    it('cascades owned memory when the owning run or thread is deleted', async () => {
        const profileId = getDefaultProfileId();
        const workspaceFingerprint = 'wsf_memory_store_cascade';
        const workspaceConversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory Cascade Workspace',
        });
        expect(workspaceConversation.isOk()).toBe(true);
        if (workspaceConversation.isErr()) {
            throw new Error(workspaceConversation.error.message);
        }

        const runOwnerThread = await threadStore.create({
            profileId,
            conversationId: workspaceConversation.value.id,
            title: 'Run Owner Thread',
            topLevelTab: 'agent',
        });
        const threadOwnerThread = await threadStore.create({
            profileId,
            conversationId: workspaceConversation.value.id,
            title: 'Thread Owner Thread',
            topLevelTab: 'agent',
        });
        expect(runOwnerThread.isOk()).toBe(true);
        expect(threadOwnerThread.isOk()).toBe(true);
        if (runOwnerThread.isErr()) {
            throw new Error(runOwnerThread.error.message);
        }
        if (threadOwnerThread.isErr()) {
            throw new Error(threadOwnerThread.error.message);
        }

        const runOwnerThreadId = parseEntityId(runOwnerThread.value.id, 'threads.id', 'thr');
        const threadOwnerThreadId = parseEntityId(threadOwnerThread.value.id, 'threads.id', 'thr');

        const runOwnerSession = await sessionStore.create(profileId, runOwnerThread.value.id, 'local');
        expect(runOwnerSession.created).toBe(true);
        if (!runOwnerSession.created) {
            throw new Error(runOwnerSession.reason);
        }

        const runOwnerRun = await runStore.create({
            profileId,
            sessionId: runOwnerSession.session.id,
            prompt: 'Run memory owner',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'medium',
                    summary: 'auto',
                    includeEncrypted: true,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
            cache: {
                applied: false,
            },
            transport: {},
        });

        const runScopedMemory = await memoryStore.create({
            profileId,
            memoryType: 'episodic',
            scopeKind: 'run',
            createdByKind: 'system',
            title: 'Run Scoped Memory',
            bodyMarkdown: 'Owned by run',
            workspaceFingerprint,
            threadId: runOwnerThreadId,
            runId: runOwnerRun.id,
        });
        await getPersistence().db.transaction().execute(async (transaction) => {
            await memoryEvidenceStore.createManyInTransaction(transaction, {
                profileId,
                memoryId: runScopedMemory.id,
                evidence: [
                    {
                        kind: 'run',
                        label: `Run ${runOwnerRun.id}`,
                        sourceRunId: runOwnerRun.id,
                    },
                ],
            });
        });
        const threadScopedMemory = await memoryStore.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            title: 'Thread Scoped Memory',
            bodyMarkdown: 'Owned by thread',
            workspaceFingerprint,
            threadId: threadOwnerThreadId,
        });

        const deletedRun = await runStore.deleteById(runOwnerRun.id);
        expect(deletedRun).toBe(true);
        expect(await memoryStore.getById(profileId, runScopedMemory.id)).toBeNull();
        expect(await memoryEvidenceStore.listByMemoryId(profileId, runScopedMemory.id)).toEqual([]);

        const deletedThreads = await threadStore.deleteWorkspaceThreads({
            profileId,
            workspaceFingerprint,
            includeFavorites: true,
        });
        expect(deletedThreads.deletedThreadIds).toEqual(
            expect.arrayContaining([runOwnerThreadId, threadOwnerThreadId])
        );
        expect(await memoryStore.getById(profileId, threadScopedMemory.id)).toBeNull();
    });

    it('keeps evidence rows while nulling deleted source references and rejects invalid evidence shapes', async () => {
        const profileId = getDefaultProfileId();
        const workspaceFingerprint = 'wsf_memory_store_evidence_sources';
        const workspaceConversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory Evidence Workspace',
        });
        expect(workspaceConversation.isOk()).toBe(true);
        if (workspaceConversation.isErr()) {
            throw new Error(workspaceConversation.error.message);
        }

        const thread = await threadStore.create({
            profileId,
            conversationId: workspaceConversation.value.id,
            title: 'Memory Evidence Thread',
            topLevelTab: 'agent',
        });
        expect(thread.isOk()).toBe(true);
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }

        const session = await sessionStore.create(profileId, thread.value.id, 'local');
        expect(session.created).toBe(true);
        if (!session.created) {
            throw new Error(session.reason);
        }

        const run = await runStore.create({
            profileId,
            sessionId: session.session.id,
            prompt: 'Memory evidence source run',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'medium',
                    summary: 'auto',
                    includeEncrypted: true,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
            cache: {
                applied: false,
            },
            transport: {},
        });
        const message = await messageStore.createMessage({
            profileId,
            sessionId: session.session.id,
            runId: run.id,
            role: 'assistant',
        });
        const messagePart = await messageStore.createPart({
            messageId: message.id,
            partType: 'text',
            payload: {
                text: 'Evidence source text.',
            },
        });

        const globalMemory = await memoryStore.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'global',
            createdByKind: 'user',
            title: 'Evidence memory',
            bodyMarkdown: 'Evidence-backed body',
        });
        await getPersistence().db.transaction().execute(async (transaction) => {
            await memoryEvidenceStore.createManyInTransaction(transaction, {
                profileId,
                memoryId: globalMemory.id,
                evidence: [
                    {
                        kind: 'message_part',
                        label: 'Assistant source text',
                        sourceRunId: run.id,
                        sourceMessageId: message.id,
                        sourceMessagePartId: messagePart.id,
                    },
                ],
            });
        });

        await expect(
            getPersistence().db.transaction().execute(async (transaction) => {
                await memoryEvidenceStore.createManyInTransaction(transaction, {
                    profileId,
                    memoryId: globalMemory.id,
                    evidence: [
                        {
                            kind: 'run',
                            label: 'Invalid run evidence',
                            sourceMessageId: message.id,
                        },
                    ],
                });
            })
        ).rejects.toThrow();

        const deletedRun = await runStore.deleteById(run.id);
        expect(deletedRun).toBe(true);

        const evidenceAfterRunDelete = await memoryEvidenceStore.listByMemoryId(profileId, globalMemory.id);
        expect(evidenceAfterRunDelete).toHaveLength(1);
        expect(evidenceAfterRunDelete[0]?.sourceRunId).toBeUndefined();
        expect(evidenceAfterRunDelete[0]?.sourceMessageId).toBeUndefined();
        expect(evidenceAfterRunDelete[0]?.sourceMessagePartId).toBeUndefined();
    });

    it('enforces scope invariants at the database layer', async () => {
        const profileId = getDefaultProfileId();

        await expect(
            memoryStore.create({
                profileId,
                memoryType: 'semantic',
                scopeKind: 'workspace',
                createdByKind: 'user',
                title: 'Invalid Workspace Memory',
                bodyMarkdown: 'Missing workspace fingerprint',
            })
        ).rejects.toThrow();

        await expect(
            memoryStore.create({
                profileId,
                memoryType: 'episodic',
                scopeKind: 'thread',
                createdByKind: 'system',
                title: 'Invalid Thread Memory',
                bodyMarkdown: 'Missing thread id',
                workspaceFingerprint: 'wsf_invalid_memory_scope',
            })
        ).rejects.toThrow();
    });

    it('supports mcp and tool seed stores', async () => {
        const tools = await toolStore.list();
        expect(tools.some((tool) => tool.id === 'read_file')).toBe(true);
        const builtInMetadata = await toolStore.listBuiltInMetadata();
        expect(builtInMetadata.map((tool) => tool.toolId)).toContain('write_file');

        const updatedMetadata = await toolStore.setBuiltInDescription(
            'write_file',
            'Create or replace a UTF-8 workspace file.'
        );
        expect(updatedMetadata.find((tool) => tool.toolId === 'write_file')).toMatchObject({
            description: 'Create or replace a UTF-8 workspace file.',
            isModified: true,
        });

        const resetMetadata = await toolStore.resetBuiltInDescription('write_file');
        expect(resetMetadata.find((tool) => tool.toolId === 'write_file')).toMatchObject({
            isModified: false,
        });

        await expect(toolStore.setBuiltInDescription('missing_tool', 'Nope')).rejects.toThrow(
            'Unknown built-in native tool "missing_tool".'
        );
        await expect(toolStore.setBuiltInDescription('write_file', '   ')).rejects.toThrow(
            'Built-in tool description cannot be empty.'
        );

        const servers = await mcpStore.listServers();
        expect(servers).toEqual([]);

        const created = await mcpStore.createServer({
            label: 'Repo MCP',
            command: 'node',
            args: ['server.js'],
            workingDirectoryMode: 'inherit_process',
            enabled: true,
        });
        expect(created.transport).toBe('stdio');
        expect(created.connectionState).toBe('disconnected');
        expect(created.toolDiscoveryState).toBe('idle');

        await mcpStore.setEnvSecrets({
            serverId: created.id,
            values: [{ key: 'MCP_TOKEN', value: 'top-secret' }],
        });
        await mcpStore.replaceDiscoveredTools({
            serverId: created.id,
            tools: [
                {
                    name: 'echo_text',
                    description: 'Echoes text back.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            text: {
                                type: 'string',
                            },
                        },
                        required: ['text'],
                    },
                    mutability: 'mutating',
                },
            ],
            toolDiscoveryState: 'ready',
            connectionState: 'connected',
            connectedAt: new Date('2026-03-23T10:00:00.000Z').toISOString(),
        });

        expect(await mcpStore.getEnvSecrets(created.id)).toEqual({ MCP_TOKEN: 'top-secret' });
        expect((await mcpStore.getServer(created.id))?.envKeys).toEqual(['MCP_TOKEN']);

        const deleted = await mcpStore.deleteServer(created.id);
        expect(deleted).toBe(true);
        expect(await mcpStore.getServer(created.id)).toBeNull();
        expect(await mcpStore.getEnvSecrets(created.id)).toEqual({});

        const { sqlite } = getPersistence();
        const toolRowCount = sqlite
            .prepare('SELECT COUNT(*) AS count FROM mcp_server_tools WHERE server_id = ?')
            .get(created.id) as { count: number };
        const envRowCount = sqlite
            .prepare('SELECT COUNT(*) AS count FROM mcp_server_env_secrets WHERE server_id = ?')
            .get(created.id) as { count: number };
        expect(toolRowCount.count).toBe(0);
        expect(envRowCount.count).toBe(0);
    });

    it('seeds parity baseline stores', async () => {
        const profileId = getDefaultProfileId();

        const [modes, skillfiles, account, marketplacePackages, providerSecrets] = await Promise.all([
            modeStore.listByProfile(profileId),
            skillfileStore.listByProfile(profileId),
            accountSnapshotStore.getByProfile(profileId),
            marketplaceStore.listPackages(),
            providerSecretStore.listByProfile(profileId),
        ]);

        expect(modes.some((mode) => mode.topLevelTab === 'chat' && mode.modeKey === 'chat')).toBe(true);
        expect(modes.some((mode) => mode.topLevelTab === 'agent' && mode.modeKey === 'ask')).toBe(true);
        expect(
            modes.find((mode) => mode.topLevelTab === 'agent' && mode.modeKey === 'plan')?.executionPolicy
        ).toEqual({
            planningOnly: true,
            toolCapabilities: ['filesystem_read', 'mcp'],
            workflowCapabilities: ['planning', 'artifact_view', 'recovery'],
            behaviorFlags: ['approval_gated', 'artifact_producing', 'read_only_execution'],
            runtimeProfile: 'planner',
        });
        expect(
            modes.find((mode) => mode.topLevelTab === 'orchestrator' && mode.modeKey === 'orchestrate')
                ?.executionPolicy
        ).toEqual({
            toolCapabilities: ['filesystem_read'],
            workflowCapabilities: ['orchestration', 'artifact_view'],
            behaviorFlags: ['checkpoint_eligible', 'artifact_producing', 'child_worker_capable'],
            runtimeProfile: 'orchestrator',
        });
        expect(modes.find((mode) => mode.topLevelTab === 'agent' && mode.modeKey === 'code')?.executionPolicy).toMatchObject({
            toolCapabilities: ['filesystem_read', 'filesystem_write', 'shell', 'mcp', 'code_runtime'],
        });
        expect(modes.find((mode) => mode.topLevelTab === 'agent' && mode.modeKey === 'debug')?.executionPolicy).toMatchObject({
            toolCapabilities: ['filesystem_read', 'filesystem_write', 'shell', 'mcp', 'code_runtime'],
        });
        expect(skillfiles).toEqual([]);
        expect(account.authState).toBe('logged_out');
        expect(account.profileId).toBe(profileId);
        expect(marketplacePackages).toEqual([]);
        expect(providerSecrets).toEqual([]);
    });
});
