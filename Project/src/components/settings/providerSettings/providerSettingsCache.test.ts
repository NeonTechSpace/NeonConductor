import { describe, expect, it, vi } from 'vitest';

import { patchProviderCache } from '@/web/components/settings/providerSettings/providerSettingsCache';

import { kiloFrontierModelId } from '@/shared/kiloModels';

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

describe('patchProviderCache', () => {
    it('preserves explicit empty-catalog state instead of flattening empty sync results to reason null', () => {
        const listModelsStore = createSetDataSpy<{
            models: Array<{ id: string }>;
            reason: 'provider_not_found' | 'catalog_sync_failed' | 'catalog_empty_after_normalization' | null;
            detail?: string;
        }>();
        const shellBootstrapStore = createSetDataSpy<{
            providers: Array<{ id: string }>;
            defaults: { providerId: string; modelId: string };
            specialistDefaults: Array<{
                topLevelTab: 'agent' | 'orchestrator';
                modeKey: 'ask' | 'code' | 'debug' | 'orchestrate';
                providerId: string;
                modelId: string;
            }>;
            providerModels: Array<{ id: string; providerId: string }>;
        }>();

        const utils = {
            provider: {
                listModels: { setData: listModelsStore.setData },
            },
            runtime: {
                getShellBootstrap: { setData: shellBootstrapStore.setData },
            },
        } as unknown as Parameters<typeof patchProviderCache>[0]['utils'];

        shellBootstrapStore.setData(
            { profileId: 'profile_test' },
            {
                providers: [{ id: 'kilo' }],
                defaults: { providerId: 'kilo', modelId: kiloFrontierModelId },
                specialistDefaults: [],
                providerModels: [{ id: kiloFrontierModelId, providerId: 'kilo' }],
            }
        );

        patchProviderCache({
            utils,
            profileId: 'profile_test',
            providerId: 'kilo',
            models: [],
            catalogStateReason: 'catalog_empty_after_normalization',
        });

        expect(listModelsStore.read()).toEqual({
            models: [],
            reason: 'catalog_empty_after_normalization',
        });
    });
});
