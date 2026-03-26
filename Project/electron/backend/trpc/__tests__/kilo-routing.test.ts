import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import { kiloModelsByProviderLivePayload } from '@/app/backend/trpc/__tests__/fixtures/kiloModelsByProviderLivePayload';
import type { Context } from '@/app/backend/trpc/context';
import { appRouter } from '@/app/backend/trpc/router';

import type { EntityId } from '@/shared/contracts';

function createCaller() {
    const context: Context = {
        senderId: 1,
        win: null,
        requestId: 'test-request-id',
        correlationId: 'test-correlation-id',
    };

    return appRouter.createCaller(context);
}

const defaultRuntimeOptions = {
    reasoning: {
        effort: 'medium' as const,
        summary: 'auto' as const,
        includeEncrypted: true,
    },
    cache: {
        strategy: 'auto' as const,
    },
    transport: {
        family: 'auto' as const,
    },
};

function isEntityId<P extends string>(value: string, prefix: P): value is `${P}_${string}` {
    return value.startsWith(`${prefix}_`) && value.length > prefix.length + 1;
}

async function createSession(caller: ReturnType<typeof createCaller>, profileId: string): Promise<EntityId<'sess'>> {
    const threadResult = await caller.conversation.createThread({
        profileId,
        scope: 'detached',
        title: 'Kilo Routing Test Thread',
    });
    if (!isEntityId(threadResult.thread.id, 'thr')) {
        throw new Error('Expected thread id with "thr_" prefix.');
    }

    const sessionResult = await caller.session.create({
        profileId,
        threadId: threadResult.thread.id,
        kind: 'local',
    });
    if (!sessionResult.created) {
        throw new Error(`Expected session creation success, received "${sessionResult.reason}".`);
    }
    if (!isEntityId(sessionResult.session.id, 'sess')) {
        throw new Error('Expected session id with "sess_" prefix.');
    }

    return sessionResult.session.id;
}

async function waitForRunCompleted(
    caller: ReturnType<typeof createCaller>,
    profileId: string,
    sessionId: EntityId<'sess'>
): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const status = await caller.session.status({ profileId, sessionId });
        if (status.found && status.session.runStatus === 'completed') {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 15));
    }

    throw new Error('Timed out waiting for completed run status.');
}

beforeEach(() => {
    resetPersistenceForTests();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('kilo routing', () => {
    const profileId = getDefaultProfileId();

    it('accepts live-style models-by-provider payload and exposes provider rows for selected model', async () => {
        const caller = createCaller();
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
                                    id: 'openai/gpt-5',
                                    name: 'GPT-5',
                                    owned_by: 'openai',
                                    context_length: 128000,
                                    supported_parameters: ['tools', 'reasoning'],
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

                if (url.endsWith('/providers')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [{ id: 'openai', label: 'OpenAI' }],
                        }),
                    });
                }

                if (url.endsWith('/models-by-provider')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => kiloModelsByProviderLivePayload,
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

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'kilo-test-api-key',
        });
        expect(configured.success).toBe(true);

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'kilo',
        });
        expect(syncResult.ok).toBe(true);

        const providers = await caller.provider.listModelProviders({
            profileId,
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
        });
        expect(providers.providers.length).toBe(1);
        expect(providers.providers[0]).toMatchObject({
            providerId: 'openai',
            label: 'OpenAI',
            inputPrice: 0.000001,
            outputPrice: 0.000003,
            cacheReadPrice: 0.0000002,
            cacheWritePrice: 0.0000005,
            contextLength: 128000,
            maxCompletionTokens: 4096,
        });
    });

    it('enforces kilo-only routing boundaries and rejects invalid routing combinations', async () => {
        const caller = createCaller();

        await expect(
            caller.provider.getModelRoutingPreference({
                profileId,
                providerId: 'openai' as unknown as 'kilo',
                modelId: 'openai/gpt-5',
            })
        ).rejects.toThrow('routing preferences are supported only for "kilo"');

        await expect(
            caller.provider.setModelRoutingPreference({
                profileId,
                providerId: 'kilo',
                modelId: 'openai/gpt-5',
                routingMode: 'dynamic',
                sort: 'latency',
                pinnedProviderId: 'openai',
            } as unknown as Parameters<typeof caller.provider.setModelRoutingPreference>[0])
        ).rejects.toThrow('not allowed when routingMode is "dynamic"');

        await expect(
            caller.provider.setModelRoutingPreference({
                profileId,
                providerId: 'kilo',
                modelId: 'openai/gpt-5',
                routingMode: 'pinned',
            } as unknown as Parameters<typeof caller.provider.setModelRoutingPreference>[0])
        ).rejects.toThrow('required when routingMode is "pinned"');
    });

    it('returns not-found errors for missing kilo models through the service boundary', async () => {
        const caller = createCaller();

        await expect(
            caller.provider.getModelRoutingPreference({
                profileId,
                providerId: 'kilo',
                modelId: 'openai/does-not-exist',
            })
        ).rejects.toThrow('Model "openai/does-not-exist" is not available for provider "kilo".');

        await expect(
            caller.provider.listModelProviders({
                profileId,
                providerId: 'kilo',
                modelId: 'openai/does-not-exist',
            })
        ).rejects.toThrow('Model "openai/does-not-exist" is not available for provider "kilo".');
    });

    it('maps dynamic and pinned routing preferences into Kilo runtime provider request envelope', async () => {
        const caller = createCaller();
        const requestBodies: Record<string, unknown>[] = [];

        vi.stubGlobal(
            'fetch',
            vi.fn((url: string, init?: RequestInit) => {
                if (url.endsWith('/models')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [
                                {
                                    id: 'openai/gpt-5',
                                    name: 'GPT-5',
                                    owned_by: 'openai',
                                    context_length: 128000,
                                    supported_parameters: ['tools', 'reasoning'],
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

                if (url.endsWith('/providers')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [{ id: 'openai', label: 'OpenAI' }],
                        }),
                    });
                }

                if (url.endsWith('/models-by-provider')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => kiloModelsByProviderLivePayload,
                    });
                }

                if (url.endsWith('/chat/completions')) {
                    const body = init?.body;
                    if (typeof body === 'string') {
                        requestBodies.push(JSON.parse(body) as Record<string, unknown>);
                    }
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            choices: [
                                {
                                    message: {
                                        content: 'ok',
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
                }

                return Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    json: () => ({}),
                });
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'kilo-test-api-key',
        });
        expect(configured.success).toBe(true);

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'kilo',
        });
        expect(syncResult.ok).toBe(true);

        const sessionId = await createSession(caller, profileId);

        await caller.provider.setModelRoutingPreference({
            profileId,
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
            routingMode: 'dynamic',
            sort: 'latency',
        });
        const dynamicRun = await caller.session.startRun({
            profileId,
            sessionId,
            prompt: 'dynamic latency',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
        });
        expect(dynamicRun.accepted).toBe(true);
        await waitForRunCompleted(caller, profileId, sessionId);

        await caller.provider.setModelRoutingPreference({
            profileId,
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
            routingMode: 'pinned',
            pinnedProviderId: 'openai',
        });
        const pinnedRun = await caller.session.startRun({
            profileId,
            sessionId,
            prompt: 'pinned provider',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
        });
        expect(pinnedRun.accepted).toBe(true);
        await waitForRunCompleted(caller, profileId, sessionId);

        expect(requestBodies.length).toBeGreaterThanOrEqual(2);

        const dynamicBody = requestBodies[0];
        expect(dynamicBody?.['provider']).toMatchObject({
            sort: 'latency',
        });

        const pinnedBody = requestBodies[1];
        expect(pinnedBody?.['provider']).toMatchObject({
            order: ['openai'],
            only: ['openai'],
            allow_fallbacks: false,
        });
    });
});

