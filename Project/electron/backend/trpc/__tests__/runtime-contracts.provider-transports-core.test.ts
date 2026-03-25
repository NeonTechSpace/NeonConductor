import { describe, expect, it, vi } from 'vitest';

import { providerMetadataOrchestrator } from '@/app/backend/providers/metadata/orchestrator';
import {
    providerCatalogStore,
    runtimeContractProfileId,
    registerRuntimeContractHooks,
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    waitForRunStatus,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: provider and account flows', () => {
    const profileId = runtimeContractProfileId;
    it('refreshes the Kilo catalog during shell bootstrap after app startup', async () => {
        const caller = createCaller();

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'kilo-startup-refresh-key',
        });
        expect(configured.success).toBe(true);

        await providerCatalogStore.replaceModels(profileId, 'kilo', [
            {
                modelId: 'stale/startup-model',
                label: 'Stale Startup Model',
                upstreamProvider: 'openai',
                isFree: false,
                features: {
                    supportsTools: true,
                    supportsReasoning: true,
                    supportsVision: false,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                },
                runtime: {
                    toolProtocol: 'kilo_gateway',
                    apiFamily: 'kilo_gateway',
                    routedApiFamily: 'openai_compatible',
                },
                pricing: {},
                raw: {},
                source: 'test',
            },
        ]);
        await providerMetadataOrchestrator.flushProviderScope(profileId, 'kilo');

        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                if (url.endsWith('/models')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [
                                {
                                    id: 'moonshotai/kimi-k2.5',
                                    name: 'Kimi K2.5',
                                    owned_by: 'moonshotai',
                                    context_length: 200000,
                                    supported_parameters: ['tools'],
                                    architecture: {
                                        input_modalities: ['text'],
                                        output_modalities: ['text'],
                                    },
                                    pricing: {},
                                },
                            ],
                        }),
                    });
                }

                if (url.endsWith('/providers') || url.endsWith('/models-by-provider')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [],
                        }),
                    });
                }

                return Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    json: () => ({}),
                });
            })
        );

        const shellBootstrap = await caller.runtime.getShellBootstrap({ profileId });
        expect(shellBootstrap.providerModels.some((model) => model.id === 'moonshotai/kimi-k2.5')).toBe(true);
        expect(shellBootstrap.providerModels.some((model) => model.id === 'stale/startup-model')).toBe(false);
    });

    it('persists the resolved native transport selected from model protocol metadata', async () => {
        const caller = createCaller();
        const fetchMock = vi.fn((url: string) => {
            if (url.includes('/responses')) {
                return Promise.resolve({
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
                                        text: 'Responses protocol path',
                                    },
                                ],
                            },
                        ],
                        usage: {
                            input_tokens: 10,
                            output_tokens: 12,
                            total_tokens: 22,
                        },
                    }),
                });
            }

            if (url.includes('/chat/completions')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'Chat completions protocol path',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 10,
                            completion_tokens: 12,
                            total_tokens: 22,
                        },
                    }),
                });
            }

            return Promise.resolve({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                json: () => ({}),
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-protocol-key',
        });
        expect(configured.success).toBe(true);

        const openAiSession = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Responses protocol thread',
            kind: 'local',
        });
        const openAiStart = await caller.session.startRun({
            profileId,
            sessionId: openAiSession.session.id,
            prompt: 'Use responses protocol',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(openAiStart.accepted).toBe(true);
        if (!openAiStart.accepted) {
            throw new Error('Expected OpenAI run to start.');
        }
        await waitForRunStatus(caller, profileId, openAiSession.session.id, 'completed');
        const openAiRuns = await caller.session.listRuns({
            profileId,
            sessionId: openAiSession.session.id,
        });
        expect(openAiRuns.runs[0]?.transport?.selected).toBe('openai_responses');

        const moonshotConfigured = await caller.provider.setApiKey({
            profileId,
            providerId: 'moonshot',
            apiKey: 'moonshot-protocol-key',
        });
        expect(moonshotConfigured.success).toBe(true);

        const moonshotSession = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Chat completions protocol thread',
            kind: 'local',
        });
        const moonshotStart = await caller.session.startRun({
            profileId,
            sessionId: moonshotSession.session.id,
            prompt: 'Use chat completions protocol',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'moonshot',
            modelId: 'moonshot/kimi-latest',
        });
        expect(moonshotStart.accepted).toBe(true);
        if (!moonshotStart.accepted) {
            throw new Error('Expected Moonshot run to start.');
        }
        await waitForRunStatus(caller, profileId, moonshotSession.session.id, 'completed');
        const moonshotRuns = await caller.session.listRuns({
            profileId,
            sessionId: moonshotSession.session.id,
        });
        expect(moonshotRuns.runs[0]?.transport?.selected).toBe('openai_chat_completions');
    });

});
