import { describe, expect, it, vi } from 'vitest';

import { createCaller, createSessionInScope, defaultRuntimeOptions, getPersistence, mkdirSync, path, registerRuntimeContractHooks, requireEntityId, rmSync, runtimeContractProfileId, waitForOrchestratorStatus, writeFileSync } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

function insertChatCompletionsTestModel(input: {
    profileId: string;
    modelId: string;
    label: string;
}) {
    const { sqlite } = getPersistence();
    const now = new Date().toISOString();
    sqlite
        .prepare(
            `
                INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            `
        )
        .run(input.modelId, 'openai', input.label, now, now);
    sqlite
        .prepare(
            `
                INSERT OR REPLACE INTO provider_model_catalog
                    (
                        profile_id,
                        provider_id,
                        model_id,
                        label,
                        upstream_provider,
                        is_free,
                        supports_tools,
                        supports_reasoning,
                        supports_vision,
                        supports_audio_input,
                        supports_audio_output,
                        tool_protocol,
                        api_family,
                        input_modalities_json,
                        output_modalities_json,
                        prompt_family,
                        context_length,
                        pricing_json,
                        raw_json,
                        source,
                        updated_at
                    )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
        )
        .run(
            input.profileId,
            'openai',
            input.modelId,
            input.label,
            'openai',
            0,
            1,
            1,
            0,
            0,
            0,
            'openai_chat_completions',
            'openai_compatible',
            JSON.stringify(['text']),
            JSON.stringify(['text']),
            null,
            128000,
            '{}',
            '{}',
            'test',
            now
        );
}

function extractChatMessageContents(requestBody: Record<string, unknown>): string[] {
    const messages = requestBody['messages'];
    if (!Array.isArray(messages)) {
        return [];
    }

    return messages
        .map((message) => {
            if (typeof message !== 'object' || message === null) {
                return '';
            }

            const content = (message as { content?: unknown }).content;
            return typeof content === 'string' ? content : '';
        })
        .filter((content) => content.length > 0);
}

describe('runtime contracts: planning and orchestrator', () => {
    const profileId = runtimeContractProfileId;
    it(
        'projects delegated child lanes onto the root sandbox immediately and propagates rules, skills, and root-thread memory',
        async () => {
            const caller = createCaller();
            const requestBodies: Array<Record<string, unknown>> = [];
            let resolveFetch: (() => void) | undefined;
            vi.stubGlobal(
                'fetch',
                vi.fn((_url: string, init?: RequestInit) => {
                    if (typeof init?.body === 'string') {
                        requestBodies.push(JSON.parse(init.body) as Record<string, unknown>);
                    }

                    return new Promise((resolve) => {
                        resolveFetch = () => {
                            resolve({
                                ok: true,
                                status: 200,
                                statusText: 'OK',
                                json: () => ({
                                    choices: [
                                        {
                                            message: {
                                                content: 'Delegated child completed with inherited context.',
                                            },
                                        },
                                    ],
                                    usage: {
                                        prompt_tokens: 17,
                                        completion_tokens: 12,
                                        total_tokens: 29,
                                    },
                                }),
                            });
                        };
                    });
                })
            );

            await caller.provider.setApiKey({
                profileId,
                providerId: 'openai',
                apiKey: 'openai-orchestrator-child-context-key',
            });
            insertChatCompletionsTestModel({
                profileId,
                modelId: 'openai/orchestrator-child-context-test',
                label: 'Orchestrator Child Context Test',
            });

            const workspaceFingerprint = 'wsf_orchestrator_child_context_propagation';
            const created = await createSessionInScope(caller, profileId, {
                scope: 'workspace',
                workspaceFingerprint,
                title: 'Sandbox root orchestrator thread',
                kind: 'local',
                topLevelTab: 'orchestrator',
            });
            const rootThreadId = requireEntityId(created.thread.id, 'thr', 'Expected orchestrator root thread id.');
            const configuredThread = await caller.sandbox.configureThread({
                profileId,
                threadId: rootThreadId,
                mode: 'new_sandbox',
            });
            expect(configuredThread.thread.executionEnvironmentMode).toBe('new_sandbox');
            expect(configuredThread.thread.sandboxId).toBeUndefined();

            const registryPaths = await caller.registry.listResolved({
                profileId,
                workspaceFingerprint,
            });
            const workspaceAssetsRoot = registryPaths.paths.workspaceAssetsRoot;
            if (!workspaceAssetsRoot) {
                throw new Error('Expected workspace assets root for delegated child propagation test.');
            }

            rmSync(workspaceAssetsRoot, { recursive: true, force: true });
            mkdirSync(path.join(workspaceAssetsRoot, 'rules-code'), { recursive: true });
            mkdirSync(path.join(workspaceAssetsRoot, 'skills-code'), { recursive: true });
            writeFileSync(
                path.join(workspaceAssetsRoot, 'rules-code', 'delegated-manual-rule.md'),
                `---
key: delegated_manual_rule
name: Delegated Manual Rule
activationMode: manual
---
# Delegated Manual Rule

- Apply this rule to delegated child runs.
`,
                'utf8'
            );
            writeFileSync(
                path.join(workspaceAssetsRoot, 'skills-code', 'delegated-repo-search.md'),
                `---
key: delegated_repo_search
name: Delegated Repo Search
---
# Delegated Repo Search

- Use repository search inside the delegated child lane.
`,
                'utf8'
            );
            await caller.registry.refresh({
                profileId,
                workspaceFingerprint,
            });

            await caller.session.setAttachedRules({
                profileId,
                sessionId: created.session.id,
                topLevelTab: 'agent',
                modeKey: 'code',
                assetKeys: ['delegated_manual_rule'],
            });
            await caller.session.setAttachedSkills({
                profileId,
                sessionId: created.session.id,
                topLevelTab: 'agent',
                modeKey: 'code',
                assetKeys: ['delegated_repo_search'],
            });
            await caller.memory.create({
                profileId,
                memoryType: 'procedural',
                scopeKind: 'thread',
                createdByKind: 'user',
                threadId: rootThreadId,
                title: 'Delegated root memory',
                bodyMarkdown: 'Remember the orchestrator root context.',
            });

            const started = await caller.plan.start({
                profileId,
                sessionId: created.session.id,
                topLevelTab: 'orchestrator',
                modeKey: 'plan',
                prompt: 'Delegate one child task with inherited sandbox and context.',
            });
            await caller.plan.answerQuestion({
                profileId,
                planId: started.plan.id,
                questionId: 'scope',
                answer: 'Run one delegated child with inherited execution target and context.',
            });
            await caller.plan.answerQuestion({
                profileId,
                planId: started.plan.id,
                questionId: 'constraints',
                answer: 'Keep the child on the same sandbox and inherit attached registry context.',
            });
            await caller.plan.revise({
                profileId,
                planId: started.plan.id,
                summaryMarkdown: '# Delegated Context Plan',
                items: [{ description: 'Execute one delegated child with inherited context.' }],
            });
            await caller.plan.approve({
                profileId,
                planId: started.plan.id,
            });

            const implemented = await caller.plan.implement({
                profileId,
                planId: started.plan.id,
                runtimeOptions: {
                    ...defaultRuntimeOptions,
                    transport: {
                        family: 'openai_chat_completions',
                    },
                },
                providerId: 'openai',
                modelId: 'openai/orchestrator-child-context-test',
            });
            expect(implemented.found).toBe(true);
            if (!implemented.found) {
                throw new Error('Expected orchestrator implementation start for child propagation test.');
            }
            if (implemented.mode !== 'orchestrator.orchestrate') {
                throw new Error('Expected orchestrator mode for child propagation test.');
            }

            let childSessionId: `sess_${string}` | undefined;
            let childThreadId: `thr_${string}` | undefined;
            for (let attempt = 0; attempt < 200; attempt += 1) {
                const status = await caller.orchestrator.status({
                    profileId,
                    orchestratorRunId: implemented.orchestratorRunId,
                });
                if (status.found && status.steps[0]?.status === 'running') {
                    childSessionId = status.steps[0].childSessionId;
                    childThreadId = status.steps[0].childThreadId;
                    break;
                }

                await new Promise((resolve) => setTimeout(resolve, 25));
            }

            expect(childSessionId).toBeDefined();
            expect(childThreadId).toBeDefined();
            if (!childSessionId || !childThreadId) {
                throw new Error('Expected running delegated child lane with projected identifiers.');
            }

            const threadList = await caller.conversation.listThreads({
                profileId,
                activeTab: 'orchestrator',
                showAllModes: false,
                groupView: 'workspace',
            });
            const rootThread = threadList.threads.find((thread) => thread.id === rootThreadId);
            const childThread = threadList.threads.find((thread) => thread.id === childThreadId);
            expect(rootThread?.executionEnvironmentMode).toBe('sandbox');
            expect(rootThread?.sandboxId).toEqual(expect.stringMatching(/^sb_/));
            expect(childThread?.executionEnvironmentMode).toBe('sandbox');
            expect(childThread?.sandboxId).toBe(rootThread?.sandboxId);
            expect(childThread?.workspaceFingerprint).toBe(workspaceFingerprint);

            const sessionList = await caller.session.list({ profileId });
            const childSession = sessionList.sessions.find((session) => session.id === childSessionId);
            expect(childSession?.kind).toBe('sandbox');
            expect(childSession?.sandboxId).toBe(rootThread?.sandboxId);

            for (let attempt = 0; attempt < 200; attempt += 1) {
                if (resolveFetch) {
                    break;
                }

                await new Promise((resolve) => setTimeout(resolve, 25));
            }

            if (!resolveFetch) {
                throw new Error('Expected delegated child provider request before completion.');
            }
            resolveFetch();

            await waitForOrchestratorStatus(caller, profileId, implemented.orchestratorRunId, 'completed');

            const requestBody = requestBodies.at(-1);
            expect(requestBody).toBeDefined();
            if (!requestBody) {
                throw new Error('Expected delegated child provider request body.');
            }

            const contents = extractChatMessageContents(requestBody);
            expect(contents.some((content) => content.includes('Delegated Manual Rule'))).toBe(true);
            expect(contents.some((content) => content.includes('Apply this rule to delegated child runs.'))).toBe(true);
            expect(contents.some((content) => content.includes('Delegated Repo Search'))).toBe(true);
            expect(contents.some((content) => content.includes('Use repository search inside the delegated child lane.'))).toBe(true);
            expect(contents.some((content) => content.includes('Delegated root memory'))).toBe(true);
            expect(contents.some((content) => content.includes('Remember the orchestrator root context.'))).toBe(true);
        },
        15000
    );

    it(
        'keeps delegated child lanes on the base workspace when the orchestrator root is explicitly local',
        async () => {
            const caller = createCaller();
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
                                                    content: 'Delegated local child completed.',
                                                },
                                            },
                                        ],
                                        usage: {
                                            prompt_tokens: 10,
                                            completion_tokens: 8,
                                            total_tokens: 18,
                                        },
                                    }),
                                });
                            };
                        })
                )
            );

            await caller.provider.setApiKey({
                profileId,
                providerId: 'openai',
                apiKey: 'openai-orchestrator-child-local-key',
            });
            insertChatCompletionsTestModel({
                profileId,
                modelId: 'openai/orchestrator-child-local-test',
                label: 'Orchestrator Child Local Test',
            });

            const created = await createSessionInScope(caller, profileId, {
                scope: 'workspace',
                workspaceFingerprint: 'wsf_orchestrator_child_local_propagation',
                title: 'Local root orchestrator thread',
                kind: 'local',
                topLevelTab: 'orchestrator',
            });
            const rootThreadId = requireEntityId(created.thread.id, 'thr', 'Expected local orchestrator root thread id.');
            const configuredThread = await caller.sandbox.configureThread({
                profileId,
                threadId: rootThreadId,
                mode: 'local',
            });
            expect(configuredThread.thread.executionEnvironmentMode).toBe('local');

            const started = await caller.plan.start({
                profileId,
                sessionId: created.session.id,
                topLevelTab: 'orchestrator',
                modeKey: 'plan',
                prompt: 'Delegate one child task from a local root.',
            });
            await caller.plan.answerQuestion({
                profileId,
                planId: started.plan.id,
                questionId: 'scope',
                answer: 'Run one delegated child on the shared base workspace.',
            });
            await caller.plan.answerQuestion({
                profileId,
                planId: started.plan.id,
                questionId: 'constraints',
                answer: 'Do not create or bind a sandbox for the child lane.',
            });
            await caller.plan.revise({
                profileId,
                planId: started.plan.id,
                summaryMarkdown: '# Local Delegation Plan',
                items: [{ description: 'Run one delegated local child.' }],
            });
            await caller.plan.approve({
                profileId,
                planId: started.plan.id,
            });

            const implemented = await caller.plan.implement({
                profileId,
                planId: started.plan.id,
                runtimeOptions: {
                    ...defaultRuntimeOptions,
                    transport: {
                        family: 'openai_chat_completions',
                    },
                },
                providerId: 'openai',
                modelId: 'openai/orchestrator-child-local-test',
            });
            expect(implemented.found).toBe(true);
            if (!implemented.found) {
                throw new Error('Expected local-root orchestrator implementation start.');
            }
            if (implemented.mode !== 'orchestrator.orchestrate') {
                throw new Error('Expected orchestrator mode for local-root child propagation test.');
            }

            let childSessionId: `sess_${string}` | undefined;
            let childThreadId: `thr_${string}` | undefined;
            for (let attempt = 0; attempt < 200; attempt += 1) {
                const status = await caller.orchestrator.status({
                    profileId,
                    orchestratorRunId: implemented.orchestratorRunId,
                });
                if (status.found && status.steps[0]?.status === 'running') {
                    childSessionId = status.steps[0].childSessionId;
                    childThreadId = status.steps[0].childThreadId;
                    break;
                }

                await new Promise((resolve) => setTimeout(resolve, 25));
            }

            expect(childSessionId).toBeDefined();
            expect(childThreadId).toBeDefined();
            if (!childSessionId || !childThreadId) {
                throw new Error('Expected running delegated local child lane.');
            }

            const threadList = await caller.conversation.listThreads({
                profileId,
                activeTab: 'orchestrator',
                showAllModes: false,
                groupView: 'workspace',
            });
            const rootThread = threadList.threads.find((thread) => thread.id === rootThreadId);
            const childThread = threadList.threads.find((thread) => thread.id === childThreadId);
            expect(rootThread?.executionEnvironmentMode).toBe('local');
            expect(rootThread?.sandboxId).toBeUndefined();
            expect(childThread?.executionEnvironmentMode).toBe('local');
            expect(childThread?.sandboxId).toBeUndefined();
            expect(childThread?.workspaceFingerprint).toBe(rootThread?.workspaceFingerprint);

            const sessionList = await caller.session.list({ profileId });
            const childSession = sessionList.sessions.find((session) => session.id === childSessionId);
            expect(childSession?.kind).toBe('local');
            expect(childSession?.sandboxId).toBeUndefined();

            if (!resolveFetch) {
                throw new Error('Expected delegated local child provider request before completion.');
            }
            resolveFetch();

            await waitForOrchestratorStatus(caller, profileId, implemented.orchestratorRunId, 'completed');
        },
        15000
    );

    it(
        'marks orchestrator-backed plans as failed when the orchestrator run is aborted',
        async () => {
        const caller = createCaller();
        const completionFetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
            const signal = init?.signal;
            return new Promise((_resolve, reject) => {
                const rejectAbort = () => {
                    reject(new DOMException('The operation was aborted.', 'AbortError'));
                };

                if (signal?.aborted) {
                    rejectAbort();
                    return;
                }

                signal?.addEventListener('abort', rejectAbort, { once: true });
            });
        });
        vi.stubGlobal('fetch', completionFetchMock);

        await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-orchestrator-abort-test-key',
        });

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'wsf_orchestrator_abort_plan_status',
            title: 'Orchestrator abort lifecycle thread',
            kind: 'local',
            topLevelTab: 'orchestrator',
        });

        const started = await caller.plan.start({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'orchestrator',
            modeKey: 'plan',
            prompt: 'Create one delegated worker that will be aborted.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'scope',
            answer: 'Start one delegated child and abort it while running.',
        });
        await caller.plan.answerQuestion({
            profileId,
            planId: started.plan.id,
            questionId: 'constraints',
            answer: 'Fail closed and reconcile plan state.',
        });
        await caller.plan.revise({
            profileId,
            planId: started.plan.id,
            summaryMarkdown: '# Abort Orchestrator Plan',
            items: [{ description: 'Long-running delegated child' }],
        });
        await caller.plan.approve({
            profileId,
            planId: started.plan.id,
        });

        const implemented = await caller.plan.implement({
            profileId,
            planId: started.plan.id,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(implemented.found).toBe(true);
        if (!implemented.found) {
            throw new Error('Expected orchestrator implementation start for abort test.');
        }
        if (implemented.mode !== 'orchestrator.orchestrate') {
            throw new Error('Expected orchestrator mode for abort test.');
        }

        let observedRunningStep = false;
        for (let attempt = 0; attempt < 200; attempt += 1) {
            const status = await caller.orchestrator.status({
                profileId,
                orchestratorRunId: implemented.orchestratorRunId,
            });
            if (status.found && status.steps.some((step) => step.status === 'running')) {
                expect(
                    status.steps
                        .filter((step) => step.status === 'running')
                        .every((step) => step.childThreadId && step.childSessionId && step.activeRunId)
                ).toBe(true);
                observedRunningStep = true;
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(observedRunningStep).toBe(true);

        const aborted = await caller.orchestrator.abort({
            profileId,
            orchestratorRunId: implemented.orchestratorRunId,
        });
        expect(aborted.aborted).toBe(true);

        await waitForOrchestratorStatus(caller, profileId, implemented.orchestratorRunId, 'aborted');

        const status = await caller.orchestrator.status({
            profileId,
            orchestratorRunId: implemented.orchestratorRunId,
        });
        expect(status.found).toBe(true);
        if (!status.found) {
            throw new Error('Expected orchestrator status after abort.');
        }
        expect(status.steps[0]?.status).toBe('aborted');
        expect(status.steps[0]?.activeRunId).toBeUndefined();

        const planState = await caller.plan.get({
            profileId,
            planId: started.plan.id,
        });
        expect(planState.found).toBe(true);
        if (!planState.found) {
            throw new Error('Expected plan state after orchestrator abort.');
        }
        expect(planState.plan.status).toBe('failed');
        expect(planState.plan.items[0]?.status).toBe('aborted');
        },
        15000
    );
});
