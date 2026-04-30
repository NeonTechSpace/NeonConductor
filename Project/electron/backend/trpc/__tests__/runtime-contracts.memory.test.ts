import { describe, expect, it, vi } from 'vitest';

import { memoryEvidenceStore, messageStore, runStore, toolResultArtifactStore } from '@/app/backend/persistence/stores';
import {
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    registerRuntimeContractHooks,
    requireEntityId,
    runtimeContractProfileId,
    waitForRunStatus,
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
            canonicalBody: {
                formatVersion: 1,
                sections: [
                    {
                        id: 'naming-fact',
                        kind: 'fact',
                        heading: 'Naming Preference',
                        items: ['Use explicit names.'],
                    },
                ],
            },
            bodyMarkdown: 'Use explicit names.',
            metadata: {
                source: 'manual',
            },
        });
        expect(globalCreated.memory.scopeKind).toBe('global');
        expect(globalCreated.memory.metadata).toEqual({ source: 'manual' });
        expect(globalCreated.memory.memoryRetentionClass).toBe('profile');
        expect(globalCreated.memory.canonicalBody.formatVersion).toBe(1);
        expect(globalCreated.memory.canonicalBody.sections[0]).toMatchObject({
            kind: 'fact',
            heading: 'Naming Preference',
            items: ['Use explicit names.'],
        });
        expect(globalCreated.memory.bodyMarkdown).toBe('## Naming Preference\n\n- Use explicit names.');

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
        expect(workspaceCreated.memory.memoryRetentionClass).toBe('workspace');

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
        expect(threadCreated.memory.memoryRetentionClass).toBe('task');

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
        expect(runCreated.memory.memoryRetentionClass).toBe('ephemeral');
        expect(Date.parse(runCreated.memory.retentionExpiresAt ?? '')).toBeGreaterThan(
            Date.parse(runCreated.memory.createdAt)
        );

        const listed = await caller.memory.list({ profileId });
        expect(listed.memories).toHaveLength(4);

        const filtered = await caller.memory.list({
            profileId,
            scopeKind: 'run',
            runId: run.id,
        });
        expect(filtered.memories.map((memory) => memory.id)).toEqual([runCreated.memory.id]);
        const retentionFiltered = await caller.memory.list({
            profileId,
            memoryRetentionClass: 'ephemeral',
        });
        expect(retentionFiltered.memories.map((memory) => memory.id)).toEqual([runCreated.memory.id]);

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
            revisionReason: 'refinement',
            metadata: {
                revision: 2,
            },
        });
        expect(superseded.previous.state).toBe('superseded');
        expect(superseded.previous.supersededByMemoryId).toBe(superseded.replacement.id);
        expect(superseded.previous.retentionSupersedenceRationale).toBe('Superseded by refinement revision.');
        expect(superseded.replacement.state).toBe('active');
        expect(superseded.replacement.threadId).toBe(threadId);
        expect(superseded.replacement.memoryRetentionClass).toBe('task');
        expect(superseded.replacement.metadata).toEqual({ revision: 2 });
        expect(superseded.replacement.canonicalBody.sections[0]?.items).toEqual(['Updated thread note.']);
    });

    it('promotes reviewed transcript messages into durable memory with provenance and digest validation', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Memory promotion source',
            kind: 'local',
            topLevelTab: 'chat',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected promotion thread id.');
        const run = await runStore.create({
            profileId,
            sessionId: created.session.id,
            prompt: 'promote a stable memory',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: { applied: false },
            transport: {},
        });
        const message = await messageStore.createMessage({
            profileId,
            sessionId: created.session.id,
            runId: run.id,
            role: 'assistant',
        });
        await messageStore.createPart({
            messageId: message.id,
            partType: 'text',
            payload: {
                text: 'The user prefers reviewed memory promotions with digest checks.',
            },
        });

        const source = {
            kind: 'message' as const,
            sessionId: created.session.id,
            messageId: message.id,
        };
        const prepared = await caller.memory.preparePromotion({
            profileId,
            source,
        });
        expect(prepared.draft).toMatchObject({
            target: 'memory',
            memoryType: 'semantic',
            scopeKind: 'thread',
            threadId,
            memoryRetentionClass: 'task',
        });
        expect(prepared.draft.bodyMarkdown).toContain('digest checks');
        expect(prepared.provenance.sourceMessageId).toBe(message.id);

        await expect(
            caller.memory.applyPromotion({
                profileId,
                source,
                sourceDigest: 'stale-digest',
                draft: prepared.draft,
            })
        ).rejects.toThrow('source changed after review');

        const applied = await caller.memory.applyPromotion({
            profileId,
            source,
            sourceDigest: prepared.source.digest,
            draft: {
                ...prepared.draft,
                title: 'Reviewed promotion preference',
            },
        });

        expect(applied.promoted).toMatchObject({
            target: 'memory',
            title: 'Reviewed promotion preference',
            scopeKind: 'thread',
        });
        expect(applied.memory.threadId).toBe(threadId);
        expect(applied.memory.metadata).toMatchObject({
            source: 'promotion',
            promotion: {
                sourceDigest: prepared.source.digest,
                sourceMessageId: message.id,
            },
        });
        const evidence = await memoryEvidenceStore.listByMemoryId(profileId, applied.memory.id);
        expect(evidence).toHaveLength(1);
        expect(evidence[0]).toMatchObject({
            kind: 'message',
            sourceRunId: run.id,
            sourceMessageId: message.id,
        });
    });

    it('promotes bounded tool artifact windows into durable memory evidence', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Memory artifact promotion source',
            kind: 'local',
            topLevelTab: 'chat',
        });
        const rawText = ['skip this line', 'capture this line', 'capture this line too', 'skip final line'].join('\n');
        const run = await runStore.create({
            profileId,
            sessionId: created.session.id,
            prompt: 'artifact memory promotion fixture',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: { applied: false },
            transport: {},
        });
        const message = await messageStore.createMessage({
            profileId,
            sessionId: created.session.id,
            runId: run.id,
            role: 'tool',
        });
        const part = await messageStore.createPart({
            messageId: message.id,
            partType: 'tool_result',
            payload: {
                callId: 'call_memory_promotion',
                toolName: 'run_command',
                outputText: 'preview',
                isError: false,
                artifactized: true,
                artifactAvailable: true,
                artifactKind: 'command_output',
                previewStrategy: 'head_tail',
                totalBytes: Buffer.byteLength(rawText, 'utf8'),
                totalLines: 4,
            },
        });
        await toolResultArtifactStore.create({
            messagePartId: part.id,
            profileId,
            sessionId: created.session.id,
            runId: run.id,
            toolName: 'run_command',
            artifactKind: 'command_output',
            contentType: 'text/plain',
            rawText,
            totalBytes: Buffer.byteLength(rawText, 'utf8'),
            totalLines: 4,
            previewText: 'preview',
            previewStrategy: 'head_tail',
            metadata: { command: 'printf fixture' },
        });

        const source = {
            kind: 'tool_result_artifact_window' as const,
            sessionId: created.session.id,
            messagePartId: part.id,
            startLine: 2,
            lineCount: 2,
        };
        const prepared = await caller.memory.preparePromotion({
            profileId,
            source,
        });
        expect(prepared.draft.bodyMarkdown).toBe('capture this line\ncapture this line too');
        expect(prepared.provenance.startLine).toBe(2);
        expect(prepared.provenance.lineCount).toBe(2);

        const applied = await caller.memory.applyPromotion({
            profileId,
            source,
            sourceDigest: prepared.source.digest,
            draft: {
                ...prepared.draft,
                title: 'Artifact promotion memory',
            },
        });

        expect(applied.memory.bodyMarkdown).toContain('capture this line');
        expect(applied.memory.bodyMarkdown).not.toContain('skip this line');
        const evidence = await memoryEvidenceStore.listByMemoryId(profileId, applied.memory.id);
        expect(evidence[0]).toMatchObject({
            kind: 'tool_result_artifact',
            sourceRunId: run.id,
            sourceMessagePartId: part.id,
            metadata: {
                startLine: 2,
                lineCount: 2,
                sourceDigest: prepared.source.digest,
            },
        });
    });

    it('reviews, updates, supersedes, and soft-forgets memory records through canonical review actions', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_memory_review_actions',
            title: 'Memory review actions',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const run = await runStore.create({
            profileId,
            sessionId: created.session.id,
            prompt: 'Memory review source run',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: { applied: false },
            transport: {},
        });
        const createdMemory = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'workspace',
            createdByKind: 'user',
            workspaceFingerprint: 'wsf_memory_review_actions',
            title: 'Review target',
            bodyMarkdown: 'Original memory body.',
            metadata: { source: 'manual_review_fixture' },
            evidence: [
                {
                    kind: 'run',
                    label: 'Review source run',
                    sourceRunId: run.id,
                },
            ],
        });

        const details = await caller.memory.getReviewDetails({
            profileId,
            memoryId: createdMemory.memory.id,
        });
        expect(details.memory.title).toBe('Review target');
        expect(details.evidence.map((evidence) => evidence.label)).toEqual(['Review source run']);
        expect(details.revisions).toEqual([]);

        await expect(
            caller.memory.applyReviewAction({
                profileId,
                memoryId: createdMemory.memory.id,
                expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
                action: 'update',
                title: 'Stale update',
                bodyMarkdown: 'Should not apply.',
            })
        ).rejects.toThrow(/changed after review opened/i);

        const updated = await caller.memory.applyReviewAction({
            profileId,
            memoryId: createdMemory.memory.id,
            expectedUpdatedAt: details.memory.updatedAt,
            action: 'update',
            title: 'Reviewed update',
            summaryText: 'Updated summary',
            bodyMarkdown: 'Updated memory body.',
        });
        expect(updated.action).toBe('update');
        expect(updated.memory.title).toBe('Reviewed update');
        expect(updated.memory.summaryText).toBe('Updated summary');
        expect(updated.memory.metadata).toEqual({ source: 'manual_review_fixture' });
        expect(updated.evidence.map((evidence) => evidence.label)).toEqual(['Review source run']);

        const superseded = await caller.memory.applyReviewAction({
            profileId,
            memoryId: updated.memory.id,
            expectedUpdatedAt: updated.memory.updatedAt,
            action: 'supersede',
            revisionReason: 'refinement',
            title: 'Reviewed replacement',
            bodyMarkdown: 'Replacement memory body.',
        });
        expect(superseded.action).toBe('supersede');
        expect(superseded.previousMemory?.state).toBe('superseded');
        expect(superseded.memory.title).toBe('Reviewed replacement');
        expect(superseded.revisions[0]).toMatchObject({
            previousMemoryId: updated.memory.id,
            replacementMemoryId: superseded.memory.id,
            revisionReason: 'refinement',
        });

        const forgotten = await caller.memory.applyReviewAction({
            profileId,
            memoryId: superseded.memory.id,
            expectedUpdatedAt: superseded.memory.updatedAt,
            action: 'forget',
        });
        expect(forgotten.action).toBe('forget');
        expect(forgotten.memory.state).toBe('disabled');

        const evidenceAfterForget = await memoryEvidenceStore.listByMemoryId(profileId, createdMemory.memory.id);
        expect(evidenceAfterForget.map((evidence) => evidence.label)).toEqual(['Review source run']);
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
                revisionReason: 'correction',
            })
        ).rejects.toThrow(/Only active memory can be superseded/i);
    });

    it('creates automatic finished-run memory after a completed run', async () => {
        const caller = createCaller();
        const completionFetchMock = vi.fn(() =>
            Promise.resolve({
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
            })
        );
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

        let automaticMemory: Awaited<ReturnType<typeof caller.memory.list>>['memories'][number] | undefined;
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
            vi.fn((_url: string, init?: RequestInit) => {
                if (typeof init?.body === 'string') {
                    requestBodies.push(init.body);
                }

                return Promise.resolve({
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
                });
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-memory-injection-key',
        });
        expect(configured.success).toBe(true);
        const evidenceSource = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Evidence source thread',
            kind: 'local',
            topLevelTab: 'chat',
        });
        const evidenceRun = await runStore.create({
            profileId,
            sessionId: evidenceSource.session.id,
            prompt: 'Evidence source run',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: defaultRuntimeOptions,
            cache: {
                applied: false,
            },
            transport: {},
        });

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
            evidence: [
                {
                    kind: 'run',
                    label: 'Cross-tab evidence run',
                    sourceRunId: evidenceRun.id,
                },
            ],
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
            expect(
                started.resolvedContextState.retrievedMemory?.records.some((record) => {
                    if (record.title !== 'Cross-tab retrieval memory') {
                        return false;
                    }

                    return record.supportingEvidence[0]?.label === 'Cross-tab evidence run';
                })
            ).toBe(true);

            await waitForRunStatus(caller, profileId, created.session.id, 'completed');
        }

        expect(requestBodies.some((body) => body.includes('Retrieved memory'))).toBe(true);
        expect(requestBodies.some((body) => body.includes('Cross-tab retrieval memory'))).toBe(true);
    });
});
