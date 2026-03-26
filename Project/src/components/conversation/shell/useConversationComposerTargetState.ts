import { useConversationRunTarget } from '@/web/components/conversation/shell/workspace/useConversationRunTarget';
import {
    getProviderControlDefaults,
    getProviderControlSpecialistDefaults,
    listProviderControlModels,
    listProviderControlProviders,
} from '@/web/lib/providerControl/selectors';

import type { RunRecord } from '@/app/backend/persistence/types';
import type { RuntimeShellBootstrap } from '@/app/backend/runtime/contracts';

import type {
    ConversationSessionActions,
    ConversationShellMainViewDraftTarget,
} from '@/web/components/conversation/shell/useConversationShellViewControllers.types';
import type { TopLevelTab } from '@/shared/contracts';

interface UseConversationComposerTargetStateInput {
    shellBootstrapData: RuntimeShellBootstrap | undefined;
    selectedWorkspaceFingerprint: string | undefined;
    selectedThreadWorkspaceFingerprint?: string;
    mainViewDraftTarget: ConversationShellMainViewDraftTarget;
    sessionOverride: ConversationSessionActions['sessionOverride'];
    runs: RunRecord[];
    topLevelTab: TopLevelTab;
    modeKey: string;
    requiresNativeTools: boolean;
    imageAttachmentsAllowed: boolean;
}

export function useConversationComposerTargetState(input: UseConversationComposerTargetStateInput) {
    const providerControl = input.shellBootstrapData?.providerControl;
    const preferredWorkspacePreference = findConversationWorkspacePreference({
        workspacePreferences: input.shellBootstrapData?.workspacePreferences,
        preferredWorkspaceFingerprint: input.selectedThreadWorkspaceFingerprint ?? input.selectedWorkspaceFingerprint,
    });

    return useConversationRunTarget({
        providers: listProviderControlProviders(providerControl),
        providerModels: listProviderControlModels(providerControl),
        defaults: getProviderControlDefaults(providerControl),
        specialistDefaults: getProviderControlSpecialistDefaults(providerControl),
        ...(preferredWorkspacePreference ? { workspacePreference: preferredWorkspacePreference } : {}),
        ...(input.mainViewDraftTarget ? { mainViewDraft: input.mainViewDraftTarget } : {}),
        runs: input.runs,
        topLevelTab: input.topLevelTab,
        requiresTools: input.requiresNativeTools,
        modeKey: input.modeKey,
        imageAttachmentsAllowed: input.imageAttachmentsAllowed,
        ...(input.sessionOverride ? { sessionOverride: input.sessionOverride } : {}),
    });
}

function findConversationWorkspacePreference(input: {
    workspacePreferences: RuntimeShellBootstrap['workspacePreferences'] | undefined;
    preferredWorkspaceFingerprint: string | undefined;
}) {
    if (!input.preferredWorkspaceFingerprint) {
        return undefined;
    }

    return (input.workspacePreferences ?? []).find(
        (workspacePreference) => workspacePreference.workspaceFingerprint === input.preferredWorkspaceFingerprint
    );
}
