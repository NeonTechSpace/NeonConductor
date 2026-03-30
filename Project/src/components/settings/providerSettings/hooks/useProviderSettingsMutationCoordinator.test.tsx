import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    patchProviderCacheMock,
    trpcMocks,
    utilsMock,
} = vi.hoisted(() => {
    const createInvalidateMock = () => vi.fn();
    const createSetDataMock = () => vi.fn();
    const createMutationResult = () => ({
        mutateAsync: vi.fn().mockResolvedValue(undefined),
        isPending: false,
        error: null,
    });
    type MutationConfig = {
        onSuccess?: (...args: any[]) => void;
        onError?: (...args: any[]) => void;
    };

    const createUseMutationMock = (mutationName: string) => {
        const result = createMutationResult();
        const useMutation = vi.fn((config: MutationConfig) => {
            mutationConfigs[mutationName] = config;
            return result;
        });

        return {
            useMutation,
            result,
        };
    };

    const mutationConfigs: Record<string, MutationConfig> = {};

    return {
        patchProviderCacheMock: vi.fn(),
        trpcMocks: {
            mutationConfigs,
            provider: {
                setDefault: createUseMutationMock('setDefault'),
                setApiKey: createUseMutationMock('setApiKey'),
                setConnectionProfile: createUseMutationMock('setConnectionProfile'),
                syncCatalog: createUseMutationMock('syncCatalog'),
                setExecutionPreference: createUseMutationMock('setExecutionPreference'),
                setModelRoutingPreference: createUseMutationMock('setModelRoutingPreference'),
                setOrganization: createUseMutationMock('setOrganization'),
                startAuth: createUseMutationMock('startAuth'),
                pollAuth: createUseMutationMock('pollAuth'),
                cancelAuth: createUseMutationMock('cancelAuth'),
                getAuthState: { fetch: vi.fn(), setData: createSetDataMock() },
                getCredentialSummary: { invalidate: createInvalidateMock() },
                getCredentialValue: { invalidate: createInvalidateMock() },
                getOpenAISubscriptionUsage: { invalidate: createInvalidateMock() },
                getOpenAISubscriptionRateLimits: { invalidate: createInvalidateMock() },
                getAccountContext: { invalidate: createInvalidateMock() },
            },
            runtime: {
                getShellBootstrap: { invalidate: createInvalidateMock() },
            },
            system: {
                openExternalUrl: createUseMutationMock('openExternalUrl'),
            },
        },
        utilsMock: {
            provider: {
                getAuthState: {
                    setData: createSetDataMock(),
                    fetch: vi.fn(),
                },
                getCredentialSummary: { invalidate: createInvalidateMock() },
                getCredentialValue: { invalidate: createInvalidateMock() },
                getOpenAISubscriptionUsage: { invalidate: createInvalidateMock() },
                getOpenAISubscriptionRateLimits: { invalidate: createInvalidateMock() },
                getAccountContext: { invalidate: createInvalidateMock() },
                setDefault: undefined,
                setApiKey: undefined,
            },
            runtime: {
                getShellBootstrap: { invalidate: createInvalidateMock() },
            },
        },
    };
});

vi.mock('@/web/components/settings/providerSettings/providerSettingsCache', () => ({
    patchProviderCache: patchProviderCacheMock,
}));

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: () => utilsMock as never,
        provider: {
            setDefault: trpcMocks.provider.setDefault,
            setApiKey: trpcMocks.provider.setApiKey,
            setConnectionProfile: trpcMocks.provider.setConnectionProfile,
            syncCatalog: trpcMocks.provider.syncCatalog,
            setExecutionPreference: trpcMocks.provider.setExecutionPreference,
            setModelRoutingPreference: trpcMocks.provider.setModelRoutingPreference,
            setOrganization: trpcMocks.provider.setOrganization,
            startAuth: trpcMocks.provider.startAuth,
            pollAuth: trpcMocks.provider.pollAuth,
            cancelAuth: trpcMocks.provider.cancelAuth,
            getAuthState: trpcMocks.provider.getAuthState,
            getCredentialSummary: trpcMocks.provider.getCredentialSummary,
            getCredentialValue: trpcMocks.provider.getCredentialValue,
            getOpenAISubscriptionUsage: trpcMocks.provider.getOpenAISubscriptionUsage,
            getOpenAISubscriptionRateLimits: trpcMocks.provider.getOpenAISubscriptionRateLimits,
            getAccountContext: trpcMocks.provider.getAccountContext,
        },
        runtime: {
            getShellBootstrap: trpcMocks.runtime.getShellBootstrap,
        },
        system: {
            openExternalUrl: trpcMocks.system.openExternalUrl,
        },
    },
}));

import { useProviderSettingsMutationCoordinator } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsMutationCoordinator';
import type { ActiveAuthFlow } from '@/web/components/settings/providerSettings/types';

function renderCoordinator(input: {
    profileId: string;
    selectedProviderId: 'openai' | 'openai_codex' | 'kilo' | undefined;
    setStatusMessage: (value: string | undefined) => void;
    setActiveAuthFlow: (value: ActiveAuthFlow | undefined) => void;
}) {
    let returnedValue:
        | ReturnType<typeof useProviderSettingsMutationCoordinator>
        | undefined;

    function Harness() {
        returnedValue = useProviderSettingsMutationCoordinator(input);
        return null;
    }

    renderToStaticMarkup(<Harness />);
    return returnedValue;
}

function getMutationConfig(name: keyof typeof trpcMocks.mutationConfigs) {
    return trpcMocks.mutationConfigs[name]!;
}

describe('useProviderSettingsMutationCoordinator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const key of Object.keys(trpcMocks.mutationConfigs)) {
            delete trpcMocks.mutationConfigs[key];
        }
    });

    it('keeps API key, codex, and shell-bootstrap follow-up behavior stable', () => {
        const setStatusMessage = vi.fn();
        const setActiveAuthFlow = vi.fn();
        renderCoordinator({
            profileId: 'profile_default',
            selectedProviderId: 'openai_codex',
            setStatusMessage,
            setActiveAuthFlow,
        });

        getMutationConfig('setApiKey').onSuccess?.(
            {
                success: true,
                state: {
                    profileId: 'profile_default',
                    providerId: 'openai_codex',
                    authMethod: 'oauth_device',
                    authState: 'authenticated',
                    updatedAt: '2026-03-30T12:00:00.000Z',
                },
            },
            {
                profileId: 'profile_default',
                providerId: 'openai_codex',
            }
        );

        expect(setStatusMessage).toHaveBeenCalledWith('API key saved. Provider is ready.');
        expect(patchProviderCacheMock).toHaveBeenCalledWith(
            expect.objectContaining({
                profileId: 'profile_default',
                providerId: 'openai_codex',
                authState: expect.objectContaining({ authState: 'authenticated' }),
            })
        );
        expect(utilsMock.provider.getCredentialSummary.invalidate).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'openai_codex',
        });
        expect(utilsMock.provider.getCredentialValue.invalidate).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'openai_codex',
        });
        expect(utilsMock.provider.getOpenAISubscriptionUsage.invalidate).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
        expect(utilsMock.provider.getOpenAISubscriptionRateLimits.invalidate).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
        expect(utilsMock.runtime.getShellBootstrap.invalidate).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
    });

    it('keeps Kilo auth polling pending locally and triggers post-auth sync on completion', () => {
        const setStatusMessage = vi.fn();
        const setActiveAuthFlow = vi.fn();
        renderCoordinator({
            profileId: 'profile_default',
            selectedProviderId: 'kilo',
            setStatusMessage,
            setActiveAuthFlow,
        });

        getMutationConfig('pollAuth').onSuccess?.(
            {
                flow: {
                    status: 'pending',
                },
                state: {
                    profileId: 'profile_default',
                    providerId: 'kilo',
                    authMethod: 'device_code',
                    authState: 'pending',
                    updatedAt: '2026-03-30T12:00:00.000Z',
                },
            },
            {
                profileId: 'profile_default',
                providerId: 'kilo',
                flowId: 'flow_123',
            }
        );

        expect(setStatusMessage).toHaveBeenCalledWith('Waiting for authorization confirmation...');
        expect(setActiveAuthFlow).not.toHaveBeenCalled();

        getMutationConfig('pollAuth').onSuccess?.(
            {
                flow: {
                    status: 'complete',
                },
                state: {
                    profileId: 'profile_default',
                    providerId: 'kilo',
                    authMethod: 'device_code',
                    authState: 'authenticated',
                    updatedAt: '2026-03-30T12:00:00.000Z',
                },
            },
            {
                profileId: 'profile_default',
                providerId: 'kilo',
                flowId: 'flow_123',
            }
        );

        expect(setStatusMessage).toHaveBeenCalledWith('Auth flow complete. State: authenticated.');
        expect(setActiveAuthFlow).toHaveBeenCalledWith(undefined);
        expect(patchProviderCacheMock).toHaveBeenCalledWith(
            expect.objectContaining({
                profileId: 'profile_default',
                providerId: 'kilo',
                authState: expect.objectContaining({ authState: 'authenticated' }),
            })
        );
        expect(utilsMock.provider.getAccountContext.invalidate).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'kilo',
        });
        expect(utilsMock.provider.getCredentialSummary.invalidate).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'kilo',
        });
        expect(utilsMock.provider.getCredentialValue.invalidate).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'kilo',
        });
        expect(trpcMocks.provider.syncCatalog.result.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'kilo',
            force: true,
        });
        expect(utilsMock.runtime.getShellBootstrap.invalidate).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
    });

    it('keeps OpenAI execution preference and organization fallout stable', () => {
        const setStatusMessage = vi.fn();
        const setActiveAuthFlow = vi.fn();
        renderCoordinator({
            profileId: 'profile_default',
            selectedProviderId: 'openai',
            setStatusMessage,
            setActiveAuthFlow,
        });

        getMutationConfig('setExecutionPreference').onSuccess?.(
            {
                executionPreference: {
                    providerId: 'openai',
                    mode: 'realtime_websocket',
                    canUseRealtimeWebSocket: true,
                },
                provider: {
                    id: 'openai',
                },
            },
            undefined
        );

        expect(setStatusMessage).toHaveBeenCalledWith(
            'Realtime WebSocket enabled for OpenAI agent and orchestrator runs.'
        );
        expect(patchProviderCacheMock).toHaveBeenCalledWith(
            expect.objectContaining({
                profileId: 'profile_default',
                providerId: 'openai',
                executionPreference: expect.objectContaining({ mode: 'realtime_websocket' }),
            })
        );
        expect(utilsMock.runtime.getShellBootstrap.invalidate).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });

        getMutationConfig('setOrganization').onSuccess?.(
            {
                authState: {
                    profileId: 'profile_default',
                    providerId: 'kilo',
                    authMethod: 'device_code',
                    authState: 'authenticated',
                    updatedAt: '2026-03-30T12:00:00.000Z',
                },
                defaults: {
                    providerId: 'kilo',
                    modelId: 'kilo/frontier',
                },
                models: [],
                accountContext: {
                    organizationId: 'org_123',
                },
            },
            undefined
        );

        expect(setStatusMessage).toHaveBeenCalledWith('Kilo organization updated.');
    });
});
