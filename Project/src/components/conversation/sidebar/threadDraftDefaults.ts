import {
    resolveSelectedModelId,
    resolveSelectedProviderId,
} from '@/web/components/settings/providerSettings/selection';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';
import type { WorkspacePreferenceRecord } from '@/shared/contracts/types/runtime';


export interface ThreadDraftDefaults {
    topLevelTab: TopLevelTab;
    providerId: RuntimeProviderId | undefined;
    modelId: string;
}

export function resolveThreadDraftDefaults(input: {
    workspaceFingerprint?: string;
    workspacePreferences: WorkspacePreferenceRecord[];
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    fallbackTopLevelTab: TopLevelTab;
}): ThreadDraftDefaults {
    const workspacePreference = input.workspaceFingerprint
        ? input.workspacePreferences.find(
              (workspacePreferenceRecord) =>
                  workspacePreferenceRecord.workspaceFingerprint === input.workspaceFingerprint
          )
        : undefined;
    const defaultProviderId = input.providers.find((provider) => provider.id === input.defaults?.providerId)?.id;
    const providerId = resolveSelectedProviderId(
        input.providers,
        workspacePreference?.defaultProviderId ?? defaultProviderId
    );
    const modelId = resolveSelectedModelId({
        selectedProviderId: providerId,
        selectedModelId: workspacePreference?.defaultModelId ?? '',
        models: input.providerModels.filter((model) => model.providerId === providerId),
        defaults: input.defaults,
    });

    return {
        topLevelTab: workspacePreference?.defaultTopLevelTab ?? input.fallbackTopLevelTab,
        providerId,
        modelId,
    };
}
