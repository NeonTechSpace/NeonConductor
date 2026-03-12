import {
    resolvePinnedProviderId,
    selectProviderWithReset,
} from '@/web/components/settings/providerSettings/hooks/providerSettingsState';
import type { ActiveAuthFlow } from '@/web/components/settings/providerSettings/types';

import type { RuntimeProviderId } from '@/shared/contracts';

export function createProviderSettingsActions(input: {
    profileId: string;
    selectedProviderId: RuntimeProviderId | undefined;
    selectedModelId: string;
    apiKeyInput: string;
    activeAuthFlow: ActiveAuthFlow | undefined;
    kiloModelProviderIds: string[];
    kiloRoutingDraft:
        | {
              sort: 'default' | 'price' | 'throughput' | 'latency';
              pinnedProviderId?: string;
          }
        | undefined;
    setSelectedProviderId: (value: RuntimeProviderId) => void;
    setStatusMessage: (value: string | undefined) => void;
    onPreviewProvider: (providerId: RuntimeProviderId) => void;
    mutations: {
        setDefaultMutation: {
            mutateAsync: (input: {
                profileId: string;
                providerId: RuntimeProviderId;
                modelId: string;
            }) => Promise<void>;
        };
        syncCatalogMutation: {
            mutateAsync: (input: { profileId: string; providerId: RuntimeProviderId; force: boolean }) => Promise<void>;
        };
        setModelRoutingPreferenceMutation: {
            mutateAsync: (input: {
                profileId: string;
                providerId: 'kilo';
                modelId: string;
                routingMode: 'dynamic' | 'pinned';
                sort?: 'default' | 'price' | 'throughput' | 'latency';
                pinnedProviderId?: string;
            }) => Promise<void>;
        };
        setEndpointProfileMutation: {
            mutateAsync: (input: { profileId: string; providerId: RuntimeProviderId; value: string }) => Promise<void>;
        };
        setOrganizationMutation: {
            mutateAsync: (input: {
                profileId: string;
                providerId: 'kilo';
                organizationId?: string | null;
            }) => Promise<void>;
        };
        setApiKeyMutation: {
            mutateAsync: (input: { profileId: string; providerId: RuntimeProviderId; apiKey: string }) => Promise<void>;
        };
        startAuthMutation: {
            mutateAsync: (input: {
                profileId: string;
                providerId: RuntimeProviderId;
                method: 'oauth_device' | 'device_code';
            }) => Promise<void>;
        };
        pollAuthMutation: {
            mutateAsync: (input: { profileId: string; providerId: RuntimeProviderId; flowId: string }) => Promise<void>;
        };
        cancelAuthMutation: {
            mutateAsync: (input: { profileId: string; providerId: RuntimeProviderId; flowId: string }) => Promise<void>;
        };
        openExternalUrlMutation: {
            mutateAsync: (input: { url: string }) => Promise<void>;
        };
    };
}) {
    const saveKiloRoutingPreference = async (inputValue: {
        routingMode: 'dynamic' | 'pinned';
        sort?: 'default' | 'price' | 'throughput' | 'latency';
        pinnedProviderId?: string;
    }) => {
        if (!input.selectedModelId.trim()) {
            return;
        }

        await input.mutations.setModelRoutingPreferenceMutation.mutateAsync({
            profileId: input.profileId,
            providerId: 'kilo',
            modelId: input.selectedModelId,
            ...inputValue,
        });
    };

    return {
        selectProvider: (providerId: RuntimeProviderId) => {
            input.onPreviewProvider(providerId);
            selectProviderWithReset({
                providerId,
                setSelectedProviderId: input.setSelectedProviderId,
                setStatusMessage: input.setStatusMessage,
            });
        },
        setDefaultModel: async (modelId?: string) => {
            const nextModelId = modelId ?? input.selectedModelId;
            if (!input.selectedProviderId || !nextModelId) {
                return;
            }

            await input.mutations.setDefaultMutation.mutateAsync({
                profileId: input.profileId,
                providerId: input.selectedProviderId,
                modelId: nextModelId,
            });
        },
        syncCatalog: async () => {
            if (!input.selectedProviderId) {
                return;
            }

            await input.mutations.syncCatalogMutation.mutateAsync({
                profileId: input.profileId,
                providerId: input.selectedProviderId,
                force: true,
            });
        },
        changeRoutingMode: async (mode: 'dynamic' | 'pinned') => {
            if (!input.kiloRoutingDraft) {
                return;
            }

            if (mode === 'dynamic') {
                await saveKiloRoutingPreference({
                    routingMode: 'dynamic',
                    sort: input.kiloRoutingDraft.sort,
                });
                return;
            }

            const pinnedProviderId = resolvePinnedProviderId(
                input.kiloRoutingDraft.pinnedProviderId
                    ? {
                          pinnedProviderId: input.kiloRoutingDraft.pinnedProviderId,
                          availableProviderIds: input.kiloModelProviderIds,
                      }
                    : {
                          availableProviderIds: input.kiloModelProviderIds,
                      }
            );
            if (!pinnedProviderId) {
                input.setStatusMessage('No available providers to pin for this model.');
                return;
            }

            await saveKiloRoutingPreference({
                routingMode: 'pinned',
                sort: 'default',
                pinnedProviderId,
            });
        },
        changeRoutingSort: async (sort: 'default' | 'price' | 'throughput' | 'latency') => {
            await saveKiloRoutingPreference({
                routingMode: 'dynamic',
                sort,
            });
        },
        changePinnedProvider: async (providerId: string) => {
            if (providerId.trim().length === 0) {
                return;
            }

            await saveKiloRoutingPreference({
                routingMode: 'pinned',
                sort: 'default',
                pinnedProviderId: providerId,
            });
        },
        changeEndpointProfile: async (value: string) => {
            if (!input.selectedProviderId) {
                return;
            }

            await input.mutations.setEndpointProfileMutation.mutateAsync({
                profileId: input.profileId,
                providerId: input.selectedProviderId,
                value,
            });
        },
        changeOrganization: async (organizationId?: string) => {
            if (input.selectedProviderId !== 'kilo') {
                return;
            }

            await input.mutations.setOrganizationMutation.mutateAsync({
                profileId: input.profileId,
                providerId: 'kilo',
                ...(organizationId ? { organizationId } : { organizationId: null }),
            });
        },
        saveApiKey: async () => {
            if (!input.selectedProviderId) {
                return;
            }

            await input.mutations.setApiKeyMutation.mutateAsync({
                profileId: input.profileId,
                providerId: input.selectedProviderId,
                apiKey: input.apiKeyInput.trim(),
            });
        },
        startOAuthDevice: async () => {
            if (!input.selectedProviderId) {
                return;
            }

            await input.mutations.startAuthMutation.mutateAsync({
                profileId: input.profileId,
                providerId: input.selectedProviderId,
                method: 'oauth_device',
            });
        },
        startDeviceCode: async () => {
            if (!input.selectedProviderId) {
                return;
            }

            await input.mutations.startAuthMutation.mutateAsync({
                profileId: input.profileId,
                providerId: input.selectedProviderId,
                method: 'device_code',
            });
        },
        pollNow: async () => {
            if (!input.activeAuthFlow) {
                return;
            }

            await input.mutations.pollAuthMutation.mutateAsync({
                profileId: input.profileId,
                providerId: input.activeAuthFlow.providerId,
                flowId: input.activeAuthFlow.flowId,
            });
        },
        cancelFlow: async () => {
            if (!input.activeAuthFlow) {
                return;
            }

            await input.mutations.cancelAuthMutation.mutateAsync({
                profileId: input.profileId,
                providerId: input.activeAuthFlow.providerId,
                flowId: input.activeAuthFlow.flowId,
            });
        },
        openVerificationPage: async () => {
            if (!input.activeAuthFlow?.verificationUri) {
                return;
            }

            await input.mutations.openExternalUrlMutation.mutateAsync({
                url: input.activeAuthFlow.verificationUri,
            });
        },
    };
}
