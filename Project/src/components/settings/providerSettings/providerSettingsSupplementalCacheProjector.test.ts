import { describe, expect, it, vi } from 'vitest';

import { projectProviderSettingsSupplementalCache } from '@/web/components/settings/providerSettings/providerSettingsSupplementalCacheProjector';

import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import type { ProviderAccountContextResult } from '@/app/backend/providers/auth/types';
import type { ProviderConnectionProfileResult } from '@/app/backend/providers/service/types';

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

function createAuthState(providerId: ProviderAuthStateRecord['providerId']): ProviderAuthStateRecord {
    return {
        profileId: 'profile_default',
        providerId,
        authMethod: 'api_key',
        authState: 'authenticated',
        updatedAt: '2026-03-30T00:00:00.000Z',
    };
}

describe('projectProviderSettingsSupplementalCache', () => {
    it('patches auth, account, connection, execution, and routing query caches', () => {
        const authStateStore = createSetDataSpy<{ found: boolean; state: ProviderAuthStateRecord }>();
        const accountContextStore = createSetDataSpy<ProviderAccountContextResult>();
        const connectionProfileStore = createSetDataSpy<{ connectionProfile: ProviderConnectionProfileResult }>();
        const executionPreferenceStore = createSetDataSpy<{ executionPreference: ProviderConnectionProfileResult extends never ? never : { providerId: 'openai'; mode: 'standard_http' | 'realtime_websocket'; canUseRealtimeWebSocket: boolean } }>();
        const routingPreferenceStore = createSetDataSpy<{ preference: { profileId: string; providerId: 'kilo'; modelId: string; routingMode: 'dynamic' | 'pinned'; sort?: 'default' | 'price' | 'throughput' | 'latency'; pinnedProviderId?: string } }>();
        const routingProvidersStore = createSetDataSpy<{ providers: Array<{ providerId: string; label: string }> }>();

        const utils = {
            provider: {
                getAuthState: { setData: authStateStore.setData },
                getAccountContext: { setData: accountContextStore.setData },
                getConnectionProfile: { setData: connectionProfileStore.setData },
                getExecutionPreference: { setData: executionPreferenceStore.setData },
                getModelRoutingPreference: { setData: routingPreferenceStore.setData },
                listModelProviders: { setData: routingProvidersStore.setData },
            },
        } as unknown as Parameters<typeof projectProviderSettingsSupplementalCache>[0]['utils'];

        const connectionProfile: ProviderConnectionProfileResult = {
            providerId: 'kilo',
            optionProfileId: 'gateway',
            label: 'Gateway',
            options: [{ value: 'gateway', label: 'Gateway' }],
            resolvedBaseUrl: 'https://kilo.example/v1',
        };

        projectProviderSettingsSupplementalCache({
            utils,
            profileId: 'profile_default',
            providerId: 'kilo',
            authState: createAuthState('kilo'),
            accountContext: {
                profileId: 'profile_default',
                providerId: 'kilo',
                authState: createAuthState('kilo'),
                kiloAccountContext: {
                    profileId: 'profile_default',
                    displayName: 'Acme',
                    emailMasked: 'a***@example.com',
                    authState: 'authenticated',
                    organizations: [],
                    updatedAt: '2026-03-30T00:00:00.000Z',
                },
            },
            connectionProfile,
            routingPreference: {
                profileId: 'profile_default',
                providerId: 'kilo',
                modelId: 'kilo-frontier',
                routingMode: 'dynamic',
                sort: 'price',
            },
            routingProviders: [
                {
                    providerId: 'openai',
                    label: 'OpenAI',
                },
            ],
            routingModelId: 'kilo-frontier',
        });

        expect(authStateStore.read()).toEqual({
            found: true,
            state: createAuthState('kilo'),
        });
        expect(accountContextStore.read()).toEqual({
            profileId: 'profile_default',
            providerId: 'kilo',
            authState: createAuthState('kilo'),
            kiloAccountContext: {
                profileId: 'profile_default',
                displayName: 'Acme',
                emailMasked: 'a***@example.com',
                authState: 'authenticated',
                organizations: [],
                updatedAt: '2026-03-30T00:00:00.000Z',
            },
        });
        expect(connectionProfileStore.read()).toEqual({
            connectionProfile,
        });
        expect(routingPreferenceStore.read()).toEqual({
            preference: {
                profileId: 'profile_default',
                providerId: 'kilo',
                modelId: 'kilo-frontier',
                routingMode: 'dynamic',
                sort: 'price',
            },
        });
        expect(routingProvidersStore.read()).toEqual({
            providers: [
                {
                    providerId: 'openai',
                    label: 'OpenAI',
                },
            ],
        });
    });

    it('patches openai execution preference query data', () => {
        const authStateStore = createSetDataSpy<{ found: boolean; state: ProviderAuthStateRecord }>();
        const executionPreferenceStore = createSetDataSpy<{ executionPreference: { providerId: 'openai'; mode: 'standard_http' | 'realtime_websocket'; canUseRealtimeWebSocket: boolean } }>();

        const utils = {
            provider: {
                getAuthState: { setData: authStateStore.setData },
                getExecutionPreference: { setData: executionPreferenceStore.setData },
            },
        } as unknown as Parameters<typeof projectProviderSettingsSupplementalCache>[0]['utils'];

        projectProviderSettingsSupplementalCache({
            utils,
            profileId: 'profile_default',
            providerId: 'openai',
            authState: createAuthState('openai'),
            executionPreference: {
                providerId: 'openai',
                mode: 'realtime_websocket',
                canUseRealtimeWebSocket: true,
            },
        });

        expect(authStateStore.read()).toEqual({
            found: true,
            state: createAuthState('openai'),
        });
        expect(executionPreferenceStore.read()).toEqual({
            executionPreference: {
                providerId: 'openai',
                mode: 'realtime_websocket',
                canUseRealtimeWebSocket: true,
            },
        });
    });
});
