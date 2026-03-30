import { buildModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { resolveSelectedModelId, resolveSelectedProviderId } from '@/web/components/settings/providerSettings/selection';
import { isOneOf } from '@/web/lib/typeGuards/isOneOf';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import { providerIds, type RuntimeProviderId, type TopLevelTab } from '@/shared/contracts';
import type { WorkspacePreferenceRecord } from '@/shared/contracts/types/runtime';

export function formatTimestamp(value: string | undefined): string {
    if (!value) {
        return 'Unknown';
    }

    return new Date(value).toLocaleString();
}

export function topLevelTabLabel(value: TopLevelTab): string {
    if (value === 'chat') {
        return 'Chat';
    }

    if (value === 'agent') {
        return 'Agent';
    }

    return 'Orchestrator';
}

export type WorkspaceModelOption = ReturnType<typeof buildModelPickerOption>;

export function buildWorkspaceModelOptions(
    provider: ProviderListItem | undefined,
    models: ProviderModelRecord[]
): WorkspaceModelOption[] {
    if (!provider) {
        return [];
    }

    return models
        .filter((model) => model.providerId === provider.id)
        .map((model) =>
            buildModelPickerOption({
                model,
                provider,
                compatibilityContext: {
                    surface: 'settings',
                },
            })
        );
}

function isRuntimeProviderId(value: string | undefined): value is RuntimeProviderId {
    return isOneOf(value, providerIds);
}

export function resolveWorkspaceDefaultDraft(input: {
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    workspacePreference?: WorkspacePreferenceRecord;
}): {
    topLevelTab: TopLevelTab;
    providerId: RuntimeProviderId | undefined;
    modelId: string;
} {
    const nextProviderId = resolveSelectedProviderId(input.providers, input.workspacePreference?.defaultProviderId);
    const nextModelId = resolveSelectedModelId({
        selectedProviderId: nextProviderId,
        selectedModelId: input.workspacePreference?.defaultModelId ?? '',
        models: input.providerModels.filter((model) => model.providerId === nextProviderId),
        defaults: input.defaults,
    });

    return {
        topLevelTab: input.workspacePreference?.defaultTopLevelTab ?? 'agent',
        providerId: nextProviderId,
        modelId: nextModelId,
    };
}

export function isWorkspaceRuntimeProviderId(value: string | undefined): value is RuntimeProviderId {
    return isRuntimeProviderId(value);
}
