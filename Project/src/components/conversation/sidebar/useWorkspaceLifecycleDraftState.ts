import { useDeferredValue, useState } from 'react';

import type { WorkspaceLifecycleDraftState } from '@/web/components/conversation/sidebar/sidebarTypes';
import { resolveThreadDraftDefaults } from '@/web/components/conversation/sidebar/threadDraftDefaults';
import { buildModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';
import type { WorkspacePreferenceRecord } from '@/shared/contracts/types/runtime';


interface UseWorkspaceLifecycleDraftStateInput {
    profileId: string;
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    workspacePreferences: WorkspacePreferenceRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    desktopBridge: typeof window.neonDesktop | undefined;
}

function readSidebarWorkspaceBrowseErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Workspace directory could not be selected.';
}

export async function browseSidebarWorkspaceDirectory(input: {
    desktopBridge: typeof window.neonDesktop | undefined;
    isPickingWorkspaceDirectory: boolean;
    onPickingWorkspaceDirectoryChange: (isPicking: boolean) => void;
    onWorkspaceCreateErrorChange: (message: string | undefined) => void;
}): Promise<string | undefined> {
    if (!input.desktopBridge || input.isPickingWorkspaceDirectory) {
        return undefined;
    }

    input.onWorkspaceCreateErrorChange(undefined);
    input.onPickingWorkspaceDirectoryChange(true);
    try {
        const result = await input.desktopBridge.pickDirectory();
        return result.canceled ? undefined : result.absolutePath;
    } catch (error) {
        input.onWorkspaceCreateErrorChange(readSidebarWorkspaceBrowseErrorMessage(error));
        return undefined;
    } finally {
        input.onPickingWorkspaceDirectoryChange(false);
    }
}

export function resolveWorkspaceLifecycleDraft(input: {
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    workspacePreferences: WorkspacePreferenceRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
}): WorkspaceLifecycleDraftState {
    const nextDefaults = resolveThreadDraftDefaults({
        workspacePreferences: input.workspacePreferences,
        providers: input.providers,
        providerModels: input.providerModels,
        defaults: input.defaults,
        fallbackTopLevelTab: 'agent',
    });

    return {
        label: '',
        absolutePath: '',
        defaultTopLevelTab: nextDefaults.topLevelTab,
        defaultProviderId: nextDefaults.providerId,
        defaultModelId: nextDefaults.modelId,
    };
}

export function useWorkspaceLifecycleDraftState(input: UseWorkspaceLifecycleDraftStateInput) {
    const [open, setOpen] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);
    const [isPickingDirectory, setIsPickingDirectory] = useState(false);
    const [draft, setDraft] = useState<WorkspaceLifecycleDraftState>(() =>
        resolveWorkspaceLifecycleDraft({
            providers: input.providers,
            providerModels: input.providerModels,
            workspacePreferences: input.workspacePreferences,
            defaults: input.defaults,
        })
    );
    const deferredAbsolutePath = useDeferredValue(draft.absolutePath.trim());
    const environmentQuery = trpc.runtime.inspectWorkspaceEnvironment.useQuery(
        {
            profileId: input.profileId,
            absolutePath: deferredAbsolutePath.length > 0 ? deferredAbsolutePath : '.',
        },
        {
            enabled: deferredAbsolutePath.length > 0,
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const selectedProvider = draft.defaultProviderId
        ? input.providers.find((provider) => provider.id === draft.defaultProviderId)
        : undefined;
    const modelOptions = selectedProvider?.id
        ? input.providerModels
              .filter((model) => model.providerId === selectedProvider.id)
              .map((model) =>
                  buildModelPickerOption({
                      model,
                      provider: selectedProvider,
                      compatibilityContext: {
                          surface: 'settings',
                      },
                  })
              )
        : [];
    const selectedModelId =
        draft.defaultModelId && modelOptions.some((option) => option.id === draft.defaultModelId)
            ? draft.defaultModelId
            : (modelOptions[0]?.id ?? '');

    return {
        open,
        draft,
        statusMessage,
        isPickingDirectory,
        environmentQuery,
        modelOptions,
        selectedModelId,
        openDraft() {
            setDraft(
                resolveWorkspaceLifecycleDraft({
                    providers: input.providers,
                    providerModels: input.providerModels,
                    workspacePreferences: input.workspacePreferences,
                    defaults: input.defaults,
                })
            );
            setStatusMessage(undefined);
            setOpen(true);
        },
        closeDraft() {
            setStatusMessage(undefined);
            setOpen(false);
        },
        clearStatusMessage() {
            setStatusMessage(undefined);
        },
        setStatusMessage,
        setLabel(label: string) {
            setDraft((current) => ({ ...current, label }));
        },
        setAbsolutePath(absolutePath: string) {
            setDraft((current) => ({ ...current, absolutePath }));
        },
        setDefaultTopLevelTab(defaultTopLevelTab: TopLevelTab) {
            setDraft((current) => ({ ...current, defaultTopLevelTab }));
        },
        setDefaultProviderId(defaultProviderId: RuntimeProviderId | undefined) {
            setDraft((current) => {
                const nextModelId =
                    input.providerModels.find((model) => model.providerId === defaultProviderId)?.id ?? '';

                return {
                    ...current,
                    defaultProviderId,
                    defaultModelId: nextModelId,
                };
            });
        },
        setDefaultModelId(defaultModelId: string) {
            setDraft((current) => ({ ...current, defaultModelId }));
        },
        async browseDirectory() {
            const nextPath = await browseSidebarWorkspaceDirectory({
                desktopBridge: input.desktopBridge,
                isPickingWorkspaceDirectory: isPickingDirectory,
                onPickingWorkspaceDirectoryChange: setIsPickingDirectory,
                onWorkspaceCreateErrorChange: setStatusMessage,
            });
            if (!nextPath) {
                return;
            }

            setDraft((current) => {
                const nextLabel =
                    current.label.trim().length > 0
                        ? current.label
                        : (nextPath.split(/[\\/]/).filter(Boolean).at(-1) ?? current.label);

                return {
                    ...current,
                    absolutePath: nextPath,
                    label: nextLabel,
                };
            });
        },
    };
}
