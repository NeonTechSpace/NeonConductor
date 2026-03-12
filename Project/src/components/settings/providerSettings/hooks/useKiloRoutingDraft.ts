import { useState } from 'react';

import type { KiloRoutingDraft } from '@/web/components/settings/providerSettings/types';

import type { KiloModelProviderInfo, RuntimeProviderId } from '@/shared/contracts';

interface UseKiloRoutingDraftInput {
    profileId: string;
    selectedProviderId: RuntimeProviderId | undefined;
    selectedModelId: string;
    preference:
        | {
              routingMode: 'dynamic' | 'pinned';
              sort?: 'default' | 'price' | 'throughput' | 'latency';
              pinnedProviderId?: string;
          }
        | undefined;
    providerOptions: KiloModelProviderInfo[];
    setStatusMessage: (message: string | undefined) => void;
    savePreference: (
        input:
            | {
                  profileId: string;
                  providerId: 'kilo';
                  modelId: string;
                  routingMode: 'dynamic';
                  sort: 'default' | 'price' | 'throughput' | 'latency';
              }
            | {
                  profileId: string;
                  providerId: 'kilo';
                  modelId: string;
                  routingMode: 'pinned';
                  pinnedProviderId: string;
              }
    ) => Promise<void>;
}

interface OptimisticKiloRoutingDraftState {
    key: string;
    draft: KiloRoutingDraft;
}

function buildDraftKey(input: {
    profileId: string;
    selectedProviderId: RuntimeProviderId | undefined;
    selectedModelId: string;
}): string | undefined {
    if (input.selectedProviderId !== 'kilo' || input.selectedModelId.trim().length === 0) {
        return undefined;
    }

    return `${input.profileId}:${input.selectedModelId.trim()}`;
}

function buildBaseKiloRoutingDraft(input: {
    selectedProviderId: RuntimeProviderId | undefined;
    selectedModelId: string;
    preference: UseKiloRoutingDraftInput['preference'];
}): KiloRoutingDraft | undefined {
    if (input.selectedProviderId !== 'kilo' || input.selectedModelId.trim().length === 0) {
        return undefined;
    }

    if (!input.preference) {
        return {
            routingMode: 'dynamic',
            sort: 'default',
        };
    }

    if (input.preference.routingMode === 'dynamic') {
        return {
            routingMode: 'dynamic',
            sort: input.preference.sort ?? 'default',
        };
    }

    return {
        routingMode: 'pinned',
        sort: 'default',
        ...(input.preference.pinnedProviderId ? { pinnedProviderId: input.preference.pinnedProviderId } : {}),
    };
}

export function useKiloRoutingDraft(input: UseKiloRoutingDraftInput) {
    const [optimisticDraftState, setOptimisticDraftState] = useState<OptimisticKiloRoutingDraftState | undefined>(
        undefined
    );
    const draftKey = buildDraftKey(input);
    const baseDraft = buildBaseKiloRoutingDraft({
        selectedProviderId: input.selectedProviderId,
        selectedModelId: input.selectedModelId,
        preference: input.preference,
    });
    const kiloRoutingDraft =
        draftKey && optimisticDraftState?.key === draftKey ? optimisticDraftState.draft : baseDraft;

    const saveKiloRoutingPreference = async (nextDraft: KiloRoutingDraft): Promise<void> => {
        if (!draftKey || !kiloRoutingDraft || input.selectedProviderId !== 'kilo' || input.selectedModelId.trim().length === 0) {
            return;
        }

        const previousDraft = kiloRoutingDraft;
        setOptimisticDraftState({
            key: draftKey,
            draft: nextDraft,
        });

        try {
            if (nextDraft.routingMode === 'dynamic') {
                await input.savePreference({
                    profileId: input.profileId,
                    providerId: 'kilo',
                    modelId: input.selectedModelId,
                    routingMode: 'dynamic',
                    sort: nextDraft.sort,
                });
            } else {
                if (!nextDraft.pinnedProviderId || nextDraft.pinnedProviderId.trim().length === 0) {
                    input.setStatusMessage('Select a provider before enabling pinned routing.');
                    setOptimisticDraftState({
                        key: draftKey,
                        draft: previousDraft,
                    });
                    return;
                }

                await input.savePreference({
                    profileId: input.profileId,
                    providerId: 'kilo',
                    modelId: input.selectedModelId,
                    routingMode: 'pinned',
                    pinnedProviderId: nextDraft.pinnedProviderId,
                });
            }

            input.setStatusMessage('Kilo routing preference saved.');
            setOptimisticDraftState(undefined);
        } catch {
            input.setStatusMessage('Failed to save Kilo routing preference.');
            setOptimisticDraftState({
                key: draftKey,
                draft: previousDraft,
            });
        }
    };

    return {
        kiloRoutingDraft,
        saveKiloRoutingPreference,
        setKiloRoutingDraft: (nextDraft: KiloRoutingDraft | undefined) => {
            if (!draftKey || !nextDraft) {
                setOptimisticDraftState(undefined);
                return;
            }

            setOptimisticDraftState({
                key: draftKey,
                draft: nextDraft,
            });
        },
    };
}

