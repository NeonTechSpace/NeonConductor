import { skipToken } from '@tanstack/react-query';

import {
    buildRuntimeRunOptions,
    DEFAULT_REASONING_EFFORT,
    isEntityId,
} from '@/web/components/conversation/shell/workspace/helpers';
import { useConversationRunTarget } from '@/web/components/conversation/shell/workspace/useConversationRunTarget';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { ConversationQueries, ConversationSessionActions, ConversationShellMainViewDraftTarget } from './useConversationShellViewControllers.types';
import type { ResolvedContextStateInput } from '@/app/backend/runtime/contracts/types/context';
import type { RunRecord } from '@/app/backend/persistence/types';
import type { RuntimeProviderId, RuntimeReasoningEffort, RuntimeRunOptions, TopLevelTab } from '@/shared/contracts';

interface UseConversationShellRunTargetStateInput {
    shellBootstrapData: ConversationQueries['shellBootstrapQuery']['data'];
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

export function useConversationShellRunTargetState(input: UseConversationShellRunTargetStateInput) {
    const preferredWorkspacePreference = findConversationWorkspacePreference({
        workspacePreferences: input.shellBootstrapData?.workspacePreferences,
        preferredWorkspaceFingerprint: input.selectedThreadWorkspaceFingerprint ?? input.selectedWorkspaceFingerprint,
    });

    return useConversationRunTarget({
        providers: input.shellBootstrapData?.providers ?? [],
        providerModels: input.shellBootstrapData?.providerModels ?? [],
        defaults: input.shellBootstrapData?.defaults,
        ...(input.shellBootstrapData?.specialistDefaults
            ? { specialistDefaults: input.shellBootstrapData.specialistDefaults }
            : {}),
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
    workspacePreferences:
        | NonNullable<ConversationQueries['shellBootstrapQuery']['data']>['workspacePreferences']
        | undefined;
    preferredWorkspaceFingerprint: string | undefined;
}) {
    if (!input.preferredWorkspaceFingerprint) {
        return undefined;
    }

    return (input.workspacePreferences ?? []).find(
        (workspacePreference) => workspacePreference.workspaceFingerprint === input.preferredWorkspaceFingerprint
    );
}

export function buildConversationReasoningState(input: {
    modelsByProvider: Map<
        RuntimeProviderId,
        Array<{
            id: string;
            features: {
                supportsReasoning?: boolean | null;
            };
            reasoningEfforts?: RuntimeReasoningEffort[] | undefined;
        }>
    >;
    selectedComposerProviderId: RuntimeProviderId | undefined;
    selectedComposerModelId: string | undefined;
    requestedReasoningEffort: RuntimeReasoningEffort;
}) {
    const selectedComposerModelRecord =
        input.selectedComposerProviderId && input.selectedComposerModelId
            ? (input.modelsByProvider.get(input.selectedComposerProviderId) ?? []).find(
                  (model) => model.id === input.selectedComposerModelId
              )
            : undefined;

    const selectedModelSupportsReasoning = Boolean(selectedComposerModelRecord?.features.supportsReasoning);
    const supportedReasoningEfforts =
        input.selectedComposerProviderId === 'kilo'
            ? selectedComposerModelRecord?.reasoningEfforts?.filter(
                  (effort): effort is Exclude<RuntimeReasoningEffort, 'none'> => effort !== 'none'
              )
            : undefined;
    const canAdjustReasoningEffort =
        selectedModelSupportsReasoning &&
        (input.selectedComposerProviderId === 'kilo'
            ? supportedReasoningEfforts !== undefined && supportedReasoningEfforts.length > 0
            : supportedReasoningEfforts === undefined || supportedReasoningEfforts.length > 0);
    const effectiveReasoningEffort =
        selectedModelSupportsReasoning &&
        canAdjustReasoningEffort &&
        (supportedReasoningEfforts === undefined ||
            input.requestedReasoningEffort === 'none' ||
            supportedReasoningEfforts.includes(input.requestedReasoningEffort))
            ? input.requestedReasoningEffort
            : 'none';
    const runtimeOptions = buildRuntimeRunOptions({
        supportsReasoning: selectedModelSupportsReasoning,
        reasoningEffort: effectiveReasoningEffort,
    });

    return {
        requestedReasoningEffort: input.requestedReasoningEffort,
        selectedModelSupportsReasoning,
        supportedReasoningEfforts,
        effectiveReasoningEffort,
        runtimeOptions,
    };
}

export function resolveConversationSelectionIds(input: {
    resolvedSessionId: string | undefined;
    resolvedRunId: string | undefined;
}) {
    const selectedSessionId = isEntityId(input.resolvedSessionId, 'sess') ? input.resolvedSessionId : undefined;
    const selectedRunId = isEntityId(input.resolvedRunId, 'run') ? input.resolvedRunId : undefined;

    return {
        selectedSessionId,
        selectedRunId,
        hasSelectedSession: selectedSessionId !== undefined,
    };
}

export function buildResolvedContextStateQueryInput(input: {
    profileId: string;
    selectedSessionId: string | undefined;
    providerId: RuntimeProviderId | undefined;
    modelId: string | undefined;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint: string | undefined;
    selectedRunId: string | undefined;
}): ResolvedContextStateInput | typeof skipToken {
    if (!isEntityId(input.selectedSessionId, 'sess')) {
        return skipToken;
    }

    return {
        profileId: input.profileId,
        sessionId: input.selectedSessionId,
        providerId: input.providerId ?? 'openai',
        modelId: input.modelId ?? 'openai/gpt-5',
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        ...(isEntityId(input.selectedRunId, 'run') ? { runId: input.selectedRunId } : {}),
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    };
}

interface UseConversationShellContextStateInput {
    profileId: string;
    selectedSessionId: string | undefined;
    selectedRunId: string | undefined;
    providerId: RuntimeProviderId | undefined;
    modelId: string | undefined;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint: string | undefined;
}

export function useConversationShellContextState(input: UseConversationShellContextStateInput) {
    const contextStateQueryInput = buildResolvedContextStateQueryInput({
        profileId: input.profileId,
        selectedSessionId: input.selectedSessionId,
        providerId: input.providerId,
        modelId: input.modelId,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        workspaceFingerprint: input.workspaceFingerprint,
        selectedRunId: input.selectedRunId,
    });
    const contextStateQueryEnabled = contextStateQueryInput !== skipToken;
    const contextStateQuery = trpc.context.getResolvedState.useQuery(contextStateQueryInput, {
        ...PROGRESSIVE_QUERY_OPTIONS,
    });

    return {
        contextStateQueryInput,
        contextStateQueryEnabled,
        contextStateQuery,
    } satisfies {
        contextStateQueryInput: ResolvedContextStateInput | typeof skipToken;
        contextStateQueryEnabled: boolean;
        contextStateQuery: ReturnType<typeof trpc.context.getResolvedState.useQuery>;
    };
}

export interface ConversationReasoningState {
    requestedReasoningEffort: RuntimeReasoningEffort;
    selectedModelSupportsReasoning: boolean;
    supportedReasoningEfforts: Array<Exclude<RuntimeReasoningEffort, 'none'>> | undefined;
    effectiveReasoningEffort: RuntimeReasoningEffort;
    runtimeOptions: RuntimeRunOptions;
}

export { DEFAULT_REASONING_EFFORT };
