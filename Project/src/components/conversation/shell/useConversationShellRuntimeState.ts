import { useState } from 'react';

import { useConversationShellSessionActions } from '@/web/components/conversation/hooks/useConversationShellSessionActions';
import { useConversationShellViewModel } from '@/web/components/conversation/hooks/useConversationShellViewModel';
import { useConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import { useConversationMutations } from '@/web/components/conversation/shell/actions/useConversationMutations';
import {
    buildConversationReasoningState,
    DEFAULT_REASONING_EFFORT,
    resolveConversationSelectionIds,
    useConversationShellContextState,
} from '@/web/components/conversation/shell/conversationShellRuntimeState';
import { deriveConversationWorkspaceExecutionScope } from '@/web/components/conversation/shell/deriveConversationWorkspaceExecutionScope';
import {
    resolveOrchestratorExecutionStrategyDraft,
    resolveOrchestratorStrategyRootThreadId,
    updateOrchestratorExecutionStrategyDraft,
} from '@/web/components/conversation/shell/orchestratorExecutionStrategyDrafts';
import { useConversationQueries } from '@/web/components/conversation/shell/queries/useConversationQueries';
import { useConversationComposerTargetState } from '@/web/components/conversation/shell/useConversationComposerTargetState';
import { useConversationShellCacheHandlers } from '@/web/components/conversation/shell/useConversationShellCacheHandlers';
import { useConversationShellComposerSetup } from '@/web/components/conversation/shell/useConversationShellComposerSetup';
import type { UseConversationShellControllerInput } from '@/web/components/conversation/shell/useConversationShellController';
import { useConversationShellSelectionState } from '@/web/components/conversation/shell/useConversationShellSelectionState';
import { useConversationShellSync } from '@/web/components/conversation/shell/useConversationShellSync';
import type {
    ConversationShellMainViewDraftTarget,
    ShellRuntimeControllerState,
} from '@/web/components/conversation/shell/useConversationShellViewControllers.types';
import {
    isEntityId,
    modeCanExecuteRuns,
    modeRequiresNativeTools,
    modeSupportsOrchestrationWorkflow,
    modeSupportsPlanningWorkflow,
} from '@/web/components/conversation/shell/workspace/helpers';
import { useRuntimeEventStreamStore } from '@/web/lib/runtime/eventStream';
import { trpc } from '@/web/trpc/client';

import type { OrchestratorExecutionStrategy, RuntimeReasoningEffort } from '@/shared/contracts';

export function useConversationShellRuntimeState(
    input: UseConversationShellControllerInput
): ShellRuntimeControllerState {
    const {
        profileId,
        selectedWorkspaceFingerprint,
        modeKey,
        modes,
        onTopLevelTabChange,
        onSelectedWorkspaceFingerprintChange,
        onProfileChange,
        onBootChromeReadyChange,
    } = input;

    const activeMode = modes.find((candidate) => candidate.modeKey === modeKey);
    const activeModeRequiresNativeTools = modeRequiresNativeTools(activeMode);
    const activeModeSupportsPlanningWorkflow = modeSupportsPlanningWorkflow(activeMode);
    const activeModeSupportsOrchestrationWorkflow = modeSupportsOrchestrationWorkflow(activeMode);
    const isPlanningComposerMode =
        (input.topLevelTab === 'agent' || input.topLevelTab === 'orchestrator') && activeModeSupportsPlanningWorkflow;
    const isOrchestrationWorkflowMode = input.topLevelTab === 'orchestrator' && activeModeSupportsOrchestrationWorkflow;
    const imageAttachmentsAllowed = input.topLevelTab !== 'orchestrator' && modeCanExecuteRuns(activeMode);

    const [tabSwitchNotice, setTabSwitchNotice] = useState<string | undefined>(undefined);
    const [focusComposerRequestKey, setFocusComposerRequestKey] = useState(0);
    const [executionStrategyDraftsByRootThreadId, setExecutionStrategyDraftsByRootThreadId] = useState<
        Record<string, OrchestratorExecutionStrategy>
    >({});
    const [requestedReasoningEffort, setRequestedReasoningEffort] =
        useState<RuntimeReasoningEffort>(DEFAULT_REASONING_EFFORT);
    const [mainViewDraftTarget, setMainViewDraftTarget] = useState<ConversationShellMainViewDraftTarget>(undefined);

    const uiState = useConversationUiState(profileId);
    const utils = trpc.useUtils();
    const queries = useConversationQueries({
        profileId,
        uiState,
        selectedSessionId: uiState.selectedSessionId,
        selectedRunId: uiState.selectedRunId,
        topLevelTab: input.topLevelTab,
        modeKey,
        activeMode,
    });
    const mutations = useConversationMutations();

    const setEditPreference = async (editPreferenceInput: {
        profileId: string;
        value: 'truncate' | 'branch';
    }): Promise<void> => {
        await mutations.setEditPreferenceMutation.mutateAsync(editPreferenceInput);
    };

    const streamState = useRuntimeEventStreamStore((state) => state.connectionState);
    const streamErrorMessage = useRuntimeEventStreamStore((state) => state.lastError);

    let clearComposerRunSubmitError: () => void = () => undefined;
    let setComposerRunSubmitError: (message: string) => void = () => undefined;
    let applySessionWorkspaceUpdate: ShellRuntimeControllerState['applySessionWorkspaceUpdate'] = () => undefined;

    const sessionActions = useConversationShellSessionActions({
        profileId,
        selectedThreadId: uiState.selectedThreadId,
        selectedSessionId: uiState.selectedSessionId,
        createSession: mutations.createSessionMutation.mutateAsync,
        onClearError: () => {
            clearComposerRunSubmitError();
        },
        onError: (message) => {
            setComposerRunSubmitError(message);
        },
        onSelectSessionId: uiState.setSelectedSessionId,
        onSelectRunId: uiState.setSelectedRunId,
        onSessionCreated: ({ sessionId, session, thread }) => {
            utils.session.listRuns.setData(
                {
                    profileId,
                    sessionId,
                },
                {
                    runs: [],
                }
            );
            applySessionWorkspaceUpdate({
                session,
                ...(thread ? { thread } : {}),
            });
        },
    });

    const selectionState = useConversationShellSelectionState({
        threads: queries.listThreadsQuery.data?.threads ?? [],
        threadTags: queries.shellBootstrapQuery.data?.threadTags ?? [],
        selectedTagIds: uiState.selectedTagIds,
        selectedThreadId: uiState.selectedThreadId,
        allSessions: queries.sessionsQuery.data?.sessions ?? [],
        allRuns: queries.runsQuery.data?.runs ?? [],
        allMessages: queries.messagesQuery.data?.messages ?? [],
        allMessageParts: queries.messagesQuery.data?.messageParts ?? [],
        selectedSessionId: isEntityId(uiState.selectedSessionId, 'sess') ? uiState.selectedSessionId : undefined,
        selectedRunId: isEntityId(uiState.selectedRunId, 'run') ? uiState.selectedRunId : undefined,
    });

    const workspaceScope = deriveConversationWorkspaceExecutionScope({
        selectedThread: selectionState.selectedThread,
        selectedSession: selectionState.selectedSession,
        workspaceRoots: queries.shellBootstrapQuery.data?.workspaceRoots ?? [],
        sandboxes: queries.shellBootstrapQuery.data?.sandboxes ?? [],
    });

    const orchestratorStrategyRootThreadId = resolveOrchestratorStrategyRootThreadId({
        topLevelTab: input.topLevelTab,
        selectedThread: selectionState.selectedThread,
    });
    const executionStrategy = resolveOrchestratorExecutionStrategyDraft({
        topLevelTab: input.topLevelTab,
        selectedThread: selectionState.selectedThread,
        draftsByRootThreadId: executionStrategyDraftsByRootThreadId,
    });
    const handleExecutionStrategyChange = (nextExecutionStrategy: OrchestratorExecutionStrategy): void => {
        setExecutionStrategyDraftsByRootThreadId((currentDrafts) =>
            updateOrchestratorExecutionStrategyDraft({
                draftsByRootThreadId: currentDrafts,
                rootThreadId: orchestratorStrategyRootThreadId,
                executionStrategy: nextExecutionStrategy,
            })
        );
    };

    const runTargetState = useConversationComposerTargetState({
        shellBootstrapData: queries.shellBootstrapQuery.data,
        selectedWorkspaceFingerprint,
        ...(selectionState.selectedThread?.workspaceFingerprint
            ? { selectedThreadWorkspaceFingerprint: selectionState.selectedThread.workspaceFingerprint }
            : {}),
        mainViewDraftTarget,
        sessionOverride: sessionActions.sessionOverride,
        runs: selectionState.sessionRunSelection.runs,
        topLevelTab: input.topLevelTab,
        modeKey,
        requiresNativeTools: activeModeRequiresNativeTools,
        imageAttachmentsAllowed,
    });

    const shellViewModel = useConversationShellViewModel({
        profileId,
        topLevelTab: input.topLevelTab,
        modeKey,
        queries,
        selectionState,
        runTargetState,
        workspaceScope,
    });

    const { selectedSessionId, selectedRunId, hasSelectedSession } = resolveConversationSelectionIds({
        resolvedSessionId: selectionState.sessionRunSelection.selection.resolvedSessionId,
        resolvedRunId: selectionState.sessionRunSelection.selection.resolvedRunId,
    });

    const reasoningState = buildConversationReasoningState({
        modelsByProvider: runTargetState.modelsByProvider,
        selectedComposerProviderId: runTargetState.selectedProviderIdForComposer,
        selectedComposerModelId: runTargetState.selectedModelIdForComposer,
        requestedReasoningEffort,
    });

    const cacheHandlers = useConversationShellCacheHandlers({
        utils,
        profileId,
        listThreadsInput: queries.listThreadsInput,
        selectedSessionId,
        topLevelTab: input.topLevelTab,
    });
    applySessionWorkspaceUpdate = cacheHandlers.applySessionWorkspaceUpdate;

    const contextState = useConversationShellContextState({
        profileId,
        selectedSessionId,
        selectedRunId,
        providerId: runTargetState.selectedProviderIdForComposer,
        modelId: runTargetState.selectedModelIdForComposer,
        topLevelTab: input.topLevelTab,
        modeKey,
        workspaceFingerprint: selectionState.selectedThread?.workspaceFingerprint,
    });

    const composerSetup = useConversationShellComposerSetup({
        profileId,
        selectedSessionId,
        topLevelTab: input.topLevelTab,
        modeKey,
        workspaceFingerprint: selectionState.selectedThread?.workspaceFingerprint,
        sandboxId: workspaceScope.kind === 'sandbox' ? workspaceScope.sandboxId : undefined,
        isPlanningComposerMode,
        imageAttachmentsAllowed,
        activeModeRequiresNativeTools,
        queries,
        mutations,
        uiState,
        runTargetState,
        reasoningState,
        applyPlanWorkspaceUpdate: cacheHandlers.applyPlanWorkspaceUpdate,
        applySessionWorkspaceUpdate: cacheHandlers.applySessionWorkspaceUpdate,
        cacheResolvedContextState: cacheHandlers.cacheResolvedContextState,
    });

    clearComposerRunSubmitError = composerSetup.composer.clearRunSubmitError;
    setComposerRunSubmitError = composerSetup.composer.setRunSubmitError;

    useConversationShellSync({
        profileId,
        modeKey,
        topLevelTab: input.topLevelTab,
        selectedSessionId,
        selectedRunId,
        hasSelectedSession,
        streamState,
        contextStateQueryEnabled: contextState.contextStateQueryEnabled,
        contextStateQueryInput: contextState.contextStateQueryInput,
        uiState,
        queries,
        selectionState,
        runTargetState,
        utils,
        onSelectedWorkspaceFingerprintChange,
        onBootChromeReadyChange,
    });

    return {
        profileId,
        profiles: input.profiles,
        selectedProfileId: input.selectedProfileId,
        topLevelTab: input.topLevelTab,
        modeKey,
        modes: input.modes,
        isPlanningComposerMode,
        isOrchestrationWorkflowMode,
        selectedWorkspaceFingerprint,
        isSidebarCollapsed: input.isSidebarCollapsed,
        onToggleSidebarCollapsed: input.onToggleSidebarCollapsed,
        onModeChange: input.onModeChange,
        onTopLevelTabChange,
        onSelectedWorkspaceFingerprintChange,
        onProfileChange,
        tabSwitchNotice,
        setTabSwitchNotice,
        focusComposerRequestKey,
        setFocusComposerRequestKey,
        setRequestedReasoningEffort,
        setMainViewDraftTarget,
        queries,
        mutations,
        uiState,
        utils,
        shellViewModel,
        selectionState,
        runTargetState,
        selectedSessionId,
        selectedRunId,
        hasSelectedSession,
        streamState,
        streamErrorMessage: streamErrorMessage ?? undefined,
        contextStateQueryInput: contextState.contextStateQueryInput,
        contextStateQuery: contextState.contextStateQuery,
        runtimeOptions: reasoningState.runtimeOptions,
        composerMediaSettings: composerSetup.composerMediaSettings,
        composer: composerSetup.composer,
        sessionActions,
        setEditPreference,
        applySessionWorkspaceUpdate: cacheHandlers.applySessionWorkspaceUpdate,
        applyPlanWorkspaceUpdate: cacheHandlers.applyPlanWorkspaceUpdate,
        selectedComposerProviderId: runTargetState.selectedProviderIdForComposer,
        selectedComposerModelId: runTargetState.selectedModelIdForComposer,
        selectedModelSupportsReasoning: reasoningState.selectedModelSupportsReasoning,
        supportedReasoningEfforts: reasoningState.supportedReasoningEfforts,
        effectiveReasoningEffort: reasoningState.effectiveReasoningEffort,
        composerModelOptions: composerSetup.composerModelOptions,
        canAttachImages: composerSetup.canAttachImages,
        imageAttachmentBlockedReason: composerSetup.imageAttachmentBlockedReason,
        selectedModelCompatibilityState: composerSetup.selectedModelCompatibilityState,
        selectedModelCompatibilityReason: composerSetup.selectedModelCompatibilityReason,
        executionStrategy,
        handleExecutionStrategyChange,
    };
}
