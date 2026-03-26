import { useState } from 'react';

import type { ThreadEntryDraftState } from '@/web/components/conversation/sidebar/sidebarTypes';
import { resolveThreadDraftDefaults } from '@/web/components/conversation/sidebar/threadDraftDefaults';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';
import type { WorkspacePreferenceRecord } from '@/shared/contracts/types/runtime';


interface UseThreadEntryDraftStateInput {
    preferredWorkspaceFingerprint: string | undefined;
    workspacePreferences: WorkspacePreferenceRecord[];
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
}

export function useThreadEntryDraftState(input: UseThreadEntryDraftStateInput) {
    const [inlineThreadDraft, setInlineThreadDraft] = useState<ThreadEntryDraftState | undefined>(undefined);

    const startInlineThreadDraft = (workspaceFingerprint: string | undefined) => {
        if (!workspaceFingerprint) {
            return;
        }

        setInlineThreadDraft(
            buildThreadEntryDraftState({
                workspaceFingerprint,
                workspacePreferences: input.workspacePreferences,
                providers: input.providers,
                providerModels: input.providerModels,
                defaults: input.defaults,
            })
        );
    };

    return {
        inlineThreadDraft,
        startInlineThreadDraft,
        openInlineThreadDraft(draftState: ThreadEntryDraftState) {
            setInlineThreadDraft(draftState);
        },
        setInlineThreadTitle(title: string) {
            setInlineThreadDraft((current) => (current ? { ...current, title } : current));
        },
        setInlineThreadTopLevelTab(topLevelTab: TopLevelTab) {
            setInlineThreadDraft((current) => (current ? { ...current, topLevelTab } : current));
        },
        setInlineThreadProvider(providerId: RuntimeProviderId | undefined, modelId: string) {
            setInlineThreadDraft((current) =>
                current
                    ? {
                          ...current,
                          providerId,
                          modelId,
                      }
                    : current
            );
        },
        setInlineThreadModel(modelId: string) {
            setInlineThreadDraft((current) => (current ? { ...current, modelId } : current));
        },
        cancelInlineThread() {
            setInlineThreadDraft(undefined);
        },
        getRequestWorkspaceFingerprint(workspaceFingerprint: string | undefined) {
            return workspaceFingerprint ?? input.preferredWorkspaceFingerprint;
        },
    };
}

export function buildThreadEntryDraftState(input: {
    workspaceFingerprint: string;
    workspacePreferences: WorkspacePreferenceRecord[];
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
}): ThreadEntryDraftState {
    const nextDefaults = resolveThreadDraftDefaults({
        workspaceFingerprint: input.workspaceFingerprint,
        workspacePreferences: input.workspacePreferences,
        providers: input.providers,
        providerModels: input.providerModels,
        defaults: input.defaults,
        fallbackTopLevelTab: 'agent',
    });

    return {
        workspaceFingerprint: input.workspaceFingerprint,
        title: '',
        topLevelTab: nextDefaults.topLevelTab,
        providerId: nextDefaults.providerId,
        modelId: nextDefaults.modelId,
    };
}
