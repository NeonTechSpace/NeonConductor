import { describe, expect, it, vi } from 'vitest';

import { projectProviderSettingsControlPlaneCache } from '@/web/components/settings/providerSettings/providerSettingsControlPlaneCacheProjector';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderControlSnapshot, ProviderListItem } from '@/app/backend/providers/service/types';
import type { RuntimeProviderId } from '@/shared/contracts';

function createSetDataSpy<T>() {
    let current: T | undefined;
    const setData = vi.fn((_input: unknown, next: T | ((value: T | undefined) => T | undefined)) => {
        current = typeof next === 'function' ? (next as (value: T | undefined) => T | undefined)(current) : next;
        return current;
    });

    return {
        setData,
        read: () => current,
    };
}

function createProvider(id: RuntimeProviderId, overrides?: Partial<ProviderListItem>): ProviderListItem {
    return {
        id,
        label: id === 'openai' ? 'OpenAI' : 'Kilo',
        supportsByok: true,
        isDefault: id === 'openai',
        authState: 'logged_out',
        authMethod: 'api_key',
        availableAuthMethods: ['api_key'],
        connectionProfile: {
            providerId: id,
            optionProfileId: 'default',
            label: 'Default',
            options: [{ value: 'default', label: 'Default' }],
            resolvedBaseUrl: null,
        },
        apiKeyCta: { label: 'Create key', url: 'https://example.com' },
        features: {
            catalogStrategy: 'static',
            supportsKiloRouting: id === 'kilo',
            supportsModelProviderListing: false,
            supportsConnectionOptions: false,
            supportsCustomBaseUrl: true,
            supportsOrganizationScope: id === 'kilo',
        },
        ...overrides,
    };
}

function createModel(id: string, providerId: RuntimeProviderId): ProviderModelRecord {
    return {
        id,
        providerId,
        label: id,
        features: {} as ProviderModelRecord['features'],
        runtime: {} as ProviderModelRecord['runtime'],
    };
}

describe('projectProviderSettingsControlPlaneCache', () => {
    it('patches the control-plane surfaces and shell bootstrap together', () => {
        const provider = createProvider('openai', {
            label: 'OpenAI Updated',
            authState: 'authenticated',
            authMethod: 'api_key',
            connectionProfile: {
                providerId: 'openai',
                optionProfileId: 'gateway',
                label: 'Gateway',
                options: [{ value: 'gateway', label: 'Gateway' }],
                baseUrlOverride: 'https://gateway.example/v1',
                resolvedBaseUrl: 'https://gateway.example/v1',
            },
            executionPreference: {
                providerId: 'openai',
                mode: 'realtime_websocket',
                canUseRealtimeWebSocket: true,
            },
        });
        const listProvidersStore = createSetDataSpy<{
            providers: ProviderListItem[];
        }>();
        const defaultsStore = createSetDataSpy<{
            defaults: { providerId: string; modelId: string };
            specialistDefaults: Array<{
                topLevelTab: 'agent' | 'orchestrator';
                modeKey: 'ask' | 'code' | 'debug' | 'orchestrate';
                providerId: string;
                modelId: string;
            }>;
        }>();
        const controlPlaneStore = createSetDataSpy<{ providerControl: ProviderControlSnapshot }>();
        const listModelsStore = createSetDataSpy<{
            models: ProviderModelRecord[];
            reason: 'provider_not_found' | 'catalog_sync_failed' | 'catalog_empty_after_normalization' | null;
            detail?: string;
        }>();
        const shellBootstrapStore = createSetDataSpy<{
            providerControl: ProviderControlSnapshot;
        }>();

        const utils = {
            provider: {
                listProviders: { setData: listProvidersStore.setData },
                getDefaults: { setData: defaultsStore.setData },
                getControlPlane: { setData: controlPlaneStore.setData },
                listModels: { setData: listModelsStore.setData },
            },
            runtime: {
                getShellBootstrap: { setData: shellBootstrapStore.setData },
            },
        } as unknown as Parameters<typeof projectProviderSettingsControlPlaneCache>[0]['utils'];

        const controlPlane: ProviderControlSnapshot = {
            entries: [
                {
                    provider: createProvider('openai'),
                    models: [createModel('openai/gpt-4o-mini', 'openai')],
                    catalogState: { reason: null, invalidModelCount: 0 },
                },
                {
                    provider: createProvider('kilo'),
                    models: [],
                    catalogState: { reason: 'catalog_empty_after_normalization', invalidModelCount: 2 },
                },
            ],
            defaults: { providerId: 'openai', modelId: 'openai/gpt-4o-mini' },
            specialistDefaults: [],
        };
        controlPlaneStore.setData({ profileId: 'profile_default' }, { providerControl: controlPlane });
        shellBootstrapStore.setData({ profileId: 'profile_default' }, { providerControl: controlPlane });
        listProvidersStore.setData({ profileId: 'profile_default' }, {
            providers: [createProvider('openai'), createProvider('kilo')],
        });
        defaultsStore.setData(
            { profileId: 'profile_default' },
            {
                defaults: { providerId: 'openai', modelId: 'openai/gpt-4o-mini' },
                specialistDefaults: [],
            }
        );

        projectProviderSettingsControlPlaneCache({
            utils,
            profileId: 'profile_default',
            providerId: 'openai',
            provider,
            defaults: { providerId: 'openai', modelId: 'openai/gpt-5' },
            specialistDefaults: [
                {
                    topLevelTab: 'agent',
                    modeKey: 'ask',
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                },
            ],
            models: [],
            catalogStateReason: 'catalog_empty_after_normalization',
            catalogStateDetail: 'No usable models remain after filtering.',
            authState: {
                profileId: 'profile_default',
                providerId: 'openai',
                authMethod: 'api_key',
                authState: 'authenticated',
                updatedAt: '2026-03-30T00:00:00.000Z',
            },
            connectionProfile: provider.connectionProfile,
            executionPreference: provider.executionPreference,
        });

        expect(listProvidersStore.read()).toEqual({
            providers: [
                expect.objectContaining({
                    id: 'openai',
                    label: 'OpenAI Updated',
                    authState: 'authenticated',
                    authMethod: 'api_key',
                }),
                createProvider('kilo'),
            ],
        });
        expect(defaultsStore.read()).toEqual({
            defaults: { providerId: 'openai', modelId: 'openai/gpt-5' },
            specialistDefaults: [
                {
                    topLevelTab: 'agent',
                    modeKey: 'ask',
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                },
            ],
        });
        expect(controlPlaneStore.read()).toEqual({
            providerControl: {
                entries: [
                    expect.objectContaining({
                        provider: expect.objectContaining({
                            id: 'openai',
                            label: 'OpenAI Updated',
                            authState: 'authenticated',
                            connectionProfile: provider.connectionProfile,
                            executionPreference: provider.executionPreference,
                            isDefault: true,
                        }),
                        models: [],
                        catalogState: {
                            reason: 'catalog_empty_after_normalization',
                            detail: 'No usable models remain after filtering.',
                            invalidModelCount: 0,
                        },
                    }),
                    expect.objectContaining({
                        provider: expect.objectContaining({
                            id: 'kilo',
                            isDefault: false,
                        }),
                        catalogState: { reason: 'catalog_empty_after_normalization', invalidModelCount: 2 },
                    }),
                ],
                defaults: { providerId: 'openai', modelId: 'openai/gpt-5' },
                specialistDefaults: [
                    {
                        topLevelTab: 'agent',
                        modeKey: 'ask',
                        providerId: 'openai',
                        modelId: 'openai/gpt-5',
                    },
                ],
            },
        });
        expect(listModelsStore.read()).toEqual({
            models: [],
            reason: 'catalog_empty_after_normalization',
            detail: 'No usable models remain after filtering.',
        });
        expect(shellBootstrapStore.read()).toEqual({
            providerControl: {
                entries: [
                    expect.objectContaining({
                        provider: expect.objectContaining({
                            id: 'openai',
                            label: 'OpenAI Updated',
                        }),
                    }),
                    expect.objectContaining({
                        provider: expect.objectContaining({
                            id: 'kilo',
                        }),
                    }),
                ],
                defaults: { providerId: 'openai', modelId: 'openai/gpt-5' },
                specialistDefaults: [
                    {
                        topLevelTab: 'agent',
                        modeKey: 'ask',
                        providerId: 'openai',
                        modelId: 'openai/gpt-5',
                    },
                ],
            },
        });
    });
});
