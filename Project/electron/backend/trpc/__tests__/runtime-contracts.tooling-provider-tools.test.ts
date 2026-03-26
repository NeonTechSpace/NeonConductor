import { describe, expect, it, vi } from 'vitest';

import {
    runtimeContractProfileId,
    registerRuntimeContractHooks,
    createCaller,
    defaultRuntimeOptions,
    getPersistence,
    mkdtempSync,
    os,
    path,
    requireEntityId,
    rmSync,
    waitForRunStatus,
    writeFileSync,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: permissions and tooling', () => {
    const profileId = runtimeContractProfileId;
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
        expect(messages.messages.filter((message) => message.role === 'user')).toHaveLength(1);
        expect(messages.messages.filter((message) => message.role === 'tool')).toHaveLength(1);
        expect(messages.messages.filter((message) => message.role === 'assistant')).toHaveLength(2);
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
                    part.payload['outputText'].includes('native tool loop')
            )
        ).toBe(true);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const secondCallInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
        expect(secondCallInit).toBeDefined();
        const secondCallBody =
            secondCallInit && typeof secondCallInit.body === 'string' ? JSON.parse(secondCallInit.body) : undefined;
        expect(JSON.stringify(secondCallBody)).toContain('function_call_output');
        expect(JSON.stringify(secondCallBody)).toContain('call_readme');

        rmSync(workspacePath, { recursive: true, force: true });
    }, 15_000);

    it('executes provider-native MiniMax-style tool calls through the run loop', async () => {
        const caller = createCaller();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-provider-native-tool-loop-'));
        const originalOpenAIBaseUrl = process.env['OPENAI_BASE_URL'];
        process.env['OPENAI_BASE_URL'] = 'https://api.minimax.io/v1';

        try {
            writeFileSync(path.join(workspacePath, 'README.md'), 'provider native tool loop\n', 'utf8');

            const streamedFrames = [
                {
                    choices: [
                        {
                            delta: {
                                reasoning_details: [
                                    {
                                        type: 'reasoning.text',
                                        text: 'Plan',
                                    },
                                ],
                            },
                        },
                    ],
                },
                {
                    choices: [
                        {
                            delta: {
                                reasoning_details: [
                                    {
                                        type: 'reasoning.text',
                                        text: 'Plan carefully',
                                    },
                                ],
                            },
                        },
                    ],
                },
                {
                    choices: [
                        {
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: 'call_readme',
                                        function: {
                                            name: 'read_file',
                                            arguments: '{"path":"READ',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
                {
                    choices: [
                        {
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        function: {
                                            arguments: 'ME.md"}',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
                {
                    choices: [
                        {
                            delta: {},
                            finish_reason: 'tool_calls',
                        },
                    ],
                },
            ];

            const fetchMock = vi
                .fn()
                .mockResolvedValueOnce(
                    new Response(
                        [
                            ...streamedFrames.flatMap((frame) => [`data: ${JSON.stringify(frame)}`, '']),
                            'data: [DONE]',
                            '',
                        ].join('\n'),
                        {
                            headers: {
                                'content-type': 'text/event-stream',
                            },
                        }
                    )
                )
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'MiniMax native tool loop complete.',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 18,
                            completion_tokens: 7,
                            total_tokens: 25,
                        },
                    }),
                });
            vi.stubGlobal('fetch', fetchMock);

            const configured = await caller.provider.setApiKey({
                profileId,
                providerId: 'openai',
                apiKey: 'openai-provider-native-tool-key',
            });
            expect(configured.success).toBe(true);

            const { sqlite } = getPersistence();
            const now = new Date().toISOString();
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
                                supports_prompt_cache,
                                tool_protocol,
                                api_family,
                                provider_settings_json,
                                input_modalities_json,
                                output_modalities_json,
                                prompt_family,
                                context_length,
                                pricing_json,
                                raw_json,
                                source,
                                updated_at
                            )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `
                )
                .run(
                    profileId,
                    'openai',
                    'openai/minimax-native',
                    'MiniMax Native',
                    'minimax',
                    0,
                    1,
                    1,
                    0,
                    0,
                    0,
                    0,
                    'provider_native',
                    'provider_native',
                    JSON.stringify({ providerNativeId: 'minimax_openai_compat' }),
                    JSON.stringify(['text']),
                    JSON.stringify(['text']),
                    null,
                    128000,
                    '{}',
                    '{}',
                    'test',
                    now
                );

            await caller.profile.setExecutionPreset({
                profileId,
                preset: 'yolo',
            });

            const thread = await caller.conversation.createThread({
                profileId,
                topLevelTab: 'agent',
                scope: 'workspace',
                workspacePath,
                title: 'Provider Native Tool Loop Thread',
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
                throw new Error('Expected workspace fingerprint for provider-native tool loop test.');
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
                prompt: 'Read the README with the provider-native model',
                topLevelTab: 'agent',
                modeKey: 'code',
                workspaceFingerprint: workspaceThread.workspaceFingerprint,
                runtimeOptions: defaultRuntimeOptions,
                providerId: 'openai',
                modelId: 'openai/minimax-native',
            });
            expect(started.accepted).toBe(true);
            if (!started.accepted) {
                throw new Error('Expected provider-native tool loop run to start.');
            }

            await waitForRunStatus(caller, profileId, created.session.id, 'completed');

            const messages = await caller.session.listMessages({
                profileId,
                sessionId: created.session.id,
                runId: started.runId,
            });
            expect(messages.messages.filter((message) => message.role === 'user')).toHaveLength(1);
            expect(messages.messages.filter((message) => message.role === 'tool')).toHaveLength(1);
            expect(messages.messages.filter((message) => message.role === 'assistant')).toHaveLength(2);
            expect(
                messages.messageParts.some(
                    (part) =>
                        part.partType === 'reasoning' &&
                        typeof part.payload['text'] === 'string' &&
                        part.payload['text'].length > 0
                )
            ).toBe(true);
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
                        part.payload['outputText'].includes('provider native tool loop')
                )
            ).toBe(true);

            expect(fetchMock).toHaveBeenCalledTimes(2);
            const secondCallInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
            expect(secondCallInit).toBeDefined();
            const secondCallBody =
                secondCallInit && typeof secondCallInit.body === 'string' ? JSON.parse(secondCallInit.body) : undefined;
            expect(JSON.stringify(secondCallBody)).toContain('tool_call_id');
            expect(JSON.stringify(secondCallBody)).toContain('call_readme');
        } finally {
            if (originalOpenAIBaseUrl === undefined) {
                delete process.env['OPENAI_BASE_URL'];
            } else {
                process.env['OPENAI_BASE_URL'] = originalOpenAIBaseUrl;
            }

            rmSync(workspacePath, { recursive: true, force: true });
        }
    }, 15_000);

    it('executes direct Gemini tool calls through the run loop and preserves synthetic tool ids', async () => {
        const caller = createCaller();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-direct-gemini-tool-loop-'));

        try {
            writeFileSync(path.join(workspacePath, 'README.md'), 'direct gemini tool loop\n', 'utf8');

            const fetchMock = vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        candidates: [
                            {
                                content: {
                                    parts: [
                                        {
                                            text: 'Need to inspect the README first.',
                                            thought: true,
                                            thoughtSignature: 'sig_direct_gemini_1',
                                        },
                                        {
                                            functionCall: {
                                                name: 'read_file',
                                                args: {
                                                    path: 'README.md',
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                        usageMetadata: {
                            promptTokenCount: 14,
                            candidatesTokenCount: 6,
                            totalTokenCount: 20,
                            thoughtsTokenCount: 2,
                        },
                    }),
                    headers: {
                        get: () => 'application/json',
                    },
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        candidates: [
                            {
                                content: {
                                    parts: [
                                        {
                                            text: 'Gemini direct tool loop complete.',
                                        },
                                    ],
                                },
                            },
                        ],
                        usageMetadata: {
                            promptTokenCount: 26,
                            candidatesTokenCount: 8,
                            totalTokenCount: 34,
                        },
                    }),
                    headers: {
                        get: () => 'application/json',
                    },
                });
            vi.stubGlobal('fetch', fetchMock);

            const configured = await caller.provider.setApiKey({
                profileId,
                providerId: 'openai',
                apiKey: 'openai-direct-gemini-tool-key',
            });
            expect(configured.success).toBe(true);

            const connectionProfileUpdated = await caller.provider.setConnectionProfile({
                profileId,
                providerId: 'openai',
                optionProfileId: 'default',
                baseUrlOverride: 'https://generativelanguage.googleapis.com/v1beta',
            });
            expect(connectionProfileUpdated.connectionProfile.resolvedBaseUrl).toBe(
                'https://generativelanguage.googleapis.com/v1beta'
            );

            const { sqlite } = getPersistence();
            const now = new Date().toISOString();
            sqlite
                .prepare(
                    `
                        INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?)
                    `
                )
                .run('openai/gemini-tool-loop', 'openai', 'Gemini Tool Loop', now, now);
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
                                supports_prompt_cache,
                                tool_protocol,
                                api_family,
                                provider_settings_json,
                                input_modalities_json,
                                output_modalities_json,
                                prompt_family,
                                context_length,
                                pricing_json,
                                raw_json,
                                source,
                                updated_at
                            )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `
                )
                .run(
                    profileId,
                    'openai',
                    'openai/gemini-tool-loop',
                    'Gemini Tool Loop',
                    'google',
                    0,
                    1,
                    1,
                    0,
                    0,
                    0,
                    0,
                    'google_generativeai',
                    'google_generativeai',
                    JSON.stringify({ runtime: 'google_generativeai' }),
                    JSON.stringify(['text']),
                    JSON.stringify(['text']),
                    null,
                    200000,
                    '{}',
                    '{}',
                    'test',
                    now
                );

            await caller.profile.setExecutionPreset({
                profileId,
                preset: 'yolo',
            });

            const thread = await caller.conversation.createThread({
                profileId,
                topLevelTab: 'agent',
                scope: 'workspace',
                workspacePath,
                title: 'Direct Gemini Tool Loop Thread',
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
                throw new Error('Expected workspace fingerprint for direct Gemini tool loop test.');
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
                prompt: 'Read the README with direct Gemini',
                topLevelTab: 'agent',
                modeKey: 'code',
                workspaceFingerprint: workspaceThread.workspaceFingerprint,
                runtimeOptions: defaultRuntimeOptions,
                providerId: 'openai',
                modelId: 'openai/gemini-tool-loop',
            });
            expect(started.accepted).toBe(true);
            if (!started.accepted) {
                throw new Error('Expected direct Gemini tool loop run to start.');
            }

            await waitForRunStatus(caller, profileId, created.session.id, 'completed');

            const messages = await caller.session.listMessages({
                profileId,
                sessionId: created.session.id,
                runId: started.runId,
            });
            expect(messages.messages.filter((message) => message.role === 'user')).toHaveLength(1);
            expect(messages.messages.filter((message) => message.role === 'tool')).toHaveLength(1);
            expect(messages.messages.filter((message) => message.role === 'assistant')).toHaveLength(2);

            const toolCallPart = messages.messageParts.find(
                (part) => part.partType === 'tool_call' && part.payload['toolName'] === 'read_file'
            );
            expect(toolCallPart).toBeDefined();
            const syntheticCallId = toolCallPart?.payload['callId'];
            expect(typeof syntheticCallId).toBe('string');
            expect(String(syntheticCallId)).toBe('gemini_call_0');
            expect(
                messages.messageParts.some(
                    (part) =>
                        part.partType === 'tool_result' &&
                        part.payload['callId'] === syntheticCallId &&
                        typeof part.payload['outputText'] === 'string' &&
                        part.payload['outputText'].includes('direct gemini tool loop')
                )
            ).toBe(true);
            expect(
                messages.messageParts.some(
                    (part) =>
                        part.partType === 'reasoning_summary' &&
                        typeof part.payload['text'] === 'string' &&
                        part.payload['text'].includes('Need to inspect')
                )
            ).toBe(true);

            expect(fetchMock).toHaveBeenCalledTimes(2);
            const secondCallInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
            expect(secondCallInit).toBeDefined();
            const secondCallBody =
                secondCallInit && typeof secondCallInit.body === 'string' ? JSON.parse(secondCallInit.body) : undefined;
            expect(JSON.stringify(secondCallBody)).toContain('functionCall');
            expect(JSON.stringify(secondCallBody)).toContain('functionResponse');
            expect(JSON.stringify(secondCallBody)).toContain('read_file');
        } finally {
            rmSync(workspacePath, { recursive: true, force: true });
        }
    }, 15_000);
});
