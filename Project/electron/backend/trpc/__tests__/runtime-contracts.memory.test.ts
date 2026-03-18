import { describe, expect, it, vi } from 'vitest';

import { runStore, worktreeStore } from '@/app/backend/persistence/stores';
import { advancedMemoryDerivationService } from '@/app/backend/runtime/services/memory/advancedDerivation';
import { errOp } from '@/app/backend/runtime/services/common/operationalError';
import {
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    getPersistence,
    mkdtempSync,
    os,
    path,
    readFileSync,
    registerRuntimeContractHooks,
    requireEntityId,
    runtimeContractProfileId,
    waitForRunStatus,
    writeFileSync,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: memory', () => {
    const profileId = runtimeContractProfileId;

    it('creates, lists, disables, and supersedes memories through the API', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'wsf_runtime_memory';
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory contract thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected memory test thread id.');
        const run = await runStore.create({
            profileId,
            sessionId: created.session.id,
            prompt: 'Memory contract run',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: {
                applied: false,
            },
            transport: {},
        });

        const globalCreated = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'global',
            createdByKind: 'user',
            title: 'Global preference',
            bodyMarkdown: 'Use explicit names.',
            metadata: {
                source: 'manual',
            },
        });
        expect(globalCreated.memory.scopeKind).toBe('global');
        expect(globalCreated.memory.metadata).toEqual({ source: 'manual' });

        const workspaceCreated = await caller.memory.create({
            profileId,
            memoryType: 'episodic',
            scopeKind: 'workspace',
            createdByKind: 'system',
            workspaceFingerprint,
            title: 'Workspace lesson',
            bodyMarkdown: 'This workspace prefers deterministic steps.',
        });
        expect(workspaceCreated.memory.workspaceFingerprint).toBe(workspaceFingerprint);

        const threadCreated = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Thread note',
            bodyMarkdown: 'Follow up on the active task.',
        });
        expect(threadCreated.memory.threadId).toBe(threadId);
        expect(threadCreated.memory.workspaceFingerprint).toBe(workspaceFingerprint);

        const runCreated = await caller.memory.create({
            profileId,
            memoryType: 'episodic',
            scopeKind: 'run',
            createdByKind: 'system',
            runId: run.id,
            title: 'Run result',
            bodyMarkdown: 'The last run completed successfully.',
        });
        expect(runCreated.memory.runId).toBe(run.id);
        expect(runCreated.memory.threadId).toBe(threadId);
        expect(runCreated.memory.workspaceFingerprint).toBe(workspaceFingerprint);

        const listed = await caller.memory.list({ profileId });
        expect(listed.memories).toHaveLength(4);

        const filtered = await caller.memory.list({
            profileId,
            scopeKind: 'run',
            runId: run.id,
        });
        expect(filtered.memories.map((memory) => memory.id)).toEqual([runCreated.memory.id]);

        const disabled = await caller.memory.disable({
            profileId,
            memoryId: workspaceCreated.memory.id,
        });
        expect(disabled.memory.state).toBe('disabled');

        const superseded = await caller.memory.supersede({
            profileId,
            memoryId: threadCreated.memory.id,
            createdByKind: 'system',
            title: 'Thread note v2',
            bodyMarkdown: 'Updated thread note.',
            metadata: {
                revision: 2,
            },
        });
        expect(superseded.previous.state).toBe('superseded');
        expect(superseded.previous.supersededByMemoryId).toBe(superseded.replacement.id);
        expect(superseded.replacement.state).toBe('active');
        expect(superseded.replacement.threadId).toBe(threadId);
        expect(superseded.replacement.metadata).toEqual({ revision: 2 });
    });

    it('rejects invalid scope and provenance combinations', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'wsf_runtime_memory_validation';
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory validation thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected validation thread id.');
        const run = await runStore.create({
            profileId,
            sessionId: created.session.id,
            prompt: 'Memory validation run',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: {
                applied: false,
            },
            transport: {},
        });

        await expect(
            caller.memory.create({
                profileId,
                memoryType: 'semantic',
                scopeKind: 'global',
                createdByKind: 'user',
                workspaceFingerprint,
                title: 'Invalid global memory',
                bodyMarkdown: 'Should fail.',
            })
        ).rejects.toThrow(/does not allow workspace, thread, or run provenance/i);

        await expect(
            caller.memory.create({
                profileId,
                memoryType: 'procedural',
                scopeKind: 'thread',
                createdByKind: 'user',
                title: 'Missing thread',
                bodyMarkdown: 'Should fail.',
            })
        ).rejects.toThrow(/requires "threadId"/i);

        await expect(
            caller.memory.create({
                profileId,
                memoryType: 'episodic',
                scopeKind: 'run',
                createdByKind: 'system',
                runId: run.id,
                workspaceFingerprint: 'wsf_wrong_memory_workspace',
                title: 'Wrong run provenance',
                bodyMarkdown: 'Should fail.',
            })
        ).rejects.toThrow(/workspace provenance does not match/i);

        const activeMemory = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Lifecycle memory',
            bodyMarkdown: 'Active lifecycle memory.',
        });
        await caller.memory.disable({
            profileId,
            memoryId: activeMemory.memory.id,
        });

        await expect(
            caller.memory.disable({
                profileId,
                memoryId: activeMemory.memory.id,
            })
        ).rejects.toThrow(/Only active memory can be disabled/i);

        await expect(
            caller.memory.supersede({
                profileId,
                memoryId: activeMemory.memory.id,
                createdByKind: 'system',
                title: 'Disabled replacement',
                bodyMarkdown: 'Should fail.',
            })
        ).rejects.toThrow(/Only active memory can be superseded/i);
    });

    it('creates automatic finished-run memory after a completed run', async () => {
        const caller = createCaller();
        const completionFetchMock = vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => ({
                choices: [
                    {
                        message: {
                            content: 'Completed automatic memory run.',
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 11,
                    completion_tokens: 17,
                    total_tokens: 28,
                },
            }),
        }));
        vi.stubGlobal('fetch', completionFetchMock);

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-memory-runtime-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_runtime_memory_completed_run',
            title: 'Completed memory runtime thread',
            kind: 'local',
            topLevelTab: 'chat',
        });

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Capture this finished run automatically.',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected automatic memory run start to be accepted.');
        }

        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        let automaticMemory:
            | (Awaited<ReturnType<typeof caller.memory.list>>['memories'][number])
            | undefined;
        for (let attempt = 0; attempt < 20; attempt += 1) {
            const runScopedMemories = await caller.memory.list({
                profileId,
                scopeKind: 'run',
            });
            automaticMemory = runScopedMemories.memories.find(
                (memory) =>
                    memory.createdByKind === 'system' &&
                    memory.metadata['source'] === 'runtime_run_outcome' &&
                    memory.metadata['runStatus'] === 'completed'
            );
            if (automaticMemory) {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 25));
        }

        expect(automaticMemory).toBeDefined();
        if (!automaticMemory) {
            throw new Error('Expected automatic finished-run memory.');
        }
        expect(automaticMemory.memoryType).toBe('episodic');
        expect(automaticMemory.bodyMarkdown).toContain('Status: completed');
        expect(automaticMemory.bodyMarkdown).toContain('Capture this finished run automatically.');
        expect(automaticMemory.bodyMarkdown).toContain('total 28 tokens');
    });

    it('retrieves and injects memory for chat, agent, and orchestrator runs', async () => {
        const caller = createCaller();
        const requestBodies: string[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string, init?: RequestInit) => {
                if (typeof init?.body === 'string') {
                    requestBodies.push(init.body);
                }

                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'Memory-aware response.',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 9,
                            completion_tokens: 13,
                            total_tokens: 22,
                        },
                    }),
                };
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-memory-injection-key',
        });
        expect(configured.success).toBe(true);

        await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'global',
            createdByKind: 'user',
            title: 'Cross-tab retrieval memory',
            bodyMarkdown: 'This memory should be injected for every supported tab.',
            metadata: {
                topLevelTab: 'shared',
            },
        });

        const scenarios = [
            {
                topLevelTab: 'chat' as const,
                modeKey: 'chat',
                scope: 'detached' as const,
                title: 'Chat retrieval thread',
            },
            {
                topLevelTab: 'agent' as const,
                modeKey: 'code',
                scope: 'workspace' as const,
                workspaceFingerprint: 'wsf_runtime_memory_agent_injection',
                title: 'Agent retrieval thread',
            },
            {
                topLevelTab: 'orchestrator' as const,
                modeKey: 'orchestrate',
                scope: 'workspace' as const,
                workspaceFingerprint: 'wsf_runtime_memory_orchestrator_injection',
                title: 'Orchestrator retrieval thread',
            },
        ];

        for (const scenario of scenarios) {
            const created = await createSessionInScope(caller, profileId, {
                scope: scenario.scope,
                ...(scenario.workspaceFingerprint ? { workspaceFingerprint: scenario.workspaceFingerprint } : {}),
                title: scenario.title,
                kind: 'local',
                topLevelTab: scenario.topLevelTab,
            });
            const started = await caller.session.startRun({
                profileId,
                sessionId: created.session.id,
                prompt: `Use cross-tab retrieval for ${scenario.topLevelTab}.`,
                topLevelTab: scenario.topLevelTab,
                modeKey: scenario.modeKey,
                runtimeOptions: defaultRuntimeOptions,
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            });
            expect(started.accepted).toBe(true);
            if (!started.accepted) {
                throw new Error(`Expected ${scenario.topLevelTab} retrieval run to start.`);
            }
            expect(started.resolvedContextState.retrievedMemory?.records.some((record) => record.title === 'Cross-tab retrieval memory')).toBe(true);

            await waitForRunStatus(caller, profileId, created.session.id, 'completed');
        }

        expect(requestBodies.some((body) => body.includes('Retrieved memory'))).toBe(true);
        expect(requestBodies.some((body) => body.includes('Cross-tab retrieval memory'))).toBe(true);
    });

    it('syncs memory projection files to workspace and global roots', async () => {
        const caller = createCaller();
        const globalMemoryRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-memory-global-'));
        vi.stubEnv('NEONCONDUCTOR_GLOBAL_MEMORY_ROOT', globalMemoryRoot);
        const workspaceFingerprint = 'wsf_runtime_memory_projection';
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory projection thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected projection thread id.');

        const globalMemory = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'global',
            createdByKind: 'user',
            title: 'Projection global memory',
            bodyMarkdown: 'Global projection body.',
        });
        const threadMemory = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Projection thread memory',
            bodyMarkdown: 'Thread projection body.',
            metadata: {
                source: 'manual',
            },
        });

        const synced = await caller.memory.syncProjection({
            profileId,
            workspaceFingerprint,
            threadId,
        });

        expect(synced.paths.globalMemoryRoot).toBe(globalMemoryRoot);
        expect(synced.paths.workspaceMemoryRoot).toMatch(/\.neonconductor[\\/]memory$/);
        const projectedById = new Map(synced.projectedMemories.map((record) => [record.memory.id, record] as const));
        const globalProjected = projectedById.get(globalMemory.memory.id);
        const threadProjected = projectedById.get(threadMemory.memory.id);
        expect(globalProjected?.syncState).toBe('in_sync');
        expect(threadProjected?.syncState).toBe('in_sync');

        const projectedThreadFile = threadProjected?.absolutePath;
        if (!projectedThreadFile) {
            throw new Error('Expected projected thread memory file.');
        }

        const projectedThreadContent = readFileSync(projectedThreadFile, 'utf8');
        expect(projectedThreadContent).toContain('memoryType: "procedural"');
        expect(projectedThreadContent).toContain('threadId:');
        expect(projectedThreadContent).toContain('metadata: {"source":"manual"}');
    });

    it('keeps workspace memory projection pinned to the base workspace root when a worktree is selected', async () => {
        const caller = createCaller();
        const globalMemoryRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-memory-worktree-global-'));
        vi.stubEnv('NEONCONDUCTOR_GLOBAL_MEMORY_ROOT', globalMemoryRoot);
        const workspaceFingerprint = 'wsf_runtime_memory_worktree_projection';
        await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory worktree projection thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const workspaceRootRow = getPersistence().sqlite
            .prepare('SELECT absolute_path FROM workspace_roots WHERE profile_id = ? AND fingerprint = ?')
            .get(profileId, workspaceFingerprint) as { absolute_path: string } | undefined;
        if (!workspaceRootRow) {
            throw new Error('Expected workspace root for memory worktree projection test.');
        }

        const worktreePath = mkdtempSync(path.join(os.tmpdir(), 'nc-memory-worktree-'));
        const worktree = await worktreeStore.create({
            profileId,
            workspaceFingerprint,
            branch: 'feature/memory-projection',
            baseBranch: 'main',
            absolutePath: worktreePath,
            label: 'memory-worktree',
            status: 'ready',
        });

        const workspaceMemory = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'workspace',
            createdByKind: 'user',
            workspaceFingerprint,
            title: 'Workspace projected memory',
            bodyMarkdown: 'Workspace projection body.',
        });

        const synced = await caller.memory.syncProjection({
            profileId,
            workspaceFingerprint,
            worktreeId: worktree.id,
        });

        expect(synced.paths.workspaceMemoryRoot).toBe(
            path.join(workspaceRootRow.absolute_path, '.neonconductor', 'memory')
        );
        const projected = synced.projectedMemories.find((record) => record.memory.id === workspaceMemory.memory.id);
        expect(projected?.projectionTarget).toBe('workspace');
        expect(projected?.absolutePath).toBe(
            path.join(
                workspaceRootRow.absolute_path,
                '.neonconductor',
                'memory',
                'semantic',
                `workspace--${workspaceMemory.memory.id}.md`
            )
        );
    });

    it('scans, applies, and rejects projected memory edits through reviewed proposals', async () => {
        const caller = createCaller();
        const globalMemoryRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-memory-review-'));
        vi.stubEnv('NEONCONDUCTOR_GLOBAL_MEMORY_ROOT', globalMemoryRoot);
        const workspaceFingerprint = 'wsf_runtime_memory_review';
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory review thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected review thread id.');

        const editableMemory = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Editable memory',
            bodyMarkdown: 'Original body.',
            metadata: {
                source: 'manual',
            },
        });

        const synced = await caller.memory.syncProjection({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        const projectedMemory = synced.projectedMemories.find((record) => record.memory.id === editableMemory.memory.id);
        if (!projectedMemory) {
            throw new Error('Expected synced projected memory.');
        }

        writeFileSync(
            projectedMemory.absolutePath,
            `---\nid: "${editableMemory.memory.id}"\nmemoryType: "procedural"\nscopeKind: "thread"\nstate: "active"\ntitle: "Editable memory v2"\nthreadId: "${threadId}"\nworkspaceFingerprint: "${workspaceFingerprint}"\nmetadata: {"source":"projection","revision":2}\n---\nUpdated projection body.\n`,
            'utf8'
        );

        const scanned = await caller.memory.scanProjectionEdits({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        expect(scanned.proposals).toHaveLength(1);
        expect(scanned.proposals[0]?.reviewAction).toBe('update');

        const proposal = scanned.proposals[0];
        if (!proposal) {
            throw new Error('Expected memory edit proposal.');
        }

        const applied = await caller.memory.applyProjectionEdit({
            profileId,
            workspaceFingerprint,
            threadId,
            memoryId: proposal.memory.id,
            observedContentHash: proposal.observedContentHash,
            decision: 'accept',
        });
        expect(applied.appliedAction).toBe('update');
        expect(applied.memory.title).toBe('Editable memory v2');
        expect(applied.memory.metadata).toEqual({ source: 'projection', revision: 2 });

        writeFileSync(
            projectedMemory.absolutePath,
            `---\nid: "${applied.memory.id}"\nmemoryType: "procedural"\nscopeKind: "thread"\nstate: "active"\ntitle: "Editable memory rejected"\nthreadId: "${threadId}"\nworkspaceFingerprint: "${workspaceFingerprint}"\nmetadata: {"source":"projection","revision":3}\n---\nRejected projection body.\n`,
            'utf8'
        );

        const rejectScan = await caller.memory.scanProjectionEdits({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        expect(rejectScan.proposals).toHaveLength(1);
        const rejectProposal = rejectScan.proposals[0];
        if (!rejectProposal) {
            throw new Error('Expected rejectable memory edit proposal.');
        }

        const rejected = await caller.memory.applyProjectionEdit({
            profileId,
            workspaceFingerprint,
            threadId,
            memoryId: rejectProposal.memory.id,
            observedContentHash: rejectProposal.observedContentHash,
            decision: 'reject',
        });
        expect(rejected.decision).toBe('reject');
        expect(rejected.memory.title).toBe('Editable memory v2');

        writeFileSync(projectedMemory.absolutePath, 'not valid frontmatter', 'utf8');

        const parseErrorScan = await caller.memory.scanProjectionEdits({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        expect(parseErrorScan.proposals).toHaveLength(0);
        expect(parseErrorScan.parseErrors).toHaveLength(1);
    });

    it('does not overwrite edited projected memory files during sync', async () => {
        const caller = createCaller();
        const globalMemoryRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-memory-sync-preserve-'));
        vi.stubEnv('NEONCONDUCTOR_GLOBAL_MEMORY_ROOT', globalMemoryRoot);
        const workspaceFingerprint = 'wsf_runtime_memory_sync_preserve';
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory sync preserve thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected preserve thread id.');

        const editableMemory = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Sync preserve memory',
            bodyMarkdown: 'Original projection body.',
        });

        const firstSync = await caller.memory.syncProjection({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        const projectedMemory = firstSync.projectedMemories.find((record) => record.memory.id === editableMemory.memory.id);
        if (!projectedMemory) {
            throw new Error('Expected projected memory for sync preservation test.');
        }

        const editedContent =
            `---\n` +
            `id: "${editableMemory.memory.id}"\n` +
            `memoryType: "procedural"\n` +
            `scopeKind: "thread"\n` +
            `state: "active"\n` +
            `title: "Sync preserve edited"\n` +
            `threadId: "${threadId}"\n` +
            `workspaceFingerprint: "${workspaceFingerprint}"\n` +
            `metadata: {"edited":true}\n` +
            `---\n` +
            `Preserve this edited body.\n`;
        writeFileSync(projectedMemory.absolutePath, editedContent, 'utf8');

        const editedScan = await caller.memory.scanProjectionEdits({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        expect(editedScan.proposals).toHaveLength(1);
        expect(editedScan.proposals[0]?.proposedTitle).toBe('Sync preserve edited');

        const secondSync = await caller.memory.syncProjection({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        const resynced = secondSync.projectedMemories.find((record) => record.memory.id === editableMemory.memory.id);
        expect(resynced?.syncState).toBe('edited');
        expect(readFileSync(projectedMemory.absolutePath, 'utf8')).toBe(editedContent);
    });

    it('keeps projection sync working when derived summaries fail', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'wsf_runtime_memory_projection_fail_soft';
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory projection fail-soft thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected projection fail-soft thread id.');

        const memory = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Projection fail-soft memory',
            bodyMarkdown: 'Projection should still sync when the derived layer fails.',
        });

        const summarySpy = vi
            .spyOn(advancedMemoryDerivationService, 'getDerivedSummaries')
            .mockResolvedValue(errOp('request_failed', 'Derived summaries failed.'));

        try {
            const synced = await caller.memory.syncProjection({
                profileId,
                workspaceFingerprint,
                threadId,
            });
            const projected = synced.projectedMemories.find((record) => record.memory.id === memory.memory.id);
            expect(projected?.syncState).toBe('in_sync');
            expect(projected?.derivedSummary).toBeUndefined();
            expect(readFileSync(projected?.absolutePath ?? '', 'utf8')).toContain('Projection fail-soft memory');
        } finally {
            summarySpy.mockRestore();
        }
    });
});
