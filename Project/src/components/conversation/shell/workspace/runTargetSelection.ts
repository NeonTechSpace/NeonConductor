import {
    buildModelPickerOption,
    getModelCompatibilityPriority,
    isCompatibleModelOption,
    type ModelPickerOption,
} from '@/web/components/modelSelection/modelCapabilities';

import type { ProviderModelRecord, RunRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import {
    findProviderSpecialistDefault,
    isSupportedProviderSpecialistDefaultTarget,
} from '@/shared/contracts';
import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';
import type { ProviderSpecialistDefaultRecord } from '@/shared/contracts/types/provider';
import type { WorkspacePreferenceRecord } from '@/shared/contracts/types/runtime';
import { canonicalizeProviderModelId } from '@/shared/kiloModels';

import { isProviderId, type RunTargetSelection } from '@/web/components/conversation/shell/workspace/helpers';

export type ExecutionTargetResolutionSource =
    | 'session_override'
    | 'main_view_draft'
    | 'latest_compatible_run'
    | 'specialist_default'
    | 'workspace_preference'
    | 'shared_defaults'
    | 'compatibility_fallback';

export type ExecutionTargetCompatibilityState = ModelPickerOption['compatibilityState'];

export interface ExecutionTargetExplanationModel {
    selectedSourceLabel: string;
    selectionReason: string;
    compatibilityMode: 'override' | 'compatibility_gated' | 'compatibility_fallback';
    hasCompatibleOptions: boolean;
}

export interface ResolvedExecutionTarget extends RunTargetSelection {
    source: ExecutionTargetResolutionSource;
    compatibilityState: ExecutionTargetCompatibilityState;
    explanation: ExecutionTargetExplanationModel;
}

export interface ExecutionTargetCompatibilityModel {
    providerById: Map<RuntimeProviderId, ProviderListItem>;
    modelsByProvider: Map<RuntimeProviderId, ProviderModelRecord[]>;
    modelOptions: ModelPickerOption[];
    rankedModelOptions: ModelPickerOption[];
    hasCompatibleOptions: boolean;
    getOption: (providerId: RuntimeProviderId, modelId: string) => ModelPickerOption | undefined;
    canAutoResolve: (option: ModelPickerOption | undefined) => option is ModelPickerOption;
}

export interface ConversationRunTargetInput {
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    specialistDefaults?: ProviderSpecialistDefaultRecord[];
    workspacePreference?: WorkspacePreferenceRecord;
    sessionOverride?: { providerId?: RuntimeProviderId; modelId?: string };
    mainViewDraft?: { providerId?: RuntimeProviderId; modelId?: string };
    runs: RunRecord[];
    topLevelTab?: TopLevelTab;
    requiresTools?: boolean;
    modeKey?: string;
    hasPendingImageAttachments?: boolean;
    imageAttachmentsAllowed?: boolean;
}

export interface ConversationRunTargetModel extends ExecutionTargetCompatibilityModel {
    resolvedRunTarget: RunTargetSelection | undefined;
    resolvedExecutionTarget: ResolvedExecutionTarget | undefined;
    selectedProviderIdForComposer: RuntimeProviderId | undefined;
    selectedModelIdForComposer: string | undefined;
    selectedModelForComposer: ProviderModelRecord | undefined;
    selectedModelOptionForComposer: ModelPickerOption | undefined;
}

function buildExplanation(input: {
    source: ExecutionTargetResolutionSource;
    hasCompatibleOptions: boolean;
}): ExecutionTargetExplanationModel {
    const selectedSourceLabel: Record<ExecutionTargetResolutionSource, string> = {
        session_override: 'Session override',
        main_view_draft: 'Main-view draft',
        latest_compatible_run: 'Latest compatible run',
        specialist_default: 'Specialist default',
        workspace_preference: 'Workspace preference',
        shared_defaults: 'Shared defaults',
        compatibility_fallback: 'Compatibility fallback',
    };

    return {
        selectedSourceLabel: selectedSourceLabel[input.source],
        selectionReason:
            input.source === 'session_override'
                ? 'An explicit session override won because session-owned target state is authoritative.'
                : input.source === 'main_view_draft'
                  ? 'The unsaved main-view draft won because it is the most recent interactive selection.'
                  : input.source === 'latest_compatible_run'
                    ? 'The latest compatible prior run won because reuse is preferred when it still matches the current constraints.'
                    : input.source === 'specialist_default'
                      ? 'The matching specialist default won because it is the active mode-specific default.'
                      : input.source === 'workspace_preference'
                        ? 'The workspace preference won because it overrides shared defaults for this workspace.'
                        : input.source === 'shared_defaults'
                          ? 'The shared default won because no more specific target had already resolved.'
                          : 'No higher-precedence target resolved, so the best remaining compatible model was chosen by fallback ranking.',
        compatibilityMode:
            input.source === 'session_override'
                ? 'override'
                : input.hasCompatibleOptions
                  ? 'compatibility_gated'
                  : 'compatibility_fallback',
        hasCompatibleOptions: input.hasCompatibleOptions,
    };
}

function buildRankedModelOptions(modelOptions: ModelPickerOption[]): ModelPickerOption[] {
    return [...modelOptions]
        .map((option, index) => ({
            option,
            index,
        }))
        .sort((left, right) => {
            const priorityDifference =
                getModelCompatibilityPriority(left.option) - getModelCompatibilityPriority(right.option);
            if (priorityDifference !== 0) {
                return priorityDifference;
            }

            return left.index - right.index;
        })
        .map(({ option }) => option);
}

export function buildExecutionTargetCompatibilityModel(input: {
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    requiresTools?: boolean;
    modeKey?: string;
    hasPendingImageAttachments?: boolean;
    imageAttachmentsAllowed?: boolean;
}): ExecutionTargetCompatibilityModel {
    const providerById = new Map(input.providers.map((provider) => [provider.id, provider]));

    const modelsByProvider = new Map<RuntimeProviderId, ProviderModelRecord[]>();
    for (const model of input.providerModels) {
        const existing = modelsByProvider.get(model.providerId) ?? [];
        existing.push(model);
        modelsByProvider.set(model.providerId, existing);
    }

    const modelOptions = input.providers.flatMap((provider) =>
        (modelsByProvider.get(provider.id) ?? []).map((model) =>
            buildModelPickerOption({
                model,
                provider,
                compatibilityContext: {
                    surface: 'conversation',
                    requiresTools: input.requiresTools,
                    ...(input.modeKey ? { modeKey: input.modeKey } : {}),
                    hasPendingImageAttachments: input.hasPendingImageAttachments,
                    imageAttachmentsAllowed: input.imageAttachmentsAllowed,
                },
            })
        )
    );
    const optionsByKey = new Map(
        modelOptions.map((option) => [`${option.providerId ?? 'unknown'}:${option.id}`, option] as const)
    );
    const hasCompatibleOptions = modelOptions.some((option) => isCompatibleModelOption(option));

    function getOption(providerId: RuntimeProviderId, modelId: string): ModelPickerOption | undefined {
        const canonicalModelId = canonicalizeProviderModelId(providerId, modelId);
        return optionsByKey.get(`${providerId}:${canonicalModelId}`);
    }

    function canAutoResolve(option: ModelPickerOption | undefined): option is ModelPickerOption {
        if (!option) {
            return false;
        }

        if (!hasCompatibleOptions) {
            return true;
        }

        return isCompatibleModelOption(option);
    }

    return {
        providerById,
        modelsByProvider,
        modelOptions,
        rankedModelOptions: buildRankedModelOptions(modelOptions),
        hasCompatibleOptions,
        getOption,
        canAutoResolve,
    };
}

export function resolveExecutionTarget(input: {
    compatibilityModel: ExecutionTargetCompatibilityModel;
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    specialistDefaults?: ProviderSpecialistDefaultRecord[];
    workspacePreference?: WorkspacePreferenceRecord;
    sessionOverride?: { providerId?: RuntimeProviderId; modelId?: string };
    mainViewDraft?: { providerId?: RuntimeProviderId; modelId?: string };
    runs: RunRecord[];
    topLevelTab?: TopLevelTab;
    modeKey?: string;
}): {
    resolvedRunTarget: RunTargetSelection | undefined;
    resolvedExecutionTarget: ResolvedExecutionTarget | undefined;
} {
    const specialistTarget =
        input.topLevelTab && input.modeKey
            ? {
                  topLevelTab: input.topLevelTab,
                  modeKey: input.modeKey,
              }
            : undefined;
    const matchingSpecialistDefault =
        specialistTarget && isSupportedProviderSpecialistDefaultTarget(specialistTarget)
            ? findProviderSpecialistDefault(input.specialistDefaults ?? [], specialistTarget)
            : undefined;

    function resolveFromOption(source: ExecutionTargetResolutionSource, providerId: RuntimeProviderId, modelId: string) {
        const option = input.compatibilityModel.getOption(providerId, modelId);
        if (!option) {
            return undefined;
        }

        const canonicalModelId = canonicalizeProviderModelId(providerId, modelId);
        return {
            resolvedRunTarget: {
                providerId,
                modelId: canonicalModelId,
            },
            resolvedExecutionTarget: {
                providerId,
                modelId: canonicalModelId,
                source,
                compatibilityState: option.compatibilityState,
                explanation: buildExplanation({
                    source,
                    hasCompatibleOptions: input.compatibilityModel.hasCompatibleOptions,
                }),
            },
        };
    }

    function resolveCompatibleFromOption(
        source: Exclude<ExecutionTargetResolutionSource, 'session_override' | 'compatibility_fallback'>,
        providerId: RuntimeProviderId,
        modelId: string
    ) {
        const option = input.compatibilityModel.getOption(providerId, modelId);
        if (!input.compatibilityModel.canAutoResolve(option)) {
            return undefined;
        }

        const canonicalModelId = canonicalizeProviderModelId(providerId, modelId);
        return {
            resolvedRunTarget: {
                providerId,
                modelId: canonicalModelId,
            },
            resolvedExecutionTarget: {
                providerId,
                modelId: canonicalModelId,
                source,
                compatibilityState: option.compatibilityState,
                explanation: buildExplanation({
                    source,
                    hasCompatibleOptions: input.compatibilityModel.hasCompatibleOptions,
                }),
            },
        };
    }

    if (input.sessionOverride?.providerId && input.sessionOverride.modelId) {
        const modelId = canonicalizeProviderModelId(input.sessionOverride.providerId, input.sessionOverride.modelId);
        const candidate = resolveFromOption('session_override', input.sessionOverride.providerId, modelId);
        if (candidate) {
            return candidate;
        }
    }

    if (input.mainViewDraft?.providerId && input.mainViewDraft.modelId) {
        const modelId = canonicalizeProviderModelId(input.mainViewDraft.providerId, input.mainViewDraft.modelId);
        const candidate = resolveCompatibleFromOption('main_view_draft', input.mainViewDraft.providerId, modelId);
        if (candidate) {
            return candidate;
        }
    }

    for (const run of input.runs) {
        if (!isProviderId(run.providerId) || typeof run.modelId !== 'string') {
            continue;
        }

        const modelId = canonicalizeProviderModelId(run.providerId, run.modelId);
        const candidate = resolveCompatibleFromOption('latest_compatible_run', run.providerId, modelId);
        if (candidate) {
            return candidate;
        }
    }

    if (
        matchingSpecialistDefault &&
        input.compatibilityModel.canAutoResolve(
            input.compatibilityModel.getOption(matchingSpecialistDefault.providerId, matchingSpecialistDefault.modelId)
        )
    ) {
        const modelId = canonicalizeProviderModelId(
            matchingSpecialistDefault.providerId,
            matchingSpecialistDefault.modelId
        );
        const candidate = resolveCompatibleFromOption('specialist_default', matchingSpecialistDefault.providerId, modelId);
        if (candidate) {
            return candidate;
        }
    }

    if (
        input.workspacePreference?.defaultProviderId &&
        input.workspacePreference.defaultModelId &&
        input.compatibilityModel.canAutoResolve(
            input.compatibilityModel.getOption(
                input.workspacePreference.defaultProviderId,
                input.workspacePreference.defaultModelId
            )
        )
    ) {
        const modelId = canonicalizeProviderModelId(
            input.workspacePreference.defaultProviderId,
            input.workspacePreference.defaultModelId
        );
        const candidate = resolveCompatibleFromOption(
            'workspace_preference',
            input.workspacePreference.defaultProviderId,
            modelId
        );
        if (candidate) {
            return candidate;
        }
    }

    if (
        input.defaults &&
        isProviderId(input.defaults.providerId) &&
        input.compatibilityModel.canAutoResolve(
            input.compatibilityModel.getOption(input.defaults.providerId, input.defaults.modelId)
        )
    ) {
        const modelId = canonicalizeProviderModelId(input.defaults.providerId, input.defaults.modelId);
        const candidate = resolveCompatibleFromOption('shared_defaults', input.defaults.providerId, modelId);
        if (candidate) {
            return candidate;
        }
    }

    const firstFallbackModel = input.compatibilityModel.rankedModelOptions[0];
    if (firstFallbackModel?.providerId && isProviderId(firstFallbackModel.providerId)) {
        const modelId = canonicalizeProviderModelId(firstFallbackModel.providerId, firstFallbackModel.id);
        return {
            resolvedRunTarget: {
                providerId: firstFallbackModel.providerId,
                modelId,
            },
            resolvedExecutionTarget: {
                providerId: firstFallbackModel.providerId,
                modelId,
                source: 'compatibility_fallback',
                compatibilityState: firstFallbackModel.compatibilityState,
                explanation: buildExplanation({
                    source: 'compatibility_fallback',
                    hasCompatibleOptions: input.compatibilityModel.hasCompatibleOptions,
                }),
            },
        };
    }

    return {
        resolvedRunTarget: undefined,
        resolvedExecutionTarget: undefined,
    };
}

export function buildConversationRunTargetModel(input: ConversationRunTargetInput): ConversationRunTargetModel {
    const compatibilityModel = buildExecutionTargetCompatibilityModel(input);
    const { resolvedRunTarget, resolvedExecutionTarget } = resolveExecutionTarget({
        compatibilityModel,
        defaults: input.defaults,
        ...(input.specialistDefaults !== undefined ? { specialistDefaults: input.specialistDefaults } : {}),
        ...(input.workspacePreference !== undefined ? { workspacePreference: input.workspacePreference } : {}),
        ...(input.sessionOverride !== undefined ? { sessionOverride: input.sessionOverride } : {}),
        ...(input.mainViewDraft !== undefined ? { mainViewDraft: input.mainViewDraft } : {}),
        runs: input.runs,
        ...(input.topLevelTab !== undefined ? { topLevelTab: input.topLevelTab } : {}),
        ...(input.modeKey !== undefined ? { modeKey: input.modeKey } : {}),
    });

    const selectedProviderIdForComposer =
        input.sessionOverride?.providerId ?? input.mainViewDraft?.providerId ?? resolvedRunTarget?.providerId;
    const selectedModelIdForComposer =
        selectedProviderIdForComposer &&
        (input.sessionOverride?.modelId ?? input.mainViewDraft?.modelId ?? resolvedRunTarget?.modelId)
            ? canonicalizeProviderModelId(
                  selectedProviderIdForComposer,
                  input.sessionOverride?.modelId ?? input.mainViewDraft?.modelId ?? resolvedRunTarget?.modelId ?? ''
              )
            : undefined;
    const selectedModelForComposer =
        selectedProviderIdForComposer && selectedModelIdForComposer
            ? (compatibilityModel.modelsByProvider.get(selectedProviderIdForComposer) ?? []).find(
                  (model) => model.id === selectedModelIdForComposer
              )
            : undefined;
    const selectedModelOptionForComposer =
        selectedProviderIdForComposer && selectedModelIdForComposer
            ? compatibilityModel.getOption(selectedProviderIdForComposer, selectedModelIdForComposer)
            : undefined;

    return {
        ...compatibilityModel,
        resolvedRunTarget,
        resolvedExecutionTarget,
        selectedProviderIdForComposer,
        selectedModelIdForComposer,
        selectedModelForComposer,
        selectedModelOptionForComposer,
    };
}
