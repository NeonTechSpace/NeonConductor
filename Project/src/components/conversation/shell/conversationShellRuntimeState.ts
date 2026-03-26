import { skipToken } from '@tanstack/react-query';

import {
    buildRuntimeRunOptions,
    DEFAULT_REASONING_EFFORT,
    isEntityId,
} from '@/web/components/conversation/shell/workspace/helpers';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { ResolvedContextStateInput } from '@/app/backend/runtime/contracts/types/context';
import type { RuntimeProviderId, RuntimeReasoningEffort, RuntimeRunOptions, TopLevelTab } from '@/shared/contracts';

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
